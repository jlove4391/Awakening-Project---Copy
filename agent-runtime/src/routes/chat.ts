import { Router } from 'express';
import { run } from '@openai/agents';
import { elora } from '../agents/elora.js';
import { getRuntimeContext, listMemories, persistRuntimeContext } from '../memory/index.js';
import { setupSse, sendEvent } from '../lib/sse.js';
import type { ChatRequestBody } from '../types.js';

export const chatRouter = Router();

function extractTextDelta(event: any) {
  if (event?.type === 'raw_model_stream_event') {
    return event?.data?.delta || event?.data?.text_delta || event?.data?.event?.delta;
  }
  if (event?.type === 'response.output_text.delta') return event.delta;
  return undefined;
}

function isToolishEvent(event: any) {
  const type = String(event?.type || '');
  return type.includes('tool') || type.includes('approval') || type.includes('handoff');
}

chatRouter.post('/', async (req, res, next) => {
  const { message, sessionId } = req.body as ChatRequestBody;

  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  setupSse(res);

  try {
    const context = await getRuntimeContext(sessionId);
    sendEvent(res, 'session', {
      sessionId: context.sessionId,
      provider: context.record.provider,
      providerConversationId: context.record.providerConversationId,
    });
    sendEvent(res, 'memory', { references: await listMemories(context.sessionId, 5) });

    const stream = await run(elora, message.trim(), {
      stream: true,
      session: context.session,
      context,
    });

    for await (const event of stream) {
      const delta = extractTextDelta(event);
      if (delta) sendEvent(res, 'delta', { text: delta });

      if (isToolishEvent(event)) {
        sendEvent(res, 'runtime_event', event);
      }
    }

    await stream.completed;
    await persistRuntimeContext(context);

    sendEvent(res, 'completed', {
      sessionId: context.sessionId,
      finalOutput: stream.finalOutput,
      memories: await listMemories(context.sessionId, 5),
    });
    res.end();
  } catch (error) {
    sendEvent(res, 'error', { message: error instanceof Error ? error.message : 'Unknown runtime error' });
    res.end();
    next(error);
  }
});
