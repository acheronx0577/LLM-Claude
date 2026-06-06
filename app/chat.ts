import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { isAgentToolError, runAgent } from "./agent.ts";
import type { ApiConfig } from "./config.ts";

const EXIT_COMMANDS = new Set(["exit", "quit", "/exit", "/quit", "q"]);

export function parseArgs(argv: string[]): {
  interactive: boolean;
  prompt?: string;
} {
  const interactive =
    argv.includes("-i") || argv.includes("--chat") || argv.length === 0;
  const promptIndex = argv.indexOf("-p");
  const prompt = promptIndex >= 0 ? argv[promptIndex + 1] : undefined;

  return { interactive, prompt };
}

export async function runInteractiveChat(config: ApiConfig): Promise<void> {
  const messages: ChatCompletionMessageParam[] = [];
  const rl = readline.createInterface({ input, output });

  console.error("LLM Claude chat");
  console.error("Tools: Read, Write, Bash, WebSearch");
  console.error("Type exit to quit.\n");

  try {
    while (true) {
      const userInput = (await rl.question("You: ")).trim();

      if (!userInput || EXIT_COMMANDS.has(userInput.toLowerCase())) {
        break;
      }

      messages.push({ role: "user", content: userInput });

      try {
        const reply = await runAgent(config.client, config.model, messages, {
          verbose: true,
        });
        console.log(`\nAssistant: ${reply}\n`);
      } catch (error) {
        if (isAgentToolError(error)) {
          console.error(
            "\nTool error: this Groq model failed to call a tool. Use GROQ_MODEL=openai/gpt-oss-120b or OpenRouter.\n",
          );
        } else {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          console.error(`\nError: ${message}\n`);
        }
      }
    }
  } finally {
    rl.close();
  }
}
