# Nexora delegated-task execution path

This note documents the current Elora-to-Nexora delegated-task path. It is descriptive only; the runtime behavior is unchanged.

## Current flow

1. **Elora can create delegated tasks.** The `delegation.create_task` registry entry exposes a durable Elora-to-Nexora task creation tool. It calls `createDelegationTask`, which stores the task with `parentAgent: 'elora'` and `assignedAgent: 'nexora'` through `createDelegatedTask`.
2. **Approval can move a task from `pending_approval` to `queued`.** `createDelegatedTask` starts tasks with approval requirements in `pending_approval`; `approveDelegatedTask` records pending approvals as approved and sets the status to `queued` once all required approvals are satisfied.
3. **The queue dispatches the task.** When task creation or update produces `queued`, `createDelegationTask`, `approveDelegationTask`, and the task event listeners enqueue it into `durableTaskQueue`. The queue marks the task `running` and emits a `task.started` event before trying configured Nexora handlers.
4. **Only safe-demo tasks currently complete automatically.** The queue currently registers `nexoraSafeDemoWorker`, which handles objectives or required tools that match the safe local demo / delegation smoke path and completes those tasks with a local-only smoke result.
5. **General delegated tasks block today.** If no configured handler accepts the task, `DurableTaskQueue.process` marks it `blocked` with a log explaining that no Nexora worker handler is configured yet. The registry also keeps `delegation.execute_code` pointed at an unavailable `worker-bridge` provider, so there is no real general Nexora worker adapter for arbitrary delegated work yet.

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

- `src/tools/registry.ts` registers the delegation tools and their executors, including `delegation.create_task`, `delegation.approve_task`, `delegation.record_result`, and the unavailable `delegation.execute_code` worker bridge.
- `src/tools/delegation.ts` connects registry executors to the task store and durable queue.
- `src/tasks/store.ts` owns task persistence, approval status transitions, audit events, results, and receipts.
- `src/tasks/queue.ts` owns queued-task dispatch, the safe-demo handler, and the fallback blocked state when no Nexora handler exists.
- `src/tools/codeTools.ts` contains gated workspace code tools for Nexora, but those tools are not a delegated-task worker handler by themselves.
