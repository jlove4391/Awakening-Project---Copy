import { run } from '@openai/agents';
import { elora } from './agents/elora.js';
import { jynx } from './agents/jynx.js';
import { kalyra } from './agents/kalyra.js';
import { kaz } from './agents/kaz.js';
import { nexora } from './agents/nexora.js';
import { getRuntimeContext, listMemories, persistRuntimeContext } from './memory/index.js';
import { normalizeAutonomyLevel } from './governance/autonomyProfiles.js';
import { isConversationalApprovalIntent, resolveConversationalApproval } from './approvals/conversationalApproval.js';
import type { AgentMessageEvent, AgentMessageRequest, RuntimeAgentName, RuntimeContext } from './types.js';

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
  const trimmed = request.message?.trim();
  if (!trimmed) throw new Error('message is required');

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

  if (isConversationalApprovalIntent(trimmed)) {
    const approval = await resolveConversationalApproval(context.sessionId);
    await persistRuntimeContext(context);
    const memories = await listMemories(context.sessionId, 5);
    await sink?.({ event: 'delta', data: { text: approval.message } });
    await sink?.({
      event: 'runtime_event',
      data: {
        type: 'conversational_approval_resolution',
        sessionId: context.sessionId,
        taskId: approval.resolvedApproval?.taskId,
        stepId: approval.resolvedApproval?.stepId,
        scope: approval.resolvedApproval?.scope,
        task: approval.task,
      },
    });
    await sink?.({
      event: 'completed',
      data: {
        sessionId: context.sessionId,
        finalOutput: approval.message,
        memories,
        channel: context.channel,
        voiceSessionId: context.voiceSessionId,
        agent: selectedAgent,
      },
    });
    return { sessionId: context.sessionId, context, text: approval.message, finalOutput: approval.message, memories, runtimeEvents: [] };
  }

  const stream = await run(agent, trimmed, {
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
