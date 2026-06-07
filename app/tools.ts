import { exec } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import { webSearch } from "./webSearch.ts";

const execAsync = promisify(exec);
const MAX_TOOL_RESULT_CHARS = 10_000;

export const tools = [
  {
    type: "function" as const,
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
  },
  {
    type: "function" as const,
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
  },
  {
    type: "function" as const,
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
  },
  {
    type: "function" as const,
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
  },
];

function truncateResult(content: string): string {
  if (content.length <= MAX_TOOL_RESULT_CHARS) {
    return content;
  }

  return `${content.slice(0, MAX_TOOL_RESULT_CHARS)}\n\n[Output truncated]`;
}

function logToolUse(name: string, detail: string, verbose: boolean): void {
  if (!verbose) {
    return;
  }

  console.error(`→ ${name}(${detail})`);
}

export async function executeTool(
  toolCall: ChatCompletionMessageToolCall & { type: "function" },
  options: { verbose?: boolean } = {},
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
    logToolUse("Write", args.file_path, verbose);
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

  throw new Error(`Unknown tool: ${name}`);
}
