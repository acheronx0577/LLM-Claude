import {
  clampTerminalWidth,
  drawShellBottom,
  drawShellTop,
  FRAME_MARGIN,
  padEndVisible,
  style,
  wrapShellRow,
} from "./ansi.ts";

export const CHAT_GUTTER = 1;

function shellOuterWidth(cols: number): number {
  return clampTerminalWidth(cols) - FRAME_MARGIN * 2;
}

export function shellContentWidth(cols: number): number {
  return shellOuterWidth(cols) - 4;
}

export function indentChatLine(line: string): string {
  return `${" ".repeat(CHAT_GUTTER)}${line}`;
}

export type ShellFrame = {
  top: string;
  bottom: string;
  rows: string[];
};

/** Wrap body lines in one continuous orange rounded shell. */
export function wrapShellFrame(
  cols: number,
  bodyLines: string[],
): ShellFrame {
  const margin = " ".repeat(FRAME_MARGIN);
  const outerWidth = shellOuterWidth(cols);

  return {
    top: padEndVisible(
      `${margin}${drawShellTop(outerWidth)}${style.reset}`,
      cols,
    ),
    bottom: padEndVisible(
      `${margin}${drawShellBottom(outerWidth)}${style.reset}`,
      cols,
    ),
    rows: bodyLines.map((line) =>
      padEndVisible(
        `${margin}${wrapShellRow(outerWidth, line)}${style.reset}`,
        cols,
      ),
    ),
  };
}
