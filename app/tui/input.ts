import { stdin } from "node:process";
import {
  filterSlashCommands,
  formatCommandLabel,
} from "./commands.ts";

const MAX_INPUT_CHARS = 4_000;

export class TuiLineInput {
  private value = "";
  private resolve: ((line: string | null) => void) | null = null;
  private attached = false;
  private onInterrupt: (() => void) | null = null;

  constructor(private readonly onChange: () => void) {}

  attach(): void {
    if (this.attached) {
      return;
    }

    if (!stdin.isTTY) {
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", this.handleKey);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) {
      return;
    }

    stdin.off("data", this.handleKey);
    if (stdin.isTTY) {
      stdin.setRawMode(false);
    }
    this.attached = false;
  }

  setOnInterrupt(handler: () => void): void {
    this.onInterrupt = handler;
  }

  getValue(): string {
    return this.value;
  }

  readLine(): Promise<string | null> {
    this.value = "";

    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  private finish(line: string | null): void {
    this.resolve?.(line);
    this.resolve = null;
    this.onChange();
  }

  private tryTabComplete(): void {
    if (!this.value.startsWith("/")) {
      return;
    }

    const matches = filterSlashCommands(this.value);
    const first = matches[0];

    if (!first) {
      return;
    }

    this.value = formatCommandLabel(first);
    this.onChange();
  }

  private handleKey = (chunk: string | Buffer): void => {
    const key = typeof chunk === "string" ? chunk : chunk.toString("utf8");

    if (key === "\u0003") {
      this.finish(null);
      this.onInterrupt?.();
      return;
    }

    if (key === "\r" || key === "\n") {
      this.finish(this.value);
      this.value = "";
      return;
    }

    if (key === "\t") {
      this.tryTabComplete();
      return;
    }

    if (key === "\u007f" || key === "\b") {
      this.value = this.value.slice(0, -1);
      this.onChange();
      return;
    }

    if (key.startsWith("\u001b")) {
      return;
    }

    if (key.length === 1 && key >= " " && this.value.length < MAX_INPUT_CHARS) {
      this.value += key;
      this.onChange();
    }
  };
}
