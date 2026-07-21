# Awakening Project

This repository contains the active implementation of Vireon CORE: the persistent relational intelligence and execution layer coordinated through Elora and technical work delegated to Nexora.

## Governing documents

Read these before changing architecture or runtime behavior:

1. [`CORE.md`](./CORE.md) — canonical CORE definition and Alpha acceptance threshold.
2. [`ELORA.md`](./ELORA.md) — Elora's executive and orchestration contract.
3. [`NEXORA.md`](./NEXORA.md) — Nexora's engineering work-order and execution contract.
4. [`AGENTS.md`](./AGENTS.md) — binding instructions for coding agents.
5. [`ROADMAP.md`](./ROADMAP.md) — current milestone order.
6. [`docs/STATUS.md`](./docs/STATUS.md) — current implementation inventory.
7. [`agent-runtime/docs/core-alpha-implementation-plan.md`](./agent-runtime/docs/core-alpha-implementation-plan.md) — supporting P0 implementation plan.

When older plans conflict with the governing documents above, the governing documents control.

## Repository layout

- `Elora-System/` — React operational console.
- `agent-runtime/` — Elora/Nexora SDK agents, memory, governance, tools, tasks, receipts, provider adapters, and runtime routes.
- `packages/shared/` — shared task, tool, and runtime event TypeScript contracts.
- `docs/` — active repository status and supporting documentation.
- `legacy/` — archived bridge services and older app snapshots retained for reference only. Do not extend these for new product work.

## Current objective

The active milestone is the CORE Alpha Sovereign Command Loop:

```text
intent
→ context assembly
→ authority decision
→ direct execution or bounded delegation
→ validation
→ receipt
→ candidate memory
→ Elora synthesis
```

The repository should prefer real, validated execution over plans, preview packets, or proposed patches when work is possible inside the configured trust envelope.

## Local environment files

Use the checked-in example files as safe local templates before starting the web shell or agent runtime:

1. Copy `agent-runtime/.env.example` to `agent-runtime/.env`.
2. Copy `Elora-System/.env.example` to `Elora-System/.env`.
3. Fill in only the keys needed for the current phase. Leave unused secrets blank.
4. Do not commit real `.env` files or local secret values.
5. Confirm `.gitignore` excludes `.env`, `.env.local`, and runtime data directories while allowing `.env.example` templates to be tracked.

## Common scripts

Run commands from the repository root after installing dependencies with `npm install`.

| Need | Command |
| --- | --- |
| Local development environment | `npm run dev` |
| Web app only | `npm run dev:web` or `npm run start:web` |
| Agent runtime only | `npm run dev:agent-runtime` |
| Type checks | `npm run typecheck` |
| Tests | `npm test` |
| Production build | `npm run build` |

The active backend is `agent-runtime/`. Archived servers and snapshots under `legacy/` are reference-only.
