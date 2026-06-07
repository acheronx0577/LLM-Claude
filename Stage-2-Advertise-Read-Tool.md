# Stage 2 — Advertise the Read Tool

← [Back: Stage 1.1 — OpenRouter API Reference](Stage-1.1-OpenRouter-API.md) · [Next: Stage 2.1 — Tools Reference →](Stage-2.1-Tools-Reference.md)

**Status:** In progress · **Difficulty:** Easy

In this stage, you'll add support for **advertising the Read tool** in the chat completion request.

See **[Stage 2.1 — Tools Reference](Stage-2.1-Tools-Reference.md)** for tool concepts, the Read tool schema, solution code, and test details.

---

## Your task

Unlike Stage 1, there is **no commented solution** in the repo. Write the code yourself.

Add a `tools` array to your `client.chat.completions.create()` call in `app/main.ts` so the model knows the Read tool exists.

---

## How to pass this stage

### 1. Write code

Add the Read tool specification to the request. See [Stage 2.1](Stage-2.1-Tools-Reference.md) for the full schema and TypeScript example.

### 2. Submit code

```bash
codecrafters submit
```

*Troubleshoot*

---

← [Back: Stage 1.1 — OpenRouter API Reference](Stage-1.1-OpenRouter-API.md) · [Next: Stage 2.1 — Tools Reference →](Stage-2.1-Tools-Reference.md)
