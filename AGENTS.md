# Ahri V3 Agent Operating Guide

This file is the source of truth for any AI agent or human maintainer changing
Ahri V3. Project-specific files such as `CLAUDE.md` and `GEMINI.md` may add
model context, but they must not contradict this guide.

## Quality Target

Ahri V3 must stay at an engineering quality level of 9+:

- Green quality gates before handoff.
- No runtime/private data tracked by Git.
- Shared contracts are the source of truth for frontend/backend integration.
- UI changes are componentized, testable, and responsive.
- Backend execution is request-scoped, async-safe, and observable.
- Security-sensitive surfaces are allowlisted and validated.

## Required Maintenance Command

Before finishing a non-trivial change, run:

```bash
npm run quality
```

For fast local iteration, run:

```bash
npm run quality:quick
```

The full gate runs type-check, lint, frontend tests, backend tests, npm audit,
production build, runtime-data tracking checks, and a maintainability hotspot
report.

## Git And Data Hygiene

- Never revert user changes unless explicitly asked.
- Never commit live DBs, vector stores, logs, caches, `.env`, or generated
  runtime data.
- Runtime data belongs under ignored paths such as `packages/backend/data/`.
- Version only code, tests, documentation, migrations, and intentional sample
  seed data.
- If persona seed data is needed, put sanitized examples in a dedicated seed
  folder and document how it is imported.

## Frontend Rules

- Keep feature files below 500 lines when feasible. If a file passes 700 lines,
  split it before adding more behavior.
- Prefer small feature slices:
  - `components/` for reusable UI.
  - `hooks/` for interaction/state orchestration.
  - `stores/` for shared state only.
  - `utils/` for pure helpers.
- Heavy libraries must be lazy, chunked, or registered narrowly.
- Chat rendering must avoid whole-list rerenders. Pass stable props, memoize
  expensive markdown/code blocks, and virtualize if message volume grows.
- Stores need tests when they hold async flows, token state, optimistic updates,
  or cross-feature behavior.
- The desktop app is the primary product. The web app must either compile and
  pass the same contract checks or be explicitly marked experimental.

## Backend Rules

- No mutable global LLM or model state for request behavior.
- Use dependency injection or request-scoped factories for clients and services.
- Long work such as memory analysis, RAG indexing, uploads, and compaction
  should move to background workers/queues as scale grows.
- HTTP and WebSocket chat paths should share orchestration code instead of
  duplicating business logic.
- Add tests for concurrency, cancellation, compaction, RAG lifecycle, settings,
  and auth regressions.
- Keep database timestamps centralized through `src.core.time.utc_now`.

## Contract Rules

- Shared TypeScript types in `packages/shared` are the frontend contract.
- Backend schema changes must update `packages/shared` in the same change.
- Avoid `any` on API boundaries. Use explicit request/response types.
- Prefer generated or OpenAPI-validated types as the next escalation step.

## Electron And Security Rules

- IPC must be minimal, allowlisted, and validated.
- File paths must use canonical resolution plus `path.relative` containment.
- External URLs must be restricted to allowed protocols and, when possible,
  explicit host allowlists.
- Shell/terminal features must avoid string-built command execution for user
  paths and must preserve sandbox assumptions.

## Refactor Policy

- Refactor in vertical slices that preserve behavior and keep gates green.
- Move pure helpers first, then components, then orchestration.
- Do not mix broad visual redesigns with backend behavior changes unless the
  feature requires it.
- Add tests around the behavior before or during risky rewrites.

## Handoff Checklist

- Explain what changed and why.
- List tests/checks run.
- Call out residual risks and next recommended slice.
- If a gate cannot run, say exactly which one and why.
