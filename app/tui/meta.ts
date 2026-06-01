import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import type { ApiConfig } from "../config.ts";
import { chatTools } from "../tools.ts";
import type { DashboardMeta } from "./dashboard.ts";

const APP_VERSION = "0.0.1";

function loadDisplayVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      version?: string;
    };
    return pkg.version ?? APP_VERSION;
  } catch {
    return APP_VERSION;
  }
}

function formatModelLabel(model: string): string {
  const tail = model.includes("/") ? model.split("/").pop()! : model;
  return tail
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildDashboardMeta(
  config: ApiConfig,
  mcpToolCount: number,
  mcpServers: string[],
): DashboardMeta {
  const provider =
    config.provider === "groq" ? "Groq · local dev" : "OpenRouter · submit";
  const mcpSummary =
    mcpToolCount > 0
      ? `MCP: ${mcpServers.join(", ")} (${mcpToolCount})`
      : "MCP off";

  return {
    username: os.userInfo().username,
    modelLabel: formatModelLabel(config.model),
    providerLabel: provider,
    cwd: process.cwd(),
    version: loadDisplayVersion(),
    toolSummary: `${chatTools.length} tools · ${mcpSummary}`,
  };
}

