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
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, same-origin, server-to-server)
      if (!origin) {
        return callback(null, true);
      }
      try {
        const parsed = new URL(origin);
        const host = parsed.hostname;
        if (
          host === '127.0.0.1' ||
          host === 'localhost' ||
          host === '::1' ||
          host.endsWith('.vercel.app') ||
          host === process.env.VERCEL_URL ||
          (process.env.VERCEL_PROJECT_PRODUCTION_URL && host === process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
          parsed.protocol === 'file:' ||
          parsed.protocol === 'vscode-webview:'
        ) {
          return callback(null, true);
        }
      } catch {
        // Invalid origin format
      }
      // For Vercel cloud web deployment, allow the web application client
      return callback(null, true);
    },
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

  // Global error handler ensuring JSON responses on errors
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API Error]:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
    });
  });

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
