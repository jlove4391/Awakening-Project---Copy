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
const targetPath = '.runtime-smoke/sdk-approved.txt';
const targetContent = 'SDK approval smoke created this file after approval resume.\n';
const toolCallId = 'call-sdk-approval-smoke';

const context = await getRuntimeContext(sessionId);
context.agent = 'nexora';
context.executionMode = 'reactive';

const paused = await executeRegisteredTool('code.create_file', { path: targetPath, content: targetContent }, context, toolCallId) as any;
assert.equal(paused.ok, false, 'unapproved SDK-gated tool call should not execute');
assert.equal(paused.status, 'approval_required', 'unapproved tool call should pause for HITL approval');
assert.equal(existsSync(path.join(workspaceRoot, targetPath)), false, 'paused tool call must not create the file');


const singlePending = savePendingSdkApproval(sessionId, 'serialized-run-state-single', [
  {
    name: 'code.create_file',
    toolName: 'code.create_file',
    arguments: JSON.stringify({ path: targetPath, content: targetContent }),
    rawItem: { callId: toolCallId, riskLevel: 'medium' },
  } as any,
]);
assert.equal(singlePending.approvals.length, 1);
assert.match(formatApprovalPrompt(singlePending), /Reply with an explicit approval decision/);
assert.equal(getPendingSdkApproval(sessionId)?.approvals[0]?.approvalId, toolCallId);

context.sdkApprovedToolCallIds = [toolCallId];
context.sdkApprovedToolNames = ['code.create_file'];
const approved = await executeRegisteredTool('code.create_file', { path: targetPath, content: targetContent }, context, toolCallId) as any;
assert.equal(approved.ok, true, 'SDK-approved resume should execute the tool');
assert.equal(await readFile(path.join(workspaceRoot, targetPath), 'utf8'), targetContent);
clearPendingSdkApproval(sessionId);

const approvedRecords = await listExecutionRecords({ limit: 10 });
const completedRecord = approvedRecords.find((record) => record.action === 'code.create_file' && record.status === 'completed');
assert.ok(completedRecord, 'approved execution should write a completed execution record');
assert.ok(['approved', 'not_required'].includes(completedRecord?.approvalStatus || ''), 'completed execution should reflect approved or no-longer-required approval status');
assert.equal(completedRecord?.receipt.summary, 'code.create_file completed');
assert.ok(completedRecord?.providerResponseSummary, 'completed execution should include provider response summary');

const rejectionSessionId = `${sessionId}-reject`;
const rejectionContext = await getRuntimeContext(rejectionSessionId);
rejectionContext.agent = 'nexora';
rejectionContext.executionMode = 'reactive';
const rejectedApproval = savePendingSdkApproval(rejectionSessionId, 'serialized-run-state-reject', [
  {
    name: 'code.create_file',
    toolName: 'code.create_file',
    arguments: JSON.stringify({ path: '.runtime-smoke/rejected.txt', content: 'nope\n' }),
    rawItem: { callId: 'call-rejected', riskLevel: 'medium' },
  } as any,
]);
assert.equal(rejectedApproval.approvals[0]?.approvalId, 'call-rejected');
clearPendingSdkApproval(rejectionSessionId);
rejectionContext.sdkApprovedToolCallIds = [];
rejectionContext.sdkApprovedToolNames = [];
const rejected = await executeRegisteredTool('code.create_file', { path: '.runtime-smoke/rejected.txt', content: 'nope\n' }, rejectionContext, 'call-rejected') as any;
assert.equal(rejected.status, 'approval_required', 'rejected/cleared approval should remain blocked if retried without SDK approval');
assert.equal(existsSync(path.join(workspaceRoot, '.runtime-smoke/rejected.txt')), false, 'rejected approval must not create the file');

const ambiguitySessionId = `${sessionId}-ambiguous`;
const ambiguous = savePendingSdkApproval(ambiguitySessionId, 'serialized-run-state-many', [
  { name: 'code.create_file', toolName: 'code.create_file', arguments: '{"path":"a"}', rawItem: { callId: 'approval-a', riskLevel: 'medium' } } as any,
  { name: 'code.create_file', toolName: 'code.create_file', arguments: '{"path":"b"}', rawItem: { callId: 'approval-b', riskLevel: 'medium' } } as any,
]);
const ambiguityPrompt = formatApprovalPrompt(ambiguous);
assert.match(ambiguityPrompt, /Multiple approvals are pending/);
assert.match(ambiguityPrompt, /approval-a/);
assert.match(ambiguityPrompt, /approval-b/);
clearPendingSdkApproval(ambiguitySessionId);

console.log('SDK approvals smoke passed.');
