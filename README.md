# Ahri V3

Experimental AI assistant platform built as a modular TypeScript monorepo with backend, desktop, and web packages. The backend is a FastAPI service that orchestrates multiple LLM providers behind a single contract. The desktop client is built on Electron and React; the web client is a React PWA; the `@ahri/shared` package holds the TypeScript types and API client that keep the two clients in sync.

## Status

Experimental portfolio project under active development. This repository is intended to demonstrate AI assistant architecture, monorepo organization, agent-oriented tooling, and a quality-gated development workflow. It is not a finished product, has not been security-audited, and should not be used with sensitive data.

## Overview

Ahri V3 explores how a modular AI assistant can be built and maintained at scale. It separates concerns across four packages:

- A Python FastAPI backend that abstracts over Google Gemini, OpenRouter (DeepSeek and others), and Ollama, exposes REST and WebSocket endpoints, and stores state in SQLite plus ChromaDB.
- An Electron desktop client and a React PWA web client that share types and API logic.
- A shared TypeScript package (`@ahri/shared`) that defines the contract both clients implement.
- A deterministic quality gate that runs type-checking, linting, tests, npm audit, duplication checks, and complexity reports as a single command.

The repository is organized as an npm workspace monorepo coordinated by Turbo.

## Goals

- Build a modular AI assistant architecture.
- Separate backend, desktop, web, and shared packages cleanly.
- Support configurable assistant behavior across multiple LLM providers.
- Keep provider-specific secrets outside the repository.
- Maintain a scalable TypeScript monorepo with shared contracts.
- Use deterministic quality checks instead of ad-hoc review.

## Current Features

Only listing what is actually implemented in this repository.

- npm workspace monorepo with four packages.
- Turbo task orchestration across `build`, `dev`, `lint`, `test`, `type-check`.
- FastAPI backend (`packages/backend`) with REST and WebSocket endpoints.
- Multi-provider LLM abstraction: Google Gemini, OpenRouter, Ollama (local).
- Persona system with per-persona theme, lore, and RAG documents.
- Three-layer memory: session, profile, and RAG (ChromaDB + `sentence-transformers`).
- JWT auth (single-user) with access and refresh tokens.
- WebSocket streaming for chat.
- Electron desktop client (`packages/desktop`) on Electron 41, React 19, Vite 6.
- React web client (`packages/web`) on React 19 and Vite 6.
- Shared TypeScript package (`packages/shared`) for types, themes, and API client.
- Deterministic quality gate (`scripts/quality/`) with file-metric, coverage, duplication, complexity, and audit collectors.
- GitHub Actions workflows for the quality gate and AI-assisted reviewers (`.github/workflows/`).

## Architecture

The repository is a TypeScript monorepo. Each package has a single responsibility:

- **`packages/backend`** — Python FastAPI service. Owns persona definitions, memory orchestration, LLM provider selection, and the HTTP/WebSocket API. SQLAlchemy 2.0 async over SQLite for relational data; ChromaDB for vector search.
- **`packages/desktop`** — Electron-wrapped React app. The primary product surface. Manages the backend process lifecycle, system tray, and IPC handlers for native integrations.
- **`packages/web`** — React app intended as a mobile-friendly PWA. Shares stores and API logic with the desktop client.
- **`packages/shared`** — TypeScript-only package. Exports request/response types, persona themes, and the `AhriApiClient` class that both clients use.

For the deep version, see [`docs/architecture.md`](./docs/architecture.md).

## Monorepo Structure

```
packages/
  backend/        Python FastAPI service (pyproject.toml + requirements.txt)
  desktop/        Electron + React 19 + Vite 6
  web/            React 19 + Vite 6 (PWA)
  shared/         @ahri/shared — types, themes, API client
scripts/
  quality-gate.mjs
  quality/        Quality-gate collectors, renderers, comparators
docs/
  architecture.md
  roadmap.md
  v3-vs-v2.md
  assets/screenshots/
  development/
    bug-report.md
    changelog.md
    persona-design-system.md
    ai-workflow/v4-engine-implementation-guide.md
.github/workflows/   Quality gate and AI-reviewer CI
data/                Personas (seed content tracked, runtime data ignored)
```

## Tech Stack

| Area | Technology |
|---|---|
| Languages | TypeScript 5.7, Python 3.11+ |
| Monorepo | npm workspaces, Turbo 2.3 |
| Backend | FastAPI 0.115, SQLAlchemy 2.0 async, Pydantic v2, ChromaDB, sentence-transformers |
| Desktop | Electron 41, React 19, Vite 6, Tailwind 3.4, Zustand 5 |
| Web | React 19, Vite 6, Tailwind 3.4, Zustand 5 |
| Shared | TypeScript, exported via `tsc` build |
| Testing | Vitest 4 (frontend), pytest + pytest-asyncio (backend) |
| Quality | ESLint 9, ruff, mypy, jscpd, custom quality gate |
| LLM providers | Google Gemini, OpenRouter (DeepSeek and others), Ollama |

Versions reflect what is currently pinned in `package.json` / `pyproject.toml`.

## Getting Started

Prerequisites:

- Node.js `>= 20`
- Python `>= 3.11`
- An API key for at least one LLM provider (Gemini is the default path).

Install:

```bash
# 1. Clone and install JavaScript workspaces
npm install

# 2. Install the Python backend in editable mode
cd packages/backend
pip install -e ".[dev]"
cd ../..

# 3. Configure environment
cp .env.example .env
# Edit .env: set AUTH_PASSWORD, JWT_SECRET, and at least one LLM key.
```

Run:

```bash
# Backend and desktop together
npm run dev:all

# Or individually
npm run dev:backend   # uvicorn on :8742
npm run dev:desktop   # Electron + Vite
npm run dev:web       # Vite dev server for the PWA
```

Build:

```bash
npm run build         # all packages via Turbo
```

The desktop installer is built per-package:

```bash
cd packages/desktop
npm run build
npm run build:electron   # NSIS installer in dist-electron/
```

## Environment Variables

Source of truth: [`.env.example`](./.env.example). Copy it to `.env` and fill in the values you need.

| Group | Variables | Required |
|---|---|---|
| LLM | `GEMINI_API_KEY_PAID`, `GEMINI_API_KEY_FREE`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL_NAME` | At least one Gemini key for the default path |
| Search | `CSE_API_KEY`, `CSE_CX`, `GOOGLE_API_KEY_SEARCH`, `GOOGLE_API_KEY_SEARCH_B` | Optional |
| Vision | `GOOGLE_API_KEY_VISION_A`, `GOOGLE_API_KEY_VISION_B` | Optional |
| Memory manager | `GOOGLE_API_KEY_MANAGER` | Optional |
| Spotify | `SPOTIPY_CLIENT_ID`, `SPOTIPY_CLIENT_SECRET`, `SPOTIPY_REDIRECT_URI` | Optional |
| Auth | `AUTH_PASSWORD`, `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`, `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | Required |
| Backend | `BACKEND_PORT`, `DATABASE_URL`, `CHROMA_PATH` | Defaults provided |
| Mobile access | `GH_TOKEN`, `GIST_ID` | Optional (Cloudflare tunnel helper) |

Rules:

- Never commit a populated `.env`.
- Never paste real keys into the README, issues, or PR descriptions.
- Rotate any key that ends up in a screenshot or log.

## Quality Workflow

The repository ships with a deterministic quality gate that runs the same checks locally as in CI.

| Command | Purpose |
|---|---|
| `npm run quality:quick` | Fast local feedback (subset of the full gate). |
| `npm run quality` | Full gate: type-check, lint, frontend + backend tests, npm audit, build, runtime-data tracking check, complexity hotspot report. |
| `npm run quality:strict` | Same as `quality`, but fails on oversized files. |
| `npm run quality:check` | Compares current metrics against the committed baseline. |
| `npm run quality:baseline` | Updates the baseline (use only when an intentional regression is accepted). |
| `npm run quality:report` | Renders the full quality report. |
| `npm run lint` | Lint all packages via Turbo. |
| `npm run type-check` | Type-check all packages via Turbo. |
| `npm run test` | Run all tests via Turbo. |

GitHub Actions workflows in `.github/workflows/` run the same gate on every push.

The detailed engineering rules the gate enforces are documented in [`AGENTS.md`](./AGENTS.md).

## Privacy and Security Notes

- API keys live in `.env` and must never be committed.
- Local persona memory (`data/personas/*/memory.json`, `data/personas/*/history/`) is git-ignored by default and may contain personal conversation data. Review before sharing logs.
- JWT authentication is intentionally single-user; the design does not currently isolate state per user.
- The project has not undergone an external security audit. Do not run it on shared infrastructure or expose the backend to the public internet without your own hardening review.

## Screenshots

Screenshots will live under [`docs/assets/screenshots/`](./docs/assets/screenshots/). The README will reference them once they exist.

## Limitations

- Experimental project. APIs and storage schema may change.
- Single-user by design. No multi-tenant isolation.
- Free-tier provider rate limits apply (Gemini has a 15k tokens-per-minute ceiling on the free tier).
- The web PWA may lag the desktop client in feature parity.
- Vision / browser / Spotify integrations require their respective provider keys or local installations.
- Not audited for production use.

## Roadmap

See [`docs/roadmap.md`](./docs/roadmap.md) for the public roadmap. High-level items:

- Tighten the multi-provider LLM abstraction.
- Encrypted-at-rest persona memory.
- Persona import/export.
- Automated Electron release builds.
- More tests around memory orchestration and provider fallback.

## My Role

Designed and built as a portfolio project focused on AI assistant architecture, TypeScript monorepo organization, persona-driven interaction design, and local-first agent tooling. The goal is to demonstrate end-to-end ownership: backend service design, multi-client coordination through a shared type package, and a CI-grade quality workflow that protects the codebase as it grows.

## License

[MIT](./LICENSE).
