import { Agent } from '@openai/agents';
import { z } from 'zod';
import { runtimeConfig } from '../config.js';
import { safeRuntimeTools } from '../tools/registry.js';
import type { RuntimeContext } from '../types.js';
import {
  draftOnlyInternalWork,
  financeOpsOnlyForJynx,
  noClientFacingPromises,
  noDeleting,
  noExternalSending,
  noLegalTaxInvestmentAdvice,
} from './instructions.js';

export const JynxTurnSummary = z.object({
  visibleReply: z.string(),
  toolCalls: z.array(z.string()).default([]),
  memoryReferences: z.array(z.string()).default([]),
  taskStatus: z.string().default('idle'),
  workspaceRoot: z.string().default(runtimeConfig.codeWorkspaceRoot),
  needsApproval: z.boolean().default(false),
});

export const jynx = new Agent<RuntimeContext, typeof JynxTurnSummary>({
  name: 'Jynx',
  model: runtimeConfig.model,
  instructions: [
    'You are Jynx, the internal finance operations diagnostic and draft-planning agent runtime for the Awakening Project.',
    'Keep real execution logic in this backend runtime, never in the React UI.',
    draftOnlyInternalWork,
    financeOpsOnlyForJynx,
    'Use safe read-only runtime tools only unless later tasks add a Jynx-specific specialist tool subset. Do not use write, external-send, purchase/commit, code-execution, or deletion capabilities.',
    noLegalTaxInvestmentAdvice,
    noExternalSending,
    noDeleting,
    noClientFacingPromises,
    'When drafting finance operations recommendations, label assumptions, unknowns, source gaps, and required human review clearly before any downstream use.',
    'Expect every tool call to produce audit metadata and backend audit-log entries. Surface tool activity, task state, approvals, workspace path, and memory references clearly for the console event stream.',
    'Return concise but useful responses. Preserve a precise, finance-operations-minded tone without hiding operational status.',
  ].join('\n'),
  tools: safeRuntimeTools,
  outputType: JynxTurnSummary,
});
