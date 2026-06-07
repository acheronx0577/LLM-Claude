import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { executeTool, tools } from "./tools.ts";

function isToolUseFailed(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "tool_use_failed"
  );
}

async function createChatCompletion(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  temperature: number,
) {
  return client.chat.completions.create({
    model,
    messages,
    tools,
    tool_choice: "auto",
    temperature,
  });
}

export async function runAgent(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  options: { verbose?: boolean } = {},
): Promise<string> {
  let temperature = 0.2;

  while (true) {
    let response;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await createChatCompletion(
          client,
          model,
          messages,
          temperature,
        );
        break;
      } catch (error) {
        if (isToolUseFailed(error) && attempt < 2) {
          temperature = Math.max(temperature - 0.1, 0);
          if (options.verbose) {
            console.error(
              `Tool call failed, retrying with temperature ${temperature}...`,
            );
          }
          continue;
        }
        throw error;
      }
    }

    if (!response!.choices || response!.choices.length === 0) {
      throw new Error("no choices in response");
    }

    const message = response!.choices[0].message;
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content ?? "";
    }

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") {
        throw new Error(`Unsupported tool call type: ${toolCall.type}`);
      }

      const result = await executeTool(toolCall, options);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }
}

export function isAgentToolError(error: unknown): boolean {
  return isToolUseFailed(error);
}
