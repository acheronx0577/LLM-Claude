import { isAgentToolError } from "./agent.ts";
import { isMcpDisabled } from "./mcp.ts";
import { chatTools } from "./tools.ts";

export const EXIT_COMMANDS = new Set([
  "exit",
  "quit",
  "/exit",
  "/quit",
  "q",
]);

export function isExitCommand(input: string): boolean {
  return !input || EXIT_COMMANDS.has(input.toLowerCase());
}

export function buildChatHeader(
  mcpToolCount: number,
  mcpServers: string[],
): string {
  const parts = [`${chatTools.length} built-in tools`];

  if (mcpToolCount > 0) {
    parts.push(`MCP: ${mcpServers.join(", ")} (${mcpToolCount})`);
  } else if (!isMcpDisabled()) {
    parts.push("MCP off");
  }

  return `LLM Claude — ${parts.join(" · ")}`;
}

export type AgentErrorMessage = {
  transcript: string;
  status: string;
};

export function isCancelled(error: unknown): boolean {
  if (error instanceof Error && error.message === "cancelled") {
    return true;
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

export function formatAgentError(error: unknown): AgentErrorMessage {
  if (isCancelled(error)) {
    return { transcript: "Cancelled.", status: "" };
  }

  if (isAgentToolError(error)) {
    const text =
      "Tool error: this model failed to call a tool. Try GROQ_MODEL=openai/gpt-oss-120b or OpenRouter.";
    return { transcript: text, status: text };
  }

  const message = error instanceof Error ? error.message : "Unknown error";

  if (message.includes("413") || message.includes("tokens")) {
    const text =
      "Token limit exceeded. Try a shorter message or start a fresh chat.";
    return { transcript: text, status: text };
  }

  return { transcript: message, status: message };
}

export function printAgentError(error: unknown): void {
  const { transcript } = formatAgentError(error);
  console.error(`\n${transcript}\n`);
}
