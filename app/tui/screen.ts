import { stdout } from "node:process";
import { Mascot } from "./mascot.ts";
import { TuiLineInput } from "./input.ts";
import {
  filterSlashCommands,
  formatCommandLabel,
} from "./commands.ts";
import { renderDashboard, type DashboardMeta } from "./dashboard.ts";
import {
  CHAT_GUTTER,
  indentChatLine,
  shellContentWidth,
  wrapShellFrame,
} from "./frame.ts";
import {
  CSI,
  clampTerminalWidth,
  drawRule,
  READY_HINT,
  style,
  theme,
  truncateVisible,
  visibleLength,
  wrapTextWithHangIndent,
  formatInlineMarkdown,
} from "./ansi.ts";
import type { MascotMode, TranscriptEntry } from "./types.ts";

export type { TranscriptEntry } from "./types.ts";

const MAX_TRANSCRIPT_ENTRIES = 80;
const ANIMATION_MS = 200;
const STATUS_DOT_FRAMES = 3;
const RENDER_DEBOUNCE_MS = 32;
const MIN_THINK_MS = 900;
const REVEAL_WORD_MS = 28;

type ScreenLayout = {
  shellTop: string;
  shellBottom: string;
  shellBottomRow: number;
  dashboardLines: string[];
  connectorLines: string[];
  conversationLines: string[];
  ephemeralLines: string[];
  inputLines: string[];
  dashboardStartRow: number;
  connectorStartRow: number;
  conversationStartRow: number;
  ephemeralStartRow: number;
  inputStartRow: number;
  dashboardEndRow: number;
  pinnedToBottom: boolean;
};

export class TuiScreen {
  readonly mascot = new Mascot();
  private readonly input: TuiLineInput;
  private transcript: TranscriptEntry[] = [];
  private statusLine = "";
  private statusBase = "";
  private statusDots = 1;
  private statusAnimate = false;
  private dashboardMeta: DashboardMeta = {
    username: "coder",
    modelLabel: "Model",
    providerLabel: "Provider",
    cwd: process.cwd(),
    version: "0.1.0",
    toolSummary: "",
  };
  private active = false;
  private inputMode = false;
  private animationTimer: ReturnType<typeof setInterval> | null = null;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private batchDepth = 0;
  private renderQueued = false;
  private streamingAssistantIndex: number | null = null;
  private thinkingUntil = 0;
  private conversationRenderedLines = 0;
  private inputRenderedLines = 0;
  private conversationRenderTimer: ReturnType<typeof setTimeout> | null = null;
  private lastConversationSnapshot: string[] = [];
  private lastConversationStartRow = 0;
  private lastInputStartRow = 0;
  private lastLayoutPinned = false;
  private cols = stdout.columns || 80;
  private rows = stdout.rows || 24;
  private onInterrupt: (() => void) | null = null;
  private inputPrompt = "> ";
  private ephemeralPanelText: string | null = null;
  private interruptSignal: AbortSignal | null = null;

  private readonly handleResize = (): void => {
    this.cols = stdout.columns || 80;
    this.rows = stdout.rows || 24;
    if (this.active) {
      this.render();
    }
  };

  constructor() {
    this.input = new TuiLineInput(() => {
      if (!this.active) {
        return;
      }

      if (this.inputMode) {
        this.renderInputOnly();
        return;
      }

      this.requestRender();
    });

    this.input.setOnInterrupt(() => {
      this.onInterrupt?.();
    });
  }

  setOnInterrupt(handler: () => void): void {
    this.onInterrupt = handler;
  }

  setEphemeralPanel(text: string | null): void {
    this.ephemeralPanelText = text;
    if (!this.active) {
      return;
    }

    this.renderConversationAndInputRegions(this.layoutFrame(this.layoutWidth()), {
      forceClearMiddle: true,
    });
  }

  setInterruptSignal(signal: AbortSignal | null): void {
    this.interruptSignal = signal;
  }

  cancelActiveAgentUi(): void {
    if (this.conversationRenderTimer) {
      clearTimeout(this.conversationRenderTimer);
      this.conversationRenderTimer = null;
    }

    this.setEphemeralPanel(null);
    this.clearEmptyAssistant();
    this.clearAnimatedStatus();
    this.setMascotMode("idle");
    this.setStatus("");

    if (this.active && !this.inputMode) {
      this.renderConversationAndInputRegions(this.layoutFrame(this.layoutWidth()), {
        forceClearMiddle: true,
      });
    }
  }

  batch(update: () => void): void {
    this.batchDepth++;
    try {
      update();
    } finally {
      this.batchDepth--;

      if (this.batchDepth === 0 && this.renderQueued) {
        this.renderQueued = false;
        this.requestRender();
      }
    }
  }

  beginAssistantStream(): void {
    this.transcript.push({
      role: "assistant",
      text: "",
      streaming: true,
    });
    this.streamingAssistantIndex = this.transcript.length - 1;
    this.renderConversationRegion();
  }

  setAgentActivity(status: string, mode: MascotMode): void {
    this.thinkingUntil = Date.now() + MIN_THINK_MS;
    this.setMascotMode(mode);
    this.setAnimatedStatus(stripStatusEllipsis(status));
    this.renderDashboardRegion();
    this.renderConversationAndInputRegions(this.layoutFrame(this.layoutWidth()));
  }

  setAgentThinking(): void {
    this.setAgentActivity("Thinking", "thinking");
  }

  private setAnimatedStatus(base: string): void {
    this.statusBase = base;
    this.statusDots = 1;
    this.statusAnimate = true;
    this.statusLine = "";
  }

  private clearAnimatedStatus(): void {
    this.statusAnimate = false;
    this.statusBase = "";
    this.statusDots = 1;
  }

  private getDisplayStatus(): string {
    if (this.statusAnimate && this.statusBase) {
      return formatStatusDots(this.statusBase, this.statusDots);
    }

    return this.statusLine;
  }

  clearEmptyAssistant(): void {
    if (this.streamingAssistantIndex === null) {
      return;
    }

    const entry = this.transcript[this.streamingAssistantIndex]!;

    if (!entry.text) {
      this.transcript.splice(this.streamingAssistantIndex, 1);
    } else {
      entry.streaming = false;
    }

    this.streamingAssistantIndex = null;
    this.renderConversationRegion();
  }

  async revealMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    try {
      await this.waitForThinking();
      this.throwIfCancelled();
      this.setMascotMode("thinking");
      this.setAnimatedStatus("Writing response");
      this.beginAssistantStream();
      this.renderConversationAndInputRegions(this.layoutFrame(this.layoutWidth()));

      const parts = trimmed.match(/\S+\s*|\s+/g) ?? [trimmed];
      let shown = "";

      for (const part of parts) {
        this.throwIfCancelled();
        shown += part;
        this.setStreamingEntryText(shown);
        await sleepCancellable(
          REVEAL_WORD_MS + Math.floor(Math.random() * 10),
          this.interruptSignal,
        );
      }

      this.flushConversationRender();
      this.finalizeAssistantStream();
    } finally {
      this.startAnimation();
    }
  }

  private throwIfCancelled(): void {
    if (this.interruptSignal?.aborted) {
      throw new Error("cancelled");
    }
  }

  private async waitForThinking(): Promise<void> {
    const wait = this.thinkingUntil - Date.now();
    if (wait > 0) {
      await sleepCancellable(wait, this.interruptSignal);
    }
  }

  private finalizeAssistantStream(): void {
    if (this.streamingAssistantIndex !== null) {
      this.transcript[this.streamingAssistantIndex]!.streaming = false;
      this.streamingAssistantIndex = null;
    }

    this.renderConversationRegion();
  }

  private setStreamingEntryText(text: string): void {
    if (this.streamingAssistantIndex === null) {
      this.beginAssistantStream();
    }

    this.transcript[this.streamingAssistantIndex!]!.text = text;
    this.queueConversationRender();
  }

  setDashboardMeta(meta: DashboardMeta): void {
    this.dashboardMeta = meta;
    if (this.active) {
      this.flushRender();
    }
  }

  start(): void {
    this.active = true;
    this.enterAltScreen();
    this.input.attach();
    stdout.on("resize", this.handleResize);
    this.render();
    this.startAnimation();
  }

  private queueRender(): void {
    if (this.batchDepth > 0) {
      this.renderQueued = true;
      return;
    }

    this.requestRender();
  }

  private requestRender(): void {
    if (this.inputMode) {
      this.renderInputOnly();
      return;
    }

    if (this.renderTimer) {
      return;
    }

    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.render();
    }, RENDER_DEBOUNCE_MS);
  }

  private flushRender(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }

    this.render();
  }

  stop(): void {
    this.active = false;
    this.stopAnimation();
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    if (this.conversationRenderTimer) {
      clearTimeout(this.conversationRenderTimer);
      this.conversationRenderTimer = null;
    }
    stdout.off("resize", this.handleResize);
    this.input.detach();
    this.leaveAltScreen();
  }

  readUserLine(options?: { prompt?: string }): Promise<string | null> {
    this.inputPrompt = options?.prompt ?? "> ";
    this.inputMode = true;
    this.render();

    return this.input.readLine().finally(() => {
      this.inputPrompt = "> ";
      this.inputMode = false;
      this.startAnimation();
    });
  }

  setStatus(text: string): void {
    if (!text) {
      this.clearAnimatedStatus();
    } else {
      this.clearAnimatedStatus();
      this.statusLine = text;
    }

    if (this.active && !this.inputMode) {
      this.renderConversationAndInputRegions(this.layoutFrame(this.layoutWidth()));
      return;
    }

    if (this.active) {
      this.queueRender();
    }
  }

  setMascotMode(mode: MascotMode): void {
    this.mascot.setMode(mode);
    this.startAnimation();
  }

  clearTranscript(): void {
    this.transcript = [];
    this.streamingAssistantIndex = null;
    this.thinkingUntil = 0;
    if (this.active) {
      this.flushRender();
    }
  }

  appendTranscript(entry: TranscriptEntry): void {
    this.transcript.push(entry);

    if (this.transcript.length > MAX_TRANSCRIPT_ENTRIES) {
      this.transcript = this.transcript.slice(-MAX_TRANSCRIPT_ENTRIES);
    }

    if (this.active) {
      this.queueRender();
    }
  }

  private startAnimation(): void {
    if (this.animationTimer || !this.active) {
      return;
    }

    this.animationTimer = setInterval(() => {
      if (!this.active) {
        return;
      }

      const width = this.layoutWidth();
      const splitAt = Math.max(24, Math.floor((width - 2) * 0.44));
      this.mascot.tick(splitAt);
      this.renderDashboardRegion();

      if (this.statusAnimate && this.statusBase && !this.inputMode) {
        this.statusDots = (this.statusDots % STATUS_DOT_FRAMES) + 1;
        this.renderStatusRegion();
      }
    }, ANIMATION_MS);
  }

  private stopAnimation(): void {
    if (!this.animationTimer) {
      return;
    }

    clearInterval(this.animationTimer);
    this.animationTimer = null;
  }

  private enterAltScreen(): void {
    stdout.write(CSI.enterAltScreen + CSI.hideCursor);
  }

  private leaveAltScreen(): void {
    stdout.write(CSI.showCursor + CSI.leaveAltScreen);
  }

  private layoutWidth(): number {
    return clampTerminalWidth(this.cols);
  }

  private layoutFrame(width: number): ScreenLayout {
    const contentWidth = shellContentWidth(width);
    const chatWidth = Math.max(20, contentWidth - CHAT_GUTTER * 2);

    const dashboardRaw = renderDashboard(contentWidth, this.dashboardMeta, this.mascot);
    const conversationRaw = this.renderConversation(chatWidth);
    const ephemeralRaw = this.buildEphemeralLines(chatWidth);
    const inputRaw = this.buildInputLines(chatWidth);

    const chatLines = [
      ...conversationRaw.map(indentChatLine),
      ...ephemeralRaw.map(indentChatLine),
    ];
    const inputBlock = inputRaw.map(indentChatLine);

    const fixedTop = dashboardRaw;
    const fixedBottom = inputBlock;

    const maxBody = Math.max(1, this.rows - 2);
    const maxScroll = Math.max(0, maxBody - fixedTop.length - fixedBottom.length);
    const pinnedToBottom = chatLines.length > maxScroll;
    const visibleChat = chatLines.slice(-maxScroll);

    const totalConv = conversationRaw.length;
    const totalEphem = ephemeralRaw.length;
    const visibleCount = visibleChat.length;
    const chatTotal = totalConv + totalEphem;
    const visibleStart = Math.max(0, chatTotal - visibleCount);

    let convLinesInView = 0;
    let ephemLinesInView = 0;
    if (visibleStart < totalConv) {
      convLinesInView = totalConv - visibleStart;
      ephemLinesInView = Math.min(totalEphem, visibleCount - convLinesInView);
    } else {
      ephemLinesInView = visibleCount;
    }

    const bodyLines = [...fixedTop, ...visibleChat, ...fixedBottom];

    const frame = wrapShellFrame(width, bodyLines);
    const dashboardCount = dashboardRaw.length;
    const convBodyStart = dashboardCount;

    const dashboardLines = frame.rows.slice(0, dashboardCount);
    const connectorLines: string[] = [];
    const conversationLines = frame.rows.slice(
      convBodyStart,
      convBodyStart + convLinesInView,
    );
    const ephemeralLines = frame.rows.slice(
      convBodyStart + convLinesInView,
      convBodyStart + convLinesInView + ephemLinesInView,
    );
    const inputLines = frame.rows.slice(
      convBodyStart + convLinesInView + ephemLinesInView,
    );

    const dashboardStartRow = 2;
    const dashboardEndRow = dashboardStartRow + dashboardCount - 1;
    const connectorStartRow = dashboardEndRow + 1;
    const conversationStartRow = connectorStartRow;
    const ephemeralStartRow = conversationStartRow + convLinesInView;
    const inputStartRow = ephemeralStartRow + ephemLinesInView;
    const shellBottomRow = 2 + frame.rows.length;

    return {
      shellTop: frame.top,
      shellBottom: frame.bottom,
      shellBottomRow,
      dashboardLines,
      connectorLines,
      conversationLines,
      ephemeralLines,
      inputLines,
      dashboardStartRow,
      connectorStartRow,
      conversationStartRow,
      ephemeralStartRow,
      inputStartRow,
      dashboardEndRow,
      pinnedToBottom,
    };
  }

  private buildEphemeralLines(width: number): string[] {
    if (!this.ephemeralPanelText) {
      return [];
    }

    const roleLabel = "System";
    const prefix = transcriptRolePrefix("system", roleLabel);
    const { hangIndent, firstLineWidth, continuationWidth } =
      transcriptWrapLayout(roleLabel, width);
    const wrapped = wrapTextWithHangIndent(
      this.ephemeralPanelText,
      width,
      firstLineWidth,
      continuationWidth,
    );
    const lines: string[] = [];
    let labeled = false;

    for (const line of wrapped) {
      if (line.length === 0) {
        continue;
      }

      const formatted = formatInlineMarkdown(line);

      if (!labeled) {
        lines.push(`${prefix}${formatted}`);
        labeled = true;
        continue;
      }

      lines.push(`${hangIndent}${formatted}`);
    }

    return lines;
  }

  private buildInputLines(width: number): string[] {
    const lines: string[] = [];
    const status = this.getDisplayStatus();

    lines.push(drawRule(width));
    lines.push(this.renderPromptLine(width));
    lines.push(drawRule(width));

    if (status) {
      lines.push(`${theme.hint}${truncateVisible(status, width)}${style.reset}`);
    } else {
      lines.push(`${theme.hint}${READY_HINT}${style.reset}`);
    }

    const slashMenu = this.renderSlashMenu(width);
    if (slashMenu.length > 0) {
      lines.push(...slashMenu);
    }

    return lines;
  }

  render(): void {
    if (!this.active) {
      return;
    }

    const layout = this.layoutFrame(this.layoutWidth());

    stdout.write(CSI.cursorHome + CSI.clearScreen);
    stdout.write(CSI.moveTo(1) + CSI.clearLine + layout.shellTop);

    for (const [index, line] of layout.dashboardLines.entries()) {
      stdout.write(
        CSI.moveTo(layout.dashboardStartRow + index) + CSI.clearLine + line,
      );
    }

    this.renderConnectorLines(layout);
    this.renderConversationAndInputRegions(layout, { forceClearMiddle: true });
    stdout.write(
      CSI.moveTo(layout.shellBottomRow) + CSI.clearLine + layout.shellBottom,
    );
  }

  private renderInputOnly(): void {
    if (!this.active || !this.inputMode) {
      return;
    }

    const layout = this.layoutFrame(this.layoutWidth());
    const inputHeightChanged =
      layout.inputLines.length !== this.inputRenderedLines;
    const inputMoved = layout.inputStartRow !== this.lastInputStartRow;

    if (inputHeightChanged || inputMoved) {
      this.renderConversationAndInputRegions(layout, {
        forceClearMiddle: inputMoved,
      });
      return;
    }

    for (const [index, line] of layout.inputLines.entries()) {
      stdout.write(CSI.moveTo(layout.inputStartRow + index) + CSI.clearLine + line);
    }

    stdout.write(CSI.hideCursor);
  }

  private renderConnectorLines(layout: ScreenLayout): void {
    for (const [index, line] of layout.connectorLines.entries()) {
      stdout.write(
        CSI.moveTo(layout.connectorStartRow + index) + CSI.clearLine + line,
      );
    }
  }

  private renderConversationAndInputRegions(
    layout: ScreenLayout,
    options?: { forceClearMiddle?: boolean; redrawInput?: boolean },
  ): void {
    const forceClearMiddle =
      options?.forceClearMiddle === true ||
      layout.conversationStartRow !== this.lastConversationStartRow ||
      layout.inputStartRow !== this.lastInputStartRow ||
      layout.pinnedToBottom !== this.lastLayoutPinned;

    if (forceClearMiddle) {
      for (
        let row = layout.dashboardEndRow + 1;
        row < layout.inputStartRow;
        row++
      ) {
        stdout.write(CSI.moveTo(row) + CSI.clearLine);
      }

      this.renderConnectorLines(layout);
    }

    let firstChange = 0;
    if (!forceClearMiddle) {
      while (
        firstChange < layout.conversationLines.length &&
        firstChange < this.lastConversationSnapshot.length &&
        this.lastConversationSnapshot[firstChange] ===
          layout.conversationLines[firstChange]
      ) {
        firstChange++;
      }
    }

    for (
      let index = firstChange;
      index < layout.conversationLines.length;
      index++
    ) {
      stdout.write(
        CSI.moveTo(layout.conversationStartRow + index) +
          CSI.clearLine +
          layout.conversationLines[index]!,
      );
    }

    for (const [index, line] of layout.ephemeralLines.entries()) {
      stdout.write(
        CSI.moveTo(layout.ephemeralStartRow + index) + CSI.clearLine + line,
      );
    }

    for (
      let index = layout.conversationLines.length;
      index < this.lastConversationSnapshot.length;
      index++
    ) {
      stdout.write(
        CSI.moveTo(layout.conversationStartRow + index) + CSI.clearLine,
      );
    }

    const redrawInput = options?.redrawInput !== false;
    const inputChanged =
      redrawInput &&
      (forceClearMiddle ||
        layout.inputLines.length !== this.inputRenderedLines ||
        layout.inputStartRow !== this.lastInputStartRow);

    if (inputChanged) {
      for (const [index, line] of layout.inputLines.entries()) {
        stdout.write(CSI.moveTo(layout.inputStartRow + index) + CSI.clearLine + line);
      }

      for (
        let row = layout.inputStartRow + layout.inputLines.length;
        row < layout.shellBottomRow;
        row++
      ) {
        stdout.write(CSI.moveTo(row) + CSI.clearLine);
      }

      stdout.write(
        CSI.moveTo(layout.shellBottomRow) + CSI.clearLine + layout.shellBottom,
      );

      this.inputRenderedLines = layout.inputLines.length;
    }

    stdout.write(CSI.hideCursor);
    this.lastConversationSnapshot = [...layout.conversationLines];
    this.lastConversationStartRow = layout.conversationStartRow;
    this.lastInputStartRow = layout.inputStartRow;
    this.lastLayoutPinned = layout.pinnedToBottom;
    this.conversationRenderedLines = layout.conversationLines.length;
  }

  private renderDashboardRegion(): void {
    if (!this.active) {
      return;
    }

    const layout = this.layoutFrame(this.layoutWidth());

    for (const [index, line] of layout.dashboardLines.entries()) {
      stdout.write(
        CSI.moveTo(layout.dashboardStartRow + index) + CSI.clearLine + line,
      );
    }
  }

  private renderStatusRegion(): void {
    if (!this.active || this.inputMode) {
      return;
    }

    const layout = this.layoutFrame(this.layoutWidth());
    const status = this.getDisplayStatus();

    if (!status) {
      this.renderConversationAndInputRegions(layout);
      return;
    }

    const statusLine = layout.inputLines[3]!;
    stdout.write(CSI.moveTo(layout.inputStartRow + 3) + CSI.clearLine + statusLine);
    stdout.write(CSI.hideCursor);
  }

  private renderConversation(width: number): string[] {
    if (this.transcript.length === 0) {
      return [];
    }

    const lines: string[] = [];
    const recent = this.transcript.slice(-8);

    for (const [entryIndex, entry] of recent.entries()) {
      const roleLabel = transcriptRoleLabel(entry.role);
      const prefix = transcriptRolePrefix(entry.role, roleLabel);
      const { hangIndent, firstLineWidth, continuationWidth } =
        transcriptWrapLayout(roleLabel, width);

      const wrapped = wrapTextWithHangIndent(
        entry.text,
        width,
        firstLineWidth,
        continuationWidth,
      );
      const lastContentIndex = wrapped.findLastIndex((line) => line.length > 0);

      if (lastContentIndex < 0 && entry.streaming) {
        lines.push(`${prefix}${theme.cursor} ${style.reset}`);
        if (entryIndex < recent.length - 1) {
          lines.push("");
        }
        continue;
      }

      let labeled = false;

      for (const [index, line] of wrapped.entries()) {
        if (line.length === 0) {
          continue;
        }

        const suffix =
          entry.streaming && index === lastContentIndex
            ? `${theme.cursor} ${style.reset}`
            : "";
        const formattedLine = formatTranscriptBody(entry, line);

        if (!labeled) {
          lines.push(`${prefix}${formattedLine}${suffix}`);
          labeled = true;
          continue;
        }

        lines.push(`${hangIndent}${formattedLine}${suffix}`);
      }

      if (entryIndex < recent.length - 1) {
        lines.push("");
      }
    }

    return lines;
  }

  private queueConversationRender(): void {
    if (!this.active || this.inputMode) {
      return;
    }

    if (this.conversationRenderTimer) {
      return;
    }

    this.conversationRenderTimer = setTimeout(() => {
      this.conversationRenderTimer = null;
      this.renderConversationRegion();
    }, RENDER_DEBOUNCE_MS);
  }

  private flushConversationRender(): void {
    if (this.conversationRenderTimer) {
      clearTimeout(this.conversationRenderTimer);
      this.conversationRenderTimer = null;
    }

    this.renderConversationRegion();
  }

  private renderConversationRegion(): void {
    if (!this.active || this.inputMode) {
      return;
    }

    this.renderConversationAndInputRegions(this.layoutFrame(this.layoutWidth()), {
      redrawInput: false,
    });
  }

  private renderPromptLine(width?: number): string {
    const chatWidth =
      width ?? Math.max(20, shellContentWidth(this.cols) - CHAT_GUTTER * 2);
    const promptWidth = visibleLength(this.inputPrompt);
    const maxValueWidth = Math.max(0, chatWidth - promptWidth - 2);
    const value = truncateVisible(this.input.getValue(), maxValueWidth);
    const cursor = `${theme.cursor} ${style.reset}`;
    return `${theme.text}${this.inputPrompt}${value}${cursor}`;
  }

  private renderSlashMenu(width: number): string[] {
    const value = this.input.getValue();

    if (!value.startsWith("/")) {
      return [];
    }

    const matches = filterSlashCommands(value);

    if (matches.length === 0) {
      return [`${style.dimFg}  No matching commands${style.reset}`];
    }

    return matches.slice(0, 8).map((command) => {
      const label = formatCommandLabel(command);
      const name = `${style.highlight}${label}${style.reset}`;
      const gap = Math.max(
        2,
        width - visibleLength(label) - command.description.length - 2,
      );
      return `  ${name}${" ".repeat(gap)}${style.dimFg}${command.description}${style.reset}`;
    });
  }
}

function sleepCancellable(ms: number, signal: AbortSignal | null): Promise<void> {
  if (signal?.aborted) {
    throw new Error("cancelled");
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error("cancelled"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function stripStatusEllipsis(text: string): string {
  return text.replace(/…+$/u, "").replace(/[.\s]+$/u, "").trim();
}

function transcriptRoleLabel(role: TranscriptEntry["role"]): string {
  if (role === "you") {
    return "You";
  }

  if (role === "assistant") {
    return "Assistant";
  }

  return "System";
}

function transcriptRolePrefix(
  role: TranscriptEntry["role"],
  roleLabel: string,
): string {
  const roleStyled =
    role === "system"
      ? `${theme.systemLabel}${roleLabel}${style.reset}`
      : `${style.bold}${theme.accent}${roleLabel}${style.reset}`;
  return `${roleStyled}${theme.muted}: ${style.reset}`;
}

function transcriptWrapLayout(
  roleLabel: string,
  width: number,
): {
  hangIndent: string;
  firstLineWidth: number;
  continuationWidth: number;
} {
  const hangIndent = " ".repeat(roleLabel.length + 2);
  const lineWidth = Math.max(1, width - hangIndent.length);
  return {
    hangIndent,
    firstLineWidth: lineWidth,
    continuationWidth: lineWidth,
  };
}

function formatTranscriptBody(
  entry: TranscriptEntry,
  line: string,
): string {
  if (entry.role === "you") {
    return `${theme.text}${line}${style.reset}`;
  }

  if (entry.role === "assistant") {
    return `${theme.assistant}${formatInlineMarkdown(line)}${style.reset}`;
  }

  if (entry.peach || line.startsWith("▸")) {
    return `${theme.systemAction}${line}${style.reset}`;
  }

  if (line.startsWith("Review changes")) {
    return `${theme.muted}${line}${style.reset}`;
  }

  return `${theme.muted}${formatInlineMarkdown(line)}${style.reset}`;
}

function formatStatusDots(base: string, dotCount: number): string {
  if (dotCount <= 0) {
    return base;
  }

  return `${base}${".".repeat(dotCount)}`;
}
