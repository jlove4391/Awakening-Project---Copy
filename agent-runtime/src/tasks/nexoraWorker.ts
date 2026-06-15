import { executeRegisteredTool, getRegisteredTool, toolRegistry, type RegisteredToolDefinition } from '../tools/registry.js';
import { evaluateNexoraCapabilityForStep, findNexoraCapabilityForTool } from '../workflows/nexora/capabilities.js';
import type { RuntimeContext } from '../types.js';
import { appendExecutionPlanStep, cancelDelegatedTask, getDelegatedTask, updateDelegatedTask, updateExecutionPlanStep } from './store.js';
import type { DelegatedTask } from './types.js';
import type { DelegatedTaskHandler } from './queue.js';

type NexoraToolInputBuilder = (task: DelegatedTask) => Record<string, unknown>;

interface NexoraAllowedTool {
  name: RegisteredToolDefinition['name'];
  strategy: string;
  buildInput: NexoraToolInputBuilder;
}

const deterministicNexoraToolAllowlist: NexoraAllowedTool[] = [
  {
    name: 'vscode.status',
    strategy: 'Inspect workspace status without side effects.',
    buildInput: () => ({}),
  },
  {
    name: 'code.project_summary',
    strategy: 'Summarize workspace structure using a bounded read-only scan.',
    buildInput: () => ({ path: '.', maxFiles: 2000, maxItems: 100 }),
  },
  {
    name: 'code.package_scripts',
    strategy: 'Read package scripts from workspace manifests.',
    buildInput: () => ({ path: '.', maxFiles: 2000, maxItems: 50 }),
  },
  {
    name: 'code.dependency_summary',
    strategy: 'Read dependency metadata from workspace manifests.',
    buildInput: () => ({ path: '.', maxFiles: 2000, maxItems: 50 }),
  },
  {
    name: 'code.find_entrypoints',
    strategy: 'Find likely entrypoints with a bounded read-only scan.',
    buildInput: () => ({ path: '.', maxFiles: 2000, maxItems: 100 }),
  },
  {
    name: 'code.find_configs',
    strategy: 'Find common config files with a bounded read-only scan.',
    buildInput: () => ({ path: '.', maxFiles: 2000, maxItems: 200 }),
  },
  {
    name: 'code.tree',
    strategy: 'Return a bounded workspace tree snapshot.',
    buildInput: () => ({ path: '.', maxFiles: 2000, maxItems: 200, maxDepth: 4 }),
  },
  {
    name: 'code.diff',
    strategy: 'Read current git diff without mutating the workspace.',
    buildInput: () => ({ path: '' }),
  },
  {
    name: 'memory.list',
    strategy: 'List recent durable memories for task context.',
    buildInput: () => ({ limit: 10, scopes: [] }),
  },
  {
    name: 'memory.retrieve',
    strategy: 'Retrieve durable memories related to the objective.',
    buildInput: (task) => ({ query: task.objective, limit: 10, scopes: [] }),
  },
  {
    name: 'memory.summarize',
    strategy: 'Summarize durable memories related to the objective.',
    buildInput: (task) => ({ query: task.objective, limit: 12, scopes: [] }),
  },
];

const allowlistByName = new Map(deterministicNexoraToolAllowlist.map((tool) => [tool.name, tool]));
const categoryAliases = new Map<string, RegisteredToolDefinition['name'][]>([
  ['code', ['vscode.status', 'code.project_summary', 'code.find_configs']],
  ['workspace', ['vscode.status', 'code.project_summary']],
  ['project', ['code.project_summary']],
  ['package', ['code.package_scripts']],
  ['dependencies', ['code.dependency_summary']],
  ['entrypoints', ['code.find_entrypoints']],
  ['configs', ['code.find_configs']],
  ['diff', ['code.diff']],
  ['memory', ['memory.retrieve']],
  ['context', ['memory.retrieve']],
]);

function normalizeRequiredTool(tool: string) {
  return tool.trim().toLowerCase();
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function fieldFromStructuredText(text: string, names: string[]) {
  for (const name of names) {
    const pattern = new RegExp(`(?:^|[\\n;,.])\\s*(?:${name})\\s*[:=]\\s*([\\s\\S]*?)(?=\\n\\s*(?:filename|file name|name|content|parent folder|parent folder id|parentid|folder)\\s*[:=]|$)`, 'i');
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/^['"]|['"]$/g, '');
  }
  return '';
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const candidates = [trimmed, trimmed.match(/\{[\s\S]*\}/)?.[0]].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch (_error) {
      // Fall through to label-based parsing.
    }
  }
  return undefined;
}

function driveCreateObjectiveMatches(task: DelegatedTask) {
  const objective = task.objective.toLowerCase();
  const requiredTools = task.requiredTools.map(normalizeRequiredTool);
  return (
    requiredTools.includes('drive.create_text_file') ||
    ((objective.includes('create') || objective.includes('write')) && objective.includes('text file') && (objective.includes('google drive') || objective.includes('drive')))
  );
}

function buildDriveCreateInput(task: DelegatedTask): Record<string, unknown> | undefined {
  const sourceText = [task.objective, ...task.constraints].filter(Boolean).join('\n');
  const parsed = parseJsonObject(sourceText);
  const filename = textValue(parsed?.filename ?? parsed?.name ?? parsed?.fileName) || fieldFromStructuredText(sourceText, ['filename', 'file name', 'name']);
  const content = textValue(parsed?.content ?? parsed?.text) || fieldFromStructuredText(sourceText, ['content', 'text']);
  const parentId = textValue(parsed?.parentId ?? parsed?.parentFolderId ?? parsed?.parentFolder ?? parsed?.folderId) || fieldFromStructuredText(sourceText, ['parent folder id', 'parent folder', 'parentid', 'folder']);
  if (!filename || !content) return undefined;
  return { name: filename, content, ...(parentId ? { parentId } : {}) };
}

async function ensureDriveCreatePlan(task: DelegatedTask) {
  if (!driveCreateObjectiveMatches(task)) return task;
  if (task.executionPlan?.some((step) => normalizeRequiredTool(step.targetTool) === 'drive.create_text_file')) return task;

  const input = buildDriveCreateInput(task);
  if (!input) return undefined;
  return appendExecutionPlanStep(task.id, {
    targetTool: 'drive.create_text_file',
    arguments: input,
    approvalStatus: 'pending',
    approval: { required: true, status: 'pending', reason: 'drive_write_approval_required' },
  });
}

interface ProviderConfigurationBlock {
  blockedReason: 'provider_configuration_required';
  provider: string;
  providerName: string;
  missingConfigHint: string;
  nextManualAction: string;
}

function providerConfigurationBlockFor(toolName: string, message: string): ProviderConfigurationBlock | undefined {
  if (normalizeRequiredTool(toolName) !== 'drive.create_text_file') return undefined;

  if (/google oauth is not configured|google_client_id|google_client_secret|google_redirect_uri/i.test(message)) {
    return {
      blockedReason: 'provider_configuration_required',
      provider: 'google-drive',
      providerName: 'Google Drive',
      missingConfigHint: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI for Google OAuth.',
      nextManualAction: 'Configure Google OAuth credentials, restart the runtime, then open /api/auth/google/start to connect Google Drive.',
    };
  }

  if (/token store key|master_key/i.test(message)) {
    return {
      blockedReason: 'provider_configuration_required',
      provider: 'google-drive',
      providerName: 'Google Drive',
      missingConfigHint: 'Set GOOGLE_TOKEN_STORE_KEY or MASTER_KEY to at least 32 characters so stored Google OAuth tokens can be read.',
      nextManualAction: 'Provide the token-store encryption key used for Google OAuth tokens, restart the runtime, and retry the delegated task.',
    };
  }

  if (/google account is not connected|authorize the runtime|access token|refresh token|invalid_grant|insufficient authentication scopes|insufficient.*scope/i.test(message)) {
    return {
      blockedReason: 'provider_configuration_required',
      provider: 'google-drive',
      providerName: 'Google Drive',
      missingConfigHint: 'Google Drive OAuth tokens are absent, expired without refresh, or missing the required Drive scope.',
      nextManualAction: 'Open /api/auth/google/start, complete Google OAuth with the Drive file scope, then resume this delegated task.',
    };
  }

  return undefined;
}

function isApprovedNexoraTool(toolName: string) {
  const definition = getRegisteredTool(toolName);
  const capability = definition ? findNexoraCapabilityForTool(definition.name) : undefined;
  const decision = definition ? evaluateNexoraCapabilityForStep(definition.name, 'not_required') : undefined;
  return Boolean(
    definition &&
      capability &&
      decision?.allowed &&
      allowlistByName.has(definition.name) &&
      definition.riskLevel === 'read' &&
      !definition.humanApprovalRequired,
  );
}

function chooseExecutionStrategy(task: DelegatedTask) {
  const selected = new Map<string, NexoraAllowedTool>();

  for (const requiredTool of task.requiredTools.map(normalizeRequiredTool)) {
    const directDefinition = getRegisteredTool(requiredTool);
    if (directDefinition && isApprovedNexoraTool(directDefinition.name)) {
      selected.set(directDefinition.name, allowlistByName.get(directDefinition.name)!);
      continue;
    }

    for (const toolName of categoryAliases.get(requiredTool) || []) {
      if (isApprovedNexoraTool(toolName)) selected.set(toolName, allowlistByName.get(toolName)!);
    }
  }

  return [...selected.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function isStepHighRisk(toolName: string) {
  const definition = getRegisteredTool(toolName);
  const capability = definition ? findNexoraCapabilityForTool(definition.name) : undefined;
  return !definition || !capability || definition.riskLevel !== 'read' || definition.humanApprovalRequired || capability.approvalRequirement !== 'none';
}

function stepInput(step: NonNullable<DelegatedTask['executionPlan']>[number]): Record<string, unknown> {
  const value = step.arguments ?? step.argumentTemplate ?? {};
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : { value };
}

async function blockForStepApproval(task: DelegatedTask, step: NonNullable<DelegatedTask['executionPlan']>[number]) {
  const definition = getRegisteredTool(step.targetTool);
  const reason = 'step_approval_required';
  const pendingToolAction = {
    stepId: step.id,
    toolName: step.targetTool,
    riskLevel: definition?.riskLevel,
    action: definition?.audit.action,
    arguments: step.arguments,
    argumentTemplate: step.argumentTemplate,
    approvalStatus: 'pending' as const,
    reason,
  };
  await updateExecutionPlanStep(task.id, step.id, {
    status: 'blocked',
    approvalStatus: 'pending',
    approval: { required: true, status: 'pending', reason },
  });
  await updateDelegatedTask(task.id, {
    status: 'blocked',
    blockedReason: reason,
    pendingToolAction,
    log: `Nexora blocked before ${step.targetTool}; explicit approval is required for this step.`,
    event: {
      type: 'task.blocked',
      actor: 'nexora',
      summary: 'Task is blocked until the pending tool action is approved.',
      details: { blockedReason: reason, pendingToolAction },
    },
  });
}


async function blockForCapabilityPolicy(
  task: DelegatedTask,
  step: NonNullable<DelegatedTask['executionPlan']>[number],
  decision: ReturnType<typeof evaluateNexoraCapabilityForStep>,
) {
  const blockedReason = decision.reason === 'approval_required' ? 'step_approval_required' : 'policy_block';
  await updateExecutionPlanStep(task.id, step.id, {
    status: 'blocked',
    ...(decision.reason === 'approval_required' ? { approvalStatus: 'pending' as const, approval: { required: true, status: 'pending' as const, reason: blockedReason } } : {}),
    resultSummary: decision.message,
  });
  await updateDelegatedTask(task.id, {
    status: 'blocked',
    blockedReason,
    pendingToolAction: {
      stepId: step.id,
      toolName: step.targetTool,
      riskLevel: decision.capability?.riskLevel,
      action: decision.capability?.id,
      arguments: step.arguments,
      argumentTemplate: step.argumentTemplate,
      approvalStatus: decision.reason === 'approval_required' ? ('pending' as const) : step.approvalStatus,
      reason: blockedReason,
    },
    log: decision.message || `Nexora blocked before ${step.targetTool} by the capability matrix.`,
    event: {
      type: 'task.blocked',
      actor: 'nexora',
      summary: decision.message || 'Task is blocked by the Nexora capability matrix.',
      details: { blockedReason, capability: decision.capability, toolName: step.targetTool, reason: decision.reason },
    },
  });
}

function createTaskRuntimeContext(task: DelegatedTask): RuntimeContext {
  return {
    sessionId: task.sessionId,
    agent: 'nexora',
    channel: 'text',
    session: undefined as unknown as RuntimeContext['session'],
    record: {
      id: task.sessionId,
      provider: 'local-memory',
      memories: [],
      tasks: [],
      updatedAt: new Date().toISOString(),
    },
  };
}


function withTimeout<T>(promise: Promise<T>, timeoutMs: number | undefined, message: string): Promise<T> {
  if (!timeoutMs) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs).unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function isTaskCancelled(taskId: string) {
  return (await getDelegatedTask(taskId))?.status === 'cancelled';
}

export const nexoraToolExecutionWorker: DelegatedTaskHandler = async (task) => {
  if (task.assignedAgent !== 'nexora') return false;

  const taskWithGeneratedPlan = await ensureDriveCreatePlan(task);
  if (taskWithGeneratedPlan === undefined) return false;
  task = taskWithGeneratedPlan;

  if (task.executionPlan?.length) {
    const context = createTaskRuntimeContext(task);
    const executedSteps: Array<{ stepId: string; tool: string; input: Record<string, unknown>; result: unknown }> = [];

    const taskDeadline = task.timeoutMs ? Date.now() + task.timeoutMs : undefined;
    for (const step of [...task.executionPlan].sort((left, right) => left.order - right.order)) {
      if (await isTaskCancelled(task.id)) return true;
      if (taskDeadline && Date.now() > taskDeadline) {
        await cancelDelegatedTask(task.id, 'system', `Task timed out after ${task.timeoutMs}ms.`);
        return true;
      }
      if (['completed', 'skipped', 'cancelled'].includes(step.status)) continue;
      const highRisk = isStepHighRisk(step.targetTool);
      const capabilityDecision = evaluateNexoraCapabilityForStep(step.targetTool, step.approvalStatus);
      if (!capabilityDecision.allowed) {
        if (capabilityDecision.reason === 'approval_required') await blockForStepApproval(task, step);
        else await blockForCapabilityPolicy(task, step, capabilityDecision);
        return true;
      }

      const input = stepInput(step);
      if (highRisk) {
        input.confirmedByUser = true;
        context.approvedExecutionId = step.id;
      }
      await updateExecutionPlanStep(task.id, step.id, { status: 'running' });
      try {
        const remainingTaskMs = taskDeadline ? Math.max(1, taskDeadline - Date.now()) : undefined;
        const stepTimeoutMs = step.timeoutMs ? Math.min(step.timeoutMs, remainingTaskMs || step.timeoutMs) : remainingTaskMs;
        const result = await withTimeout(
          executeRegisteredTool(step.targetTool, input, context),
          stepTimeoutMs,
          step.timeoutMs ? `Execution plan step ${step.id} timed out after ${step.timeoutMs}ms.` : `Task timed out after ${task.timeoutMs}ms.`,
        );
        if (await isTaskCancelled(task.id)) return true;
        executedSteps.push({ stepId: step.id, tool: step.targetTool, input, result });
        await updateExecutionPlanStep(task.id, step.id, { status: 'completed', resultSummary: `Executed ${step.targetTool}.` });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const providerConfigurationBlock = providerConfigurationBlockFor(step.targetTool, message);
        if (providerConfigurationBlock) {
          const { blockedReason, provider, providerName, missingConfigHint, nextManualAction } = providerConfigurationBlock;
          await updateExecutionPlanStep(task.id, step.id, {
            status: 'blocked',
            resultSummary: `${providerName} provider configuration required: ${missingConfigHint}`,
          });
          await updateDelegatedTask(task.id, {
            status: 'blocked',
            blockedReason,
            result: {
              ok: false,
              summary: `${providerName} provider configuration required before Nexora can continue.`,
              data: {
                handledBy: 'nexora.execution-plan-worker',
                status: blockedReason,
                provider,
                providerName,
                missingConfigHint,
                nextManualAction,
                tool: step.targetTool,
                executedSteps,
              },
              error: { message },
            },
            log: `Nexora blocked because ${providerName} provider configuration is incomplete. Missing/config hint: ${missingConfigHint} Next manual action: ${nextManualAction}`,
            event: {
              type: 'task.blocked',
              actor: 'nexora',
              summary: `Task is blocked until ${providerName} provider configuration is completed.`,
              details: { blockedReason, provider, providerName, missingConfigHint, nextManualAction, message },
            },
          });
          return true;
        }
        if (message.includes('timed out')) {
          await updateExecutionPlanStep(task.id, step.id, { status: 'cancelled', resultSummary: message });
          await cancelDelegatedTask(task.id, 'system', message);
          return true;
        }
        throw error;
      }
    }

    await updateDelegatedTask(task.id, {
      status: 'completed',
      result: {
        ok: true,
        summary: `Nexora executed ${executedSteps.length} execution-plan step${executedSteps.length === 1 ? '' : 's'}.`,
        data: { handledBy: 'nexora.execution-plan-worker', objective: task.objective, executedSteps },
      },
      event: {
        type: 'task.completed',
        actor: 'nexora',
        summary: 'Nexora execution-plan worker recorded terminal completion.',
        details: { worker: 'nexora.execution-plan-worker', stepCount: executedSteps.length },
      },
    });
    return true;
  }

  const strategy = chooseExecutionStrategy(task);
  if (!strategy.length) return false;

  await updateDelegatedTask(task.id, {
    log: `Nexora selected deterministic allowlisted strategy: ${strategy.map((tool) => tool.name).join(', ')}.`,
    event: {
      type: 'task.log',
      actor: 'nexora',
      summary: 'Nexora selected deterministic allowlisted tool strategy.',
      details: {
        objective: task.objective,
        constraints: task.constraints,
        requiredTools: task.requiredTools,
        approvedTools: strategy.map((tool) => ({ name: tool.name, strategy: tool.strategy })),
      },
    },
  });

  const context = createTaskRuntimeContext(task);
  const toolResults: Array<{ tool: string; input: Record<string, unknown>; result: unknown }> = [];

  try {
    for (const selectedTool of strategy) {
      if (!isApprovedNexoraTool(selectedTool.name)) throw new Error(`Tool ${selectedTool.name} is not approved for deterministic Nexora execution.`);

      const input = selectedTool.buildInput(task);
      await updateDelegatedTask(task.id, {
        log: `Nexora executing approved tool ${selectedTool.name}: ${selectedTool.strategy}`,
        event: {
          type: 'task.log',
          actor: 'nexora',
          summary: `Nexora started approved tool ${selectedTool.name}.`,
          details: { tool: selectedTool.name, input },
        },
      });

      const result = await executeRegisteredTool(selectedTool.name, input, context);
      toolResults.push({ tool: selectedTool.name, input, result });

      await updateDelegatedTask(task.id, {
        log: `Nexora completed approved tool ${selectedTool.name}.`,
        event: {
          type: 'task.log',
          actor: 'nexora',
          summary: `Nexora completed approved tool ${selectedTool.name}.`,
          details: { tool: selectedTool.name },
        },
      });
    }

    await updateDelegatedTask(task.id, {
      status: 'completed',
      result: {
        ok: true,
        summary: `Nexora executed ${toolResults.length} approved tool${toolResults.length === 1 ? '' : 's'} for the delegated objective.`,
        data: {
          handledBy: 'nexora.tool-execution-worker',
          objective: task.objective,
          constraints: task.constraints,
          requiredTools: task.requiredTools,
          executedTools: toolResults,
        },
      },
      event: {
        type: 'task.completed',
        actor: 'nexora',
        summary: 'Nexora tool-execution worker recorded terminal completion.',
        details: { worker: 'nexora.tool-execution-worker', toolCount: toolResults.length },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateDelegatedTask(task.id, {
      status: 'failed',
      result: {
        ok: false,
        summary: `Nexora tool-execution worker failed: ${message}`,
        data: {
          handledBy: 'nexora.tool-execution-worker',
          objective: task.objective,
          constraints: task.constraints,
          requiredTools: task.requiredTools,
          executedTools: toolResults,
        },
        error: error instanceof Error ? { message: error.message, stack: error.stack } : { message },
      },
      log: `Nexora tool-execution worker failed: ${message}`,
      event: {
        type: 'task.failed',
        actor: 'nexora',
        summary: 'Nexora tool-execution worker recorded terminal failure.',
        details: { worker: 'nexora.tool-execution-worker', message },
      },
    });
  }

  return true;
};

export const nexoraApprovedToolNames = toolRegistry
  .filter((definition) => isApprovedNexoraTool(definition.name))
  .map((definition) => definition.name);
