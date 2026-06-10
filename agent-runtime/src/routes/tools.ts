import { Router } from 'express';
import { toolCategories, toolManifest } from '../tools/registry.js';

export const toolsRouter = Router();

toolsRouter.get('/', (_req, res) => {
  res.json({ categories: toolCategories, tools: toolManifest });
});
