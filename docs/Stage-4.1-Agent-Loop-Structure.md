# Stage 4.1 — Agent Loop Structure

← [Back: Stage 4 — Implement the Agent Loop](Stage-4-Implement-Agent-Loop.md) · [Next: Stage 4.2 — Loop Behavior & Tests →](Stage-4.2-Loop-Behavior-Tests.md)

So far your program handles a **single interaction**: prompt → response → one tool → exit. That falls short for multi-step tasks (e.g. *"read a file and fix any bugs"*).

---

## Pseudocode

```
messages = [{ role: "user", content: prompt }]

loop:
    response = call_api(messages)
    append response message to messages

    if response has no tool_calls:
        print response.content
        exit

    for each tool_call in response.tool_calls:
        result = execute_tool(tool_call)
        append {
            role: "tool",
            tool_call_id: tool_call.id,
            content: result
        } to messages
```

---

## Walkthrough

### 1. Initialize the conversation

Store the user's prompt in a `messages` array that persists across iterations:

```json
[
  { "role": "user", "content": "Summarize the README for me." }
]
```

### 2. Enter the loop

Send `messages` and tool specs to the model inside a loop (same API call as before, but repeated).

### 3. Record the assistant's response

Append whatever the model returns. If it wants a tool, the message includes `tool_calls`:

```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "Read",
        "arguments": "{\"file_path\": \"README.md\"}"
      }
    }
  ]
}
```

### 4. Execute tool calls

If `tool_calls` is present:

**a.** Execute each requested tool — **do not print** results to stdout.

**b.** Append each result to `messages`. Every tool result must:

- Have `role: "tool"`
- Reference the matching `tool_call_id`
- Include the result as `content`

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "# My Project\n\nChemical expiry period: 6 months"
}
```

### 5. Repeat until complete

Continue the loop until the model responds **without** tool calls (`tool_calls` missing or empty). Then print the final `content` to stdout and exit.

You can also use `finish_reason: "stop"` from `choices[0]` as a stop signal.

---

← [Back: Stage 4 — Implement the Agent Loop](Stage-4-Implement-Agent-Loop.md) · [Next: Stage 4.2 — Loop Behavior & Tests →](Stage-4.2-Loop-Behavior-Tests.md)
