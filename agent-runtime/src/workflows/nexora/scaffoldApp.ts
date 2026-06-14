import path from 'node:path';
import {
  codeCreateFile,
  codeMkdir,
  codeRunCommand,
  codeTest,
  codeWriteJson,
  type ApprovalGateInput,
} from '../../tools/codeTools.js';

export type NexoraScaffoldFile =
  | { path: string; content: string; kind?: 'source' | 'config' | 'readme' | 'package' | 'usage' }
  | { path: string; json: unknown; kind?: 'config' | 'package'; space?: number };

export interface NexoraScaffoldCommand {
  command: string;
  cwd?: string;
  kind?: 'install' | 'build' | 'test' | 'other';
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface NexoraScaffoldAppInput {
  appName: string;
  appDir: string;
  directories?: string[];
  files?: NexoraScaffoldFile[];
  readme?: string;
  usageNotes?: string;
  commands?: NexoraScaffoldCommand[];
  approval?: ApprovalGateInput;
  commandApproval?: ApprovalGateInput;
  allowNetworkPackageInstall?: boolean;
}

export interface NexoraScaffoldManifestEntry {
  path: string;
  type: 'directory' | 'file' | 'command';
  action: 'created' | 'skipped' | 'blocked' | 'failed' | 'completed';
  kind?: string;
  result?: unknown;
}

export interface NexoraScaffoldAppResult {
  ok: boolean;
  status: 'approval_required' | 'completed' | 'failed';
  appName: string;
  appDir: string;
  manifest: NexoraScaffoldManifestEntry[];
  commands: unknown[];
  rules: string[];
  message: string;
}

function approvalConfirmed(input?: ApprovalGateInput) {
  return input?.confirmedByUser === true;
}

function normalizeRelativePath(value: string) {
  return value.split(/[\\/]+/).filter(Boolean).join('/');
}

function joinWorkspacePath(base: string, child = '') {
  const cleanBase = normalizeRelativePath(base);
  const cleanChild = normalizeRelativePath(child);
  return cleanChild ? `${cleanBase}/${cleanChild}` : cleanBase;
}

function assertSafeRelativePath(relativePath: string, label: string) {
  if (!relativePath?.trim()) throw new Error(`${label} is required.`);
  if (path.isAbsolute(relativePath)) throw new Error(`${label} must be workspace-relative; absolute paths are not allowed.`);
  if (relativePath.split(/[\\/]/).includes('..')) throw new Error(`${label} cannot contain parent traversal.`);
}

function assertNotProductionEnvFile(relativePath: string) {
  const basename = path.basename(relativePath);
  if (basename === '.env' || (/^\.env\./.test(basename) && basename !== '.env.example')) {
    throw new Error(`Refusing to scaffold or modify production env file: ${relativePath}`);
  }
}

function packageInstallRisk(command: string) {
  const normalized = command.replace(/\s+/g, ' ').trim().toLowerCase();
  const install = /\b(npm|pnpm|yarn|bun)\s+(install|add|i)\b/.test(normalized);
  const global = /\b(-g|--global)\b/.test(normalized) || /\bnpm\s+install\s+.*\s-g\b/.test(normalized);
  return { install, global };
}

function isTestCommand(command: NexoraScaffoldCommand) {
  if (command.kind === 'test') return true;
  return /\b(test|typecheck|lint|build)\b/i.test(command.command);
}

export async function scaffoldApp(input: NexoraScaffoldAppInput): Promise<NexoraScaffoldAppResult> {
  assertSafeRelativePath(input.appDir, 'appDir');
  assertNotProductionEnvFile(input.appDir);

  const appDir = normalizeRelativePath(input.appDir);
  const approval = input.approval || {};
  const commandApproval = input.commandApproval || {};
  const commands = input.commands || [];
  const manifest: NexoraScaffoldManifestEntry[] = [];
  const commandResults: unknown[] = [];
  const rules = [
    'No global installs.',
    'No network package installs unless allowNetworkPackageInstall is true and command approval is confirmed.',
    'No writes outside runtimeConfig.codeWorkspaceRoot.',
    'No modification of production env files.',
    'Always return this manifest of created/changed files.',
  ];

  const needsWriteApproval = !approvalConfirmed(approval);
  const needsCommandApproval = commands.length > 0 && !approvalConfirmed(commandApproval);
  if (needsWriteApproval || needsCommandApproval) {
    return {
      ok: false,
      status: 'approval_required',
      appName: input.appName,
      appDir,
      manifest,
      commands: [],
      rules,
      message: needsWriteApproval
        ? 'Scaffolding writes require explicit approval before creating directories or files.'
        : 'Optional install/build/test commands require explicit approval before execution.',
    };
  }

  try {
    const directories = [...new Set(['.', ...(input.directories || [])])];
    for (const directory of directories) {
      const targetPath = joinWorkspacePath(appDir, directory === '.' ? '' : directory);
      assertSafeRelativePath(targetPath, 'directory path');
      assertNotProductionEnvFile(targetPath);
      const result = await codeMkdir({ path: targetPath, confirmedByUser: true, approvalNote: approval.approvalNote });
      manifest.push({ path: targetPath, type: 'directory', action: (result as { ok?: boolean }).ok ? 'created' : 'failed', result });
    }

    const files = [...(input.files || [])];
    if (input.readme) files.push({ path: 'README.md', content: input.readme, kind: 'readme' });
    if (input.usageNotes) files.push({ path: 'USAGE.md', content: input.usageNotes, kind: 'usage' });

    for (const file of files) {
      const targetPath = joinWorkspacePath(appDir, file.path);
      assertSafeRelativePath(targetPath, 'file path');
      assertNotProductionEnvFile(targetPath);
      const parentPath = path.posix.dirname(targetPath);
      if (parentPath && parentPath !== '.' && parentPath !== appDir) {
        const parentResult = await codeMkdir({ path: parentPath, confirmedByUser: true, approvalNote: approval.approvalNote });
        manifest.push({ path: parentPath, type: 'directory', action: (parentResult as { ok?: boolean }).ok ? 'created' : 'failed', result: parentResult });
      }
      const result = 'json' in file
        ? await codeWriteJson({ path: targetPath, data: file.json, space: file.space, confirmedByUser: true, approvalNote: approval.approvalNote })
        : await codeCreateFile({ path: targetPath, content: file.content, confirmedByUser: true, approvalNote: approval.approvalNote });
      manifest.push({ path: targetPath, type: 'file', action: (result as { ok?: boolean }).ok ? 'created' : 'failed', kind: file.kind, result });
    }

    for (const command of commands) {
      const risk = packageInstallRisk(command.command);
      const cwd = joinWorkspacePath(appDir, command.cwd || '.');
      assertSafeRelativePath(cwd, 'command cwd');
      if (risk.global) throw new Error(`Global installs are not allowed: ${command.command}`);
      if (risk.install && input.allowNetworkPackageInstall !== true) {
        manifest.push({ path: cwd, type: 'command', action: 'blocked', kind: command.kind, result: { command: command.command, reason: 'network_package_install_not_approved' } });
        continue;
      }
      const runner = isTestCommand(command) ? codeTest : codeRunCommand;
      const result = await runner({
        command: command.command,
        cwd,
        timeoutMs: command.timeoutMs,
        maxOutputBytes: command.maxOutputBytes,
        confirmedByUser: true,
        approvalNote: commandApproval.approvalNote,
      } as never);
      commandResults.push(result);
      manifest.push({ path: cwd, type: 'command', action: (result as { ok?: boolean }).ok ? 'completed' : 'failed', kind: command.kind, result: { command: command.command, ok: (result as { ok?: boolean }).ok } });
    }

    const failed = manifest.some((entry) => entry.action === 'failed');
    return {
      ok: !failed,
      status: failed ? 'failed' : 'completed',
      appName: input.appName,
      appDir,
      manifest,
      commands: commandResults,
      rules,
      message: failed ? 'App scaffold completed with one or more failed operations.' : 'App scaffold completed and manifest was produced.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 'failed', appName: input.appName, appDir, manifest, commands: commandResults, rules, message };
  }
}
