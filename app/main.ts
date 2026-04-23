import { runAcpServer } from "./acp.ts";
import { runAgent } from "./agent.ts";
import { runInteractiveChat, parseArgs, shouldUseTuiChat } from "./chat.ts";
import { loadApiConfig } from "./config.ts";
import { runInteractiveTuiChat } from "./tuiChat.ts";

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--acp")) {
    runAcpServer(loadApiConfig());
    return;
  }

  const parsed = parseArgs(args);
  const config = loadApiConfig();

  if (!parsed.interactive && !parsed.prompt) {
    throw new Error("error: -p flag is required");
  }

  if (parsed.interactive) {
    if (shouldUseTuiChat(parsed)) {
      try {
        await runInteractiveTuiChat(config);
      } catch (error) {
        if (parsed.plain) {
          throw error;
        }

        console.error(
          "TUI unavailable, falling back to plain chat (--plain to skip this message).\n",
        );
        await runInteractiveChat(config);
      }
      return;
    }

    await runInteractiveChat(config);
    return;
  }

  const messages = [{ role: "user" as const, content: parsed.prompt! }];

  // You can use print statements as follows for debugging, they'll be visible when running tests.
  console.error("Logs from your program will appear here!");

  console.log(await runAgent(config.client, config.model, messages));