import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ ok: true, service: 'v3-auto', ts: new Date().toISOString() });
});
