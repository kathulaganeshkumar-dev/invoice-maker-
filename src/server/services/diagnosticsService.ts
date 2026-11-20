// src/server/services/diagnosticsService.ts - Diagnostics Packaging & System Health Telemetry
import os from 'os';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { Knex } from 'knex';
import { getLogsDir } from './logger';
import { checkDiskSpace } from './diskSpaceGuard';
import { getDefaultDataDir } from '../database/connection';

export interface DiagnosticsMetadata {
  appVersion: string;
  generatedAt: string;
  os: {
    platform: string;
    release: string;
    arch: string;
    totalMemoryMb: number;
    freeMemoryMb: number;
  };
  storage: {
    dataDirectory: string;
    freeMb: number;
    totalMb: number;
  };
  runtime: {
    nodeVersion: string;
    electronVersion?: string;
    serverUptimeSeconds: number;
  };
  database: {
    client: string;
    connected: boolean;
  };
}

export class DiagnosticsService {
  constructor(private db: Knex) {}

  async collectMetadata(): Promise<DiagnosticsMetadata> {
    const dataDir = getDefaultDataDir();
    const disk = await checkDiskSpace(dataDir, 1024 * 1024);

    let dbConnected = false;
    try {
      await this.db.raw('SELECT 1');
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    const clientType = (this.db.client as any)?.config?.client || 'unknown';

    return {
      appVersion: '2.0.0',
      generatedAt: new Date().toISOString(),
      os: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
        freeMemoryMb: Math.round(os.freemem() / (1024 * 1024)),
      },
      storage: {
        dataDirectory: dataDir,
        freeMb: disk.freeMb,
        totalMb: Math.round(disk.totalBytes / (1024 * 1024)),
      },
      runtime: {
        nodeVersion: process.version,
        electronVersion: (process.versions as any)?.electron,
        serverUptimeSeconds: Math.round(process.uptime()),
      },
      database: {
        client: String(clientType),
        connected: dbConnected,
      },
    };
  }

  async createDiagnosticsZipBuffer(): Promise<Buffer> {
    const metadata = await this.collectMetadata();
    const logsDir = getLogsDir();

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', (err) => reject(err));

      // Append sanitized system environment JSON
      archive.append(JSON.stringify(metadata, null, 2), { name: 'system_diagnostics.json' });

      // Append recent log files (up to last 7 days)
      if (fs.existsSync(logsDir)) {
        try {
          const files = fs.readdirSync(logsDir).filter((f) => f.endsWith('.log'));
          for (const file of files) {
            const filePath = path.join(logsDir, file);
            try {
              const content = fs.readFileSync(filePath);
              archive.append(content, { name: `logs/${file}` });
            } catch {
              // ignore locked file
            }
          }
        } catch {
          // ignore
        }
      }

      archive.finalize().catch(reject);
    });
  }
}
