<p align="center">
  <a href="https://app.codecrafters.io/users/acheronx0577?r=2qF">
    <img src="https://backend.codecrafters.io/progress/claude-code/4ffc826f-4881-4e99-8d06-736a8109abb1" alt="progress-banner" />
  </a>
  &nbsp;&nbsp;
  <img src="https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2Facheronx0577%2FLLM-Claude&count_bg=%23F16A34&title_bg=%23555555&title=Project+Views" alt="Project Views" />
</p>


<p align="center">
  <a href="https://github.com/acheronx0577/LLM-Claude/blob/main/docs/Pics/animated_1080P.gif">
    <img src="https://github.com/acheronx0577/LLM-Claude/raw/main/docs/Pics/animated_1080P.gif" alt="Interactive TUI demo" width="960" />
  </a>
</p>

# LLM Claude — TypeScript Implementation

A terminal-based AI coding assistant built for the [CodeCrafters Claude Code challenge](https://codecrafters.io/challenges/claude-code), featuring ACP editor integration and TypeScript LSP tools. Connects to an LLM via an OpenAI-compatible API, runs an agent loop, and supports Read, Write, and Bash tools (CodeCrafters).

## Tech stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (ES modules) |
| Runtime | [Bun](https://bun.sh) locally · Node-compatible APIs |
| LLM client | [OpenAI SDK](https://github.com/openai/openai-node) → [Groq](https://groq.com) or [OpenRouter](https://openrouter.ai) |
| Agent protocols | [ACP](https://agentclientprotocol.com) (`@agentclientprotocol/sdk`) · [MCP](https://modelcontextprotocol.io) (`@modelcontextprotocol/sdk`) |
| Code intelligence | TypeScript compiler API (`typescript`) — definitions, references, diagnostics |
| Terminal UI | Custom ANSI TUI (alt screen, box drawing, slash commands) |
| Validation | Zod |
| Web search | DuckDuckGo (default) · optional Tavily / Brave APIs |
| Tooling | `tsc` typecheck · CodeCrafters CLI for submit |
| Platforms | Windows (`run.ps1`) · Unix (`your_program.sh`) |

## Run modes

| Mode | Command | Tools |
|------|---------|-------|
| CodeCrafters submit | `.\run.ps1 -p "prompt"` | Read, Write, Bash |
| Interactive chat | `.\run.ps1` or `npm run chat` | TUI with mascot + input box (use `--plain` for classic) |
| ACP server | `npm run acp` or `.\run.ps1 -Acp` | Read, Write, Bash via editor |

## Documentation

Full challenge guide, stage walkthroughs, and setup notes live in **[docs/ReadMe.md](docs/ReadMe.md)**.

| Topic | Link |
|-------|------|
| Local setup | [docs/Local-Setup.md](docs/Local-Setup.md) |
| Environment variables | Copy `.env.example` to `.env` |
| Stage 1 — LLM API | [docs/Stage-1-Communicate-with-LLM.md](docs/Stage-1-Communicate-with-LLM.md) |
| Stage 6 — Bash tool | [docs/Stage-6-Implement-Bash-Tool.md](docs/Stage-6-Implement-Bash-Tool.md) |

## Tools

| Tool | Purpose | Mode |
|------|---------|------|
| Read | Read file contents | Submit + chat |
| Write | Create or overwrite files | Submit + chat |
| Edit | Replace a unique string in an existing file | Chat only |
| Bash | Run shell commands in the project directory | Submit + chat |
| WebSearch | Search the web (DuckDuckGo by default) | Chat only |
| GoToDefinition | Jump to symbol definition (TypeScript) | Chat only |
| FindReferences | Find all usages of a symbol (TypeScript) | Chat only |
| GetDiagnostics | TypeScript errors and warnings | Chat only |

**Interactive TUI (default in a real terminal):** Claude Code–style dashboard with orange border, welcome panel + pixel mascot, tips, recent activity, `>` prompt, and `/` slash-command menu. Use `--plain` for classic chat.

**ACP mode** (`--acp`): speak the [Agent Client Protocol](https://agentclientprotocol.com) over stdio so editors like Zed can drive the agent. Uses the client's file system and terminal APIs for Read, Write, and Bash.

Optional search APIs in `.env`: `TAVILY_API_KEY`, `BRAVE_SEARCH_API_KEY`.

**MCP (chat only):** copy `mcp.json.example` to `mcp.json` and list MCP servers to spawn over stdio. Tools appear as `mcp_<server>_<tool>` (e.g. fetch, filesystem, databases). Set `MCP_CONFIG` to use a different config path. Not loaded in CodeCrafters submit mode.

## Scope vs real Claude Code

This repo is the [CodeCrafters challenge](https://codecrafters.io/challenges/claude-code) — a **smaller, intentional subset** of what production Claude Code provides. The goal is to learn the agent loop and core tool calling, not to replicate every tool in Anthropic’s product.

| In this project | Real Claude Code also has (not implemented here) |
|-----------------|--------------------------------------------------|
| Read, Write, Bash | **Glob**, **Grep**, **Task** (subagents), NotebookEdit, etc. |
| Edit + review flow (chat) | Richer edit/diff UX, plan mode, hooks |
| WebSearch, LSP tools (chat) | Built-in search, IDE-native navigation |
| ACP server (local) | Full desktop/CLI product, MCP marketplace |

**CodeCrafters submit** only exercises Read, Write, and Bash. Everything else is optional local enhancement.

## Quick start

```powershell
bun install
copy .env.example .env

# Interactive chat
.\run.ps1
# or: npm run chat

# Single prompt (CodeCrafters mode)
.\run.ps1 "Hello"

# ACP server (for Zed and other ACP clients)
npm run acp
# or: .\run.ps1 -Acp
```

Submit to CodeCrafters:

```sh
codecrafters submit
```

## Environment

| Variable | Required | Notes |
|----------|----------|-------|
| `GROQ_API_KEY` | Local (Groq) | Use with `GROQ_MODEL=openai/gpt-oss-120b` for tools |
| `OPENROUTER_API_KEY` | CodeCrafters submit | Injected automatically on submit |
| `TAVILY_API_KEY` | Optional | Better web search |
| `MCP_CONFIG` | Optional | Path to MCP server config (default `mcp.json`) |
| `MCP_DISABLE` | Optional | Set to `1` to skip MCP loading in chat |

## Project layout

```
app/
  main.ts       # Entry point (-p submit, -i chat)
  agent.ts      # Agent loop and history trimming
  tools.ts      # Tool specs and execution
  editTools.ts  # Partial file edits (string replace)
  editApproval.ts # Review / Accept all / Decline prompts in chat
  lspTools.ts   # TypeScript definition, references, diagnostics
  webSearch.ts  # Web search providers
  chat.ts       # Interactive REPL (plain mode)
  tuiChat.ts    # Interactive TUI orchestration
  tui/          # Claude Code–style dashboard, slash commands, prompt
  acp.ts        # Agent Client Protocol server
  mcp.ts        # MCP client — external tools via stdio servers
  config.ts     # API key and model config
  toolResult.ts # Shared tool output truncation
  chatShared.ts # Exit commands, headers, shared error text
docs/           # Challenge documentation
mcp.json.example # Sample MCP server config (copy to mcp.json)
run.ps1         # Windows runner (works without bun on PATH)
your_program.sh # Unix runner
```

Chat mode trims older turns when history exceeds ~48k characters to reduce Groq token-limit errors. **Write** and **Edit** prompt for approval first (`[r]` Review to see `+/-` stats and jump to `file:line`, then `[y]`/`[a]`/`[d]`).

## Scripts

```powershell
npm run chat      # Interactive session
npm run acp       # ACP server on stdio
npm run typecheck # TypeScript check
codecrafters submit
```
