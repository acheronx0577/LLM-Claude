import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { runAgent } from "./agent.ts";
import type { ApiConfig } from "./config.ts";
import { formatAgentError, isExitCommand } from "./chatShared.ts";
import { createFileChangeApprover } from "./editApproval.ts";
import { createMcpSession } from "./mcp.ts";
import { chatTools } from "./tools.ts";
import {
  findExactSlashCommand,
  formatCommandLabel,
  SLASH_COMMANDS,
} from "./tui/commands.ts";
import { buildDashboardMeta } from "./tui/meta.ts";
import { TuiScreen } from "./tui/screen.ts";

export async function runInteractiveTuiChat(config: ApiConfig): Promise<void> {
  const messages: ChatCompletionMessageParam[] = [];
  const mcp = await createMcpSession({ quiet: true });
  const tools = mcp ? [...chatTools, ...mcp.tools] : chatTools;
  const screen = new TuiScreen();
  let running = true;

  screen.setDashboardMeta(
    buildDashboardMeta(config, mcp?.tools.length ?? 0, mcp?.serverNames ?? []),
  );
  screen.setOnInterrupt(() => {
    running = false;
  });
  screen.start();

  const reviewFileChange = async (
    request: Parameters<ReturnType<typeof createFileChangeApprover>>[0],
  ) => {
    screen.suspend();
    screen.setMascotMode("thinking");

    const rl = readline.createInterface({ input, output });
    let decision: Awaited<ReturnType<ReturnType<typeof createFileChangeApprover>>>;
    try {
      decision = await createFileChangeApprover(rl)(request);
    } finally {
      rl.close();
    }

    screen.resume();
    screen.setMascotMode("thinking");
    return decision;
  };

  const runSlashCommand = (commandInput: string): boolean => {
    const command = findExactSlashCommand(commandInput);

    if (!command) {
      screen.appendTranscript({
        role: "system",
        text: `Unknown command. Type /help for options.`,
      });
      return true;
    }

    if (command.action === "clear") {
      messages.length = 0;
      screen.clearTranscript();
      screen.setStatus("Conversation cleared");
      return true;
    }

    if (command.action === "exit") {
      running = false;
      return true;
    }

    if (command.action === "help") {
      const helpText = SLASH_COMMANDS.map(
        (entry) =>
          `${formatCommandLabel(entry)} — ${entry.description}`,
      ).join("\n");
      screen.appendTranscript({ role: "system", text: helpText });
      return true;
    }

    if (command.action === "tools") {
      const names = tools
        .filter((tool): tool is Extract<typeof tool, { type: "function" }> =>
          tool.type === "function",
        )
        .map((tool) => tool.function.name)
        .slice(0, 24)
        .join(", ");
      screen.appendTranscript({
        role: "system",
        text: `Tools: ${names}${tools.length > 24 ? "…" : ""}`,
      });
      return true;
    }

    if (command.action === "plain-info") {
      screen.appendTranscript({
        role: "system",
        text: "Restart with --plain for the classic You:/Assistant: chat.",
      });
      return true;
    }

    return false;
  };

  try {
    while (running) {
      screen.setMascotMode("idle");
      screen.setStatus("");

      const userInput = (await screen.readUserLine())?.trim() ?? "";

      if (!running) {
        break;
      }

      if (isExitCommand(userInput)) {
        break;
      }

      if (userInput.startsWith("/")) {
        runSlashCommand(userInput);
        continue;
      }

      if (!userInput) {
        continue;
      }

      messages.push({ role: "user", content: userInput });
      screen.appendTranscript({ role: "you", text: userInput });
      screen.setMascotMode("thinking");
      screen.setStatus("Calling the model…");

      try {
        await runAgent(config.client, config.model, messages, {
          verbose: false,
          tools,
          approveFileChange: reviewFileChange,
          mcp,
          onAssistantText: async (text) => {
            screen.appendTranscript({ role: "assistant", text });
            screen.setMascotMode("thinking");
          },
          onToolStart: async ({ name }) => {
            screen.setMascotMode("tool");
            screen.setStatus(`Running ${name}…`);
          },
          onToolComplete: async ({ name }) => {
            screen.setStatus(`Finished ${name}`);
            screen.setMascotMode("thinking");
          },
        });

        screen.setMascotMode("idle");
        screen.setStatus("");
      } catch (error) {
        screen.setMascotMode("error");
        const { transcript, status } = formatAgentError(error);
        screen.appendTranscript({ role: "system", text: transcript });
        screen.setStatus(status);
        screen.setMascotMode("idle");
      }
    }
  } finally {
    screen.stop();
    if (mcp) {
      await mcp.close();
    }
  }
}
