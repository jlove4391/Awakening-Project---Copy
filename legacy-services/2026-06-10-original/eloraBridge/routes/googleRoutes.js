// eloraBridge/routes/googleRoutes.js

import express from 'express';
import multer from 'multer';
import { google } from 'googleapis';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Auth helper
function getAuthClient(accessToken) {
  return new google.auth.OAuth2().setCredentials({ access_token: accessToken });
}

// 📅 Calendar: Get upcoming events
router.get('/calendar/upcoming', async (req, res) => {
  try {
    const auth = getAuthClient(req.headers.authorization?.split(' ')[1]);
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime'
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch calendar events', details: err.message });
  }
});

// 📧 Gmail: Send email
router.post('/gmail/send', async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    const accessToken = req.headers.authorization?.split(' ')[1];
    const auth = getAuthClient(accessToken);
    const gmail = google.gmail({ version: 'v1', auth });

    const raw = Buffer.from(
      `To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
      }
    });

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send email', details: err.message });
  }
});

// 📂 Drive: Upload file
router.post('/drive/upload', upload.single('file'), async (req, res) => {
  try {
    const accessToken = req.headers.authorization?.split(' ')[1];
    const auth = getAuthClient(accessToken);
    const drive = google.drive({ version: 'v3', auth });

    const fileMetadata = {
      name: req.file.originalname,
    };

    const media = {
      mimeType: req.file.mimetype,
      body: Buffer.from(req.file.buffer),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink',
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Drive upload failed', details: err.message });
  }
});

// 📊 Sheets: Append row
router.post('/sheets/append', async (req, res) => {
  try {
    const { spreadsheetId, range, values } = req.body;
    const accessToken = req.headers.authorization?.split(' ')[1];
    const auth = getAuthClient(accessToken);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [values]
      }
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to append to sheet', details: err.message });
  }
});

export default router;
