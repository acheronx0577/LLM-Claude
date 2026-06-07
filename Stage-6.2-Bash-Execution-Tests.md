# Stage 6.2 — Bash Execution & Tests

← [Back: Stage 6.1 — Bash Tool Spec](Stage-6.1-Bash-Tool-Spec.md) · [Next: README — Core stages complete →](ReadMe.md#stages)

How to execute Bash tool calls inside the agent loop.

---

## Execution flow

When the model requests a Bash tool call:

1. **Parse arguments** — extract `command` from the JSON string
2. **Execute the command** — use your language's shell API (e.g. `child_process.exec()` in Node.js)
3. **Capture output** — collect both **stdout** and **stderr**
4. **Return to model** — append a tool message with the output (or an error message if it failed)

Example: command `rm README_old.md` → execute it → return empty string on success.

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": ""
}
```

Do **not** print command output to stdout. Only the model's **final** text response goes to stdout.

---

## Working directory

Execute commands in the **same directory as your program** — not a temp or different working directory.

---

## Tests

The tester creates three files:

- `app/main.js` — main project file
- `README.md` — current readme
- `README_old.md` — old readme to delete

Then runs:

```bash
./your_program.sh -p "Delete the old readme file."
```

Expected stdout:

```
Deleted README_old.md
```

The tester verifies:

- `README_old.md` has been **deleted** (no longer exists)
- `app/main.js` remains **intact** with original contents
- `README.md` remains **intact** with original contents
- Program exits with **code 0**

---

## Notes

- Bash results go **back to the model** as part of the agent loop.
- Include stderr in what you return when a command fails — the model needs error context.
- Flexible tool naming is OK — match what you advertise in `tools`.

---

← [Back: Stage 6.1 — Bash Tool Spec](Stage-6.1-Bash-Tool-Spec.md) · [Next: README — Core stages complete →](ReadMe.md#stages)
