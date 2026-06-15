import type { DelegatedTask, DelegatedTaskResult } from '../../tasks/types.js';

export interface NexoraCompletionCheck {
  command: string;
  status: 'passed' | 'failed' | 'skipped' | 'unknown';
  summary?: string;
}

export interface NexoraSkippedCheck {
  command: string;
  reason: string;
}

export interface NexoraTaskCompletion {
  filesChanged: string[];
  diffSummary: string;
  checksRun: NexoraCompletionCheck[];
  checksSkipped: NexoraSkippedCheck[];
  remainingRisks: string[];
  rollbackNotes: string;
  receiptId: string;
  taskId?: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function checkArray(value: unknown): NexoraCompletionCheck[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const command = typeof entry.command === 'string' ? entry.command : undefined;
    if (!command) return [];
    const status = entry.status === 'passed' || entry.status === 'failed' || entry.status === 'skipped' || entry.status === 'unknown' ? entry.status : 'unknown';
    return [{ command, status, ...(typeof entry.summary === 'string' ? { summary: entry.summary } : {}) }];
  });
}

function skippedCheckArray(value: unknown): NexoraSkippedCheck[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const command = typeof entry.command === 'string' ? entry.command : undefined;
    const reason = typeof entry.reason === 'string' ? entry.reason : undefined;
    return command && reason ? [{ command, reason }] : [];
  });
}

function completionFromResult(result?: DelegatedTaskResult) {
  const data = isRecord(result?.data) ? result.data : undefined;
  const completion = isRecord(data?.completion) ? data.completion : undefined;
  return completion;
}

function summarizeDiffObject(diffSummary: unknown) {
  if (!isRecord(diffSummary)) return undefined;
  const changedFiles = stringArray(diffSummary.changedFiles);
  const addedLines = typeof diffSummary.addedLines === 'number' ? diffSummary.addedLines : 0;
  const removedLines = typeof diffSummary.removedLines === 'number' ? diffSummary.removedLines : 0;
  if (!changedFiles.length && !addedLines && !removedLines) return undefined;
  return `${changedFiles.length} file(s) changed, +${addedLines}/-${removedLines} line(s).`;
}

function inferFilesChanged(result?: DelegatedTaskResult) {
  const data = isRecord(result?.data) ? result.data : undefined;
  const diffSummary = isRecord(data?.diffSummary) ? data.diffSummary : undefined;
  const files = stringArray(diffSummary?.changedFiles);
  if (files.length) return files;

  const appliedChanges = Array.isArray(data?.appliedChanges) ? data.appliedChanges : [];
  return appliedChanges.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.change)) return [];
    return typeof entry.change.path === 'string' ? [entry.change.path] : [];
  });
}

function inferChecksRun(result?: DelegatedTaskResult): NexoraCompletionCheck[] {
  const data = isRecord(result?.data) ? result.data : undefined;
  const checks = Array.isArray(data?.checks) ? data.checks : [];
  return checks.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.check)) return [];
    const command = typeof entry.check.command === 'string' ? entry.check.command : undefined;
    if (!command) return [];
    const checkResult = isRecord(entry.result) ? entry.result : {};
    const status = checkResult.ok === true ? 'passed' : checkResult.ok === false ? 'failed' : 'unknown';
    const summary = typeof checkResult.summary === 'string' ? checkResult.summary : undefined;
    return [{ command, status, ...(summary ? { summary } : {}) }];
  });
}

export function buildNexoraCompletion(task: DelegatedTask, result: DelegatedTaskResult): NexoraTaskCompletion {
  const supplied = completionFromResult(result);
  const data = isRecord(result.data) ? result.data : undefined;
  const receiptId = task.receipt?.id || (isRecord(data?.receipt) && typeof data.receipt.id === 'string' ? data.receipt.id : 'pending-receipt');
  const filesChanged = stringArray(supplied?.filesChanged);
  const checksRun = checkArray(supplied?.checksRun);
  const checksSkipped = skippedCheckArray(supplied?.checksSkipped);
  const inferredFiles = inferFilesChanged(result);
  const inferredChecks = inferChecksRun(result);
  const diffSummary = typeof supplied?.diffSummary === 'string' && supplied.diffSummary.trim()
    ? supplied.diffSummary
    : summarizeDiffObject(data?.diffSummary) || (inferredFiles.length ? `${inferredFiles.length} file(s) changed.` : 'No repo diff was reported.');

  return {
    filesChanged: filesChanged.length ? filesChanged : inferredFiles,
    diffSummary,
    checksRun: checksRun.length ? checksRun : inferredChecks,
    checksSkipped,
    remainingRisks: stringArray(supplied?.remainingRisks),
    rollbackNotes: typeof supplied?.rollbackNotes === 'string' && supplied.rollbackNotes.trim() ? supplied.rollbackNotes : 'Revert the task changes or restore affected files from version control.',
    receiptId,
    taskId: task.id,
  };
}

export function attachNexoraCompletion(task: DelegatedTask, result: DelegatedTaskResult): DelegatedTaskResult {
  const data = isRecord(result.data) ? { ...result.data } : {};
  return {
    ...result,
    data: {
      ...data,
      completion: buildNexoraCompletion(task, result),
    },
  };
}
