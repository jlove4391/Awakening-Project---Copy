# SDK human-in-the-loop approval flow

The runtime now uses the OpenAI Agents SDK human-in-the-loop (HITL) approval pause/resume path for direct SDK tool calls. Direct tool approvals are not replayed through `POST /api/executions/:id/approval`; that endpoint is legacy compatibility for existing execution records only. New direct SDK tool approvals resume the serialized SDK run state for the chat session.

## Scope

This document covers direct SDK tool approvals: high-risk or write-capable tools invoked by an agent during `POST /api/chat`. Durable delegated task approvals are separate queue state transitions and are documented in [`delegated-task-ui-contract.md`](./delegated-task-ui-contract.md).

## Flow

1. The agent selects a registered tool whose SDK `needsApproval` policy returns `true`.
2. The Agents SDK interrupts the streaming run before executing that tool.
3. The runtime serializes the SDK `RunState` and stores pending approval metadata keyed by `sessionId`.
4. The chat stream emits:
   - a `runtime_event` with `type: "sdk_approval_required"`, the `sessionId`, and one or more approval records;
   - a final user-facing approval prompt listing each `approvalId`, tool name, risk level, argument summary, and allowed decisions.
5. The UI submits the decision back to `POST /api/chat` with the same `sessionId` and an `approval` body.
6. The runtime restores the serialized SDK state, applies `approve` or `reject` to the matching interruption, and resumes the SDK run.
7. Approved execution produces a completed execution record and receipt. Rejected execution resumes the SDK run with the rejection applied and must not execute the rejected tool call.

## Approval request body

Send approval decisions to the chat endpoint, not to the execution replay endpoint:

```http
POST /api/chat
Content-Type: application/json

{
  "agent": "elora",
  "sessionId": "<same-session-id>",
  "approval": {
    "decision": "approve",
    "approvalId": "<approval-id-from-sdk_approval_required>"
  }
}
```

Supported decisions are:

| Decision | Behavior |
| --- | --- |
| `approve` | Approves the matching SDK interruption and resumes the run. The approved tool execution is recorded with a completed execution receipt. |
| `reject` | Rejects the matching SDK interruption and resumes the run without approving the tool call. Include `reason` when available. |
| `cancel` | Clears the pending approval without resuming the serialized SDK run. |

For a single pending approval, the chat message `I approve` may be accepted as a convenience. For multiple pending approvals, natural-language approval is intentionally ambiguous; the UI must send an explicit `approvalId`.

## Pending approval payload

The runtime emits summarized approval records rather than raw provider inputs:

```json
{
  "type": "sdk_approval_required",
  "sessionId": "phase-1-sdk-approval",
  "approvals": [
    {
      "approvalId": "call_123",
      "toolName": "code.create_file",
      "argumentsSummary": "{\"path\":\".runtime-smoke/sdk-approved.txt\"}",
      "riskLevel": "medium",
      "sessionId": "phase-1-sdk-approval",
      "allowedDecisions": ["approve", "reject", "cancel"],
      "callId": "call_123"
    }
  ]
}
```

## Receipts and audit records

Approval pause and approved execution are both auditable:

- A paused SDK tool call stores pending approval metadata keyed by `sessionId` and emits `sdk_approval_required` before mutation. Legacy non-SDK approval shims may still write blocked execution records for compatibility.
- An approved resumed tool call writes a completed execution record with `status: "completed"`, `providerResponseSummary`, and `receipt.summary`.
- Tool audit entries are written under `${AGENT_RUNTIME_DATA_DIR:-agent-runtime/.runtime-data}/audit/tool-audit.jsonl`.

Use `GET /api/executions?sessionId=<sessionId>&limit=10` to verify completed approved tool records for a session; pending SDK approval state is emitted on the chat stream rather than treated as a replayable execution.

## Smoke coverage

Run the SDK approval smoke from the repository root:

```bash
npm --workspace @awakening/agent-runtime run smoke:approvals
```

The smoke covers:

- SDK tool pause before an unapproved write.
- Pending approval metadata and prompt generation.
- Approved SDK resume that executes the tool.
- Rejection/cleared approval that does not execute the tool.
- Multiple pending approval ambiguity messaging.
- Completed execution receipt creation after approved execution.
