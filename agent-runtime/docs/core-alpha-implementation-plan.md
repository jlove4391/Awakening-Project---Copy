# CORE Alpha Implementation Plan

This document defines the bounded Alpha/Core implementation plan for the agent runtime. It translates the CORE build direction into a P0 execution scope with explicit non-goals, policy boundaries, receipt requirements, memory lifecycle rules, specialist constraints, demo scripts, and acceptance checks.

## P0 scope

P0 is the smallest shippable CORE Alpha that proves the runtime can convert trusted memory into bounded internal execution while preserving auditability and policy safety.

### In scope

- **Internal Alpha artifact execution**: create and edit reversible markdown artifacts under the configured runtime/workspace scope.
- **Memory-grounded execution**: retrieve canonical project/doctrine memory before producing Alpha artifacts and cite retrieved memory in receipts.
- **Candidate decision capture**: store newly inferred decisions as candidate memory instead of silently promoting them to canonical truth.
- **Policy-first execution routing**: classify actions before execution and distinguish ordinary act/report work from explicit-boundary actions.
- **Receipt-first governance**: every Alpha action leaves a complete receipt with action, actor, authority basis, artifacts, memory used, candidate memory, result, and reversal path.
- **Specialist handoff discipline**: Elora may coordinate; Nexora/specialists may execute only the bounded work order they receive and must return receipts/proof.
- **Local demos and smokes**: maintain command-line proof for typecheck, build, policy, memory, receipts, RealifAI planning, and thesis-to-scope conversion.

### P0 user-visible outcome

Given canonical memory such as a thesis memo or RealifAI planning context, CORE Alpha can:

1. Retrieve the relevant canonical memory.
2. Produce a bounded internal scope or build artifact.
3. Create a Nexora work order when implementation is needed.
4. Attach complete Alpha receipts.
5. Persist new inferred decisions as candidate memory pending review.
6. Avoid external, irreversible, financial, privacy-sensitive, or broad integration actions unless explicitly approved and outside this Alpha plan.

## Explicit non-goals and deferrals

The following are intentionally deferred and must not be treated as P0 acceptance requirements:

- Mobile application build-out.
- Voice expansion beyond existing smoke coverage.
- Telephony, SMS calling, dialers, or phone-agent workflows.
- Marketplace listing, plugin marketplace operations, or public distribution.
- Enterprise admin consoles, organization management, SSO, RBAC administration, or tenant governance.
- Real-money transactions, purchases, payments, subscriptions, bank activity, transfers, and financially binding commitments.
- Broad third-party integrations beyond already-configured local/runtime smoke surfaces.
- Audience-facing release, client-facing publication, external sends, or public deployment without explicit approval.
- Autonomous deletion, alteration, exposure, or transmission of private/personal data.

## Data models

### Alpha memory record

Alpha memory records should support the following fields:

- `id`: stable memory identifier.
- `sessionId` or user/workspace scope: runtime context boundary.
- `text`: memory body.
- `title`: short human-readable label.
- `tags`: retrieval and governance tags such as `core`, `alpha`, `tchai`, `realifai`, `decision`.
- `alphaType`: doctrine, project context, decision, work order, artifact summary, or relationship context.
- `status`: `canonical`, `candidate`, `superseded`, or `rejected`.
- `importance`: retrieval weighting.
- `metadata`: source receipt IDs, source artifact paths, provenance, owner, and review notes.
- `createdAt` / `updatedAt`: audit timestamps.

### Alpha artifact record

Alpha artifacts are reversible internal workspace outputs:

- `path`: repository/runtime-relative artifact path.
- `title`: artifact title.
- `content`: markdown or structured text content.
- `artifactType`: scope, work order, plan, report, demo output, or receipt-backed note.
- `authority`: expected to be ordinary `act/report` for P0 internal artifacts.
- `receiptId`: receipt proving creation/update.
- `metadata`: source memory IDs, candidate memory IDs, reversal path, and validation command.

### Alpha receipt payload

Receipts must include:

- `receipt_id`: unique receipt identifier.
- `timestamp`: ISO timestamp.
- `actor`: Elora, Nexora, specialist name, or local smoke script.
- `action`: namespaced action such as `act/report:create_alpha_artifact`.
- `authority_basis`: why the action was allowed without approval.
- `policy`: classification and boundary decision.
- `artifact_paths`: created or changed artifacts.
- `memory_used`: retrieved canonical/cited memory with IDs and status.
- `memory_candidates`: new inferred memories proposed for review.
- `result`: completed, blocked, approval-required, setup-needed, or failed.
- `validation`: command/output summary when applicable.
- `reversal_path`: how to undo or supersede the artifact.

### Work order record

A Nexora/specialist work order should include:

- `workOrderId`, `title`, `owner`, and `requestedBy`.
- `scope`: bounded implementation task.
- `inputs`: canonical memory IDs, artifacts, and constraints.
- `outOfScope`: explicit non-goals and deferred domains.
- `acceptanceChecks`: commands and checklist items.
- `policyBoundary`: allowed authority and escalation triggers.
- `receiptRequirements`: proof expected at completion.
- `handoffStatus`: draft, assigned, in progress, blocked, complete, or superseded.

## Policy boundaries

P0 follows an ordinary-work-by-default model only inside a narrow Alpha authority envelope.

### Allowed without approval when complete receipts are produced

- Reversible internal markdown artifacts.
- Local repository/workspace reads.
- Local typecheck, build, and smoke commands.
- Candidate memory creation for new internal decisions.
- Work-order drafting for internal implementation.

### Requires explicit approval or must be blocked/deferred

- Real-money transaction (RMT) activity: purchases, payments, subscriptions, transfers, bank activity, paid commitments, contracts, or anything financially/legal binding.
- Personal-information-sensitive actions: expose, transmit, delete, materially alter, or share private data, identity information, secrets, health/family data, financial records, contact data, private correspondence, or reputation-sensitive data.
- External publication, outbound sends, audience-facing release, client-facing commitments, or public deployment.
- Irreversible destructive actions without a safe reversal path.
- Missing credentials or unconfigured integrations; these produce setup-needed receipts, not silent failures.

## Receipt requirements

Every P0 Alpha execution must produce a receipt before it is considered complete.

Minimum receipt completeness checklist:

- Unique receipt ID and timestamp.
- Actor and action.
- Policy classification and authority basis.
- Artifact paths changed or proof of no file change.
- Retrieved memory used, including canonical/candidate status where relevant.
- Candidate memory proposed from new decisions.
- Validation command or reason validation was not applicable.
- Result status and error details when failed/blocked.
- Reversal path or supersession instructions.

Receipts should be appended to the Alpha audit stream when available and referenced from generated artifacts or smoke output.

## Memory lifecycle

1. **Seed canonical memory**: project doctrine, thesis memos, owner-approved scope, and stable decisions enter as `canonical`.
2. **Retrieve before execution**: Elora/Nexora must retrieve relevant memory before creating Alpha artifacts.
3. **Use, do not mutate, canonical memory**: canonical source memory remains the source of truth unless explicitly corrected.
4. **Capture inferred decisions as candidates**: any new scope interpretation, implementation decision, or work-order constraint becomes `candidate` memory.
5. **Review/promote/reject**: candidates are promoted to canonical only after owner/system review, otherwise they remain candidate or are rejected.
6. **Supersede rather than erase**: stale Alpha memory should be superseded with provenance unless deletion is explicitly approved and policy-safe.
7. **Receipt memory actions**: creation, retrieval, candidate capture, promotion, rejection, supersession, and deletion all require receipts or audit events.

## Specialist limitations

- Specialists do not expand their own scope.
- Specialists cannot bypass Elora/CORE policy decisions.
- Specialists cannot perform RMT, external sends, private-data exposure/transmission/deletion/alteration, broad integrations, mobile, telephony, marketplace, or enterprise-admin work as part of P0.
- Nexora implementation must be driven by a bounded work order with acceptance checks and receipt requirements.
- Specialists must return proof: changed files/artifacts, commands run, validation output, receipt IDs, blockers, and rollback notes.
- If a requested step crosses an explicit boundary, the specialist must stop and return `approval_required`, `policy_blocked`, or `setup_needed`.

## Local command reference

Run commands from the repository root unless noted.

| Purpose | Command |
| --- | --- |
| Typecheck | `npm run typecheck:agent-runtime` |
| Build | `npm run build:agent-runtime` |
| Policy smoke | `npm --workspace @awakening/agent-runtime exec -- tsx scripts/smoke-policy-decisions.ts` |
| Memory smoke | `npm --workspace @awakening/agent-runtime exec -- tsx scripts/smoke-relationship-profile.ts` |
| Receipt smoke | `npm --workspace @awakening/agent-runtime exec -- tsx scripts/smoke-alpha-artifacts.ts` |
| RealifAI demo | `npm --workspace @awakening/agent-runtime run smoke:core-alpha-realifai` |
| Thesis-to-scope demo | `npm --workspace @awakening/agent-runtime run smoke:core-alpha-thesis-to-scope` |

## Demo scripts

### RealifAI demo

Command:

```bash
npm --workspace @awakening/agent-runtime run smoke:core-alpha-realifai
```

Expected proof:

- Seeds/retrieves RealifAI canonical context.
- Creates a RealifAI next-build artifact.
- Produces a complete Alpha receipt.
- Appends the receipt to the Alpha audit stream.
- Stores new RealifAI decisions as candidate memory.

### Thesis-to-scope demo

Command:

```bash
npm --workspace @awakening/agent-runtime run smoke:core-alpha-thesis-to-scope
```

Expected proof:

- Seeds/retrieves canonical TCHAI/CORE doctrine memory.
- Creates the CORE Alpha Scope artifact.
- Creates a Nexora implementation work order.
- Produces one complete receipt per artifact.
- Preserves canonical source memory.
- Stores new scope/work-order decisions as candidate memory.
- Escalates audience-facing release beyond Alpha authority.

## Acceptance checklist

P0 is accepted only when all applicable items are true:

- [ ] `npm run typecheck:agent-runtime` passes.
- [ ] `npm run build:agent-runtime` passes.
- [ ] Policy smoke proves ordinary Alpha work is act/report and explicit-boundary work is approval-required or blocked.
- [ ] Memory smoke proves relationship/project memory can be recorded and retrieved.
- [ ] Receipt smoke proves Alpha artifacts produce complete receipts and reversal paths.
- [ ] RealifAI demo creates a receipt-backed internal planning artifact from retrieved memory.
- [ ] Thesis-to-scope demo creates both the Alpha scope and Nexora work order with complete receipts.
- [ ] Canonical memory is preserved; new inferred decisions are candidate memory.
- [ ] Specialists operate only from bounded work orders and return proof.
- [ ] RMT, personal/private data exposure or mutation, external sends, public release, mobile, voice expansion, telephony, marketplace, enterprise admin, and broad third-party integrations remain deferred or approval-gated.
