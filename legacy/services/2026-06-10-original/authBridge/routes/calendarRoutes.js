// authBridge/routes/calendarRoutes.js

import express from 'express';
import { fetchCalendarEvents } from '../ai/handlers/calendarHandler.js';

const router = express.Router();

router.get('/', fetchCalendarEvents);

export default router;
