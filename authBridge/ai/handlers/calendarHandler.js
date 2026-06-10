// ai/handlers/calendarHandler.js
import { google } from 'googleapis';
import { getOAuth2Client } from '../../utils/googleClient.js';

const MODE = (process.env.INTEGRATIONS_MODE || 'live').toLowerCase();

/**
 * GET /api/ai/calendar/events?maxResults=10&timeMin=ISO...
 */
export async function fetchCalendarEvents(req, res) {
  try {
    const maxResults = Number(req.query.maxResults ?? 10);
    const timeMin = req.query.timeMin || new Date().toISOString();

    if (MODE === 'mock') {
      return res.json({
        ok: true,
        mode: 'mock',
        events: [
          { id: 'mock-cal-1', summary: 'Mock Standup', start: { dateTime: new Date().toISOString() } },
          { id: 'mock-cal-2', summary: 'Mock Review', start: { dateTime: new Date(Date.now() + 3600000).toISOString() } }
        ]
      });
    }

    const auth = getOAuth2Client();
    const calendar = google.calendar({ version: 'v3', auth });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.json({ ok: true, mode: 'live', events: response.data.items || [] });
  } catch (err) {
    const provider = err?.response?.data;
    console.error('Calendar handler error:', provider || err);
    const status = err?.response?.status || 500;
    res.status(status).json({ ok: false, mode: MODE, error: err.message, provider });
  }
}
