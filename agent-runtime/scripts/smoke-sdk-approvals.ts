#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const smokeRoot = path.join(tmpdir(), `sdk-approvals-${Date.now()}`);
const workspaceRoot = path.join(smokeRoot, 'workspace');
const dataDir = path.join(smokeRoot, 'data');
process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_ENABLE_WRITE_FILES = 'true';

await mkdir(path.join(workspaceRoot, '.runtime-smoke'), { recursive: true });

const { getRuntimeContext } = await import('../src/memory/index.js');
const { executeRegisteredTool } = await import('../src/tools/registry.js');
const { listExecutionRecords } = await import('../src/executions.js');
const {
  clearPendingSdkApproval,
  formatApprovalPrompt,
  getPendingSdkApproval,
  savePendingSdkApproval,
} = await import('../src/approvals/sdkApprovalStore.js');

const sessionId = `sdk-approval-smoke-${Date.now()}`;
const targetPath = '.runtime-smoke/sdk-approved-delete.txt';
const targetContent = 'SDK approval smoke deletes this file only after approval resume.\n';
const toolCallId = 'call-sdk-approval-smoke';
const commandId = 'command-sdk-approval-smoke';
const deleteInput = {
  path: targetPath,
  permanent: true,
  permanentApprovalNote: 'Approve permanent deletion of the isolated SDK smoke file.',
};

const context = await getRuntimeContext(sessionId);
context.agent = 'nexora';
context.executionMode = 'reactive';

const created = await executeRegisteredTool('code.create_file', { path: targetPath, content: targetContent }, context) as any;
assert.equal(created.ok, true, 'ordinary local file creation should execute without a redundant approval prompt');
assert.equal(await readFile(path.join(workspaceRoot, targetPath), 'utf8'), targetContent);

const paused = await executeRegisteredTool('code.delete_file', deleteInput, context, toolCallId) as any;
assert.equal(paused.ok, false, 'unapproved explicit-boundary tool call should not execute');
assert.equal(paused.result?.status || paused.status, 'approval_required', 'permanent delete should pause for HITL approval');
assert.equal(existsSync(path.join(workspaceRoot, targetPath)), true, 'paused permanent delete must preserve the file');

const singlePending = savePendingSdkApproval(sessionId, 'serialized-run-state-single', [
  {
    name: 'code.delete_file',
    toolName: 'code.delete_file',
    arguments: JSON.stringify(deleteInput),
    rawItem: { callId: toolCallId, riskLevel: 'high' },
  } as any,
], commandId);
assert.equal(singlePending.approvals.length, 1);
assert.equal(singlePending.commandId, commandId, 'pending SDK approval should retain the originating CORE command ID');
assert.match(formatApprovalPrompt(singlePending), /Reply with an explicit approval decision/);
assert.equal(getPendingSdkApproval(sessionId)?.approvals[0]?.approvalId, toolCallId);

context.sdkApprovedToolCallIds = [toolCallId];
context.sdkApprovedToolNames = ['code.delete_file'];
const approved = await executeRegisteredTool('code.delete_file', deleteInput, context, toolCallId) as any;
assert.equal(approved.ok, true, 'SDK-approved resume should execute the explicit-boundary tool');
assert.equal(approved.status, 'permanently_deleted');
assert.equal(existsSync(path.join(workspaceRoot, targetPath)), false, 'approved permanent delete should remove the isolated file');
clearPendingSdkApproval(sessionId);

const approvedRecords = await listExecutionRecords({ sessionId, limit: 20 });
const completedRecord = approvedRecords.find((record) => record.action === 'code.delete_file' && record.status === 'completed');
assert.ok(completedRecord, 'approved execution should write a completed execution record');
assert.equal(completedRecord?.approvalStatus, 'approved', 'explicit-boundary completion should reflect SDK approval');
assert.equal(completedRecord?.receipt.summary, 'code.delete_file completed');
assert.ok(completedRecord?.providerResponseSummary, 'completed execution should include provider response summary');

const rejectionSessionId = `${sessionId}-reject`;
const rejectionContext = await getRuntimeContext(rejectionSessionId);
rejectionContext.agent = 'nexora';
rejectionContext.executionMode = 'reactive';
const rejectedPath = '.runtime-smoke/rejected-delete.txt';
await executeRegisteredTool('code.create_file', { path: rejectedPath, content: 'preserve me\n' }, rejectionContext);
const rejectedInput = {
  path: rejectedPath,
  permanent: true,
  permanentApprovalNote: 'This isolated file would be permanently deleted only if approved.',
};
const rejectedApproval = savePendingSdkApproval(rejectionSessionId, 'serialized-run-state-reject', [
  {
    name: 'code.delete_file',
    toolName: 'code.delete_file',
    arguments: JSON.stringify(rejectedInput),
    rawItem: { callId: 'call-rejected', riskLevel: 'high' },
  } as any,
], 'command-rejected');
assert.equal(rejectedApproval.approvals[0]?.approvalId, 'call-rejected');
clearPendingSdkApproval(rejectionSessionId);
rejectionContext.sdkApprovedToolCallIds = [];
rejectionContext.sdkApprovedToolNames = [];
const rejected = await executeRegisteredTool('code.delete_file', rejectedInput, rejectionContext, 'call-rejected') as any;
assert.equal(rejected.result?.status || rejected.status, 'approval_required', 'rejected or cleared approval should remain blocked if retried without SDK approval');
assert.equal(existsSync(path.join(workspaceRoot, rejectedPath)), true, 'rejected permanent deletion must preserve the file');

const ambiguitySessionId = `${sessionId}-ambiguous`;
const ambiguous = savePendingSdkApproval(ambiguitySessionId, 'serialized-run-state-many', [
  { name: 'code.delete_file', toolName: 'code.delete_file', arguments: '{"path":"a","permanent":true}', rawItem: { callId: 'approval-a', riskLevel: 'high' } } as any,
  { name: 'code.delete_file', toolName: 'code.delete_file', arguments: '{"path":"b","permanent":true}', rawItem: { callId: 'approval-b', riskLevel: 'high' } } as any,
], 'command-ambiguous');
const ambiguityPrompt = formatApprovalPrompt(ambiguous);
assert.match(ambiguityPrompt, /Multiple approvals are pending/);
assert.match(ambiguityPrompt, /approval-a/);
assert.match(ambiguityPrompt, /approval-b/);
assert.equal(ambiguous.commandId, 'command-ambiguous');
clearPendingSdkApproval(ambiguitySessionId);

console.log('SDK approvals smoke passed.');
