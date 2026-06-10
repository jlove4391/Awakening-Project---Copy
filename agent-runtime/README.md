# Agent Runtime

Backend service for Elora agent execution. React consoles should render UI and stream events from this service instead of embedding command, model, memory, or task execution logic in components.

## Modules

- `src/agents/elora.ts` defines Elora's SDK agent, instructions, structured turn summary, model, and tools.
- `src/tools/registry.ts` centralizes category-first tool definitions, JSON input schemas, required scopes, risk levels, approval flags, executor functions, audit metadata, SDK tool conversion, and the public tool manifest.
- `src/memory/` owns session records, memory references, task state, and SDK session persistence.
- `src/routes/chat.ts` streams chat runs as server-sent events.
- `src/routes/tools.ts` exposes registered tool categories and manifests for console inspection.
- `src/routes/tasks.ts` exposes task status and task mutation endpoints.

## Development

```bash
npm install
npm run dev
```

By default the service listens on `http://localhost:4317` and allows the React app at `http://localhost:3000`.

Set `OPENAI_API_KEY` to enable the SDK's `OpenAIConversationsSession`; otherwise the runtime uses the SDK `MemorySession` backed by local JSON records under `.runtime-data/` for development.


## Google Provider Adapters

Google Calendar, Gmail, Drive, and Sheets are wired through backend-only adapters under `src/providers/google/`. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and a 32+ character `GOOGLE_TOKEN_STORE_KEY` or `MASTER_KEY`; encrypted tokens are stored server-side in `AGENT_RUNTIME_DATA_DIR` by default and are never returned to the frontend.

OAuth endpoints:

- `GET /api/auth/google/start` returns the consent URL.
- `GET /api/auth/google/callback?code=...` exchanges the OAuth code and stores sanitized token metadata only in the response.
- `GET /api/auth/google/status` reports linked/scope/expiry metadata without access or refresh tokens.
- `DELETE /api/auth/google/tokens` removes the stored Google tokens.

Read/list tools execute directly once OAuth is connected. Google write/send tools (`calendar.create_event`, `gmail.send_email`, `drive.create_text_file`, and `sheets.update_range`) are registered with `humanApprovalRequired: true` and fail closed until their input includes `confirmedByUser: true` after explicit user approval.

## Tool Registry

The runtime now registers tools by capability category instead of calling providers directly from agent logic. Initial namespaces are `calendar.*`, `gmail.*`, `drive.*`, `sheets.*`, `crm.*`, `clay.*`, `leadgen.*`, `voice.*`, `memory.*`, and `delegation.*`. Each registry entry carries its JSON input schema, required OAuth/provider scopes, risk level, human-approval requirement, executor, and audit-log metadata. Google provider-backed entries now use the backend adapters under `src/providers/google/`; other provider-backed entries continue to fail closed with `provider_not_configured` until their adapters are wired. The archived AuthBridge and Elora integrations should remain references only when rebuilding adapters.
