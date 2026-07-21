# CORE Roadmap

This roadmap is intentionally narrow. It restores one coherent CORE execution path before adding more products, personas, providers, or autonomy surfaces.

## Milestone 0 — Source-of-truth reset

Status: **completed**

Deliverables:

- Canonical `CORE.md`, `ELORA.md`, and `NEXORA.md` definitions.
- Binding `AGENTS.md` instructions.
- Current milestone order in this file.
- `docs/STATUS.md` implementation inventory.
- Root README links to the governing documents.

Acceptance:

- A coding agent can identify the product objective, active architecture, approval boundaries, current milestone, and deferred scope without relying on historical chat context.

## Milestone 1 — Sovereign Command Loop

Status: **completed** in PR #189

Goal: replace hardcoded proof paths and fragmented orchestration with one backend-controlled command lifecycle.

Deliverables:

- A typed command/work lifecycle.
- Context assembly before planning or execution.
- Deterministic authority decision.
- Direct execution or bounded delegation.
- Validation, primary receipt creation, candidate-memory capture, and Elora synthesis.
- Removal or isolation of hardcoded proof-phrase routing from the normal product path.

Acceptance:

- A natural-language request can complete an ordinary local repository change through the normal Elora flow without a special phrase.

## Milestone 2 — Context and continuity spine

Status: **completed** in PR #191

Goal: make memory, identity, relationship, goals, corrections, trust, unfinished work, and prior receipts operational inputs to every Elora turn.

Deliverables:

- Durable CORE identity record.
- Typed `CoreContextAssembler` and persisted context bundles.
- Relevant active/canonical-memory retrieval that excludes unreviewed candidate memory from governing context.
- Relationship preferences, current goals, corrections, working style, recurring context, and long-term objectives.
- Trust-domain state, validation requirement, execution scope, and effective autonomy envelope.
- Related unfinished commands, active delegated tasks, and prior receipts.
- Exact context-reference IDs in command records, execution records, and existing Alpha receipt evidence.
- Dynamic Elora instructions that make the assembled context model-visible without treating memory content as independent instructions.
- Fresh-process restart validation.

Acceptance:

- Restarting the runtime does not erase the system's understanding of the active objective, governing decisions, relationship corrections, trust state, unfinished work, or prior receipt evidence.

## Milestone 3 — Nexora work-order execution

Status: **completed** in PR #193

Goal: make Nexora a reliable technical officer rather than a second conversational assistant.

Deliverables:

- Durable versioned Nexora work-order schema and lifecycle.
- Workspace scope, constraints, context references, execution plan, acceptance criteria, validation plan, rollback guidance, and Elora return contract.
- Persisted execution-plan state, work-order state history, validation evidence, changed artifacts, errors, remaining work, and receipt references.
- Workspace-scoped file, patch, command, test, build, and validation execution through the central tool registry.
- Exact approval boundaries for destructive and otherwise governed steps using the existing task/step approval path.
- Restart recovery that preserves completed steps and refuses to replay interrupted mutations without reconciliation.
- Structured completion proof linked to the originating command and context bundle.

Acceptance:

- Nexora can receive a bounded work order, modify the repository, validate the result, survive restart where applicable, and return proof to Elora.
- Invalid or underspecified work orders fail before queueing.
- Approved destructive steps resume through the existing approval path; unapproved steps do not execute.

## Milestone 4 — Unified receipt and trust loop

Status: **next**

Goal: use receipts as the common primitive for audit, memory, trust, UI, and follow-through.

Deliverables:

- One canonical receipt envelope.
- Links across request, work order, execution, memory candidate, and trust event.
- Receipt completeness validation.
- Trust impact derived from validated outcomes, corrections, failures, and rollbacks.
- Domain-specific autonomy expansion and contraction recommendations.

Acceptance:

- Every completed action has one primary receipt that the UI and trust engine can interpret without subsystem-specific branching.

## Milestone 5 — Real Alpha evidence flows

Goal: prove CORE with real scenarios through the normal conversational path.

Required scenarios:

1. Local repository change from remembered doctrine through Elora → Nexora → validation → receipt.
2. Continuation of unfinished work after runtime restart.
3. Candidate-memory capture and review.
4. A deliberately sensitive request that correctly escalates.
5. One configured internal Google Drive/Docs create-and-retrieve flow after local execution is stable.

Acceptance:

- All scenarios pass without hardcoded prompt matching or simulated success claims.

## Milestone 6 — Minimal operational UI

Goal: expose the working CORE loop rather than a demo dashboard.

Screens:

- Elora chat.
- Active work orders.
- Nexora run detail.
- Receipt viewer.
- Memory candidate review.
- Explicit-boundary approval queue.

Acceptance:

- The operator can see what CORE understood, remembered, decided, executed, validated, changed, and left pending.

## Deferred until Alpha acceptance

- Voice expansion and telephony.
- Additional fully executing specialist workers.
- Public deployment and marketplace distribution.
- Enterprise tenancy, SSO, RBAC, and administrative surfaces.
- Broad provider expansion.
- Self-directed payment, purchase, subscription, or banking activity.
- Multi-product workflow expansion unrelated to the CORE acceptance scenarios.
