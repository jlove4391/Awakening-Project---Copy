# Nexora delegated-task execution path

This note documents the current Elora-to-Nexora delegated-task path and the UI-facing contract that follows from the runtime. It is descriptive only; runtime behavior is unchanged.

## Current flow

1. **Elora creates durable delegated tasks.** The `delegation.create_task` registry entry calls `createDelegationTask`, which stores tasks through `createDelegatedTask` with `parentAgent: 'elora'` and `assignedAgent: 'nexora'`.
2. **Whole-task approval gates queue entry.** Tasks with `approvalRequirements` start as `pending_approval`. `approveDelegatedTask` records pending approvals and changes the task to `queued` after all required approvals are satisfied.
3. **The durable queue dispatches queued work.** `durableTaskQueue` marks queued tasks `running`, emits `task.started`, and tries registered handlers.
4. **Nexora can execute approved deterministic work.** The queue registers the safe-demo worker and the Nexora tool-execution worker. The tool worker can run allowlisted read-only tools directly, execute approved execution-plan steps, and generate a Google Drive `drive.create_text_file` plan from matching objectives.
5. **High-risk steps block before execution.** Write/provider/code-execution steps move the task to `blocked` with `blockedReason: 'step_approval_required'` and a `pendingToolAction`. `approveExecutionPlanStep` records approval, queues the step, and allows the task to continue.
6. **Provider configuration failures remain blocked, not failed.** Missing Google OAuth credentials, token-store encryption, Drive connection, or Drive scope produce `blockedReason: 'provider_configuration_required'` plus `missingConfiguration` UI details.
7. **Unhandled tasks block for worker support.** If no handler accepts a queued task, the queue records `blockedReason: 'worker_unavailable'` so the task remains auditable and retryable after worker configuration changes.
8. **Terminal tasks receive receipts.** `completed`, `failed`, and `cancelled` tasks receive `task.receipt`; the UI projection exposes `taskState.receiptId`.

## UI contract from the task routes

Task cards should poll the current `/api/tasks` routes instead of deriving state locally:

| Endpoint | Current use |
| --- | --- |
| `GET /api/tasks?sessionId=<id>` | List task cards for one session; defaults to `sessionId=default`. |
| `GET /api/tasks?includeAllSessions=true` | Admin/debug list across sessions. |
| `GET /api/tasks/:taskId` | Poll one task detail view. |
| `POST /api/tasks` | Create a task from `objective`/`title`, optional `constraints`, `requiredTools`, `approvalRequirements`, `executionPlan`, `initialLog`/`notes`, and `timeoutMs`. |
| `POST /api/tasks/:taskId/steps/:stepId/approve` | Approve a blocked execution-plan step; requires `confirmedByUser: true`. |
| `POST /api/tasks/:taskId/cancel` | Cancel non-terminal work. |
| `PATCH /api/tasks/:taskId` | Admin/debug status or log patch. |

Single-task responses return `{ task, taskState, queuedTaskIds }`. List responses return `{ tasks, taskStates, queuedTaskIds }`. Use `taskState` for badges and calls to action; use `task` for logs, events, execution plans, results, audit trail, and receipt details.

### Status and approval values

- Task statuses: `pending_approval`, `queued`, `running`, `blocked`, `completed`, `failed`, `cancelled`.
- Approval statuses: `not_required`, `pending`, `approved`, `rejected`.
- Queue states: `queued`, `active`, `not_queued`.
- Execution-plan step statuses: `queued`, `running`, `blocked`, `completed`, `failed`, `skipped`, `cancelled`.

### Blocked reasons

| Reason | UI action |
| --- | --- |
| `step_approval_required` | Show `taskState.missingApproval`; approve with the step approval route. |
| `provider_configuration_required` | Show `taskState.missingConfiguration`, including provider name, configuration hint, and next manual action. |
| `worker_unavailable` | Explain that the task is durably recorded but no worker currently supports it. |
| `policy_block` | Show a non-retryable policy/safety block unless an operator changes policy. |
| `unknown` | Show latest task log and request manual review. |

### Expected copy

| State | Badge | Primary copy | Secondary/action copy |
| --- | --- | --- | --- |
| Approved | `Approved` | `Approval recorded. Nexora can continue.` | `Waiting for the task to re-enter the queue.` |
| Queued | `Queued` | `Nexora has this task in the durable queue.` | `You can leave this page; progress and receipts will be saved.` |
| Running | `Running` | `Nexora is working on this task now.` | `Current step: {targetTool}.` |
| Blocked | `Blocked` | `Nexora paused safely before continuing.` | Render the blocked-reason-specific action. |
| Completed | `Completed` | `Nexora completed the task.` | `Receipt saved: {receiptId}.` |
| Failed | `Failed` | `Nexora could not complete the task.` | `Review the sanitized error and receipt before retrying.` |
| Cancelled | `Cancelled` | `The task was cancelled.` | `A cancellation receipt was saved for audit history.` |

## Smoke-covered examples

- **Local workspace task:** `smoke:delegated-file-create` and `smoke:delegated-resume` create local file-write execution plans, block for whole-task and step approvals, resume from the approved step, complete, and assert receipt creation.
- **Google Drive task:** `smoke:delegated-drive-create` creates a delegated Drive file task that starts behind whole-task approval, generates a Drive execution step, and either completes with valid provider setup or blocks clearly.
- **Provider-blocked task:** `smoke:delegated-provider-blocked` removes Google provider configuration and asserts the task blocks with `provider_configuration_required`, `provider: 'google-drive'`, `providerName: 'Google Drive'`, `missingConfigHint`, and `nextManualAction`.

## Current gap and implementation gate

The runtime has the persistence, approval metadata, queue events, UI status contract, and several tool definitions needed for delegated Nexora work, but those pieces are not yet proven as a safe end-to-end local workflow. The immediate gap is not another provider adapter; it is proving that a delegated task can safely create a local file, pause for human approval when required, resume the same durable task after approval/configuration changes, and leave an auditable receipt without relying on external provider writes.

Until that local delegated-file and approval-resume path is proven by smoke tests, future implementation must stay on local-only or read-only work. In particular:

- Do not start DigitalOcean create/update/delete operations.
- Do not start database migration or other database mutation operations.
- Do not rely on Google Drive or other external file-provider writes as the first proof of delegated task creation.
- Treat provider-write and database-mutation tasks as blocked behind the local delegated file-create smoke and approval-resume smoke gates.

The recommended next diffs should therefore proceed in this order:

1. Expand local workspace file tools enough for Nexora to create and verify files safely.
2. Add repository analysis tools that remain read-only.
3. Wire a real Nexora delegated-task handler around those local/read-only tools.
4. Add and pass a delegated local file-create smoke test.
5. Separate task-level approval from execution-step approval and prove that a blocked task can resume from the same persisted task.
6. Only after those gates pass, continue toward provider-specific create paths and database mutation workflows.

This sequencing keeps provider writes and database mutations behind a concrete local safety proof while preserving the existing task-store, queue, approval, and receipt model.

## Files inspected

- `src/routes/tasks.ts` mounts the current polling, creation, step approval, cancellation, and patch routes.
- `src/tools/registry.ts` registers delegation tools including create, approve, approve-step, resume, record-result, and execute-code entries.
- `src/tools/delegation.ts` connects registry executors to the task store and durable queue.
- `src/tasks/store.ts` owns task persistence, UI-state projection, approval transitions, resume transitions, audit events, results, and receipts.
- `src/tasks/queue.ts` owns queued-task dispatch, safe-demo handling, Nexora tool-worker registration, and worker-unavailable blocking.
- `src/tasks/nexoraWorker.ts` owns deterministic tool execution, execution-plan step approval blocking, generated Google Drive plans, provider-configuration blocks, and terminal completion/failure recording.
- `scripts/smoke-delegated-file-create.ts`, `scripts/smoke-delegated-resume.ts`, `scripts/smoke-delegated-drive-create.ts`, and `scripts/smoke-delegated-provider-blocked.ts` cover the local file, resume, Drive, and provider-blocked flows.
