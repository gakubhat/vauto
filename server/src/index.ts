import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config';
import { AppError } from './lib/errors';
import { adminRouter } from './routes/admin';
import { healthRouter } from './routes/health';
import { webhookRouter } from './routes/webhook';
import { startScheduler } from './scheduler';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
// `verify` keeps the raw bytes: X-Hub-Signature-256 is an HMAC over the exact
// body Meta sent, so re-serialising the parsed JSON would not match.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

app.use('/health', healthRouter);
app.use('/webhook', webhookRouter);
app.use('/api/admin', adminRouter);

// ── Admin UI ───────────────────────────────────────────────────────────
//
// The built React app is copied here by `npm run build:all` (see scripts/).
// Served from the same origin as the API so the browser's relative `/api/admin`
// calls need no CORS and no second host.
//
// Ordered after the API mounts on purpose: a mistyped /api path must return
// JSON from the error handler, not index.html.
const adminDist = path.resolve(__dirname, '..', 'public');

if (fs.existsSync(path.join(adminDist, 'index.html'))) {
  app.use(express.static(adminDist));
  // SPA fallback. The dashboard has deep links (/recover/:phone, /trips/:id)
  // which 404 on reload without this.
  app.get(/^\/(?!api\/|webhook|health).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(adminDist, 'index.html'));
  });
} else {
  console.warn(
    `[ADMIN UI] no build at ${adminDist} - run "npm run build:all" to serve the dashboard`,
  );
}

// Anything under /api that no route matched is a JSON 404. Without this the
// default handler returns HTML, which is confusing now that the same server
// also serves the dashboard.
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`v3-auto server listening on port ${config.port}`);
    if (config.schedulerEnabled) {
      startScheduler();
    } else {
      console.warn(
        '[SCHEDULER] disabled (SCHEDULER_ENABLED=false) - run exactly one instance with it on',
      );
    }
  });
}

export { app };
