#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.OPENAI_API_KEY) {
  console.log(JSON.stringify({
    status: 'setup_required',
    provider: 'openai',
    reason: 'OPENAI_API_KEY is not configured; the live model-driven normal-path scenario was not executed.',
    simulatedSuccess: false,
  }, null, 2));
  process.exit(0);
}

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `alpha-evidence-live-${Date.now()}`);
const dataDir = path.join(smokeRoot, 'data');
const workspaceRoot = path.join(smokeRoot, 'workspace');
const sessionId = `alpha-evidence-live-${Date.now()}`;
const targetPath = 'alpha-live/remembered-doctrine.md';
const requiredText = 'LIVE-ALPHA-DOCTRINE';

process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.CODE_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_ENABLE_WRITE_FILES = 'true';
await mkdir(workspaceRoot, { recursive: true });

const { AlphaMemoryConfidence, AlphaMemoryStatus, memoryService } = await import('../src/memory/index.js');
const { runAgentMessage } = await import('../src/agentEndpoint.js');
const { getCoreCommand, getCoreContextBundle } = await import('../src/core/index.js');
const { getDelegatedTask } = await import('../src/tasks/store.js');
const { getCanonicalReceipt } = await import('../src/receipts.js');

const doctrine = await memoryService.createMemory({
  sessionId,
  category: 'decision',
  title: 'Live Alpha artifact doctrine',
  text: `When creating the live Alpha proof artifact, include the exact marker ${requiredText} and do not commit or push.`,
  summary: `Live Alpha proof files include ${requiredText}.`,
  scope: 'business_context',
  status: AlphaMemoryStatus.Canonical,
  confidence: AlphaMemoryConfidence.High,
  reviewNeeded: false,
  retrievalPriority: 1,
  importance: 1,
  tags: ['alpha-evidence', 'live-normal-path', 'doctrine'],
  actor: { actorId: 'jordan', actorType: 'user', displayName: 'Jordan' },
});

const runtimeEvents: unknown[] = [];
const result = await runAgentMessage({
  sessionId,
  agent: 'elora',
  executionMode: 'reactive',
  message: `Use the remembered live Alpha artifact doctrine. Delegate a bounded Nexora work order to create ${targetPath}, include the required doctrine marker, validate the file, and report the canonical receipt. Do not commit or push.`,
}, (event) => {
  if (event.event === 'runtime_event') runtimeEvents.push(event.data);
});
assert.ok(result.commandId, 'normal Elora request did not create a CORE command');
if (!result.commandId) throw new Error('normal Elora request did not create a CORE command');
let command = await getCoreCommand(result.commandId);
assert.ok(command);
if (!command) throw new Error('CORE command was not persisted');
assert.notEqual(command.state, 'failed');
assert.ok(command.events.some((event) => event.state === 'context_assembled'));
assert.ok(command.events.some((event) => event.state === 'authority_decided'));
assert.ok(runtimeEvents.some((event) => (event as { type?: string }).type === 'core.context.assembled'));
assert.ok(!runtimeEvents.some((event) => String((event as { type?: string }).type || '').startsWith('core_execution_proof.')));
const bundle = command.context.bundleId ? await getCoreContextBundle(command.context.bundleId) : undefined;
assert.ok(bundle?.references.memoryIds.includes(doctrine.id), 'live normal path did not assemble the remembered doctrine');

const taskIds = command.links.taskIds;
assert.ok(taskIds.length, 'live normal path did not create a bounded delegated task');
const completedTasks = [];
for (const taskId of taskIds) {
  const startedAt = Date.now();
  let task = await getDelegatedTask(taskId);
  while (Date.now() - startedAt < 60_000 && task && !['completed', 'failed', 'cancelled'].includes(task.status)) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    task = await getDelegatedTask(taskId);
  }
  assert.equal(task?.status, 'completed', task?.result?.summary || `task ${taskId} did not complete`);
  if (task) completedTasks.push(task);
}

assert.ok(existsSync(path.join(workspaceRoot, targetPath)), 'live normal path did not create the requested artifact');
const content = await readFile(path.join(workspaceRoot, targetPath), 'utf8');
assert.ok(content.includes(requiredText), 'live artifact did not apply the remembered doctrine marker');
const receiptIds = completedTasks.flatMap((task) => {
  const data = task.result?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const receiptId = (data as Record<string, unknown>).primaryReceiptId;
  return typeof receiptId === 'string' ? [receiptId] : [];
});
assert.ok(receiptIds.length, 'completed live task did not publish a primary canonical receipt');
for (const receiptId of receiptIds) {
  const receipt = await getCanonicalReceipt(receiptId);
  assert.equal(receipt?.integrity.status, 'complete');
  assert.equal(receipt?.validation.status, 'passed');
  assert.equal(receipt?.links.commandId, command.id);
  assert.ok(receipt?.links.memoryReferenceIds.includes(doctrine.id));
}
command = (await getCoreCommand(command.id)) || command;

console.log(JSON.stringify({
  status: 'passed',
  simulatedSuccess: false,
  commandId: command.id,
  commandState: command.state,
  contextBundleId: command.context.bundleId,
  doctrineMemoryId: doctrine.id,
  taskIds,
  primaryReceiptIds: receiptIds,
  artifactPath: targetPath,
}, null, 2));
