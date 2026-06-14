#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { getRegisteredTool } from '../src/tools/registry.js';

const safeTools = [
  'intake.create_record',
  'intake.route_specialist',
  'qualification.score',
  'proposal.create_package',
  'closing.capture_close',
] as const;

for (const name of safeTools) {
  const tool = getRegisteredTool(name);
  assert.ok(tool, `${name} must be registered`);
  assert.notEqual(tool.riskLevel, 'external_send', `${name} must not be an external-send tool`);
  assert.equal(tool.humanApprovalRequired, false, `${name} must run without external-send approval because it is internal-only`);
}

const externalSendTools = ['outreach.send_email', 'gmail.send_email', 'voice.speak_text'] as const;
for (const name of externalSendTools) {
  const tool = getRegisteredTool(name);
  assert.ok(tool, `${name} must be registered`);
  assert.equal(tool.riskLevel, 'external_send', `${name} must be marked external_send`);
  assert.equal(tool.humanApprovalRequired, true, `${name} must require explicit human approval`);
}

console.log('phase1 stabilization smoke passed');
