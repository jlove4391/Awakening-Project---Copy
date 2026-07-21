import { RunContext, RunState, run } from '@openai/agents';
import { elora } from './agents/elora.js';
import { jynx } from './agents/jynx.js';
import { kalyra } from './agents/kalyra.js';
import { kaz } from './agents/kaz.js';
import { nexora } from './agents/nexora.js';
import { getRuntimeContext, listMemories, persistRuntimeContext } from './memory/index.js';
import { listExecutionRecords } from './executions.js';
import { normalizeAutonomyLevel } from './governance/autonomyProfiles.js';
import { clearPendingSdkApproval, formatApprovalPrompt, getPendingSdkApproval, isApprovalReply, savePendingSdkApproval } from './approvals/sdkApprovalStore.js';
import {
  createCoreCommand,
  decideInitialCommandAuthority,
  getCoreCommand,
  transitionCoreCommand,
  type CoreCommandEvent,
  type CoreCommandLinks,
  type CoreCommandRecord,
  type CoreCommandState,
} from './core/index.js';
import type { AgentApprovalAction, AgentMessageEvent, AgentMessageRequest, RuntimeAgentName, RuntimeContext } from './types.js';

export function extractTextDelta(event: any) {
  if (event?.type === 'raw_model_stream_event') {
    return event?.data?.delta || event?.data?.text_delta || event?.data?.event?.delta;
  }
  if (event?.type === 'response.output_text.delta') return event.delta;
  return undefined;
}

export function isToolishEvent(event: any) {
  const type = String(event?.type || '');
  return type.includes('tool') || type.includes('approval') || type.includes('handoff');
}

const runtimeAgents = {
  elora,
  nexora,
  kaz,
  jynx,
  kalyra,
} as const satisfies Record<RuntimeAgentName, unknown>;

const terminalCommandStates = new Set<CoreCommandState>(['completed', 'blocked', 'failed', 'cancelled']);

function isRuntimeAgentName(agent: unknown): agent is RuntimeAgentName {
  return typeof agent === 'string' && agent in runtimeAgents;
}

function findInterruptionByApprovalId(interruptions: ReturnType<RunState<any, any>['getInterruptions']>, approvalId: string) {
  return interruptions.find((interruption, index) => {
    const raw = interruption.rawItem as { callId?: string; call_id?: string; id?: string };
    const candidates = [raw.callId, raw.call_id, raw.id, `${interruption.name || interruption.toolName || 'tool'}-${index + 1}`].filter(Boolean);
    return candidates.includes(approvalId);
  });
}

function approvalAmbiguityMessage(pendingApproval: NonNullable<ReturnType<typeof getPendingSdkApproval>>) {
  const ids = pendingApproval.approvals.map((approval) => approval.approvalId).join(', ');
  return `Multiple approvals are pending for this session. Please choose one approvalId and send an explicit approval decision. Pending approval IDs: ${ids}.`;
}

function normalizeApprovalAction(request: AgentMessageRequest, pendingApproval: NonNullable<ReturnType<typeof getPendingSdkApproval>>): AgentApprovalAction | undefined | 'ambiguous' {
  if (request.approval) return request.approval;
  const message = request.message?.trim() || '';
  if (!isApprovalReply(message)) return undefined;
  if (pendingApproval.approvals.length !== 1) return 'ambiguous';
  return { decision: 'approve', approvalId: pendingApproval.approvals[0]?.approvalId };
}

function extractIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const id = record.id || record.memoryId || record.memory_id || record.receipt_id;
    return typeof id === 'string' ? [id] : [];
  });
}

function taskIdsFromExecution(execution: Awaited<ReturnType<typeof listExecutionRecords>>[number]) {
  const ids = [...(execution.linkedIds.taskIds || [])];
  const result = execution.executionResult;
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const record = result as Record<string, unknown>;
    for (const candidate of [record.id, record.taskId, (record.task as Record<string, unknown> | undefined)?.id]) {
      if (typeof candidate === 'string' && (execution.action.startsWith('delegation.') || execution.kind === 'delegated_task')) ids.push(candidate);
    }
  }
  return ids;
}

async function collectCommandEvidence(command: CoreCommandRecord) {
  const baseline = new Set(command.context.baselineExecutionIds || []);
  const executions = (await listExecutionRecords({ sessionId: command.sessionId, limit: 100 }))
    .filter((execution) => !baseline.has(execution.id));
  const links: CoreCommandLinks = {
    memoryReferenceIds: [],
    memoryCandidateIds: [],
    taskIds: [...new Set(executions.flatMap(taskIdsFromExecution))],
    executionIds: executions.map((execution) => execution.id),
    receiptIds: [...new Set(executions.map((execution) => execution.receipt.alpha?.receipt_id || execution.id).filter(Boolean))],
  };
  links.memoryCandidateIds = [...new Set(executions.flatMap((execution) => extractIds(execution.receipt.alpha?.memory_candidates)))];
  return {
    executions,
    links,
    failed: executions.filter((execution) => execution.status === 'failed'),
    blocked: executions.filter((execution) => execution.status === 'blocked'),
    setupRequired: executions.filter((execution) => execution.policyAction === 'setup_needed' || (execution.executionResult as { status?: string } | undefined)?.status === 'provider_not_configured'),
  };
}

async function emitCoreCommandEvent(sink: AgentMessageSink | undefined, command: CoreCommandRecord, event: CoreCommandEvent) {
  await sink?.({
    event: 'runtime_event',
    data: {
      type: 'core.command.lifecycle',
      commandId: command.id,
      sessionId: command.sessionId,
      state: command.state,
      event,
      links: command.links,
    },
  });
}

async function transitionCommand(command: CoreCommandRecord, state: CoreCommandState, patch: Parameters<typeof transitionCoreCommand>[2], sink?: AgentMessageSink) {
  const transitioned = await transitionCoreCommand(command.id, state, patch);
  await emitCoreCommandEvent(sink, transitioned.command, transitioned.event);
  return transitioned.command;
}

export type AgentMessageSink = (event: AgentMessageEvent) => void | Promise<void>;

export interface AgentMessageResult {
  sessionId: string;
  context: RuntimeContext;
  text: string;
  finalOutput: unknown;
  memories: Awaited<ReturnType<typeof listMemories>>;
  runtimeEvents: unknown[];
  commandId?: string;
}

export async function runAgentMessage(request: AgentMessageRequest, sink?: AgentMessageSink): Promise<AgentMessageResult> {
  const trimmed = request.message?.trim() || '';
  if (!trimmed && !request.approval) throw new Error('message or approval is required');

  const selectedAgent = request.agent ?? 'elora';
  if (!isRuntimeAgentName(selectedAgent)) throw new Error(`invalid agent: ${selectedAgent}`);
  const agent = runtimeAgents[selectedAgent];

  const context = await getRuntimeContext(request.sessionId);
  context.channel = request.channel || 'text';
  context.voiceSessionId = request.voiceSessionId;
  context.voiceApproval = request.voiceApproval;
  context.agent = selectedAgent;
  context.autonomyProfile = request.autonomyProfile;
  context.autonomyLevel = normalizeAutonomyLevel(request.autonomyLevel);
  context.executionMode = request.executionMode || (request.autonomyProfile ? 'autonomous' : 'reactive');

  const pendingApproval = getPendingSdkApproval(context.sessionId);
  const approvalAction = pendingApproval ? normalizeApprovalAction(request, pendingApproval) : undefined;
  const approvalContinuation = Boolean(approvalAction && pendingApproval);
  let command = selectedAgent === 'elora' && approvalContinuation && pendingApproval?.commandId
    ? await getCoreCommand(pendingApproval.commandId)
    : undefined;

  if (selectedAgent === 'elora' && !command) {
    command = await createCoreCommand({
      sessionId: context.sessionId,
      agent: selectedAgent,
      requestText: trimmed || `Approval decision: ${request.approval?.decision || 'unknown'}`,
    });
    await emitCoreCommandEvent(sink, command, command.events[0]);
  }

  await sink?.({
    event: 'session',
    data: {
      sessionId: context.sessionId,
      provider: context.record.provider,
      providerConversationId: context.record.providerConversationId,
      channel: context.channel,
      voiceSessionId: context.voiceSessionId,
      agent: selectedAgent,
      executionMode: context.executionMode,
      autonomyLevel: context.autonomyLevel,
      commandId: command?.id,
    },
  });

  const [initialMemories, baselineExecutions] = await Promise.all([
    listMemories(context.sessionId, 5),
    command?.state === 'intent_received' ? listExecutionRecords({ sessionId: context.sessionId, limit: 100 }) : Promise.resolve([]),
  ]);
  await sink?.({ event: 'memory', data: { references: initialMemories, commandId: command?.id } });

  if (command?.state === 'intent_received') {
    command = await transitionCommand(command, 'context_assembled', {
      summary: 'Current session memory and relationship context assembled for command planning.',
      context: { assembledAt: new Date().toISOString(), relationshipSubjectId: context.relationshipContext?.subjectId, baselineExecutionIds: baselineExecutions.map((execution) => execution.id) },
      links: { memoryReferenceIds: initialMemories.map((memory) => memory.id) },
    }, sink);
    command = await transitionCommand(command, 'authority_decided', {
      summary: 'Initial command authority decided; tool-level policy remains authoritative for each action.',
      authority: decideInitialCommandAuthority({ executionMode: context.executionMode, autonomyLevel: context.autonomyLevel }),
    }, sink);
    command = await transitionCommand(command, 'planning', { summary: 'Elora began planning the command through the normal agent path.' }, sink);
  }

  let streamInput: string | RunState<any, any> = trimmed;

  if (approvalAction === 'ambiguous' && pendingApproval) {
    const message = approvalAmbiguityMessage(pendingApproval);
    if (command && command.state !== 'approval_pending') {
      command = await transitionCommand(command, 'approval_pending', { summary: 'Multiple SDK approvals require an explicit approvalId.', details: { approvals: pendingApproval.approvals } }, sink);
    }
    await sink?.({ event: 'delta', data: { text: message } });
    await sink?.({ event: 'runtime_event', data: { type: 'sdk_approval_ambiguous', sessionId: context.sessionId, approvals: pendingApproval.approvals, commandId: command?.id } });
    const memories = await listMemories(context.sessionId, 5);
    await sink?.({ event: 'completed', data: { sessionId: context.sessionId, finalOutput: message, memories, channel: context.channel, voiceSessionId: context.voiceSessionId, agent: selectedAgent, commandId: command?.id, commandState: command?.state } });
    return { sessionId: context.sessionId, context, text: message, finalOutput: message, memories, runtimeEvents: [{ type: 'sdk_approval_ambiguous', approvals: pendingApproval.approvals }], commandId: command?.id };
  }

  if (approvalAction && approvalAction !== 'ambiguous' && pendingApproval) {
    if (command?.state === 'approval_pending') {
      command = await transitionCommand(command, 'planning', { summary: `SDK approval decision ${approvalAction.decision} received; preparing to resume the command.`, details: { approvalId: approvalAction.approvalId } }, sink);
    }
    const restoredContext = new RunContext(context);
    const restoredState = await RunState.fromStringWithContext(agent as any, pendingApproval.runState, restoredContext, { contextStrategy: 'replace' });
    const interruptions = restoredState.getInterruptions();
    const targetApprovalId = approvalAction.approvalId || (pendingApproval.approvals.length === 1 ? pendingApproval.approvals[0]?.approvalId : undefined);
    if (!targetApprovalId) throw new Error('approval.approvalId is required when multiple approvals are pending');
    const interruption = findInterruptionByApprovalId(interruptions, targetApprovalId);
    if (!interruption) throw new Error(`pending approval not found: ${targetApprovalId}`);

    if (approvalAction.decision === 'cancel') {
      clearPendingSdkApproval(context.sessionId);
      const message = `Cancelled pending approval ${targetApprovalId}; the SDK run was not resumed.`;
      if (command && !terminalCommandStates.has(command.state)) command = await transitionCommand(command, 'cancelled', { summary: message, finalOutput: message }, sink);
      await sink?.({ event: 'delta', data: { text: message } });
      await sink?.({ event: 'runtime_event', data: { type: 'sdk_approval_cancelled', sessionId: context.sessionId, approvalId: targetApprovalId, approvals: pendingApproval.approvals, commandId: command?.id } });
      await persistRuntimeContext(context);
      const memories = await listMemories(context.sessionId, 5);
      await sink?.({ event: 'completed', data: { sessionId: context.sessionId, finalOutput: message, memories, channel: context.channel, voiceSessionId: context.voiceSessionId, agent: selectedAgent, commandId: command?.id, commandState: command?.state } });
      return { sessionId: context.sessionId, context, text: message, finalOutput: message, memories, runtimeEvents: [{ type: 'sdk_approval_cancelled', approvalId: targetApprovalId }], commandId: command?.id };
    }

    const raw = interruption.rawItem as { callId?: string; call_id?: string; id?: string };
    const callId = raw.callId || raw.call_id || raw.id;
    const toolName = interruption.name || interruption.toolName;
    if (approvalAction.decision === 'approve') {
      restoredState.approve(interruption);
      context.sdkApprovedToolCallIds = callId ? [callId] : [];
      context.sdkApprovedToolNames = toolName ? [toolName] : [];
    } else if (approvalAction.decision === 'reject') {
      restoredState.reject(interruption, { message: approvalAction.reason || `User rejected approval ${targetApprovalId}.` });
      context.sdkApprovedToolCallIds = [];
      context.sdkApprovedToolNames = [];
    } else {
      throw new Error('approval.decision must be approve, reject, or cancel');
    }

    clearPendingSdkApproval(context.sessionId);
    streamInput = restoredState;
    await sink?.({
      event: 'runtime_event',
      data: {
        type: approvalAction.decision === 'approve' ? 'sdk_approval_resuming' : 'sdk_approval_rejected_resuming',
        sessionId: context.sessionId,
        approvalId: targetApprovalId,
        approvals: pendingApproval.approvals,
        commandId: command?.id,
      },
    });
  }

  if (command?.state === 'planning') command = await transitionCommand(command, 'executing', { summary: 'Elora entered normal model and tool execution.' }, sink);

  try {
    const stream = await run(agent as any, streamInput, { stream: true, session: context.session, context });
    let text = '';
    const runtimeEvents: unknown[] = [];

    for await (const event of stream) {
      const delta = extractTextDelta(event);
      if (delta) {
        text += delta;
        await sink?.({ event: 'delta', data: { text: delta } });
      }
      if (isToolishEvent(event)) {
        runtimeEvents.push(event);
        await sink?.({ event: 'runtime_event', data: event });
      }
    }

    await stream.completed;
    const evidence = command ? await collectCommandEvidence(command) : undefined;
    if (command && evidence?.links.taskIds.length && command.state === 'executing') {
      command = await transitionCommand(command, 'delegated', { summary: 'Elora created bounded delegated work through the normal tool path.', links: evidence.links }, sink);
    }

    const interruptions = stream.interruptions;
    if (interruptions.length) {
      const pending = savePendingSdkApproval(context.sessionId, stream.state.toString(), interruptions, command?.id);
      const prompt = formatApprovalPrompt(pending);
      text += prompt;
      runtimeEvents.push({ type: 'sdk_approval_required', sessionId: context.sessionId, approvals: pending.approvals, commandId: command?.id });
      if (command && command.state !== 'approval_pending') {
        command = await transitionCommand(command, 'approval_pending', { summary: 'A genuine SDK tool boundary is awaiting explicit approval.', links: evidence?.links, details: { approvals: pending.approvals } }, sink);
      }
      await persistRuntimeContext(context);
      const memories = await listMemories(context.sessionId, 5);
      await sink?.({ event: 'delta', data: { text: prompt } });
      await sink?.({ event: 'runtime_event', data: { type: 'sdk_approval_required', sessionId: context.sessionId, approvals: pending.approvals, commandId: command?.id } });
      await sink?.({ event: 'completed', data: { sessionId: context.sessionId, finalOutput: prompt, memories, channel: context.channel, voiceSessionId: context.voiceSessionId, agent: selectedAgent, commandId: command?.id, commandState: command?.state } });
      return { sessionId: context.sessionId, context, text, finalOutput: prompt, memories, runtimeEvents, commandId: command?.id };
    }

    if (command && evidence?.setupRequired.length) {
      command = await transitionCommand(command, 'setup_required', { summary: 'Execution requires provider credentials or setup that is not currently available.', links: evidence.links, finalOutput: stream.finalOutput }, sink);
    } else if (command && evidence?.failed.length) {
      command = await transitionCommand(command, 'failed', { summary: 'One or more linked executions failed.', links: evidence.links, finalOutput: stream.finalOutput, error: { message: evidence.failed.map((execution) => execution.receipt.summary).join('; ') } }, sink);
    } else if (command && evidence?.blocked.length) {
      command = await transitionCommand(command, 'blocked', { summary: 'One or more linked executions were blocked by policy or runtime state.', links: evidence.links, finalOutput: stream.finalOutput }, sink);
    } else if (command) {
      command = await transitionCommand(command, 'validating', { summary: evidence?.executions.length ? 'Linked execution outcomes were checked before command completion.' : 'No action-specific validation was required for this response-only command.', links: evidence?.links }, sink);
      command = await transitionCommand(command, 'receipted', { summary: evidence?.links.receiptIds.length ? 'Existing execution receipts were linked to the command.' : 'No separate action receipt was required; the command record preserves the response lifecycle.', links: evidence?.links }, sink);
      command = await transitionCommand(command, 'memory_candidates_recorded', { summary: evidence?.links.memoryCandidateIds.length ? 'Memory candidates produced by linked executions were recorded.' : 'No new memory candidates were produced by this command.', links: evidence?.links }, sink);
      command = await transitionCommand(command, 'response_synthesized', { summary: 'Elora synthesized the final user-facing result.', finalOutput: stream.finalOutput }, sink);
      command = await transitionCommand(command, 'completed', { summary: 'The Sovereign Command Loop completed successfully.', finalOutput: stream.finalOutput }, sink);
    }

    await persistRuntimeContext(context);
    const memories = await listMemories(context.sessionId, 5);
    await sink?.({ event: 'completed', data: { sessionId: context.sessionId, finalOutput: stream.finalOutput, memories, channel: context.channel, voiceSessionId: context.voiceSessionId, agent: selectedAgent, commandId: command?.id, commandState: command?.state } });
    return { sessionId: context.sessionId, context, text, finalOutput: stream.finalOutput, memories, runtimeEvents, commandId: command?.id };
  } catch (error) {
    if (command && !terminalCommandStates.has(command.state)) {
      const message = error instanceof Error ? error.message : String(error);
      command = await transitionCommand(command, 'failed', { summary: `Sovereign Command Loop failed: ${message}`, error: { message, ...(error instanceof Error && error.stack ? { stack: error.stack } : {}) } }, sink);
    }
    throw error;
  }
}
