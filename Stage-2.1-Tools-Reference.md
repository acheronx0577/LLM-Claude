# Stage 2.1 — Tools Reference

← [Back: Stage 2 — Advertise the Read Tool](Stage-2-Advertise-Read-Tool.md) · [Next: Stage 3 — Execute the Read Tool →](ReadMe.md#stages)

Reference for advertising tools in Stage 2. Full API docs: [OpenRouter — Tool calling](https://openrouter.ai/docs/guides/features/tool-calling)

---

## Tools

Tools are functions that an LLM can use to perform specific actions, like reading files or running commands.

By default, LLMs cannot access a user's environment — filesystem, terminal, etc. Claude Code provides tools (**Read**, **Write**, **Bash**) so the model can read and modify your codebase.

For this stage, you only **advertise** the Read tool. You'll implement it in later stages.

---

## Advertising tools

Advertising tools tells the model which tools are available and what arguments they accept.

Edit the existing request in `app/main.ts` and add a `tools` array:

```diff
 {
   "model": "...",
   "messages": [...],
+  "tools": [<tool1 spec>, <tool2 spec>, ...]
 }
```

### Read tool specification

```json
{
  "type": "function",
  "function": {
    "name": "Read",
    "description": "Read and return the contents of a file",
    "parameters": {
      "type": "object",
      "properties": {
        "file_path": {
          "type": "string",
          "description": "The path to the file to read"
        }
      },
      "required": ["file_path"]
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `type` | Always `"function"` for tools |
| `function.name` | Tool name (e.g. `"Read"`) |
| `function.description` | Helps the LLM decide when to use it |
| `function.parameters` | JSON Schema for arguments |
| `properties` | Each parameter (`file_path` here) |
| `required` | Mandatory parameter names |

---

## Solution shape

```typescript
const response = await client.chat.completions.create({
  model: "anthropic/claude-haiku-4.5",
  messages: [{ role: "user", content: prompt }],
  tools: [
    {
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
          required: ["file_path"],
        },
      },
    },
  ],
});
```

---

## Tests

The tester runs your program like this:

```bash
./your_program.sh -p "How many tools are available to you in this request? Number only."
```

Expected output:

```
1
```

The tester verifies:

- Your program outputs a **positive number**
- Your program exits with **exit code 0**

---

## Notes

- You can use any reasonable name for the Read tool (`Read`, `read`, `read_file`, `ReadFile`, etc.). The tester only checks the LLM's end-to-end response.
- This stage only **advertises** the tool — handling tool **calls** comes in later stages.

---

← [Back: Stage 2 — Advertise the Read Tool](Stage-2-Advertise-Read-Tool.md) · [Next: Stage 3 — Execute the Read Tool →](ReadMe.md#stages)
