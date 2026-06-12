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

## Local Elora Text Loop Smoke Test

Use the smoke-chat script to verify that the local Elora text loop can accept a chat request, stream the expected SSE lifecycle, and persist the session record. The script sends the default prompt `Hello Elora. Confirm the runtime loop is alive.` to `POST /api/chat` with `agent: "elora"`.

From the repository root, start the runtime and web shell in separate terminals:

```bash
npm run dev:agent-runtime
npm run dev:web
```

Then run the smoke test from a third terminal:

```bash
npm run smoke:chat
```

The script checks for `session`, `memory`, at least one `delta` frame or a usable `completed.finalOutput` payload, and `completed`. It also verifies that a session JSON file exists under `${AGENT_RUNTIME_DATA_DIR}/sessions/`, defaulting to `agent-runtime/.runtime-data/sessions/`. Set `AGENT_RUNTIME_URL`, `AGENT_RUNTIME_DATA_DIR`, or pass flags if your local runtime uses non-default locations:

```bash
AGENT_RUNTIME_URL=http://localhost:4317 AGENT_RUNTIME_DATA_DIR=/tmp/awakening-runtime npm run smoke:chat -- --timeout-ms 180000
```

The runtime must be configured with the same credentials you use for normal local chat runs, including `OPENAI_API_KEY` when the selected model/provider requires it.

## Manual Session Persistence Checklist

Use this short manual check when you need to confirm Elora can resume a conversation after the runtime process restarts. Do not add automated process management for this path unless a later task requires it.

- [ ] Start the runtime with the normal development command:

  ```bash
  npm run dev:agent-runtime
  ```

- [ ] Send a chat message to Elora that includes memorable context. The exact API endpoint is `POST http://localhost:4317/api/chat`, and the request body shape is:

  ```json
  {
    "agent": "elora",
    "message": "Hi ELORA, remember that my test phrase is blue lantern over Cedar Bay."
  }
  ```

- [ ] Save the returned `sessionId` from either the `session` SSE event or the final `completed` SSE event. Expected success criteria: the response streams server-sent events, includes a non-empty `sessionId`, and ends with a `completed` event for `agent: "elora"`.
- [ ] Stop the runtime process.
- [ ] Restart the runtime with `npm run dev:agent-runtime`.
- [ ] Send a new message using the saved `sessionId`. Use the same endpoint, `POST http://localhost:4317/api/chat`, with this request body shape:

  ```json
  {
    "agent": "elora",
    "sessionId": "<saved-session-id>",
    "message": "What memorable test phrase did I ask you to remember?"
  }
  ```

- [ ] Confirm ELORA references the prior context. Expected success criteria: the response streams to `completed`, the `completed.sessionId` matches the saved `sessionId`, and the answer mentions the prior phrase, such as `blue lantern over Cedar Bay`.


## Google Provider Adapters

Google Calendar, Gmail, Drive, and Sheets are wired through backend-only adapters under `src/providers/google/`. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and a 32+ character `GOOGLE_TOKEN_STORE_KEY` or `MASTER_KEY`; encrypted tokens are stored server-side in `AGENT_RUNTIME_DATA_DIR` by default and are never returned to the frontend. See `docs/google-oauth.md` for the focused local OAuth verification flow, status check, optional `GOOGLE_TOKEN_STORE_PATH`, and troubleshooting for token-store key or disconnected-account errors.

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

