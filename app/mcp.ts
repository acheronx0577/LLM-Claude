import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { truncateToolResult } from "./toolResult.ts";

export type McpServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

export type McpConfig = {
  servers: Record<string, McpServerConfig>;
};

type McpToolRoute = {
  serverName: string;
  toolName: string;
};

type ConnectedServer = {
  name: string;
  client: Client;
};

type ToolContentBlock = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

function sanitizeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function mcpOpenAiToolName(serverName: string, toolName: string): string {
  return `mcp_${sanitizeName(serverName)}_${sanitizeName(toolName)}`;
}

function validateServerConfig(serverName: string, config: McpServerConfig): void {
  if (!config.command?.trim()) {
    throw new Error(`server "${serverName}" is missing a command`);
  }
}

function parseMcpConfig(raw: unknown): McpConfig {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("servers" in raw) ||
    typeof (raw as McpConfig).servers !== "object" ||
    (raw as McpConfig).servers === null
  ) {
    throw new Error("MCP config must contain a servers object");
  }

  return raw as McpConfig;
}

export async function loadMcpConfig(
  configPath = process.env.MCP_CONFIG ?? path.join(process.cwd(), "mcp.json"),
): Promise<McpConfig | null> {
  try {
    const content = await readFile(configPath, "utf-8");
    return parseMcpConfig(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function mcpToolToOpenAi(serverName: string, tool: Tool): ChatCompletionTool {
  const description = tool.description
    ? `[MCP:${serverName}] ${tool.description}`
    : `[MCP:${serverName}] ${tool.name}`;

  return {
    type: "function",
    function: {
      name: mcpOpenAiToolName(serverName, tool.name),
      description,
      parameters: (tool.inputSchema as Record<string, unknown>) ?? {
        type: "object",
        properties: {},
      },
    },
  };
}

function formatToolContent(content: ToolContentBlock[]): string {
  return content
    .map((block) => {
      if (block.type === "text" && typeof block.text === "string") {
        return block.text;
      }

      return JSON.stringify(block);
    })
    .join("\n");
}

function formatCallToolResult(result: CallToolResult): string {
  const content = result.content as ToolContentBlock[];
  const text = formatToolContent(content);

  if (result.isError) {
    return truncateToolResult(text || "MCP tool returned an error");
  }

  return truncateToolResult(text || "(empty MCP result)");
}

export type McpSession = {
  tools: ChatCompletionTool[];
  serverNames: string[];
  isMcpTool: (name: string) => boolean;
  callTool: (openAiName: string, args: Record<string, unknown>) => Promise<string>;
  close: () => Promise<void>;
};

async function listAllTools(client: Client): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;

  do {
    const page = await client.listTools({ cursor });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);

  return tools;
}

export async function connectMcpServers(
  config: McpConfig,
  options: { quiet?: boolean } = {},
): Promise<McpSession | null> {
  const connected: ConnectedServer[] = [];
  const tools: ChatCompletionTool[] = [];
  const routes = new Map<string, McpToolRoute>();

  for (const [serverName, serverConfig] of Object.entries(config.servers)) {
    try {
      validateServerConfig(serverName, serverConfig);

      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env,
        cwd: serverConfig.cwd,
        stderr: "pipe",
      });

      const client = new Client({ name: "llm-claude", version: "1.0.0" });
      await client.connect(transport);
      connected.push({ name: serverName, client });

      const serverTools = await listAllTools(client);

      for (const tool of serverTools) {
        const openAiName = mcpOpenAiToolName(serverName, tool.name);

        if (routes.has(openAiName)) {
          if (!options.quiet) {
            console.error(
              `MCP: skipped duplicate tool name "${openAiName}" from ${serverName}/${tool.name}`,
            );
          }
          continue;
        }

        tools.push(mcpToolToOpenAi(serverName, tool));
        routes.set(openAiName, { serverName, toolName: tool.name });
      }

      if (!options.quiet) {
        console.error(
          `MCP: connected "${serverName}" (${serverTools.length} tools)`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "connection failed";
      if (!options.quiet) {
        console.error(`MCP: skipped "${serverName}" — ${message}`);
      }
    }
  }

  if (connected.length === 0) {
    return null;
  }

  const clientsByServer = new Map(
    connected.map((entry) => [entry.name, entry.client]),
  );

  return {
    tools,
    serverNames: connected.map((entry) => entry.name),
    isMcpTool: (name) => routes.has(name),
    callTool: async (openAiName, args) => {
      const route = routes.get(openAiName);

      if (!route) {
        throw new Error(`Unknown MCP tool: ${openAiName}`);
      }

      const client = clientsByServer.get(route.serverName);

      if (!client) {
        throw new Error(`MCP server not connected: ${route.serverName}`);
      }

      const result = await client.callTool({
        name: route.toolName,
        arguments: args,
      });

      return formatCallToolResult(result as CallToolResult);
    },
    close: async () => {
      await Promise.all(
        connected.map(async (entry) => {
          try {
            await entry.client.close();
          } catch {
            // ignore shutdown errors
          }
        }),
      );
    },
  };
}

export function isMcpDisabled(): boolean {
  const value = process.env.MCP_DISABLE?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export async function createMcpSession(
  options: { quiet?: boolean } = {},
): Promise<McpSession | null> {
  if (isMcpDisabled()) {
    return null;
  }

  const config = await loadMcpConfig();

  if (!config || Object.keys(config.servers).length === 0) {
    return null;
  }

  return connectMcpServers(config, options);
}
