const MAX_TOOL_RESULT_CHARS = 10_000;

export function truncateToolResult(content: string): string {
  if (content.length <= MAX_TOOL_RESULT_CHARS) {
    return content;
  }

  return `${content.slice(0, MAX_TOOL_RESULT_CHARS)}\n\n[Output truncated]`;
}
