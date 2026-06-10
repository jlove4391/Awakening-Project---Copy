# Agent Runtime

Backend service for Elora agent execution. React consoles should render UI and stream events from this service instead of embedding command, model, memory, or task execution logic in components.

## Modules

- `src/agents/elora.ts` defines Elora's SDK agent, instructions, structured turn summary, model, and tools.
- `src/tools/registry.ts` centralizes tool definitions and the public tool manifest.
- `src/memory/` owns session records, memory references, task state, and SDK session persistence.
- `src/routes/chat.ts` streams chat runs as server-sent events.
- `src/routes/tools.ts` exposes registered tools for console inspection.
- `src/routes/tasks.ts` exposes task status and task mutation endpoints.

## Development

```bash
npm install
npm run dev
```

By default the service listens on `http://localhost:4317` and allows the React app at `http://localhost:3000`.

Set `OPENAI_API_KEY` to enable the SDK's `OpenAIConversationsSession`; otherwise the runtime uses the SDK `MemorySession` backed by local JSON records under `.runtime-data/` for development.
