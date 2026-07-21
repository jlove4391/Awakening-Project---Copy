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
- PR #186 is the current latest merged repair and corrected delegated approval-state handling and dependencies.

## Keep

### Runtime and persistence

- Express runtime and API routing.
- OpenAI Agents SDK session handling and interruption/resume approval state.
- Persistent local session records.
- Delegated task store, audit JSONL, logs, queue, worker dispatch, and restart re-queueing.
- Workspace-root and path protections.

### CORE foundations

- Memory service and candidate/canonical lifecycle.
- Relationship profile service.
- Trust event store and domain score service.
- Policy decision engine vocabulary: act, report, escalate, refuse, setup-needed.
- SpecialistCall contract.
- Alpha artifact and receipt foundations.
- Elora as the single user-facing orchestrator.
- Nexora local execution worker and execution-plan model.

### UI foundations

- Elora console.
- Execution receipt panel.
- Existing task and approval state rendering that can be narrowed to genuine boundaries.

## Correct next

### Orchestration

- Replace the hardcoded CORE execution-proof prompt path with a generic Sovereign Command Loop.
- Add a typed command/work state machine controlled by the backend.
- Require context assembly before planning or execution.
- Ensure validation, receipt creation, candidate-memory capture, and Elora synthesis are lifecycle stages rather than optional conventions.

### Context

- Add an explicit durable CORE identity record.
- Assemble canonical memory, relationship context, active goals, corrections, trust state, unfinished work, and related receipts into every Elora turn.
- Make trust state an input to execution scope and validation requirements rather than a reporting-only score.

### Nexora

- Rewrite outdated Nexora instructions that still describe ordinary edits, tests, commits, and provider writes as generically approval-gated.
- Formalize the work-order schema and terminal completion contract.
- Ensure every queued technical task is either handled by a real worker, blocked with a precise reason, or explicitly deferred.

### Governance

- Unify overlapping task, execution, Alpha, provider, approval, and trust receipt shapes under one primary receipt envelope.
- Preserve SDK interruption/resume as the conversational approval mechanism.
- Keep API/task approvals only for explicit task and step boundaries; do not build a parallel natural-language approval selector.
- Make policy classifiers robust enough to avoid keyword-only false positives and false negatives.

### Documentation

- Make `CORE.md`, `ELORA.md`, `NEXORA.md`, `AGENTS.md`, `ROADMAP.md`, and this file the governing source set.
- Mark older implementation and reset plans as supporting or historical where they conflict.

## Partial

- Memory persists, but retrieval is not yet enforced as a prerequisite to every action.
- Relationship context is loaded, but not yet fully converted into execution decisions.
- Trust scores exist, but do not yet govern the autonomy envelope in the policy engine.
- Specialist contracts exist, but only Nexora has a meaningful execution worker.
- Receipts exist, but multiple schemas and streams require unification.
- The UI surfaces receipts and approvals, but does not yet present the full command loop and continuity state.
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

- Hardcoded demo/proof phrase branches once equivalent generic acceptance coverage exists.
- Duplicate or obsolete approval helpers that predate SDK interruption/resume.
- Historical planning documents that conflict with the canonical source set, after preserving useful context.
- Dead smoke scripts tied only to superseded architecture.
- Stale branch references after replacement PRs have merged.

## Immediate acceptance work

1. Merge the source-of-truth reset.
2. Audit all normal Elora entry paths and identify where generic orchestration must replace hardcoded routes.
3. Implement the Sovereign Command Loop.
4. Add context assembly and identity continuity.
5. Formalize Nexora work orders and unified receipts.
6. Prove local execution, restart continuity, candidate memory, and one real approval boundary.
7. Add one Drive/Docs evidence flow.
8. Finish the minimal operational UI.
