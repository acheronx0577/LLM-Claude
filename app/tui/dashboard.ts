import type { Mascot } from "./mascot.ts";
import {
  drawBottom,
  drawSplitRow,
  drawTitledTop,
  style,
  truncateVisible,
  visibleLength,
} from "./ansi.ts";

export type DashboardMeta = {
  username: string;
  modelLabel: string;
  providerLabel: string;
  cwd: string;
  version: string;
  toolSummary: string;
};

const TIPS = [
  "Use /help to see slash commands",
  "Write/Edit changes ask for review first",
  "Copy mcp.json.example → mcp.json for MCP tools",
];

export function renderDashboard(
  width: number,
  meta: DashboardMeta,
  mascot: Mascot,
): string[] {
  const splitAt = Math.max(24, Math.floor((width - 2) * 0.44));
  const leftInner = splitAt;
  const rightInner = width - 2 - splitAt - 1;
  const sprite = mascot.getSpriteLines();
  const shake = mascot.getShakeOffset();
  const spriteBlock = placeSprite(sprite, leftInner, mascot.x + shake);

  const leftRows = [
    `${style.fg}Welcome back ${style.bold}${style.username}${meta.username}${style.reset}${style.fg}!${style.reset}`,
    "",
    ...spriteBlock,
    "",
    `${style.highlight}${truncateVisible(meta.modelLabel, leftInner)}${style.reset}`,
    `${style.muted}${truncateVisible(meta.providerLabel, leftInner)}${style.reset}`,
    `${style.dimFg}${truncateVisible(meta.toolSummary, leftInner)}${style.reset}`,
    `${style.dimFg}${truncateVisible(meta.cwd, leftInner)}${style.reset}`,
  ];

  const rightRows = [
    `${style.bold}${style.highlight}Tips for getting started${style.reset}`,
    "",
    ...TIPS.map(
      (tip) => `${style.fg}${truncateVisible(tip, rightInner)}${style.reset}`,
    ),
  ];

  const rowCount = Math.max(leftRows.length, rightRows.length);
  const lines: string[] = [
    drawTitledTop(width, `LLM Claude v${meta.version}`),
  ];

  for (let index = 0; index < rowCount; index++) {
    lines.push(
      drawSplitRow(
        leftRows[index] ?? "",
        rightRows[index] ?? "",
        width,
        splitAt,
      ),
    );
  }

  lines.push(drawBottom(width));
  return lines;
}

function placeSprite(
  lines: string[],
  width: number,
  startX: number,
): string[] {
  return lines.map((line) => {
    const lineWidth = visibleLength(line);
    const pad = Math.max(0, Math.min(startX, width - lineWidth));
    return `${" ".repeat(pad)}${style.mascot}${line}${style.reset}`;
  });
}
