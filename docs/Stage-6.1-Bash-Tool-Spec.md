# Stage 6.1 — Bash Tool Spec

← [Back: Stage 6 — Implement the Bash Tool](Stage-6-Implement-Bash-Tool.md) · [Next: Stage 6.2 — Bash Execution & Tests →](Stage-6.2-Bash-Execution-Tests.md)

The Bash tool lets the LLM run shell commands — delete files, create directories, run scripts, etc. Advertise it in the request and execute it when the model calls it.

---

## Tool specification

Add this to your `tools` array:

```json
{
  "type": "function",
  "function": {
    "name": "Bash",
    "description": "Execute a shell command",
    "parameters": {
      "type": "object",
      "required": ["command"],
      "properties": {
        "command": {
          "type": "string",
          "description": "The command to execute"
        }
      }
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `command` | Shell command to run (required) |

You can use any reasonable tool name (`Bash`, `bash`, `RunBashCommand`, `run_bash_command`, etc.).

---

## TypeScript shape

```typescript
tools: [
  // ... Read, Write tools ...
  {
    type: "function",
    function: {
      name: "Bash",
      description: "Execute a shell command",
      parameters: {
        type: "object",
        required: ["command"],
        properties: {
          command: {
            type: "string",
            description: "The command to execute",
          },
        },
      },
    },
  },
],
```

See **[Stage 6.2](Stage-6.2-Bash-Execution-Tests.md)** for how to execute Bash calls inside the agent loop.

---

← [Back: Stage 6 — Implement the Bash Tool](Stage-6-Implement-Bash-Tool.md) · [Next: Stage 6.2 — Bash Execution & Tests →](Stage-6.2-Bash-Execution-Tests.md)
