# Nexora delegated-task execution path

This note documents the current Elora-to-Nexora delegated-task path. It is descriptive only; the runtime behavior is unchanged.

## Current flow

1. **Elora can create delegated tasks.** The `delegation.create_task` registry entry exposes a durable Elora-to-Nexora task creation tool. It calls `createDelegationTask`, which stores the task with `parentAgent: 'elora'` and `assignedAgent: 'nexora'` through `createDelegatedTask`.
2. **Approval can move a task from `pending_approval` to `queued`.** `createDelegatedTask` starts tasks with approval requirements in `pending_approval`; `approveDelegatedTask` records pending approvals as approved and sets the status to `queued` once all required approvals are satisfied.
3. **The queue dispatches the task.** When task creation or update produces `queued`, `createDelegationTask`, `approveDelegationTask`, and the task event listeners enqueue it into `durableTaskQueue`. The queue marks the task `running` and emits a `task.started` event before trying configured Nexora handlers.
4. **Only safe-demo tasks currently complete automatically.** The queue currently registers `nexoraSafeDemoWorker`, which handles objectives or required tools that match the safe local demo / delegation smoke path and completes those tasks with a local-only smoke result.
5. **General delegated tasks block today.** If no configured handler accepts the task, `DurableTaskQueue.process` marks it `blocked` with a log explaining that no Nexora worker handler is configured yet. The registry also keeps `delegation.execute_code` pointed at an unavailable `worker-bridge` provider, so there is no real general Nexora worker adapter for arbitrary delegated work yet.

## Files inspected

- `src/tools/registry.ts` registers the delegation tools and their executors, including `delegation.create_task`, `delegation.approve_task`, `delegation.record_result`, and the unavailable `delegation.execute_code` worker bridge.
- `src/tools/delegation.ts` connects registry executors to the task store and durable queue.
- `src/tasks/store.ts` owns task persistence, approval status transitions, audit events, results, and receipts.
- `src/tasks/queue.ts` owns queued-task dispatch, the safe-demo handler, and the fallback blocked state when no Nexora handler exists.
- `src/tools/codeTools.ts` contains gated workspace code tools for Nexora, but those tools are not a delegated-task worker handler by themselves.
