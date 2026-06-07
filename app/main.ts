import { exec } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";

const execAsync = promisify(exec);

const tools = [
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
];

async function executeTool(
  toolCall: ChatCompletionMessageToolCall & { type: "function" },
): Promise<string> {
  if (toolCall.function.name === "Read") {
    const args = JSON.parse(toolCall.function.arguments) as {
      file_path: string;
    };
    return readFile(args.file_path, "utf-8");
  }

  if (toolCall.function.name === "Write") {
    const args = JSON.parse(toolCall.function.arguments) as {
      file_path: string;
      content: string;
    };
    await writeFile(args.file_path, args.content, "utf-8");
    return "File written successfully";
  }

  if (toolCall.function.name === "Bash") {
    const args = JSON.parse(toolCall.function.arguments) as {
      command: string;
    };

    try {
      const { stdout, stderr } = await execAsync(args.command, {
        cwd: process.cwd(),
      });
      return stdout + stderr;
    } catch (error) {
      const execError = error as Error & {
        stdout?: string;
        stderr?: string;
      };
      const output = (execError.stdout ?? "") + (execError.stderr ?? "");
      return output || execError.message;
    }
  }

  throw new Error(`Unknown tool: ${toolCall.function.name}`);
}

async function main() {
  const [, , flag, prompt] = process.argv;
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseURL =
    process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  if (flag !== "-p" || !prompt) {
    throw new Error("error: -p flag is required");
  }

  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  });

  const messages: ChatCompletionMessageParam[] = [
    { role: "user", content: prompt },
  ];

  // You can use print statements as follows for debugging, they'll be visible when running tests.
  console.error("Logs from your program will appear here!");

  while (true) {
    const response = await client.chat.completions.create({
      model: "anthropic/claude-haiku-4.5",
      messages,
      tools,
    });

    if (!response.choices || response.choices.length === 0) {
      throw new Error("no choices in response");
    }

    const message = response.choices[0].message;
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log(message.content);
      break;
    }

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") {
        throw new Error(`Unsupported tool call type: ${toolCall.type}`);
      }

      const result = await executeTool(toolCall);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }
}

main();
