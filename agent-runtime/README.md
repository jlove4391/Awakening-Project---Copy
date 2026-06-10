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

## Voice Channel

Voice is intentionally not the first execution path. The stable text console continues to use `POST /api/chat`, and voice routes are channel adapters around the same backend agent message runner rather than a separate business-logic stack.

Voice endpoints are mounted under `POST /api/voice/*` and cover three channel shapes while keeping all reasoning/tool use in the shared backend agent endpoint:

- `POST /api/voice/sessions` creates a browser/interface voice session for microphone/speaker chat in the Elora console.
- `POST /api/voice/calls/inbound` creates an inbound phone-call session record and links it to an agent session.
- `POST /api/voice/calls` records an outbound call initiation request. Because this is an external-send action, it returns `approval_required` until `confirmedByUser: true` is supplied.
- `POST /api/voice/meetings` records a Zoom/Teams/Meet listener session. Joining and media capture stay in a provider adapter, but transcripts and notes flow into the same voice session store. Meeting listener creation requires explicit user approval so consent/disclosure can be handled before a bot joins.
- `POST /api/voice/transcriptions` accepts a transcript (or an audio artifact placeholder), appends it to the session record, and either sends the utterance through the shared Elora agent endpoint with `channel: "voice"` or, for meetings by default, records it silently for notes/transcription.
- `POST /api/voice/speech` returns a speech-synthesis handoff object for the channel adapter; no provider credentials are embedded in the agent runtime.
- `POST /api/voice/sessions/:voiceSessionId/summary` creates a call or meeting summary and can extract it into runtime memory with `extractMemory: true`.

During voice runs, non-read/high-risk tools are blocked unless the voice session has an explicit high-risk approval policy with remaining quota. Meetings default to zero high-risk tool approvals because they are listen-and-note sessions, not an action-taking path. This keeps call-time calendar, Gmail, Drive, Sheets, lead-gen, purchase/commit, and code-execution actions behind explicit approval limits.

### Browser Verbal Chat (OpenAI Speech)

The browser voice controls in `EloraConsole` use the microphone through `MediaRecorder`, POST the captured audio to `/api/voice/transcriptions`, route the transcript through the shared Elora agent endpoint, and play returned TTS audio from `/api/voice/speech`/the transcription response.

Configure the runtime with:

- `OPENAI_API_KEY` — required for OpenAI transcription and speech synthesis.
- `VOICE_TRANSCRIPTION_MODEL` — defaults to `gpt-4o-mini-transcribe`.
- `VOICE_SPEECH_MODEL` — defaults to `gpt-4o-mini-tts`.
- `VOICE_SPEECH_VOICE` — defaults to `marin`; the console lets the user choose from the supported voice list returned by `GET /api/voice/config`.
- `VOICE_SPEECH_INSTRUCTIONS` — optional tone/style instruction for Elora's generated speech.
- `VOICE_SPEECH_FORMAT` — defaults to `mp3`.

OpenAI's speech docs describe the Audio API `audio/transcriptions` endpoint for speech-to-text and the `audio/speech` endpoint for TTS. The current implementation uses the chained STT → backend agent → TTS pattern first because it preserves the existing text-console agent path before moving to lower-latency Realtime sessions.

### Inbound Phone Calls (Telephony Webhook + Media Stream)

Inbound calls are wired as a strict phone-call channel before outbound callbacks. Configure a telephony provider webhook to `POST /api/voice/telephony/inbound`; Twilio-style form payloads (`From`, `To`, `CallSid`, `AccountSid`) are accepted and the route returns TwiML that opens a live media WebSocket stream at `/api/voice/telephony/stream`.

Set `AGENT_RUNTIME_PUBLIC_BASE_URL` to the HTTPS public URL of this runtime so the returned TwiML can advertise a `wss://.../api/voice/telephony/stream` endpoint. `VOICE_TELEPHONY_STREAM_PATH` can override the stream path when a reverse proxy needs a different route.

The media stream handler accepts Twilio-compatible JSON WebSocket events (`connected`, `start`, `media`, `stop`). Incoming μ-law/8kHz media payloads are accumulated into a WAV artifact, transcribed through the OpenAI voice adapter, routed through the shared Elora agent endpoint, and synthesized back into an audio response payload for the telephony adapter to play or convert.

Phone-call sessions always use a locked approval policy: write, external-send, purchase/commit, and code-execution tools are blocked during the call regardless of model intent. Elora can discuss or queue follow-up, but the user must approve high-risk actions later through the text console or another explicit approval surface.

### Missed-Call Callbacks

Missed calls are recorded before Elora is allowed to call back. Use `POST /api/voice/calls/missed` (JSON) or `POST /api/voice/telephony/missed` (Twilio-style form fields) with caller metadata to create both a memory tagged `missed-call`/`callback-needed` and a queued task titled `Approve callback to ...`.

Callbacks are external-send actions and require an explicit approval payload. `POST /api/voice/calls/missed/callback` returns `approval_required` until `confirmedByUser: true` is supplied. When approved, the runtime creates a locked outbound phone-call voice session, updates the callback task if `taskId` is provided, and uses the outbound telephony adapter when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are configured.

The outbound telephony adapter submits a Twilio Calls API request with `Url=/api/voice/telephony/outbound-answer?voiceSessionId=...`; that answer route returns TwiML that opens the same live media stream used by inbound calls. High-risk tools remain blocked during callback calls and must be approved after the call through the text console or another explicit approval surface.

### Meeting Listener (Zoom / Teams / Google Meet)

Meeting listener sessions are silent by default. `POST /api/voice/meetings` records a listener session for `zoom`, `teams`, `google_meet`, or `other`, requires `confirmedByUser: true`, and requests a provider adapter only when the matching adapter URL is configured (`ZOOM_MEETING_ADAPTER_URL`, `TEAMS_MEETING_ADAPTER_URL`, or `GOOGLE_MEET_ADAPTER_URL`). The adapter request includes the join URL, bot display name, transcript webhook URL, and an explicit `defaultMode: "silent_notes"` hint.

Meeting adapters should send transcript/caption lines to `POST /api/voice/meetings/:voiceSessionId/transcript`. The runtime stores those lines as participant transcript entries and does not produce spoken responses unless the transcript request sets `respond: true` **and** the meeting has prior speaking consent.

To let Elora speak in a meeting, call `POST /api/voice/meetings/:voiceSessionId/speaking-consent` with `confirmedByUser: true` and an approval note documenting participant consent. Without that approval, response requests return an `approval_required` object and remain silent. Adapters can update listener lifecycle state with `POST /api/voice/meetings/:voiceSessionId/adapter-status`.
