import { tool, webSearchTool } from '@openai/agents';
import { z } from 'zod';
import { createTask, listMemories, listTasks, remember } from '../memory/index.js';
import type { RuntimeContext } from '../types.js';

export const rememberPreferenceTool = tool({
  name: 'remember_memory_reference',
  description: 'Persist a durable memory reference for the current Elora session.',
  parameters: z.object({
    text: z.string().min(1).describe('The memory text to store.'),
    scope: z.enum(['user', 'project', 'session']).default('session'),
    tags: z.array(z.string()).default([]),
  }),
  async execute(input, runContext) {
    const context = runContext.context as RuntimeContext;
    return remember(context.sessionId, input.text, { scope: input.scope, tags: input.tags });
  },
});

export const listMemoryTool = tool({
  name: 'list_memory_references',
  description: 'List the most recent memory references available to Elora.',
  parameters: z.object({
    limit: z.number().int().min(1).max(25).default(10),
  }),
  async execute(input, runContext) {
    const context = runContext.context as RuntimeContext;
    return listMemories(context.sessionId, input.limit);
  },
});

export const createTaskTool = tool({
  name: 'create_agent_task',
  description: 'Create a tracked backend task for work that Elora should plan, execute, or await approval for.',
  parameters: z.object({
    title: z.string().min(1),
    notes: z.string().optional(),
  }),
  async execute(input, runContext) {
    const context = runContext.context as RuntimeContext;
    return createTask(context.sessionId, input.title, input.notes);
  },
});

export const listTasksTool = tool({
  name: 'list_agent_tasks',
  description: 'List task statuses for the current Elora session.',
  parameters: z.object({}),
  async execute(_input, runContext) {
    const context = runContext.context as RuntimeContext;
    return listTasks(context.sessionId);
  },
});

export const runtimeTools = [
  rememberPreferenceTool,
  listMemoryTool,
  createTaskTool,
  listTasksTool,
  webSearchTool(),
];

export const toolManifest = runtimeTools.map((runtimeTool) => ({
  name: runtimeTool.name,
  description: runtimeTool.description,
}));
