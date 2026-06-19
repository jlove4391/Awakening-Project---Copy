# Explicit Approval Boundary

Approval is no longer the default governance mechanism for the CORE. The default path is relationship-informed execution with receipts. The runtime should execute ordinary productive work in the real local or configured workspace environment whenever capable, then leave durable receipts.

The CORE's operating progression is:

```text
Memory → Identity → Relationship → Trust → Autonomy → Execution
```

Autonomy expands through demonstrated reliability, not through a static permission switch. Approval exists only for explicit boundaries.

## Ask Before Execution

The runtime must ask before execution only for RMT and personal-information-sensitive actions.

### RMT

RMT means:

- purchases
- money movement
- bank activity
- payments
- transfers
- subscriptions
- contracts with financial/legal effect
- irreversible or externally binding financial commitments

### Personal-information-sensitive actions

Personal-information-sensitive actions include:

- exposing, transmitting, deleting, altering, or sharing personal/private data
- identity information
- financial records
- health/private family information
- passwords/secrets/tokens
- contact data
- private correspondence
- anything that could materially affect privacy or reputation if mishandled

## Execute + Receipt by Default

Ordinary productive work should execute and receipt rather than pause for approval. Examples include:

- local file creation
- local file editing
- reversible local file deletion
- local directory creation and organization
- repository modifications
- branch creation
- patch application
- command execution
- build execution
- test execution
- validation execution
- internal work-order creation and updates
- non-sensitive memory writes
- Drive document creation that does not expose private data
- Calendar reminders/internal events that do not expose private data or create external commitments
- Gmail drafting and non-destructive organization

Receipts should include actor, action, reason, resources changed, policy classification, trust domain, timestamp, result, validation output where applicable, and rollback hint where possible.

## Dynamic Trust

The runtime should track successful actions, failed actions, reversals, user corrections, receipt quality, and boundary accuracy. These events produce trust history by domain. Trust history should output trust score, trust domains, current autonomy envelope, and autonomy recommendations.

Autonomy may expand after repeated successful execution and contract after repeated failures, reversals, corrections, or policy-boundary mistakes.

## Setup-Needed State

When credentials, integrations, or external systems are missing, the runtime should not fake or perform the action. It should produce a setup-needed receipt with concrete next setup steps.

## Legacy SDK/HITL Compatibility

Existing SDK human-in-the-loop approval pause/resume paths may remain as compatibility mechanisms for actions classified as ask-before-execution. They should not be used for ordinary file writes, ordinary repository work, ordinary command execution, internal work orders, or other productive actions inside the current trust envelope.
