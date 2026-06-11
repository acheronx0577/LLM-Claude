# Stage 4 — Implement the Agent Loop

← [Back: Stage 3.2 — Read Execution](Stage-3.2-Read-Execution.md) · [Next: Stage 4.1 — Agent Loop Structure →](Stage-4.1-Agent-Loop-Structure.md)

**Status:** In progress · **Difficulty:** Medium

In this stage, you'll implement an **agent loop** that repeatedly sends messages to the model and handles tool calls until the final result is ready.

See **[Stage 4.1 — Agent Loop Structure](Stage-4.1-Agent-Loop-Structure.md)** for pseudocode and walkthrough, and **[Stage 4.2 — Loop Behavior & Tests](Stage-4.2-Loop-Behavior-Tests.md)** for output rules, tests, and notes.

---

## Your task

Replace the single-shot flow with a loop:

1. Send `messages` + tools to the LLM
2. Append the assistant response to `messages`
3. If no tool calls → print final `content` and exit
4. If tool calls → execute each tool, append `{ role: "tool", ... }` results to `messages`, repeat

**Important:** Do **not** print raw file contents when executing Read — send results back to the model instead (unlike Stage 3).

---

## How to pass this stage

### 1. Write code

Implement the agent loop in `app/main.ts`. See [Stage 4.1](Stage-4.1-Agent-Loop-Structure.md) and [Stage 4.2](Stage-4.2-Loop-Behavior-Tests.md).

### 2. Submit code

```bash
codecrafters submit
```

*Troubleshoot*

---

← [Back: Stage 3.2 — Read Execution](Stage-3.2-Read-Execution.md) · [Next: Stage 4.1 — Agent Loop Structure →](Stage-4.1-Agent-Loop-Structure.md)
