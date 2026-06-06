import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { coreTools, executeTool } from "./tools.ts";

const DEFAULT_MAX_HISTORY_CHARS = 48_000;

function isToolUseFailed(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "tool_use_failed"
  );
}

function estimateMessageChars(messages: ChatCompletionMessageParam[]): number {
  return JSON.stringify(messages).length;
}

/** Drop oldest user turns when history exceeds the char budget. */
export function trimMessages(
  messages: ChatCompletionMessageParam[],
  maxChars = DEFAULT_MAX_HISTORY_CHARS,
): ChatCompletionMessageParam[] {
  let trimmed = [...messages];

  while (estimateMessageChars(trimmed) > maxChars && trimmed.length > 1) {
    const nextUserIndex = trimmed.findIndex(
      (message, index) => index > 0 && message.role === "user",
    );

    if (nextUserIndex === -1) {
      trimmed = trimmed.slice(1);
      continue;
    }

    trimmed = trimmed.slice(nextUserIndex);
  }

  return trimmed;
}

async function createChatCompletion(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
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

export type RunAgentOptions = {
  verbose?: boolean;
  tools?: ChatCompletionTool[];
  maxHistoryChars?: number;
  onAssistantText?: (text: string) => Promise<void>;
  onToolStart?: (toolCall: {
    id: string;
    name: string;
    rawArgs: string;
  }) => Promise<void>;
  onToolComplete?: (toolCall: {
    id: string;
    name: string;
    rawArgs: string;
    result: string;
  }) => Promise<void>;
  executeToolOverride?: (
    toolCall: ChatCompletionMessageToolCall & { type: "function" },
  ) => Promise<string>;
  signal?: AbortSignal;
};

export async function runAgent(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  options: RunAgentOptions = {},
): Promise<string> {
  const activeTools = options.tools ?? coreTools;
  const maxHistoryChars = options.maxHistoryChars ?? DEFAULT_MAX_HISTORY_CHARS;
  let temperature = 0.2;

  while (true) {
    if (options.signal?.aborted) {
      throw new Error("cancelled");
    }

    let response;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const requestMessages = trimMessages(messages, maxHistoryChars);
        response = await createChatCompletion(
          client,
          model,
          requestMessages,
          activeTools,
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

    if (message.content && options.onAssistantText) {
      await options.onAssistantText(message.content);
    }

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content ?? "";
    }

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") {
        throw new Error(`Unsupported tool call type: ${toolCall.type}`);
      }

      if (options.onToolStart) {
        await options.onToolStart({
          id: toolCall.id,
          name: toolCall.function.name,
          rawArgs: toolCall.function.arguments,
        });
      }

      const result = options.executeToolOverride
        ? await options.executeToolOverride(toolCall)
        : await executeTool(toolCall, options);

      if (options.onToolComplete) {
        await options.onToolComplete({
          id: toolCall.id,
          name: toolCall.function.name,
          rawArgs: toolCall.function.arguments,
          result,
        });
      }

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
