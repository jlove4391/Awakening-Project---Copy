#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
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

const { createDelegatedTask, createAutonomousImprovementProposal, getDelegatedTask, markAutonomousImprovementProposalApproved, markAutonomousImprovementProposalApplied } = await import('../src/tasks/store.js');
const { planApplyVerify } = await import('../src/workflows/nexora/planApplyVerify.js');

const task = await createDelegatedTask({
  sessionId: 'proposal-smoke',
  objective: 'Autonomously propose a safe text-file improvement.',
  authorizationSource: 'autonomous',
  approvalRequirements: ['Human approval required before mutating files.'],
});

const proposed = await createAutonomousImprovementProposal(task.id, {
  title: 'Append approved proposal marker',
  summary: 'Append one line to proposal-target.txt after approval.',
  rationale: 'Demonstrates autonomous proposal creation without unapproved mutation.',
  affectedFiles: ['proposal-target.txt'],
  riskLevel: 'low',
  implementationNotes: 'Use the governed Nexora plan/apply/verify path after POST /api/tasks/:taskId/approve.',
  changes: [{ kind: 'edit_file', path: 'proposal-target.txt', mode: 'append', content: 'approved mutation\n' }],
  proposedBy: 'nexora',
});

assert.ok(proposed?.proposal, 'proposal should be stored on the delegated task');
assert.equal(proposed?.proposal.status, 'proposed');
assert.equal(proposed?.proposal.receipts[0]?.type, 'proposal_created');
assert.equal(await readFile(path.join(workspace, 'proposal-target.txt'), 'utf8'), 'initial\n', 'proposal creation must not mutate files');

const blocked = await planApplyVerify({
  objective: proposed!.proposal!.title,
  delegatedTaskId: task.id,
  changes: proposed!.proposal!.changes as any,
});

assert.equal(blocked.status, 'approval_required');
assert.equal(await readFile(path.join(workspace, 'proposal-target.txt'), 'utf8'), 'initial\n', 'governed path must block writes without approval');

const proposalApproved = await markAutonomousImprovementProposalApproved(task.id, 'user', 'Simulated POST /api/tasks/:taskId/approve approval.');
assert.equal(proposalApproved?.proposal?.receipts.at(-1)?.type, 'proposal_approved');

const approved = await planApplyVerify({
  objective: proposed!.proposal!.title,
  delegatedTaskId: task.id,
  relevantPaths: proposed!.proposal!.affectedFiles,
  changes: proposed!.proposal!.changes as any,
  writeApproval: { confirmedByUser: true, approvalNote: 'Simulated POST /api/tasks/:taskId/approve approval.' },
});

assert.equal(approved.status, 'completed');
assert.equal(await readFile(path.join(workspace, 'proposal-target.txt'), 'utf8'), 'initial\napproved mutation\n', 'approved proposal should mutate files through governed execution');
await markAutonomousImprovementProposalApplied(task.id, 'Proposal patch applied through nexora.plan_apply_verify.');
const finalTask = await getDelegatedTask(task.id);
assert.deepEqual(finalTask?.proposal?.receipts.map((receipt) => receipt.type), ['proposal_created', 'proposal_approved', 'patch_applied', 'proposal_completed']);
assert.ok(finalTask?.events.some((event) => event.eventType === 'task.completion_receipt'), 'completion receipt should be emitted');

console.log('Autonomous proposal approval smoke passed.');
