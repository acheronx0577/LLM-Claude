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
  wrapText,
} from "./ansi.ts";
import type { MascotMode, TranscriptEntry } from "./types.ts";

export type { TranscriptEntry } from "./types.ts";

const MAX_TRANSCRIPT_ENTRIES = 80;
const ANIMATION_MS = 200;
const INPUT_REGION_LINES = 4;

export class TuiScreen {
  readonly mascot = new Mascot();
  private readonly input: TuiLineInput;
  private transcript: TranscriptEntry[] = [];
  private statusLine = "";
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
  private cols = stdout.columns || 80;
  private rows = stdout.rows || 24;
  private onInterrupt: (() => void) | null = null;

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

      this.render();
    });

    this.input.setOnInterrupt(() => {
      this.onInterrupt?.();
    });
  }

  setOnInterrupt(handler: () => void): void {
    this.onInterrupt = handler;
  }

  setDashboardMeta(meta: DashboardMeta): void {
    this.dashboardMeta = meta;
    if (this.active) {
      this.render();
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

  stop(): void {
    this.active = false;
    this.stopAnimation();
    stdout.off("resize", this.handleResize);
    this.input.detach();
    this.leaveAltScreen();
  }

  suspend(): void {
    this.stopAnimation();
    this.inputMode = false;
    stdout.off("resize", this.handleResize);
    this.input.detach();
    this.leaveAltScreen();
    stdout.write("\n");
  }

  resume(): void {
    this.enterAltScreen();
    this.input.attach();
    stdout.on("resize", this.handleResize);
    this.render();
    this.startAnimation();
  }

  readUserLine(): Promise<string | null> {
    this.stopAnimation();
    this.inputMode = true;
    this.render();

    return this.input.readLine().finally(() => {
      this.inputMode = false;
      this.startAnimation();
    });
  }

  setStatus(text: string): void {
    this.statusLine = text;
    if (this.active) {
      this.render();
    }
  }

  setMascotMode(mode: MascotMode): void {
    this.mascot.setMode(mode);
    if (!this.inputMode) {
      this.startAnimation();
    }
  }

  clearTranscript(): void {
    this.transcript = [];
    if (this.active) {
      this.render();
    }
  }

  appendTranscript(entry: TranscriptEntry): void {
    this.transcript.push(entry);

    if (this.transcript.length > MAX_TRANSCRIPT_ENTRIES) {
      this.transcript = this.transcript.slice(-MAX_TRANSCRIPT_ENTRIES);
    }

    if (this.active) {
      this.render();
    }
  }

  private startAnimation(): void {
    if (this.animationTimer || !this.active || this.inputMode) {
      return;
    }

    this.animationTimer = setInterval(() => {
      if (!this.active || this.inputMode) {
        return;
      }

      const width = this.layoutWidth();
      const splitAt = Math.max(24, Math.floor((width - 2) * 0.44));
      this.mascot.tick(splitAt);
      this.renderDashboardRegion();
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

  private maxConversationLines(): number {
    const dashboardLines = renderDashboard(
      this.layoutWidth(),
      this.dashboardMeta,
      this.mascot,
    ).length;
    const reserved = dashboardLines + INPUT_REGION_LINES + 2;
    return Math.max(0, this.rows - reserved);
  }

  private paintLine(content: string): string {
    return padEndVisible(`${content}${style.reset}`, this.cols);
  }

  private buildStaticLines(width: number): string[] {
    const lines: string[] = [
      ...renderDashboard(width, this.dashboardMeta, this.mascot).map((line) =>
        this.paintLine(line),
      ),
      this.paintLine(""),
    ];

    const conversationLines = this.renderConversation(width);
    if (conversationLines.length > 0) {
      lines.push(...conversationLines.map((line) => this.paintLine(line)));
      lines.push(this.paintLine(""));
    }

    return lines;
  }

  private buildInputRegionLines(width: number): string[] {
    const lines = [
      this.paintLine(drawRule(width)),
      this.paintLine(this.renderPromptLine()),
      this.paintLine(drawRule(width)),
    ];

    const slashMenu = this.renderSlashMenu(width);
    if (slashMenu.length > 0) {
      lines.push(...slashMenu.map((line) => this.paintLine(line)));
    } else if (this.statusLine) {
      lines.push(
        this.paintLine(
          `${style.gray}${truncateVisible(this.statusLine, width)}${style.reset}`,
        ),
      );
    }

    return lines;
  }

  render(): void {
    if (!this.active) {
      return;
    }

    const width = this.layoutWidth();
    const staticLines = this.buildStaticLines(width);
    const inputLines = this.buildInputRegionLines(width);
    const output = [...staticLines, ...inputLines].join("\n");
    const lineCount = output.split("\n").length;

    stdout.write(CSI.cursorHome + CSI.clearScreen + output + CSI.hideCursor);

    if (lineCount < this.rows) {
      stdout.write(CSI.moveTo(lineCount + 1) + CSI.eraseBelow + CSI.hideCursor);
    }
  }

  private renderDashboardRegion(): void {
    if (!this.active || this.inputMode) {
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

  private renderConversation(width: number): string[] {
    if (this.transcript.length === 0) {
      return [];
    }

    const lines: string[] = [];
    const maxLines = this.maxConversationLines();
    const recent = this.transcript.slice(-8);

    for (const entry of recent) {
      const prefix =
        entry.role === "you"
          ? `${style.cyan}You${style.reset}`
          : entry.role === "assistant"
            ? `${style.orange}Assistant${style.reset}`
            : `${style.yellow}System${style.reset}`;

      for (const [index, line] of wrapText(entry.text, width - 2).entries()) {
        if (index === 0) {
          lines.push(`${prefix}: ${line}`);
        } else {
          lines.push(`  ${line}`);
        }
      }

      lines.push("");
    }

    return lines.slice(-maxLines);
  }

  private renderPromptLine(): string {
    const maxValueWidth = Math.max(0, this.cols - 3);
    const value = truncateVisible(this.input.getValue(), maxValueWidth);
    return `${style.white}> ${value}${style.orange}▮${style.reset}`;
  }

  private renderSlashMenu(width: number): string[] {
    const value = this.input.getValue();

    if (!value.startsWith("/")) {
      return [];
    }

    const matches = filterSlashCommands(value);

    if (matches.length === 0) {
      return [`${style.gray}  No matching commands${style.reset}`];
    }

    return matches.slice(0, 8).map((command) => {
      const label = formatCommandLabel(command);
      const name = `${style.periwinkle}${label}${style.reset}`;
      const gap = Math.max(
        2,
        width - visibleLength(label) - command.description.length - 2,
      );
      return `  ${name}${" ".repeat(gap)}${style.gray}${command.description}${style.reset}`;
    });
  }
}
