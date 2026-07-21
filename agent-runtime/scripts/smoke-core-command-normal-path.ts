import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.OPENAI_API_KEY) {
  console.log(JSON.stringify({ status: 'skipped', reason: 'OPENAI_API_KEY is not configured.' }, null, 2));
  process.exit(0);
}

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `core-command-normal-path-${Date.now()}`);
const dataDir = path.join(smokeRoot, 'data');
const workspaceRoot = path.join(smokeRoot, 'workspace');
process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.CODE_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;
await mkdir(dataDir, { recursive: true });
await mkdir(workspaceRoot, { recursive: true });

const { runAgentMessage } = await import('../src/agentEndpoint.js');
const { getCoreCommand } = await import('../src/core/index.js');

const runtimeEvents: unknown[] = [];
const result = await runAgentMessage({
  agent: 'elora',
  executionMode: 'reactive',
  message: 'Create a bounded Nexora work order to create normal-command-path/proof.txt containing the words normal command path, validate that the file exists, and report the result.',
}, (event) => {
  if (event.event === 'runtime_event') runtimeEvents.push(event.data);
});

assert.ok(result.commandId, 'normal Elora request did not create a CORE command');
if (!result.commandId) throw new Error('normal Elora request did not create a CORE command');
const command = await getCoreCommand(result.commandId);
assert.ok(command, 'CORE command was not persisted');
if (!command) throw new Error('CORE command was not persisted');
assert.notEqual(command.state, 'failed');
assert.ok(command.events.some((event) => event.state === 'context_assembled'));
assert.ok(command.events.some((event) => event.state === 'authority_decided'));
assert.ok(runtimeEvents.some((event) => (event as { type?: string }).type === 'core.command.lifecycle'));
assert.ok(!runtimeEvents.some((event) => String((event as { type?: string }).type || '').startsWith('core_execution_proof.')));

console.log(JSON.stringify({
  status: 'normal conversational command path smoke checks passed',
  commandId: command.id,
  commandState: command.state,
  taskIds: command.links.taskIds,
  executionIds: command.links.executionIds,
  receiptIds: command.links.receiptIds,
}, null, 2));
