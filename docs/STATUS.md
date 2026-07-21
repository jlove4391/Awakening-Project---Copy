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
- PR #193 implements durable Nexora work-order execution under issue #192 and completes Milestone 3 after merge.

## Keep

### Runtime and persistence

- Express runtime and API routing.
- OpenAI Agents SDK session handling and interruption/resume approval state.
- Persistent local session records.
- Delegated task store, audit JSONL, logs, queue, worker dispatch, and restart re-queueing.
- Workspace-root and path protections.

### CORE foundations

- Typed persistent Sovereign Command Loop and lifecycle events.
- Durable canonical CORE identity record.
- Persisted context bundles containing exact reference IDs.
- Active/canonical memory retrieval that excludes unreviewed candidates from governing context.
- Relationship profile service with preferences, goals, corrections, working style, recurring context, and long-term objectives.
- Trust event store, domain scores, and context-derived autonomy/validation envelope.
- Related unfinished command, delegated-task, execution, and receipt retrieval.
- Dynamic Elora instructions backed by the assembled context bundle.
- Command, execution, and Alpha receipt links to context, memory, relationship, trust, work, and prior evidence.
- Policy decision engine vocabulary: act, report, escalate, refuse, setup-needed.
- SpecialistCall contract.
- Alpha artifact and receipt foundations.
- Elora as the single user-facing orchestrator.
- Durable versioned Nexora work orders with state history, evidence, and restart recovery.
- Nexora local execution worker and central tool-registry enforcement.

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

## Correct next

### Governance and receipts

- Unify overlapping task, execution, Alpha, provider, approval, work-order, and trust receipt shapes under one primary receipt envelope.
- Preserve SDK interruption/resume as the conversational approval mechanism.
- Keep API/task approvals only for explicit task and step boundaries; do not build a parallel natural-language approval selector.
- Make policy classifiers robust enough to avoid keyword-only false positives and false negatives.
- Make validated work-order outcomes, failures, corrections, and rollbacks update the domain-specific trust loop through the canonical receipt.

### Alpha evidence flows

- Prove one remembered local repository request through Elora → Nexora work order → execution → validation → canonical receipt.
- Prove continuation of unfinished work after restart through the normal conversational path.
- Prove candidate-memory capture and review.
- Prove one deliberate explicit-boundary escalation.
- Add one configured internal Drive/Docs create-and-retrieve flow after receipt unification is stable.

### Documentation

- Keep `CORE.md`, `ELORA.md`, `NEXORA.md`, `AGENTS.md`, `ROADMAP.md`, and this file as the governing source set.
- Mark older implementation and reset plans as supporting or historical where they conflict.

## Partial

- The context spine is operational, but long-term context ranking and compression can be refined after Alpha evidence is available.
- Trust constrains autonomous level and validation scope, but validated outcomes still need to feed one unified receipt-driven trust loop.
- Specialist contracts exist, but only Nexora has a meaningful execution worker.
- Nexora work orders are operational, but path-scope derivation remains Alpha-grade and should become an explicit caller-supplied allowlist for complex multi-path or command-heavy work.
- Receipts exist and cross-links are present, but multiple schemas and streams still require unification.
- The UI surfaces receipts and approvals, but does not yet present the full command loop, work-order lifecycle, and continuity state.
- Provider tools exist, but setup state, real execution proof, and boundary behavior are inconsistent across integrations.

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

## Immediate acceptance work

1. Unify receipts and close the trust-feedback loop.
2. Prove local execution, restart continuity, candidate memory, and one real approval boundary through the normal conversational path.
3. Add one Drive/Docs evidence flow.
4. Finish the minimal operational UI.
