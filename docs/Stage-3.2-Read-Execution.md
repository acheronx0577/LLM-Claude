# Stage 3.2 — Read Execution

← [Back: Stage 3.1 — Tool Calls Response](Stage-3.1-Tool-Calls-Reference.md) · [Next: Stage 4 — Implement the Agent Loop →](Stage-4-Implement-Agent-Loop.md)

How to execute the Read tool and handle output in Stage 3.

---

## Execution flow

When you detect a `tool_calls` array in the response:

1. **Extract the tool call** — get `choices[0].message`, then the first entry in `tool_calls`
2. **Parse the function name** — determine which tool to run
3. **Parse the arguments** — `JSON.parse()` the `arguments` string
4. **Execute the tool** — read the file at `file_path` using your filesystem library
5. **Output the result** — print raw file contents to stdout (no labels or formatting)

---

## Output rules

| Response | What to print |
|----------|---------------|
| Has `tool_calls` | Raw file contents from the Read execution |
| No `tool_calls` | The message `content` (same as earlier stages) |

In earlier stages you always printed `message.content`. Now only print `content` when there is **no** `tool_calls` array.

---

## Tests

The tester creates a file (e.g. `apple.py`) and runs:

```bash
./your_program.sh -p "What is the content of apple.py? Print exact file contents without backticks."
```

Expected output:

```
<file contents>
```

The tester verifies:

- When the LLM requests a Read tool call → output matches **exact file contents**
- When the LLM does not request a tool call → output is the LLM's **text response**
- Program exits with **code 0**

---

## Notes

- In later stages, you'll send tool results **back to the model** as part of the agent loop instead of printing them.
- This stage only handles the **first** tool call. Multiple tool calls come later.

---

← [Back: Stage 3.1 — Tool Calls Response](Stage-3.1-Tool-Calls-Reference.md) · [Next: Stage 4 — Implement the Agent Loop →](Stage-4-Implement-Agent-Loop.md)
