# Delegated task UI contract

This contract describes the shape the React UI should consume for Elora → Nexora delegated tasks. It uses the current task route implementation as the source of truth and calls out planned HTTP additions that already exist as registry/store capabilities but are not yet exposed as direct task routes.

## Source of truth

- Current HTTP routes: `agent-runtime/src/routes/tasks.ts` mounted at `/api/tasks`.
- Store and type contract: `agent-runtime/src/tasks/types.ts` and `agent-runtime/src/tasks/store.ts`.
- Queue behavior: `agent-runtime/src/tasks/queue.ts`.
- Worker blocks and provider configuration details: `agent-runtime/src/tasks/nexoraWorker.ts`.
- Existing UI polling: `Elora-System/src/components/ExecutionReceiptsPanel.jsx` polls `/api/tasks` next to `/api/executions`.

## Task statuses

`task.status` is one of:

| Status | Meaning | UI treatment |
| --- | --- | --- |
| `pending_approval` | The task was recorded but one or more task-level approvals are still pending. | Show approval CTA and do not imply Nexora has started. |
| `queued` | All required task-level approvals are satisfied and the durable queue should pick up the task. | Show queued/waiting copy and keep polling. |
| `running` | The queue dispatched the task to a worker. | Show active progress and current step if available. |
| `blocked` | Nexora cannot continue until approval, configuration, a worker, or policy changes. | Show blocking reason, missing approval/configuration details, and next action. |
| `completed` | Nexora finished successfully and a receipt should exist. | Show success copy and receipt/proof link or summary. |
| `failed` | Nexora reached a terminal error and a receipt should exist. | Show failure copy, error summary, and receipt/proof link. |
| `cancelled` | A user/system cancellation stopped the task and a cancellation receipt should exist. | Show cancelled state, previous status when available, and receipt summary. |

Terminal statuses are `completed`, `failed`, and `cancelled`; the store creates a `receipt` the first time a task enters a terminal status.

## Approval statuses

Task UI should read aggregate approval state from `task.uiState.approvalStatus` or the sibling top-level `taskState.approvalStatus` returned by task routes.

`approvalStatus` is one of:

| Status | Meaning |
| --- | --- |
| `not_required` | No task-level or execution-step approval is required. |
| `pending` | At least one required task approval or step approval is pending. |
| `approved` | All required approvals are approved. |
| `rejected` | At least one approval has been rejected. Rejection is represented in the type contract, although current HTTP task routes expose approval and step-approval only. |

Approval records can appear in two places:

1. `task.approvalRequirements[]` for task-level approval gates.
2. `task.executionPlan[].approval` for per-tool execution-step approval gates.

Approval objects use this shape:

```ts
{
  required: boolean;
  status: 'not_required' | 'pending' | 'approved' | 'rejected';
  approver?: string;
  approvedAt?: string;
  rejectedAt?: string;
  note?: string;
  reason?: string;
  scope?: 'repo.write' | 'repo.delete' | 'repo.command' | 'repo.commit' | 'provider.create' | 'provider.update' | 'provider.delete' | 'database.migrate' | 'external.send';
}
```

## Execution plan steps

A delegated task may include `executionPlan`. Steps are ordered by `order` and model the worker's tool-by-tool progress.

```ts
{
  id: string;
  order: number;
  targetTool: string;
  arguments?: unknown;
  argumentTemplate?: unknown;
  approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
  approval?: ExecutionPlanStepApproval;
  status: 'queued' | 'running' | 'blocked' | 'completed' | 'failed' | 'skipped' | 'cancelled';
  resultSummary?: string;
  timeoutMs?: number;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

`task.uiState.currentWorkerStep` points to the best current step for display: running first, then the pending tool-action step, then blocked, then queued.

When a step needs human approval, the worker sets `task.status: "blocked"`, `task.blockedReason: "step_approval_required"`, and `task.pendingToolAction`:

```ts
{
  stepId: string;
  toolName: string;
  riskLevel?: string;
  action?: string;
  arguments?: unknown;
  argumentTemplate?: unknown;
  approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
  reason: string;
  approvalScope?: string;
}
```

## Blocked reasons

`task.blockedReason` and `task.uiState.blockedReason` are one of:

| Reason | Meaning | Expected user action |
| --- | --- | --- |
| `step_approval_required` | A specific execution-plan step/tool action needs human approval. | Show tool/action details and approve-step CTA. |
| `provider_configuration_required` | A provider such as Google Drive is not configured or connected. | Show `missingConfiguration` and a setup/resume CTA. |
| `worker_unavailable` | No worker handler can currently process this task. | Show that the task is saved and awaiting worker availability. |
| `policy_block` | The Nexora capability matrix disallows this action. | Show policy-block copy; do not offer approval unless a pending approval is present. |
| `unknown` | Fallback reason for unclassified blocks. | Show generic blocked copy and logs. |

For provider blocks, prefer `task.uiState.missingConfiguration` when present:

```ts
{
  blockedReason: 'provider_configuration_required';
  provider?: string;
  providerName?: string;
  missingConfigHint?: string;
  nextManualAction?: string;
  message?: string;
}
```

## Receipt shape

A terminal task should include `task.receipt`, and `task.uiState.receiptId` should mirror `task.receipt.id`.

```ts
{
  id: string;
  taskId: string;
  parentAgent: 'elora' | 'nexora' | 'kaz' | 'jynx' | 'kalyra';
  assignedAgent: 'elora' | 'nexora' | 'kaz' | 'jynx' | 'kalyra';
  status: 'queued' | 'pending_approval' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  finishedAt?: string;
  summary: string;
  proof: {
    auditTrail: TaskAuditEntry[];
    result?: unknown;
    error?: { message: string; stack?: string };
  };
}
```

`TaskAuditEntry` fields are `id`, `taskId`, `eventType`, `actor`, `occurredAt`, `summary`, and optional `details`. The receipt proof should be treated as audit/provenance data; UIs should summarize it by default and expand details on demand.

## Polling endpoints

### Current HTTP endpoints

| Method | Endpoint | Purpose | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/tasks?sessionId=<sessionId>` | Poll task list for one session. | Default session is `default`. Response includes `tasks`, `taskStates`, and `queuedTaskIds`. |
| `GET` | `/api/tasks?includeAllSessions=true` | Poll all tasks for dashboards. | Used when no session ID is available. |
| `GET` | `/api/tasks/:taskId` | Poll one task. | Response includes `{ task, taskState, queuedTaskIds }`. |
| `POST` | `/api/tasks` | Create a delegated task. | Body accepts `sessionId`, `objective` or `title`, `constraints`, `requiredTools`, `approvalRequirements`, `initialLog`/`notes`, `executionPlan`, and `timeoutMs`. |
| `POST` | `/api/tasks/:taskId/steps/:stepId/approve` | Approve a blocked execution-plan step. | Body must include `confirmedByUser: true`; optional `approver` and `note`. Requeues when approval succeeds. |
| `POST` | `/api/tasks/:taskId/cancel` | Cancel a task. | Body may include `reason`. Creates a cancellation receipt. |
| `PATCH` | `/api/tasks/:taskId` | Update task status/log. | Current body accepts `status` and `log`/`notes`; if status becomes `queued`, queue listeners enqueue it. |

### Planned direct HTTP additions

These are already available in store/registry flows and should be exposed as direct route helpers so the UI does not need to route through agent tools:

| Method | Endpoint | Purpose | Backing capability today |
| --- | --- | --- | --- |
| `POST` | `/api/tasks/:taskId/approve` | Approve task-level `approvalRequirements` and move to `queued` when all are satisfied. | `approveDelegatedTask` / `delegation.approve_task`. |
| `POST` | `/api/tasks/:taskId/resume` | Resume a blocked non-terminal task after provider setup or worker availability changes. | `durableTaskQueue.enqueueById` / `resumeDelegatedTask` / `delegation.resume_task`. |
| `GET` | `/api/tasks/events` or `GET /api/tasks/:taskId/events` | Stream task events over SSE instead of polling. | `taskEvents` already emits `task.created`, `task.updated`, and `task.finished`. |

Recommended polling interval until SSE exists: 1-2 seconds while a visible task is `pending_approval`, `queued`, `running`, or `blocked`; 5-10 seconds for background dashboards; stop focused polling for terminal tasks after a receipt is present.

## Expected UI copy

Use consistent, action-oriented copy. Prefer showing `task.objective`, `currentWorkerStep.targetTool`, `pendingToolAction.toolName`, `missingConfiguration.providerName`, `result.summary`, and `receipt.summary` when available.

| State | Primary copy | Secondary copy / CTA |
| --- | --- | --- |
| Approved | `Approved. Nexora can continue.` | `Approval recorded by {approver}. Waiting for the durable queue to pick up the task.` |
| Queued | `Queued for Nexora.` | `This task is saved and will start automatically. You can keep working while it runs.` |
| Running | `Nexora is working on this task.` | `Current step: {targetTool}. We’ll keep this panel updated.` |
| Blocked: step approval | `Approval needed before Nexora can continue.` | `Review {toolName} ({approvalScope || riskLevel}) and approve only if this action is expected.` CTA: `Approve step`. |
| Blocked: provider configuration | `{providerName} needs setup before Nexora can continue.` | `{missingConfigHint}` then `{nextManualAction}`. CTA after setup: `Resume task`. |
| Blocked: worker unavailable | `Task saved. Nexora worker is not available yet.` | `No configured worker accepted this task. It will remain auditable until worker support is added or the task is resumed.` |
| Blocked: policy | `Nexora cannot perform this action under the current policy.` | `Review the blocked tool and policy reason. Change the request or policy before retrying.` |
| Completed | `Task completed.` | `{receipt.summary || result.summary}` CTA: `View receipt`. |
| Failed | `Task failed.` | `{result.error.message || result.summary}` CTA: `View failure receipt`. |
| Cancelled | `Task cancelled.` | `{receipt.summary || result.summary}` CTA: `View cancellation receipt`. |

## Example payloads

### Local file task

Create request:

```http
POST /api/tasks
Content-Type: application/json

{
  "sessionId": "ui-local-file-demo",
  "objective": "Create .runtime-smoke/nexora-test.txt in the Nexora workspace.",
  "constraints": [
    "path: .runtime-smoke/nexora-test.txt",
    "content: Nexora delegated file-create smoke passed."
  ],
  "requiredTools": ["code.create_file"],
  "approvalRequirements": ["Approve this delegated task before Nexora may request or use the file-write step."],
  "executionPlan": [
    {
      "targetTool": "code.create_file",
      "arguments": {
        "path": ".runtime-smoke/nexora-test.txt",
        "content": "Nexora delegated file-create smoke passed.\n"
      },
      "approvalStatus": "pending",
      "approval": {
        "required": true,
        "status": "pending",
        "reason": "file_write_approval_required"
      }
    }
  ]
}
```

Expected progression:

1. `pending_approval` until task-level approval is recorded.
2. `queued`, then `running`.
3. `blocked` with `blockedReason: "step_approval_required"` and `pendingToolAction.toolName: "code.create_file"`.
4. UI calls `POST /api/tasks/:taskId/steps/:stepId/approve` with `confirmedByUser: true`.
5. `queued`, `running`, then `completed` with a receipt containing `code.create_file` proof.

### Google Drive task

Create request:

```http
POST /api/tasks
Content-Type: application/json

{
  "sessionId": "ui-drive-demo",
  "objective": "Create a text file in Google Drive.",
  "constraints": [
    "filename: nexora-delegated-demo.txt",
    "content: Nexora delegated Google Drive create demo."
  ],
  "requiredTools": ["drive.create_text_file"],
  "approvalRequirements": ["Approve this delegated task before Nexora may prepare the Drive write step."],
  "initialLog": "UI demo task for delegated Google Drive text-file creation."
}
```

Expected progression with configured Google Drive:

1. `pending_approval` until task-level approval is recorded.
2. Worker auto-adds an execution step for `drive.create_text_file` when filename and content are parseable.
3. `blocked` with `blockedReason: "step_approval_required"` until the Drive write step is approved.
4. After step approval, `queued`, `running`, then `completed` with Drive response proof in `result` and `receipt`.

### Provider-blocked task

A Google Drive task with missing OAuth/client/token configuration follows the same approval path until the approved Drive step executes. Instead of pretending the task completed, the worker returns:

```json
{
  "status": "blocked",
  "blockedReason": "provider_configuration_required",
  "uiState": {
    "status": "blocked",
    "blockedReason": "provider_configuration_required",
    "missingConfiguration": {
      "blockedReason": "provider_configuration_required",
      "provider": "google-drive",
      "providerName": "Google Drive",
      "missingConfigHint": "Google Drive OAuth tokens are absent, expired without refresh, or missing the required Drive scope.",
      "nextManualAction": "Open /api/auth/google/start, complete Google OAuth with the Drive file scope, then resume this delegated task."
    }
  },
  "result": {
    "ok": false,
    "summary": "Google Drive provider configuration required before Nexora can continue.",
    "data": {
      "handledBy": "nexora.execution-plan-worker",
      "status": "provider_configuration_required",
      "provider": "google-drive",
      "providerName": "Google Drive",
      "missingConfigHint": "Google Drive OAuth tokens are absent, expired without refresh, or missing the required Drive scope.",
      "nextManualAction": "Open /api/auth/google/start, complete Google OAuth with the Drive file scope, then resume this delegated task.",
      "tool": "drive.create_text_file"
    },
    "error": {
      "message": "redacted provider error message"
    }
  }
}
```

Expected UI copy:

- Primary: `Google Drive needs setup before Nexora can continue.`
- Secondary: show `missingConfigHint` and `nextManualAction` exactly as returned.
- CTA: `Resume task` after the user completes setup. Until the planned direct route lands, the resume action must be performed through the `delegation.resume_task` tool path or an operator/admin flow.
