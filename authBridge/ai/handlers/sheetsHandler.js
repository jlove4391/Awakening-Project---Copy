// ai/handlers/sheetsHandler.js
import { google } from 'googleapis';
import { getOAuth2Client } from '../../utils/googleClient.js';

const MODE = (process.env.INTEGRATIONS_MODE || 'live').toLowerCase();

export async function handleSheetsTask(req, res) {
  const { action, data = {} } = req.body || {};
  try {
    if (MODE === 'mock') {
      switch (action) {
        case 'readSheet':
          return res.json({ ok: true, mode: 'mock', values: [['A1','B1'], ['A2','B2']] });
        case 'appendRow':
          return res.json({ ok: true, mode: 'mock', update: { updatedRange: data.range, updatedRows: 1 } });
        default:
          return res.status(400).json({ ok: false, mode: 'mock', error: `Unknown Sheets action: ${action}` });
      }
    }

    const auth = getOAuth2Client();
    const sheets = google.sheets({ version: 'v4', auth });

    switch (action) {
      case 'readSheet': {
        const readRes = await sheets.spreadsheets.values.get({
          spreadsheetId: data.spreadsheetId,
          range: data.range,
        });
        return res.json({ ok: true, mode: 'live', values: readRes.data.values || [] });
      }

      case 'appendRow': {
        const appendRes = await sheets.spreadsheets.values.append({
          spreadsheetId: data.spreadsheetsId || data.spreadsheetId, // tolerate typo
          range: data.range,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [data.row || []] },
        });
        return res.json({ ok: true, mode: 'live', update: appendRes.data.updates });
      }

      default:
        return res.status(400).json({ ok: false, mode: 'live', error: `Unknown Sheets action: ${action}` });
    }
  } catch (err) {
    const provider = err?.response?.data;
    console.error('Sheets task failed:', provider || err);
    const status = err?.response?.status || 500;
    res.status(status).json({ ok: false, mode: MODE, error: err.message, provider });
  }
}
