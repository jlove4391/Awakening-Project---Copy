// authBridge/routes/googleRoutes.js
import express from 'express';
import { getCalendarEvents, createCalendarEvent } from '../controllers/googleController.js';

const router = express.Router();
router.get('/calendar/events', getCalendarEvents);
router.post('/calendar/create', createCalendarEvent);

export default router;
