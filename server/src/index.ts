import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { config } from './config';
import { AppError } from './lib/errors';
import { adminRouter } from './routes/admin';
import { healthRouter } from './routes/health';
import { webhookRouter } from './routes/webhook';
import { startScheduler } from './scheduler';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

app.use('/health', healthRouter);
app.use('/webhook', webhookRouter);
app.use('/api/admin', adminRouter);

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
    startScheduler();
  });
}

export { app };
