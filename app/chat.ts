import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { runAgent } from "./agent.ts";
import type { ApiConfig } from "./config.ts";
import {
  buildChatHeader,
  isExitCommand,
  printAgentError,
} from "./chatShared.ts";
import { createFileChangeApprover } from "./editApproval.ts";
import { createMcpSession, isMcpDisabled } from "./mcp.ts";
import { chatTools } from "./tools.ts";

export function parseArgs(argv: string[]): {
  interactive: boolean;
  prompt?: string;
  plain?: boolean;
  tui?: boolean;
} {
  const plain = argv.includes("--plain");
  const tui = argv.includes("--tui") || argv.includes("--tui-chat");
  const interactive =
    argv.includes("-i") || argv.includes("--chat") || argv.length === 0;
  const promptIndex = argv.indexOf("-p");
  const prompt = promptIndex >= 0 ? argv[promptIndex + 1] : undefined;

  return { interactive, prompt, plain, tui };
}

export function shouldUseTuiChat(options: {
  plain?: boolean;
  tui?: boolean;
}): boolean {
  if (options.plain) {
    return false;
  }

  // npm → powershell → bun often loses stdout.isTTY on Windows even in a
  // real terminal; TUI is the intended default for interactive chat.
  return true;
}

export async function runInteractiveChat(config: ApiConfig): Promise<void> {
  const messages: ChatCompletionMessageParam[] = [];
  const rl = readline.createInterface({ input, output });
  const mcp = await createMcpSession();
  const tools = mcp ? [...chatTools, ...mcp.tools] : chatTools;
  const approveFileChange = createFileChangeApprover(rl);

  console.error(buildChatHeader(mcp?.tools.length ?? 0, mcp?.serverNames ?? []));
  console.error(
    `Built-in: Read, Write, Edit, Bash, WebSearch, GoToDefinition, FindReferences, GetDiagnostics`,
  );
  if (mcp) {
    console.error(`MCP servers: ${mcp.serverNames.join(", ")}`);
  } else if (!isMcpDisabled()) {
    console.error(
      "MCP: off — copy mcp.json.example to mcp.json (or MCP_DISABLE=1)",
    );
  }
  console.error(
    "Write/Edit: [r] Review · [y] Apply · [a] Accept all · [d] Decline",
  );
  console.error("Type exit to quit.\n");

  try {
    while (true) {
      const userInput = (await rl.question("You: ")).trim();

      if (isExitCommand(userInput)) {
        break;
      }

      messages.push({ role: "user", content: userInput });

      try {
        const reply = await runAgent(config.client, config.model, messages, {
          verbose: true,
          tools,
          approveFileChange,
          mcp,
        });
        console.log(`\nAssistant: ${reply}\n`);
      } catch (error) {
        printAgentError(error);
      }
    }
  } finally {
    rl.close();
    if (mcp) {
      await mcp.close();
    }
  }
}
