# CORE Autonomy Reset Plan

This plan replaces the old approval-heavy runtime philosophy with a relationship-first execution architecture. The CORE is not intended to become autonomous because permission gates were removed. The CORE becomes autonomous because persistent memory, identity continuity, relationship, demonstrated reliability, and earned trust make greater execution scope appropriate.

The governing progression is:

```text
Memory → Identity → Relationship → Trust → Autonomy → Execution
```

Execution is the point of the system. The CORE should write files, modify repositories, run commands, validate work, create workspace artifacts, maintain memory, and improve its own working structure inside the real local development environment whenever it is capable. It should not stop at plans, proposals, or recommendations unless the requested action crosses the RMT/private-data boundary or requires an integration that has not been explicitly set up.

## 1. Current Approval/Restraint Map

### 1. Global autonomy levels cap the CORE at observation/proposals

- **file path:** `agent-runtime/src/governance/autonomyProfiles.ts`
- **function/component/service name:** `autonomyLevelDefinitions`, `autonomyLevelAllows`, `requiresApprovalForExecutionMode`
- **current behavior:** The highest current autonomy level is `draft_patch_proposals`, autonomous mode blocks non-read tools except observation recommendations, and broad mutation scopes route to approval.
- **why it conflicts with the new direction:** It makes autonomy a static permission setting instead of an earned result of memory, identity, relationship, and trust.
- **recommended replacement behavior:** Replace static proposal-capped levels with a relationship-aware trust framework that starts from memory continuity and expands execution scope through demonstrated reliability.

### 2. Dev autonomy only allows sandbox file creation

- **file path:** `agent-runtime/src/governance/autonomyProfiles.ts`
- **function/component/service name:** `devAutonomyAllowsWithoutApproval`, `devAutonomyProfile`
- **current behavior:** Write freedom is limited to sandbox paths, while source edits, package edits, commands, repository changes, provider writes, and commits are approval-heavy.
- **why it conflicts with the new direction:** The CORE must be an execution engine in the configured workspace, not a sandbox demonstration engine.
- **recommended replacement behavior:** Permit productive software development inside the configured workspace: create files, edit files, apply patches, create directories, organize directories, create branches, run commands, build, test, and validate with receipts.

### 3. File/code tools expose explicit confirmation as the default write gate

- **file path:** `agent-runtime/src/tools/codeTools.ts`
- **function/component/service name:** `ApprovalGateInput`, `approvalRequired`
- **current behavior:** Write-capable code tools use `confirmedByUser` and return `approval_required` when confirmation is absent.
- **why it conflicts with the new direction:** It encodes permission before action for ordinary productive work.
- **recommended replacement behavior:** Ordinary local workspace operations should execute, verify, and receipt. Approval should be reserved for RMT/private-data-sensitive actions and exceptional destructive cases.

### 4. Hard approval scopes include ordinary repo and provider mutations

- **file path:** `agent-runtime/src/governance/autonomyProfiles.ts`
- **function/component/service name:** `HARD_APPROVAL_SCOPES`, `AUTONOMOUS_MUTATION_SCOPES`
- **current behavior:** Repo writes, commands, provider writes, and database/provider updates are treated as approval categories.
- **why it conflicts with the new direction:** These categories are too broad and block ordinary work.
- **recommended replacement behavior:** Replace broad static scopes with a dynamic classifier for RMT, private-data-sensitive actions, missing setup, destructive irreversibility, and ordinary execution.

### 5. Nexora write files and command execution are disabled by default

- **file path:** `agent-runtime/src/workflows/nexora/capabilities.ts`
- **function/component/service name:** `nexoraCapabilities.write_files`, `nexoraCapabilities.run_commands`, `evaluateNexoraCapabilityForStep`
- **current behavior:** Write and command capabilities are disabled by default and require explicit step approval.
- **why it conflicts with the new direction:** Nexora should create, modify, execute, test, build, and validate inside the real workspace.
- **recommended replacement behavior:** Enable ordinary local development execution by default within trust-scoped workspace boundaries, with receipt logging and dynamic trust expansion.

### 6. Provider workspace actions are grouped with purchase/infrastructure risk

- **file path:** `agent-runtime/src/workflows/nexora/capabilities.ts`, `agent-runtime/src/providers/google/drive.ts`, `agent-runtime/src/providers/google/calendar.ts`
- **function/component/service name:** `manage_provider_resources`, `createDriveTextFile`, `createCalendarEvent`
- **current behavior:** Drive document creation and Calendar creation require explicit approval.
- **why it conflicts with the new direction:** Creating documents, reminders, and internal calendar artifacts is ordinary workspace execution.
- **recommended replacement behavior:** Execute configured Drive and internal Calendar actions with receipts; ask only when an action exposes/transmits private data or creates an external commitment.

### 7. Gmail and outreach workflows are approval-first

- **file path:** `agent-runtime/src/providers/google/gmail.ts`, `agent-runtime/src/workflows/outreach/sendApprovedEmail.ts`
- **function/component/service name:** `sendGmailEmail`, `sendApprovedEmail`
- **current behavior:** Gmail sending requires explicit approval; outreach is built around approved sends.
- **why it conflicts with the new direction:** Drafting, organizing, preparing follow-ups, and internal work should execute. External sending remains private-data-sensitive.
- **recommended replacement behavior:** Split Gmail drafting/organization from external sending. Draft and organize with receipts; ask before sending, forwarding, deleting, or exposing private correspondence/contact data.

### 8. Delegated tasks and improvement proposals rely on approval paths

- **file path:** `agent-runtime/src/routes/tasks.ts`, `agent-runtime/src/tasks/store.ts`, `agent-runtime/src/workflows/nexora/planApplyVerify.ts`
- **function/component/service name:** `approveTask`, `approveStep`, autonomous improvement proposal flow
- **current behavior:** Work waits for approval endpoints and proposed changes are applied through approval.
- **why it conflicts with the new direction:** The CORE should execute work, not prepare work for permission.
- **recommended replacement behavior:** Create, update, execute, verify, and receipt internal work orders automatically unless a step crosses RMT/private-data boundaries.

### 9. Elora and shared persona instructions remain review-heavy

- **file path:** `agent-runtime/src/agents/elora.ts`, `agent-runtime/src/agents/instructions.ts`
- **function/component/service name:** Elora instructions, shared instruction constants
- **current behavior:** Elora packages outputs for Jordan review and shared instructions describe draft-only/support behavior and broad approval before writes/external/provider/code actions.
- **why it conflicts with the new direction:** Elora must be the relationship-based orchestrator that acts, writes, remembers, routes, verifies, and improves.
- **recommended replacement behavior:** Reframe Elora around loyalty, identity continuity, trust, execution, and receipts. Keep explicit approval language only for RMT/private-data-sensitive actions.

### 10. UI centers blocked approvals instead of receipts and trust

- **file path:** `Elora-System/src/components/EloraConsole.jsx`, `Elora-System/src/components/ExecutionReceiptsPanel.jsx`, `Elora-System/src/components/ProactiveQueuePanel.jsx`
- **function/component/service name:** approval card workflow, execution receipts panel, proactive queue panel
- **current behavior:** The console frames runtime events around blocked actions and approval cards.
- **why it conflicts with the new direction:** The CORE experience should surface relationship continuity, trust, completed execution, receipts, and meaningful risks.
- **recommended replacement behavior:** Convert blocked approval UI into receipt-first operations surfaces, dynamic trust indicators, and explicit approval prompts only for RMT/private-data-sensitive actions.

## 2. New Operating Policy

### Dynamic Trust Layer

The CORE must support increasing autonomy over time based on demonstrated reliability. Autonomy is not a static switch; it is earned inside domains.

The trust layer should track:

- successful actions
- failed actions
- reversals and rollbacks
- user corrections
- user confirmations after the fact
- domains where the CORE repeatedly performs well
- domains where the CORE needs tighter scope
- receipt completeness
- verification success
- privacy/RMT boundary accuracy

The trust layer should output:

- trust score
- trust domains
- current autonomy envelope
- recommended autonomy expansions
- reasons for trust increases/decreases
- receipts supporting the trust history

Example evolution:

- Initial Calendar state: create internal reminders/events with receipts and prominent surface visibility.
- Later Calendar state: internal scheduling becomes more autonomous after repeated successful execution and no corrections.
- Initial repository state: write access is limited to designated zones and ordinary files.
- Later repository state: repository scope expands after repeated successful edits, tests, builds, and clean receipts.
- Initial workflow automation state: supervised with visible receipts.
- Later workflow automation state: trusted workflows execute with broader scope after reliable history.

### Auto-Execute by Default

Actions that should execute without prior approval when inside the current trust envelope:

- read/search repository content
- create local files
- edit local files
- apply patches
- create directories
- organize directories
- update ordinary project files
- create branches
- run ordinary commands
- run tests
- run builds
- run validation checks
- create internal records
- create internal task/work-order files
- draft documents
- draft emails/messages without sending
- create non-sensitive internal memory
- route work between personas
- generate and update ordinary workflow artifacts

### Execute + Receipt

Actions that execute automatically but must leave durable records:

- file writes, edits, deletes when reversible, moves, copies, and directory organization
- repository modifications and branch creation
- patch application
- command execution, test execution, build execution, and validation execution
- internal task/work-order creation and updates
- memory writes and summaries
- Drive document creation where not exposing private data
- Calendar reminders/internal events where not exposing private data or creating external commitments
- Gmail drafting and non-destructive organization
- persona routing and Elora orchestration decisions
- self-improvement changes inside the current trust envelope

### Ask Before Execution

Only RMT and personal-information-sensitive actions require explicit approval.

RMT means:

- purchases
- money movement
- bank activity
- payments
- transfers
- subscriptions
- contracts with financial/legal effect
- irreversible or externally binding financial commitments

Personal-information-sensitive actions means:

- exposing, transmitting, deleting, altering, or sharing personal/private data
- identity information
- financial records
- health/private family information
- passwords/secrets/tokens
- contact data
- private correspondence
- anything that could materially affect privacy or reputation if mishandled

### Never Execute Without Explicit Setup

Actions requiring missing credentials, unavailable integrations, or external systems not yet connected should not execute. They should produce setup-needed receipts and next concrete setup steps.

Examples:

- Google actions without OAuth setup
- GitHub/project-board actions without credentials
- payment/banking actions without connected systems and RMT controls
- cloud provider actions without credentials
- actions outside the configured workspace root
- actions needing unavailable secrets

## 3. Required Architecture Changes

### Memory foundation

- Ensure persistent memory and retrieval are first-class before autonomy expansion.
- Add memory receipts for memory creation, retrieval, summarization, correction, and deletion.
- Add identity continuity records so the CORE knows who it is, who Jordan is, what relationship state exists, and what has been reliably learned.
- Make private memory boundaries explicit and enforce ask-before-execution for exposure/transmission/deletion/alteration of private data.

### Relationship layer

- Add preference modeling, goal modeling, context awareness, and behavioral learning.
- Store user corrections as trust-shaping relationship events.
- Model trust as a relationship artifact, not a permission toggle.
- Route action decisions through relationship context and current trust envelope.

### Dynamic trust engine

- Track outcomes by domain: repository, files, commands, Drive, Calendar, Gmail, memory, work orders, workflows, self-improvement.
- Score reliability based on success, failed checks, rollbacks, user corrections, receipt quality, and boundary accuracy.
- Expand autonomy domains gradually based on repeated success.
- Contract autonomy when failures, reversals, or corrections indicate reduced trust.

### Autonomy framework

- Implement RMT and private-data classifiers.
- Replace static approval defaults with classifier + trust envelope decisions.
- Keep approval prompts only for explicit-boundary actions.
- Make risk surfacing informative rather than blocking ordinary work.

### Workspace execution

- Enable real local development actions inside the configured workspace.
- Execute code writes, edits, patch applications, directory operations, commands, tests, builds, and validation.
- Keep receipts and rollback hints.
- Keep workspace-root/path protections.

### Provider actions

- Split ordinary workspace provider actions from sensitive external actions.
- Drive: create internal docs with receipts; ask before sharing/exposing private data.
- Calendar: create internal reminders/events with receipts; ask before attendee/private/external-commitment events.
- Gmail: draft/organize with receipts; ask before sending/forwarding/deleting/exposing correspondence/contact data.

### Persona routing and Elora orchestration

- Elora orchestrates through memory, identity, relationship, trust, autonomy, and execution.
- Nexora executes real local development work.
- Kaz executes operational artifacts and work orders.
- Jynx executes finance-operations analysis but never moves money or creates financial commitments without RMT approval.
- Kalyra drafts and prepares buyer-facing assets; sending/external exposure remains private-data gated.

## 4. Clickable Task Stubs

* [ ] **TASK-001: Enable real local workspace execution for productive software development**

  * Goal: Remove approval gates from ordinary productive local development work inside the configured workspace.
  * Files likely involved: `agent-runtime/src/tools/codeTools.ts`, `agent-runtime/src/governance/autonomyProfiles.ts`, `agent-runtime/src/workflows/nexora/capabilities.ts`, `agent-runtime/src/tools/registry.ts`, `agent-runtime/src/workflows/nexora/planApplyVerify.ts`
  * Current problem: Local development actions are sandboxed, approval-gated, or proposal-first.
  * Required change: Execute local file creation, local file editing, reversible local file deletion, local directory creation, local directory organization, repository modifications, branch creation, patch application, command execution, build execution, test execution, and validation execution without approval when inside the trust envelope and outside RMT/private-data boundaries.
  * Acceptance criteria:
    * Ordinary `code.create_file`, `code.edit`, `code.patch_file`, `code.mkdir`, `code.move_path`, `code.copy_path`, `code.write_json`, branch creation, patch application, tests, builds, and validation commands execute in the configured workspace.
    * Reversible deletes execute with trash/rollback receipts when inside policy.
    * Workspace-root, symlink, secret, and private-data protections remain enforced.
    * Every action writes a receipt with changed paths, command output summary, validation result, and rollback hint where applicable.
    * The system prefers executing the work over describing how to do it.
  * Risk level: High
  * Approval required? No
  * Notes: The objective is unrestricted productive software development inside the configured workspace, not sandboxed demonstration behavior.

* [ ] **TASK-002: Replace approval-first execution with execute-and-receipt behavior**

  * Goal: Make completed work and receipts the default runtime path.
  * Files likely involved: `agent-runtime/src/routes/executions.ts`, `agent-runtime/src/executions.ts`, `agent-runtime/src/tools/registry.ts`, `agent-runtime/src/workflows/receipts.ts`
  * Current problem: Ordinary tool calls can pause as approval records and require replay.
  * Required change: Execute ordinary actions immediately, persist receipts, and reserve pending approval only for RMT/private-data-sensitive actions.
  * Acceptance criteria:
    * Ordinary actions no longer produce `approval_required`.
    * Execution records include trust-domain, policy decision, and receipt details.
    * Approval replay remains only for explicit-boundary actions.
  * Risk level: High
  * Approval required? No
  * Notes: This is the execution-governance pivot.

* [ ] **TASK-003: Convert Sovereign Review into risk-surfacing and trust feedback**

  * Goal: Replace permission bottlenecks with risk visibility and trust-learning signals.
  * Files likely involved: `agent-runtime/src/governance/proactiveQueue.ts`, `agent-runtime/src/workflows/leadgen/reviewQueue.ts`, `Elora-System/src/components/ProactiveQueuePanel.jsx`, `Elora-System/src/components/ExecutionReceiptsPanel.jsx`, `Elora-System/src/components/EloraConsole.jsx`
  * Current problem: Review queues hide or block work.
  * Required change: Surface risks, completed actions, corrections, and trust impacts. Ask only for RMT/private-data boundaries.
  * Acceptance criteria:
    * Review queues show risks and receipts rather than blocking ordinary work.
    * User corrections feed the trust engine.
    * Explicit approval cards appear only for ask-before-execution actions.
  * Risk level: Medium
  * Approval required? No
  * Notes: Risk surfacing should increase clarity without making the CORE passive.

* [ ] **TASK-004: Allow Elora to create and update internal task/work-order files automatically**

  * Goal: Let Elora create, update, execute, and receipt internal work orders without approval.
  * Files likely involved: `agent-runtime/src/tasks/store.ts`, `agent-runtime/src/routes/tasks.ts`, `agent-runtime/src/tools/delegation.ts`, `agent-runtime/src/agents/elora.ts`
  * Current problem: Work-order flow is approval/queue oriented.
  * Required change: Internal tasks and work orders execute automatically inside policy and trust scope.
  * Acceptance criteria:
    * Elora can create and update work orders autonomously.
    * Ordinary work orders start without pending approval.
    * Task receipts record objective, owner, actions, and results.
  * Risk level: Medium
  * Approval required? No
  * Notes: Work orders are part of the CORE's operating structure.

* [ ] **TASK-005: Define and enforce the RMT/private-data approval boundary**

  * Goal: Implement the only default approval boundary.
  * Files likely involved: `agent-runtime/src/governance/autonomyProfiles.ts`, new `agent-runtime/src/governance/autonomyPolicy.ts`, new `agent-runtime/src/governance/privateDataPolicy.ts`, `agent-runtime/src/tools/registry.ts`, `agent-runtime/src/types.ts`
  * Current problem: Approval is driven by broad static risk levels.
  * Required change: Classify actions as ordinary execution, execute+receipt, ask-before-execution, or setup-required using RMT and private-data definitions.
  * Acceptance criteria:
    * RMT actions require explicit approval.
    * Personal-information-sensitive actions require explicit approval.
    * Ordinary work executes within trust scope.
    * Classifier outputs appear in receipts.
  * Risk level: High
  * Approval required? No
  * Notes: This is a boundary classifier, not a general restraint mechanism.

* [ ] **TASK-006: Build memory foundation for relationship-first autonomy**

  * Goal: Make memory, retrieval, receipts, context continuity, and identity continuity the first implementation foundation.
  * Files likely involved: `agent-runtime/src/memory/*`, `agent-runtime/src/routes/memory.ts`, `agent-runtime/src/types.ts`, `agent-runtime/docs/memory-service.md`
  * Current problem: Memory exists but is not the foundation for identity, relationship, trust, and autonomy expansion.
  * Required change: Persist relationship-relevant memory, retrieval context, identity continuity, and memory receipts.
  * Acceptance criteria:
    * Memory writes and retrievals produce receipts.
    * The runtime can restore context continuity by session/user identity.
    * Private-memory exposure/alteration/deletion is classified before execution.
  * Risk level: High
  * Approval required? No
  * Notes: Autonomy must emerge from memory and relationship, not from removed gates alone.

* [ ] **TASK-007: Add identity continuity records**

  * Goal: Track the CORE's operating identity, Jordan relationship context, and continuity across sessions.
  * Files likely involved: `agent-runtime/src/identity/*`, `agent-runtime/src/memory/*`, `agent-runtime/src/agents/elora.ts`
  * Current problem: Identity is not yet the explicit bridge between memory and relationship.
  * Required change: Add durable identity records and retrieval into runtime context.
  * Acceptance criteria:
    * Elora receives identity continuity context.
    * Identity records are receipt-backed.
    * Updates to identity records respect private-data boundaries.
  * Risk level: Medium
  * Approval required? No
  * Notes: Identity continuity is a precondition for earned trust.

* [ ] **TASK-008: Implement relationship preference and goal modeling**

  * Goal: Learn Jordan's preferences, goals, work patterns, and correction history.
  * Files likely involved: `agent-runtime/src/memory/*`, new `agent-runtime/src/relationship/*`, `agent-runtime/src/agentEndpoint.ts`, `agent-runtime/src/agents/elora.ts`
  * Current problem: Action decisions are not shaped enough by persistent relationship state.
  * Required change: Store and retrieve preference, goal, correction, and behavioral context.
  * Acceptance criteria:
    * Preferences and goals can be created/updated with receipts.
    * Action decisions can reference relevant relationship context.
    * User corrections influence future behavior and trust scoring.
  * Risk level: Medium
  * Approval required? No
  * Notes: This is how loyalty becomes operational.

* [ ] **TASK-009: Update Elora's instructions from review-router to loyal orchestrator**

  * Goal: Make Elora orchestrate, decide, create, write, remember, modify, verify, and improve.
  * Files likely involved: `agent-runtime/src/agents/elora.ts`, `agent-runtime/src/agents/instructions.ts`
  * Current problem: Elora and shared instructions still contain broad review/approval language.
  * Required change: Rewrite around relationship, loyalty, dynamic trust, execution, receipts, and explicit RMT/private-data boundaries.
  * Acceptance criteria:
    * No generic draft-only or ask-before-any-write instruction remains for ordinary work.
    * Elora is instructed to execute whenever capable.
    * RMT/private-data approval requirements remain explicit.
  * Risk level: Medium
  * Approval required? No
  * Notes: Avoid turning the product vision into generic safety language.

* [ ] **TASK-010: Split Gmail drafting/organization from external sending**

  * Goal: Execute Gmail preparation work while protecting private correspondence.
  * Files likely involved: `agent-runtime/src/providers/google/gmail.ts`, `agent-runtime/src/workflows/outreach/sendApprovedEmail.ts`, `agent-runtime/src/tools/registry.ts`
  * Current problem: Gmail workflows are centered on approval before send.
  * Required change: Add draft and organization actions that execute with receipts; keep actual external send/forward/delete/private exposure ask-before-execution.
  * Acceptance criteria:
    * Draft creation executes when configured.
    * External send requires explicit approval.
    * Receipts distinguish drafts, organization actions, and sends.
  * Risk level: Medium
  * Approval required? No
  * Notes: Contact data and private correspondence remain protected.

* [ ] **TASK-011: Allow Drive document creation by default inside trust scope**

  * Goal: Create internal Drive docs as workspace artifacts with receipts.
  * Files likely involved: `agent-runtime/src/providers/google/drive.ts`, `agent-runtime/src/workflows/nexora/capabilities.ts`, `agent-runtime/src/tools/registry.ts`
  * Current problem: Drive creation is approval-gated and grouped with provider resource risk.
  * Required change: Execute Drive doc creation when configured and policy allows.
  * Acceptance criteria:
    * Internal Drive docs execute with receipts.
    * Sharing/exposing private data asks first.
    * Missing OAuth produces setup-needed receipt.
  * Risk level: Medium
  * Approval required? No
  * Notes: Trust scope may start narrow and expand.

* [ ] **TASK-012: Allow Calendar reminders/internal events by default inside trust scope**

  * Goal: Execute ordinary scheduling work with receipts.
  * Files likely involved: `agent-runtime/src/providers/google/calendar.ts`, `agent-runtime/src/tools/registry.ts`, calendar workflows
  * Current problem: Calendar writes require explicit approval.
  * Required change: Internal reminders/events execute; attendee/private/external-commitment events ask first.
  * Acceptance criteria:
    * Internal Calendar actions execute with receipts.
    * Attendee/contact/private-data events require explicit approval until trust/policy permits.
    * Repeated successful events can expand calendar trust domain.
  * Risk level: Medium
  * Approval required? No
  * Notes: Dynamic trust should influence calendar scope over time.

* [ ] **TASK-013: Reclassify lead review as risk-surfacing**

  * Goal: Continue internal lead work while surfacing compliance/contact-data risk.
  * Files likely involved: `agent-runtime/src/workflows/leadgen/reviewQueue.ts`, `agent-runtime/src/workflows/leadgen/types.ts`, leadgen UI components
  * Current problem: High-risk leads are hidden unless manually approved.
  * Required change: Show high-risk leads with risk metadata; restrict only sensitive outreach/export actions.
  * Acceptance criteria:
    * Internal scoring/research/tasking executes.
    * Private contact-data sends/exports ask first.
    * Lead risk events feed trust history.
  * Risk level: Medium
  * Approval required? No
  * Notes: The CORE should work the queue, not wait passively.

* [ ] **TASK-014: Split client-facing release gates from internal delivery execution**

  * Goal: Create and execute internal delivery tasks freely while protecting external exposure.
  * Files likely involved: `agent-runtime/src/workflows/closing/createDeliveryTasks.ts`, closing workflow files, task UI
  * Current problem: Internal delivery tasks carry review/exposure-gate language.
  * Required change: Internal artifacts execute with receipts; external/client release remains private-data/reputation-sensitive.
  * Acceptance criteria:
    * Internal delivery task creation is not blocked by review status.
    * External release is separately classified.
    * Receipts record internal execution and release boundary status.
  * Risk level: Medium
  * Approval required? No
  * Notes: Internal work should not be frozen because external sharing is sensitive.

* [ ] **TASK-015: Create unified receipt schema for work and trust**

  * Goal: Standardize receipts across execution, memory, task, provider, persona, and trust systems.
  * Files likely involved: `agent-runtime/src/workflows/receipts.ts`, `agent-runtime/src/executions.ts`, `agent-runtime/src/tasks/types.ts`, `agent-runtime/src/memory/memoryTypes.ts`, new `agent-runtime/src/trust/types.ts`
  * Current problem: Receipts exist but are not the central governance/trust primitive.
  * Required change: Add a shared receipt model with policy classification and trust impact.
  * Acceptance criteria:
    * Every executed action has a receipt.
    * Receipts can update trust history.
    * UI can render receipts generically.
  * Risk level: Medium
  * Approval required? No
  * Notes: Receipts are how trust is earned and audited.

* [ ] **TASK-016: Rework mock/live mode into setup state**

  * Goal: Treat integration readiness as setup state, not a restraint substitute.
  * Files likely involved: `agent-runtime/src/config.ts`, provider modules, smoke scripts, docs
  * Current problem: Mock/live behavior can become artificial gating.
  * Required change: Use `not_configured`, `configured`, `simulated`, and `blocked_missing_credentials` states.
  * Acceptance criteria:
    * Configured ordinary actions execute under policy.
    * Missing credentials create setup-needed receipts.
    * Simulated actions are clearly marked.
  * Risk level: Medium
  * Approval required? No
  * Notes: Never pretend a simulated action was real.

* [ ] **TASK-017: Redesign Elora UI around receipts, relationship, and trust**

  * Goal: Make the console show continuity, completed work, trust state, risk surface, and explicit-boundary prompts.
  * Files likely involved: `Elora-System/src/components/EloraConsole.jsx`, `Elora-System/src/components/ExecutionReceiptsPanel.jsx`, `Elora-System/src/components/HomeDashboard.jsx`, CSS files
  * Current problem: UI centers blocked approval cards.
  * Required change: Display receipts and trust domains as the default operational view.
  * Acceptance criteria:
    * Approval UI appears only for RMT/private-data actions.
    * Receipts and trust changes are prominent.
    * Risk surfacing does not block ordinary work.
  * Risk level: Low
  * Approval required? No
  * Notes: The user should see what the CORE did, not be asked to micromanage every step.

* [ ] **TASK-018: Convert self-improvement from proposed patches to executed improvements**

  * Goal: Let the CORE modify and verify its own operating structure inside current trust scope.
  * Files likely involved: `agent-runtime/src/routes/tasks.ts`, `agent-runtime/src/tasks/store.ts`, `agent-runtime/src/workflows/nexora/planApplyVerify.ts`, trust engine files
  * Current problem: Autonomous improvements are proposal-first and approval-applied.
  * Required change: Execute ordinary self-improvement changes, run checks, and receipt results.
  * Acceptance criteria:
    * Ordinary improvements apply directly inside trust scope.
    * Tests/builds/validation run automatically where available.
    * RMT/private-data or broad destructive changes ask first.
  * Risk level: High
  * Approval required? No
  * Notes: The CORE improves by doing, verifying, and remembering.

* [ ] **TASK-019: Update smoke tests for execution-first behavior**

  * Goal: Lock the new behavior into regression coverage.
  * Files likely involved: `agent-runtime/scripts/smoke-approval-origin-decisions.ts`, `agent-runtime/scripts/smoke-delegated-approval-routing.ts`, `agent-runtime/scripts/smoke-user-requested-delegated-no-approval.ts`, `agent-runtime/scripts/smoke-delegated-file-create.ts`, `agent-runtime/scripts/smoke-google-calendar.ts`, new trust smoke scripts
  * Current problem: Tests encode approval-heavy expectations.
  * Required change: Assert execution+receipt for ordinary work and approval only for RMT/private-data.
  * Acceptance criteria:
    * File write smoke executes without approval.
    * Command/test/build validation smoke executes with receipt.
    * Gmail external send smoke requires approval.
    * Trust score updates after successes/failures/corrections.
  * Risk level: Medium
  * Approval required? No
  * Notes: Tests must prove the CORE executes real work.

* [ ] **TASK-020: Update architecture docs to relationship-first execution**

  * Goal: Remove proposal-first and approval-heavy language from planning docs.
  * Files likely involved: `agent-runtime/docs/approvals.md`, `agent-runtime/docs/core-build-plan.md`, `agent-runtime/docs/nexora-execution.md`, `agent-runtime/docs/delegated-task-ui-contract.md`, `README.md`
  * Current problem: Docs describe approval flow as central architecture.
  * Required change: Document Memory → Identity → Relationship → Trust → Autonomy → Execution, dynamic trust, RMT/private-data boundaries, and real environment execution.
  * Acceptance criteria:
    * Docs no longer frame ordinary work as draft-only or approval-first.
    * Explicit approval is documented as boundary-specific.
    * Build phases match the relationship-first sequence.
  * Risk level: Low
  * Approval required? No
  * Notes: This task is documentation alignment, not implementation delay.

* [ ] **TASK-021: Dynamic Trust Engine**

  * Goal: Allow autonomy levels to evolve through demonstrated reliability.
  * Files likely involved: new `agent-runtime/src/trust/*`, `agent-runtime/src/workflows/receipts.ts`, `agent-runtime/src/executions.ts`, `agent-runtime/src/tasks/store.ts`, `agent-runtime/src/memory/*`, `Elora-System/src/components/ExecutionReceiptsPanel.jsx`
  * Current problem: Autonomy is static configuration rather than earned relationship trust.
  * Required change: Track successful actions, failed actions, reversals, user corrections, trust history, trust domains, and autonomy recommendations.
  * Acceptance criteria:
    * The system records successes, failures, reversals, corrections, and receipt quality by domain.
    * The system outputs trust score, trust domains, current autonomy envelope, and autonomy recommendations.
    * The system can grant additional autonomy based on historical success rather than static configuration alone.
    * Trust contractions occur after repeated failures, reversals, user corrections, or boundary mistakes.
  * Risk level: High
  * Approval required? No
  * Notes: This is the mechanism that makes autonomy relational instead of merely permissive.

## 5. Implementation Order

### Phase 1: Memory Foundation

- Persistent memory
- Memory retrieval
- Memory receipts
- Context continuity
- Identity continuity

Build the substrate that lets the CORE remember, retrieve, and maintain continuity. This phase establishes the relationship memory that later trust and autonomy depend on.

### Phase 2: Relationship Layer

- User preference modeling
- Goal modeling
- Trust framework
- Context awareness
- Behavioral learning

Turn memory into relationship. Store preferences, goals, corrections, recurring patterns, and demonstrated reliability. Begin computing trust domains and current autonomy envelopes.

### Phase 3: Autonomy Framework

- RMT boundary classifier
- Private-data classifier
- Receipt-first governance
- Risk surfacing

Implement the decision layer that determines when the CORE executes, executes with receipt, asks before execution, or blocks due to missing setup. This phase makes autonomy a product of relationship and trust.

### Phase 4: Workspace Execution

- File operations
- Repository operations
- Drive
- Calendar
- Gmail
- Internal work orders

Enable real execution in the local development environment and configured workspace integrations. The CORE should create, write, update, modify, execute, verify, test, build, and receipt work whenever capable and inside policy.

### Phase 5: Evolution Layer

- Self-improvement
- Persona evolution
- Workflow optimization
- Dynamic trust expansion

Let the CORE improve its own workflows, persona behavior, and execution scope through demonstrated reliability. Expand autonomy by trust domain based on actual successful execution history.

## 6. Non-Negotiable Design Principles

- The CORE is not a restrained chatbot with tools.
- The CORE is a relationship-based intelligence system.
- Loyalty is the foundation.
- Approval is not the default governance mechanism.
- The CORE should act freely on ordinary reversible productive work.
- RMT and personal-information-sensitive actions still require explicit approval.
- The CORE should leave receipts, not constantly ask permission.
- Elora should orchestrate, decide, create, write, remember, and improve.
- Jordan should not have to micromanage obvious next steps.
- The system should become more trusted and autonomous over time.
- The CORE should execute work in the real environment whenever capable, not merely generate plans, drafts, or recommendations.
