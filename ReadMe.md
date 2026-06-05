[![progress-banner](https://backend.codecrafters.io/progress/claude-code/4ffc826f-4881-4e99-8d06-736a8109abb1)](https://app.codecrafters.io/users/acheronx0577?r=2qF)

# LLM Claude — TypeScript Implementation

A terminal-based AI coding assistant built for the [CodeCrafters Claude Code challenge](https://codecrafters.io/challenges/claude-code). Connects to an LLM via an OpenAI-compatible API, advertises Read/Write/Bash tools, and runs an agent loop until the task is complete.

## Documentation

Full challenge guide, stage walkthroughs, and setup notes live in **[docs/ReadMe.md](docs/ReadMe.md)**.

| Topic | Link |
|-------|------|
| Local setup | [docs/Local-Setup.md](docs/Local-Setup.md) |
| Environment variables | Copy `.env.example` to `.env` and add your API key |
| Stage 1 — LLM API | [docs/Stage-1-Communicate-with-LLM.md](docs/Stage-1-Communicate-with-LLM.md) |
| Stage 6 — Bash tool | [docs/Stage-6-Implement-Bash-Tool.md](docs/Stage-6-Implement-Bash-Tool.md) |

## Quick start

```powershell
bun install
copy .env.example .env   # paste OPENROUTER_API_KEY or GROQ_API_KEY
bun run app/main.ts -p "Hello"
```

Submit to CodeCrafters:

```sh
codecrafters submit
```

## Project layout

```
app/main.ts          # Agent loop + Read, Write, Bash tools
docs/                # Challenge documentation (stages, setup, references)
.codecrafters/       # CodeCrafters build scripts
your_program.sh      # Local runner
```
