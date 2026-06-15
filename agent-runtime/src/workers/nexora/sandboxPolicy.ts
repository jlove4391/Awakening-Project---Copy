import path from 'node:path';
import { runtimeConfig } from '../../config.js';
import type { NexoraCommandPolicyDecision, NexoraExecutionRequest } from './types.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 200_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_OUTPUT_BYTES = 2_000_000;

const allowedExecutables = new Set(['node', 'npm', 'pnpm', 'yarn', 'bun', 'tsx', 'tsc', 'vitest', 'jest', 'eslint', 'prettier', 'git']);
const deniedExecutables = new Set(['rm', 'rmdir', 'sudo', 'su', 'curl', 'wget', 'ssh', 'scp', 'rsync', 'docker', 'kubectl', 'chmod', 'chown', 'mkfs', 'mount', 'umount', 'dd']);
const deniedShellSyntax = /(?:[;&|<>`]|\$\(|\n|\r)/;
const deniedGitSubcommands = new Set(['push', 'clean', 'reset', 'restore', 'checkout', 'switch', 'branch', 'merge', 'rebase', 'commit', 'tag']);
const deniedPackageSubcommands = new Set(['publish', 'adduser', 'login', 'logout', 'owner', 'token', 'access', 'team']);

export function nexoraWorkspaceRoot() {
  return path.resolve(runtimeConfig.codeWorkspaceRoot);
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(command))) tokens.push((match[1] ?? match[2] ?? match[3]).replace(/\\(["'\\])/g, '$1'));
  return tokens;
}

function isInsideWorkspace(candidate: string, root: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function evaluateNexoraCommandPolicy(request: NexoraExecutionRequest): NexoraCommandPolicyDecision {
  const workspaceRoot = nexoraWorkspaceRoot();
  const command = request.command.trim();
  if (!command) return { ok: false, reason: 'empty_command' };
  if (deniedShellSyntax.test(command)) return { ok: false, reason: 'shell_control_syntax_denied' };

  const tokens = tokenize(command);
  if (!tokens.length) return { ok: false, reason: 'command_parse_failed' };
  const [executable, ...args] = tokens;
  if (deniedExecutables.has(executable)) return { ok: false, reason: `executable_denied:${executable}` };
  if (!allowedExecutables.has(executable)) return { ok: false, reason: `executable_not_allowlisted:${executable}` };

  if (executable === 'git' && args[0] && deniedGitSubcommands.has(args[0])) return { ok: false, reason: `git_subcommand_denied:${args[0]}` };
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(executable) && args[0] && deniedPackageSubcommands.has(args[0])) return { ok: false, reason: `package_subcommand_denied:${args[0]}` };

  const cwd = path.resolve(workspaceRoot, request.workingDirectory || '.');
  if (!isInsideWorkspace(cwd, workspaceRoot)) return { ok: false, reason: 'working_directory_outside_workspace' };

  const timeoutMs = Math.min(Math.max(request.timeoutMs || runtimeConfig.codeCommandTimeoutMs || DEFAULT_TIMEOUT_MS, 1_000), MAX_TIMEOUT_MS);
  const maxOutputBytes = Math.min(Math.max(request.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES, 1_024), MAX_OUTPUT_BYTES);
  return { ok: true, normalizedCommand: [executable, ...args].join(' '), executable, args, cwd, timeoutMs, maxOutputBytes };
}
