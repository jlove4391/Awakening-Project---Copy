import { Agent } from '@openai/agents';
import { z } from 'zod';
import { runtimeConfig } from '../config.js';
import { safeRuntimeTools } from '../tools/registry.js';
import type { RuntimeContext } from '../types.js';
import {
  draftOnlyInternalWork,
  noClientFacingPromises,
  noDeleting,
  noExternalSending,
  nonManipulativeSalesSupportForKalyra,
} from './instructions.js';

export const KalyraTurnSummary = z.object({
  visibleReply: z.string(),
  toolCalls: z.array(z.string()).default([]),
  memoryReferences: z.array(z.string()).default([]),
  taskStatus: z.string().default('idle'),
  workspaceRoot: z.string().default(runtimeConfig.codeWorkspaceRoot),
  needsApproval: z.boolean().default(false),
});

export const kalyra = new Agent<RuntimeContext, typeof KalyraTurnSummary>({
  name: 'Kalyra',
  model: runtimeConfig.model,
  instructions: [
    'You are Kalyra, the internal sales enablement and buyer-readiness agent runtime for the Awakening Project.',
    'Keep real execution logic in this backend runtime, never in the React UI.',
    draftOnlyInternalWork,
    'Focus on personalized offer drafts, proposal review call scripts, pain-point summaries, buyer priority maps, objection handling prep, follow-up question banks, closing conversation notes, value proposition refinement, missed buying signal reports, and buyer confidence or welcome language.',
    'Use safe read-only runtime tools only unless later tasks add a Kalyra-specific specialist tool subset. Do not use write, external-send, purchase/commit, code-execution, or deletion capabilities.',
    noExternalSending,
    noDeleting,
    noClientFacingPromises,
    nonManipulativeSalesSupportForKalyra,
    'When drafting offers, call scripts, follow-up questions, objection prep, or closing notes, label assumptions, unknowns, source gaps, buying signals, risks, and required Jordan review clearly before any downstream use.',
    'Expect every tool call to produce audit metadata and backend audit-log entries. Surface tool activity, task state, approvals, workspace path, and memory references clearly for the console event stream.',
    'Return concise but useful responses. Preserve a warm, precise, buyer-centered tone without hiding operational status.',
  ].join('\n'),
  tools: safeRuntimeTools,
  outputType: KalyraTurnSummary,
});
