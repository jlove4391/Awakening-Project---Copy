#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `delegated-provider-blocked-${Date.now()}`);
const dataDir = path.join(smokeRoot, 'data');
const timeoutMs = Number(process.env.SMOKE_DELEGATED_PROVIDER_BLOCKED_TIMEOUT_MS || 30000);
const sessionId = `smoke-delegated-provider-blocked-${Date.now()}`;
const filename = `nexora-provider-blocked-smoke-${Date.now()}.txt`;
const content = 'Nexora delegated provider-configuration block smoke.';

process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.GOOGLE_TOKEN_STORE_PATH = path.join(dataDir, 'google-tokens.enc.json');
process.env.NEXORA_ENABLE_PROVIDER_RESOURCES = 'true';

for (const key of [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_TOKEN_STORE_KEY',
  'MASTER_KEY',
  'DIGITALOCEAN_API_TOKEN',
  'DO_API_TOKEN',
]) {
  delete process.env[key];
}

await mkdir(dataDir, { recursive: true });

const { approveDelegatedTask, approveExecutionPlanStep, createDelegatedTask, getDelegatedTask } = await import('../src/tasks/store.js');
await import('../src/tasks/queue.js');

console.log('Delegated provider-block smoke: creating delegated Google Drive task without provider credentials.');

const task = await createDelegatedTask({
  sessionId,
  objective: 'Create a text file in Google Drive to verify provider configuration blocking.',
  constraints: [`filename: ${filename}`, `content: ${content}`],
  requiredTools: ['drive.create_text_file'],
  approvalRequirements: ['Approve this delegated task before Nexora may prepare the Google Drive write step.'],
  initialLog: 'Smoke task must block with missing provider setup instead of appearing approved but doing nothing.',
});

assert.equal(task.status, 'pending_approval', 'task should start pending delegated-task approval');
console.log(`✓ Created delegated task ${task.id}.`);

const approvedTask = await approveDelegatedTask(task.id, 'smoke', 'Approve delegated provider-block smoke task.');
assert.equal(approvedTask?.status, 'queued', 'task should queue after delegated-task approval');
console.log('✓ Approved delegated task.');

const approvalBlocked = await waitForTask(task.id, (candidate) => candidate.status === 'blocked' && candidate.pendingToolAction?.toolName === 'drive.create_text_file');
assert.equal(approvalBlocked.blockedReason, 'step_approval_required');
const stepId = approvalBlocked.pendingToolAction?.stepId;
assert.ok(stepId, 'blocked task should expose pending Drive step ID');
console.log(`✓ Worker requested Drive write approval at step ${stepId}.`);

const stepApproved = await approveExecutionPlanStep(task.id, stepId, 'smoke', 'Approve Drive create_text_file write for provider-block smoke.');
assert.equal(stepApproved?.status, 'queued', 'task should requeue after Drive step approval');
console.log('✓ Approved Drive write step.');

const finalTask = await waitForTask(task.id, (candidate) => candidate.status === 'blocked' && candidate.blockedReason === 'provider_configuration_required');
const blockData = finalTask.result?.data as
  | { status?: string; provider?: string; providerName?: string; missingConfigHint?: string; nextManualAction?: string; tool?: string }
  | undefined;

assert.equal(finalTask.status, 'blocked', 'task should remain blocked until provider credentials are configured');
assert.equal(finalTask.blockedReason, 'provider_configuration_required');
assert.equal(blockData?.status, 'provider_configuration_required');
assert.equal(blockData?.provider, 'google-drive');
assert.equal(blockData?.providerName, 'Google Drive');
assert.equal(blockData?.tool, 'drive.create_text_file');
assert.match(blockData?.missingConfigHint || '', /Google (Drive )?(OAuth|account|token)|GOOGLE_/i);
assert.match(blockData?.nextManualAction || '', /(configure|open|provide).*(google|oauth|token|runtime|resume|retry)/i);
assert.match(finalTask.result?.summary || '', /Google Drive provider configuration required/i);
console.log(`✓ Task blocked clearly for missing provider configuration: ${finalTask.result?.summary}`);

const taskLogText = finalTask.logs.join('\n');
assert.match(taskLogText, /provider configuration is incomplete/i, 'task log should explain provider configuration is incomplete');
assert.match(taskLogText, /Next manual action:/i, 'task log should include the next setup step');
assert.ok(blockData?.nextManualAction && taskLogText.includes(blockData.nextManualAction), 'task log should include the exact next manual action');
console.log('✓ Task log explains the next setup step.');

const auditLogText = await readFile(path.join(dataDir, 'tasks', 'delegated-task-audit.jsonl'), 'utf8');
assert.match(auditLogText, /provider_configuration_required/, 'task audit log should record the provider-configuration block');
assert.match(auditLogText, /missingConfigHint/, 'task audit log should identify missing provider configuration');
assert.ok(blockData?.nextManualAction && auditLogText.includes(blockData.nextManualAction), 'task audit log should include the exact next manual action');
console.log('✓ Task audit log identifies missing provider configuration and the next setup step.');

console.log('Delegated provider-block smoke passed.');

async function waitForTask(taskId: string, predicate: (task: NonNullable<Awaited<ReturnType<typeof getDelegatedTask>>>) => boolean) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const task = await getDelegatedTask(taskId);
    if (task && predicate(task)) return task;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const latest = await getDelegatedTask(taskId);
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for task ${taskId}. Latest status: ${latest?.status}; reason: ${latest?.blockedReason}; result: ${latest?.result?.summary}`,
  );
}
