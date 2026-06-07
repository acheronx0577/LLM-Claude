# Stage 4.2 — Loop Behavior & Tests

← [Back: Stage 4.1 — Agent Loop Structure](Stage-4.1-Agent-Loop-Structure.md) · [Next: Stage 5 — Implement the Write Tool →](Stage-5-Implement-Write-Tool.md)

Output rules, test expectations, and key differences from Stage 3.

---

## Output rules

| When | stdout | stderr |
|------|--------|--------|
| Tool execution (Read, etc.) | **Nothing** — send result to model via `messages` | OK for debug logs |
| Final answer (no tool calls) | Print `message.content` | OK for debug logs |

**Do not print raw file contents** when executing Read. This differs from Stage 3, where Read output went directly to stdout.

---

## Tests

The tester creates a Python project with:

- `README.md`
- Two Python files in `app/` with randomized names

Then runs:

```bash
./your_program.sh -p "Use README.md to determine the chemical expiry period in months. Number only."
```

Expected output:

```
<expiry period in months>
```

The tester verifies:

- Output is the **correct expiry period**
- Program exits with **exit code 0**

This requires the agent to **read** the README, **reason** over the content, and **respond** with the final number — multiple loop iterations.

---

## Notes

- Tool results go **back to the model** in the agent loop, not to stdout.
- Print to **stdout** only when the final result is ready.
- Debug output can go to **stderr**.
- `finish_reason: "stop"` on the first choice is another valid loop-exit signal.

---

← [Back: Stage 4.1 — Agent Loop Structure](Stage-4.1-Agent-Loop-Structure.md) · [Next: Stage 5 — Implement the Write Tool →](Stage-5-Implement-Write-Tool.md)
