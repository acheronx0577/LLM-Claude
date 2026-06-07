export const CSI = {
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  clearScreen: "\x1b[2J",
  cursorHome: "\x1b[H",
  eraseBelow: "\x1b[0J",
  clearLine: "\x1b[2K",
  moveTo: (row: number, col = 1) => `\x1b[${row};${col}H`,
  enterAltScreen: "\x1b[?1049h\x1b[H\x1b[2J",
  leaveAltScreen: "\x1b[?1049l",
};

export const style = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  orange: "\x1b[38;5;208m",
  periwinkle: "\x1b[38;5;117m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  white: "\x1b[97m",
  gray: "\x1b[90m",
};

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

export function padEndVisible(text: string, width: number): string {
  const visible = visibleLength(text);
  if (visible > width) {
    return truncateVisible(text, width);
  }

  if (visible === width) {
    return text;
  }

  return text + " ".repeat(width - visible);
}

export function truncateVisible(text: string, width: number): string {
  const plain = stripAnsi(text);
  if (plain.length <= width) {
    return text;
  }

  return `${plain.slice(0, Math.max(0, width - 1))}…`;
}

export function wrapText(text: string, width: number): string[] {
  if (width <= 0) {
    return [];
  }

  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/);

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    const words = paragraph.split(/\s+/);
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;

      if (candidate.length <= width) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
      }

      if (word.length <= width) {
        current = word;
      } else {
        let chunk = word;
        while (chunk.length > width) {
          lines.push(chunk.slice(0, width));
          chunk = chunk.slice(width);
        }
        current = chunk;
      }
    }

    if (current) {
      lines.push(current);
    }
  }

  return lines.length > 0 ? lines : [""];
}

export function drawTitledTop(width: number, title: string): string {
  const prefix = `┌─ ${title} `;
  const fill = Math.max(0, width - visibleLength(prefix) - 1);
  return `${prefix}${"─".repeat(fill)}┐`;
}

export function drawSplitRow(
  left: string,
  right: string,
  width: number,
  splitAt: number,
): string {
  const rightWidth = width - 2 - splitAt - 1;
  return `│${padEndVisible(left, splitAt)}│${padEndVisible(right, rightWidth)}│`;
}

export function drawHorizontal(
  width: number,
  left = "┌",
  fill = "─",
  right = "┐",
): string {
  return left + fill.repeat(Math.max(0, width - 2)) + right;
}

export function drawRow(content: string, width: number): string {
  return `│${padEndVisible(content, width - 2)}│`;
}

export function drawBottom(width: number): string {
  return `└${"─".repeat(Math.max(0, width - 2))}┘`;
}

export function drawRule(width: number): string {
  return `${style.gray}${"─".repeat(width)}${style.reset}`;
}

export function clampTerminalWidth(cols: number, min = 48): number {
  return Math.max(min, cols || 80);
}
