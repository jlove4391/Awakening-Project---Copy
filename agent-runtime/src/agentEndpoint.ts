import { RunContext, RunState, run } from '@openai/agents';
import { elora } from './agents/elora.js';
import { jynx } from './agents/jynx.js';
import { kalyra } from './agents/kalyra.js';
import { kaz } from './agents/kaz.js';
import { nexora } from './agents/nexora.js';
import { getRuntimeContext, listMemories, persistRuntimeContext } from './memory/index.js';
import { normalizeAutonomyLevel } from './governance/autonomyProfiles.js';
import { clearPendingSdkApproval, formatApprovalPrompt, getPendingSdkApproval, isApprovalReply, savePendingSdkApproval } from './approvals/sdkApprovalStore.js';
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

export type AgentMessageSink = (event: AgentMessageEvent) => void | Promise<void>;

export interface AgentMessageResult {
  sessionId: string;
  context: RuntimeContext;
  text: string;
  finalOutput: unknown;
  memories: Awaited<ReturnType<typeof listMemories>>;
  runtimeEvents: unknown[];
}

export async function runAgentMessage(request: AgentMessageRequest, sink?: AgentMessageSink): Promise<AgentMessageResult> {
  const trimmed = request.message?.trim() || '';
  if (!trimmed && !request.approval) throw new Error('message or approval is required');

  const selectedAgent = request.agent ?? 'elora';
  if (!isRuntimeAgentName(selectedAgent)) {
    throw new Error(`invalid agent: ${selectedAgent}`);
  }
  const agent = runtimeAgents[selectedAgent];

  const context = await getRuntimeContext(request.sessionId);
  context.channel = request.channel || 'text';
  context.voiceSessionId = request.voiceSessionId;
  context.voiceApproval = request.voiceApproval;
  context.agent = selectedAgent;
  context.autonomyProfile = request.autonomyProfile;
  context.autonomyLevel = normalizeAutonomyLevel(request.autonomyLevel);
  context.executionMode = request.executionMode || (request.autonomyProfile ? 'autonomous' : 'reactive');

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
    },
  });
  await sink?.({ event: 'memory', data: { references: await listMemories(context.sessionId, 5) } });

  const pendingApproval = getPendingSdkApproval(context.sessionId);
  const approvalAction = pendingApproval ? normalizeApprovalAction(request, pendingApproval) : undefined;
  let streamInput: string | RunState<any, any> = trimmed;

  if (approvalAction === 'ambiguous' && pendingApproval) {
    const message = approvalAmbiguityMessage(pendingApproval);
    await sink?.({ event: 'delta', data: { text: message } });
    await sink?.({ event: 'runtime_event', data: { type: 'sdk_approval_ambiguous', sessionId: context.sessionId, approvals: pendingApproval.approvals } });
    const memories = await listMemories(context.sessionId, 5);
    await sink?.({ event: 'completed', data: { sessionId: context.sessionId, finalOutput: message, memories, channel: context.channel, voiceSessionId: context.voiceSessionId, agent: selectedAgent } });
    return { sessionId: context.sessionId, context, text: message, finalOutput: message, memories, runtimeEvents: [{ type: 'sdk_approval_ambiguous', approvals: pendingApproval.approvals }] };
  }

  if (approvalAction && approvalAction !== 'ambiguous' && pendingApproval) {
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
      await sink?.({ event: 'delta', data: { text: message } });
      await sink?.({ event: 'runtime_event', data: { type: 'sdk_approval_cancelled', sessionId: context.sessionId, approvalId: targetApprovalId, approvals: pendingApproval.approvals } });
      await persistRuntimeContext(context);
      const memories = await listMemories(context.sessionId, 5);
      await sink?.({ event: 'completed', data: { sessionId: context.sessionId, finalOutput: message, memories, channel: context.channel, voiceSessionId: context.voiceSessionId, agent: selectedAgent } });
      return { sessionId: context.sessionId, context, text: message, finalOutput: message, memories, runtimeEvents: [{ type: 'sdk_approval_cancelled', approvalId: targetApprovalId }] };
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
      },
    });
  }

  const stream = await run(agent as any, streamInput, {
    stream: true,
    session: context.session,
    context,
  });

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

  const interruptions = stream.interruptions;
  if (interruptions.length) {
    const pending = savePendingSdkApproval(context.sessionId, stream.state.toString(), interruptions);
    const prompt = formatApprovalPrompt(pending);
    text += prompt;
    runtimeEvents.push({ type: 'sdk_approval_required', sessionId: context.sessionId, approvals: pending.approvals });
    await persistRuntimeContext(context);
    const memories = await listMemories(context.sessionId, 5);
    await sink?.({ event: 'delta', data: { text: prompt } });
    await sink?.({
      event: 'runtime_event',
      data: {
        type: 'sdk_approval_required',
        sessionId: context.sessionId,
        approvals: pending.approvals,
      },
    });
    await sink?.({
      event: 'completed',
      data: {
        sessionId: context.sessionId,
        finalOutput: prompt,
        memories,
        channel: context.channel,
        voiceSessionId: context.voiceSessionId,
        agent: selectedAgent,
      },
    });
    return { sessionId: context.sessionId, context, text, finalOutput: prompt, memories, runtimeEvents };
  }

  await persistRuntimeContext(context);

  const memories = await listMemories(context.sessionId, 5);
  await sink?.({
    event: 'completed',
    data: {
      sessionId: context.sessionId,
      finalOutput: stream.finalOutput,
      memories,
      channel: context.channel,
      voiceSessionId: context.voiceSessionId,
      agent: selectedAgent,
    },
  });

  return { sessionId: context.sessionId, context, text, finalOutput: stream.finalOutput, memories, runtimeEvents };
}
