// authBridge/routes/driveRoutes.js

import express from 'express';
import { handleDriveTask } from '../ai/handlers/driveHandler.js';

const router = express.Router();

router.post('/', handleDriveTask);

export default router;
