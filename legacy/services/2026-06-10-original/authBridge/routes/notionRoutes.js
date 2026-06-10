// authBridge/routes/notionRoutes.js

import express from 'express';
import { handleNotionTask } from '../ai/handlers/notionHandler.js';

const router = express.Router();

router.post('/', handleNotionTask);

export default router;
