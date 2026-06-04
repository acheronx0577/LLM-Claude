# Stage 5.1 — Write Tool Spec

← [Back: Stage 5 — Implement the Write Tool](Stage-5-Implement-Write-Tool.md) · [Next: Stage 5.2 — Write Execution & Tests →](Stage-5.2-Write-Execution-Tests.md)

The Write tool lets the LLM write content to files. Like Read, you **advertise** it in the request and **execute** it when the model calls it.

---

## Tool specification

Add this to your `tools` array:

```json
{
  "type": "function",
  "function": {
    "name": "Write",
    "description": "Write content to a file",
    "parameters": {
      "type": "object",
      "required": ["file_path", "content"],
      "properties": {
        "file_path": {
          "type": "string",
          "description": "The path of the file to write to"
        },
        "content": {
          "type": "string",
          "description": "The content to write to the file"
        }
      }
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `file_path` | Path to write to (required) |
| `content` | Text to write into the file (required) |

You can use any reasonable tool name (`Write`, `write`, `write_file`, `WriteFile`, etc.).

---

## TypeScript shape

```typescript
tools: [
  // ... Read tool ...
  {
    type: "function",
    function: {
      name: "Write",
      description: "Write content to a file",
      parameters: {
        type: "object",
        required: ["file_path", "content"],
        properties: {
          file_path: {
            type: "string",
            description: "The path of the file to write to",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
      },
    },
  },
],
```

See **[Stage 5.2](Stage-5.2-Write-Execution-Tests.md)** for how to execute Write calls inside the agent loop.

---

← [Back: Stage 5 — Implement the Write Tool](Stage-5-Implement-Write-Tool.md) · [Next: Stage 5.2 — Write Execution & Tests →](Stage-5.2-Write-Execution-Tests.md)
