import type { Mascot } from "./mascot.ts";
import {
  COLUMN_GAP,
  drawBottom,
  drawConnectedRuleRow,
  drawPanelBottom,
  drawPanelTop,
  drawSplitRow,
  drawTitledTop,
  panelBarInnerWidth,
  panelInnerWidth,
  style,
  theme,
  truncateVisible,
  visibleLength,
  wrapPanelContentRow,
  wrapPanelRow,
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

/** Inset of the grey rounded panel inside the orange shell content slot. */
const PANEL_GUTTER = 1;

/**
 * Dashboard: grey rounded panel (inside orange shell) + sharp inner box.
 * Title/bottom are single-line bars; content rows have a center divider only.
 */
export function renderDashboard(
  width: number,
  meta: DashboardMeta,
  mascot: Mascot,
): string[] {
  const panelWidth = width - PANEL_GUTTER * 2;
  const barInnerWidth = panelBarInnerWidth(panelWidth);
  const contentInnerWidth = panelInnerWidth(panelWidth);
  const core = renderDashboardCore(
    contentInnerWidth,
    barInnerWidth,
    meta,
    mascot,
  );
  const gutter = " ".repeat(PANEL_GUTTER);
  const titleLine = core[0]!;
  const bottomLine = core.at(-1)!;
  const contentLines = core.slice(1, -1);

  return [
    gutter + drawPanelTop(panelWidth),
    gutter + wrapPanelRow(panelWidth, titleLine),
    gutter + drawConnectedRuleRow(panelWidth),
    ...contentLines.map((line) => gutter + wrapPanelContentRow(panelWidth, line)),
    gutter + wrapPanelRow(panelWidth, bottomLine),
    gutter + drawPanelBottom(panelWidth),
  ];
}

function renderDashboardCore(
  contentWidth: number,
  barWidth: number,
  meta: DashboardMeta,
  mascot: Mascot,
): string[] {
  const splitAt = Math.max(24, Math.floor(contentWidth * 0.44));
  const leftInner = Math.max(8, splitAt - COLUMN_GAP);
  const rightInner = Math.max(8, contentWidth - splitAt - 1 - COLUMN_GAP);
  const sprite = mascot.getSpriteLines();
  const shake = mascot.getShakeOffset();
  const spriteBlock = centeredSpriteBlock(sprite, splitAt, shake);

  const leftRows = [
    `${theme.text}Welcome back ${style.bold}${theme.username}${meta.username}${style.reset}${theme.text}!${style.reset}`,
    "",
    ...spriteBlock,
    "",
    `${style.bold}${theme.accent}${truncateVisible(meta.modelLabel, leftInner)}${style.reset}`,
    `${theme.secondary}${truncateVisible(meta.providerLabel, leftInner)}${style.reset}`,
    `${theme.dim}${truncateVisible(meta.toolSummary, leftInner)}${style.reset}`,
    `${theme.dim}${truncateVisible(meta.cwd, leftInner)}${style.reset}`,
  ];

  const rightRows = [
    `${style.bold}${theme.accent}Tips for getting started${style.reset}`,
    "",
    ...TIPS.map(
      (tip) => `${theme.tips}${truncateVisible(tip, rightInner)}${style.reset}`,
    ),
  ];

  const rowCount = Math.max(leftRows.length, rightRows.length);
  const title = truncateVisible(
    `LLM Claude v${meta.version}`,
    Math.max(12, barWidth - 6),
  );
  const lines: string[] = [drawTitledTop(barWidth, title)];

  for (let index = 0; index < rowCount; index++) {
    lines.push(
      drawSplitRow(
        leftRows[index] ?? "",
        rightRows[index] ?? "",
        contentWidth,
        splitAt,
      ),
    );
  }

  lines.push(drawBottom(barWidth));
  return lines;
}

function centeredSpriteBlock(
  lines: string[],
  columnWidth: number,
  offsetX: number,
): string[] {
  const spriteWidth = Math.max(0, ...lines.map((line) => visibleLength(line)));
  const startX =
    Math.max(0, Math.floor(columnWidth / 2) - Math.ceil(spriteWidth / 2)) +
    offsetX;
  return placeSprite(lines, columnWidth, startX);
}

function placeSprite(
  lines: string[],
  width: number,
  startX: number,
): string[] {
  return lines.map((line) => {
    const lineWidth = visibleLength(line);
    const pad = Math.max(0, Math.min(startX, width - lineWidth));
    return `${" ".repeat(pad)}${theme.mascot}${line}${style.reset}`;
  });
}
