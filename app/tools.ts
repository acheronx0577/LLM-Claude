import { exec } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type {
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { webSearch } from "./webSearch.ts";
import type { FileChangeDecision, FileChangeRequest } from "./editApproval.ts";
import {
  buildWritePreview,
  fileChangeFromEditPlan,
} from "./editApproval.ts";

const execAsync = promisify(exec);
const MAX_TOOL_RESULT_CHARS = 10_000;

const readTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "Read",
    description: "Read and return the contents of a file",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The path to the file to read",
        },
      },
      required: ["file_path"],
    },
  },
};

const writeTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "Write",
    description: "Write content to a file",
    parameters: {
      type: "object",
      required: ["file_path", "content"],
      properties: {
        file_path: {
          type: "string",
          description: "The path of the file to write to",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
    },
  },
};

const bashTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "Bash",
    description: "Execute a shell command",
    parameters: {
      type: "object",
      required: ["command"],
      properties: {
        command: {
          type: "string",
          description: "The command to execute",
        },
      },
    },
  },
};

const webSearchTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "WebSearch",
    description: "Search the web for current information",
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
    },
  },
};

const goToDefinitionTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "GoToDefinition",
    description: "Jump to the definition of a symbol at a file position",
    parameters: {
      type: "object",
      required: ["file_path", "line", "column"],
      properties: {
        file_path: {
          type: "string",
          description: "Path to the source file",
        },
        line: {
          type: "number",
          description: "1-based line number",
        },
        column: {
          type: "number",
          description: "1-based column number",
        },
      },
    },
  },
};

const findReferencesTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "FindReferences",
    description: "Find all references to a symbol at a file position",
    parameters: {
      type: "object",
      required: ["file_path", "line", "column"],
      properties: {
        file_path: {
          type: "string",
          description: "Path to the source file",
        },
        line: {
          type: "number",
          description: "1-based line number",
        },
        column: {
          type: "number",
          description: "1-based column number",
        },
      },
    },
  },
};

const getDiagnosticsTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "GetDiagnostics",
    description:
      "Get TypeScript errors and warnings for a file or the whole project",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description:
            "Optional path to a file. Omit to check the entire project.",
        },
      },
    },
  },
};

const editTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "Edit",
    description:
      "Replace a unique string in an existing file without rewriting the whole file. Read the file first and copy exact text into old_string.",
    parameters: {
      type: "object",
      required: ["file_path", "old_string", "new_string"],
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file to edit",
        },
        old_string: {
          type: "string",
          description:
            "Exact text to find in the file (must match once unless replace_all is true)",
        },
        new_string: {
          type: "string",
          description: "Text to replace old_string with",
        },
        replace_all: {
          type: "boolean",
          description:
            "Replace every occurrence of old_string. Default false (requires a unique match).",
        },
      },
    },
  },
};

/** CodeCrafters submit — Read, Write, Bash only (smaller API payload). */
export const coreTools: ChatCompletionTool[] = [readTool, writeTool, bashTool];

/** Interactive chat — core tools plus local extras. */
export const chatTools: ChatCompletionTool[] = [
  ...coreTools,
  editTool,
  webSearchTool,
  goToDefinitionTool,
  findReferencesTool,
  getDiagnosticsTool,
];

export function truncateToolResult(content: string): string {
  if (content.length <= MAX_TOOL_RESULT_CHARS) {
    return content;
  }

  return `${content.slice(0, MAX_TOOL_RESULT_CHARS)}\n\n[Output truncated]`;
}

function truncateResult(content: string): string {
  return truncateToolResult(content);
}

function logToolUse(
  name: string,
  detail: string,
  verbose: boolean,
  hideDetail = false,
): void {
  if (!verbose) {
    return;
  }

  console.error(`→ ${name}(${hideDetail ? "proposed" : detail})`);
}

export type ExecuteToolOptions = {
  verbose?: boolean;
  approveFileChange?: (
    request: FileChangeRequest,
  ) => Promise<FileChangeDecision>;
};

async function requireFileChangeApproval(
  request: FileChangeRequest,
  options: ExecuteToolOptions,
): Promise<FileChangeDecision | "accept"> {
  if (!options.approveFileChange) {
    return "accept";
  }

  return options.approveFileChange(request);
}

export async function executeTool(
  toolCall: ChatCompletionMessageToolCall & { type: "function" },
  options: ExecuteToolOptions = {},
): Promise<string> {
  const verbose = options.verbose ?? false;
  const { name, arguments: rawArgs } = toolCall.function;

  if (name === "Read") {
    const args = JSON.parse(rawArgs) as { file_path: string };
    logToolUse("Read", args.file_path, verbose);
    return truncateResult(await readFile(args.file_path, "utf-8"));
  }

  if (name === "Write") {
    const args = JSON.parse(rawArgs) as {
      file_path: string;
      content: string;
    };
    logToolUse("Write", args.file_path, verbose, Boolean(options.approveFileChange));

    const preview = await buildWritePreview(args.file_path, args.content);
    const decision = await requireFileChangeApproval(preview, options);

    if (decision === "decline") {
      return "Change declined by user.";
    }

    await writeFile(args.file_path, args.content, "utf-8");
    return "File written successfully";
  }

  if (name === "Bash") {
    const args = JSON.parse(rawArgs) as { command: string };
    logToolUse("Bash", args.command, verbose);

    try {
      const { stdout, stderr } = await execAsync(args.command, {
        cwd: process.cwd(),
      });
      return truncateResult(stdout + stderr);
    } catch (error) {
      const execError = error as Error & {
        stdout?: string;
        stderr?: string;
      };
      const output = (execError.stdout ?? "") + (execError.stderr ?? "");
      return truncateResult(output || execError.message);
    }
  }

  if (name === "WebSearch") {
    const args = JSON.parse(rawArgs) as { query: string };
    logToolUse("WebSearch", `"${args.query}"`, verbose);
    return truncateResult(await webSearch(args.query));
  }

  if (name === "Edit") {
    const { planEdit } = await import("./editTools.ts");
    const args = JSON.parse(rawArgs) as {
      file_path: string;
      old_string: string;
      new_string: string;
      replace_all?: boolean;
    };
    logToolUse("Edit", args.file_path, verbose, Boolean(options.approveFileChange));

    try {
      const plan = await planEdit(args);
      const preview = fileChangeFromEditPlan(args.file_path, plan);
      const decision = await requireFileChangeApproval(preview, options);

      if (decision === "decline") {
        return "Change declined by user.";
      }

      if (!plan.updated) {
        return "No changes made (old_string and new_string are identical).";
      }

      await writeFile(args.file_path, plan.updated, "utf-8");
      return `Applied edit to ${args.file_path} (+${plan.linesAdded} -${plan.linesRemoved}).`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Edit failed";
      return `Edit failed: ${message}`;
    }
  }

  if (
    name === "GoToDefinition" ||
    name === "FindReferences" ||
    name === "GetDiagnostics"
  ) {
    const { goToDefinition, findReferences, getDiagnostics } = await import(
      "./lspTools.ts"
    );

    if (name === "GoToDefinition") {
      const args = JSON.parse(rawArgs) as {
        file_path: string;
        line: number;
        column: number;
      };
      logToolUse(
        "GoToDefinition",
        `${args.file_path}:${args.line}:${args.column}`,
        verbose,
      );
      return truncateResult(goToDefinition(args));
    }

    if (name === "FindReferences") {
      const args = JSON.parse(rawArgs) as {
        file_path: string;
        line: number;
        column: number;
      };
      logToolUse(
        "FindReferences",
        `${args.file_path}:${args.line}:${args.column}`,
        verbose,
      );
      return truncateResult(findReferences(args));
    }

    const args = JSON.parse(rawArgs) as { file_path?: string };
    logToolUse("GetDiagnostics", args.file_path ?? "project", verbose);
    return truncateResult(getDiagnostics(args.file_path));
  }

  throw new Error(`Unknown tool: ${name}`);
}
