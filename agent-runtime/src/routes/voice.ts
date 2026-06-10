import { Router } from 'express';
import {
  appendTranscript,
  createInboundVoiceSession,
  createInboundTelephonyWebhook,
  createInterfaceVoiceSession,
  createMeetingVoiceSession,
  getVoiceRuntimeConfig,
  getVoiceSession,
  initiateOutboundCall,
  approveMeetingSpeaking,
  ingestMeetingTranscript,
  updateMeetingAdapterStatus,
  approveMissedCallCallback,
  recordMissedCall,
  renderOutboundTelephonyTwiML,
  summarizeVoiceSession,
  synthesizeSpeech,
  transcribeAudio,
} from '../voice/service.js';

export const voiceRouter = Router();

voiceRouter.get('/config', (_req, res) => {
  res.json(getVoiceRuntimeConfig());
});

voiceRouter.post('/sessions', async (req, res, next) => {
  try {
    const voiceSession = await createInterfaceVoiceSession(req.body || {});
    res.status(201).json({ voiceSession });
  } catch (error) {
    next(error);
  }
});

voiceRouter.get('/sessions/:voiceSessionId', async (req, res, next) => {
  try {
    res.json({ voiceSession: await getVoiceSession(req.params.voiceSessionId) });
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/calls', async (req, res, next) => {
  try {
    if (!req.body?.to) {
      res.status(400).json({ error: 'to is required' });
      return;
    }
    const result = await initiateOutboundCall(req.body);
    res.status(result.status === 'approval_required' ? 202 : 201).json(result);
  } catch (error) {
    next(error);
  }
});


voiceRouter.post('/calls/missed', async (req, res, next) => {
  try {
    if (!req.body?.from) {
      res.status(400).json({ error: 'from is required' });
      return;
    }
    res.status(201).json(await recordMissedCall(req.body));
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/calls/missed/callback', async (req, res, next) => {
  try {
    if (!req.body?.to) {
      res.status(400).json({ error: 'to is required' });
      return;
    }
    const result = await approveMissedCallCallback(req.body);
    res.status(result.status === 'approval_required' ? 202 : 201).json(result);
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/telephony/inbound', async (req, res, next) => {
  try {
    const result = await createInboundTelephonyWebhook({
      provider: 'twilio',
      from: req.body?.From || req.body?.from,
      to: req.body?.To || req.body?.to,
      callSid: req.body?.CallSid || req.body?.callSid,
      accountSid: req.body?.AccountSid || req.body?.accountSid,
    });
    res.type('text/xml').status(200).send(result.twiml);
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/telephony/inbound/json', async (req, res, next) => {
  try {
    const result = await createInboundTelephonyWebhook({
      provider: req.body?.provider || 'generic',
      from: req.body?.from,
      to: req.body?.to,
      callSid: req.body?.callSid,
      accountSid: req.body?.accountSid,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/telephony/missed', async (req, res, next) => {
  try {
    const from = req.body?.From || req.body?.from;
    if (!from) {
      res.status(400).json({ error: 'From/from is required' });
      return;
    }
    res.status(201).json(
      await recordMissedCall({
        from,
        to: req.body?.To || req.body?.to,
        callSid: req.body?.CallSid || req.body?.callSid,
        voicemailText: req.body?.TranscriptionText || req.body?.voicemailText,
      }),
    );
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/telephony/outbound-answer', async (req, res, next) => {
  try {
    const voiceSessionId = String(req.query.voiceSessionId || req.body?.voiceSessionId || '');
    if (!voiceSessionId) {
      res.status(400).type('text/xml').send('<Response><Say>Missing voice session.</Say></Response>');
      return;
    }
    const voiceSession = await getVoiceSession(voiceSessionId);
    res.type('text/xml').status(200).send(renderOutboundTelephonyTwiML(voiceSession));
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/calls/inbound', async (req, res, next) => {
  try {
    const voiceSession = await createInboundVoiceSession(req.body || {});
    res.status(201).json({ voiceSession });
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/meetings', async (req, res, next) => {
  try {
    if (!req.body?.provider) {
      res.status(400).json({ error: 'provider is required' });
      return;
    }
    const result = await createMeetingVoiceSession(req.body);
    res.status(result.status === 'approval_required' ? 202 : 201).json(result);
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/meetings/:voiceSessionId/transcript', async (req, res, next) => {
  try {
    res.json(
      await ingestMeetingTranscript({
        ...req.body,
        voiceSessionId: req.params.voiceSessionId,
      }),
    );
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/meetings/:voiceSessionId/speaking-consent', async (req, res, next) => {
  try {
    const result = await approveMeetingSpeaking({
      voiceSessionId: req.params.voiceSessionId,
      confirmedByUser: req.body?.confirmedByUser,
      approvalNote: req.body?.approvalNote,
      approvedBy: req.body?.approvedBy,
    });
    res.status(result.status === 'approval_required' ? 202 : 200).json(result);
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/meetings/:voiceSessionId/adapter-status', async (req, res, next) => {
  try {
    res.json(
      await updateMeetingAdapterStatus({
        voiceSessionId: req.params.voiceSessionId,
        status: req.body?.status,
        message: req.body?.message,
        externalMeetingId: req.body?.externalMeetingId,
      }),
    );
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/transcriptions', async (req, res, next) => {
  try {
    if (!req.body?.voiceSessionId) {
      res.status(400).json({ error: 'voiceSessionId is required' });
      return;
    }
    res.json(await transcribeAudio(req.body));
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/speech', async (req, res, next) => {
  try {
    if (!req.body?.text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }
    const voiceSession = req.body.voiceSessionId ? await getVoiceSession(req.body.voiceSessionId) : undefined;
    res.json(await synthesizeSpeech({ voiceSession, text: req.body.text, voice: req.body.voice, delivery: req.body.delivery, responseFormat: req.body.responseFormat }));
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/sessions/:voiceSessionId/transcript', async (req, res, next) => {
  try {
    const { role, text, audioId, speaker } = req.body || {};
    if (!role || !text) {
      res.status(400).json({ error: 'role and text are required' });
      return;
    }
    const { record, transcriptEntry } = await appendTranscript(req.params.voiceSessionId, { role, text, audioId, speaker });
    res.status(201).json({ voiceSession: record, transcriptEntry });
  } catch (error) {
    next(error);
  }
});

voiceRouter.post('/sessions/:voiceSessionId/summary', async (req, res, next) => {
  try {
    res.json(await summarizeVoiceSession(req.params.voiceSessionId, Boolean(req.body?.extractMemory)));
  } catch (error) {
    next(error);
  }
});
