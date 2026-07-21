import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `core-command-lifecycle-${Date.now()}`);
process.env.AGENT_RUNTIME_DATA_DIR = path.join(smokeRoot, 'data');
await mkdir(process.env.AGENT_RUNTIME_DATA_DIR, { recursive: true });

const {
  assertCoreCommandTransition,
  clearCoreCommandsForTesting,
  createCoreCommand,
  decideInitialCommandAuthority,
  getCoreCommand,
  listCoreCommands,
  transitionCoreCommand,
} = await import('../src/core/index.js');

await clearCoreCommandsForTesting();

const command = await createCoreCommand({
  sessionId: 'session-lifecycle',
  agent: 'elora',
  requestText: 'Create a bounded local artifact and validate it.',
});
assert.equal(command.state, 'intent_received');

await transitionCoreCommand(command.id, 'context_assembled', {
  links: { memoryReferenceIds: ['memory-1', 'memory-1'] },
  context: { assembledAt: new Date().toISOString(), relationshipSubjectId: 'jordan' },
});
await transitionCoreCommand(command.id, 'authority_decided', {
  authority: decideInitialCommandAuthority({ executionMode: 'reactive', autonomyLevel: 1 }),
});
await transitionCoreCommand(command.id, 'planning');
await transitionCoreCommand(command.id, 'executing');
await transitionCoreCommand(command.id, 'delegated', { links: { taskIds: ['task-1'] } });
await transitionCoreCommand(command.id, 'validating', { links: { executionIds: ['execution-1'] } });
await transitionCoreCommand(command.id, 'receipted', { links: { receiptIds: ['receipt-1'] } });
await transitionCoreCommand(command.id, 'memory_candidates_recorded', { links: { memoryCandidateIds: ['candidate-1'] } });
await transitionCoreCommand(command.id, 'response_synthesized', { finalOutput: { visibleReply: 'Completed.' } });
await transitionCoreCommand(command.id, 'completed');

const completed = await getCoreCommand(command.id);
assert.ok(completed);
assert.equal(completed.state, 'completed');
assert.equal(completed.authority?.decision, 'execute_with_receipts');
assert.deepEqual(completed.links.memoryReferenceIds, ['memory-1']);
assert.deepEqual(completed.links.taskIds, ['task-1']);
assert.deepEqual(completed.links.executionIds, ['execution-1']);
assert.deepEqual(completed.links.receiptIds, ['receipt-1']);
assert.deepEqual(completed.links.memoryCandidateIds, ['candidate-1']);
assert.ok(completed.completedAt);
assert.equal(completed.events.at(-1)?.state, 'completed');

const waiting = await createCoreCommand({
  sessionId: 'session-approval',
  agent: 'elora',
  requestText: 'Perform an action that crosses an explicit boundary.',
});
await transitionCoreCommand(waiting.id, 'context_assembled');
await transitionCoreCommand(waiting.id, 'authority_decided', {
  authority: decideInitialCommandAuthority({ executionMode: 'reactive', autonomyLevel: 0 }),
});
await transitionCoreCommand(waiting.id, 'planning');
await transitionCoreCommand(waiting.id, 'executing');
await transitionCoreCommand(waiting.id, 'approval_pending');
await transitionCoreCommand(waiting.id, 'planning');
await transitionCoreCommand(waiting.id, 'cancelled');
assert.equal((await getCoreCommand(waiting.id))?.state, 'cancelled');

assert.throws(() => assertCoreCommandTransition('completed', 'planning'), /Invalid CORE command transition/);

const commands = await listCoreCommands({ limit: 10 });
assert.equal(commands.length, 2);
const sessionCommands = await listCoreCommands({ sessionId: 'session-lifecycle' });
assert.equal(sessionCommands.length, 1);

const commandsDir = path.join(process.env.AGENT_RUNTIME_DATA_DIR, 'core', 'commands');
const globalRecords = JSON.parse(await readFile(path.join(commandsDir, 'commands.json'), 'utf8')) as Array<{ id: string; state: string }>;
const sessionRecords = JSON.parse(await readFile(path.join(commandsDir, 'sessions', 'session-lifecycle.json'), 'utf8')) as Array<{ id: string; state: string }>;
const events = (await readFile(path.join(commandsDir, 'command-events.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
assert.ok(globalRecords.some((record) => record.id === command.id && record.state === 'completed'));
assert.ok(sessionRecords.some((record) => record.id === command.id && record.state === 'completed'));
assert.ok(events.some((event) => event.commandId === command.id && event.state === 'receipted'));
assert.ok(events.some((event) => event.commandId === waiting.id && event.state === 'approval_pending'));

console.log(JSON.stringify({
  status: 'CORE command lifecycle smoke checks passed',
  commandId: command.id,
  completedState: completed.state,
  eventCount: events.length,
  persistedGlobalRecords: globalRecords.length,
  persistedSessionRecords: sessionRecords.length,
}, null, 2));
