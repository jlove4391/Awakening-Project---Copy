import assert from 'node:assert/strict';
import { decidePolicy } from '../src/governance/policyDecision.js';

const fileWrite = decidePolicy({ category: 'code', action: 'edit', riskLevel: 'write', approvalScope: 'repo.write', input: { path: 'src/index.ts' } });
assert.equal(fileWrite.action, 'execute');
assert.equal(fileWrite.receiptRequired, true);

const command = decidePolicy({ category: 'code', action: 'run_command', riskLevel: 'code_execution', approvalScope: 'repo.command', input: { command: 'npm test' } });
assert.equal(command.action, 'execute');

const emailSend = decidePolicy({ category: 'gmail', action: 'send_email', riskLevel: 'external_send', approvalScope: 'external.send', input: { to: ['customer@example.com'] } });
assert.equal(emailSend.action, 'ask_before_execution');
assert.equal(emailSend.boundary, 'personal_information_sensitive');

const purchase = decidePolicy({ category: 'digitalocean', action: 'purchase_database', riskLevel: 'purchase_or_commit', input: { estimatedCost: '$15/mo' } });
assert.equal(purchase.action, 'ask_before_execution');
assert.equal(purchase.boundary, 'rmt');

const setupNeeded = decidePolicy({ category: 'drive', action: 'create_text_file', riskLevel: 'write', hasRequiredSetup: false });
assert.equal(setupNeeded.action, 'setup_needed');

console.log('policy decision smoke checks passed');
