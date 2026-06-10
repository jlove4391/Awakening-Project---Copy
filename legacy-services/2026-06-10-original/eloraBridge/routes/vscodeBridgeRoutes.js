import express from 'express';
import { handleVSCodeCommand } from '../controllers/vscodeController.js'; // add `.js` extension!

const router = express.Router();

// POST /api/bridge/command
router.post('/command', handleVSCodeCommand);

export default router;
