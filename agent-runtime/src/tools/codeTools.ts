import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { runtimeConfig } from '../config.js';

const execFileAsync = promisify(execFile);
const ignoredDirectoryNames = new Set(['.git', 'node_modules', 'dist', 'build', '.runtime-data', 'coverage']);

export interface ApprovalGateInput {
  confirmedByUser?: boolean;
  approvalNote?: string;
}

export function approvalRequired(toolName: string) {
  return {
    ok: false,
    status: 'approval_required',
    tool: toolName,
    message: `${toolName} requires explicit user approval before execution. Re-run with confirmedByUser: true and an approvalNote.`,
  };
}

export function workspaceRoot() {
  return path.resolve(runtimeConfig.codeWorkspaceRoot);
}

async function existingRootRealPath() {
  return fs.realpath(workspaceRoot());
}

function assertRelativePath(relativePath: string) {
  if (!relativePath?.trim()) throw new Error('path is required');
  if (path.isAbsolute(relativePath)) throw new Error('Absolute paths are not allowed; use a workspace-relative path.');
  if (relativePath.split(/[\\/]/).includes('..')) throw new Error('Parent path traversal is not allowed.');
}

function assertInsideRoot(root: string, target: string) {
  const relative = path.relative(root, target);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  throw new Error(`Path escapes Nexora workspace root: ${workspaceRoot()}`);
}

export async function resolveExistingWorkspacePath(relativePath = '.') {
  assertRelativePath(relativePath);
  const root = await existingRootRealPath();
  const target = path.resolve(root, relativePath);
  assertInsideRoot(root, target);
  const realTarget = await fs.realpath(target);
  assertInsideRoot(root, realTarget);
  return { root, target: realTarget, relativePath: path.relative(root, realTarget) || '.' };
}

export async function resolveWritableWorkspacePath(relativePath: string) {
  assertRelativePath(relativePath);
  const root = await existingRootRealPath();
  const target = path.resolve(root, relativePath);
  assertInsideRoot(root, target);
  const parent = await fs.realpath(path.dirname(target));
  assertInsideRoot(root, parent);
  return { root, target, relativePath: path.relative(root, target) };
}

function sha256(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

async function walkFiles(root: string, current: string, files: string[], limit: number) {
  if (files.length >= limit) return;
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= limit) return;
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    const next = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry.name)) await walkFiles(root, next, files, limit);
    } else if (entry.isFile()) {
      files.push(path.relative(root, next));
    }
  }
}

function isApprovalConfirmed(input: ApprovalGateInput) {
  return input.confirmedByUser === true;
}

export async function codeRead(input: { path: string; maxBytes?: number }) {
  const { root, target, relativePath } = await resolveExistingWorkspacePath(input.path);
  const stats = await fs.stat(target);
  if (!stats.isFile()) throw new Error('code.read can only read files.');
  const maxBytes = Math.min(Math.max(input.maxBytes || 20_000, 1), 200_000);
  const handle = await fs.open(target, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(maxBytes, stats.size));
    await handle.read(buffer, 0, buffer.length, 0);
    const content = buffer.toString('utf8');
    return { ok: true, workspaceRoot: root, path: relativePath, bytesRead: buffer.length, truncated: stats.size > buffer.length, sha256: sha256(content), content };
  } finally {
    await handle.close();
  }
}

export async function codeSearch(input: { query: string; path?: string; isRegex?: boolean; maxResults?: number }) {
  if (!input.query?.trim()) throw new Error('query is required');
  const { root, target } = await resolveExistingWorkspacePath(input.path || '.');
  const maxResults = Math.min(Math.max(input.maxResults || 50, 1), 200);
  const candidates: string[] = [];
  const stats = await fs.stat(target);
  if (stats.isFile()) candidates.push(path.relative(root, target));
  else await walkFiles(root, target, candidates, 5_000);

  const matcher = input.isRegex ? new RegExp(input.query, 'i') : null;
  const matches: Array<{ path: string; line: number; preview: string }> = [];
  for (const file of candidates) {
    if (matches.length >= maxResults) break;
    const absolute = path.join(root, file);
    const stat = await fs.stat(absolute);
    if (stat.size > 1_000_000) continue;
    const text = await fs.readFile(absolute, 'utf8').catch(() => '');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (matches.length >= maxResults) return;
      const found = matcher ? matcher.test(line) : line.toLowerCase().includes(input.query.toLowerCase());
      if (found) matches.push({ path: file, line: index + 1, preview: line.slice(0, 240) });
    });
  }
  return { ok: true, workspaceRoot: root, searchedPath: path.relative(root, target) || '.', matches, truncated: matches.length >= maxResults };
}

export async function codeEdit(input: { path: string; content: string; mode?: 'overwrite' | 'append'; expectedSha256?: string } & ApprovalGateInput) {
  if (!isApprovalConfirmed(input)) return approvalRequired('code.edit');
  const { root, target, relativePath } = await resolveWritableWorkspacePath(input.path);
  const mode = input.mode || 'overwrite';
  let previousContent = '';
  let previousSha256: string | undefined;
  try {
    previousContent = await fs.readFile(target, 'utf8');
    previousSha256 = sha256(previousContent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (input.expectedSha256 && previousSha256 !== input.expectedSha256) {
    return { ok: false, status: 'sha256_mismatch', path: relativePath, expectedSha256: input.expectedSha256, actualSha256: previousSha256 };
  }
  const nextContent = mode === 'append' ? `${previousContent}${input.content}` : input.content;
  await fs.writeFile(target, nextContent, 'utf8');
  return { ok: true, workspaceRoot: root, path: relativePath, mode, sha256: sha256(nextContent), bytesWritten: Buffer.byteLength(nextContent) };
}

export async function codeDiff(input: { path?: string }) {
  const root = await existingRootRealPath();
  const args = ['-C', root, 'diff', '--'];
  if (input.path) {
    const resolved = await resolveExistingWorkspacePath(input.path).catch(async () => resolveWritableWorkspacePath(input.path!));
    args.push(resolved.relativePath);
  }
  const { stdout } = await execFileAsync('git', args, { cwd: root, maxBuffer: 1_000_000 });
  return { ok: true, workspaceRoot: root, diff: stdout, truncated: stdout.length >= 1_000_000 };
}

export async function codeTest(input: { command: string; cwd?: string; timeoutMs?: number } & ApprovalGateInput) {
  if (!isApprovalConfirmed(input)) return approvalRequired('code.test');
  if (!input.command?.trim()) throw new Error('command is required');
  const { root, target, relativePath } = await resolveExistingWorkspacePath(input.cwd || '.');
  const timeout = Math.min(Math.max(input.timeoutMs || runtimeConfig.codeCommandTimeoutMs, 1_000), 600_000);
  const { stdout, stderr } = await execFileAsync('/bin/sh', ['-lc', input.command], { cwd: target, timeout, maxBuffer: 1_000_000 });
  return { ok: true, workspaceRoot: root, cwd: relativePath, command: input.command, stdout, stderr };
}

export async function codeCommit(input: { message: string; paths?: string[] } & ApprovalGateInput) {
  if (!isApprovalConfirmed(input)) return approvalRequired('code.commit');
  if (!input.message?.trim()) throw new Error('message is required');
  const root = await existingRootRealPath();
  const paths = input.paths?.length ? input.paths : ['.'];
  const relativePaths = [] as string[];
  for (const item of paths) {
    const resolved = item === '.' ? { relativePath: '.' } : await resolveWritableWorkspacePath(item);
    relativePaths.push(resolved.relativePath);
  }
  await execFileAsync('git', ['-C', root, 'add', '--', ...relativePaths], { cwd: root });
  const { stdout, stderr } = await execFileAsync('git', ['-C', root, 'commit', '-m', input.message], { cwd: root, maxBuffer: 1_000_000 });
  return { ok: true, workspaceRoot: root, paths: relativePaths, stdout, stderr };
}

export async function vscodeOpen(input: { path: string; line?: number; column?: number }) {
  const { root, target, relativePath } = await resolveExistingWorkspacePath(input.path);
  const line = Math.max(input.line || 1, 1);
  const column = Math.max(input.column || 1, 1);
  return { ok: true, workspaceRoot: root, path: relativePath, uri: `vscode://file/${target}:${line}:${column}` };
}

export async function vscodeStatus() {
  const root = await existingRootRealPath();
  const [status, branch] = await Promise.all([
    execFileAsync('git', ['-C', root, 'status', '--short'], { cwd: root }).then((result) => result.stdout).catch((error) => String(error.message)),
    execFileAsync('git', ['-C', root, 'branch', '--show-current'], { cwd: root }).then((result) => result.stdout.trim()).catch(() => null),
  ]);
  return { ok: true, workspaceRoot: root, branch, gitStatus: status };
}
