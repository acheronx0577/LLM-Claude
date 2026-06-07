# Stage 6 — Implement the Bash Tool

← [Back: Stage 5.2 — Write Execution & Tests](Stage-5.2-Write-Execution-Tests.md) · [Next: Stage 6.1 — Bash Tool Spec →](Stage-6.1-Bash-Tool-Spec.md)

**Status:** In progress · **Difficulty:** Easy

In this stage, you'll add support for the **Bash tool** — advertise it in your request and execute shell commands when the model requests them.

See **[Stage 6.1 — Bash Tool Spec](Stage-6.1-Bash-Tool-Spec.md)** for the tool schema and **[Stage 6.2 — Bash Execution & Tests](Stage-6.2-Bash-Execution-Tests.md)** for execution steps and test details.

---

## Your task

1. Add the Bash tool to your `tools` array (alongside Read and Write)
2. Handle Bash tool calls in your agent loop — run `command`, capture stdout/stderr
3. Return output (or error message) to the model as a `{ role: "tool", ... }` message

---

## How to pass this stage

### 1. Write code

Implement Bash in `app/main.ts`. See [Stage 6.1](Stage-6.1-Bash-Tool-Spec.md) and [Stage 6.2](Stage-6.2-Bash-Execution-Tests.md).

### 2. Submit code

```bash
codecrafters submit
```

*Troubleshoot*

---

← [Back: Stage 5.2 — Write Execution & Tests](Stage-5.2-Write-Execution-Tests.md) · [Next: Stage 6.1 — Bash Tool Spec →](Stage-6.1-Bash-Tool-Spec.md)
