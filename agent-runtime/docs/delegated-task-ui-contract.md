# Delegated task UI contract

This document is the UI contract for delegated Nexora task cards and detail views. It intentionally stays close to the runtime types and routes so the UI can treat `/api/tasks` polling responses as the source of truth.

## Source of truth

- Routes: `agent-runtime/src/routes/tasks.ts`.
- UI state projection: `getDelegatedTaskUiState` in `agent-runtime/src/tasks/store.ts`.
- Status/type definitions: `agent-runtime/src/tasks/types.ts`.
- Worker blocks and generated Google Drive plan behavior: `agent-runtime/src/tasks/nexoraWorker.ts`.
- Queue dispatch and worker-unavailable fallback: `agent-runtime/src/tasks/queue.ts`.

## Polling endpoints

| Endpoint | Status | UI use |
| --- | --- | --- |
| `GET /api/tasks?sessionId=<id>` | Current | Poll task list for one session. Defaults to `sessionId=default`. |
| `GET /api/tasks?includeAllSessions=true` | Current | Admin/debug list across sessions. |
| `GET /api/tasks/:taskId` | Current | Poll one task detail card. |
| `POST /api/tasks` | Current | Create a delegated task. Accepts `objective` or `title`; optional `sessionId`, `constraints`, `requiredTools`, `approvalRequirements`, `executionPlan`, `initialLog`/`notes`, and `timeoutMs`. |
| `POST /api/tasks/:taskId/steps/:stepId/approve` | Current | Approve a blocked execution-plan step. Body must include `confirmedByUser: true`; optional `approver` and `note`. |
| `POST /api/tasks/:taskId/cancel` | Current | Cancel queued/running/blocked work. |
| `PATCH /api/tasks/:taskId` | Current admin/debug | Patch `status` and/or append `log`/`notes`. |
| `POST /api/tasks/:taskId/approve` | Planned | Whole-task approval route for `approvalRequirements`, backed by `approveDelegatedTask`. |
| `POST /api/tasks/:taskId/resume` | Planned | Resume/requeue provider-configuration or worker-unavailable blocks, backed by `resumeDelegatedTask`/`durableTaskQueue.enqueueById`. |

Poll list views every 5-10 seconds while any task is `pending_approval`, `queued`, `running`, or `blocked`. Poll task detail views every 2-3 seconds while `taskState.queueStatus` is `queued` or `active`. Stop automatic polling for terminal statuses unless the user refreshes.

## Response envelope

`GET /api/tasks/:taskId`, `POST /api/tasks`, step approval, cancel, and patch return:

```json
{
  "task": { "id": "task-id", "status": "queued", "uiState": {} },
  "taskState": { "taskId": "task-id", "status": "queued" },
  "queuedTaskIds": ["task-id"]
}
```

`GET /api/tasks` returns:

```json
{
  "tasks": [{ "id": "task-id", "status": "queued", "uiState": {} }],
  "taskStates": [{ "taskId": "task-id", "status": "queued" }],
  "queuedTaskIds": ["task-id"]
}
```

Use `taskState` for badges, calls to action, and polling decisions. Use `task` for logs, events, execution plan details, result, audit trail, and receipt drawer content.

## Task statuses

| Status | Meaning | UI behavior |
| --- | --- | --- |
| `pending_approval` | Whole-task approval is still pending; task has not entered the queue. | Show approval-required UI. Do not show running progress. |
| `queued` | Task is eligible for dispatch and is in, or about to enter, the durable queue. | Show queued copy and cancellation. |
| `running` | Queue dispatched the task to Nexora. | Show active progress and `currentWorkerStep` when present. |
| `blocked` | Nexora paused safely because it cannot continue without approval, configuration, worker support, or policy change. | Show blocked-reason-specific recovery UI. Do not treat as failed. |
| `completed` | Task succeeded. | Show result summary and receipt. |
| `failed` | Worker execution failed. | Show sanitized error/result summary and receipt. |
| `cancelled` | User/system cancelled the task. | Show cancelled terminal state and receipt. |

## Approval statuses

Approval status values are `not_required`, `pending`, `approved`, and `rejected`. They appear in three places:

- aggregate `taskState.approvalStatus`;
- whole-task `task.approvalRequirements[]`;
- execution-plan `step.approvalStatus`, `step.approval.status`, and `taskState.missingApproval`.

For current UI behavior, only execution-plan step approval has an HTTP route. Call `POST /api/tasks/:taskId/steps/:stepId/approve` with `confirmedByUser: true`; never synthesize approval context on the client.

## Execution plan steps

Each `task.executionPlan[]` entry is ordered by `order` and then `createdAt`:

```json
{
  "id": "step-id",
  "order": 1,
  "targetTool": "drive.create_text_file",
  "arguments": { "name": "project-note.txt", "content": "Hello from Nexora" },
  "argumentTemplate": null,
  "approvalStatus": "pending",
  "approval": { "required": true, "status": "pending", "reason": "drive_write_approval_required", "scope": "provider.create" },
  "status": "blocked",
  "resultSummary": "Google Drive provider configuration required: ...",
  "timeoutMs": 30000,
  "createdAt": "2026-06-16T00:00:00.000Z",
  "updatedAt": "2026-06-16T00:00:00.000Z"
}
```

Step statuses are `queued`, `running`, `blocked`, `completed`, `failed`, `skipped`, and `cancelled`. Render `taskState.currentWorkerStep` as the first `running`, then first `blocked`, then first `queued` step selected by the runtime.

## Blocked reasons

| `taskState.blockedReason` | Meaning | UI action |
| --- | --- | --- |
| `step_approval_required` | A specific tool/step needs human approval. | Render `taskState.missingApproval`; approve through the step approval route. |
| `provider_configuration_required` | Provider credentials, OAuth tokens, scopes, or token-store configuration are missing/invalid. | Render `taskState.missingConfiguration`; link to setup when available; resume after setup when the planned route exists. |
| `worker_unavailable` | No worker handler accepted the task. | Explain the task is durably recorded and awaiting worker support/configuration. |
| `policy_block` | Capability or sandbox policy forbids the action. | Show non-retryable policy-block copy unless an operator changes policy. |
| `unknown` | Fallback for uncategorized blocks. | Show latest log/event and generic manual-review copy. |

## Receipt shape

Terminal `completed`, `failed`, and `cancelled` tasks include `task.receipt`; `taskState.receiptId` is the compact link target.

```json
{
  "id": "receipt-id",
  "taskId": "task-id",
  "parentAgent": "elora",
  "assignedAgent": "nexora",
  "status": "completed",
  "createdAt": "2026-06-16T00:00:00.000Z",
  "finishedAt": "2026-06-16T00:01:00.000Z",
  "summary": "Delegated task task-id finished with status completed: ...",
  "proof": {
    "auditTrail": [{ "eventType": "task.completed", "summary": "..." }],
    "result": { "ok": true, "summary": "...", "data": {} },
    "error": { "message": "Only present when result.error exists" }
  }
}
```

Display `task.receipt.summary`, then `task.receipt.proof.result.summary`, then sanitized `task.receipt.proof.error.message` as fallback.

## Expected UI copy

| State | Badge | Primary copy | Secondary/action copy |
| --- | --- | --- | --- |
| Approved | `Approved` | `Approval recorded. Nexora can continue.` | `Waiting for the task to re-enter the queue.` |
| Queued | `Queued` | `Nexora has this task in the durable queue.` | `You can leave this page; progress and receipts will be saved.` |
| Running | `Running` | `Nexora is working on this task now.` | `Current step: {targetTool}.` |
| Blocked | `Blocked` | `Nexora paused safely before continuing.` | See blocked reason copy below. |
| Completed | `Completed` | `Nexora completed the task.` | `Receipt saved: {receiptId}.` |
| Failed | `Failed` | `Nexora could not complete the task.` | `Review the sanitized error and receipt before retrying.` |
| Cancelled | `Cancelled` | `The task was cancelled.` | `A cancellation receipt was saved for audit history.` |

Blocked reason copy:

- `step_approval_required`: `Approve this step before Nexora uses {toolName}.`
- `provider_configuration_required`: `{providerName} needs setup before Nexora can continue. {nextManualAction}`
- `worker_unavailable`: `This task is recorded, but no Nexora worker handler is configured for it yet.`
- `policy_block`: `This action is blocked by runtime policy and cannot be retried from the task UI.`
- `unknown`: `Review the latest task log for the next manual action.`

## Examples

### Local workspace task

```json
{
  "objective": "Summarize the local workspace package scripts and dependency metadata.",
  "requiredTools": ["package", "dependencies"],
  "constraints": ["Read-only local workspace inspection."]
}
```

Expected flow: `queued` -> `running` -> `completed`. Render the result summary and receipt.

### Google Drive task

```json
{
  "objective": "Create a Google Drive text file. filename: project-note.txt\ncontent: Hello from Nexora",
  "requiredTools": ["drive.create_text_file"]
}
```

Expected flow: the worker creates a `drive.create_text_file` plan step, blocks for `step_approval_required`, resumes after `POST /api/tasks/:taskId/steps/:stepId/approve`, then either completes or blocks for provider configuration.

### Provider-blocked task

```json
{
  "taskId": "task-id",
  "status": "blocked",
  "approvalStatus": "approved",
  "queueStatus": "not_queued",
  "blockedReason": "provider_configuration_required",
  "missingConfiguration": {
    "blockedReason": "provider_configuration_required",
    "provider": "google-drive",
    "providerName": "Google Drive",
    "missingConfigHint": "Google Drive OAuth tokens are absent, expired without refresh, or missing the required Drive scope.",
    "nextManualAction": "Open /api/auth/google/start, complete Google OAuth with the Drive file scope, then resume this delegated task."
  }
}
```

Expected UI: show the blocked copy, link `Connect Google Drive` to `/api/auth/google/start`, and show `Resume task` after the planned resume endpoint is available.
