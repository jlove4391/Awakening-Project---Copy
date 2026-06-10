// authBridge/calendar.js
const express = require('express');
const { google } = require('googleapis');

const router = express.Router();

router.get('/events', async (req, res) => {
  try {
    const accessToken = req.headers.authorization?.split('Bearer ')[1];
    if (!accessToken) return res.status(401).json({ error: 'Missing access token' });

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.json({ events: result.data.items || [] });
  } catch (err) {
    console.error('Calendar error:', err);
    res.status(500).json({ error: 'Failed to fetch calendar events.' });
  }
});

module.exports = router;
