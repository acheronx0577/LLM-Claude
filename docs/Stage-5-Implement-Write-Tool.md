# Stage 5 — Implement the Write Tool

← [Back: Stage 4.2 — Loop Behavior & Tests](Stage-4.2-Loop-Behavior-Tests.md) · [Next: Stage 5.1 — Write Tool Spec →](Stage-5.1-Write-Tool-Spec.md)

**Status:** In progress · **Difficulty:** Easy

In this stage, you'll add support for the **Write tool** — advertise it in your request and execute it inside the agent loop.

See **[Stage 5.1 — Write Tool Spec](Stage-5.1-Write-Tool-Spec.md)** for the tool schema and **[Stage 5.2 — Write Execution & Tests](Stage-5.2-Write-Execution-Tests.md)** for execution steps and test details.

---

## Your task

1. Add the Write tool to your `tools` array (alongside Read)
2. Handle Write tool calls in your agent loop — write `content` to `file_path`
3. Append the result as a `{ role: "tool", ... }` message (same as Read)

---

## How to pass this stage

### 1. Write code

Implement Write in `app/main.ts`. See [Stage 5.1](Stage-5.1-Write-Tool-Spec.md) and [Stage 5.2](Stage-5.2-Write-Execution-Tests.md).

### 2. Submit code

```bash
codecrafters submit
```

*Troubleshoot*

---

← [Back: Stage 4.2 — Loop Behavior & Tests](Stage-4.2-Loop-Behavior-Tests.md) · [Next: Stage 5.1 — Write Tool Spec →](Stage-5.1-Write-Tool-Spec.md)
