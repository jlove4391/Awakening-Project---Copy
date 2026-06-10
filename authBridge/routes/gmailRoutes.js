// authBridge/routes/gmailRoutes.js

import express from 'express';
import { handleGmailTask } from '../ai/handlers/gmailHandler.js';

const router = express.Router();

router.post('/', handleGmailTask);

export default router;
