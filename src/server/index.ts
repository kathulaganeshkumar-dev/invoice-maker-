// src/server/index.ts - Standalone/Embedded Express Backend Service
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initDatabase, getDatabase } from './database/connection';
import { seedInitialData } from './database/seed';
import { createApiRouter } from './routes';

export async function startServer(port = 4200): Promise<express.Express> {
  const app = express();

  // Restrict CORS to local origins and desktop application clients
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (desktop shell, file://, local curl, IPC)
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
          parsed.protocol === 'file:'
        ) {
          return callback(null, true);
        }
      } catch {
        // Invalid origin format
      }
      return callback(new Error('Cross-Origin Request Blocked by Security Policy'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize DB and Run Migrations
  console.log('[Database] Initializing Knex and executing schema migrations...');
  const db = await initDatabase({ type: 'sqlite' });
  await seedInitialData(db);
  console.log('[Database] Ready and verified!');

  // Mount API router
  app.use('/api', createApiRouter(db));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Serve static UI bundle if built
  const candidatePaths = [
    path.resolve(__dirname, '../../../dist'),
    path.resolve(__dirname, '../../dist'),
    path.resolve(__dirname, '../dist'),
    path.join(process.cwd(), 'dist'),
  ];
  const distPath = candidatePaths.find((p) => fs.existsSync(path.join(p, 'index.html'))) || candidatePaths[0];

  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    const indexFile = path.join(distPath, 'index.html');
    res.sendFile(indexFile);
  });

  const host = process.env.SERVER_HOST || '127.0.0.1';

  return new Promise((resolve, reject) => {
    function tryListen(p: number, maxAttempts = 10) {
      const server = app.listen(p, host, () => {
        console.log(`[Server] Enterprise Invoice Backend running on http://${host}:${p}`);
        process.env.ACTUAL_SERVER_PORT = String(p);
        resolve(app);
      });
      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && maxAttempts > 0) {
          console.warn(`[Server] Port ${p} is in use, retrying on port ${p + 1}...`);
          tryListen(p + 1, maxAttempts - 1);
        } else {
          reject(err);
        }
      });
    }
    tryListen(port);
  });
}

// Auto-start if executed directly via CLI
if (require.main === module) {
  const port = Number(process.env.PORT) || 4200;
  startServer(port).catch((err) => {
    console.error('Fatal Server Error:', err);
    process.exit(1);
  });
}
