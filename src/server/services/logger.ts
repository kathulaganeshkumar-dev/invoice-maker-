// src/server/services/logger.ts - Structured Rotating Local File Logger
import fs from 'fs';
import path from 'path';
import { getDefaultDataDir } from '../database/connection';

const MAX_LOG_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per file
const MAX_LOG_DAYS = 7; // Keep last 7 days

export function getLogsDir(): string {
  const dataDir = getDefaultDataDir();
  const logsDir = path.join(dataDir, 'logs');
  if (!fs.existsSync(logsDir)) {
    try {
      fs.mkdirSync(logsDir, { recursive: true });
    } catch {
      // ignore
    }
  }
  return logsDir;
}

function getLogDateString(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

function pruneOldLogs(logsDir: string): void {
  try {
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const maxAgeMs = MAX_LOG_DAYS * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      const filePath = path.join(logsDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

export class AppLogger {
  private category: string;

  constructor(category: string = 'server') {
    this.category = category;
  }

  private write(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? (meta instanceof Error ? `\n${meta.stack || meta.message}` : ` ${JSON.stringify(meta)}`) : '';
    const logLine = `[${timestamp}] [${level}] [${this.category}] ${message}${metaStr}\n`;

    // Console output
    if (level === 'ERROR') {
      console.error(logLine.trim());
    } else if (level === 'WARN') {
      console.warn(logLine.trim());
    } else {
      console.log(logLine.trim());
    }

    // Rotating file output
    try {
      const logsDir = getLogsDir();
      pruneOldLogs(logsDir);

      const baseName = `${this.category}-${getLogDateString()}.log`;
      let logPath = path.join(logsDir, baseName);

      // Check size rotation
      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        if (stats.size >= MAX_LOG_FILE_SIZE) {
          const rotatedName = `${this.category}-${getLogDateString()}-${Date.now().toString(36)}.log`;
          logPath = path.join(logsDir, rotatedName);
        }
      }

      fs.appendFileSync(logPath, logLine, 'utf8');
    } catch {
      // Inability to write log file must never crash the application
    }
  }

  info(msg: string, meta?: any): void {
    this.write('INFO', msg, meta);
  }

  warn(msg: string, meta?: any): void {
    this.write('WARN', msg, meta);
  }

  error(msg: string, meta?: any): void {
    this.write('ERROR', msg, meta);
  }

  debug(msg: string, meta?: any): void {
    this.write('DEBUG', msg, meta);
  }
}

export const logger = new AppLogger('server');
