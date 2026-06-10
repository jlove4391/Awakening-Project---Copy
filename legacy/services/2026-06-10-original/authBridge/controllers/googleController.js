// authBridge/controllers/googleController.js
import { google } from 'googleapis';
import { getOAuth2Client } from '../utils/googleClient.js';

const MODE = (process.env.INTEGRATIONS_MODE || 'live').toLowerCase();

export async function getCalendarEvents(_req, res) {
  try {
    if (MODE === 'mock') {
      return res.json({
        ok: true,
        mode: 'mock',
        events: [
          { id: 'mock1', summary: 'Mock Event A', start: { dateTime: new Date().toISOString() } },
          { id: 'mock2', summary: 'Mock Event B', start: { dateTime: new Date(Date.now() + 3600000).toISOString() } }
        ]
      });
    }
    const auth = getOAuth2Client();
    const calendar = google.calendar({ version: 'v3', auth });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });
    res.json({ ok: true, mode: 'live', events: response.data.items });
  } catch (err) {
    console.error('Calendar fetch error:', err?.response?.data || err);
    const status = err?.response?.status || 500;
    res.status(status).json({ ok: false, error: err.message });
  }
}

export async function createCalendarEvent(req, res) {
  try {
    const { summary = 'Vireon Test', start, end } = req.body || {};
    if (MODE === 'mock') {
      return res.json({ ok: true, mode: 'mock', created: { id: 'mock-created', summary, start, end } });
    }
    const auth = getOAuth2Client();
    const calendar = google.calendar({ version: 'v3', auth });
    const evt = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        start: start ? { dateTime: start } : { dateTime: new Date(Date.now() + 3600000).toISOString() },
        end: end ? { dateTime: end } : { dateTime: new Date(Date.now() + 7200000).toISOString() }
      }
    });
    res.json({ ok: true, mode: 'live', created: evt.data });
  } catch (err) {
    console.error('Calendar create error:', err?.response?.data || err);
    const status = err?.response?.status || 500;
    res.status(status).json({ ok: false, error: err.message });
  }
}
