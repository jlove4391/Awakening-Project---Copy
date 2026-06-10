// authBridge/ai/router.js
import express from 'express';
import { handleGmailTask } from './handlers/gmailHandler.js';
import { handleDriveTask } from './handlers/driveHandler.js';
import { fetchCalendarEvents } from './handlers/calendarHandler.js';
import { handleSheetsTask } from './handlers/sheetsHandler.js';
import { handleNotionTask } from './handlers/notionHandler.js';
import vscodeHandler from './handlers/vscodeHandler.js';

const router = express.Router();

router.post('/gmail', handleGmailTask);
router.post('/drive', handleDriveTask);
router.get('/calendar/events', fetchCalendarEvents); // GET + query
router.post('/sheets', handleSheetsTask);
router.post('/notion', handleNotionTask);
router.post('/vscode', vscodeHandler);

router.post('/', (_req, res) =>
  res.json({ success: false, message: 'Use /gmail, /drive, /calendar/events, /sheets, /notion, /vscode.' })
);

export default router;
