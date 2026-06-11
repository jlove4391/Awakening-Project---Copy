# Awakening Project

This repository uses one clean layout before adding new runtime features:

- `Elora-System/` — React visual shell.
- `agent-runtime/` — Elora/Nexora SDK agents, provider adapters, tools, task routes, and voice routes.
- `packages/shared/` — shared task, tool, and runtime event TypeScript contracts.
- `legacy/` — archived bridge services and older app snapshots retained for reference only.


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
| Local development environment (web + runtime) | `npm run dev` |
| Web app only | `npm run dev:web` or `npm run start:web` |
| Agent runtime only | `npm run dev:agent-runtime` |
| Type checks | `npm run typecheck` |
| Tests | `npm test` |
| Production build | `npm run build` |

The active backend is `agent-runtime/`. Archived bridge servers under `legacy/` should not be extended for new features.
