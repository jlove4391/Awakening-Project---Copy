import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `elora-nexora-proof-${Date.now()}`);
process.env.AGENT_RUNTIME_DATA_DIR = path.join(smokeRoot, 'data');
process.env.CODE_WORKSPACE_ROOT = path.join(smokeRoot, 'workspace');
process.env.NEXORA_WORKSPACE_ROOT = process.env.CODE_WORKSPACE_ROOT;
await mkdir(process.env.AGENT_RUNTIME_DATA_DIR, { recursive: true });
await mkdir(process.env.CODE_WORKSPACE_ROOT, { recursive: true });

const { runAgentMessage } = await import('../src/agentEndpoint.js');
const { listExecutionRecords } = await import('../src/executions.js');
const { listTrustEvents } = await import('../src/governance/trustStore.js');

const runtimeEvents: unknown[] = [];
const request = 'Have Nexora create a CORE execution proof file, write a timestamped note, run a validation command, and report the receipt.';
const result = await runAgentMessage(
  { message: request, agent: 'elora', executionMode: 'reactive' },
  (event) => {
    if (event.event === 'runtime_event') runtimeEvents.push(event.data);
  },
);

const finalOutput = result.finalOutput as { visibleReply?: string; proof?: { proofFile?: string; validationCommand?: string; receiptId?: string; receiptSummary?: string; approvalRequired?: boolean; status?: string } };
assert.match(finalOutput.visibleReply || '', /CORE execution proof/i);
assert.equal(finalOutput.proof?.approvalRequired, false);
assert.equal(finalOutput.proof?.status, 'completed');
assert.ok(finalOutput.proof?.proofFile, 'proof file path missing');
assert.ok(finalOutput.proof?.validationCommand?.includes('proof file validated'));

const proofPath = path.join(process.env.CODE_WORKSPACE_ROOT, finalOutput.proof.proofFile);
const proofContent = await readFile(proofPath, 'utf8');
assert.match(proofContent, /CORE execution proof created by Nexora/);

const executions = await listExecutionRecords({ sessionId: result.sessionId, limit: 20 });
assert.ok(executions.some((execution) => execution.action === 'code.create_file' && execution.status === 'completed'));
assert.ok(executions.some((execution) => execution.action === 'code.test' && execution.status === 'completed'));
assert.ok(executions.every((execution) => execution.approvalStatus !== 'pending'));
assert.ok(executions.every((execution) => execution.status !== 'blocked'));
assert.ok(finalOutput.proof.receiptId || executions.some((execution) => execution.receipt?.summary));

const trustEvents = await listTrustEvents();
assert.ok(trustEvents.some((event) => event.domain === 'repository' && event.type === 'action_succeeded'));
assert.ok(trustEvents.some((event) => event.domain === 'commands' && event.type === 'action_succeeded'));
assert.ok(runtimeEvents.some((event) => (event as { type?: string }).type === 'core_execution_proof.completed'));

console.log(JSON.stringify({
  status: 'elora nexora execution proof smoke checks passed',
  sessionId: result.sessionId,
  proofFile: finalOutput.proof.proofFile,
  validationCommand: finalOutput.proof.validationCommand,
  receiptId: finalOutput.proof.receiptId,
  receiptSummary: finalOutput.proof.receiptSummary,
  trustEvents: trustEvents.map((event) => event.summary).slice(0, 6),
}, null, 2));
