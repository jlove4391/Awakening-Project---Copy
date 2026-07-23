#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `alpha-evidence-restart-${Date.now()}`);
const dataDir = path.join(smokeRoot, 'data');
const workspaceRoot = path.join(smokeRoot, 'workspace');
const handoffPath = path.join(smokeRoot, 'handoff.json');
const sessionId = `alpha-evidence-restart-${Date.now()}`;
const targetPath = 'evidence/restart-continuity.txt';
const targetContent = 'Completed mutation must survive restart without replay.\n';

process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.CODE_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_ENABLE_WRITE_FILES = 'true';
await mkdir(path.join(workspaceRoot, 'evidence'), { recursive: true });
await writeFile(path.join(workspaceRoot, targetPath), targetContent);
const before = await stat(path.join(workspaceRoot, targetPath));

const { getRuntimeContext, memoryService, AlphaMemoryConfidence, AlphaMemoryStatus } = await import('../src/memory/index.js');
const { assembleCoreContext, createCoreCommand, decideInitialCommandAuthority, transitionCoreCommand } = await import('../src/core/index.js');
const { createDelegatedTask, updateDelegatedTask } = await import('../src/tasks/store.js');
const { createNexoraWorkOrderForTask, transitionNexoraWorkOrder } = await import('../src/tasks/workOrders.js');

const doctrine = await memoryService.createMemory({
  sessionId,
  category: 'decision',
  title: 'Restart continuity doctrine',
  text: 'Completed mutations must never be replayed after a runtime restart; resume from durable unfinished steps only.',
  scope: 'business_context',
  status: AlphaMemoryStatus.Canonical,
  confidence: AlphaMemoryConfidence.High,
  reviewNeeded: false,
  retrievalPriority: 1,
  importance: 1,
  tags: ['alpha-evidence', 'restart', 'continuity'],
  actor: { actorId: 'jordan', actorType: 'user', displayName: 'Jordan' },
});

const context = await getRuntimeContext(sessionId);
context.agent = 'elora';
context.channel = 'text';
context.executionMode = 'reactive';
let command = await createCoreCommand({
  sessionId,
  agent: 'elora',
  requestText: 'Continue the unfinished restart evidence work without replaying the completed mutation.',
});
context.commandId = command.id;
const bundle = await assembleCoreContext({
  sessionId,
  requestText: command.requestText,
  agent: 'elora',
  executionMode: 'reactive',
  commandId: command.id,
});
context.coreContext = bundle;
context.relationshipContext = bundle.relationship.context;
assert.ok(bundle.references.memoryIds.includes(doctrine.id));
command = (await transitionCoreCommand(command.id, 'context_assembled', {
  summary: 'Restart evidence context assembled.',
  context: {
    bundleId: bundle.id,
    assembledAt: bundle.assembledAt,
    identityId: bundle.identity.id,
    relationshipSubjectId: bundle.relationship.context.subjectId,
    trustDomain: bundle.executionEnvelope.primaryTrustDomain,
    trustScore: bundle.executionEnvelope.trustScore,
    autonomyEnvelope: bundle.executionEnvelope.autonomyEnvelope,
    validationRequirement: bundle.executionEnvelope.validationRequirement,
    scopeLimit: bundle.executionEnvelope.scopeLimit,
    activeObjective: command.requestText,
  },
  links: {
    identityIds: bundle.references.identityIds,
    memoryReferenceIds: bundle.references.memoryIds,
    relationshipEntryIds: bundle.references.relationshipEntryIds,
    trustDomains: bundle.references.trustDomains,
  },
})).command;
command = (await transitionCoreCommand(command.id, 'authority_decided', {
  summary: 'Restart evidence authority decided.',
  authority: decideInitialCommandAuthority({ executionMode: 'reactive', executionEnvelope: bundle.executionEnvelope }),
})).command;
command = (await transitionCoreCommand(command.id, 'planning', { summary: 'Prepared restart continuation plan.' })).command;
command = (await transitionCoreCommand(command.id, 'executing', { summary: 'Started durable restart evidence work.' })).command;

const task = await createDelegatedTask({
  sessionId,
  objective: `Continue validating ${targetPath} without repeating the completed file creation step.`,
  assignedAgent: 'nexora',
  authorizationSource: 'user_delegated',
  requiredTools: ['code.create_file', 'code.read'],
  constraints: [`Only inspect ${targetPath} after restart.`, 'Do not replay completed mutations.'],
  memoryContext: [{ id: doctrine.id, status: doctrine.status, category: doctrine.category }],
  executionPlan: [
    {
      targetTool: 'code.create_file',
      arguments: { path: targetPath, content: targetContent },
      status: 'completed',
      resultSummary: 'File creation completed and persisted before the simulated restart.',
    },
    {
      targetTool: 'code.read',
      arguments: { path: targetPath },
      status: 'queued',
    },
  ],
});
command = (await transitionCoreCommand(command.id, 'delegated', {
  summary: `Persisted unfinished Nexora task ${task.id} with one completed mutation.`,
  links: { taskIds: [task.id] },
})).command;
const workOrder = await createNexoraWorkOrderForTask(task, context);
await transitionNexoraWorkOrder(task.id, 'running', {
  actor: 'nexora',
  summary: 'Simulated process interruption after the completed mutation and before the remaining read step.',
});
await updateDelegatedTask(task.id, {
  status: 'running',
  log: 'Simulated fresh-process interruption with completed mutation state persisted.',
});

await writeFile(handoffPath, JSON.stringify({
  dataDir,
  workspaceRoot,
  sessionId,
  commandId: command.id,
  contextBundleId: bundle.id,
  doctrineMemoryId: doctrine.id,
  taskId: task.id,
  workOrderId: workOrder.id,
  targetPath,
  targetContent,
  beforeMtimeMs: before.mtimeMs,
}, null, 2));

const verifierPath = path.join(runtimeRoot, 'scripts', 'verify-alpha-evidence-restart.ts');
const child = spawn(process.execPath, ['--import', 'tsx', verifierPath, handoffPath], {
  cwd: runtimeRoot,
  env: {
    ...process.env,
    AGENT_RUNTIME_DATA_DIR: dataDir,
    CODE_WORKSPACE_ROOT: workspaceRoot,
    NEXORA_WORKSPACE_ROOT: workspaceRoot,
    NEXORA_ENABLE_WRITE_FILES: 'true',
  },
  stdio: 'inherit',
});
const exitCode = await new Promise<number | null>((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', resolve);
});
assert.equal(exitCode, 0, `restart verifier exited with ${exitCode}`);
console.log(`✓ Fresh-process Alpha evidence continuation completed for work order ${workOrder.id}.`);
