# Stage 5.2 — Write Execution & Tests

← [Back: Stage 5.1 — Write Tool Spec](Stage-5.1-Write-Tool-Spec.md) · [Next: Stage 6 — Implement the Bash Tool →](ReadMe.md#stages)

How to execute Write tool calls inside the agent loop.

---

## Execution flow

When the model requests a Write tool call:

1. **Parse arguments** — extract `file_path` and `content` from the JSON string
2. **Write the file**
   - If the file **doesn't exist** → create it
   - If the file **exists** → overwrite with new content
3. **Append to messages** — add a tool result message (same pattern as Read):

```json
{
  "role": "tool",
  "tool_call_id": "call_xyz789",
  "content": "Successfully wrote to file"
}
```

Use a simple success message as `content` — the model needs confirmation, not the full file body.

Do **not** print write results to stdout. Only the model's **final** text response goes to stdout (agent loop behavior from Stage 4).

---

## Tests

The tester creates:

- `README.md` with instructions
- `app/` directory for the project

Then runs:

```bash
./your_program.sh -p "Read README.md and create the required file. File should have 1 line. Reply with 'Created the file'"
```

Expected stdout:

```
Created the file
```

The tester verifies:

- The **required file is created** with the correct contents
- Program exits with **exit code 0**

This requires the agent to Read the README, Write the new file, then reply with the final message.

---

## Notes

- Write runs inside the **agent loop** — the model may Read first, then Write, then respond.
- Flexible tool naming is OK (`Write`, `write_file`, etc.) — match what you advertise in `tools`.

---

← [Back: Stage 5.1 — Write Tool Spec](Stage-5.1-Write-Tool-Spec.md) · [Next: Stage 6 — Implement the Bash Tool →](ReadMe.md#stages)
