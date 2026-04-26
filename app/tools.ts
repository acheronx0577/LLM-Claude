import { exec } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type {
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { webSearch } from "./webSearch.ts";
import { resolveWithinProject } from "./pathSecurity.ts";
import { truncateToolResult } from "./toolResult.ts";
import type { FileChangeDecision, FileChangeRequest } from "./editApproval.ts";
import {
  buildWritePreview,
  fileChangeFromEditPlan,
} from "./editApproval.ts";
import type { McpSession } from "./mcp.ts";

const execAsync = promisify(exec);

const readTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "Read",
    description: "Read and return the contents of a file",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The path to the file to read",
        },
      },