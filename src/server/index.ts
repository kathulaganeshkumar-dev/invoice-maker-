// src/server/index.ts - Standalone/Embedded Express Backend Service
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { initDatabase, getDatabase, closeDatabase, getDefaultDataDir } from './database/connection';
import { seedInitialData } from './database/seed';
import { createApiRouter } from './routes';
import { BackupRestoreService } from './services/backupRestoreService';
import { logger } from './services/logger';
import { serverEvents, NOTIFY_DATA_CHANGE } from './events';

let activeHttpServer: any = null;
let activeWatchInterval: NodeJS.Timeout | null = null;
let activeAutoBackupInterval: NodeJS.Timeout | null = null;
const sseClients = new Set<express.Response>();
const realtimeClients = new Set<express.Response>();

export async function stopServer(): Promise<void> {
  logger.info('[Server] Stopping embedded Express server...');
  if (activeWatchInterval) {
    clearInterval(activeWatchInterval);
    activeWatchInterval = null;
  }
  if (activeAutoBackupInterval) {
    clearInterval(activeAutoBackupInterval);
    activeAutoBackupInterval = null;
  }
  for (const client of sseClients) {
    try {
      client.end();
    } catch {
      // ignore
    }
  }
  sseClients.clear();
  for (const client of realtimeClients) {
    try {
      client.end();
    } catch {
      // ignore
    }
  }
  realtimeClients.clear();

  if (activeHttpServer) {
    await new Promise<void>((resolve) => {
      activeHttpServer.close(() => {
        resolve();
      });
      if (typeof activeHttpServer.closeAllConnections === 'function') {
        activeHttpServer.closeAllConnections();
      }
    });
    activeHttpServer = null;
    logger.info('[Server] HTTP listener closed cleanly.');
  }

  await closeDatabase();
  logger.info('[Server] Database pool closed.');
}

export { applySoftwareIconToDesktop } from './services/softwareIconService';

export async function startServer(port = 4200): Promise<express.Express> {
  const app = express();
  app.disable('x-powered-by');

  // Strict baseline HTTP security headers (compatible with local offline React + PDF viewer)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:* http://192.168.*:* ws://192.168.*:* http://10.*:* ws://10.*:* http://172.*:* ws://172.*:*",
        "object-src 'self' blob:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );
    next();
  });

  const extraAllowedOrigins = new Set(
    String(process.env.ALLOWED_CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const isPrivateOrLoopbackHostname = (hostname: string): boolean => {
    const h = hostname.toLowerCase();
    if (h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]') return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    const m172 = h.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
    if (m172) {
      const second = Number(m172[1]);
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  };

  // Restrict CORS strictly to loopback origins and same-host private LAN origins (no wildcard tunnels or file://)
  app.use(cors((req, callback) => {
    const origin = req.headers.origin;
    const baseOptions = {
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-EIM-Confirm-Reset',
        'X-EIM-Device-Id',
        'X-EIM-Device-Name',
        'X-EIM-Admin-Pin',
        'X-EIM-Staff-Name',
      ],
    };

    // Allow same-origin / non-browser requests with no Origin header (Electron main, local health probes)
    if (!origin) {
      return callback(null, { ...baseOptions, origin: true });
    }
    if (extraAllowedOrigins.has(origin)) {
      return callback(null, { ...baseOptions, origin: true });
    }
    try {
      const parsed = new URL(origin);
      const host = parsed.hostname;
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        (host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]')
      ) {
        return callback(null, { ...baseOptions, origin: true });
      }
      // Allow strictly same-host private LAN origin when serving Direct Desktop-to-Desktop LAN clients
      const reqHost = String(req.headers.host || '').toLowerCase();
      if (
        parsed.protocol === 'http:' &&
        reqHost &&
        parsed.host.toLowerCase() === reqHost &&
        isPrivateOrLoopbackHostname(host)
      ) {
        return callback(null, { ...baseOptions, origin: true });
      }
    } catch {
      // Invalid origin format
    }
    return callback(new Error('Cross-Origin Request Blocked by Security Policy'));
  }));

  // Return clean 403 JSON instead of HTML stack traces on blocked CORS origins
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && err.message === 'Cross-Origin Request Blocked by Security Policy') {
      return res.status(403).json({ error: err.message });
    }
    return next(err);
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Handle invalid JSON body syntax errors gracefully without crashing the server
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'Malformed JSON payload in request' });
    }
    return next(err);
  });

  // Initialize DB and Run Migrations
  logger.info('[Database] Initializing Knex and executing schema migrations...');
  const db = await initDatabase();
  await seedInitialData(db);
  logger.info('[Database] Ready and verified!');

  // Trigger automated rolling local backup and initialize background recurring check (every 30 mins)
  try {
    const backupRestoreService = new BackupRestoreService(db);
    backupRestoreService.runDailyRollingBackup().catch((err) => logger.warn('[Server] Daily rolling backup error:', err));

    if (activeAutoBackupInterval) {
      clearInterval(activeAutoBackupInterval);
    }
    activeAutoBackupInterval = setInterval(() => {
      backupRestoreService.runDailyRollingBackup().catch((err) => {
        logger.warn('[Server] Periodic auto-backup check warning:', err);
      });
    }, 30 * 60 * 1000);
  } catch (err) {
    logger.warn('[Server] Could not initialize daily rolling backup:', err);
  }

  // Mount API router
  app.use('/api', createApiRouter(db));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Local LAN & Tailscale network info for Direct Desktop-to-Desktop & Remote Worker setup
  app.get('/api/network-info', (_req, res) => {
    const lanIps: string[] = [];
    const tailscaleIps: string[] = [];
    try {
      for (const [ifaceName, entries] of Object.entries(os.networkInterfaces())) {
        if (!entries) continue;
        const isTailscaleOrVpn = /tailscale|vpn|wireguard|zerotier|wintun/i.test(ifaceName);
        for (const info of entries) {
          if (info.family === 'IPv4' && !info.internal && !info.address.startsWith('169.254.')) {
            if (isTailscaleOrVpn || info.address.startsWith('100.')) {
              tailscaleIps.push(info.address);
            } else {
              lanIps.push(info.address);
            }
          }
        }
      }
    } catch {
      // ignore
    }

    const uniqueTailscale = Array.from(new Set(tailscaleIps));
    const uniqueLan = Array.from(new Set(lanIps));
    const primaryTailscaleIp = uniqueTailscale.find((ip) => ip.startsWith('100.')) || uniqueTailscale[0] || null;

    res.json({
      localIps: primaryTailscaleIp ? [primaryTailscaleIp] : uniqueLan,
      tailscaleIp: primaryTailscaleIp,
      tailscaleIps: uniqueTailscale,
      lanIps: uniqueLan,
      serverHost: process.env.SERVER_HOST || '0.0.0.0',
      serverPort: Number(process.env.ACTUAL_SERVER_PORT || port),
    });
  });

  // Real-time server-sent events (SSE) stream for instant multi-user synchronization across LAN & Tailscale
  serverEvents.on(NOTIFY_DATA_CHANGE, (data) => {
    const payload = JSON.stringify({ type: 'data-changed', ...data });
    for (const client of realtimeClients) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch {
        realtimeClients.delete(client);
      }
    }
  });

  app.get('/api/realtime-sync', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

    realtimeClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        realtimeClients.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      realtimeClients.delete(res);
    });
  });

  // Serve static UI bundle if built
  const candidatePaths = [
    path.join(process.cwd(), 'dist'),
    path.resolve(__dirname, '../../dist'),
    path.resolve(__dirname, '../dist'),
    path.resolve(__dirname, '../../../dist'),
  ];
  const distPath =
    candidatePaths.find((p) => fs.existsSync(path.join(p, 'index.html')))
    || candidatePaths.find((p) => fs.existsSync(p))
    || path.join(process.cwd(), 'dist');

  logger.info(`[Server] Serving static UI from ${distPath}`);

  // Local auto-reload SSE stream for port 4200 development (100% offline/local)
  const serverBootId = String(Date.now());
  const indexHtmlPath = path.join(distPath, 'index.html');
  let lastIndexSignature = '';
  try {
    if (fs.existsSync(indexHtmlPath)) {
      lastIndexSignature = fs.readFileSync(indexHtmlPath, 'utf8');
    }
  } catch {
    // ignore
  }

  const ensureDistWatcher = () => {
    if (activeWatchInterval) return;
    activeWatchInterval = setInterval(() => {
      if (sseClients.size === 0) {
        if (activeWatchInterval) {
          clearInterval(activeWatchInterval);
          activeWatchInterval = null;
        }
        return;
      }
      try {
        if (!fs.existsSync(indexHtmlPath)) return;
        const currentContent = fs.readFileSync(indexHtmlPath, 'utf8');
        if (currentContent && currentContent !== lastIndexSignature) {
          lastIndexSignature = currentContent;
          for (const client of sseClients) {
            try {
              client.write('data: reload\n\n');
            } catch {
              sseClients.delete(client);
            }
          }
        }
      } catch {
        // file may be mid-write by vite build --watch; retry on next tick
      }
    }, 600);
  };

  app.get('/api/dev-reload', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`data: boot:${serverBootId}\n\n`);

    sseClients.add(res);
    ensureDistWatcher();

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  app.use(
    express.static(distPath, {
      setHeaders: (res, _filePath) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      },
    })
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    // Auto-forward browser users if this PC is configured as a Staff PC (LAN_CLIENT)
    if (req.query.local !== '1' && (req.hostname === '127.0.0.1' || req.hostname === 'localhost')) {
      try {
        const lanFile = path.join(getDefaultDataDir(), 'lan-config.json');
        if (fs.existsSync(lanFile)) {
          const cfg = JSON.parse(fs.readFileSync(lanFile, 'utf8'));
          if (cfg?.role === 'LAN_CLIENT' && cfg?.hostIp && cfg.hostIp.trim()) {
            const hostIp = cfg.hostIp.trim();
            const port = Number(cfg.port) || 4200;
            if (hostIp !== '127.0.0.1' && hostIp !== 'localhost') {
              const targetUrl = `http://${hostIp}:${port}${req.originalUrl || '/'}`;
              logger.info(`[Server] Auto-forwarding staff browser to Main Office Server: ${targetUrl}`);
              return res.redirect(targetUrl);
            }
          }
        }
      } catch {
        // ignore and serve index.html
      }
    }
    const indexFile = path.join(distPath, 'index.html');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(indexFile);
  });

  const host = process.env.SERVER_HOST || '0.0.0.0';

  return new Promise((resolve, reject) => {
    function tryListen(p: number, maxAttempts = 10) {
      const server = app.listen(p, host, () => {
        logger.info(`[Server] Enterprise Management Backend running on http://127.0.0.1:${p} (host: ${host})`);
        process.env.ACTUAL_SERVER_PORT = String(p);
        activeHttpServer = server;
        (app as any).httpServer = server;
        (app as any).stopServer = stopServer;
        resolve(app);
      });
      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && maxAttempts > 0) {
          logger.warn(`[Server] Port ${p} is in use, retrying on port ${p + 1}...`);
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
  process.on('uncaughtException', (err) => {
    console.error('[Fatal UncaughtException]:', err);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Fatal UnhandledRejection] at:', promise, 'reason:', reason);
  });
  const port = Number(process.env.PORT) || 4200;
  startServer(port).catch((err) => {
    console.error('Fatal Server Error:', err);
    process.exit(1);
  });
}
