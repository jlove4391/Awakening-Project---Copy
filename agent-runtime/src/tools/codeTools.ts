import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { runtimeConfig } from '../config.js';
import {
  assertSecretReadAllowed,
  assertSecretWriteAllowed,
  redactForLogs,
  type HighRiskSecretApproval,
} from '../workflows/nexora/secretsPolicy.js';
import { decidePolicy, policyRequiresApproval } from '../governance/policyDecision.js';

const execFileAsync = promisify(execFile);
const ignoredDirectoryNames = new Set(['.git', 'node_modules', 'dist', 'build', '.runtime-data', 'coverage']);
const trashDirectoryName = '.runtime-data/trash';
const maxDeleteFileBytes = 10 * 1024 * 1024;
const maxDeletePathBytes = 50 * 1024 * 1024;
const maxDeletePathEntries = 100;
const defaultCommandTimeoutMs = 120_000;
const maxCommandTimeoutMs = 600_000;
const defaultCommandOutputBytes = 1_000_000;
const maxCommandOutputBytes = 2_000_000;
const protectedDeleteBasenames = new Set([
  '.git',
  '.env',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'Gemfile.lock',
  'Cargo.lock',
  'Pipfile.lock',
  'poetry.lock',
  'composer.lock',
  'go.sum',
]);

interface RunCommandInput extends ApprovalGateInput {
  command: string;
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  allowHighRiskCommand?: boolean;
  highRiskApprovalNote?: string;
}

interface DeleteInput extends ApprovalGateInput {
  path: string;
  expectedSha256?: string;
  permanent?: boolean;
  permanentApprovalNote?: string;
  allowHighRiskDelete?: boolean;
  highRiskApprovalNote?: string;
}

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
  await fs.mkdir(workspaceRoot(), { recursive: true });
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

function sha256(text: string | Buffer) {
  return createHash('sha256').update(text).digest('hex');
}

async function fileSha256(target: string) {
  return sha256(await fs.readFile(target));
}

async function isGitTracked(root: string, relativePath: string) {
  const result = await execFileAsync('git', ['-C', root, 'ls-files', '--error-unmatch', '--', relativePath], { cwd: root })
    .then(() => true)
    .catch(() => false);
  return result;
}

async function pathSize(target: string): Promise<number> {
  const stats = await fs.lstat(target);
  if (stats.isSymbolicLink()) throw new Error('Symlink paths are not allowed for write operations.');
  if (stats.isFile()) return stats.size;
  if (!stats.isDirectory()) return 0;
  const entries = await fs.readdir(target);
  const sizes = await Promise.all(entries.map((entry) => pathSize(path.join(target, entry))));
  return sizes.reduce((total, size) => total + size, 0);
}

async function assertNoSymlinkAncestors(root: string, target: string) {
  const relative = path.relative(root, target);
  if (!relative || relative === '.') return;
  let current = root;
  for (const part of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, part);
    try {
      const stats = await fs.lstat(current);
      if (stats.isSymbolicLink()) throw new Error('Symlink path components are not allowed for writable paths.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return;
    }
  }
}

async function resolveWritableWorkspacePathWithExistingAncestor(relativePath: string) {
  assertRelativePath(relativePath);
  const root = await existingRootRealPath();
  const target = path.resolve(root, relativePath);
  assertInsideRoot(root, target);
  await assertNoSymlinkAncestors(root, target);

  let ancestor = path.dirname(target);
  while (ancestor !== root) {
    try {
      const realAncestor = await fs.realpath(ancestor);
      assertInsideRoot(root, realAncestor);
      return { root, target, relativePath: path.relative(root, target) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      ancestor = path.dirname(ancestor);
    }
  }
  return { root, target, relativePath: path.relative(root, target) };
}

function ensureConfirmed(input: ApprovalGateInput, toolName: string) {
  return isApprovalConfirmed(input) ? null : approvalRequired(toolName);
}

function ensurePolicyDeleteExecution(input: DeleteInput, toolName: string, action: string) {
  if (isApprovalConfirmed(input)) return null;
  const decision = decidePolicy({
    toolName,
    action,
    category: 'code',
    riskLevel: 'write',
    approvalScope: input.permanent === true ? 'repo.delete' : 'repo.write',
    input: input as unknown as Record<string, unknown>,
  });
  return policyRequiresApproval(decision) ? approvalRequired(toolName) : null;
}

function ensureOrdinaryWorkspaceExecution(input: ApprovalGateInput, toolName: string, action: string, riskLevel: 'write' | 'code_execution' = 'write') {
  if (isApprovalConfirmed(input)) return null;
  const decision = decidePolicy({
    toolName,
    action,
    category: 'code',
    riskLevel,
    approvalScope: riskLevel === 'code_execution' ? 'repo.command' : 'repo.write',
    input: input as unknown as Record<string, unknown>,
  });
  return policyRequiresApproval(decision) ? approvalRequired(toolName) : null;
}




function hasMeaningfulNote(note?: string) {
  return Boolean(note?.trim());
}

function isProtectedDeletePath(relativePath: string) {
  const parts = relativePath.split(path.sep).filter(Boolean);
  return parts.some((part) => part === '.git')
    || parts.some((part) => part === '.env' || /^\.env\..+/.test(part))
    || protectedDeleteBasenames.has(path.basename(relativePath));
}

function assertDeleteAllowed(input: DeleteInput, relativePath: string) {
  if (relativePath === '.' || relativePath === '') throw new Error('Deleting the workspace root is not allowed.');
  if (relativePath === '.runtime-data' || relativePath.startsWith(`${trashDirectoryName}${path.sep}`) || relativePath === trashDirectoryName) {
    throw new Error('Deleting runtime-managed data or trash paths is not allowed.');
  }
  if (isProtectedDeletePath(relativePath) && (!input.allowHighRiskDelete || !hasMeaningfulNote(input.highRiskApprovalNote))) {
    throw new Error('Refusing to delete .git, .env files, lockfiles, or package manifests without allowHighRiskDelete and a highRiskApprovalNote.');
  }
  if (input.permanent === true && !hasMeaningfulNote(input.permanentApprovalNote)) {
    throw new Error('Permanent deletion requires permanentApprovalNote separate from the normal approvalNote.');
  }
}

async function pathContainsProtectedDeleteTarget(root: string, current: string): Promise<boolean> {
  const relativePath = path.relative(root, current) || '.';
  if (isProtectedDeletePath(relativePath)) return true;
  const stats = await fs.lstat(current);
  if (!stats.isDirectory() || stats.isSymbolicLink()) return false;
  const children = await fs.readdir(current);
  for (const child of children) {
    if (await pathContainsProtectedDeleteTarget(root, path.join(current, child))) return true;
  }
  return false;
}

async function deletePathMetrics(target: string, maxEntries: number): Promise<{ bytes: number; entries: number }> {
  const stats = await fs.lstat(target);
  if (stats.isSymbolicLink()) throw new Error('Symlink paths are not allowed for delete operations.');
  if (stats.isFile()) return { bytes: stats.size, entries: 1 };
  if (!stats.isDirectory()) return { bytes: 0, entries: 1 };
  let bytes = 0;
  let entries = 1;
  const walk = async (current: string) => {
    const children = await fs.readdir(current, { withFileTypes: true });
    for (const child of children) {
      entries += 1;
      if (entries > maxEntries) throw new Error(`Delete scope exceeds maximum entry count of ${maxEntries}.`);
      const next = path.join(current, child.name);
      const childStats = await fs.lstat(next);
      if (childStats.isSymbolicLink()) throw new Error('Symlink paths are not allowed for delete operations.');
      if (childStats.isDirectory()) await walk(next);
      else if (childStats.isFile()) bytes += childStats.size;
    }
  };
  await walk(target);
  return { bytes, entries };
}

async function moveToTrash(root: string, target: string, relativePath: string) {
  const trashRoot = path.join(root, trashDirectoryName);
  await fs.mkdir(trashRoot, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = relativePath.split(path.sep).filter(Boolean).join('__') || 'deleted-path';
  const destination = path.join(trashRoot, `${timestamp}-${safeName}`);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rename(target, destination);
  return path.relative(root, destination);
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


const maxAnalysisFiles = 2_000;
const maxAnalysisOutputItems = 500;
const maxJsonReadBytes = 500_000;
const entrypointFileNames = new Set(['index.js','index.ts','index.tsx','main.js','main.ts','main.tsx','server.js','server.ts','app.js','app.ts','cli.js','cli.ts']);
const configFilePatterns = [
  /(^|[/\\])package\.json$/,
  /(^|[/\\])tsconfig[^/\\]*\.json$/,
  /(^|[/\\])vite\.config\.[cm]?[jt]s$/,
  /(^|[/\\])next\.config\.[cm]?[jt]s$/,
  /(^|[/\\])webpack\.config\.[cm]?[jt]s$/,
  /(^|[/\\])rollup\.config\.[cm]?[jt]s$/,
  /(^|[/\\])eslint\.config\.[cm]?[jt]s$/,
  /(^|[/\\])\.eslintrc(\.[cm]?[jt]s|\.json|\.ya?ml)?$/,
  /(^|[/\\])prettier\.config\.[cm]?[jt]s$/,
  /(^|[/\\])\.prettierrc(\.json|\.ya?ml)?$/,
  /(^|[/\\])jest\.config\.[cm]?[jt]s$/,
  /(^|[/\\])vitest\.config\.[cm]?[jt]s$/,
  /(^|[/\\])tailwind\.config\.[cm]?[jt]s$/,
  /(^|[/\\])postcss\.config\.[cm]?[jt]s$/,
  /(^|[/\\])docker-compose\.ya?ml$/,
  /(^|[/\\])Dockerfile$/,
  /(^|[/\\])\.env\.example$/,
];

type AnalysisInput = { path?: string; maxFiles?: number; maxItems?: number; maxDepth?: number };
type WorkspaceFile = { path: string; size: number; extension: string; depth: number };

function boundedInt(value: number | undefined, fallback: number, min: number, max: number) {
  return Math.min(Math.max(value ?? fallback, min), max);
}

function isIgnoredDirectoryName(name: string) {
  return ignoredDirectoryNames.has(name);
}

async function collectWorkspaceFiles(input: AnalysisInput = {}) {
  const { root, target, relativePath } = await resolveExistingWorkspacePath(input.path || '.');
  const maxFiles = boundedInt(input.maxFiles, maxAnalysisFiles, 1, maxAnalysisFiles);
  const files: WorkspaceFile[] = [];
  let directoriesVisited = 0;
  let truncated = false;
  const stats = await fs.stat(target);

  const addFile = async (absolute: string) => {
    if (files.length >= maxFiles) {
      truncated = true;
      return;
    }
    const stat = await fs.stat(absolute);
    const rel = path.relative(root, absolute);
    files.push({ path: rel, size: stat.size, extension: path.extname(rel).toLowerCase(), depth: rel.split(path.sep).length - 1 });
  };

  const walk = async (current: string) => {
    if (files.length >= maxFiles) {
      truncated = true;
      return;
    }
    directoriesVisited += 1;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }
      if (entry.name.startsWith('.') && entry.name !== '.env.example' && entry.name !== '.github') continue;
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!isIgnoredDirectoryName(entry.name)) await walk(next);
      } else if (entry.isFile()) {
        await addFile(next);
      }
    }
  };

  if (stats.isFile()) await addFile(target);
  else await walk(target);
  return { root, searchedPath: relativePath, files, directoriesVisited, truncated, maxFiles };
}

async function readJsonFile(root: string, relativePath: string) {
  const target = path.join(root, relativePath);
  const stat = await fs.stat(target);
  if (stat.size > maxJsonReadBytes) return null;
  return JSON.parse(await fs.readFile(target, 'utf8')) as any;
}

export async function codeTree(input: AnalysisInput = {}) {
  const maxDepth = boundedInt(input.maxDepth, 4, 1, 12);
  const maxItems = boundedInt(input.maxItems, 200, 1, maxAnalysisOutputItems);
  const collected = await collectWorkspaceFiles(input);
  const directories = new Set<string>();
  for (const file of collected.files) {
    const parts = file.path.split(path.sep);
    for (let i = 1; i < parts.length; i += 1) directories.add(parts.slice(0, i).join('/'));
  }
  const items = [
    ...Array.from(directories).map((directory) => ({ type: 'directory', path: directory, depth: directory.split('/').length - 1 })),
    ...collected.files.map((file) => ({ type: 'file', path: file.path.split(path.sep).join('/'), size: file.size, depth: file.depth })),
  ].filter((item) => item.depth <= maxDepth).sort((a, b) => a.path.localeCompare(b.path)).slice(0, maxItems);
  return { ok: true, workspaceRoot: collected.root, path: collected.searchedPath, ignoredDirectories: Array.from(ignoredDirectoryNames), maxDepth, items, counts: { filesSeen: collected.files.length, directoriesVisited: collected.directoriesVisited, returned: items.length }, truncated: collected.truncated || items.length >= maxItems };
}

export async function codeProjectSummary(input: AnalysisInput = {}) {
  const collected = await collectWorkspaceFiles(input);
  const maxItems = boundedInt(input.maxItems, 100, 1, maxAnalysisOutputItems);
  const byExtension = new Map<string, { files: number; bytes: number }>();
  const topLevel = new Map<string, number>();
  for (const file of collected.files) {
    const ext = file.extension || '[none]';
    const current = byExtension.get(ext) || { files: 0, bytes: 0 };
    current.files += 1; current.bytes += file.size; byExtension.set(ext, current);
    topLevel.set(file.path.split(path.sep)[0] || '.', (topLevel.get(file.path.split(path.sep)[0] || '.') || 0) + 1);
  }
  const packages = collected.files.filter((file) => path.basename(file.path) === 'package.json').slice(0, maxItems).map((file) => file.path);
  return { ok: true, workspaceRoot: collected.root, path: collected.searchedPath, ignoredDirectories: Array.from(ignoredDirectoryNames), totals: { filesSeen: collected.files.length, bytes: collected.files.reduce((sum, file) => sum + file.size, 0), directoriesVisited: collected.directoriesVisited }, packages, topLevel: Object.fromEntries([...topLevel].sort()), byExtension: Object.fromEntries([...byExtension].sort()), truncated: collected.truncated };
}

export async function codePackageScripts(input: AnalysisInput = {}) {
  const collected = await collectWorkspaceFiles(input);
  const maxItems = boundedInt(input.maxItems, 50, 1, maxAnalysisOutputItems);
  const packageFiles = collected.files.filter((file) => path.basename(file.path) === 'package.json').slice(0, maxItems);
  const packages = [] as Array<{ path: string; name?: string; scripts: Record<string, string> }>;
  for (const file of packageFiles) {
    const pkg = await readJsonFile(collected.root, file.path).catch(() => null);
    packages.push({ path: file.path, name: pkg?.name, scripts: pkg?.scripts || {} });
  }
  return { ok: true, workspaceRoot: collected.root, packages, truncated: collected.truncated || packageFiles.length >= maxItems };
}

export async function codeDependencySummary(input: AnalysisInput = {}) {
  const collected = await collectWorkspaceFiles(input);
  const maxItems = boundedInt(input.maxItems, 50, 1, maxAnalysisOutputItems);
  const packageFiles = collected.files.filter((file) => path.basename(file.path) === 'package.json').slice(0, maxItems);
  const packages = [] as Array<{ path: string; name?: string; dependencies: Record<string, string>; devDependencies: Record<string, string>; peerDependencies: Record<string, string> }>;
  for (const file of packageFiles) {
    const pkg = await readJsonFile(collected.root, file.path).catch(() => null);
    packages.push({ path: file.path, name: pkg?.name, dependencies: pkg?.dependencies || {}, devDependencies: pkg?.devDependencies || {}, peerDependencies: pkg?.peerDependencies || {} });
  }
  return { ok: true, workspaceRoot: collected.root, packages, truncated: collected.truncated || packageFiles.length >= maxItems };
}

export async function codeFindEntrypoints(input: AnalysisInput = {}) {
  const collected = await collectWorkspaceFiles(input);
  const maxItems = boundedInt(input.maxItems, 100, 1, maxAnalysisOutputItems);
  const packageEntrypoints = [] as Array<{ packagePath: string; name?: string; fields: Record<string, unknown> }>;
  for (const file of collected.files.filter((file) => path.basename(file.path) === 'package.json')) {
    const pkg = await readJsonFile(collected.root, file.path).catch(() => null);
    if (!pkg) continue;
    const fields: Record<string, unknown> = {};
    for (const key of ['main', 'module', 'types', 'exports', 'bin']) if (pkg[key]) fields[key] = pkg[key];
    if (Object.keys(fields).length) packageEntrypoints.push({ packagePath: file.path, name: pkg.name, fields });
  }
  const conventionalFiles = collected.files.filter((file) => entrypointFileNames.has(path.basename(file.path))).map((file) => file.path).slice(0, maxItems);
  return { ok: true, workspaceRoot: collected.root, packageEntrypoints: packageEntrypoints.slice(0, maxItems), conventionalFiles, truncated: collected.truncated || packageEntrypoints.length > maxItems || conventionalFiles.length >= maxItems };
}

export async function codeFindConfigs(input: AnalysisInput = {}) {
  const collected = await collectWorkspaceFiles(input);
  const maxItems = boundedInt(input.maxItems, 200, 1, maxAnalysisOutputItems);
  const configs = collected.files.filter((file) => configFilePatterns.some((pattern) => pattern.test(file.path.split(path.sep).join('/')))).map((file) => ({ path: file.path, size: file.size })).slice(0, maxItems);
  return { ok: true, workspaceRoot: collected.root, configs, truncated: collected.truncated || configs.length >= maxItems };
}

function isApprovalConfirmed(input: ApprovalGateInput) {
  return input.confirmedByUser === true;
}

function detectDangerousCommand(command: string): string[] {
  const normalized = command.replace(/\\\s*\n/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const dangerousPatterns: Array<[RegExp, string]> = [
    [/\brm\s+[^;&|]*(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/, 'recursive_force_delete'],
    [/\brm\s+[^;&|]*(\/|~|\*)\b/, 'broad_delete_target'],
    [/\bsudo\b|\bsu\s+-?\b/, 'privilege_escalation'],
    [/\bchmod\s+(?:-[^\s]+\s+)*777\b|\bchmod\s+(?:-[^\s]+\s+)*-r\b/i, 'unsafe_permission_change'],
    [/\bchown\s+(?:-[^\s]+\s+)*-r\b/i, 'recursive_owner_change'],
    [/\bdd\s+.*\bof=\/dev\//, 'raw_device_write'],
    [/\bmkfs(?:\.[a-z0-9]+)?\b|\bformat\b.*\b\/dev\//, 'filesystem_format'],
    [/\bshutdown\b|\breboot\b|\bhalt\b|\bpoweroff\b/, 'system_power_control'],
    [/\b(?:curl|wget)\b[^|;&]*(?:\||>)[^;&]*(?:\bsh\b|\bbash\b|\bzsh\b)/, 'remote_script_execution'],
    [/\b(?:sh|bash|zsh)\b\s*<\s*\([^)]*\b(?:curl|wget)\b/, 'remote_script_execution'],
    [/\bgit\s+push\b|\bgit\s+reset\b[^;&|]*--hard\b|\bgit\s+clean\b[^;&|]*-[^\s]*f/, 'destructive_git_operation'],
    [/\bdocker\s+system\s+prune\b|\bdocker\s+volume\s+rm\b|\bdocker\s+rm\b[^;&|]*-[^\s]*f/, 'destructive_docker_operation'],
    [/\bnpm\s+publish\b|\bpnpm\s+publish\b|\byarn\s+npm\s+publish\b/, 'package_publish'],
    [/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*}\s*;\s*:/, 'fork_bomb'],
  ];
  return dangerousPatterns.filter(([pattern]) => pattern.test(normalized)).map(([, reason]) => reason);
}

function assertRunCommandAllowed(input: RunCommandInput) {
  const dangerousReasons = detectDangerousCommand(input.command);
  if (dangerousReasons.length && (!input.allowHighRiskCommand || !hasMeaningfulNote(input.highRiskApprovalNote))) {
    throw new Error(`Refusing to run known dangerous command patterns (${dangerousReasons.join(', ')}) without allowHighRiskCommand and highRiskApprovalNote.`);
  }
  return dangerousReasons;
}

function outputSlice(buffer: Uint8Array, maxBytes: number) {
  return Buffer.from(buffer.subarray(0, maxBytes)).toString('utf8');
}

async function runWorkspaceShellCommand(input: RunCommandInput, toolName: string, options: { blockDangerous: boolean }) {
  const approval = ensureOrdinaryWorkspaceExecution(input, toolName, 'run_command', 'code_execution');
  if (approval) return approval;
  if (!input.command?.trim()) throw new Error('command is required');
  if (!input.cwd?.trim()) throw new Error('cwd is required and must be workspace-relative');
  const dangerousReasons = options.blockDangerous ? assertRunCommandAllowed(input) : detectDangerousCommand(input.command);
  const { root, target, relativePath } = await resolveExistingWorkspacePath(input.cwd);
  const timeoutMs = Math.min(Math.max(input.timeoutMs || runtimeConfig.codeCommandTimeoutMs || defaultCommandTimeoutMs, 1_000), maxCommandTimeoutMs);
  const maxOutputBytes = Math.min(Math.max(input.maxOutputBytes || defaultCommandOutputBytes, 1_024), maxCommandOutputBytes);
  const startedAt = new Date();
  const startedNs = process.hrtime.bigint();
  let timedOut = false;
  let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let truncated = false;
  const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>) => {
    const used = stdout.length + stderr.length;
    const remaining = maxOutputBytes - used;
    if (remaining <= 0) { truncated = true; return current; }
    if (chunk.length > remaining) { truncated = true; return Buffer.concat([current, chunk.subarray(0, remaining)]); }
    return Buffer.concat([current, chunk]);
  };
  const result = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', input.command], { cwd: target, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout = append(stdout, Buffer.from(chunk)); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, Buffer.from(chunk)); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (exitCode, signal) => { clearTimeout(timer); resolve({ exitCode, signal }); });
  });
  const completedAt = new Date();
  const durationMs = Number((process.hrtime.bigint() - startedNs) / 1_000_000n);
  return {
    ok: result.exitCode === 0 && !timedOut,
    status: timedOut ? 'timed_out' : (result.exitCode === 0 ? 'completed' : 'failed'),
    workspaceRoot: root,
    cwd: relativePath,
    command: input.command,
    stdout: redactForLogs(outputSlice(stdout, stdout.length)),
    stderr: redactForLogs(outputSlice(stderr, stderr.length)),
    exitCode: result.exitCode,
    signal: timedOut ? 'SIGTERM' : result.signal,
    timedOut,
    truncated,
    metadata: {
      toolName,
      commandSha256: sha256(input.command),
      cwd: relativePath,
      timeoutMs,
      maxOutputBytes,
      stdoutBytes: stdout.length,
      stderrBytes: stderr.length,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
      dangerousCommandReasons: dangerousReasons,
      highRiskApproved: dangerousReasons.length > 0 && input.allowHighRiskCommand === true,
      approvalNotePresent: hasMeaningfulNote(input.approvalNote),
      highRiskApprovalNotePresent: hasMeaningfulNote(input.highRiskApprovalNote),
    },
  };
}

export async function codeRead(input: { path: string; maxBytes?: number } & HighRiskSecretApproval) {
  const { root, target, relativePath } = await resolveExistingWorkspacePath(input.path);
  assertSecretReadAllowed(relativePath, input);
  const stats = await fs.stat(target);
  if (!stats.isFile()) throw new Error('code.read can only read files.');
  const maxBytes = Math.min(Math.max(input.maxBytes || 20_000, 1), 200_000);
  const handle = await fs.open(target, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(maxBytes, stats.size));
    await handle.read(buffer, 0, buffer.length, 0);
    const content = redactForLogs(buffer.toString('utf8'));
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
    assertSecretReadAllowed(file);
    const stat = await fs.stat(absolute);
    if (stat.size > 1_000_000) continue;
    const text = await fs.readFile(absolute, 'utf8').catch(() => '');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (matches.length >= maxResults) return;
      const found = matcher ? matcher.test(line) : line.toLowerCase().includes(input.query.toLowerCase());
      if (found) matches.push({ path: file, line: index + 1, preview: redactForLogs(line.slice(0, 240)) });
    });
  }
  return { ok: true, workspaceRoot: root, searchedPath: path.relative(root, target) || '.', matches, truncated: matches.length >= maxResults };
}

export async function codeEdit(input: { path: string; content: string; mode?: 'overwrite' | 'append'; expectedSha256?: string } & ApprovalGateInput) {
  const approval = ensureOrdinaryWorkspaceExecution(input, 'code.edit', 'edit');
  if (approval) return approval;
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
  assertSecretWriteAllowed(relativePath, nextContent, { isTracked: await isGitTracked(root, relativePath) });
  await fs.writeFile(target, nextContent, 'utf8');
  return { ok: true, workspaceRoot: root, path: relativePath, mode, sha256: sha256(nextContent), bytesWritten: Buffer.byteLength(nextContent) };
}


export async function codeCreateFile(input: { path: string; content: string; expectedSha256?: string } & ApprovalGateInput) {
  const approval = ensureOrdinaryWorkspaceExecution(input, 'code.create_file', 'create_file');
  if (approval) return approval;
  const { root, target, relativePath } = await resolveWritableWorkspacePath(input.path);
  const content = input.content ?? '';
  assertSecretWriteAllowed(relativePath, content, { isTracked: await isGitTracked(root, relativePath) });
  if (input.expectedSha256 && input.expectedSha256 !== sha256('')) {
    return { ok: false, status: 'sha256_mismatch', path: relativePath, expectedSha256: input.expectedSha256, actualSha256: undefined };
  }
  await fs.writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
  return { ok: true, status: 'created', workspaceRoot: root, path: relativePath, sha256: sha256(content), bytesChanged: Buffer.byteLength(content) };
}

export async function codePatchFile(input: { path: string; search: string; replace: string; expectedSha256?: string; replaceAll?: boolean } & ApprovalGateInput) {
  const approval = ensureOrdinaryWorkspaceExecution(input, 'code.patch_file', 'patch_file');
  if (approval) return approval;
  if (!input.search) throw new Error('search is required');
  const { root, target, relativePath } = await resolveExistingWorkspacePath(input.path);
  const stats = await fs.stat(target);
  if (!stats.isFile()) throw new Error('code.patch_file can only patch files.');
  const previousContent = await fs.readFile(target, 'utf8');
  const previousSha256 = sha256(previousContent);
  if (input.expectedSha256 && previousSha256 !== input.expectedSha256) {
    return { ok: false, status: 'sha256_mismatch', path: relativePath, expectedSha256: input.expectedSha256, actualSha256: previousSha256 };
  }
  const occurrences = previousContent.split(input.search).length - 1;
  if (occurrences === 0) return { ok: false, status: 'not_found', path: relativePath, sha256: previousSha256, bytesChanged: 0 };
  if (occurrences > 1 && !input.replaceAll) return { ok: false, status: 'multiple_matches', path: relativePath, occurrences, sha256: previousSha256, bytesChanged: 0 };
  const nextContent = input.replaceAll ? previousContent.split(input.search).join(input.replace) : previousContent.replace(input.search, input.replace);
  assertSecretWriteAllowed(relativePath, nextContent, { isTracked: await isGitTracked(root, relativePath) });
  await fs.writeFile(target, nextContent, 'utf8');
  return { ok: true, status: 'patched', workspaceRoot: root, path: relativePath, previousSha256, sha256: sha256(nextContent), bytesChanged: Buffer.byteLength(nextContent) - Buffer.byteLength(previousContent), occurrences: input.replaceAll ? occurrences : 1 };
}

export async function codeDeleteFile(input: DeleteInput) {
  const { root, target, relativePath } = await resolveExistingWorkspacePath(input.path);
  assertDeleteAllowed(input, relativePath);
  const approval = ensurePolicyDeleteExecution(input, 'code.delete_file', input.permanent === true ? 'permanent_delete_file' : 'delete_file');
  if (approval) return approval;
  const stats = await fs.lstat(target);
  if (stats.isSymbolicLink()) throw new Error('code.delete_file cannot delete symlinks.');
  if (!stats.isFile()) throw new Error('code.delete_file can only delete files. Use code.delete_path for explicit directory deletes.');
  if (stats.size > maxDeleteFileBytes) throw new Error(`Delete scope exceeds maximum file size of ${maxDeleteFileBytes} bytes.`);
  const previousSha256 = await fileSha256(target);
  if (input.expectedSha256 && previousSha256 !== input.expectedSha256) {
    return { ok: false, status: 'sha256_mismatch', path: relativePath, expectedSha256: input.expectedSha256, actualSha256: previousSha256 };
  }
  if (input.permanent === true) {
    await fs.unlink(target);
    return { ok: true, status: 'permanently_deleted', workspaceRoot: root, path: relativePath, previousSha256, bytesChanged: stats.size, permanent: true };
  }
  const trashedPath = await moveToTrash(root, target, relativePath);
  return { ok: true, status: 'trashed', workspaceRoot: root, path: relativePath, trashPath: trashedPath, previousSha256, bytesChanged: stats.size, permanent: false };
}

export async function codeDeletePath(input: DeleteInput) {
  const { root, target, relativePath } = await resolveExistingWorkspacePath(input.path);
  assertDeleteAllowed(input, relativePath);
  const approval = ensurePolicyDeleteExecution(input, 'code.delete_path', input.permanent === true ? 'permanent_delete_path' : 'delete_path');
  if (approval) return approval;
  const stats = await fs.lstat(target);
  if (stats.isSymbolicLink()) throw new Error('code.delete_path cannot delete symlinks.');
  if (!input.allowHighRiskDelete && stats.isDirectory() && await pathContainsProtectedDeleteTarget(root, target)) {
    throw new Error('Refusing to delete a directory containing .git, .env files, lockfiles, or package manifests without allowHighRiskDelete and a highRiskApprovalNote.');
  }
  if (input.allowHighRiskDelete && !hasMeaningfulNote(input.highRiskApprovalNote) && stats.isDirectory() && await pathContainsProtectedDeleteTarget(root, target)) {
    throw new Error('Refusing to delete a directory containing .git, .env files, lockfiles, or package manifests without a highRiskApprovalNote.');
  }
  const metrics = await deletePathMetrics(target, maxDeletePathEntries);
  if (metrics.bytes > maxDeletePathBytes) throw new Error(`Delete scope exceeds maximum size of ${maxDeletePathBytes} bytes.`);
  if (stats.isFile()) {
    return codeDeleteFile(input);
  }
  if (!stats.isDirectory()) throw new Error('code.delete_path can only delete files or directories.');
  if (input.permanent === true) {
    await fs.rm(target, { recursive: true, force: false });
    return { ok: true, status: 'permanently_deleted', workspaceRoot: root, path: relativePath, bytesChanged: metrics.bytes, entriesChanged: metrics.entries, permanent: true };
  }
  const trashedPath = await moveToTrash(root, target, relativePath);
  return { ok: true, status: 'trashed', workspaceRoot: root, path: relativePath, trashPath: trashedPath, bytesChanged: metrics.bytes, entriesChanged: metrics.entries, permanent: false };
}

export async function codeMovePath(input: { fromPath: string; toPath: string; overwrite?: boolean } & ApprovalGateInput) {
  const approval = ensureOrdinaryWorkspaceExecution(input, 'code.move_path', 'move_path');
  if (approval) return approval;
  const from = await resolveExistingWorkspacePath(input.fromPath);
  const to = await resolveWritableWorkspacePath(input.toPath);
  const sourceStats = await fs.lstat(from.target);
  if (sourceStats.isSymbolicLink()) throw new Error('Moving symlinks is not allowed.');
  const bytesChanged = await pathSize(from.target);
  let sha: string | undefined;
  if (sourceStats.isFile()) sha = await fileSha256(from.target);
  if (!input.overwrite) await fs.access(to.target).then(() => { throw new Error('Destination already exists.'); }).catch((error) => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
  await fs.rename(from.target, to.target);
  return { ok: true, status: 'moved', workspaceRoot: from.root, path: to.relativePath, fromPath: from.relativePath, toPath: to.relativePath, sha256: sha, bytesChanged };
}

export async function codeCopyPath(input: { fromPath: string; toPath: string; overwrite?: boolean } & ApprovalGateInput) {
  const approval = ensureOrdinaryWorkspaceExecution(input, 'code.copy_path', 'copy_path');
  if (approval) return approval;
  const from = await resolveExistingWorkspacePath(input.fromPath);
  const to = await resolveWritableWorkspacePath(input.toPath);
  const sourceStats = await fs.lstat(from.target);
  if (sourceStats.isSymbolicLink()) throw new Error('Copying symlinks is not allowed.');
  const bytesChanged = await pathSize(from.target);
  let sha: string | undefined;
  if (sourceStats.isFile()) sha = await fileSha256(from.target);
  if (sourceStats.isDirectory()) await fs.cp(from.target, to.target, { recursive: true, force: input.overwrite === true, errorOnExist: input.overwrite !== true, verbatimSymlinks: false });
  else await fs.copyFile(from.target, to.target, input.overwrite ? 0 : fsConstants.COPYFILE_EXCL);
  return { ok: true, status: 'copied', workspaceRoot: from.root, path: to.relativePath, fromPath: from.relativePath, toPath: to.relativePath, sha256: sha, bytesChanged };
}

export async function codeMkdir(input: { path: string } & ApprovalGateInput) {
  const approval = ensureOrdinaryWorkspaceExecution(input, 'code.mkdir', 'mkdir');
  if (approval) return approval;
  const { root, target, relativePath } = await resolveWritableWorkspacePathWithExistingAncestor(input.path);
  await fs.mkdir(target, { recursive: true });
  return { ok: true, status: 'created', workspaceRoot: root, path: relativePath, bytesChanged: 0 };
}

export async function codeWriteJson(input: { path: string; data: unknown; expectedSha256?: string; space?: number } & ApprovalGateInput) {
  const approval = ensureOrdinaryWorkspaceExecution(input, 'code.write_json', 'write_json');
  if (approval) return approval;
  const { root, target, relativePath } = await resolveWritableWorkspacePath(input.path);
  let previousSha256: string | undefined;
  try { previousSha256 = await fileSha256(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (input.expectedSha256 && previousSha256 !== input.expectedSha256) return { ok: false, status: 'sha256_mismatch', path: relativePath, expectedSha256: input.expectedSha256, actualSha256: previousSha256 };
  const content = `${JSON.stringify(input.data, null, Math.min(Math.max(input.space ?? 2, 0), 10))}\n`;
  assertSecretWriteAllowed(relativePath, content, { isTracked: await isGitTracked(root, relativePath) });
  await fs.writeFile(target, content, 'utf8');
  return { ok: true, status: previousSha256 ? 'updated' : 'created', workspaceRoot: root, path: relativePath, sha256: sha256(content), bytesChanged: Buffer.byteLength(content) };
}

export async function codeReadJson(input: { path: string; maxBytes?: number }) {
  const result = await codeRead(input);
  return { ...result, status: 'read', data: JSON.parse(result.content) };
}

export async function codeGitStatus() {
  const root = await existingRootRealPath();
  const [status, branch] = await Promise.all([
    execFileAsync('git', ['-C', root, 'status', '--short'], { cwd: root }).then((result) => result.stdout).catch((error) => String(error.message)),
    execFileAsync('git', ['-C', root, 'branch', '--show-current'], { cwd: root }).then((result) => result.stdout.trim()).catch(() => null),
  ]);
  return { ok: true, workspaceRoot: root, branch, gitStatus: status };
}

export async function codeDiff(input: { path?: string }) {
  const root = await existingRootRealPath();
  const args = ['-C', root, 'diff', '--'];
  if (input.path) {
    const resolved = await resolveExistingWorkspacePath(input.path).catch(async () => resolveWritableWorkspacePath(input.path!));
    args.push(resolved.relativePath);
  }
  const { stdout } = await execFileAsync('git', args, { cwd: root, maxBuffer: 1_000_000 });
  return { ok: true, workspaceRoot: root, diff: redactForLogs(stdout), truncated: stdout.length >= 1_000_000 };
}

export const codeGitDiff = codeDiff;

export async function codeGitLog(input: { maxCount?: number; path?: string } = {}) {
  const root = await existingRootRealPath();
  const maxCount = Math.min(Math.max(Math.trunc(input.maxCount ?? 20), 1), 100);
  const args = ['-C', root, 'log', `--max-count=${maxCount}`, '--date=iso-strict', '--pretty=format:%H%x09%h%x09%an%x09%ad%x09%s'];
  if (input.path) {
    const resolved = await resolveExistingWorkspacePath(input.path).catch(async () => resolveWritableWorkspacePath(input.path!));
    args.push('--', resolved.relativePath);
  }
  const { stdout } = await execFileAsync('git', args, { cwd: root, maxBuffer: 1_000_000 });
  const commits = stdout.split('\n').filter(Boolean).map((line) => {
    const [hash, shortHash, author, date, ...subjectParts] = line.split('\t');
    return { hash, shortHash, author, date, subject: subjectParts.join('\t') };
  });
  return { ok: true, workspaceRoot: root, commits: redactForLogs(commits), log: redactForLogs(stdout), truncated: stdout.length >= 1_000_000 };
}

export async function codeGitRestoreFile(input: { path: string } & ApprovalGateInput) {
  const approval = ensureOrdinaryWorkspaceExecution(input, 'code.git_restore_file', 'git_restore_file');
  if (approval) return approval;
  const root = await existingRootRealPath();
  const resolved = await resolveExistingWorkspacePath(input.path).catch(async () => resolveWritableWorkspacePath(input.path));
  await execFileAsync('git', ['-C', root, 'restore', '--', resolved.relativePath], { cwd: root });
  return { ok: true, workspaceRoot: root, path: resolved.relativePath, status: 'restored' };
}

export async function codeGitCreateBranch(input: { branch: string; startPoint?: string; checkout?: boolean } & ApprovalGateInput) {
  const approval = ensureOrdinaryWorkspaceExecution(input, 'code.git_create_branch', 'git_create_branch');
  if (approval) return approval;
  const root = await existingRootRealPath();
  const branch = input.branch?.trim();
  if (!branch) throw new Error('branch is required');
  const args = ['-C', root, input.checkout === false ? 'branch' : 'switch', input.checkout === false ? branch : '-c'];
  if (input.checkout !== false) args.push(branch);
  if (input.startPoint?.trim()) args.push(input.startPoint.trim());
  const { stdout, stderr } = await execFileAsync('git', args, { cwd: root, maxBuffer: 1_000_000 });
  return { ok: true, workspaceRoot: root, branch, checkedOut: input.checkout !== false, stdout, stderr };
}

export async function codeRunCommand(input: RunCommandInput) {
  return runWorkspaceShellCommand(input, 'code.run_command', { blockDangerous: true });
}

export async function codeTest(input: { command: string; cwd?: string; timeoutMs?: number; maxOutputBytes?: number } & ApprovalGateInput) {
  return runWorkspaceShellCommand({ ...input, cwd: input.cwd || '.' }, 'code.test', { blockDangerous: false });
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

export const vscodeStatus = codeGitStatus;
