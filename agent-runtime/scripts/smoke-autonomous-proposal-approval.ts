#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import express from 'express';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const workspace = await mkdtemp(path.join(tmpdir(), 'autonomous-proposal-workspace-'));
process.env.NEXORA_WORKSPACE_ROOT = workspace;
process.env.AGENT_RUNTIME_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'autonomous-proposal-data-'));
delete process.env.ENV;
delete process.env.BASH_ENV;

await execFileAsync('git', ['init'], { cwd: workspace });
await writeFile(path.join(workspace, 'proposal-target.txt'), 'initial\n');

const { tasksRouter } = await import('../src/routes/tasks.js');
const { createDelegatedTask, getDelegatedTask } = await import('../src/tasks/store.js');
const { planApplyVerify } = await import('../src/workflows/nexora/planApplyVerify.js');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api/tasks', tasksRouter);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
});
const server = app.listen(0);
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const task = await createDelegatedTask({
    sessionId: 'proposal-smoke',
    objective: 'Autonomously propose a safe text-file improvement.',
    authorizationSource: 'autonomous',
    approvalRequirements: ['Human approval required before mutating files.'],
  });

  const proposalResponse = await fetch(`${baseUrl}/api/tasks/${task.id}/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Append approved proposal marker',
      summary: 'Append one line to proposal-target.txt after approval.',
      rationale: 'Demonstrates autonomous proposal creation without unapproved mutation.',
      affectedFiles: ['proposal-target.txt'],
      riskLevel: 'low',
      implementationNotes: 'Use the governed Nexora plan/apply/verify path after POST /api/tasks/:taskId/approve.',
      changes: [{ kind: 'edit_file', path: 'proposal-target.txt', mode: 'append', content: 'approved mutation\n' }],
      proposedBy: 'nexora',
    }),
  });
  assert.equal(proposalResponse.status, 201);
  const proposedPayload = await proposalResponse.json() as any;
  const proposed = proposedPayload.task;

  assert.ok(proposed.proposal, 'proposal should be stored on the delegated task');
  assert.equal(proposed.proposal.status, 'proposed');
  assert.equal(proposed.proposal.receipts[0]?.type, 'proposal_created');
  assert.equal(await readFile(path.join(workspace, 'proposal-target.txt'), 'utf8'), 'initial\n', 'proposal creation must not mutate files');

  const blocked = await planApplyVerify({
    objective: proposed.proposal.title,
    delegatedTaskId: task.id,
    changes: proposed.proposal.changes as any,
  });

  assert.equal(blocked.status, 'approval_required');
  assert.equal(await readFile(path.join(workspace, 'proposal-target.txt'), 'utf8'), 'initial\n', 'governed path must block writes without approval');

  const approvalResponse = await fetch(`${baseUrl}/api/tasks/${task.id}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirmedByUser: true, approver: 'user', note: 'Approved autonomous proposal smoke patch.' }),
  });
  const approvalBody = await approvalResponse.clone().text();
  assert.equal(approvalResponse.status, 200, approvalBody);
  const approvedPayload = JSON.parse(approvalBody) as any;

  assert.equal(approvedPayload.task.proposal.status, 'completed');
  assert.equal(await readFile(path.join(workspace, 'proposal-target.txt'), 'utf8'), 'initial\napproved mutation\n', 'approved proposal should mutate files through governed execution');

  const finalTask = await getDelegatedTask(task.id);
  assert.deepEqual(finalTask?.proposal?.receipts.map((receipt) => receipt.type), ['proposal_created', 'proposal_approved', 'patch_applied', 'proposal_completed']);
  assert.ok(finalTask?.events.some((event) => event.eventType === 'proposal.created'), 'proposal creation receipt event should be emitted');
  assert.ok(finalTask?.events.some((event) => event.eventType === 'proposal.approved'), 'proposal approval receipt event should be emitted');
  assert.ok(finalTask?.events.some((event) => event.eventType === 'proposal.patch_applied'), 'proposal application receipt event should be emitted');
  assert.ok(finalTask?.events.some((event) => event.eventType === 'proposal.completed'), 'proposal completion receipt event should be emitted');

  console.log('Autonomous proposal approval smoke passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
