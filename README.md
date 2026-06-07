[![progress-banner](https://backend.codecrafters.io/progress/claude-code/4ffc826f-4881-4e99-8d06-736a8109abb1)](https://app.codecrafters.io/users/acheronx0577?r=2qF)

# LLM Claude — TypeScript Implementation

A terminal-based AI coding assistant built for the [CodeCrafters Claude Code challenge](https://codecrafters.io/challenges/claude-code). Connects to an LLM via an OpenAI-compatible API, runs an agent loop, and supports Read, Write, Bash, and WebSearch tools.

## Documentation

Full challenge guide, stage walkthroughs, and setup notes live in **[docs/ReadMe.md](docs/ReadMe.md)**.

| Topic | Link |
|-------|------|
| Local setup | [docs/Local-Setup.md](docs/Local-Setup.md) |
| Environment variables | Copy `.env.example` to `.env` |
| Stage 1 — LLM API | [docs/Stage-1-Communicate-with-LLM.md](docs/Stage-1-Communicate-with-LLM.md) |
| Stage 6 — Bash tool | [docs/Stage-6-Implement-Bash-Tool.md](docs/Stage-6-Implement-Bash-Tool.md) |

## Tools

| Tool | Purpose |
|------|---------|
| Read | Read file contents |
| Write | Create or overwrite files |
| Bash | Run shell commands in the project directory |
| WebSearch | Search the web (DuckDuckGo by default) |

Optional search APIs in `.env`: `TAVILY_API_KEY`, `BRAVE_SEARCH_API_KEY`.

## Quick start

```powershell
bun install
copy .env.example .env

# Interactive chat
.\run.ps1
# or: npm run chat

# Single prompt (CodeCrafters mode)
.\run.ps1 "Hello"
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

## Project layout

```
app/
  main.ts       # Entry point
  agent.ts      # Agent loop
  tools.ts      # Tool definitions and execution
  webSearch.ts  # Web search providers
  chat.ts       # Interactive REPL
  config.ts     # API key and model config
docs/           # Challenge documentation
run.ps1         # Windows runner (works without bun on PATH)
your_program.sh # Unix runner
```

## Scripts

```powershell
npm run chat      # Interactive session
npm run typecheck # TypeScript check
codecrafters submit
```
