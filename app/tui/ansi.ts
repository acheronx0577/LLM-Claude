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

/** Clean TUI — white glow borders, periwinkle accents, soft cyan highlights. */
export const style = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  fg: "\x1b[97m",
  muted: "\x1b[38;5;252m",
  dimFg: "\x1b[38;5;245m",
  borderGlow: "\x1b[1;97m",
  /** Periwinkle — titles, model, labels, status, slash menu */
  highlight: "\x1b[38;5;117m",
  /** Soft cyan — mascot */
  mascot: "\x1b[38;5;81m",
  /** Light blue — welcome username */
  username: "\x1b[38;5;153m",
  error: "\x1b[38;5;203m",
  white: "\x1b[97m",
  gray: "\x1b[38;5;245m",
  orange: "\x1b[38;5;208m",
  periwinkle: "\x1b[38;5;117m",
  cyan: "\x1b[38;5;81m",
  accent: "\x1b[38;5;117m",
  info: "\x1b[38;5;117m",
  warning: "\x1b[38;5;252m",
  green: "\x1b[97m",
  red: "\x1b[38;5;203m",
  yellow: "\x1b[38;5;252m",
};

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

function charDisplayWidth(codePoint: number): number {
  if (codePoint <= 0x1f) {
    return 0;
  }

  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0x303e) ||
    (codePoint >= 0x3040 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  ) {
    return 2;
  }

  return 1;
}

export function displayWidth(text: string): number {
  let width = 0;

  for (const char of stripAnsi(text)) {
    width += charDisplayWidth(char.codePointAt(0) ?? 0);
  }

  return width;
}

export function visibleLength(text: string): number {
  return displayWidth(text);
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
  if (displayWidth(plain) <= width) {
    return text;
  }

  let result = "";
  let used = 0;

  for (const char of plain) {
    const next = charDisplayWidth(char.codePointAt(0) ?? 0);
    if (used + next > Math.max(0, width - 1)) {
      break;
    }

    result += char;
    used += next;
  }

  return `${result}…`;
}

export function wrapText(text: string, width: number): string[] {
  return wrapTextWithHangIndent(text, width, width, width);
}

export function wrapTextWithHangIndent(
  text: string,
  width: number,
  firstLineWidth: number,
  continuationLineWidth: number,
): string[] {
  if (width <= 0 || firstLineWidth <= 0 || continuationLineWidth <= 0) {
    return [];
  }

  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/);
  let lineBudget = firstLineWidth;

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      lineBudget = continuationLineWidth;
      continue;
    }

    const words = paragraph.split(/\s+/);
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;

      if (candidate.length <= lineBudget) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
        current = "";
        lineBudget = continuationLineWidth;
      }

      if (word.length <= lineBudget) {
        current = word;
        continue;
      }

      let chunk = word;
      while (chunk.length > lineBudget) {
        lines.push(chunk.slice(0, lineBudget));
        chunk = chunk.slice(lineBudget);
        lineBudget = continuationLineWidth;
      }

      current = chunk;
    }

    if (current) {
      lines.push(current);
    }

    lineBudget = continuationLineWidth;
  }

  return lines.length > 0 ? lines : [""];
}

export function drawTitledTop(width: number, title: string): string {
  const prefix = `${style.borderGlow}┏━ ${style.bold}${style.highlight}${title}${style.reset} `;
  const fill = Math.max(0, width - visibleLength(prefix) - 1);
  return `${prefix}${style.borderGlow}${"━".repeat(fill)}┓${style.reset}`;
}

export function drawSplitRow(
  left: string,
  right: string,
  width: number,
  splitAt: number,
): string {
  const rightWidth = width - 2 - splitAt - 1;
  return `${style.borderGlow}┃${style.reset}${padEndVisible(left, splitAt)}${style.borderGlow}┃${style.reset}${padEndVisible(right, rightWidth)}${style.borderGlow}┃${style.reset}`;
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
  return `${style.borderGlow}┃${style.reset}${padEndVisible(content, width - 2)}${style.borderGlow}┃${style.reset}`;
}

export function drawBottom(width: number): string {
  return `${style.borderGlow}┗${"━".repeat(Math.max(0, width - 2))}┛${style.reset}`;
}

export function drawRule(width: number): string {
  return `${style.dimFg}${"─".repeat(width)}${style.reset}`;
}

export function clampTerminalWidth(cols: number, min = 48): number {
  return Math.max(min, cols || 80);
}

export function formatInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, `${style.muted}$1${style.reset}`)
    .replace(/\*\*([^*]+)\*\*/g, `${style.bold}${style.fg}$1${style.reset}`)
    .replace(/\*([^*]+)\*/g, `${style.dim}${style.muted}$1${style.reset}`);
}
