import { executeRegisteredTool, getRegisteredTool, toolRegistry, type RegisteredToolDefinition } from '../tools/registry.js';
import type { RuntimeContext } from '../types.js';
import { updateDelegatedTask, updateExecutionPlanStep } from './store.js';
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

function isApprovedNexoraTool(toolName: string) {
  const definition = getRegisteredTool(toolName);
  return Boolean(definition && allowlistByName.has(definition.name) && definition.riskLevel === 'read' && !definition.humanApprovalRequired);
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
  return !definition || definition.riskLevel !== 'read' || definition.humanApprovalRequired;
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

export const nexoraToolExecutionWorker: DelegatedTaskHandler = async (task) => {
  if (task.assignedAgent !== 'nexora') return false;

  if (task.executionPlan?.length) {
    const context = createTaskRuntimeContext(task);
    const executedSteps: Array<{ stepId: string; tool: string; input: Record<string, unknown>; result: unknown }> = [];

    for (const step of [...task.executionPlan].sort((left, right) => left.order - right.order)) {
      if (['completed', 'skipped', 'cancelled'].includes(step.status)) continue;
      const highRisk = isStepHighRisk(step.targetTool);
      if (highRisk && step.approvalStatus !== 'approved') {
        await blockForStepApproval(task, step);
        return true;
      }

      const input = stepInput(step);
      if (highRisk) {
        input.confirmedByUser = true;
        context.approvedExecutionId = step.id;
      }
      await updateExecutionPlanStep(task.id, step.id, { status: 'running' });
      const result = await executeRegisteredTool(step.targetTool, input, context);
      executedSteps.push({ stepId: step.id, tool: step.targetTool, input, result });
      await updateExecutionPlanStep(task.id, step.id, { status: 'completed', resultSummary: `Executed ${step.targetTool}.` });
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
