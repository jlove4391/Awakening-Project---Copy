import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.AGENT_RUNTIME_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'proactive-queue-'));

const { approveProactiveQueueItem, listProactiveQueueItems, upsertProactiveQueueItem } = await import('../src/governance/proactiveQueue.js');
const { getDelegatedTask } = await import('../src/tasks/store.js');

const first = await upsertProactiveQueueItem({
  title: 'Add bounded timeout around scan command', summary: 'Repeated scans can hang without a timeout guard.', source: 'elora', affectedArea: 'CORE scanner', risk: 'high', estimatedEffort: 'small', impact: 0.9, confidence: 0.8,
});
const second = await upsertProactiveQueueItem({
  title: 'Add bounded timeout around scan command', summary: 'Repeated proactive scan found the same timeout guard need with additional confidence.', source: 'core', affectedArea: 'CORE scanner', risk: 'high', estimatedEffort: 'small', impact: 0.85, confidence: 0.95,
});
if (!second.merged) throw new Error('expected duplicate proactive finding to merge');
if (first.item.id !== second.item.id) throw new Error('duplicate merge should preserve queue item id');
if (second.item.duplicateCount !== 2) throw new Error(`expected duplicateCount=2, got ${second.item.duplicateCount}`);

const approved = await approveProactiveQueueItem(first.item.id, 'tester', 'Approve guarded execution proposal.');
if (!approved?.task.id) throw new Error('approved item did not create a governed delegated task');
if (approved.item.status !== 'approved') throw new Error('approved item status was not recorded');
if (!approved.item.executionTaskId) throw new Error('approved item did not link executionTaskId');
const task = await getDelegatedTask(approved.task.id);
if (!task) throw new Error('delegated task missing after approval');
if (task.authorizationSource !== 'user_delegated' || task.executionOrigin !== 'delegated') throw new Error('approved item did not enter governed delegated execution path');

const ranked = await listProactiveQueueItems();
if (ranked[0]?.id !== first.item.id) throw new Error('queue did not return ranked items');
console.log('proactive queue duplicate merge and governed approval path ok');
