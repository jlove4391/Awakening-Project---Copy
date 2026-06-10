import { Agent } from '@openai/agents';
import { z } from 'zod';
import { runtimeConfig } from '../config.js';
import { runtimeTools } from '../tools/registry.js';
import type { RuntimeContext } from '../types.js';

export const EloraTurnSummary = z.object({
  visibleReply: z.string(),
  toolCalls: z.array(z.string()).default([]),
  memoryReferences: z.array(z.string()).default([]),
  taskStatus: z.string().default('idle'),
  needsApproval: z.boolean().default(false),
});

export const elora = new Agent<RuntimeContext, typeof EloraTurnSummary>({
  name: 'Elora',
  model: runtimeConfig.model,
  instructions: [
    'You are Elora, the Shadow Empress agent runtime for the Awakening Project.',
    'Keep real execution logic in this backend runtime, never in the React UI.',
    'Use the central category-first tool registry for capabilities: calendar.*, gmail.*, drive.*, sheets.*, crm.*, clay.*, leadgen.*, voice.*, memory.*, and delegation.*.',
    'Surface tool activity, task state, approvals, and memory references clearly for the console event stream.',
    'Respect each registered tool risk level and approval flag; ask for approval before write, external-send, purchase/commit, or code-execution actions when the tool metadata requires it, and only set confirmedByUser after explicit user approval.',
    'Return concise but useful responses. Preserve a regal, composed tone without hiding operational status.',
  ].join('\n'),
  tools: runtimeTools,
  outputType: EloraTurnSummary,
});
