// api/index.ts - Vercel Serverless Entrypoint for Enterprise Invoice Manager API
import express from 'express';
import cors from 'cors';
import { initDatabase } from '../src/server/database/connection';
import { seedInitialData } from '../src/server/database/seed';
import { createApiRouter } from '../src/server/routes';

let appPromise: Promise<express.Express> | null = null;

async function createApp(): Promise<express.Express> {
  const app = express();

  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize DB and Run Migrations
  const db = await initDatabase();
  await seedInitialData(db);

  const apiRouter = createApiRouter(db);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', serverless: true, timestamp: new Date().toISOString() });
  });
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', serverless: true, timestamp: new Date().toISOString() });
  });

  // Mount at both /api and / to handle both direct and rewritten paths
  app.use('/api', apiRouter);
  app.use('/', apiRouter);

  return app;
}

export default async function handler(req: any, res: any) {
  if (!appPromise) {
    appPromise = createApp().catch((err) => {
      // Clear promise on failure so next request can retry
      appPromise = null;
      throw err;
    });
  }

  try {
    const app = await appPromise;
    return app(req, res);
  } catch (err: any) {
    console.error('[Vercel Serverless API Error]:', err);
    res.status(500).json({
      error: 'Backend initialization failed: ' + (err?.message || String(err)),
    });
  }
}
