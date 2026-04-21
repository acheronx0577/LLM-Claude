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