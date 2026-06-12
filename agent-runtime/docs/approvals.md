# Approval Replay Checklist

Use this Phase 1 checklist to verify that a human-approved Google Calendar write is replayed through the execution approval endpoint and leaves an auditable receipt.

## Phase 1 Google Calendar approval replay

- [ ] Ask ELORA to create a Google Calendar event for a safe test slot, and save the `sessionId` from the chat response stream.
- [ ] Confirm the pending execution appears from `GET /api/executions?sessionId=<sessionId>` with `approvalStatus: "pending"`, an `approvalRequest`, and the expected `calendar.create_event` action.
- [ ] Approve the pending execution with `POST /api/executions/<executionId>/approval` using a body like:

  ```json
  {
    "decision": "approve",
    "approvalNote": "Approved Phase 1 replay smoke test."
  }
  ```

- [ ] Confirm the Google Calendar event was created in the target calendar with the requested title, start time, end time, and attendee list if one was requested.
- [ ] Confirm the replayed execution record from `GET /api/executions?sessionId=<sessionId>` contains the final approval status, provider response summary, and receipt summary. Expected fields include `approvalStatus: "approved"`, a non-empty `providerResponseSummary`, and `receipt.summary` similar to `calendar.create_event approved and replayed`.

Reference implementation locations:

- `agent-runtime/src/routes/executions.ts` exposes `GET /api/executions?sessionId=...` and `POST /api/executions/:id/approval`.
- `agent-runtime/src/executions.ts` defines execution records, approval status, provider response summaries, receipts, and session-scoped execution persistence.
- `agent-runtime/src/providers/google/calendar.ts` gates `calendar.create_event` until replay input includes explicit human approval.
