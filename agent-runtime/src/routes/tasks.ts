import { Router } from 'express';
import { createTask, listTasks, updateTask } from '../memory/index.js';
import { completeExecutionRecord, createExecutionRecord, summarizeProviderResponse, writeExecutionRecord } from '../executions.js';
import type { TaskStatus } from '../types.js';

export const tasksRouter = Router();

tasksRouter.get('/', async (req, res, next) => {
  try {
    const sessionId = String(req.query.sessionId || 'default');
    res.json({ tasks: await listTasks(sessionId) });
  } catch (error) {
    next(error);
  }
});

tasksRouter.post('/', async (req, res, next) => {
  try {
    const { sessionId = 'default', title, notes } = req.body || {};
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const requestedAt = new Date().toISOString();
    const task = await createTask(sessionId, title, notes);
    const execution = createExecutionRecord({
      kind: 'delegated_task',
      whoRequested: 'api-client',
      chosenByAgent: 'runtime-task-api',
      action: 'tasks.create',
      inputPayload: { title, notes },
      riskLevel: 'write',
      approvalStatus: 'not_required',
      linkedIds: { sessionId, taskIds: [task.id] },
      requestedAt,
      startedAt: requestedAt,
      status: 'running',
      receiptSummary: `Task ${task.id} created`,
    });
    await writeExecutionRecord(completeExecutionRecord(execution, {
      status: 'completed',
      executionResult: task,
      providerResponseSummary: summarizeProviderResponse(task),
      receiptSummary: `Delegated task created: ${task.title}`,
    }));
    res.status(201).json({ task });
  } catch (error) {
    next(error);
  }
});

tasksRouter.patch('/:taskId', async (req, res, next) => {
  try {
    const sessionId = String(req.body?.sessionId || req.query.sessionId || 'default');
    const patch: { status?: TaskStatus; notes?: string; title?: string } = {};
    if (req.body?.status) patch.status = req.body.status;
    if (req.body?.notes) patch.notes = req.body.notes;
    if (req.body?.title) patch.title = req.body.title;

    const task = await updateTask(sessionId, req.params.taskId, patch);
    if (!task) {
      res.status(404).json({ error: 'task not found' });
      return;
    }
    const execution = createExecutionRecord({
      kind: 'delegated_task',
      whoRequested: 'api-client',
      chosenByAgent: 'runtime-task-api',
      action: 'tasks.update',
      inputPayload: patch,
      riskLevel: 'write',
      approvalStatus: 'not_required',
      linkedIds: { sessionId, taskIds: [task.id] },
      startedAt: new Date().toISOString(),
      status: 'running',
      receiptSummary: `Task ${task.id} update requested`,
    });
    await writeExecutionRecord(completeExecutionRecord(execution, {
      status: 'completed',
      executionResult: task,
      providerResponseSummary: summarizeProviderResponse(task),
      receiptSummary: `Delegated task updated: ${task.title}`,
    }));
    res.json({ task });
  } catch (error) {
    next(error);
  }
});
