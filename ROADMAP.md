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

Status: **completed** in PR #195

Goal: use one primary receipt as the common proof primitive for audit, memory, trust, UI, and follow-through.

Deliverables:

- A durable, versioned canonical receipt envelope with deterministic primary identifiers.
- One receipt store for subject, actor, authority, policy, approval, command/context, memory, task, work-order, execution, evidence, validation, rollback, and trust links.
- Receipt completeness and link-integrity validation with precise missing-field and invalid-link diagnostics.
- Primary canonical receipts for normal registered-tool executions and Nexora work orders, with older execution, task, work-order, SpecialistCall, and Alpha receipt identifiers retained as supporting compatibility evidence.
- One work-order receipt that persists across pending approval, execution, validation, and completion rather than creating unrelated proof records at each stage.
- Idempotent receipt-derived trust events for receipt quality, validation, successful or failed execution, and explicit-boundary accuracy.
- Receipt-linked user-correction and rollback signals.
- Domain-specific autonomy expansion, hold, and contraction recommendations derived only from complete validated receipt evidence.
- Hard approval scopes that remain non-expanding boundary evidence even after an approved action completes.
- Fresh-process persistence for canonical receipts and their linked trust events.

Acceptance:

- Every completed normal tool action and Nexora work order has exactly one primary canonical receipt.
- Supporting execution, task, work-order, Alpha, memory, and trust records link to the primary receipt without requiring subsystem-specific interpretation.
- Incomplete, unvalidated, supporting-only, pending-approval, blocked, or hard-boundary receipts cannot expand autonomy.
- Repeated complete and validated ordinary outcomes can recommend bounded domain expansion; failures, failed validation, corrections, or rollbacks contract or hold the domain recommendation.
- Receipt and trust state survive a fresh-process restart.

## Milestone 5 — Real Alpha evidence flows

Status: **completed** in PR #197

Goal: prove CORE with real scenarios through production runtime services rather than hardcoded proof phrases, fabricated output, or disconnected subsystem demos.

Deliverables:

- A production-backed Alpha evidence harness that uses the real command, context, delegation, work-order, execution, validation, receipt, memory, and trust services.
- A remembered canonical doctrine assembled before execution and carried into a bounded Nexora repository change.
- A validated local artifact linked to its originating command, context bundle, governing memory, task, work order, executions, and one primary canonical receipt.
- Fresh-process continuation of unfinished work that preserves a completed mutation and executes only the remaining safe step.
- Evidence-backed memory candidates that remain non-governing before review and become canonical governing context only after explicit promotion.
- Durable memory-review records and canonical review receipts linking the candidate, promoted memory, source command/context, source receipt, task, work order, and executions.
- A deliberately sensitive repository-delete request that stops before execution at the exact `repo.delete` boundary and produces non-expanding boundary evidence.
- A bounded Drive create-and-retrieve scenario that uses actual provider calls when Google is connected and truthfully returns `setup_required` when it is not.
- Bounded workspace file references for Drive payloads so private file content is read only at execution time and is not embedded in durable task, audit, or receipt records.
- An opt-in live model-driven normal-path scenario that runs when `OPENAI_API_KEY` is configured and otherwise reports setup required without simulated success.
- CI coverage for Milestones 1–5, local evidence, restart recovery, memory review, sensitive-boundary behavior, Drive setup behavior, and live-path setup behavior.

Acceptance:

- The deterministic local evidence flow passes without a special phrase or fake success response.
- Fresh-process recovery completes without replaying the previously completed mutation.
- Candidate memory is excluded from governing context before review and included only after explicit promotion.
- The sensitive request produces no side effect and remains linked to an explicit-boundary canonical receipt.
- Drive uses the configured provider when available; without credentials, the command and work order end truthfully in setup-required/blocked state rather than claiming creation.
- Every completed action and work order has one complete primary canonical receipt with valid cross-links.
- Typecheck, build, and all Milestone 1–5 deterministic regressions pass.

## Milestone 6 — Minimal operational UI

Status: **next**

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
