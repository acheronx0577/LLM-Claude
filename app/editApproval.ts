import type { Interface } from "node:readline/promises";
import { readFile } from "node:fs/promises";
import type { EditArgs, EditPlan } from "./editTools.ts";
import { planEdit } from "./editTools.ts";

const CONTEXT_RADIUS = 2;

export type FileChangeRequest = {
  tool: "Write" | "Edit";
  file_path: string;
  linesAdded: number;
  linesRemoved: number;
  startLine: number;
  contextView: string;
};

export type FileChangeDecision = "accept" | "accept_all" | "decline";

function formatStats(linesAdded: number, linesRemoved: number): string {
  return `+${linesAdded} -${linesRemoved}`;
}

function formatJumpLink(filePath: string, startLine: number): string {
  return `${filePath}:${startLine}`;
}

function countLineDiff(before: string[], after: string[]): {
  linesAdded: number;
  linesRemoved: number;
  startLine: number;
} {
  let linesAdded = 0;
  let linesRemoved = 0;
  let startLine = 1;
  let foundStart = false;
  const max = Math.max(before.length, after.length);

  for (let index = 0; index < max; index++) {
    const oldLine = before[index];
    const newLine = after[index];

    if (oldLine === newLine) {
      continue;
    }

    if (!foundStart) {
      startLine = index + 1;
      foundStart = true;
    }

    if (oldLine !== undefined) {
      linesRemoved++;
    }

    if (newLine !== undefined) {
      linesAdded++;
    }
  }

  return { linesAdded, linesRemoved, startLine };
}

function formatWriteContextView(
  filePath: string,
  before: string[] | null,
  after: string[],
  startLine: number,
): string {
  const rows: string[] = [`Open: ${formatJumpLink(filePath, startLine)}`];

  if (before === null) {
    const preview = after.slice(0, 8);
    for (const [index, line] of preview.entries()) {
      rows.push(`${String(index + 1).padStart(4)} | + ${line}`);
    }

    if (after.length > preview.length) {
      rows.push(`     | + ... (${after.length - preview.length} more lines)`);
    }

    return rows.join("\n");
  }

  const viewStart = Math.max(0, startLine - 1 - CONTEXT_RADIUS);
  const viewEnd = Math.min(before.length, startLine + CONTEXT_RADIUS + 5);

  for (let index = viewStart; index < viewEnd; index++) {
    const lineNo = index + 1;
    const oldLine = before[index];
    const newLine = after[index];

    if (oldLine === newLine) {
      rows.push(`${String(lineNo).padStart(4)} |   ${oldLine ?? ""}`);
      continue;
    }

    if (oldLine !== undefined) {
      rows.push(`${String(lineNo).padStart(4)} | - ${oldLine}`);
    }

    if (newLine !== undefined) {
      rows.push(`${String(lineNo).padStart(4)} | + ${newLine}`);
    }
  }

  return rows.join("\n");
}

export async function buildWritePreview(
  file_path: string,
  content: string,
): Promise<FileChangeRequest> {
  let previous: string | null = null;

  try {
    previous = await readFile(file_path, "utf-8");
  } catch {
    previous = null;
  }

  const afterLines = content.split(/\r?\n/);

  if (previous === null) {
    return {
      tool: "Write",
      file_path,
      linesAdded: afterLines.length,
      linesRemoved: 0,
      startLine: 1,
      contextView: formatWriteContextView(file_path, null, afterLines, 1),
    };
  }

  const beforeLines = previous.split(/\r?\n/);
  const diff = countLineDiff(beforeLines, afterLines);

  return {
    tool: "Write",
    file_path,
    linesAdded: diff.linesAdded,
    linesRemoved: diff.linesRemoved,
    startLine: diff.startLine,
    contextView: formatWriteContextView(
      file_path,
      beforeLines,
      afterLines,
      diff.startLine,
    ),
  };
}

export function fileChangeFromEditPlan(
  file_path: string,
  plan: EditPlan,
): FileChangeRequest {
  return {
    tool: "Edit",
    file_path,
    linesAdded: plan.linesAdded,
    linesRemoved: plan.linesRemoved,
    startLine: plan.startLine,
    contextView: plan.contextView,
  };
}

export async function buildEditPreview(args: EditArgs): Promise<FileChangeRequest> {
  const plan = await planEdit(args);
  return fileChangeFromEditPlan(args.file_path, plan);
}

function printFilePicker(
  changes: FileChangeRequest[],
  pending: FileChangeRequest,
): void {
  console.error("\nEdited this turn — enter a number to jump:");
  for (const [index, change] of changes.entries()) {
    const marker = change.file_path === pending.file_path ? " ← pending" : "";
    console.error(
      `  ${index + 1}. ${change.file_path}  ${formatStats(change.linesAdded, change.linesRemoved)}  ${formatJumpLink(change.file_path, change.startLine)}${marker}`,
    );
  }
}

function printFileJump(change: FileChangeRequest): void {
  console.error(`\n${formatJumpLink(change.file_path, change.startLine)}`);
  console.error("─".repeat(60));
  console.error(change.contextView);
  console.error("─".repeat(60));
}

function parseFileSelection(
  answer: string,
  changes: FileChangeRequest[],
): FileChangeRequest | null {
  const trimmed = answer.trim();
  if (!trimmed) {
    return null;
  }

  const asNumber = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= changes.length) {
    return changes[asNumber - 1]!;
  }

  const byPath = changes.find(
    (change) =>
      change.file_path === trimmed ||
      change.file_path.endsWith(`/${trimmed}`) ||
      change.file_path.endsWith(`\\${trimmed}`),
  );

  return byPath ?? null;
}

function isAcceptAll(answer: string): boolean {
  return (
    answer === "a" ||
    answer === "all" ||
    answer === "accept" ||
    answer === "accept all" ||
    answer === "accept-all"
  );
}

function isDecline(answer: string): boolean {
  return answer === "d" || answer === "decline" || answer === "no" || answer === "n";
}

function isReview(answer: string): boolean {
  return answer === "r" || answer === "review";
}

function isApply(answer: string): boolean {
  return answer === "y" || answer === "apply" || answer === "yes";
}

function isBack(answer: string): boolean {
  return answer === "b" || answer === "back";
}

async function reviewChanges(
  rl: Interface,
  changes: FileChangeRequest[],
  pending: FileChangeRequest,
): Promise<"apply" | "accept_all" | "decline" | "continue"> {
  while (true) {
    printFilePicker(changes, pending);
    console.error("[1-N] Jump to file  [y] Apply pending  [a] Accept all  [d] Decline");

    const answer = (await rl.question("Review? ")).trim();

    if (isDecline(answer)) {
      return "decline";
    }

    if (isAcceptAll(answer)) {
      return "accept_all";
    }

    if (isApply(answer)) {
      return "apply";
    }

    const selected = parseFileSelection(answer, changes);
    if (selected) {
      printFileJump(selected);
      console.error("[b] Back  [y] Apply pending  [a] Accept all  [d] Decline");

      const followUp = (await rl.question("Review? ")).trim();

      if (isBack(followUp)) {
        continue;
      }

      if (isDecline(followUp)) {
        return "decline";
      }

      if (isAcceptAll(followUp)) {
        return "accept_all";
      }

      if (isApply(followUp)) {
        return "apply";
      }

      const nested = parseFileSelection(followUp, changes);
      if (nested) {
        printFileJump(nested);
        continue;
      }

      console.error("Use [b] Back, [y] Apply pending, [a] Accept all, or [d] Decline.");
      continue;
    }

    console.error("Enter a file number, or use [y], [a], or [d].");
  }
}

export function createFileChangeApprover(rl: Interface) {
  let acceptAll = false;
  const changesThisTurn: FileChangeRequest[] = [];

  return async (
    request: FileChangeRequest,
  ): Promise<FileChangeDecision> => {
    if (acceptAll) {
      return "accept";
    }

    changesThisTurn.push(request);

    while (true) {
      console.error("\nFile change proposed.");
      console.error("[r] Review  [a] Accept all  [d] Decline");

      const answer = (await rl.question("Change? ")).trim().toLowerCase();

      if (isDecline(answer)) {
        return "decline";
      }

      if (isAcceptAll(answer)) {
        acceptAll = true;
        return "accept_all";
      }

      if (isReview(answer)) {
        const decision = await reviewChanges(rl, changesThisTurn, request);

        if (decision === "apply") {
          return "accept";
        }

        if (decision === "accept_all") {
          acceptAll = true;
          return "accept_all";
        }

        if (decision === "decline") {
          return "decline";
        }

        continue;
      }

      console.error("Press [r] to review, [a] to accept all, or [d] to decline.");
    }
  };
}
