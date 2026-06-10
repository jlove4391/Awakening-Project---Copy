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


## Tool Registry

The runtime now registers tools by capability category instead of calling providers directly from agent logic. Initial namespaces are `calendar.*`, `gmail.*`, `drive.*`, `sheets.*`, `crm.*`, `clay.*`, `leadgen.*`, `voice.*`, `memory.*`, and `delegation.*`. Each registry entry carries its JSON input schema, required OAuth/provider scopes, risk level, human-approval requirement, executor, and audit-log metadata. Provider-backed entries currently fail closed with `provider_not_configured` until their new adapters are wired; the archived AuthBridge and Elora integrations should remain references only when rebuilding those adapters.
