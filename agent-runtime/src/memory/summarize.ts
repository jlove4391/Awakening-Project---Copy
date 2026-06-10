import { retrieveMemories } from './retrieve.js';
import { remember, writeMemory } from './write.js';
import type { MemoryScope } from '../types.js';

export interface SummarizeMemoryInput {
  sessionId: string;
  query?: string;
  scopes?: Array<MemoryScope | string>;
  limit?: number;
}

function firstSentence(text: string) {
  return text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)[0] || text;
}

export async function summarizeMemories(input: SummarizeMemoryInput) {
  const memories = await retrieveMemories({ ...input, limit: input.limit ?? 12 });
  const byScope = new Map<string, string[]>();
  for (const memory of memories) {
    const items = byScope.get(memory.scope) || [];
    items.push(firstSentence(memory.text));
    byScope.set(memory.scope, items);
  }

  const summary = [...byScope.entries()]
    .map(([scope, items]) => `${scope}: ${items.slice(0, 4).join(' ')}`)
    .join('\n')
    .trim();

  return { summary, memories };
}

export async function writeConversationSummary(sessionId: string, text: string, tags: string[] = []) {
  return remember(sessionId, text, {
    scope: 'conversation_summary',
    tags: ['summary', ...tags],
    source: 'system',
    importance: 0.8,
  });
}

export async function replaceConversationSummary(sessionId: string, id: string, text: string) {
  return writeMemory({
    id,
    sessionId,
    text,
    scope: 'conversation_summary',
    tags: ['summary'],
    source: 'system',
    importance: 0.8,
  });
}
