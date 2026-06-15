#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const workspace = await mkdtemp(path.join(tmpdir(), 'nexora-commit-approval-smoke-'));
process.env.NEXORA_WORKSPACE_ROOT = workspace;
process.env.AGENT_RUNTIME_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nexora-commit-approval-data-'));
delete process.env.ENV;
delete process.env.BASH_ENV;

await execFileAsync('git', ['init'], { cwd: workspace });
await execFileAsync('git', ['config', 'user.email', 'nexora-smoke@example.local'], { cwd: workspace });
await execFileAsync('git', ['config', 'user.name', 'Nexora Smoke'], { cwd: workspace });
await writeFile(path.join(workspace, 'notes.txt'), 'initial\n');
await execFileAsync('git', ['add', 'notes.txt'], { cwd: workspace });
await execFileAsync('git', ['commit', '-m', 'initial commit'], { cwd: workspace });

const { planApplyVerify } = await import('../src/workflows/nexora/planApplyVerify.js');

console.log('Nexora commit approval smoke: edit file, run check, and request commit approval.');
const beforeCommit = await head();

const approvalRequestRun = await planApplyVerify({
  objective: 'Smoke edit with explicit commit approval gate.',
  changes: [{ kind: 'edit_file', path: 'notes.txt', mode: 'append', content: 'changed by smoke\n' }],
  checks: [{ command: 'true', cwd: '.', timeoutMs: 30000 }],
  writeApproval: { confirmedByUser: true, approvalNote: 'Approve smoke edit.' },
  checkApproval: { confirmedByUser: true, approvalNote: 'Approve smoke check.' },
  commit: { requested: true, message: 'smoke: nexora commit approval gate' },
});

assert.equal(approvalRequestRun.ok, true);
assert.equal(approvalRequestRun.commit.status, 'approval_required');
assert.ok(approvalRequestRun.commit.approvalRequest, 'commit request should include approval payload');
assert.deepEqual(approvalRequestRun.commit.approvalRequest?.changedFiles, ['notes.txt']);
assert.equal(approvalRequestRun.commit.approvalRequest?.diffSummary.addedLines, 1);
assert.equal(approvalRequestRun.commit.approvalRequest?.checksRun.length, 1);
assert.equal(await head(), beforeCommit, 'commit must not happen without explicit code.commit approval');
const statusAfterApprovalRequest = await git(['status', '--short']);
assert.match(statusAfterApprovalRequest, /M notes\.txt/, 'regular completion should be allowed to leave uncommitted changes');
console.log('✓ Commit request included changed files, diff summary, checks run, and left changes uncommitted.');

const failedCheckRun = await planApplyVerify({
  objective: 'Smoke failed check blocks commit approval.',
  checks: [{ command: 'node -e "process.exit(7)"', cwd: '.', timeoutMs: 30000 }],
  checkApproval: { confirmedByUser: true, approvalNote: 'Approve smoke failing check.' },
  commit: {
    requested: true,
    message: 'smoke: should be blocked by failed check',
    approval: { confirmedByUser: true, approvalNote: 'Approve commit, but no failed-check override.' },
  },
});

assert.equal(failedCheckRun.ok, false);
assert.equal(failedCheckRun.commit.status, 'blocked_failed_checks');
assert.equal(failedCheckRun.commit.approvalRequest?.requiresFailedChecksOverride, true);
assert.equal(await head(), beforeCommit, 'failed checks should block commit without high-risk override');
console.log('✓ Failed checks blocked commit without high-risk override approval.');

const commitRun = await planApplyVerify({
  objective: 'Smoke commit after explicit code.commit approval.',
  checks: [{ command: 'true', cwd: '.', timeoutMs: 30000 }],
  checkApproval: { confirmedByUser: true, approvalNote: 'Approve final smoke check.' },
  commit: {
    requested: true,
    message: 'smoke: nexora commit approval gate',
    approval: { confirmedByUser: true, approvalNote: 'Explicitly approve code.commit for smoke.' },
  },
});

assert.equal(commitRun.ok, true);
assert.equal(commitRun.commit.status, 'committed');
assert.notEqual(await head(), beforeCommit, 'commit should happen after explicit code.commit approval');
assert.equal(await git(['status', '--short']), '', 'workspace should be clean after approved commit');
console.log('✓ Committed only after explicit approval.');
console.log('Nexora commit approval smoke passed.');

async function git(args: string[]) {
  const { stdout } = await execFileAsync('git', args, { cwd: workspace });
  return stdout.trim();
}

async function head() {
  return git(['rev-parse', 'HEAD']);
}
