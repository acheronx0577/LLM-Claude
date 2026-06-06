import path from "node:path";
import { Readable, Writable } from "node:stream";
import type {
  Agent,
  AgentSideConnection,
  ContentBlock,
  PromptRequest,
  ToolCallUpdate,
  ToolKind,
} from "@agentclientprotocol/sdk";
import {
  AgentSideConnection as AcpConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import { runAgent } from "./agent.ts";
import type { ApiConfig } from "./config.ts";
import { coreTools, truncateToolResult } from "./tools.ts";

type SessionState = {
  cwd: string;
  messages: ChatCompletionMessageParam[];
  pendingPrompt: AbortController | null;
};

function resolvePath(cwd: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
}

function promptToUserMessage(blocks: ContentBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    if (block.type === "text") {
      parts.push(block.text);
      continue;
    }

    if (block.type === "resource_link") {
      parts.push(`[${block.name}](${block.uri})`);
      continue;
    }

    if (block.type === "resource" && "text" in block.resource) {
      parts.push(block.resource.text);
    }
  }

  return parts.join("\n\n").trim();
}

function toolPresentation(
  name: string,
  args: Record<string, unknown>,
): { title: string; kind: ToolKind; locations: Array<{ path: string }> } {
  if (name === "Read") {
    const filePath = String(args.file_path ?? "");
    return {
      title: `Read ${filePath}`,
      kind: "read",
      locations: filePath ? [{ path: filePath }] : [],
    };
  }

  if (name === "Write") {
    const filePath = String(args.file_path ?? "");
    return {
      title: `Write ${filePath}`,
      kind: "edit",
      locations: filePath ? [{ path: filePath }] : [],
    };
  }

  if (name === "Bash") {
    return {
      title: `Run ${String(args.command ?? "command")}`,
      kind: "execute",
      locations: [],
    };
  }

  return { title: name, kind: "other", locations: [] };
}

function buildToolCallUpdate(
  toolCallId: string,
  name: string,
  rawArgs: string,
  status: ToolCallUpdate["status"],
  extra: Partial<ToolCallUpdate> = {},
): ToolCallUpdate {
  const args = JSON.parse(rawArgs) as Record<string, unknown>;
  const presentation = toolPresentation(name, args);

  return {
    toolCallId,
    title: presentation.title,
    kind: presentation.kind,
    locations: presentation.locations,
    status,
    rawInput: args,
    ...extra,
  };
}

class ClaudeCodeAcpAgent implements Agent {
  private connection: AgentSideConnection;
  private config: ApiConfig;
  private sessions = new Map<string, SessionState>();

  constructor(connection: AgentSideConnection, config: ApiConfig) {
    this.connection = connection;
    this.config = config;
  }

  async initialize(_params: Parameters<Agent["initialize"]>[0]) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: false,
      },
    };
  }

  async authenticate() {
    return {};
  }

  async newSession(params: { cwd: string }) {
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, {
      cwd: params.cwd,
      messages: [],
      pendingPrompt: null,
    });

    return { sessionId };
  }

  async setSessionMode() {
    return {};
  }

  async prompt(params: PromptRequest) {
    const session = this.sessions.get(params.sessionId);

    if (!session) {
      throw new Error(`Session ${params.sessionId} not found`);
    }

    const userText = promptToUserMessage(params.prompt);

    if (!userText) {
      return { stopReason: "end_turn" as const };
    }

    session.pendingPrompt?.abort();
    session.pendingPrompt = new AbortController();
    const signal = session.pendingPrompt.signal;

    session.messages.push({ role: "user", content: userText });

    try {
      await runAgent(this.config.client, this.config.model, session.messages, {
        tools: coreTools,
        signal,
        executeToolOverride: (toolCall) =>
          this.executeToolViaClient(params.sessionId, session.cwd, toolCall),
        onAssistantText: async (text) => {
          await this.connection.sessionUpdate({
            sessionId: params.sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text },
            },
          });
        },
        onToolStart: async ({ id, name, rawArgs }) => {
          const args = JSON.parse(rawArgs) as Record<string, unknown>;
          const presentation = toolPresentation(name, args);

          await this.connection.sessionUpdate({
            sessionId: params.sessionId,
            update: {
              sessionUpdate: "tool_call",
              toolCallId: id,
              title: presentation.title,
              kind: presentation.kind,
              locations: presentation.locations,
              status: "in_progress",
              rawInput: args,
            },
          });
        },
        onToolComplete: async ({ id, name, rawArgs, result }) => {
          await this.connection.sessionUpdate({
            sessionId: params.sessionId,
            update: {
              sessionUpdate: "tool_call_update",
              ...buildToolCallUpdate(id, name, rawArgs, "completed", {
                content: [
                  {
                    type: "content",
                    content: { type: "text", text: result },
                  },
                ],
                rawOutput: { content: result },
              }),
            },
          });
        },
      });
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.message === "cancelled")) {
        return { stopReason: "cancelled" as const };
      }

      throw error;
    } finally {
      session.pendingPrompt = null;
    }

    return { stopReason: "end_turn" as const };
  }

  async cancel(params: { sessionId: string }) {
    this.sessions.get(params.sessionId)?.pendingPrompt?.abort();
  }

  private async executeToolViaClient(
    sessionId: string,
    cwd: string,
    toolCall: ChatCompletionMessageToolCall & { type: "function" },
  ): Promise<string> {
    const { name, arguments: rawArgs } = toolCall.function;
    const args = JSON.parse(rawArgs) as Record<string, unknown>;

    if (name === "Read") {
      const filePath = resolvePath(cwd, String(args.file_path));
      const response = await this.connection.readTextFile({
        sessionId,
        path: filePath,
      });
      return truncateToolResult(response.content);
    }

    if (name === "Write") {
      const filePath = resolvePath(cwd, String(args.file_path));
      const content = String(args.content ?? "");
      const toolCallUpdate = buildToolCallUpdate(
        toolCall.id,
        name,
        rawArgs,
        "pending",
      );

      const permission = await this.connection.requestPermission({
        sessionId,
        toolCall: toolCallUpdate,
        options: [
          {
            optionId: "allow",
            name: "Allow this change",
            kind: "allow_once",
          },
          {
            optionId: "reject",
            name: "Skip this change",
            kind: "reject_once",
          },
        ],
      });

      if (permission.outcome.outcome === "cancelled") {
        throw new Error("cancelled");
      }

      if (
        permission.outcome.outcome !== "selected" ||
        permission.outcome.optionId !== "allow"
      ) {
        return "Write skipped by user.";
      }

      await this.connection.writeTextFile({
        sessionId,
        path: filePath,
        content,
      });

      return "File written successfully";
    }

    if (name === "Bash") {
      const command = String(args.command ?? "");
      const shell =
        process.platform === "win32"
          ? { command: "cmd.exe", args: ["/c", command] }
          : { command: "sh", args: ["-c", command] };

      const terminal = await this.connection.createTerminal({
        sessionId,
        cwd,
        command: shell.command,
        args: shell.args,
      });

      try {
        await terminal.waitForExit();
        const output = await terminal.currentOutput();
        return truncateToolResult(output.output);
      } finally {
        await terminal.release();
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  }
}

export function runAcpServer(config: ApiConfig): void {
  const input = Writable.toWeb(process.stdout);
  const output = Readable.toWeb(process.stdin) as unknown as ReadableStream;
  const stream = ndJsonStream(input, output);

  new AcpConnection(
    (connection) => new ClaudeCodeAcpAgent(connection, config),
    stream,
  );
}
