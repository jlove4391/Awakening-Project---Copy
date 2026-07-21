# CORE Repository Status

Last reviewed: 2026-07-21

This file classifies the active repository against the canonical CORE Alpha direction. It is an implementation inventory, not a historical roadmap.

## Current baseline

- Default branch: `main`.
- Active backend: `agent-runtime/`.
- Active UI: `Elora-System/`.
- Shared contracts: `packages/shared/`.
- `legacy/` is reference-only and must not receive new product work.
- PR #155 was closed without merge because it targeted an obsolete conversational task-approval architecture.
- PR #186 corrected delegated approval-state handling and dependencies.
- PR #187 established the canonical CORE source set and completed Milestone 0.
- PR #189 implemented the persistent Sovereign Command Loop and completed Milestone 1.
- PR #191 implemented the Context and Continuity Spine and completed Milestone 2.
- PR #193 implemented durable Nexora work-order execution and completed Milestone 3.
- PR #195 implements the unified canonical receipt and receipt-derived trust loop under issue #194 and completes Milestone 4 after merge.

## Keep

### Runtime and persistence

- Express runtime and API routing.
- OpenAI Agents SDK session handling and interruption/resume approval state.
- Persistent local session records.
- Delegated task store, audit JSONL, logs, queue, worker dispatch, and restart re-queueing.
- Workspace-root and path protections.
- Durable canonical receipt store and receipt audit stream.
- Durable receipt-linked trust-event store with deterministic event identifiers.

### CORE foundations

- Typed persistent Sovereign Command Loop and lifecycle events.
- Durable canonical CORE identity record.
- Persisted context bundles containing exact reference IDs.
- Active/canonical memory retrieval that excludes unreviewed candidates from governing context.
- Relationship profile service with preferences, goals, corrections, working style, recurring context, and long-term objectives.
- Trust event store, domain scores, and context-derived autonomy/validation envelope.
- Related unfinished command, delegated-task, execution, receipt, and trust retrieval.
- Dynamic Elora instructions backed by the assembled context bundle.
- Command, execution, work-order, memory, relationship, trust, and receipt links to originating context.
- Policy decision engine vocabulary: act, report, escalate, refuse, setup-needed.
- SpecialistCall contract.
- Alpha artifact and receipt foundations retained as compatibility/supporting evidence.
- Elora as the single user-facing orchestrator.
- Durable versioned Nexora work orders with state history, evidence, and restart recovery.
- Nexora local execution worker and central tool-registry enforcement.
- Versioned canonical receipt envelope with completeness, link integrity, validation, evidence, rollback, and trust-impact fields.
- One primary work-order receipt across pending approval, execution, validation, and completion.
- Receipt-derived trust expansion, hold, and contraction recommendations.

### UI foundations

- Elora console.
- Execution receipt panel.
- Existing task and approval state rendering that can be narrowed to genuine boundaries.

## Completed corrections

### Sovereign Command Loop

- Added typed, durable command records and legal state transitions.
- Created one command record for each normal Elora request.
- Emitted command lifecycle events through the existing runtime stream.
- Linked commands to memories, delegated tasks, executions, receipts, candidate memory, identity, relationship entries, prior commands, and trust domains.
- Preserved SDK interruption/resume as the conversational approval mechanism and attached waiting approvals to the originating command.
- Removed the hardcoded CORE execution-proof phrase and dedicated production route.
- Replaced the obsolete proof smoke with deterministic lifecycle and normal-path coverage.

### Context and continuity

- Added a durable canonical CORE identity record.
- Added `CoreContextAssembler` and persisted context bundles.
- Made active/canonical memory, relationship context, goals, corrections, trust, unfinished work, and prior receipts inputs to every Elora command.
- Added domain-specific validation and bounded-autonomy envelopes without weakening explicit policy boundaries.
- Made the assembled context model-visible through dynamic Elora instructions.
- Linked execution records and existing Alpha receipt evidence to the originating command and context references.
- Added fresh-process restart validation proving continuity survives runtime restart.

### Nexora work-order execution

- Added a durable versioned work-order contract with objective, scope, constraints, context references, execution plan, acceptance criteria, validation plan, rollback guidance, output contract, evidence, and state history.
- Added the work-order lifecycle: draft, ready, queued, running, validating, blocked, completed, failed, and cancelled.
- Replaced loose Nexora queue execution with a work-order worker that uses the central registry, policy engine, capability gates, workspace protections, and existing task/step approval path.
- Made ordinary bounded local work execution-first while retaining explicit approval for repository deletion, commits, external commitments, private-data-sensitive activity, real-money activity, irreversible operations, and missing setup.
- Preserved completed execution steps across restart and blocked interrupted mutating steps from automatic replay.
- Added deterministic validation evidence, changed-artifact tracking, tool and command tracking, error and remaining-work reporting, rollback guidance, and receipt references.
- Linked work-order completion to the originating CORE command and context bundle when available.
- Added invalid-contract, ordinary file execution, approval-resume, and fresh-process restart coverage.

### Unified receipts and trust feedback

- Added a durable versioned canonical receipt envelope with deterministic primary receipt IDs.
- Added precise receipt completeness and link-integrity diagnostics.
- Made normal registered-tool execution publish or update a primary canonical receipt while retaining the embedded Alpha receipt payload for compatibility.
- Made Nexora work orders publish exactly one primary canonical receipt linked to task, work order, supporting execution, command, context, memory, relationship, and legacy receipt evidence.
- Made genuine pending work-order boundaries publish the same receipt that is later updated after approval, execution, validation, and completion.
- Prevented supporting execution receipts from duplicating the primary work-order trust outcome.
- Made trust events idempotent and derived from canonical receipt quality, validation, outcome, and boundary evidence rather than subsystem-specific success calls.
- Prevented incomplete, unvalidated, pending, blocked, supporting-only, and hard-approval-scope receipts from expanding autonomy.
- Preserved completed approved deletion and other hard scopes as neutral explicit-boundary evidence.
- Added receipt-linked user-correction and rollback signals that contract or hold the relevant trust domain.
- Added domain-specific expansion recommendations only after repeated complete, validated ordinary outcomes without failures or corrections.
- Added fresh-process persistence coverage for canonical receipts and linked trust events.

## Correct next

### Alpha evidence flows

- Prove one remembered local repository request through Elora → Nexora work order → execution → validation → canonical receipt.
- Prove continuation of unfinished work after restart through the normal conversational path.
- Prove candidate-memory capture and review linked to the primary receipt.
- Prove one deliberate explicit-boundary escalation through the normal conversational path.
- Add one configured internal Drive/Docs create-and-retrieve flow after local receipt evidence is stable.

### Operational UI

- Expose the command, work-order, receipt, trust, memory-candidate, and genuine approval-boundary state without rebuilding backend orchestration in the client.
- Make the primary canonical receipt the UI proof contract rather than branching on legacy subsystem receipt families.

### Documentation

- Keep `CORE.md`, `ELORA.md`, `NEXORA.md`, `AGENTS.md`, `ROADMAP.md`, and this file as the governing source set.
- Mark older implementation and reset plans as supporting or historical where they conflict.

## Partial

- The context spine is operational, but long-term context ranking and compression can be refined after Alpha evidence is available.
- The canonical receipt-driven trust loop is operational, but score calibration and domain thresholds should be refined using real Alpha outcomes rather than synthetic expansion evidence alone.
- Specialist contracts exist, but only Nexora has a meaningful execution worker.
- Nexora work orders are operational, but path-scope derivation remains Alpha-grade and should become an explicit caller-supplied allowlist for complex multi-path or command-heavy work.
- Legacy task, work-order, execution, SpecialistCall, and Alpha receipt identifiers remain for compatibility and supporting evidence; new consumers should use the canonical primary receipt.
- Candidate-memory IDs can be represented in canonical receipt links, but the full normal-path capture and human review scenario remains Milestone 5 evidence work.
- The UI surfaces receipts and approvals, but does not yet present the full command loop, work-order lifecycle, canonical receipt, trust impact, and continuity state.
- Provider tools exist, but setup state, real execution proof, and boundary behavior remain inconsistent across integrations until the Milestone 5 Drive/Docs evidence flow is completed.

## Defer

- Voice and telephony expansion.
- Fully executing Kaz, Jynx, Kalyra, Caz, and additional persona workers.
- Broad lead-generation and product-specific workflow expansion.
- Marketplace, public distribution, and audience-facing release.
- Enterprise tenancy, SSO, RBAC, and administration.
- Additional cloud/infrastructure automation beyond what is required for Alpha proof.
- Autonomous external sends or publication.
- Real-money execution.

## Archive or remove after verification

- Duplicate or obsolete approval helpers that predate SDK interruption/resume.
- Historical planning documents that conflict with the canonical source set, after preserving useful context.
- Dead smoke scripts tied only to superseded architecture.
- Stale branch references after replacement PRs have merged.
- Legacy receipt-family readers after all runtime and UI consumers migrate to the canonical envelope.

## Immediate acceptance work

1. Prove the real Alpha evidence flows through the normal Elora path.
2. Add one configured internal Drive/Docs create-and-retrieve flow.
3. Finish the minimal operational UI around commands, work orders, canonical receipts, memory candidates, trust impact, and genuine approvals.
