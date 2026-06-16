# Memory Service and Vireon Identity Foundation

## Active backend

The active backend for CORE runtime work is `agent-runtime`. Agents, tools, workflows, task routes, approval replay, and execution receipts should use runtime services rather than writing directly to storage files or future databases.

## Memory Service placement

The Memory Service sits between agents/tools/workflows and durable storage:

```text
Elora / Nexora / tools / workflows
  -> agent-runtime/src/memory/memoryService.ts
  -> agent-runtime/src/memory/memoryRepository.ts
  -> adapter implementation
     - JSON today
     - PostgreSQL later
```

Existing public memory exports remain available from `agent-runtime/src/memory/index.ts`, including `remember`, `retrieveMemories`, `listMemories`, `summarizeMemories`, `writeMemory`, and `deleteMemory`.

## Current default storage

The default adapter is JSON. It preserves the existing durable file behavior under:

```text
runtimeConfig.dataDir/memory/memory-store.json
```

No runtime data directory move is required in this pass, and existing JSON memory files should remain readable.

## Future PostgreSQL adapter

PostgreSQL is intentionally not required yet. Future configuration is reserved as:

```text
DATABASE_URL=postgres://...
MEMORY_STORAGE_ADAPTER=json|postgres
```

`MEMORY_STORAGE_ADAPTER=json` is the current default. If `MEMORY_STORAGE_ADAPTER=postgres` is set before the adapter is implemented, the runtime fails clearly with a message explaining that the PostgreSQL adapter is a stub.

## TCHAI memory categories

The Memory Service supports long-term True Collaborative Human-AI Intelligence memory categories:

- `fact`
- `preference`
- `decision`
- `event`
- `project_note`
- `work_order`
- `approval`
- `receipt`
- `relationship`
- `persona_lesson`
- `conversation_summary`

Each new service-level memory record can carry owner/session, organization, project, persona, actor, category, title, text/summary, source, importance, tags, metadata, and timestamps while preserving compatibility with the existing `StoredMemory` shape.

## Memory Service API

The service API is intentionally stable and adapter-neutral:

- `createMemory(input)`
- `updateMemory(id, patch)`
- `deleteMemory(id)`
- `getMemoryById(id)`
- `searchMemories(filter)`
- `listMemories(filter)`
- `recordDecision(input)`
- `recordWorkOrderMemory(input)`
- `recordReceiptMemory(input)`
- `getProjectTimeline(projectId)`
- `getSessionContext(sessionId)`

Semantic/vector search is not implemented in this pass. Search remains lightweight keyword scoring over the current JSON-backed records.

## Identity Service foundation

The identity foundation lives under `agent-runtime/src/identity/`. It is internal runtime identity only, not customer login or public auth.

Seeded identities:

- Jordan Love: Sovereign / Founder / Owner
- Elora: AI Persona with executive routing and memory permissions
- Nexora: AI Persona with technical execution, work-order, and receipt permissions

Initial permissions:

- `memory:read`
- `memory:write`
- `memory:approve`
- `project:read`
- `project:write`
- `workflow:create`
- `workflow:approve`
- `execution:request`
- `execution:execute`
- `receipt:write`
- `admin:all`

Memory writes can accept optional actor identity metadata (`actorId`, `actorType`, `displayName`). Missing identity does not block existing memory writes yet; enforcement is a future step.

## Storage rule

Personas must not write directly to JSON files, PostgreSQL, or any future storage backend. Personas and tools should use Memory Service functions, and provider adapters should remain behind repository/service interfaces.
