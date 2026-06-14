# Core Build Plan

This plan documents the recommended implementation order for the agent runtime and revenue workflow buildout. Each phase should be treated as a gate: do not begin implementation of a later phase until the acceptance conditions for the current phase are satisfied or explicitly waived by the project owner.

## Phase 1: Stabilization

Stabilize the existing runtime foundation before adding new business workflows. The goal is to make the core agent loop, memory, approvals, provider adapters, and smoke-test paths reliable enough to support later automation.

### Implementation focus

- Keep Elora's local text loop stable through `POST /api/chat` with streaming server-sent events.
- Verify session persistence and memory recall across runtime restarts.
- Confirm Google OAuth linking, status reporting, and server-side token storage.
- Ensure high-risk provider write actions require explicit human approval and can replay after approval.
- Confirm execution receipts and audit logs are written for tool calls.
- Maintain the Phase 1 smoke-test documentation and scripts as the baseline regression suite.

### Acceptance conditions

- The Elora chat smoke test passes and emits the expected `session`, `memory`, `delta` or final output, and `completed` events.
- A saved `sessionId` can be reused after runtime restart, and Elora can recall relevant prior context.
- Google OAuth `/start` and `/status` work without exposing access or refresh tokens.
- Google Calendar read smoke testing passes against the same execution path used by the agent runtime.
- Calendar write actions remain pending until approved and replay successfully after approval.
- Execution receipts and audit log entries are visible for successful, failed, and approval-gated tool executions.

## Phase 2: Kaz/Jynx

Add and harden the Kaz and Jynx specialist agents after the runtime foundation is stable. The goal is to make specialist routing predictable while keeping shared tools, memory, receipts, and approval policies consistent.

### Implementation focus

- Define Kaz and Jynx agent instructions, tool access, and role boundaries.
- Route eligible requests from the general agent experience to the appropriate specialist.
- Ensure specialist responses preserve the same session and memory semantics as Elora.
- Apply the existing tool registry, approval, and audit patterns to specialist tool use.
- Add smoke coverage for direct specialist execution and routed specialist execution.

### Acceptance conditions

- Kaz and Jynx can each be invoked directly through the runtime with documented request shapes.
- Routing logic selects Kaz and Jynx only for their intended domains and falls back safely when uncertain.
- Specialist runs produce execution receipts and audit records for tool calls.
- Specialist runs preserve session continuity and relevant memory references.
- Smoke tests or scripted checks cover direct and routed Kaz/Jynx paths.

## Phase 3: Intake

Build the intake workflow that captures raw opportunities, classifies them, stores a structured intake record, and routes the record for review or specialist handling.

### Implementation focus

- Normalize intake inputs from chat, manual form entries, documents, or imported lead notes.
- Classify intake type, urgency, business context, and required specialist path.
- Create durable intake records with enough source context for review.
- Package intake records for human review before downstream automation acts on them.
- Route approved intake records to the correct specialist or workflow queue.

### Acceptance conditions

- A raw intake submission creates a durable structured intake record.
- Intake classification includes type, urgency, recommended owner, and confidence.
- Low-confidence or high-risk intake records are sent to human review rather than automated execution.
- Approved intake records can be routed to the correct specialist or queue.
- Intake smoke testing verifies record creation, classification, packaging, and routing.

## Phase 4.1: Provider-Based Lead Sources

Add provider-based lead sourcing so lead generation can pull candidates from configured providers while preserving source attribution and reviewability.

### Implementation focus

- Define a provider interface for lead source adapters.
- Connect supported providers such as manual import, Sheets, synthetic/dev data, web research, Atlas, Clay, or Manus-style research adapters.
- Normalize leads into a shared lead schema with source metadata.
- Deduplicate leads across providers and preserve enrichment provenance.
- Keep provider failures isolated so one source cannot break the entire lead import run.

### Acceptance conditions

- At least one real or configured provider can import leads through the shared lead source interface.
- Imported leads include source provider, source record identifier when available, timestamp, and normalized contact/company fields.
- Duplicate leads are detected or flagged before review.
- Provider errors are surfaced in receipts without dropping successful results from other providers.
- A smoke test demonstrates provider import, normalization, and source attribution.

## Phase 4.2: Lead Review Queue

Introduce a human review queue that gates lead quality before outreach, enrichment, or CRM sync actions proceed.

### Implementation focus

- Create review states for pending, approved, rejected, needs enrichment, and deferred leads.
- Show enough lead, source, ICP, and enrichment context for a reviewer to make a decision.
- Capture reviewer decisions and notes as durable audit context.
- Prevent unapproved leads from entering outbound outreach workflows.
- Support bulk decisions only when guardrails and preview data are clear.

### Acceptance conditions

- Imported leads enter a pending review queue by default.
- Reviewers can approve, reject, defer, or request enrichment for individual leads.
- Reviewer identity, timestamp, decision, and notes are persisted.
- Rejected or deferred leads cannot be sent to outreach accidentally.
- Approved leads can be selected by the outreach workflow with their review history attached.

## Phase 4.3: Gmail Outreach Loop

Build the Gmail-based outbound loop for approved leads, including draft generation, approval gating, send execution, reply classification, and follow-up scheduling.

### Implementation focus

- Generate personalized outreach drafts from approved lead context and campaign constraints.
- Require human approval before sending Gmail messages.
- Send approved email through the Gmail provider adapter.
- Track sent messages, thread identifiers, reply status, opt-outs, and scheduled follow-ups.
- Classify replies into interested, objection, not now, unsubscribe, bounce, or needs human review.

### Acceptance conditions

- Outreach drafts can only be generated for approved leads.
- Gmail send actions require explicit human approval before execution.
- Sent emails produce execution receipts and audit entries with sanitized message metadata.
- Replies are classified and routed to the correct next state.
- Opt-out or unsubscribe signals stop future outreach for that contact.
- Follow-up scheduling respects campaign limits and lead state.

## Phase 4.4: Qualification Loop

Add a structured qualification loop that scores interested leads and determines whether they should advance to proposal, nurture, or disqualification.

### Implementation focus

- Import or summarize qualification conversations from email, chat, notes, or calls.
- Score leads against ICP, pain, budget, authority, urgency, fit, and next-step readiness.
- Create qualification gates that require enough evidence before advancing.
- Generate recommended next actions and missing-question prompts.
- Preserve qualification rationale for review and future learning.

### Acceptance conditions

- Qualification records can be created from lead context and conversation evidence.
- Scores include both numeric/structured fields and human-readable rationale.
- Leads below the configured threshold do not advance to proposal automatically.
- Missing required qualification evidence is surfaced as specific follow-up questions.
- Qualified leads can be handed off to the proposal workflow with the full rationale attached.

## Phase 4.5: Proposal Engine

Build the proposal engine that turns qualified opportunities into reviewable proposal packages.

### Implementation focus

- Convert qualification evidence into scope, outcomes, assumptions, pricing inputs, timeline, risks, and next-step recommendations.
- Generate proposal packages with editable sections rather than opaque final-only copy.
- Add a review-call gate when proposal confidence or deal risk requires more information.
- Store proposal versions and reviewer feedback.
- Keep sending or sharing proposals behind explicit approval.

### Acceptance conditions

- A qualified opportunity can produce a structured proposal package.
- Proposal packages include scope, outcomes, assumptions, timeline, pricing inputs, risks, and recommended next step.
- Low-confidence packages trigger a review-call or missing-info gate.
- Proposal revisions preserve version history and reviewer notes.
- No proposal is sent externally without explicit approval.

## Phase 4.6: Objection Engine

Add objection handling that extracts objections from conversations, prepares responses, and improves future discovery questions.

### Implementation focus

- Extract objections from replies, calls, notes, and meeting transcripts.
- Categorize objections such as price, timing, authority, trust, fit, priority, or competition.
- Generate call insight reports and recommended better questions.
- Link objections back to lead, qualification, and proposal records.
- Keep sensitive or high-stakes responses in human review before sending.

### Acceptance conditions

- Objections can be extracted from representative conversation inputs.
- Each objection has a category, evidence excerpt or summary, severity, and recommended response path.
- Call insight reports identify patterns and gaps in qualification.
- Better-question recommendations can be attached to future outreach or discovery scripts.
- External objection responses remain approval-gated.

## Phase 4.7: Closing/Kickoff

Create the closing and kickoff workflow that captures a close, starts onboarding, and creates the first-win delivery plan.

### Implementation focus

- Capture closed-won, closed-lost, and stalled outcomes with reasons.
- For closed-won deals, create a first-win plan, kickoff checklist, delivery tasks, and welcome sequence.
- Transfer relevant sales context into delivery context without leaking irrelevant internal notes.
- Trigger calendar, email, task, or CRM actions through approval-aware provider adapters.
- Preserve close rationale and onboarding commitments for auditability.

### Acceptance conditions

- Closed-won and closed-lost outcomes can be recorded with structured reasons.
- Closed-won opportunities produce a first-win plan and kickoff task list.
- Welcome or kickoff messages are drafted and approval-gated before sending.
- Delivery tasks include owner, due date or timing, source opportunity, and success criteria.
- The closing smoke path verifies capture, kickoff planning, welcome draft, and task creation.

## Phase 5: Voice Qualification

Layer voice qualification on top of the text-based qualification system once the underlying gates and qualification records are stable.

### Implementation focus

- Capture voice session metadata, transcripts, consent state, and adapter readiness.
- Sync transcripts into qualification records with source attribution.
- Enforce booking and high-risk action gates during voice interactions.
- Summarize voice calls into qualification evidence, missing questions, and recommended next steps.
- Ensure telephony and meeting paths fail closed when required readiness flags are disabled.

### Acceptance conditions

- Voice sessions can attach transcripts to the correct lead or qualification record.
- Transcript sync preserves source, timestamp, and consent/readiness metadata.
- Booking or follow-up actions require the configured gates and approvals.
- Voice qualification summaries update scoring evidence without overwriting human-reviewed fields unexpectedly.
- Voice smoke testing covers browser, phone-call, meeting, and fail-closed readiness paths.

## Phase 6: Direct Clay/CRM Automation

Automate direct Clay and CRM operations only after lead review, outreach, qualification, and closing states are reliable.

### Implementation focus

- Define Clay and CRM adapters with explicit read/write capabilities.
- Map internal lead, contact, account, opportunity, qualification, proposal, and close states to external records.
- Support dry-run previews for write operations.
- Require approval for high-impact record creation, updates, merges, and lifecycle-stage changes.
- Maintain bidirectional sync receipts and conflict handling.

### Acceptance conditions

- Clay and CRM adapters expose documented capabilities through the provider/tool registry.
- Dry-run previews show exactly what records would be created or updated.
- Approved writes create or update external records and return stable external identifiers.
- Conflicts or duplicate matches are sent to human review rather than overwritten automatically.
- Sync runs produce receipts with sanitized request/response metadata and conflict summaries.

## Phase 7: Content/Social DM Workflows

Add content and social direct-message workflows after the core sales operating loop is stable and auditable.

### Implementation focus

- Generate content ideas and social DM drafts from approved campaign strategy, ICP, and offer context.
- Keep platform-specific publishing and DM sends approval-gated.
- Track replies, engagement, opt-outs, and conversion into intake or lead records.
- Respect platform rules, rate limits, and user-defined brand constraints.
- Route interested social replies into the intake, lead review, or qualification workflows as appropriate.

### Acceptance conditions

- Content and DM drafts include campaign, ICP, platform, and source context.
- Publishing and DM-send actions require explicit approval and produce receipts.
- Social replies can create or update intake/lead records with source attribution.
- Opt-outs and negative signals suppress future social outreach to that contact or account.
- Workflow smoke tests cover draft generation, approval gating, reply capture, and handoff into the core sales loop.
