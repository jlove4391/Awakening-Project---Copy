# Agent Runtime

Backend service for Elora agent execution. React consoles should render UI and stream events from this service instead of embedding command, model, memory, or task execution logic in components.

## Modules

- `src/agents/elora.ts` defines Elora's SDK agent, instructions, structured turn summary, model, and shared tools.
- `src/agents/nexora.ts` defines Nexora's SDK agent beside Elora and adds the gated code/VS Code tool group on top of the shared Google, CRM, Clay, leadgen, voice, memory, and delegation infrastructure.
- `src/tools/registry.ts` centralizes category-first tool definitions, JSON input schemas, required scopes, risk levels, approval flags, executor functions, audit metadata, SDK tool conversion, shared/Nexora tool selection, and the public tool manifest.
- `src/tools/codeTools.ts` implements Nexora's sandboxed workspace file, command, git, and VS Code URI actions.
- `src/audit/` writes JSONL tool audit records under the runtime data directory.
- `src/memory/` owns session records, memory references, task state, and SDK session persistence.
- `src/routes/chat.ts` streams chat runs as server-sent events.
- `src/routes/tools.ts` exposes registered tool categories and manifests for console inspection.
- `src/routes/tasks.ts` exposes task status and task mutation endpoints.

## Development

From the repository root:

```bash
npm install
npm run dev:agent-runtime
```

By default the service listens on `http://localhost:4317` and allows the React app at `http://localhost:3000`.

Set `OPENAI_API_KEY` to enable the SDK's `OpenAIConversationsSession`; otherwise the runtime uses the SDK `MemorySession` backed by local JSON records under `agent-runtime/.runtime-data/` for development.

The chat endpoint defaults to Elora. Pass `agent: "nexora"` in `POST /api/chat` to run the Nexora definition with the same session and memory store plus code/VS Code tools.


## Google Provider Adapters

Google Calendar, Gmail, Drive, and Sheets are wired through backend-only adapters under `src/providers/google/`. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and a 32+ character `GOOGLE_TOKEN_STORE_KEY` or `MASTER_KEY`; encrypted tokens are stored server-side in `AGENT_RUNTIME_DATA_DIR` by default and are never returned to the frontend.

OAuth endpoints:

- `GET /api/auth/google/start` returns the consent URL.
- `GET /api/auth/google/callback?code=...` exchanges the OAuth code and stores sanitized token metadata only in the response.
- `GET /api/auth/google/status` reports linked/scope/expiry metadata without access or refresh tokens.
- `DELETE /api/auth/google/tokens` removes the stored Google tokens.

### Local Google Calendar smoke path

1. Copy `agent-runtime/.env.example` to the runtime env file you use for local development (for example `agent-runtime/.env` or root `.env`, depending on where you start the runtime). Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and either `GOOGLE_TOKEN_STORE_KEY` or `MASTER_KEY`. Use `http://localhost:4317/api/auth/google/callback` as the local redirect URI unless you changed `AGENT_RUNTIME_PORT`.
2. Start the runtime with `npm run dev:agent-runtime`.
3. Open `GET http://localhost:4317/api/auth/google/start`, copy the returned `url`, complete Google consent, and let Google redirect to `GET /api/auth/google/callback`.
4. Confirm `GET http://localhost:4317/api/auth/google/status` returns `google.linked: true`.
5. Run `npm --workspace @awakening/agent-runtime run smoke:google-calendar`. The script calls `calendar.list_events` directly through the same registry execution path used by Elora, prints calendar events (or an empty `events` array), the latest execution receipt, and the matching tool-audit JSONL entry.
6. Confirm receipts are visible through `GET http://localhost:4317/api/executions?sessionId=local-google-calendar-smoke&limit=5`; `ExecutionReceiptsPanel` polls `/api/executions` and displays the same receipt in the web shell.
7. Confirm the audit entry exists at `${AGENT_RUNTIME_DATA_DIR:-agent-runtime/.runtime-data}/audit/tool-audit.jsonl`.

Optional smoke variables: `GOOGLE_CALENDAR_ID`, `SMOKE_SESSION_ID`, `SMOKE_TIME_MIN`, `SMOKE_TIME_MAX`, and `SMOKE_MAX_RESULTS`.

Read/list tools execute directly once OAuth is connected. Google write/send tools (`calendar.create_event`, `gmail.send_email`, `drive.create_text_file`, and `sheets.update_range`) are registered with `humanApprovalRequired: true` and fail closed until their input includes `confirmedByUser: true` after explicit user approval.

## Tool Registry

