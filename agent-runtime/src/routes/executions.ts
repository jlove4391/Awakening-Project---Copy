import { Router } from 'express';
import { completeExecutionRecord, getExecutionRecord, listExecutionRecords, updateExecutionRecord } from '../executions.js';
import { summarizeProviderResponse } from '../executions.js';
import { getRuntimeContext } from '../memory/index.js';
import { executeRegisteredTool, getRegisteredTool } from '../tools/registry.js';
import type { RuntimeAgentName } from '../types.js';

const runtimeAgentNames = new Set<RuntimeAgentName>(['elora', 'nexora', 'kaz', 'jynx']);

function resolveRuntimeAgentName(agent: string | undefined): RuntimeAgentName {
  return runtimeAgentNames.has(agent as RuntimeAgentName) ? (agent as RuntimeAgentName) : 'elora';
}

export const executionsRouter = Router();

executionsRouter.get('/', async (req, res, next) => {
  try {
    const sessionId = req.query.sessionId ? String(req.query.sessionId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 25;
    res.json({ executions: await listExecutionRecords({ sessionId, limit }) });
  } catch (error) {
    next(error);
  }
});


executionsRouter.post('/:id/approval', async (req, res, next) => {
  try {
    const executionId = String(req.params.id || '');
    const decision = req.body?.decision === 'deny' ? 'deny' : 'approve';
    const approvalNote = typeof req.body?.approvalNote === 'string' ? req.body.approvalNote : '';
    const record = await getExecutionRecord(executionId);

    if (!record) {
      res.status(404).json({ error: 'execution record not found' });
      return;
    }

    if (record.approvalStatus !== 'pending' || !record.approvalRequest) {
      res.status(409).json({ error: 'execution is not pending approval', execution: record });
      return;
    }

    if (decision === 'deny') {
      const rejectedRecord = completeExecutionRecord(record, {
        status: 'failed',
        approvalStatus: 'rejected',
        errors: [approvalNote || 'Denied by user in React approval UI'],
        executionResult: { ok: false, status: 'approval_denied', approvalNote },
        providerResponseSummary: 'Denied by user in React approval UI',
        receiptSummary: `${record.action} denied by user`,
      });
      rejectedRecord.approvalRequest = { ...record.approvalRequest, approvalNote };
      await updateExecutionRecord(rejectedRecord);
      res.json({ execution: rejectedRecord });
      return;
    }

    const toolDefinition = getRegisteredTool(record.approvalRequest.toolName);
    if (!toolDefinition) {
      res.status(404).json({ error: 'registered tool not found for approval request' });
      return;
    }

    const context = await getRuntimeContext(record.linkedIds.sessionId);
    context.agent = resolveRuntimeAgentName(record.chosenByAgent);
    context.voiceSessionId = record.linkedIds.voiceSessionId;
    context.approvedExecutionId = record.id;

    const replayInput = {
      ...record.approvalRequest.originalInput,
      confirmedByUser: true,
      approvalNote,
    };
    const result = await executeRegisteredTool(toolDefinition.name, replayInput, context);
    const approvedRecord = completeExecutionRecord(record, {
      status: 'completed',
      approvalStatus: 'approved',
      executionResult: { ok: true, status: 'approval_replayed', replayResult: result },
      providerResponseSummary: summarizeProviderResponse(result),
      receiptSummary: `${record.action} approved and replayed`,
    });
    approvedRecord.approvalRequest = { ...record.approvalRequest, approvalNote };
    await updateExecutionRecord(approvedRecord);

    res.json({ execution: approvedRecord, replayResult: result });
  } catch (error) {
    next(error);
  }
});
