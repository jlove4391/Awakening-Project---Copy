import type { RegisteredToolDefinition, ToolRiskLevel } from '../../tools/registry.js';

export type NexoraCapabilityId =
  | 'read_repo'
  | 'analyze_repo'
  | 'write_files'
  | 'delete_files'
  | 'run_commands'
  | 'commit'
  | 'create_app'
  | 'manage_provider_resources'
  | 'inspect_databanks'
  | 'mutate_databanks';

export type NexoraCapabilityApprovalRequirement = 'none' | 'explicit_step_approval' | 'explicit_human_approval';

export interface NexoraCapabilityDefinition {
  id: NexoraCapabilityId;
  label: string;
  allowedTools: RegisteredToolDefinition['name'][];
  riskLevel: ToolRiskLevel;
  approvalRequirement: NexoraCapabilityApprovalRequirement;
  defaultEnabled: boolean;
  environmentFlag?: string;
  requiredReceiptFields: string[];
}

export interface NexoraCapabilityDecision {
  allowed: boolean;
  capability?: NexoraCapabilityDefinition;
  reason?: 'tool_not_allowed' | 'capability_disabled' | 'approval_required';
  message?: string;
}

function envFlagEnabled(flag: string | undefined, defaultEnabled: boolean) {
  if (!flag) return defaultEnabled;
  const value = process.env[flag];
  if (value === undefined || value === '') return defaultEnabled;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(value.trim().toLowerCase());
}

export const nexoraCapabilities: Record<NexoraCapabilityId, NexoraCapabilityDefinition> = {
  read_repo: {
    id: 'read_repo',
    label: 'read repo',
    allowedTools: ['code.read', 'code.search', 'code.tree', 'code.read_json', 'code.diff', 'code.git_status', 'code.git_diff', 'code.git_log', 'vscode.open', 'vscode.status'],
    riskLevel: 'read',
    approvalRequirement: 'none',
    defaultEnabled: true,
    requiredReceiptFields: ['capabilityId', 'toolName', 'workspaceRoot', 'resourcePath', 'readScope', 'resultSummary'],
  },
  analyze_repo: {
    id: 'analyze_repo',
    label: 'analyze repo',
    allowedTools: ['code.project_summary', 'code.package_scripts', 'code.dependency_summary', 'code.find_entrypoints', 'code.find_configs', 'memory.list', 'memory.retrieve', 'memory.summarize'],
    riskLevel: 'read',
    approvalRequirement: 'none',
    defaultEnabled: true,
    requiredReceiptFields: ['capabilityId', 'toolName', 'analysisScope', 'inputSummary', 'resultSummary'],
  },
  write_files: {
    id: 'write_files',
    label: 'write files',
    allowedTools: ['code.edit', 'code.create_file', 'code.patch_file', 'code.move_path', 'code.copy_path', 'code.mkdir', 'code.write_json', 'code.git_restore_file', 'code.git_create_branch'],
    riskLevel: 'write',
    approvalRequirement: 'explicit_step_approval',
    defaultEnabled: false,
    environmentFlag: 'NEXORA_ENABLE_WRITE_FILES',
    requiredReceiptFields: ['capabilityId', 'toolName', 'changedFiles', 'diffSummary', 'approvalNote', 'resultSummary'],
  },
  delete_files: {
    id: 'delete_files',
    label: 'delete files',
    allowedTools: ['code.delete_file', 'code.delete_path'],
    riskLevel: 'code_execution',
    approvalRequirement: 'explicit_human_approval',
    defaultEnabled: false,
    environmentFlag: 'NEXORA_ENABLE_DELETE_FILES',
    requiredReceiptFields: ['capabilityId', 'toolName', 'deletedPaths', 'approvalNote', 'resultSummary'],
  },
  run_commands: {
    id: 'run_commands',
    label: 'run commands',
    allowedTools: ['code.run_command', 'code.test', 'delegation.execute_code'],
    riskLevel: 'code_execution',
    approvalRequirement: 'explicit_step_approval',
    defaultEnabled: false,
    environmentFlag: 'NEXORA_ENABLE_RUN_COMMANDS',
    requiredReceiptFields: ['capabilityId', 'toolName', 'command', 'cwd', 'exitCode', 'approvalNote', 'outputSummary'],
  },
  commit: {
    id: 'commit',
    label: 'commit',
    allowedTools: ['code.commit'],
    riskLevel: 'purchase_or_commit',
    approvalRequirement: 'explicit_human_approval',
    defaultEnabled: false,
    environmentFlag: 'NEXORA_ENABLE_COMMIT',
    requiredReceiptFields: ['capabilityId', 'toolName', 'commitSha', 'message', 'changedFiles', 'approvalNote'],
  },
  create_app: {
    id: 'create_app',
    label: 'create app',
    allowedTools: ['nexora.scaffold_app'],
    riskLevel: 'code_execution',
    approvalRequirement: 'explicit_human_approval',
    defaultEnabled: false,
    environmentFlag: 'NEXORA_ENABLE_CREATE_APP',
    requiredReceiptFields: ['capabilityId', 'toolName', 'appDir', 'manifest', 'commandsRun', 'approvalNote'],
  },
  manage_provider_resources: {
    id: 'manage_provider_resources',
    label: 'manage provider resources',
    allowedTools: ['digitalocean.status', 'digitalocean.list_apps', 'digitalocean.list_databases', 'digitalocean.plan_app', 'digitalocean.plan_database', 'digitalocean.create_app', 'digitalocean.create_database', 'digitalocean.create_infrastructure', 'digitalocean.update_infrastructure', 'digitalocean.delete_infrastructure', 'drive.create_text_file'],
    riskLevel: 'purchase_or_commit',
    approvalRequirement: 'explicit_human_approval',
    defaultEnabled: false,
    environmentFlag: 'NEXORA_ENABLE_PROVIDER_RESOURCES',
    requiredReceiptFields: ['capabilityId', 'toolName', 'provider', 'resourceType', 'resourceId', 'approvalNote', 'resultSummary'],
  },
  inspect_databanks: {
    id: 'inspect_databanks',
    label: 'inspect databanks',
    allowedTools: ['databank.status'],
    riskLevel: 'read',
    approvalRequirement: 'none',
    defaultEnabled: true,
    requiredReceiptFields: ['capabilityId', 'toolName', 'databankId', 'readScope', 'resultSummary'],
  },
  mutate_databanks: {
    id: 'mutate_databanks',
    label: 'mutate databanks',
    allowedTools: [],
    riskLevel: 'write',
    approvalRequirement: 'explicit_human_approval',
    defaultEnabled: false,
    environmentFlag: 'NEXORA_ENABLE_MUTATE_DATABANKS',
    requiredReceiptFields: ['capabilityId', 'toolName', 'databankId', 'migrationId', 'backupId', 'approvalNote', 'resultSummary'],
  },
};

export const nexoraCapabilityMatrix = Object.values(nexoraCapabilities);

export function findNexoraCapabilityForTool(toolName: string) {
  return nexoraCapabilityMatrix.find((capability) => capability.allowedTools.includes(toolName as RegisteredToolDefinition['name']));
}

export function evaluateNexoraCapabilityForStep(toolName: string, approvalStatus: string | undefined): NexoraCapabilityDecision {
  const capability = findNexoraCapabilityForTool(toolName);
  if (!capability) {
    return { allowed: false, reason: 'tool_not_allowed', message: `Tool ${toolName} is not allowed by the Nexora capability matrix.` };
  }

  if (!envFlagEnabled(capability.environmentFlag, capability.defaultEnabled)) {
    return {
      allowed: false,
      capability,
      reason: 'capability_disabled',
      message: `Nexora capability ${capability.id} is disabled${capability.environmentFlag ? `; set ${capability.environmentFlag}=true to enable it` : ''}.`,
    };
  }

  if (capability.approvalRequirement !== 'none' && approvalStatus !== 'approved') {
    return { allowed: false, capability, reason: 'approval_required', message: `Nexora capability ${capability.id} requires approval before running ${toolName}.` };
  }

  return { allowed: true, capability };
}
