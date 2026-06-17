import 'dotenv/config';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import express from 'express';

process.env.AGENT_RUNTIME_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'delegated-approval-routing-'));

const { tasksRouter } = await import('../src/routes/tasks.js');

function request(baseUrl: string, method: string, pathname: string, body?: unknown) {
  return new Promise<{ status: number; payload: any }>((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const url = new URL(pathname, baseUrl);
    const req = http.request(
      url,
      {
        method,
        headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : undefined,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, payload: raw ? JSON.parse(raw) : undefined }));
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const app = express();
app.use(express.json());
app.use('/api/tasks', tasksRouter);
const server = app.listen(0, '127.0.0.1');

try {
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const created = await request(baseUrl, 'POST', '/api/tasks', {
    sessionId: 'approval-routing-smoke',
    objective: 'Verify delegated approval routing aliases.',
    approvalRequirements: ['Approve task before queueing.'],
    executionPlan: [
      {
        id: 'step-file-write',
        title: 'Write file after approval',
        targetTool: 'code.create_file',
        input: { path: '.runtime-smoke/approval-routing.txt', content: 'ok' },
        approvalStatus: 'pending',
        approval: { required: true, status: 'pending', reason: 'route_smoke' },
      },
    ],
  });
  assert.equal(created.status, 201);
  const taskId = created.payload.task.id;
  assert.equal(created.payload.task.status, 'pending_approval');
  assert.equal(created.payload.taskState.approvalStatus, 'pending');

  const missingConfirmation = await request(baseUrl, 'POST', `/api/tasks/${taskId}/approval`, { approver: 'smoke' });
  assert.equal(missingConfirmation.status, 400);

  const approvedTask = await request(baseUrl, 'POST', `/api/tasks/${taskId}/approval`, {
    confirmedByUser: true,
    approver: 'smoke',
    note: 'Approve task through alias route.',
  });
  assert.equal(approvedTask.status, 200);
  assert.equal(approvedTask.payload.task.id, taskId);
  assert.equal(approvedTask.payload.task.status, 'queued');
  assert.equal(approvedTask.payload.taskState.approvalStatus, 'pending');

  const approvedStep = await request(baseUrl, 'POST', `/api/tasks/${taskId}/steps/step-file-write/approval`, {
    confirmedByUser: true,
    approver: 'smoke',
    note: 'Approve step through alias route.',
  });
  assert.equal(approvedStep.status, 200);
  assert.equal(approvedStep.payload.task.id, taskId);
  assert.equal(approvedStep.payload.task.executionPlan[0].approvalStatus, 'approved');
  assert.equal(approvedStep.payload.taskState.approvalStatus, 'approved');

  console.log('Delegated approval routing smoke passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
