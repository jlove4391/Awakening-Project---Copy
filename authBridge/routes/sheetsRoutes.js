// authBridge/routes/sheetsRoutes.js

import express from 'express';
import { handleSheetsTask } from '../ai/handlers/sheetsHandler.js';

const router = express.Router();

router.post('/', handleSheetsTask);

export default router;
