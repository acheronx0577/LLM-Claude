import { runAgent } from "./agent.ts";
import { runInteractiveChat, parseArgs } from "./chat.ts";
import { loadApiConfig } from "./config.ts";

async function main() {
  const args = process.argv.slice(2);
  const { interactive, prompt } = parseArgs(args);
  const config = loadApiConfig();

  if (!interactive && !prompt) {
    throw new Error("error: -p flag is required");
  }

  if (interactive) {
    await runInteractiveChat(config);
    return;
  }

  const messages = [{ role: "user" as const, content: prompt! }];

  // You can use print statements as follows for debugging, they'll be visible when running tests.
  console.error("Logs from your program will appear here!");

  console.log(await runAgent(config.client, config.model, messages));
}

main();
