import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { isAgentToolError, runAgent } from "./agent.ts";
import type { ApiConfig } from "./config.ts";
import { createFileChangeApprover } from "./editApproval.ts";
import { chatTools } from "./tools.ts";

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
  console.error("Tools: Read, Write, Edit, Bash, WebSearch, GoToDefinition, FindReferences, GetDiagnostics");
  console.error("Write/Edit: [r] Review first, then jump to file:line — [y] Apply [a] Accept all [d] Decline");
  console.error("Type exit to quit.\n");

  try {
    while (true) {
      const userInput = (await rl.question("You: ")).trim();

      if (!userInput || EXIT_COMMANDS.has(userInput.toLowerCase())) {
        break;
      }

      messages.push({ role: "user", content: userInput });

      try {
        const approveFileChange = createFileChangeApprover(rl);
        const reply = await runAgent(config.client, config.model, messages, {
          verbose: true,
          tools: chatTools,
          approveFileChange,
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
          if (message.includes("413") || message.includes("tokens")) {
            console.error(
              "\nToken limit exceeded. Try a shorter message or start a fresh chat session.\n",
            );
          } else {
            console.error(`\nError: ${message}\n`);
          }
        }
      }
    }
  } finally {
    rl.close();
  }
}
