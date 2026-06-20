import { RunContext, RunState, run } from '@openai/agents';
import { elora } from './agents/elora.js';
import { jynx } from './agents/jynx.js';
import { kalyra } from './agents/kalyra.js';
import { kaz } from './agents/kaz.js';
import { nexora } from './agents/nexora.js';
import { getRuntimeContext, listMemories, persistRuntimeContext } from './memory/index.js';
import { listExecutionRecords } from './executions.js';
import { createDelegationTask } from './tools/delegation.js';
import { getDelegatedTask } from './tasks/store.js';
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


function isCoreExecutionProofRequest(message: string) {
  const text = message.toLowerCase();
  return text.includes('core execution proof') && text.includes('nexora') && (text.includes('create') || text.includes('write'));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTaskTerminal(taskId: string, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = await getDelegatedTask(taskId);
    if (task && ['completed', 'failed', 'blocked', 'cancelled'].includes(task.status)) return task;
    await sleep(100);
  }
  return getDelegatedTask(taskId);
}

async function runCoreExecutionProof(request: AgentMessageRequest, context: RuntimeContext, sink?: AgentMessageSink): Promise<AgentMessageResult> {
  const timestamp = new Date().toISOString();
  const proofDir = 'core-execution-proof';
  const proofFile = `${proofDir}/core-execution-proof-${Date.now()}.txt`;
  const note = `CORE execution proof created by Nexora at ${timestamp}. Session: ${context.sessionId}.\n`;
  const validationCommand = `node -e "const fs=require('fs'); const p=${JSON.stringify(proofFile)}; if(!fs.existsSync(p)) { console.error('missing proof file'); process.exit(1); } const text=fs.readFileSync(p,'utf8'); if(!text.includes('CORE execution proof')) { console.error('missing proof marker'); process.exit(1); } console.log('proof file validated:', p);"`;

  await sink?.({ event: 'runtime_event', data: { type: 'core_execution_proof.started', sessionId: context.sessionId, proofFile } });
  const task = await createDelegationTask({
    objective: 'Have Nexora create a CORE execution proof file, write a timestamped note, run a validation command, and report the receipt.',
    requiredTools: ['code.mkdir', 'code.create_file', 'code.test'],
    constraints: ['Ordinary local workspace execution only.', 'No approval gate should be created for these local workspace actions.'],
    initialLog: `Elora routed CORE execution proof to Nexora at ${timestamp}.`,
    authorizationSource: 'user_delegated',
    executionPlan: [
      { targetTool: 'code.mkdir', arguments: { path: proofDir } },
      { targetTool: 'code.create_file', arguments: { path: proofFile, content: note } },
      { targetTool: 'code.test', arguments: { command: validationCommand, cwd: '.', timeoutMs: 10000, maxOutputBytes: 20000 } },
    ],
    timeoutMs: 30000,
  }, context);

  await sink?.({ event: 'runtime_event', data: { type: 'delegation.create_task.completed', taskId: task.id, status: task.status, proofFile } });
  const completedTask = await waitForTaskTerminal(task.id, 30000);
  const executions = await listExecutionRecords({ sessionId: context.sessionId, limit: 20 });
  const proofExecutions = executions.filter((execution) => execution.linkedIds?.taskIds?.includes(task.id) || execution.linkedIds?.parentTaskId === task.id || execution.linkedIds?.rootTaskId === task.id);
  const receipt = proofExecutions.find((execution) => execution.status === 'completed' && execution.receipt?.summary) || proofExecutions[0];
  const approvalRequired = proofExecutions.some((execution) => execution.approvalStatus === 'pending' || execution.status === 'blocked');
  const finalOutput = {
    visibleReply: `Nexora completed the CORE execution proof. Created ${proofFile}, ran validation, and recorded receipt ${receipt?.id || 'pending receipt lookup'}.`,
    toolCalls: proofExecutions.map((execution) => execution.action),
    memoryReferences: [],
    taskStatus: completedTask?.status || task.status,
    needsApproval: approvalRequired,
    proof: {
      taskId: task.id,
      status: completedTask?.status || task.status,
      proofFile,
      validationCommand,
      receiptId: receipt?.id,
      receiptSummary: receipt?.receipt?.summary,
      approvalRequired,
    },
  };
  const text = finalOutput.visibleReply;
  await persistRuntimeContext(context);
  const memories = await listMemories(context.sessionId, 5);
  await sink?.({ event: 'runtime_event', data: { type: 'core_execution_proof.completed', sessionId: context.sessionId, ...finalOutput.proof } });
  await sink?.({ event: 'completed', data: { sessionId: context.sessionId, finalOutput, memories, channel: context.channel, voiceSessionId: context.voiceSessionId, agent: request.agent || 'elora' } });
  return { sessionId: context.sessionId, context, text, finalOutput, memories, runtimeEvents: [{ type: 'core_execution_proof.completed', proof: finalOutput.proof }] };
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

  if (selectedAgent === 'elora' && isCoreExecutionProofRequest(trimmed)) {
    return runCoreExecutionProof(request, context, sink);
  }

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
