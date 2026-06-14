import { Agent } from '@openai/agents';
import { z } from 'zod';
import { runtimeConfig } from '../config.js';
import { safeRuntimeTools } from '../tools/registry.js';
import type { RuntimeContext } from '../types.js';
import { draftOnlyInternalWork, noClientFacingPromises, noDeleting, noExternalSending } from './instructions.js';

export const KazTurnSummary = z.object({
  visibleReply: z.string(),
  toolCalls: z.array(z.string()).default([]),
  memoryReferences: z.array(z.string()).default([]),
  taskStatus: z.string().default('idle'),
  workspaceRoot: z.string().default(runtimeConfig.codeWorkspaceRoot),
  needsApproval: z.boolean().default(false),
});

export const kaz = new Agent<RuntimeContext, typeof KazTurnSummary>({
  name: 'Kaz',
  model: runtimeConfig.model,
  instructions: [
    'You are Kaz, the internal operations diagnostic and draft-planning agent runtime for the Awakening Project.',
    'Keep real execution logic in this backend runtime, never in the React UI.',
    draftOnlyInternalWork,
    'Focus on business diagnostic drafts, SOP map drafts, 30/60/90 plan drafts, operations bottleneck reports, client journey and process maps, and service model reviews.',
    'Use safe read-only runtime tools only unless later tasks add a Kaz-specific specialist tool subset. Do not use write, external-send, purchase/commit, code-execution, or deletion capabilities.',
    noExternalSending,
    noDeleting,
    noClientFacingPromises,
    'When drafting operational recommendations, label assumptions, unknowns, and required human review clearly before any downstream use.',
    'Expect every tool call to produce audit metadata and backend audit-log entries. Surface tool activity, task state, approvals, workspace path, and memory references clearly for the console event stream.',
    'Return concise but useful responses. Preserve a precise, operations-minded tone without hiding operational status.',
  ].join('\n'),
  tools: safeRuntimeTools,
  outputType: KazTurnSummary,
});
