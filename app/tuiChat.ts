import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { runAgent } from "./agent.ts";
import type { ApiConfig } from "./config.ts";
import { formatAgentError, isCancelled, isExitCommand } from "./chatShared.ts";
import { createMcpSession } from "./mcp.ts";
import { chatTools } from "./tools.ts";
import {
  findExactSlashCommand,
  formatCommandLabel,
  SLASH_COMMANDS,
} from "./tui/commands.ts";
import { createTuiFileChangeApprover } from "./tui/editApproval.ts";
import { buildDashboardMeta } from "./tui/meta.ts";
import { TuiScreen } from "./tui/screen.ts";

function formatToolActivity(name: string, rawArgs: string): string {
  try {
    const args = JSON.parse(rawArgs) as Record<string, unknown>;

    switch (name) {
      case "Read":
        return `▸ Read ${String(args.file_path ?? "")}`;
      case "Write":
        return `▸ Write ${String(args.file_path ?? "")}`;
      case "Edit":
        return `▸ Edit ${String(args.file_path ?? "")}`;
      case "Bash": {
        const command = String(args.command ?? "");
        const short =
          command.length > 60 ? `${command.slice(0, 57)}…` : command;
        return `▸ Bash ${short}`;
      }
      default:
        return `▸ ${name}`;
    }
  } catch {
    return `▸ ${name}`;
  }
}

export async function runInteractiveTuiChat(config: ApiConfig): Promise<void> {
  const messages: ChatCompletionMessageParam[] = [];
  const mcp = await createMcpSession({ quiet: true });
  const tools = mcp ? [...chatTools, ...mcp.tools] : chatTools;
  const screen = new TuiScreen();
  let running = true;
  let atPrompt = false;
  let agentAbort: AbortController | null = null;

  screen.setDashboardMeta(
    buildDashboardMeta(config, mcp?.tools.length ?? 0, mcp?.serverNames ?? []),
  );
  screen.setOnInterrupt(() => {
    agentAbort?.abort();
    screen.cancelActiveAgentUi();
    if (atPrompt) {
      running = false;
    }
  });
  screen.start();

  const reviewFileChange = createTuiFileChangeApprover(
    screen,
    () => agentAbort?.signal,
  );

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

      atPrompt = true;
      const userInput = (await screen.readUserLine())?.trim() ?? "";
      atPrompt = false;

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

      screen.batch(() => {
        screen.appendTranscript({ role: "you", text: userInput });
      });

      screen.setAgentThinking();

      let streamText = "";
      agentAbort = new AbortController();
      screen.setInterruptSignal(agentAbort.signal);

      try {
        await runAgent(config.client, config.model, messages, {
          verbose: false,
          tools,
          approveFileChange: reviewFileChange,
          mcp,
          signal: agentAbort.signal,
          onAssistantTextDelta: async (delta) => {
            streamText += delta;
          },
          onAssistantStreamEnd: async () => {
            if (streamText.trim()) {
              await screen.revealMessage(streamText);
            }
            streamText = "";
          },
          onAssistantText: async (text) => {
            if (!streamText.trim() && text.trim()) {
              await screen.revealMessage(text);
            }
          },
          onToolStart: async ({ name, rawArgs }) => {
            streamText = "";
            screen.clearEmptyAssistant();
            if (name !== "Write" && name !== "Edit") {
              screen.appendTranscript({
                role: "system",
                text: formatToolActivity(name, rawArgs),
              });
            }
            screen.setAgentActivity(`Running ${name}`, "tool");
          },
          onToolComplete: async () => {
            screen.setAgentActivity("Thinking", "thinking");
          },
        });
      } catch (error) {
        screen.clearEmptyAssistant();
        if (isCancelled(error)) {
          const { transcript } = formatAgentError(error);
          screen.appendTranscript({ role: "system", text: transcript });
          continue;
        }

        screen.setMascotMode("error");
        const { transcript, status } = formatAgentError(error);
        screen.appendTranscript({ role: "system", text: transcript, peach: true });
        screen.setStatus(status);
      } finally {
        streamText = "";
        agentAbort = null;
        screen.setInterruptSignal(null);
        screen.setMascotMode("idle");
        screen.setStatus("");
      }
    }
  } finally {
    screen.stop();
    if (mcp) {
      await mcp.close();
    }
  }
}
