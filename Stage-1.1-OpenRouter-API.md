# Stage 1.1 — OpenRouter API Reference

← [Back: Stage 1 — Communicate with the LLM](Stage-1-Communicate-with-LLM.md) · [Next: Stage 2 — Advertise the Read Tool →](ReadMe.md#stages)

Reference for the API used in Stage 1. Official docs: [OpenRouter Chat Completions](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)

---

## Create a chat completion

OpenRouter's **Create a chat completion** endpoint uses the same shape as OpenAI's `/v1/chat/completions` API.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `https://openrouter.ai/api/v1/chat/completions` |
| **Auth** | `Authorization: Bearer <OPENROUTER_API_KEY>` |
| **Body** | `Content-Type: application/json` |

### Request body (minimum)

| Field | Required | Description |
|-------|----------|-------------|
| `model` | Yes | Model ID, e.g. `anthropic/claude-haiku-4.5` |
| `messages` | Yes | Conversation turns (`role` + `content`) |

```typescript
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "anthropic/claude-haiku-4.5",
    messages: [
      { role: "user", content: "Hello!" },
    ],
  }),
});

const data = await response.json();
// data.choices[0].message.content → model reply
```

### Response (success)

On `200 OK`, the model reply is in:

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "..."
      }
    }
  ]
}
```

Common errors: `401` (bad/missing API key), `402` (no credits), `429` (rate limit).

Full spec, optional fields (`temperature`, `max_tokens`, streaming, tools): [OpenRouter docs](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request) · [Markdown version](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request.md)

---

## Optional tips

Community suggestions — **keep the default model** in the original code for CodeCrafters tests. Changing it can cause backend test failures.

### Free models on OpenRouter

Set `local=true` in `.env` and switch models only when running locally:

```typescript
dotenv.config();

const isLocal = process.env.local === "true";

const model = isLocal
  ? "z-ai/glm-4.5-air:free"
  : "anthropic/claude-haiku-4.5";
```

```env
local=true
```

Browse free models: [openrouter.ai/models?q=free](https://openrouter.ai/models?q=free) — check [privacy settings](https://openrouter.ai/settings/privacy) before use.

### Run locally with Ollama

Point the OpenAI-compatible client at Ollama and override the model via env:

```env
OPENROUTER_BASE_URL=http://localhost:11434/v1
LOCAL_MODEL=qwen3:14b
```

```typescript
const model = process.env.LOCAL_MODEL ?? "anthropic/claude-haiku-4.5";
```

---

← [Back: Stage 1 — Communicate with the LLM](Stage-1-Communicate-with-LLM.md) · [Next: Stage 2 — Advertise the Read Tool →](ReadMe.md#stages)
