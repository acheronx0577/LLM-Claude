import { stdout } from "node:process";
import { Mascot } from "./mascot.ts";
import { TuiLineInput } from "./input.ts";
import {
  filterSlashCommands,
  formatCommandLabel,
} from "./commands.ts";
import { renderDashboard, type DashboardMeta } from "./dashboard.ts";
import {
  CSI,
  clampTerminalWidth,
  drawRule,
  padEndVisible,
  style,
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
  dashboardLines: string[];
  conversationLines: string[];
  ephemeralLines: string[];
  inputLines: string[];
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
    const dashboardLines = [
      ...renderDashboard(width, this.dashboardMeta, this.mascot).map((line) =>
        this.paintLine(line),
      ),
      this.paintLine(""),
    ];
    const inputLines = this.buildInputRegionLines(width);
    const ephemeralLines = this.buildEphemeralPanelLines(width);
    const rawConversation = this.renderConversation(width).map((line) =>
      this.paintLine(line),
    );
    const dashboardEndRow = dashboardLines.length;
    const totalContentLines =
      dashboardLines.length +
      rawConversation.length +
      ephemeralLines.length +
      inputLines.length;
    const pinnedToBottom = totalContentLines > this.rows;

    if (pinnedToBottom) {
      const inputStartRow = this.rows - inputLines.length + 1;
      const ephemeralStartRow = inputStartRow - ephemeralLines.length;
      const conversationZoneRows = Math.max(
        0,
        ephemeralStartRow - dashboardEndRow - 1,
      );
      const conversationLines = rawConversation.slice(-conversationZoneRows);
      const conversationStartRow = ephemeralStartRow - conversationLines.length;

      return {
        dashboardLines,
        conversationLines,
        ephemeralLines,
        inputLines,
        conversationStartRow,
        ephemeralStartRow,
        inputStartRow,
        dashboardEndRow,
        pinnedToBottom,
      };
    }

    const conversationStartRow = dashboardEndRow + 1;
    const ephemeralStartRow = conversationStartRow + rawConversation.length;
    const inputStartRow = ephemeralStartRow + ephemeralLines.length;

    return {
      dashboardLines,
      conversationLines: rawConversation,
      ephemeralLines,
      inputLines,
      conversationStartRow,
      ephemeralStartRow,
      inputStartRow,
      dashboardEndRow,
      pinnedToBottom,
    };
  }

  private buildEphemeralPanelLines(width: number): string[] {
    if (!this.ephemeralPanelText) {
      return [];
    }

    const roleLabel = "System";
    const labelSuffix = ": ";
    const hangIndent = " ".repeat(roleLabel.length + labelSuffix.length);
    const firstLineWidth = Math.max(1, width - hangIndent.length);
    const continuationWidth = Math.max(1, width - hangIndent.length);
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
        lines.push(
          this.paintLine(
            `${style.muted}${roleLabel}${style.reset}${labelSuffix}${formatted}`,
          ),
        );
        labeled = true;
        continue;
      }

      lines.push(this.paintLine(`${hangIndent}${formatted}`));
    }

    return lines;
  }

  private paintLine(content: string): string {
    return padEndVisible(`${content}${style.reset}`, this.cols);
  }

  private buildInputRegionLines(width: number): string[] {
    const lines: string[] = [];
    const status = this.getDisplayStatus();

    if (status) {
      lines.push(
        this.paintLine(
          `${style.highlight}${truncateVisible(status, width)}${style.reset}`,
        ),
      );
    }

    lines.push(
      this.paintLine(drawRule(width)),
      this.paintLine(this.renderPromptLine()),
      this.paintLine(drawRule(width)),
    );

    const slashMenu = this.renderSlashMenu(width);
    if (slashMenu.length > 0) {
      lines.push(...slashMenu.map((line) => this.paintLine(line)));
    }

    return lines;
  }

  render(): void {
    if (!this.active) {
      return;
    }

    const layout = this.layoutFrame(this.layoutWidth());

    stdout.write(CSI.cursorHome + CSI.clearScreen);

    for (const [index, line] of layout.dashboardLines.entries()) {
      stdout.write(CSI.moveTo(index + 1) + CSI.clearLine + line);
    }

    this.renderConversationAndInputRegions(layout, { forceClearMiddle: true });
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
        row <= this.rows;
        row++
      ) {
        stdout.write(CSI.moveTo(row) + CSI.clearLine);
      }

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

    const width = this.layoutWidth();
    const dashboardLines = renderDashboard(
      width,
      this.dashboardMeta,
      this.mascot,
    ).map((line) => this.paintLine(line));

    for (const [index, line] of dashboardLines.entries()) {
      stdout.write(CSI.moveTo(index + 1) + CSI.clearLine + line);
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

    const statusLine = layout.inputLines[0]!;
    stdout.write(CSI.moveTo(layout.inputStartRow) + CSI.clearLine + statusLine);
    stdout.write(CSI.hideCursor);
  }

  private renderConversation(width: number): string[] {
    if (this.transcript.length === 0) {
      return [];
    }

    const lines: string[] = [];
    const recent = this.transcript.slice(-8);

    for (const entry of recent) {
      const roleLabel =
        entry.role === "you"
          ? "You"
          : entry.role === "assistant"
            ? "Assistant"
            : "System";
      const prefix =
        entry.role === "you"
          ? `${style.highlight}${roleLabel}${style.reset}`
          : entry.role === "assistant"
            ? `${style.highlight}${roleLabel}${style.reset}`
            : `${style.muted}${roleLabel}${style.reset}`;
      const labelSuffix = ": ";
      const hangIndent = " ".repeat(roleLabel.length + labelSuffix.length);
      const firstLineWidth = Math.max(1, width - hangIndent.length);
      const continuationWidth = Math.max(1, width - hangIndent.length);

      const wrapped = wrapTextWithHangIndent(
        entry.text,
        width,
        firstLineWidth,
        continuationWidth,
      );
      const hasContent = wrapped.some((line) => line.length > 0);
      const lastContentIndex = wrapped.findLastIndex((line) => line.length > 0);

      if (!hasContent && entry.streaming) {
        lines.push(`${prefix}${labelSuffix}${style.highlight}▮${style.reset}`);
        lines.push("");
        continue;
      }

      let labeled = false;

      for (const [index, line] of wrapped.entries()) {
        if (line.length === 0) {
          lines.push("");
          continue;
        }

        const suffix =
          entry.streaming && index === lastContentIndex
            ? `${style.highlight}▮${style.reset}`
            : "";
        const formattedLine =
          entry.role === "assistant" || entry.role === "system"
            ? formatInlineMarkdown(line)
            : line;

        if (!labeled) {
          lines.push(`${prefix}${labelSuffix}${formattedLine}${suffix}`);
          labeled = true;
          continue;
        }

        lines.push(`${hangIndent}${formattedLine}${suffix}`);
      }

      lines.push("");
    }

    if (lines.at(-1) === "") {
      lines.pop();
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

  private renderPromptLine(): string {
    const promptWidth = visibleLength(this.inputPrompt);
    const maxValueWidth = Math.max(0, this.cols - promptWidth - 1);
    const value = truncateVisible(this.input.getValue(), maxValueWidth);
    return `${style.fg}${this.inputPrompt}${value}${style.fg}▮${style.reset}`;
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

function formatStatusDots(base: string, dotCount: number): string {
  if (dotCount <= 0) {
    return base;
  }

  return `${base}${".".repeat(dotCount)}`;
}
