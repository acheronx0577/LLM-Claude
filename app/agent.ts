import OpenAI from "openai";
import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { coreTools, executeTool, type ExecuteToolOptions } from "./tools.ts";
import type { FileChangeDecision, FileChangeRequest } from "./editApproval.ts";
import type { McpSession } from "./mcp.ts";

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

type StoredAssistantMessage = Extract<
  ChatCompletionMessageParam,
  { role: "assistant" }
>;

function normalizeAssistantMessage(
  message: ChatCompletionMessage,
): StoredAssistantMessage {
  const normalized: StoredAssistantMessage = {
    role: "assistant",
    content: message.content ?? null,
  };

  if (message.tool_calls && message.tool_calls.length > 0) {
    normalized.tool_calls = message.tool_calls;
  }

  return normalized;
}

function sanitizeMessagesForRequest(
  messages: ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role !== "assistant") {
      return message;
    }

    return normalizeAssistantMessage(message as ChatCompletionMessage);
  });
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
    messages: sanitizeMessagesForRequest(messages),
    tools,
    tool_choice: "auto",
    temperature,
  });
}

function mergeToolCallDelta(
  toolCalls: (ChatCompletionMessageToolCall & { type: "function" })[],
  delta: {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  },
): void {
  const index = delta.index ?? 0;

  if (!toolCalls[index]) {
    toolCalls[index] = {
      id: delta.id ?? "",
      type: "function",
      function: {
        name: delta.function?.name ?? "",
        arguments: delta.function?.arguments ?? "",
      },
    };
    return;
  }

  const current = toolCalls[index]!;

  if (delta.id) {
    current.id = delta.id;
  }

  if (delta.function?.name) {
    current.function.name += delta.function.name;
  }

  if (delta.function?.arguments) {
    current.function.arguments += delta.function.arguments;
  }
}

async function streamChatCompletion(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  temperature: number,
  onDelta: (delta: string) => Promise<void>,
  signal?: AbortSignal,
): Promise<StoredAssistantMessage> {
  const stream = await client.chat.completions.create({
    model,
    messages: sanitizeMessagesForRequest(messages),
    tools,
    tool_choice: "auto",
    temperature,
    stream: true,
  });

  let content = "";
  const toolCalls: (ChatCompletionMessageToolCall & { type: "function" })[] =
    [];

  for await (const chunk of stream) {
    if (signal?.aborted) {
      throw new Error("cancelled");
    }

    const delta = chunk.choices[0]?.delta;

    if (!delta) {
      continue;
    }

    if (delta.content) {
      content += delta.content;
      await onDelta(delta.content);
    }

    if (delta.tool_calls) {
      for (const toolCallDelta of delta.tool_calls) {
        mergeToolCallDelta(toolCalls, toolCallDelta);
      }
    }
  }

  return normalizeAssistantMessage({
    role: "assistant",
    content: content || null,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  } as ChatCompletionMessage);
}

export type RunAgentOptions = {
  verbose?: boolean;
  tools?: ChatCompletionTool[];
  maxHistoryChars?: number;
  onAssistantText?: (text: string) => Promise<void>;
  onAssistantTextDelta?: (delta: string) => Promise<void>;
  onAssistantStreamStart?: () => Promise<void>;
  onAssistantStreamEnd?: () => Promise<void>;
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
  approveFileChange?: (
    request: FileChangeRequest,
  ) => Promise<FileChangeDecision>;
  mcp?: McpSession | null;
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

    let message: StoredAssistantMessage | undefined;
    const requestMessages = trimMessages(messages, maxHistoryChars);
    const useStreaming = Boolean(options.onAssistantTextDelta);
    let streamed = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (useStreaming) {
          message = await streamChatCompletion(
            client,
            model,
            requestMessages,
            activeTools,
            temperature,
            async (delta) => {
              if (options.signal?.aborted) {
                throw new Error("cancelled");
              }

              streamed = true;
              await options.onAssistantTextDelta!(delta);
            },
            options.signal,
          );
        } else {
          const response = await createChatCompletion(
            client,
            model,
            requestMessages,
            activeTools,
            temperature,
          );

          if (!response.choices || response.choices.length === 0) {
            throw new Error("no choices in response");
          }

          message = normalizeAssistantMessage(response.choices[0].message);
        }

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

    if (!message) {
      throw new Error("failed to get model response");
    }

    messages.push(message);

    if (
      typeof message.content === "string" &&
      message.content &&
      options.onAssistantText &&
      (!useStreaming || !streamed)
    ) {
      if (options.signal?.aborted) {
        throw new Error("cancelled");
      }

      await options.onAssistantText(message.content);
    }

    if (useStreaming) {
      if (options.signal?.aborted) {
        throw new Error("cancelled");
      }

      await options.onAssistantStreamEnd?.();
    }

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return typeof message.content === "string" ? message.content : "";
    }

    for (const toolCall of message.tool_calls) {
      if (options.signal?.aborted) {
        throw new Error("cancelled");
      }

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
        : await executeTool(toolCall, {
            verbose: options.verbose,
            approveFileChange: options.approveFileChange,
            mcp: options.mcp,
          } satisfies ExecuteToolOptions);

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
