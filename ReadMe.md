# Build Your Own Claude Code

← *Home* · [Next: Local Setup →](Local-Setup.md)

A hands-on challenge to build a **terminal-based AI coding assistant** that uses Large Language Models (LLMs) to understand code and complete programming tasks autonomously.

Tell it *"Refactor main.py to use a class"* — and watch it read the file, generate a new version, and apply the edit on its own.

---

## Table of Contents

- [What You'll Build](#what-youll-build)
- [What You'll Learn](#what-youll-learn)
- [Why Build This?](#why-build-this)
- [Prerequisites](#prerequisites)
- [Stages](#stages)
- [Advanced Features](#advanced-features-later)
- [Getting Started](#getting-started)
- [Local Setup](Local-Setup.md)
- [Stage 1 — Communicate with the LLM](Stage-1-Communicate-with-LLM.md)
- [Stage 1.1 — OpenRouter API Reference](Stage-1.1-OpenRouter-API.md)
- [Stage 2 — Advertise the Read Tool](Stage-2-Advertise-Read-Tool.md)
- [Stage 2.1 — Tools Reference](Stage-2.1-Tools-Reference.md)

---

## What You'll Build

You'll start with the **core of an AI agent**:

| Component | Description |
|-----------|-------------|
| **LLM connection** | Connect to an LLM via a REST API |
| **Tool definitions** | Define tools the AI can use to perform tasks |
| **Agent loop** | Implement think → act → observe until the task is done |

At this stage your assistant will feel alive — able to read files, generate edits, and apply changes without hand-holding.

As you progress, you'll add advanced capabilities (interactive mode, ACP, LSP, and more) until you have a **GitHub-ready project** to show off.

---

## What You'll Learn

### Core (Stages 1–7)

- How to communicate with LLMs using REST APIs
- How **tool calling** works under the hood (JSON schemas → actions)
- What an **agent loop** is and how to implement one
- How to safely execute system commands and file edits
- Managing conversation history and context windows

### Advanced

- Integrating the **Model Context Protocol (MCP)**
- Connecting to **LSP servers** for better code understanding
- Building **interactive TUIs**
- Adding **web search** capabilities
- Structuring and refactoring code as complexity grows

---

## Why Build This?

The industry is shifting from simple chatbots to **AI agents** that autonomously perform tasks. Building your own Claude Code is one of the best ways to understand that shift.

If you've ever wondered how tools like **GitHub Copilot** or **Cursor** read your codebase and apply changes — this challenge reveals the mechanics.

Beyond technical depth, there's something uniquely satisfying about understanding an AI tool used by millions of developers every day. You'll come out of it as a more confident and interesting developer.

---

## Prerequisites

- Comfortable writing code in **any one language**
- Comfortable using **Git**
- **No prior LLM or ML experience required** — you'll pick up concepts (agent loop, tool calling) as you go

What matters most: **curiosity and persistence**. This is not a follow-along tutorial — you'll explore, debug, and discover solutions yourself.

---

## Stages

Work through these stages in order. Each builds on the last.

| # | Stage | Difficulty | What You Do |
|---|-------|------------|-------------|
| 1 | **[Communicate with the LLM](Stage-1-Communicate-with-LLM.md)** | Very easy | Send prompts and receive responses via REST API |
| 1.1 | **[OpenRouter API Reference](Stage-1.1-OpenRouter-API.md)** | — | Endpoint, request/response, optional local/free model tips |
| 2 | **[Advertise the read tool](Stage-2-Advertise-Read-Tool.md)** | Easy | Expose a `read` tool schema so the model knows it exists |
| 2.1 | **[Tools reference](Stage-2.1-Tools-Reference.md)** | — | Tool concepts, Read schema, solution shape, tests |
| 3 | **Execute the read tool** | Easy | Handle tool calls and return file contents to the model |
| 4 | **Implement the agent loop** | Medium | Loop: model thinks → calls tools → observes results → repeats |
| 5 | **Implement the write tool** | Easy | Let the agent create and modify files |
| 6 | **Implement the bash tool** | Easy | Let the agent run shell commands safely |

### Architecture at a Glance

```
User prompt
    │
    ▼
┌─────────────┐     tool calls     ┌──────────────┐
│  Agent Loop │ ◄────────────────► │  LLM (API)   │
└─────────────┘                    └──────────────┘
    │
    ├── read   → read files
    ├── write  → edit files
    └── bash   → run commands
```

---

## Advanced Features (Later)

After the core stages, extend your assistant with:

- **Interactive mode** — REPL-style conversational sessions
- **ACP support** — Agent Client Protocol integration
- **LSP servers** — richer code intelligence (symbols, refs, diagnostics)
- **MCP** — plug in external tools and data sources
- **TUI** — polished terminal user interface
- **Web search** — fetch live information from the web

---

## Getting Started

> **Status:** Local setup complete — Stage 1 activated.

1. Complete **[Local Setup](Local-Setup.md)** (clone repo + CodeCrafters CLI)
2. Work through **[Stage 1: Communicate with the LLM](Stage-1-Communicate-with-LLM.md)**
3. Complete each stage before moving to the next
4. Commit your progress as you go

---

## License

TBD

---

← *Home* · [Next: Local Setup →](Local-Setup.md)
