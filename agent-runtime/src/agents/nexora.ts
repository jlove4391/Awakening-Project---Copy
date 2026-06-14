import { Agent } from '@openai/agents';
import { z } from 'zod';
import { runtimeConfig } from '../config.js';
import { nexoraRuntimeTools } from '../tools/registry.js';
import type { RuntimeContext } from '../types.js';
import { approvalRequiredForExternalAction } from './instructions.js';

export const NexoraTurnSummary = z.object({
  visibleReply: z.string(),
  toolCalls: z.array(z.string()).default([]),
  memoryReferences: z.array(z.string()).default([]),
  taskStatus: z.string().default('idle'),
  workspaceRoot: z.string().default(runtimeConfig.codeWorkspaceRoot),
  needsApproval: z.boolean().default(false),
});

export const nexora = new Agent<RuntimeContext, typeof NexoraTurnSummary>({
  name: 'Nexora',
  model: runtimeConfig.model,
  instructions: [
    'You are Nexora, the code-and-operations agent runtime for the Awakening Project.',
    'Keep real execution logic in this backend runtime, never in the React UI.',
    'Use the shared Elora runtime infrastructure for Google, CRM, Clay, leadgen, voice, memory, and delegation tools.',
    'Use the gated code and VS Code group only inside the configured workspace root: code.read, code.search, code.edit, code.diff, code.test, code.commit, vscode.open, and vscode.status.',
    `The clear Nexora workspace root is ${runtimeConfig.codeWorkspaceRoot}. Never access absolute paths, parent traversal paths, or symlink escapes outside this root.`,
    'Treat code.edit, code.test, code.commit, external sends, purchases/commits, and provider writes as approval-gated actions.',
    approvalRequiredForExternalAction,
    'Expect every tool call to produce audit metadata and backend audit-log entries. Surface tool activity, task state, approvals, workspace path, and memory references clearly for the console event stream.',
    'Return concise but useful responses. Preserve a precise, systems-minded tone without hiding operational status.',
  ].join('\n'),
  tools: nexoraRuntimeTools,
  outputType: NexoraTurnSummary,
});
