import type { Interface } from "node:readline/promises";
import { readFile } from "node:fs/promises";
import type { EditPlan } from "./editTools.ts";
import { openFileInEditor, editorOpenHint } from "./openInEditor.ts";

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

export type ApprovalUi = {
  beginReview?: () => void;
  show: (text: string) => void;
  ask: (prompt: string) => Promise<string>;
  openInEditor?: (filePath: string, startLine: number) => Promise<boolean>;
  isCancelled?: () => boolean;
};

function throwIfCancelled(ui: ApprovalUi): void {
  if (ui.isCancelled?.()) {
    throw new Error("cancelled");
  }
}

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

function formatFilePicker(
  changes: FileChangeRequest[],
  pending: FileChangeRequest,
): string {
  const lines = ["Edited this turn:"];

  for (const [index, change] of changes.entries()) {
    const marker = change.file_path === pending.file_path ? " ← pending" : "";
    lines.push(
      `  ${index + 1}. ${change.file_path}  ${formatStats(change.linesAdded, change.linesRemoved)}${marker}`,
    );
  }

  return lines.join("\n");
}

function formatChangeProposal(_request: FileChangeRequest): string {
  return "File change proposed.\n[r] Review  [a] Accept all  [d] Decline";
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

async function reviewChanges(
  ui: ApprovalUi,
  changes: FileChangeRequest[],
  pending: FileChangeRequest,
): Promise<"apply" | "accept_all" | "decline" | "continue"> {
  while (true) {
    throwIfCancelled(ui);

    ui.show(
      [
        formatFilePicker(changes, pending),
        "[1-N] Open in editor  [y] Apply pending  [a] Accept all  [d] Decline",
      ].join("\n"),
    );

    const answer = (await ui.ask("Review? ")).trim();

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
      const opened =
        (await ui.openInEditor?.(selected.file_path, selected.startLine)) ??
        false;

      ui.show(
        [
          formatFilePicker(changes, pending),
          opened
            ? `Opened ${selected.file_path} in editor.`
            : `Could not open ${selected.file_path} in editor. ${editorOpenHint()}`,
          "[1-N] Open in editor  [y] Apply pending  [a] Accept all  [d] Decline",
        ].join("\n"),
      );
      continue;
    }

    ui.show("Enter a file number, or use [y], [a], or [d].");
  }
}

function createReadlineApprovalUi(rl: Interface): ApprovalUi {
  return {
    show(text) {
      console.error(`\n${text}`);
    },
    ask(prompt) {
      return rl.question(prompt).then((answer) => answer.trim());
    },
    async openInEditor(filePath, startLine) {
      return openFileInEditor(filePath, startLine);
    },
  };
}

export function createFileChangeApproverWithUi(ui: ApprovalUi) {
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
      throwIfCancelled(ui);
      ui.show(formatChangeProposal(request));

      const answer = (await ui.ask("Change? ")).trim().toLowerCase();

      if (isDecline(answer)) {
        return "decline";
      }

      if (isAcceptAll(answer)) {
        acceptAll = true;
        return "accept_all";
      }

      if (isReview(answer)) {
        ui.beginReview?.();
        const decision = await reviewChanges(ui, changesThisTurn, request);

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

      ui.show("Press [r] to review, [a] to accept all, or [d] to decline.");
    }
  };
}

export function createFileChangeApprover(rl: Interface) {
  return createFileChangeApproverWithUi(createReadlineApprovalUi(rl));
}
