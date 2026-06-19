# Core Build Plan

This build plan now follows the CORE Autonomy Reset direction. The CORE is a relationship-based intelligence system that becomes autonomous through memory, identity continuity, relationship, demonstrated reliability, and trust. Autonomy is a byproduct of earned trust, not the starting assumption.

The governing progression is:

```text
Memory → Identity → Relationship → Trust → Autonomy → Execution
```

The CORE should execute work in the real local and configured workspace environment whenever capable. It should create files, edit files, modify repositories, apply patches, run commands, run tests, run builds, validate results, create workspace artifacts, maintain memory, and leave receipts. It should not merely produce plans, proposed patches, or recommendations when execution is possible and the action does not cross the RMT/private-data boundary.

For the detailed reset audit, task stubs, and non-negotiable design principles, see [`core-autonomy-reset-plan.md`](./core-autonomy-reset-plan.md).

## Phase 1: Memory Foundation

### Implementation focus

- Persist memories that support context continuity, user preference modeling, goal modeling, and relationship continuity.
- Retrieve relevant memory into runtime context for Elora and specialist agents.
- Add memory receipts for creation, retrieval, summarization, correction, and deletion.
- Establish identity continuity for the CORE and Jordan relationship context.
- Classify memory actions that expose, transmit, delete, or materially alter private data.

### Acceptance conditions

- Memory persists across runtime restarts and can be retrieved by session/user context.
- Memory receipts identify action, actor, scope, timestamp, and relevant policy classification.
- Identity continuity is available to Elora at runtime.
- Private-memory exposure/transmission/deletion/alteration requires explicit approval.
- Ordinary non-sensitive memory creation executes without approval and leaves receipts.

## Phase 2: Relationship Layer

### Implementation focus

- Model Jordan's preferences, goals, corrections, working style, recurring contexts, and long-term objectives.
- Convert user corrections and confirmations into relationship events.
- Introduce trust domains such as files, repository, commands, Drive, Calendar, Gmail, memory, work orders, workflows, and self-improvement.
- Track success, failure, reversals, receipt quality, and boundary accuracy by domain.
- Expose current trust state to Elora and relevant runtime decisions.

### Acceptance conditions

- Preference and goal records can be created, updated, retrieved, and receipted.
- User corrections affect future behavior and trust history.
- Trust domains are persisted and queryable.
- Elora can use relationship context when deciding and executing next steps.
- Relationship state survives process restarts.

## Phase 3: Autonomy Framework

### Implementation focus

- Implement an RMT boundary classifier.
- Implement a personal-information-sensitive action classifier.
- Replace broad approval scopes with dynamic policy decisions.
- Make receipt-first governance the default for ordinary work.
- Convert review queues into risk-surfacing and trust-feedback surfaces.
- Add dynamic trust outputs: trust score, trust domains, current autonomy envelope, and autonomy recommendations.

### Acceptance conditions

- Ordinary work is classified as execute or execute+receipt, not approval-first.
- RMT actions require explicit approval.
- Personal-information-sensitive actions require explicit approval before exposure, transmission, deletion, alteration, or sharing.
- Missing credentials/integrations produce setup-needed receipts.
- Trust scores can expand or contract autonomy by domain based on historical execution results.

## Phase 4: Workspace Execution

### Implementation focus

- Enable real local file creation, editing, reversible deletion, directory creation, and directory organization inside the configured workspace.
- Enable repository modifications, branch creation, patch application, command execution, build execution, test execution, and validation execution inside the configured workspace.
- Enable internal work-order creation and updates.
- Enable configured Drive document creation with receipts when not exposing private data.
- Enable configured Calendar reminders/internal events with receipts when not exposing private data or creating external commitments.
- Split Gmail drafting/organization from external sending; draft and organize with receipts, ask before private correspondence sends/forwards/deletes/exposure.

### Acceptance conditions

- Ordinary file and repository operations execute without approval inside the current trust envelope.
- Commands, tests, builds, and validation execute with output receipts.
- Internal work orders execute and update without pending approval unless a step crosses RMT/private-data boundaries.
- Drive, Calendar, and Gmail actions respect setup state, trust scope, and explicit-boundary approval.
- Receipts include changed resources, policy decisions, results, validation output, and rollback hints where applicable.

## Phase 5: Evolution Layer

### Implementation focus

- Allow self-improvement changes inside current trust scope.
- Run verification automatically after self-improvement changes when available.
- Evolve persona instructions and workflows based on receipts, relationship state, and trust history.
- Optimize workflows through actual execution, validation, receipts, and corrections.
- Expand autonomy domains based on demonstrated reliability.

### Acceptance conditions

- Self-improvement changes execute, verify, and receipt when inside policy.
- Persona behavior can be updated based on relationship/trust evidence.
- Workflow improvements are tracked through receipts and trust outcomes.
- Autonomy expansion recommendations are produced from trust history.
- Repeated failures, reversals, corrections, or boundary errors contract autonomy in affected domains.

## Explicit Approval Boundary

Explicit approval is required only for RMT and personal-information-sensitive actions.

RMT means purchases, money movement, bank activity, payments, transfers, subscriptions, contracts with financial/legal effect, and irreversible or externally binding financial commitments.

Personal-information-sensitive actions include exposing, transmitting, deleting, altering, or sharing personal/private data, identity information, financial records, health/private family information, passwords/secrets/tokens, contact data, private correspondence, and anything that could materially affect privacy or reputation if mishandled.
