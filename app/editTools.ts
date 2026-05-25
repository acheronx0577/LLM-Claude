import { readFile, writeFile } from "node:fs/promises";

export type EditArgs = {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

export type EditPlan = {
  updated: string;
  linesAdded: number;
  linesRemoved: number;
  startLine: number;
  contextView: string;
};

function countOccurrences(content: string, search: string): number {
  if (!search) {
    return 0;
  }

  let count = 0;
  let index = 0;

  while ((index = content.indexOf(search, index)) !== -1) {
    count++;
    index += search.length;
  }

  return count;
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function lineNumberAt(content: string, offset: number): number {
  if (offset <= 0) {
    return 1;
  }

  return content.slice(0, offset).split(/\r?\n/).length;
}

function formatJumpLink(filePath: string, startLine: number): string {
  return `${filePath}:${startLine}`;
}

function formatContextView(
  filePath: string,
  startLine: number,
  fileLines: string[],
  oldLines: string[],
  newLines: string[],
): string {
  const contextRadius = 2;
  const hunkStart = startLine - 1;
  const viewStart = Math.max(0, hunkStart - contextRadius);
  const viewEnd = Math.min(
    fileLines.length,
    hunkStart + oldLines.length + contextRadius,
  );

  const rows: string[] = [`Open: ${formatJumpLink(filePath, startLine)}`];

  for (let index = viewStart; index < viewEnd; index++) {
    const lineNo = index + 1;
    const inRemoval =
      lineNo >= startLine && lineNo < startLine + oldLines.length;

    if (inRemoval) {
      rows.push(`${String(lineNo).padStart(4)} | - ${fileLines[index] ?? ""}`);
    } else {
      rows.push(`${String(lineNo).padStart(4)} |   ${fileLines[index] ?? ""}`);
    }
  }

  for (const [index, line] of newLines.entries()) {
    rows.push(`${String(startLine + index).padStart(4)} | + ${line}`);
  }

  return rows.join("\n");
}

export async function planEdit(args: EditArgs): Promise<EditPlan> {
  const { file_path, old_string, new_string, replace_all = false } = args;

  if (!old_string) {
    throw new Error("old_string must not be empty");
  }

  if (old_string === new_string) {
    return {
      updated: "",
      linesAdded: 0,
      linesRemoved: 0,
      startLine: 1,
      contextView: "(no changes)",
    };
  }

  let content: string;

  try {
    content = await readFile(file_path, "utf-8");
  } catch {
    throw new Error(`File not found: ${file_path}. Use Write to create new files.`);
  }

  const occurrences = countOccurrences(content, old_string);

  if (occurrences === 0) {
    throw new Error(
      `old_string not found in ${file_path}. Read the file first and copy the exact text including whitespace.`,
    );
  }

  if (occurrences > 1 && !replace_all) {
    throw new Error(
      `old_string appears ${occurrences} times in ${file_path}. Include more surrounding context to make it unique, or set replace_all to true.`,
    );
  }

  const updated = replace_all
    ? content.replaceAll(old_string, new_string)
    : content.replace(old_string, new_string);

  const oldLines = splitLines(old_string);
  const newLines = splitLines(new_string);
  const fileLines = splitLines(content);
  const startLine = lineNumberAt(content, content.indexOf(old_string));
  const linesRemoved = replace_all
    ? oldLines.length * occurrences
    : oldLines.length;
  const linesAdded = replace_all
    ? newLines.length * occurrences
    : newLines.length;

  return {
    updated,
    linesAdded,
    linesRemoved,
    startLine,
    contextView: formatContextView(
      file_path,
      startLine,
      fileLines,
      oldLines,
      newLines,
    ),
  };
}

function formatStats(linesAdded: number, linesRemoved: number): string {
  return `+${linesAdded} -${linesRemoved}`;
}

async function applyEdit(args: EditArgs): Promise<string> {
  const plan = await planEdit(args);

  if (!plan.updated) {
    return "No changes made (old_string and new_string are identical).";
  }

  await writeFile(args.file_path, plan.updated, "utf-8");

  if (args.replace_all) {
    return `Replaced occurrences in ${args.file_path} (${formatStats(plan.linesAdded, plan.linesRemoved)}).`;
  }

  return `Applied edit to ${args.file_path} (${formatStats(plan.linesAdded, plan.linesRemoved)}).`;
}
