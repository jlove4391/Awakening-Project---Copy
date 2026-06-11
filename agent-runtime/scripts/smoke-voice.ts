import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.AGENT_RUNTIME_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'awakening-voice-smoke-'));
process.env.OPENAI_API_KEY ||= 'sk-local-voice-smoke';
process.env.AGENT_RUNTIME_SESSION_BACKEND = 'local-memory';
process.env.VOICE_TEXT_LOOP_READY = 'false';
process.env.VOICE_APPROVAL_UI_READY = 'false';
process.env.VOICE_EXECUTION_RECEIPTS_READY = 'false';
process.env.VOICE_DELEGATION_E2E_READY = 'false';

const originalFetch = globalThis.fetch;
const openAiCalls: string[] = [];
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const target = String(url);
  if (target.includes('/audio/transcriptions')) {
    openAiCalls.push('transcription');
    assert.equal(init?.method, 'POST');
    assert.ok(init?.headers && String((init.headers as Record<string, string>).Authorization || '').startsWith('Bearer '));
    return Response.json({ text: 'voice smoke transcription' });
  }
  if (target.includes('/audio/speech')) {
    openAiCalls.push('speech');
    assert.equal(init?.method, 'POST');
    return new Response(Buffer.from('local preview audio'), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  }
  throw new Error(`Unexpected fetch in voice smoke: ${target}`);
}) as typeof fetch;

try {
  const service = await import('../src/voice/service.js');
  const { runtimeConfig } = await import('../src/config.js');
  const { getRuntimeContext } = await import('../src/memory/index.js');
  const { executeRegisteredTool } = await import('../src/tools/registry.js');

  const config = service.getVoiceRuntimeConfig();
  assert.equal(config.provider, 'openai');
  assert.equal(config.telephony.ready, false);
  assert.deepEqual(config.telephony.missing, ['textLoop', 'approvalUi', 'executionReceipts', 'delegationE2E']);

  const browserSession = await service.createInterfaceVoiceSession({ sessionId: 'voice-smoke-browser', speaker: 'user' });
  const transcription = await service.transcribeAudio({
    voiceSessionId: browserSession.id,
    audioBase64: Buffer.from('fake webm audio').toString('base64'),
    audioMimeType: 'audio/webm',
    respond: false,
  });
  assert.equal(transcription.status, 'completed');
  assert.equal(transcription.transcription.text, 'voice smoke transcription');

  const speech = await service.synthesizeSpeech({ voiceSession: browserSession, text: 'This is a local text-to-speech preview.', delivery: 'preview' });
  assert.equal(speech.status, 'completed');
  assert.equal(speech.provider, 'openai');
  assert.equal(speech.delivery, 'preview');
  assert.ok(speech.audioBase64);
  assert.deepEqual(openAiCalls, ['transcription', 'speech']);

  const inbound = await service.createInboundVoiceSession({ sessionId: 'voice-smoke-call', caller: '+15550001111', callee: '+15550002222' });
  assert.equal(inbound.channelKind, 'phone_call');
  assert.equal(inbound.approvalPolicy.mode, 'phone_call');
  assert.equal(inbound.approvalPolicy.allowHighRiskActions, false);
  assert.ok(inbound.approvalPolicy.lockedToolCategories?.includes('code'));

  const callContext = await getRuntimeContext(inbound.agentSessionId);
  callContext.channel = 'voice';
  callContext.voiceSessionId = inbound.id;
  callContext.voiceApproval = inbound.approvalPolicy;
  callContext.agent = 'nexora';
  const codeRead = await executeRegisteredTool('code.read', { path: 'package.json' }, callContext);
  assert.equal((codeRead as any).result.status, 'approval_required');
  assert.equal((codeRead as any).result.reason, 'voice_policy_locked_tool');

  const outboundNeedsApproval = await service.initiateOutboundCall({ to: '+15550003333' });
  assert.equal(outboundNeedsApproval.status, 'approval_required');

  const callbackNeedsApproval = await service.approveMissedCallCallback({ to: '+15550004444' });
  assert.equal(callbackNeedsApproval.status, 'approval_required');

  const gatedInbound = await service.createInboundTelephonyWebhook({ from: '+15550005555', to: '+15550006666', callSid: 'CA-smoke' });
  assert.equal(gatedInbound.status, 'not_ready');
  assert.ok(gatedInbound.twiml.includes('not enabled'));

  runtimeConfig.voiceTextLoopReady = true;
  runtimeConfig.voiceApprovalUiReady = true;
  runtimeConfig.voiceExecutionReceiptsReady = true;
  runtimeConfig.voiceDelegationE2EReady = true;
  const approvedButUnconfigured = await service.initiateOutboundCall({ to: '+15550007777', confirmedByUser: true, approvalNote: 'Local smoke approval.' });
  assert.equal(approvedButUnconfigured.status, 'not_configured');
  assert.equal(approvedButUnconfigured.voiceSession?.approvalPolicy.mode, 'phone_call');

  const meetingNeedsApproval = await service.createMeetingVoiceSession({ provider: 'zoom', title: 'Smoke Meeting' });
  assert.equal(meetingNeedsApproval.status, 'approval_required');

  console.log('voice smoke passed');
} finally {
  globalThis.fetch = originalFetch;
  await rm(process.env.AGENT_RUNTIME_DATA_DIR!, { recursive: true, force: true });
}
