# Stage 3 — Execute the Read Tool

← [Back: Stage 2.1 — Tools Reference](Stage-2.1-Tools-Reference.md) · [Next: Stage 3.1 — Tool Calls Response →](Stage-3.1-Tool-Calls-Reference.md)

**Status:** In progress · **Difficulty:** Easy

In this stage, you'll add support for **detecting tool calls** and **executing the Read tool**.

See **[Stage 3.1 — Tool Calls Response](Stage-3.1-Tool-Calls-Reference.md)** for the response shape and **[Stage 3.2 — Read Execution](Stage-3.2-Read-Execution.md)** for execution steps, tests, and notes.

---

## Your task

When the LLM returns a `tool_calls` array, parse the Read call, read the file from disk, and print the raw contents to stdout.

If there is **no** `tool_calls` array, print the message `content` as before.

---

## How to pass this stage

### 1. Write code

Implement tool call detection and Read execution in `app/main.ts`. See [Stage 3.1](Stage-3.1-Tool-Calls-Reference.md) and [Stage 3.2](Stage-3.2-Read-Execution.md).

### 2. Submit code

```bash
codecrafters submit
```

*Troubleshoot*

---

← [Back: Stage 2.1 — Tools Reference](Stage-2.1-Tools-Reference.md) · [Next: Stage 3.1 — Tool Calls Response →](Stage-3.1-Tool-Calls-Reference.md)
