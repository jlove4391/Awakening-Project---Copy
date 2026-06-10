import { Router } from 'express';
import { toolManifest } from '../tools/registry.js';

export const toolsRouter = Router();

toolsRouter.get('/', (_req, res) => {
  res.json({ tools: toolManifest });
});
