# Ahri V3 — Roadmap

This is the public-facing roadmap for Ahri V3. It is intentionally lightweight: items here are directional, not committed deliveries.

For internal phase tracking and engineering rules, see [`AGENTS.md`](../AGENTS.md).
For deep architecture, see [`architecture.md`](./architecture.md).

---

## Near term

- Improve the multi-provider LLM abstraction so a new provider can be added with a single adapter file.
- Add encrypted-at-rest storage for local persona memory.
- Add import/export for personas (single archive: `persona.md` + lore + assets + theme entry).
- Document the extension/plugin surface in `packages/backend/src/engine/plugins/`.
- Add automated release builds for the Electron desktop app via `electron-builder`.
- Add demo screenshots to `docs/assets/screenshots/` and reference them from the README.

## Medium term

- Expand test coverage around memory orchestration and provider fallback.
- Voice input/output for the desktop client.
- Image generation through the existing provider abstraction.
- Browser extension surface that reuses the desktop store layer.
- API rate limiting per provider, with backpressure surfaced in the UI.

## Long term / aspirational

- Multi-user mode (current JWT design is intentionally single-user).
- Cloud sync of persona state (Supabase or similar) as an opt-in.
- Public analytics / observability dashboard for self-hosters.
- Custom persona creator that ships sanitized seed content separately from user-generated memory.

---

Anything in this list may be deprioritized or dropped. The repository is an experimental portfolio project.
