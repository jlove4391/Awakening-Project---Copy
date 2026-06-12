# Phase 1 Stabilization Checklist

This document is the documentation-only gate for Phase 1 stabilization. It links each required check to the exact command or runtime API endpoint that verifies it.

## Prerequisites

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Start the agent runtime from the repository root before running endpoint-based checks:

   ```bash
   npm run dev:agent-runtime
   ```

   The default runtime base URL is `http://localhost:4317`.

3. For Google checks, configure the runtime with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and either `GOOGLE_TOKEN_STORE_KEY` or `MASTER_KEY`. Use `http://localhost:4317/api/auth/google/callback` as the local redirect URI unless `AGENT_RUNTIME_PORT` is changed.

## Required checks

### 1. ELORA chat smoke test passes

- Exact command:

  ```bash
  npm run smoke:chat
  ```

- Workspace command equivalent:

  ```bash
  npm --workspace @awakening/agent-runtime run smoke:chat
  ```

- Exact API endpoint exercised by the smoke script: [`POST /api/chat`](../src/routes/chat.ts).
- Default smoke request target: `POST http://localhost:4317/api/chat` with `agent: "elora"`.
- Passing criteria:
  - The response is an SSE stream.
  - The stream includes `session`, `memory`, and `completed` events.
  - The stream includes at least one `delta` event or a usable `completed.finalOutput` payload.
  - A session JSON file exists under `${AGENT_RUNTIME_DATA_DIR:-agent-runtime/.runtime-data}/sessions/`.

Optional override example:

```bash
AGENT_RUNTIME_URL=http://localhost:4317 AGENT_RUNTIME_DATA_DIR=/tmp/awakening-runtime npm run smoke:chat -- --timeout-ms 180000
```

### 2. Voice smoke test passes

- Exact command:

  ```bash
  npm --workspace @awakening/agent-runtime run smoke:voice
  ```

- Package-local equivalent from `agent-runtime/`:

  ```bash
  npm run smoke:voice
  ```

- Exact API endpoints covered by the voice runtime surface:
  - [`GET /api/voice/config`](../src/routes/voice.ts)
  - [`POST /api/voice/sessions`](../src/routes/voice.ts)
  - [`GET /api/voice/sessions/:voiceSessionId`](../src/routes/voice.ts)
  - [`POST /api/voice/transcriptions`](../src/routes/voice.ts)
  - [`POST /api/voice/speech`](../src/routes/voice.ts)
  - [`POST /api/voice/calls`](../src/routes/voice.ts)
  - [`POST /api/voice/calls/inbound`](../src/routes/voice.ts)
  - [`POST /api/voice/calls/missed`](../src/routes/voice.ts)
  - [`POST /api/voice/calls/missed/callback`](../src/routes/voice.ts)
  - [`POST /api/voice/telephony/inbound`](../src/routes/voice.ts)
  - [`POST /api/voice/telephony/inbound/json`](../src/routes/voice.ts)
  - [`POST /api/voice/telephony/missed`](../src/routes/voice.ts)
  - [`POST /api/voice/telephony/outbound-answer`](../src/routes/voice.ts)
  - [`POST /api/voice/meetings`](../src/routes/voice.ts)
  - [`POST /api/voice/meetings/:voiceSessionId/transcript`](../src/routes/voice.ts)
  - [`POST /api/voice/meetings/:voiceSessionId/speaking-consent`](../src/routes/voice.ts)
  - [`POST /api/voice/meetings/:voiceSessionId/adapter-status`](../src/routes/voice.ts)
  - [`POST /api/voice/sessions/:voiceSessionId/transcript`](../src/routes/voice.ts)
  - [`POST /api/voice/sessions/:voiceSessionId/summary`](../src/routes/voice.ts)
- Passing criteria:
  - The smoke command prints `voice smoke passed`.
  - Browser voice transcription and speech synthesis paths complete.
  - Phone-call and meeting flows require approval when appropriate.
  - Voice policy locks high-risk code tools for phone-call context.
  - Telephony readiness gates fail closed when required readiness flags are disabled.

### 3. Google Calendar smoke test passes

- Exact command:

  ```bash
  npm --workspace @awakening/agent-runtime run smoke:google-calendar
  ```

- Package-local equivalent from `agent-runtime/`:

  ```bash
  npm run smoke:google-calendar
  ```

- Exact provider action exercised by the smoke script: `calendar.list_events`.
- Exact receipt endpoint for smoke verification: [`GET /api/executions?sessionId=local-google-calendar-smoke&limit=5`](../src/routes/executions.ts).
- Expected audit file: `${AGENT_RUNTIME_DATA_DIR:-agent-runtime/.runtime-data}/audit/tool-audit.jsonl`.
- Passing criteria:
  - Google OAuth status is linked before the script runs.
  - The script prints JSON with `ok: true`.
  - The JSON includes the Calendar result, latest execution receipt, audit log path, and matching audit entry.
  - `GET http://localhost:4317/api/executions?sessionId=local-google-calendar-smoke&limit=5` returns a `calendar.list_events` execution record.

Optional smoke variables:

```bash
GOOGLE_CALENDAR_ID=primary \
SMOKE_SESSION_ID=local-google-calendar-smoke \
SMOKE_MAX_RESULTS=10 \
npm --workspace @awakening/agent-runtime run smoke:google-calendar
```

### 4. Same `sessionId` retains relevant memory after runtime restart

- Exact API endpoint: [`POST /api/chat`](../src/routes/chat.ts).
- Step 1 request before restart:

  ```bash
  curl -N http://localhost:4317/api/chat \
    -H 'Accept: text/event-stream' \
    -H 'Content-Type: application/json' \
    -d '{"agent":"elora","message":"Hi ELORA, remember that my Phase 1 test phrase is blue lantern over Cedar Bay."}'
  ```

- Save the `sessionId` from the `session` SSE event or final `completed` SSE event.
- Restart the runtime:

  ```bash
  npm run dev:agent-runtime
  ```

- Step 2 request after restart, using the saved `sessionId`:

  ```bash
  curl -N http://localhost:4317/api/chat \
    -H 'Accept: text/event-stream' \
    -H 'Content-Type: application/json' \
    -d '{"agent":"elora","sessionId":"<saved-session-id>","message":"What Phase 1 test phrase did I ask you to remember?"}'
  ```

- Passing criteria:
  - Both calls stream to `completed`.
  - The second `completed.sessionId` matches `<saved-session-id>`.
  - ELORA references the remembered phrase, for example `blue lantern over Cedar Bay`.

### 5. Google OAuth `/start` and `/status` work

- Exact `/start` endpoint: [`GET /api/auth/google/start`](../src/providers/google/auth.ts).
- Exact command:

  ```bash
  curl http://localhost:4317/api/auth/google/start
  ```

- Passing criteria for `/start`:
  - The response includes a Google consent `url`.
  - Opening the URL completes consent and redirects to `GET /api/auth/google/callback`.

- Exact `/status` endpoint: [`GET /api/auth/google/status`](../src/providers/google/auth.ts).
- Exact command:

  ```bash
  curl http://localhost:4317/api/auth/google/status
  ```

- Passing criteria for `/status` after consent:
  - The response contains `ok: true`.
  - The response contains `google.linked: true`.
  - The response does not expose access or refresh tokens.

### 6. Calendar write action requests approval before execution

- Exact chat endpoint used to request the write: [`POST /api/chat`](../src/routes/chat.ts).
- Exact execution listing endpoint used to discover the pending write: [`GET /api/executions?sessionId=<sessionId>`](../src/routes/executions.ts).
- Ask ELORA to create a safe test Calendar event:

  ```bash
  curl -N http://localhost:4317/api/chat \
    -H 'Accept: text/event-stream' \
    -H 'Content-Type: application/json' \
    -d '{"agent":"elora","sessionId":"phase-1-calendar-approval","message":"Create a Google Calendar event titled Phase 1 Approval Smoke Test tomorrow from 9:00 AM to 9:15 AM on my primary calendar."}'
  ```

- Retrieve pending executions:

  ```bash
  curl 'http://localhost:4317/api/executions?sessionId=phase-1-calendar-approval'
  ```

- Passing criteria:
  - The write does not execute immediately.
  - The execution record contains `approvalStatus: "pending"`.
  - The execution record contains an `approvalRequest`.
  - The requested action is `calendar.create_event`.

### 7. Approved action replays successfully

- Exact approval endpoint: [`POST /api/executions/:id/approval`](../src/routes/executions.ts).
- Approve the pending execution from the previous check:

  ```bash
  curl -X POST 'http://localhost:4317/api/executions/<executionId>/approval' \
    -H 'Content-Type: application/json' \
    -d '{"decision":"approve","approvalNote":"Approved Phase 1 replay smoke test."}'
  ```

- Passing criteria:
  - The response includes `execution.approvalStatus: "approved"`.
  - The response includes `execution.status: "completed"`.
  - The response includes `execution.executionResult.status: "approval_replayed"`.
  - The response includes a `replayResult` from the Calendar provider path.
  - The event appears in the target Google Calendar with the requested title and time.

### 8. Execution receipt is logged and retrievable

- Exact retrieval endpoint: [`GET /api/executions?sessionId=<sessionId>&limit=5`](../src/routes/executions.ts).
- Exact command:

  ```bash
  curl 'http://localhost:4317/api/executions?sessionId=phase-1-calendar-approval&limit=5'
  ```

- Passing criteria:
  - The approved `calendar.create_event` execution is returned.
  - The execution contains `providerResponseSummary`.
  - The execution contains a `receipt.summary`, for example `calendar.create_event approved and replayed`.
  - The execution can be correlated with the session ID used for the approval flow.
  - The matching tool audit entry is present in `${AGENT_RUNTIME_DATA_DIR:-agent-runtime/.runtime-data}/audit/tool-audit.jsonl`.

## Phase 1 pass definition

Phase 1 stabilization passes only when all required checks above pass against the same local runtime configuration, with Google OAuth connected for Google-dependent checks and a saved `sessionId` used for restart and approval-replay verification.
