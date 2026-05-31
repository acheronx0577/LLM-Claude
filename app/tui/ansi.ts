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

function fg(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

function bg(r: number, g: number, b: number): string {
  return `\x1b[48;2;${r};${g};${b}m`;
}

/** Left inset so the rounded outer frame sits off the terminal edge. */
export const FRAME_MARGIN = 1;

/** Horizontal inset inside grey panel rows (~px-[10px] in the mockup). */
const PANEL_SIDE_PAD = 2;

/** Gap between column text and the center divider. */
export const COLUMN_GAP = 1;

export function panelInnerWidth(panelWidth: number): number {
  return Math.max(36, panelWidth - 2 - PANEL_SIDE_PAD * 2);
}

/** Inner width for title/bottom bars (single-space panel inset). */
export function panelBarInnerWidth(panelWidth: number): number {
  return Math.max(36, panelWidth - 4);
}

/** Rounded box-drawing — orange outer shell. */
const box = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  leftT: "├",
  rightT: "┤",
};

/** Sharp box-drawing — inner dashboard panel. */
const sharpBox = {
  topLeft: "┏",
  topRight: "┓",
  bottomLeft: "┗",
  bottomRight: "┛",
  horizontal: "━",
  vertical: "┃",
};

/** Transparent TUI — no background fills; terminal wallpaper shows through. */
export const theme = {
  accent: fg(255, 84, 31),
  username: fg(168, 216, 255),
  mascot: fg(110, 231, 255),
  systemAction: fg(230, 179, 154),
  systemLabel: fg(136, 136, 136),
  text: fg(235, 235, 235),
  assistant: fg(209, 209, 209),
  tips: fg(199, 199, 199),
  secondary: fg(184, 184, 184),
  muted: fg(158, 158, 158),
  dim: fg(115, 115, 115),
  hint: fg(89, 89, 89),
  /** Shared dim separator — horizontal rules, vertical divider, grey panel frame. */
  rule: fg(71, 71, 71),
  /** Inner dashboard sharp border (white in the mockup). */
  panelBorder: fg(235, 235, 235),
  panelDivider: fg(71, 71, 71),
  panelFrame: fg(71, 71, 71),
  divider: fg(71, 71, 71),
  cursor: bg(255, 84, 31),
};

export const style = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  fg: theme.text,
  muted: theme.muted,
  dimFg: theme.dim,
  borderGlow: theme.panelBorder,
  highlight: theme.accent,
  mascot: theme.mascot,
  username: theme.username,
  error: fg(255, 120, 120),
  white: theme.text,
  gray: theme.dim,
  orange: theme.accent,
  periwinkle: theme.accent,
  cyan: theme.mascot,
  accent: theme.accent,
  info: theme.accent,
  warning: theme.secondary,
  green: theme.text,
  red: fg(255, 120, 120),
  yellow: theme.secondary,
  systemAction: theme.systemAction,
  assistant: theme.assistant,
  tips: theme.tips,
  secondary: theme.secondary,
  hint: theme.hint,
  rule: theme.rule,
  cursor: theme.cursor,
};

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function stripAnsi(text: string): string {
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

function displayWidth(text: string): number {
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
    return clipVisible(text, width);
  }

  if (visible === width) {
    return text;
  }

  return text + " ".repeat(width - visible);
}

/** Clip to width without an ellipsis — for layout lines, not user-facing text. */
function clipVisible(text: string, width: number): string {
  const plain = stripAnsi(text);
  if (displayWidth(plain) <= width) {
    return text;
  }

  let result = "";
  let used = 0;

  for (const char of plain) {
    const next = charDisplayWidth(char.codePointAt(0) ?? 0);
    if (used + next > width) {
      break;
    }

    result += char;
    used += next;
  }

  return result;
}

export function truncateVisible(text: string, width: number): string {
  if (visibleLength(text) <= width) {
    return text;
  }

  if (width <= 0) {
    return "";
  }

  if (width === 1) {
    return "…";
  }

  return `${clipVisible(text, width - 1)}…`;
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
  const prefix = `${theme.panelBorder}${sharpBox.topLeft}${sharpBox.horizontal} ${style.reset}${style.bold}${theme.accent}${title}${style.reset}${theme.panelBorder} `;
  const fill = Math.max(0, width - visibleLength(prefix) - 1);
  return `${prefix}${sharpBox.horizontal.repeat(fill)}${sharpBox.topRight}${style.reset}`;
}

/** Thin rule row under the title — tees join the grey panel side borders. */
export function drawConnectedRuleRow(panelWidth: number): string {
  const span = Math.max(0, panelWidth - 2);
  return `${theme.rule}${box.leftT}${box.horizontal.repeat(span)}${box.rightT}${style.reset}`;
}

export function drawSplitRow(
  left: string,
  right: string,
  width: number,
  splitAt: number,
): string {
  const rightWidth = width - splitAt - 1;
  const leftTextWidth = Math.max(0, splitAt - COLUMN_GAP);
  const rightTextWidth = Math.max(0, rightWidth - COLUMN_GAP);
  const leftPart = left
    ? `${padEndVisible(left, leftTextWidth)}${" ".repeat(COLUMN_GAP)}`
    : " ".repeat(splitAt);
  const rightPart = right
    ? `${" ".repeat(COLUMN_GAP)}${padEndVisible(right, rightTextWidth)}`
    : " ".repeat(rightWidth);

  return `${leftPart}${theme.rule}│${style.reset}${rightPart}`;
}

export function drawBottom(width: number): string {
  return `${theme.panelBorder}${sharpBox.bottomLeft}${sharpBox.horizontal.repeat(Math.max(0, width - 2))}${sharpBox.bottomRight}${style.reset}`;
}

export function drawPanelTop(panelWidth: number): string {
  return `${theme.rule}${box.topLeft}${box.horizontal.repeat(Math.max(0, panelWidth - 2))}${box.topRight}${style.reset}`;
}

export function drawPanelBottom(panelWidth: number): string {
  return `${theme.rule}${box.bottomLeft}${box.horizontal.repeat(Math.max(0, panelWidth - 2))}${box.bottomRight}${style.reset}`;
}

export function wrapPanelRow(panelWidth: number, content: string): string {
  const slot = panelWidth - 4;
  return `${theme.rule}${box.vertical} ${style.reset}${padEndVisible(content, slot)}${theme.rule} ${box.vertical}${style.reset}`;
}

/** Content rows only — extra horizontal inset before/after text. */
export function wrapPanelContentRow(panelWidth: number, content: string): string {
  const slot = panelWidth - 2 - PANEL_SIDE_PAD * 2;
  return `${theme.rule}${box.vertical}${" ".repeat(PANEL_SIDE_PAD)}${style.reset}${padEndVisible(content, slot)}${theme.rule}${" ".repeat(PANEL_SIDE_PAD)}${box.vertical}${style.reset}`;
}

export function drawShellTop(outerWidth: number): string {
  return `${theme.accent}${box.topLeft}${box.horizontal.repeat(Math.max(0, outerWidth - 2))}${box.topRight}${style.reset}`;
}

export function drawShellBottom(outerWidth: number): string {
  return `${theme.accent}${box.bottomLeft}${box.horizontal.repeat(Math.max(0, outerWidth - 2))}${box.bottomRight}${style.reset}`;
}

export function wrapShellRow(outerWidth: number, content: string): string {
  const slot = outerWidth - 4;
  return `${theme.accent}${box.vertical} ${style.reset}${padEndVisible(content, slot)}${theme.accent} ${box.vertical}${style.reset}`;
}

export function drawRule(width: number): string {
  return `${theme.rule}${box.horizontal.repeat(width)}${style.reset}`;
}

export function clampTerminalWidth(cols: number, min = 48): number {
  return Math.max(min, cols || 80);
}

export function formatInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, `${theme.muted}$1${style.reset}`)
    .replace(/\*\*([^*]+)\*\*/g, `${style.bold}${theme.text}$1${style.reset}`)
    .replace(/\*([^*]+)\*/g, `${style.dim}${theme.muted}$1${style.reset}`);
}

export const READY_HINT = "Ready · type /help or ask a coding question";
