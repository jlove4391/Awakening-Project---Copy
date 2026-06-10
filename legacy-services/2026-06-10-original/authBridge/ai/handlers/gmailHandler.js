// ai/handlers/gmailHandler.js
import { google } from 'googleapis';
import { getOAuth2Client } from '../../utils/googleClient.js';

const MODE = (process.env.INTEGRATIONS_MODE || 'live').toLowerCase();

export async function handleGmailTask(req, res) {
  const { action, data = {} } = req.body || {};
  try {
    if (MODE === 'mock') {
      switch (action) {
        case 'listMessages':
          return res.json({
            ok: true,
            mode: 'mock',
            messages: [
              { id: 'mock-msg-1', snippet: 'Mock message 1' },
              { id: 'mock-msg-2', snippet: 'Mock message 2' }
            ]
          });
        case 'sendEmail':
          return res.json({ ok: true, mode: 'mock', message: 'Email sent (mock).' });
        default:
          return res.status(400).json({ ok: false, mode: 'mock', error: `Unknown Gmail action: ${action}` });
      }
    }

    const auth = getOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });

    switch (action) {
      case 'listMessages': {
        const resp = await gmail.users.messages.list({
          userId: 'me',
          maxResults: data.maxResults ?? 5,
          q: data.query ?? '',
        });
        return res.json({ ok: true, mode: 'live', messages: resp.data.messages || [] });
      }

      case 'sendEmail': {
        const raw = Buffer.from(
          `To: ${data.to}\r\n` +
          `Subject: ${data.subject}\r\n` +
          `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
          `${data.body || ''}`
        ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw },
        });
        return res.json({ ok: true, mode: 'live', message: 'Email sent.' });
      }

      default:
        return res.status(400).json({ ok: false, mode: 'live', error: `Unknown Gmail action: ${action}` });
    }
  } catch (err) {
    const provider = err?.response?.data;
    console.error('Gmail task failed:', provider || err);
    const status = err?.response?.status || 500;
    res.status(status).json({ ok: false, mode: MODE, error: err.message, provider });
  }
}
