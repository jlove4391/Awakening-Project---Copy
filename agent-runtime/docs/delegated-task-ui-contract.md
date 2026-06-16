# Delegated task UI contract

This contract describes how the UI should render delegated Nexora task state from the current `/api/tasks` routes plus the planned execution-plan approval and provider-resume additions already represented in the task store and worker state. Treat the `taskState`/`task.uiState` object as the primary polling payload for UI decisions.

## Polling endpoints

Current routes are mounted at `/api/tasks`.

| Purpose | Method/path | Request | Response notes |
| --- | --- | --- | --- |
| List task cards for one session | `GET /api/tasks?sessionId=<id>` | Query defaults to `sessionId=default`. | Returns `{ tasks, taskStates, queuedTaskIds }`; each task also includes `uiState`. |
| List all sessions for admin/debug views | `GET /api/tasks?includeAllSessions=true` | Optional `sessionId` is ignored when `includeAllSessions=true`. | Same shape as list. |
| Poll one task detail | `GET /api/tasks/:taskId` | Path `taskId`. | Returns `{ task, taskState, queuedTaskIds }`; `404` returns `{ error: "task not found" }`. |
| Create a delegated task | `POST /api/tasks` | JSON body with `objective` (or `title`), optional `sessionId`, `constraints`, `requiredTools`, `approvalRequirements`, `executionPlan`, `initialLog`/`notes`, `timeoutMs`. | Returns `201` with the single-task response. If approvals are required the task starts `pending_approval`; otherwise it starts `queued`. |
| Approve a blocked execution-plan step | `POST /api/tasks/:taskId/steps/:stepId/approve` | JSON body must include `confirmedByUser: true`; optional `approver`, `note`. | Returns the single-task response and re-queues the task when approval is accepted. |
| Cancel a task | `POST /api/tasks/:taskId/cancel` | Optional `reason`. | Returns the single-task response; terminal cancellation produces a receipt. |
| Patch a task for admin/debug updates | `PATCH /api/tasks/:taskId` | Optional `status`, `log`/`notes`. | Returns the single-task response. |

Planned UI additions should use the same response envelope and add routes rather than alternate shapes. Expected additions are:

- `POST /api/tasks/:taskId/approve` for whole-task `approvalRequirements` approval, backed by `approveDelegatedTask`.
- `POST /api/tasks/:taskId/resume` for provider/configuration or worker-unavailable retries, backed by queue `enqueueById`/store `resumeDelegatedTask`.
- Optional event/SSE subscription can mirror `task.created`, `task.updated`, and `task.finished`, but polling above remains canonical.

Recommended polling cadence: list views every 5-10 seconds while any task is `queued`, `pending_approval`, `running`, or `blocked`; detail views every 2-3 seconds while `queueStatus` is `queued` or `active`. Stop automatic polling for `completed`, `failed`, and `cancelled` unless the user manually refreshes.

## Response envelope

Single-task responses have this shape:

```json
{
  "task": { "id": "task-id", "status": "running", "uiState": {} },
  "taskState": { "taskId": "task-id", "status": "running" },
  "queuedTaskIds": ["task-id"]
}
```

List responses have this shape:

```json
{
  "tasks": [{ "id": "task-id", "status": "queued", "uiState": {} }],
  "taskStates": [{ "taskId": "task-id", "status": "queued" }],
  "queuedTaskIds": ["task-id"]
}
```

Use `taskState` for status badges and calls to action. Use `task` for the audit trail, logs, execution plan, result, and receipt detail drawer.

## Task statuses

| Status | Meaning | UI behavior |
| --- | --- | --- |
| `pending_approval` | Whole-task approval requirements exist and are still pending. The task is not queued yet. | Show an approval card. Do not show a running spinner. |
| `queued` | The task is eligible for Nexora and has entered the durable queue, or has been re-queued after approval/resume. | Show queued copy and allow cancellation. |
| `running` | Durable queue dispatched the task and Nexora is processing it. | Show active progress, current step if present, and allow cancellation. |
| `blocked` | Nexora stopped safely because approval, provider configuration, capability policy, or worker availability prevents progress. | Show blocked reason-specific recovery UI. Do not mark as failed. |
| `completed` | Task finished successfully and should have a receipt. | Show success copy, result summary, completion report, and receipt link/detail. |
| `failed` | Worker execution failed and should have a receipt. | Show failure copy with sanitized error and receipt detail. |
| `cancelled` | User/system cancelled the task and a cancellation receipt was created. | Show cancelled terminal state and receipt detail. |

## Approval statuses

Approval statuses appear in whole-task `approvalRequirements`, execution-plan `step.approvalStatus`/`step.approval.status`, pending tool actions, and aggregate `taskState.approvalStatus`.

| Status | Meaning | UI behavior |
| --- | --- | --- |
| `not_required` | No approval gate applies. | Hide approval action. |
| `pending` | A human decision is required before queueing or continuing. | Show Approve/Deny controls when an approval route exists; for execution steps call `POST /api/tasks/:taskId/steps/:stepId/approve` with `confirmedByUser: true`. |
| `approved` | The required approval was recorded with optional approver/note/timestamp. | Show approved chip and continue polling for queue/running. |
| `rejected` | The request was rejected. | Show rejected chip; task should remain non-executable until explicitly changed. |

## Execution plan steps

`task.executionPlan[]` contains deterministic worker steps. Each step includes:

```json
{
  "id": "step-id",
  "order": 1,
  "targetTool": "drive.create_text_file",
  "arguments": { "name": "hello.txt", "content": "Hello" },
  "argumentTemplate": null,
  "approvalStatus": "pending",
  "approval": {
    "required": true,
    "status": "pending",
    "reason": "drive_write_approval_required",
    "scope": "provider.create"
  },
  "status": "blocked",
  "resultSummary": "Google Drive provider configuration required: ...",
  "timeoutMs": 30000,
  "createdAt": "2026-06-15T00:00:00.000Z",
  "updatedAt": "2026-06-15T00:00:00.000Z"
}
```

Step statuses are `queued`, `running`, `blocked`, `completed`, `failed`, `skipped`, and `cancelled`. Sort by `order`, then `createdAt`. Render the first `running`, then first `blocked`, then first `queued` step as `taskState.currentWorkerStep`.

High-risk or provider-write steps can block with `taskState.missingApproval`. Approved high-risk steps are executed with the runtime's internal approved task/step IDs; the UI must never invent approval context without the approval endpoint response.

## Blocked reasons

| `blockedReason` | Source | Expected UI action |
| --- | --- | --- |
| `step_approval_required` | A plan step or pending tool action requires explicit human approval. | Render approval card from `taskState.missingApproval`; approve with `POST /api/tasks/:taskId/steps/:stepId/approve`. |
| `provider_configuration_required` | Provider credentials, OAuth tokens, scopes, or token encryption config are missing/expired. | Render provider setup instructions from `taskState.missingConfiguration`; after setup, use the planned resume route or admin requeue flow. |
| `worker_unavailable` | No Nexora worker handler accepted the task. | Explain that the task is safely recorded but awaiting worker support/configuration; offer retry only after worker setup. |
| `policy_block` | Capability matrix or sandbox policy forbids the action. | Show a non-retryable safety/policy block unless an operator changes policy. |
| `unknown` | Fallback for uncategorized blocks. | Show generic blocked copy and latest log/event summary. |

## Receipt shape

Receipts are created for terminal statuses `completed`, `failed`, and `cancelled`. `taskState.receiptId` is a quick link target; `task.receipt` contains the full receipt:

```json
{
  "id": "receipt-id",
  "taskId": "task-id",
  "parentAgent": "elora",
  "assignedAgent": "nexora",
  "status": "completed",
  "createdAt": "2026-06-15T00:00:00.000Z",
  "finishedAt": "2026-06-15T00:01:00.000Z",
  "summary": "Delegated task task-id finished with status completed: ...",
  "proof": {
    "auditTrail": [{ "eventType": "task.completed", "summary": "..." }],
    "result": { "ok": true, "summary": "...", "data": {} },
    "error": { "message": "Only present when the result has an error" }
  }
}
```

The UI should show `receipt.summary`, `proof.result.summary`, then sanitized `proof.error.message` in that order of preference. Audit trails are append-only evidence; display them in chronological order for details.

## Expected UI copy

Use these exact baseline strings unless a more specific provider/approval message is available.

| State | Badge | Primary copy | Secondary/action copy |
| --- | --- | --- | --- |
| Approved | `Approved` | `Approval recorded. Nexora can continue.` | `Waiting for the task to re-enter the queue.` |
| Queued | `Queued` | `Nexora has this task in the durable queue.` | `You can leave this page; progress and receipts will be saved.` |
| Running | `Running` | `Nexora is working on this task now.` | `Current step: {targetTool}.` |
| Blocked | `Blocked` | `Nexora paused safely before continuing.` | Use blocked reason copy below. |
| Completed | `Completed` | `Nexora completed the task.` | `Receipt saved: {receiptId}.` |
| Failed | `Failed` | `Nexora could not complete the task.` | `Review the sanitized error and receipt before retrying.` |
| Cancelled | `Cancelled` | `The task was cancelled.` | `A cancellation receipt was saved for audit history.` |

Blocked reason secondary copy:

- `step_approval_required`: `Approve this step before Nexora uses {toolName}.`
- `provider_configuration_required`: `{providerName} needs setup before Nexora can continue. {nextManualAction}`
- `worker_unavailable`: `This task is recorded, but no Nexora worker handler is configured for it yet.`
- `policy_block`: `This action is blocked by runtime policy and cannot be retried from the task UI.`
- `unknown`: `Review the latest task log for the next manual action.`

## Examples

### Local file/workspace task

Request:

```http
POST /api/tasks
Content-Type: application/json

{
  "sessionId": "default",
  "objective": "Summarize the local workspace package scripts and dependency metadata.",
  "requiredTools": ["package", "dependencies"],
  "constraints": ["Read-only local workspace inspection."]
}
```

Expected flow:

1. `POST /api/tasks` returns `queued` because no approval is required.
2. Poll `GET /api/tasks/:taskId`; status becomes `running` and logs show allowlisted read-only tools.
3. Terminal status becomes `completed`; render `task.result.summary`, `taskState.completionReport` if present, and `task.receipt.id`.

### Google Drive task

Request:

```http
POST /api/tasks
Content-Type: application/json

{
  "sessionId": "default",
  "objective": "Create a Google Drive text file. filename: project-note.txt\ncontent: Hello from Nexora",
  "requiredTools": ["drive.create_text_file"]
}
```

Expected flow:

1. Worker generates an execution-plan step for `drive.create_text_file` with `approvalStatus: "pending"`.
2. Task becomes `blocked` with `blockedReason: "step_approval_required"`; render `missingApproval` and the approve button.
3. UI calls `POST /api/tasks/:taskId/steps/:stepId/approve` with `{ "confirmedByUser": true, "approver": "user", "note": "Approved Drive file creation." }`.
4. Task returns to `queued`, then `running`.
5. If Google OAuth and token configuration are valid, task completes with a receipt. If not, it becomes provider-blocked as below.

### Provider-blocked task

Representative `taskState`:

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

Expected UI:

- Badge: `Blocked`.
- Primary copy: `Nexora paused safely before continuing.`
- Secondary copy: `Google Drive needs setup before Nexora can continue. Open /api/auth/google/start, complete Google OAuth with the Drive file scope, then resume this delegated task.`
- Action: `Connect Google Drive`, linking to `/api/auth/google/start`.
- After setup: show `Resume task` once the planned `POST /api/tasks/:taskId/resume` endpoint is available; until then, tell operators to requeue through the admin/debug flow.
