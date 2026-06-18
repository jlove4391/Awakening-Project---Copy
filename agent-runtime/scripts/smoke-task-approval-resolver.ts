import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDelegatedTask } from '../src/tasks/store.js';
import { pendingApprovalShape, resolveExplicitTaskApproval, resolveLatestConversationalApproval } from '../src/approvals/taskApprovalResolver.js';

const sessionId = `approval-resolver-${randomUUID()}`;

const apiTask = await createDelegatedTask({
  sessionId,
  objective: 'API approval resolver smoke',
  approvalRequirements: ['Approve API path'],
  authorizationSource: 'autonomous',
});
const apiPending = pendingApprovalShape(apiTask);
assert.deepEqual(apiPending && { taskId: apiPending.taskId, scope: apiPending.scope, stepId: apiPending.stepId }, { taskId: apiTask.id, scope: 'task', stepId: undefined });

const apiApproval = await resolveExplicitTaskApproval(apiTask.id, { approver: 'smoke-user', note: 'API approval smoke' });
assert.equal(apiApproval.task?.approvalRequirements[0]?.status, 'approved');
assert.equal(apiApproval.pendingApproval?.scope, apiPending?.scope);
assert.equal(apiApproval.receipt?.action, 'delegation.approve_task');
assert.equal(apiApproval.receipt?.approver, 'smoke-user');

const conversationalTask = await createDelegatedTask({
  sessionId,
  objective: 'Conversational approval resolver smoke',
  approvalRequirements: ['Approve conversational path'],
  authorizationSource: 'autonomous',
});
const conversationalPending = pendingApprovalShape(conversationalTask);
assert.deepEqual(conversationalPending && { scope: conversationalPending.scope, stepId: conversationalPending.stepId }, { scope: 'task', stepId: undefined });

const conversationalApproval = await resolveLatestConversationalApproval(sessionId, { approver: 'Jordan', note: 'Conversational approval smoke' });
assert.equal(conversationalApproval.task?.id, conversationalTask.id);
assert.equal(conversationalApproval.task?.approvalRequirements[0]?.status, 'approved');
assert.equal(conversationalApproval.pendingApproval?.scope, conversationalPending?.scope);
assert.equal(conversationalApproval.receipt?.action, apiApproval.receipt?.action);
assert.equal(conversationalApproval.receipt?.scope, apiApproval.receipt?.scope);
assert.ok(conversationalApproval.receipt?.approvedAt);
assert.ok(apiApproval.receipt?.approvedAt);

console.log(JSON.stringify({ ok: true, apiReceipt: apiApproval.receipt, conversationalReceipt: conversationalApproval.receipt }, null, 2));
