# CORE Repository Status

Last reviewed: 2026-07-23

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
- PR #195 implemented the unified canonical receipt and receipt-derived trust loop and completed Milestone 4.
- PR #197 implements production-backed Alpha evidence flows under issue #196 and completes Milestone 5 after merge.

## Keep

### Runtime and persistence

- Express runtime and API routing.
- OpenAI Agents SDK session handling and interruption/resume approval state.
- Persistent local session records.
- Delegated task store, audit JSONL, logs, queue, worker dispatch, and restart re-queueing.
- Workspace-root, traversal, symlink, file-type, and bounded-content protections.
- Durable canonical receipt store and receipt audit stream.
- Durable receipt-linked trust-event store with deterministic event identifiers.
- Durable memory candidate review records.

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
- Evidence-backed memory candidates and explicit promotion/rejection contracts.
- Production-backed Alpha evidence harness using the real command, context, work-order, validation, receipt, memory, and trust services.

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

### Real Alpha evidence flows

- Added a production-backed evidence harness that composes the existing command, context, delegation, work-order, validation, receipt, memory, and trust services rather than introducing an alternate executor.
- Proved that a reviewed canonical doctrine is assembled before a bounded repository change and remains linked through command, context, task, work order, executions, validation, and the primary canonical receipt.
- Proved an isolated local artifact is actually written and validated without a hardcoded natural-language proof matcher.
- Proved fresh-process continuation preserves a previously completed mutation, executes only the remaining safe step, and completes with canonical receipt evidence.
- Added evidence-backed candidate memory creation and explicit user review records.
- Proved unreviewed candidate memory is excluded from governing context and promoted canonical memory becomes governing only after explicit approval.
- Added canonical memory-review receipts linking the candidate, canonical memory, source command/context, source receipt, task, work order, and executions.
- Proved a repository-delete request produces no side effect before approval and remains at the exact `repo.delete` boundary with non-expanding trust evidence.
- Added truthful Google Drive setup behavior: connected providers perform real create/search calls; disconnected providers return `provider_not_configured` and drive the command to setup-required state rather than simulating success.
- Added bounded `@workspace-file:` Drive content references so private payload content is resolved only at execution time and is not embedded in durable task, audit, work-order, or receipt records.
- Added an opt-in live model-driven Elora path that runs only with `OPENAI_API_KEY`; without it, the smoke reports setup required and explicitly records that success was not simulated.
- Added CI coverage for Milestones 1–5 and all deterministic Alpha evidence scenarios.

## Correct next

### Minimal operational UI

- Make the existing Elora console the one operator-facing surface for the working CORE lifecycle.
- Expose command intent, context bundle references, authority decision, execution/delegation state, validation, and final synthesis.
- Expose active Nexora work orders with persisted step state, changed artifacts, errors, remaining work, and restart status.
- Make the primary canonical receipt the UI proof contract rather than branching on legacy subsystem receipt families.
- Add memory candidate review using the explicit backend promotion/rejection contract.
- Show domain trust impact and recommendations without treating them as automatic permission expansion.
- Show only genuine SDK/task/step boundaries in the approval queue.

### Documentation

- Keep `CORE.md`, `ELORA.md`, `NEXORA.md`, `AGENTS.md`, `ROADMAP.md`, and this file as the governing source set.
- Mark older implementation and reset plans as supporting or historical where they conflict.

## Partial

- The context spine is operational, but long-term context ranking and compression can be refined after more real operator evidence is available.
- The canonical receipt-driven trust loop is operational, but score calibration and domain thresholds should be refined using real Alpha outcomes over time.
- Specialist contracts exist, but only Nexora has a meaningful execution worker.
- Nexora work orders are operational, but path-scope derivation remains Alpha-grade and should become an explicit caller-supplied allowlist for complex multi-path or command-heavy work.
- Legacy task, work-order, execution, SpecialistCall, and Alpha receipt identifiers remain for compatibility and supporting evidence; new consumers should use the canonical primary receipt.
- Candidate-memory review is operational in the backend, but the operator UI for reviewing, promoting, and rejecting candidates is not yet implemented.
- The UI does not yet present the full command loop, work-order lifecycle, canonical receipt, trust impact, continuity state, or memory-review contract.
- The configured Google Drive create-and-retrieve branch is implemented but cannot be exercised in credential-free CI; CI proves the truthful setup-required branch and prevents simulated provider success.
- The live model-driven normal path is opt-in and requires `OPENAI_API_KEY`; credential-free CI proves only its setup-required behavior.

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

1. Implement the minimal operational UI around commands, work orders, canonical receipts, memory candidates, trust impact, and genuine approvals.
2. Exercise the configured Drive create-and-retrieve and live model-driven paths in a credentialed local environment without exposing credentials or private content.
3. Calibrate trust thresholds using real operator-reviewed Alpha outcomes.
