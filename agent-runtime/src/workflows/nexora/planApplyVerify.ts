import {
  completeExecutionRecord,
  createExecutionRecord,
  writeExecutionRecord,
} from '../../executions.js';
import {
  appendDelegatedTaskEvent,
  completeDelegatedTask,
  getDelegatedTask,
} from '../../tasks/store.js';
import type { DelegatedTask, DelegatedTaskResult } from '../../tasks/types.js';
import {
  codeCommit,
  codeCreateFile,
  codeDiff,
  codeEdit,
  codePackageScripts,
  codePatchFile,
  codeProjectSummary,
  codeRead,
  codeSearch,
  codeTest,
  codeTree,
  vscodeStatus,
  workspaceRoot,
  type ApprovalGateInput,
} from '../../tools/codeTools.js';

export type NexoraPlanApplyVerifyChange =
  | {
      kind: 'create_file';
      path: string;
      content: string;
      expectedSha256?: string;
    }
  | {
      kind: 'edit_file';
      path: string;
      content: string;
      mode?: 'overwrite' | 'append';
      expectedSha256?: string;
    }
  | {
      kind: 'patch_file';
      path: string;
      search: string;
      replace: string;
      replaceAll?: boolean;
      expectedSha256?: string;
    };

export interface NexoraPlanApplyVerifyCheck {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface NexoraPlanApplyVerifyInput {
  objective?: string;
  delegatedTaskId?: string;
  sessionId?: string;
  relevantPaths?: string[];
  searchQueries?: string[];
  changes?: NexoraPlanApplyVerifyChange[];
  checks?: NexoraPlanApplyVerifyCheck[];
  approval?: ApprovalGateInput;
  writeApproval?: ApprovalGateInput;
  checkApproval?: ApprovalGateInput;
  commit?: {
    requested?: boolean;
    message?: string;
    approval?: ApprovalGateInput;
    allowFailedChecksOverride?: boolean;
    failedChecksApproval?: ApprovalGateInput;
  };
}

export interface NexoraImplementationPlanStep {
  id: string;
  order: number;
  phase: 'inspect' | 'apply' | 'verify' | 'summarize' | 'record' | 'commit';
  title: string;
  targetTool: string;
  approvalRequired: boolean;
  status: 'completed' | 'pending_approval' | 'ready' | 'skipped';
  details?: unknown;
}

export interface NexoraPlanApplyVerifyResult {
  ok: boolean;
  status: 'planned' | 'approval_required' | 'completed' | 'failed';
  objective: string;
  delegatedTaskId?: string;
  plan: NexoraImplementationPlanStep[];
  inspections: unknown[];
  appliedChanges: unknown[];
  checks: unknown[];
  diffSummary?: NexoraDiffSummary;
  receipt: {
    summary: string;
    issuedAt: string;
    executionRecordId: string;
    delegatedTaskReceiptId?: string;
  };
  commit: {
    requested: boolean;
    status: 'not_requested' | 'approval_required' | 'blocked_failed_checks' | 'committed' | 'not_run';
    message?: string;
    approvalRequest?: NexoraCommitApprovalRequest;
    result?: unknown;
  };
}

export interface NexoraDiffSummary {
  changedFiles: string[];
  addedLines: number;
  removedLines: number;
  truncated: boolean;
  preview: string;
}

export interface NexoraCommitApprovalRequest {
  tool: 'code.commit';
  message?: string;
  changedFiles: string[];
  diffSummary: Pick<NexoraDiffSummary, 'addedLines' | 'removedLines' | 'truncated' | 'preview'>;
  checksRun: unknown[];
  failedChecks: unknown[];
  requiresFailedChecksOverride: boolean;
}

const readOnlyInspectionLimit = 12;

function now() {
  return new Date().toISOString();
}

function approvalConfirmed(input?: ApprovalGateInput) {
  return input?.confirmedByUser === true;
}

function buildCommitApprovalRequest(input: NexoraPlanApplyVerifyInput, diffSummary: NexoraDiffSummary, checksRun: unknown[], failedChecks: unknown[]): NexoraCommitApprovalRequest {
  return {
    tool: 'code.commit',
    ...(input.commit?.message ? { message: input.commit.message } : {}),
    changedFiles: diffSummary.changedFiles,
    diffSummary: {
      addedLines: diffSummary.addedLines,
      removedLines: diffSummary.removedLines,
      truncated: diffSummary.truncated,
      preview: diffSummary.preview,
    },
    checksRun,
    failedChecks,
    requiresFailedChecksOverride: failedChecks.length > 0,
  };
}

function taskObjective(task: DelegatedTask | undefined, input: NexoraPlanApplyVerifyInput) {
  const objective = input.objective?.trim() || task?.objective?.trim();
  if (!objective) throw new Error('Nexora plan/apply/verify requires either objective or delegatedTaskId.');
  return objective;
}

function planStep(
  order: number,
  phase: NexoraImplementationPlanStep['phase'],
  title: string,
  targetTool: string,
  approvalRequired: boolean,
  status: NexoraImplementationPlanStep['status'],
  details?: unknown,
): NexoraImplementationPlanStep {
  return { id: `${phase}-${order}`, order, phase, title, targetTool, approvalRequired, status, ...(details !== undefined ? { details } : {}) };
}

function summarizeDiff(diffResult: Awaited<ReturnType<typeof codeDiff>>): NexoraDiffSummary {
  const changedFiles = new Set<string>();
  let addedLines = 0;
  let removedLines = 0;

  for (const line of diffResult.diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = line.match(/^diff --git a\/(.*?) b\/(.*)$/);
      if (match?.[2]) changedFiles.add(match[2]);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removedLines += 1;
    }
  }

  return {
    changedFiles: [...changedFiles].sort(),
    addedLines,
    removedLines,
    truncated: diffResult.truncated,
    preview: diffResult.diff.slice(0, 12_000),
  };
}

async function inspectWorkspace(input: NexoraPlanApplyVerifyInput) {
  const inspections: unknown[] = [];
  inspections.push({ tool: 'vscode.status', result: await vscodeStatus() });
  inspections.push({ tool: 'code.project_summary', result: await codeProjectSummary({ path: '.', maxFiles: 2000, maxItems: 100 }) });
  inspections.push({ tool: 'code.package_scripts', result: await codePackageScripts({ path: '.', maxFiles: 2000, maxItems: 50 }) });
  inspections.push({ tool: 'code.tree', result: await codeTree({ path: '.', maxFiles: 2000, maxItems: 200, maxDepth: 4 }) });

  for (const path of (input.relevantPaths || []).slice(0, readOnlyInspectionLimit)) {
    inspections.push({ tool: 'code.read', input: { path }, result: await codeRead({ path, maxBytes: 80_000 }) });
  }

  for (const query of (input.searchQueries || []).slice(0, readOnlyInspectionLimit)) {
    inspections.push({ tool: 'code.search', input: { query }, result: await codeSearch({ query, path: '.', maxResults: 50 }) });
  }

  return inspections;
}

async function applyChanges(changes: NexoraPlanApplyVerifyChange[], approval: ApprovalGateInput) {
  const appliedChanges: unknown[] = [];
  for (const change of changes) {
    if (change.kind === 'create_file') {
      appliedChanges.push({ change, result: await codeCreateFile({ ...change, confirmedByUser: true, approvalNote: approval.approvalNote }) });
    } else if (change.kind === 'edit_file') {
      appliedChanges.push({ change, result: await codeEdit({ ...change, confirmedByUser: true, approvalNote: approval.approvalNote }) });
    } else {
      appliedChanges.push({ change, result: await codePatchFile({ ...change, confirmedByUser: true, approvalNote: approval.approvalNote }) });
    }
  }
  return appliedChanges;
}

async function runChecks(checks: NexoraPlanApplyVerifyCheck[], approval: ApprovalGateInput) {
  const results: unknown[] = [];
  for (const check of checks) {
    results.push({ check, result: await codeTest({ ...check, cwd: check.cwd || '.', confirmedByUser: true, approvalNote: approval.approvalNote }) });
  }
  return results;
}

async function recordDelegatedTaskResult(task: DelegatedTask, result: DelegatedTaskResult) {
  await appendDelegatedTaskEvent(task.id, 'task.log', 'Nexora plan/apply/verify workflow recording result.', {
    actor: 'nexora',
    details: { workflow: 'nexora.planApplyVerify' },
  });
  return completeDelegatedTask(task.id, result);
}

export async function planApplyVerify(input: NexoraPlanApplyVerifyInput): Promise<NexoraPlanApplyVerifyResult> {
  const task = input.delegatedTaskId ? await getDelegatedTask(input.delegatedTaskId) : undefined;
  if (input.delegatedTaskId && !task) throw new Error(`Delegated task not found: ${input.delegatedTaskId}`);

  const objective = taskObjective(task, input);
  const changes = input.changes || [];
  const checks = input.checks || [];
  const writeApproval = input.writeApproval || input.approval;
  const checkApproval = input.checkApproval || input.approval;
  const sessionId = input.sessionId || task?.sessionId;

  let executionRecord = createExecutionRecord({
    kind: task ? 'delegated_task' : 'runtime_action',
    whoRequested: task ? task.parentAgent : 'user',
    chosenByAgent: 'nexora',
    action: 'nexora.plan_apply_verify',
    inputPayload: {
      objective,
      delegatedTaskId: input.delegatedTaskId,
      relevantPaths: input.relevantPaths || [],
      searchQueries: input.searchQueries || [],
      changesRequested: changes.length,
      checksRequested: checks.map((check) => ({ command: check.command, cwd: check.cwd || '.' })),
      commitRequested: input.commit?.requested === true,
      workspaceRoot: workspaceRoot(),
    },
    riskLevel: changes.length || checks.length ? 'code_execution' : 'read',
    approvalStatus: changes.length || checks.length ? 'pending' : 'not_required',
    linkedIds: { ...(sessionId ? { sessionId } : {}), ...(task ? { taskIds: [task.id] } : {}) },
    status: 'running',
    startedAt: now(),
    receiptSummary: `Nexora started plan/apply/verify for: ${objective}`,
  });
  await writeExecutionRecord(executionRecord);

  try {
    const inspections = await inspectWorkspace(input);
    const needsWriteApproval = changes.length > 0 && !approvalConfirmed(writeApproval);
    const needsCheckApproval = checks.length > 0 && !approvalConfirmed(checkApproval);
    const plan = [
      planStep(1, 'inspect', 'Inspect repo-local context with read-only tools.', 'code.* read tools', false, 'completed', {
        relevantPaths: input.relevantPaths || [],
        searchQueries: input.searchQueries || [],
      }),
      planStep(2, 'apply', 'Apply approved repo-local file changes through code tools.', 'code.create_file/code.edit/code.patch_file', true, needsWriteApproval ? 'pending_approval' : changes.length ? 'ready' : 'skipped', { changes }),
      planStep(3, 'verify', 'Run approved repo-local checks.', 'code.test', true, needsCheckApproval ? 'pending_approval' : checks.length ? 'ready' : 'skipped', { checks }),
      planStep(4, 'summarize', 'Produce a git diff summary.', 'code.diff', false, 'ready'),
      planStep(5, 'record', 'Record task result and receipt.', task ? 'delegation.complete_task' : 'executions.write_record', false, 'ready'),
      planStep(6, 'commit', 'Optional git commit remains separate and approval-gated by explicit code.commit approval.', 'code.commit', true, input.commit?.requested ? 'pending_approval' : 'skipped', { message: input.commit?.message }),
    ];

    if (needsWriteApproval || needsCheckApproval) {
      const diffSummary = summarizeDiff(await codeDiff({ path: '' }));
      const output: NexoraPlanApplyVerifyResult = {
        ok: false,
        status: 'approval_required',
        objective,
        ...(task ? { delegatedTaskId: task.id } : {}),
        plan,
        inspections,
        appliedChanges: [],
        checks: [],
        diffSummary,
        receipt: {
          summary: 'Nexora produced a plan and is waiting for explicit approval before write or execute operations.',
          issuedAt: now(),
          executionRecordId: executionRecord.id,
          ...(task?.receipt?.id ? { delegatedTaskReceiptId: task.receipt.id } : {}),
        },
        commit: {
          requested: input.commit?.requested === true,
          status: input.commit?.requested ? 'approval_required' : 'not_requested',
          ...(input.commit?.message ? { message: input.commit.message } : {}),
        },
      };
      executionRecord = completeExecutionRecord(executionRecord, {
        status: 'blocked',
        approvalStatus: 'pending',
        executionResult: output,
        receiptSummary: output.receipt.summary,
      });
      await writeExecutionRecord(executionRecord);
      if (task) {
        await appendDelegatedTaskEvent(task.id, 'task.approval_requested', output.receipt.summary, {
          actor: 'nexora',
          details: { workflow: 'nexora.planApplyVerify', plan },
        });
      }
      return output;
    }

    const appliedChanges = await applyChanges(changes, writeApproval || {});
    const checkResults = await runChecks(checks, checkApproval || {});
    const diffSummary = summarizeDiff(await codeDiff({ path: '' }));
    const failedChecks = checkResults.filter((entry) => {
      const result = (entry as { result?: { ok?: boolean } }).result;
      return result?.ok === false;
    });
    const ok = failedChecks.length === 0;

    const commitRequested = input.commit?.requested === true;
    const commitApprovalRequest = commitRequested ? buildCommitApprovalRequest(input, diffSummary, checkResults, failedChecks) : undefined;
    const failedChecksOverrideApproved = input.commit?.allowFailedChecksOverride === true && approvalConfirmed(input.commit.failedChecksApproval);
    const commitApprovalConfirmed = approvalConfirmed(input.commit?.approval);
    const commitBlockedByFailedChecks = commitRequested && failedChecks.length > 0 && !failedChecksOverrideApproved;
    let commitResult: unknown;
    let commitStatus: NexoraPlanApplyVerifyResult['commit']['status'] = commitRequested ? 'approval_required' : 'not_requested';

    if (commitRequested && commitApprovalConfirmed && !commitBlockedByFailedChecks) {
      commitResult = await codeCommit({
        message: input.commit?.message || `Nexora task: ${objective}`,
        paths: diffSummary.changedFiles.length ? diffSummary.changedFiles : ['.'],
        confirmedByUser: true,
        approvalNote: input.commit?.approval?.approvalNote,
      });
      commitStatus = 'committed';
    } else if (commitBlockedByFailedChecks) {
      commitStatus = 'blocked_failed_checks';
    }

    const taskResult: DelegatedTaskResult = {
      ok,
      summary: ok
        ? `Nexora applied ${appliedChanges.length} repo-local change(s) and ran ${checkResults.length} check(s). Uncommitted changes may remain until code.commit is explicitly approved.`
        : `Nexora applied changes, but ${failedChecks.length} check(s) failed. Commit is blocked unless a high-risk failed-check override is explicitly approved.`,
      data: {
        workflow: 'nexora.planApplyVerify',
        objective,
        appliedChanges,
        checks: checkResults,
        diffSummary,
        commit: { requested: commitRequested, status: commitStatus, approvalRequest: commitApprovalRequest, result: commitResult },
      },
    };
    const updatedTask = task ? await recordDelegatedTaskResult(task, taskResult) : undefined;

    const output: NexoraPlanApplyVerifyResult = {
      ok,
      status: ok ? 'completed' : 'failed',
      objective,
      ...(task ? { delegatedTaskId: task.id } : {}),
      plan: plan.map((step) => (step.status === 'ready' ? { ...step, status: 'completed' as const } : step)),
      inspections,
      appliedChanges,
      checks: checkResults,
      diffSummary,
      receipt: {
        summary: taskResult.summary,
        issuedAt: now(),
        executionRecordId: executionRecord.id,
        ...(updatedTask?.receipt?.id ? { delegatedTaskReceiptId: updatedTask.receipt.id } : {}),
      },
      commit: {
        requested: commitRequested,
        status: commitStatus,
        ...(input.commit?.message ? { message: input.commit.message } : {}),
        ...(commitApprovalRequest ? { approvalRequest: commitApprovalRequest } : {}),
        ...(commitResult !== undefined ? { result: commitResult } : {}),
      },
    };

    executionRecord = completeExecutionRecord(executionRecord, {
      status: ok ? 'completed' : 'failed',
      approvalStatus: changes.length || checks.length ? 'approved' : 'not_required',
      executionResult: output,
      receiptSummary: output.receipt.summary,
    });
    await writeExecutionRecord(executionRecord);
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    executionRecord = completeExecutionRecord(executionRecord, {
      status: 'failed',
      approvalStatus: executionRecord.approvalStatus,
      executionResult: { ok: false, message },
      errors: [message],
      receiptSummary: `Nexora plan/apply/verify failed: ${message}`,
    });
    await writeExecutionRecord(executionRecord);
    if (task) await completeDelegatedTask(task.id, { ok: false, summary: `Nexora plan/apply/verify failed: ${message}`, error: error instanceof Error ? { message, stack: error.stack } : { message } });
    throw error;
  }
}
