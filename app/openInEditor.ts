import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  assertSafeEditorCommand,
  joinUnderTrustedBase,
  resolveWithinProject,
} from "./pathSecurity.ts";

function resolveCursorCmd(): string | null {
  const localAppData = process.env.LOCALAPPDATA;

  if (process.env.CURSOR_CLI?.trim()) {
    const command = process.env.CURSOR_CLI.trim();
    try {
      assertSafeEditorCommand(command);
    } catch {
      return null;
    }

    if (command === "cursor" || existsSync(command)) {
      return command;
    }
  }

  if (localAppData) {
    const candidates = [
      joinUnderTrustedBase(
        localAppData,
        "Programs",
        "cursor",
        "resources",
        "app",
        "bin",
        "cursor.cmd",
      ),
      joinUnderTrustedBase(
        localAppData,
        "Programs",
        "cursor",
        "resources",
        "app",
        "codeBin",
        "code.cmd",
      ),
    ];

    for (const command of candidates) {
      if (existsSync(command)) {
        return command;
      }
    }
  }

  return "cursor";
}

function formatGotoTarget(absolute: string, startLine: number): string {
  const relative = path.relative(process.cwd(), absolute);
  const fileRef =
    relative && !relative.startsWith("..") && !path.isAbsolute(relative)
      ? relative.replace(/\\/g, "/")
      : absolute.replace(/\\/g, "/");

  return `${fileRef}:${Math.max(1, startLine)}`;
}

function runCursorCommand(command: string, args: string[]): Promise<void> {
  assertSafeEditorCommand(command);

  return new Promise((resolve, reject) => {
    const launch =
      process.platform === "win32" && command.endsWith(".cmd")
        ? {
            file: "cmd.exe",
            args: ["/d", "/s", "/c", command, ...args],
          }
        : {
            file: command,
            args,
          };

    // fallow-ignore-next-line security-sink
    const child = spawn(launch.file, launch.args, {
      detached: true,
      detached: true,
      stdio: "ignore",
      shell: false,
      windowsHide: true,
      cwd: process.cwd(),
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export async function openFileInEditor(
  filePath: string,
  startLine = 1,
): Promise<boolean> {
  let absolute: string;

  try {
    absolute = resolveWithinProject(process.cwd(), filePath);
  } catch {
    return false;
  }

  if (!existsSync(absolute)) {
    return false;
  }

  const command = resolveCursorCmd();
  if (!command) {
    return false;
  }

  const target = formatGotoTarget(absolute, startLine);
  const args = ["-g", target];

  try {
    await runCursorCommand(command, args);
    return true;
  } catch {
    return false;
  }
}

export function editorOpenHint(): string {
  return "Could not open the file in your editor. Install the Cursor shell command or set CURSOR_CLI.";
}
