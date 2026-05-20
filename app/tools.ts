import { exec } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type {
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { webSearch } from "./webSearch.ts";
import { resolveWithinProject } from "./pathSecurity.ts";
import { truncateToolResult } from "./toolResult.ts";
import type { FileChangeDecision, FileChangeRequest } from "./editApproval.ts";
import {
  buildWritePreview,
  fileChangeFromEditPlan,
} from "./editApproval.ts";
import type { McpSession } from "./mcp.ts";

const execAsync = promisify(exec);

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

function resolveToolPath(filePath: string): string {
  return resolveWithinProject(process.cwd(), filePath);
}

export type ExecuteToolOptions = {
  verbose?: boolean;
  approveFileChange?: (
    request: FileChangeRequest,
  ) => Promise<FileChangeDecision>;
  mcp?: McpSession | null;
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

type ToolHandler = (
  rawArgs: string,
  options: ExecuteToolOptions,
) => Promise<string>;

async function executeMcpTool(
  name: string,
  rawArgs: string,
  options: ExecuteToolOptions,
): Promise<string> {
  const args = JSON.parse(rawArgs) as Record<string, unknown>;
  logToolUse(name, "MCP", options.verbose ?? false);

  try {
    return await options.mcp!.callTool(name, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP call failed";
    return `MCP error: ${message}`;
  }
}

async function executeReadTool(
  rawArgs: string,
  options: ExecuteToolOptions,
): Promise<string> {
  const args = JSON.parse(rawArgs) as { file_path: string };
  const filePath = resolveToolPath(args.file_path);
  logToolUse("Read", filePath, options.verbose ?? false);
  return truncateResult(await readFile(filePath, "utf-8"));
}

async function executeWriteTool(
  rawArgs: string,
  options: ExecuteToolOptions,
): Promise<string> {
  const args = JSON.parse(rawArgs) as {
    file_path: string;
    content: string;
  };
  const filePath = resolveToolPath(args.file_path);
  logToolUse(
    "Write",
    filePath,
    options.verbose ?? false,
    Boolean(options.approveFileChange),
  );

  const preview = await buildWritePreview(filePath, args.content);
  const decision = await requireFileChangeApproval(preview, options);

  if (decision === "decline") {
    return "Change declined by user.";
  }

  await writeFile(filePath, args.content, "utf-8");
  return "File written successfully";
}

async function executeBashTool(
  rawArgs: string,
  options: ExecuteToolOptions,
): Promise<string> {
  const args = JSON.parse(rawArgs) as { command: string };
  logToolUse("Bash", args.command, options.verbose ?? false);

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

async function executeWebSearchTool(
  rawArgs: string,
  options: ExecuteToolOptions,
): Promise<string> {
  const args = JSON.parse(rawArgs) as { query: string };
  logToolUse("WebSearch", `"${args.query}"`, options.verbose ?? false);
  return truncateResult(await webSearch(args.query));
}

async function executeEditTool(
  rawArgs: string,
  options: ExecuteToolOptions,
): Promise<string> {
  const { planEdit } = await import("./editTools.ts");
  const args = JSON.parse(rawArgs) as {
    file_path: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  };
  const filePath = resolveToolPath(args.file_path);
  logToolUse(
    "Edit",
    filePath,
    options.verbose ?? false,
    Boolean(options.approveFileChange),
  );
