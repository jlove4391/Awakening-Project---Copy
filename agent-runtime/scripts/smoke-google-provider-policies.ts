import assert from 'node:assert/strict';
import { classifyCalendarEventPolicy, createCalendarEvent } from '../src/providers/google/calendar.js';
import { classifyDriveTextFilePolicy, createDriveTextFile } from '../src/providers/google/drive.js';
import { classifyGmailDraftPolicy, classifyGmailSendPolicy, createGmailDraft, sendGmailEmail } from '../src/providers/google/gmail.js';

const internalDriveDoc = classifyDriveTextFilePolicy({ name: 'internal-plan.txt', content: 'Internal build note for workspace planning.' });
assert.equal(internalDriveDoc.action, 'execute');
assert.equal(internalDriveDoc.trustDomain, 'drive');

const privateDriveDoc = await createDriveTextFile({ name: 'secret.txt', content: 'password token private family detail' });
assert.equal(privateDriveDoc.status, 'approval_required');
assert.equal(privateDriveDoc.policy?.boundary, 'personal_information_sensitive');

const internalCalendarReminder = classifyCalendarEventPolicy({ summary: 'Internal build reminder', start: '2026-06-20T09:00:00Z', end: '2026-06-20T09:15:00Z' });
assert.equal(internalCalendarReminder.action, 'execute');
assert.equal(internalCalendarReminder.trustDomain, 'calendar');

const attendeeCalendarEvent = await createCalendarEvent({ summary: 'Client meeting', start: '2026-06-20T09:00:00Z', end: '2026-06-20T09:30:00Z', attendees: ['client@example.com'] });
assert.equal(attendeeCalendarEvent.status, 'approval_required');
assert.equal(attendeeCalendarEvent.policy?.classification, 'explicit_boundary');

const draftPolicy = classifyGmailDraftPolicy({ to: ['client@example.com'], subject: 'Draft only', body: 'Prepared draft; do not send.' });
assert.equal(draftPolicy.action, 'execute');
assert.equal(draftPolicy.trustDomain, 'gmail');

const sensitiveDraft = await createGmailDraft({ subject: 'Private draft', body: 'Contains password token detail.' });
assert.equal(sensitiveDraft.status, 'approval_required');
assert.equal(sensitiveDraft.policy?.boundary, 'personal_information_sensitive');

const sendPolicy = classifyGmailSendPolicy({ to: ['client@example.com'], subject: 'Sending externally', body: 'External send.' });
assert.equal(sendPolicy.action, 'ask_before_execution');
assert.equal(sendPolicy.trustDomain, 'gmail');
const sendBlocked = await sendGmailEmail({ to: ['client@example.com'], subject: 'Sending externally', body: 'External send.' });
assert.equal(sendBlocked.status, 'approval_required');
assert.equal(sendBlocked.policy?.boundary, 'personal_information_sensitive');

console.log('google provider policy smoke checks passed');
