// src/server/database/connection.ts - Multi-mode Knex connection manager
import knex, { Knex } from 'knex';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrations';

let cachedDb: Knex | null = null;

export interface DbConfig {
  type: 'sqlite' | 'postgres';
  sqlitePath?: string;
  pgHost?: string;
  pgPort?: number;
  pgDatabase?: string;
  pgUser?: string;
  pgPassword?: string;
}

export function getDefaultDataDir(): string {
  // Store database inside user data directory or workspace for portability and sandbox safety
  let appDataDir = process.env.APP_DATA_DIR;
  if (!appDataDir) {
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      appDataDir = path.join('/tmp', 'data');
    } else {
      try {
        // In electron environment, use safe app userData
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
          appDataDir = path.join(app.getPath('userData'), 'data');
        }
      } catch {
        // Not running in Electron process
      }
    }
  }
  if (!appDataDir) {
    appDataDir = path.join(process.cwd(), 'data');
  }
  try {
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
    }
  } catch {
    // Fallback to /tmp if current directory is read-only (e.g. serverless runtime)
    appDataDir = path.join('/tmp', 'data');
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
    }
  }
  return appDataDir;
}

export function getDefaultSqlitePath(): string {
  return path.join(getDefaultDataDir(), 'invoice_manager.sqlite3');
}

export async function initDatabase(config?: DbConfig): Promise<Knex> {
  if (cachedDb) {
    return cachedDb;
  }

  // Auto-detect PostgreSQL if DATABASE_URL, POSTGRES_URL, or PGHOST environment variable is present
  const hasPgEnv = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PGHOST);
  const dbType = config?.type || (hasPgEnv ? 'postgres' : 'sqlite');

  let db: Knex;

  if (dbType === 'postgres') {
    const connString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
    db = knex({
      client: 'pg',
      connection: connString
        ? {
            connectionString: connString,
            ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized },
          }
        : {
            host: config?.pgHost || process.env.PGHOST || '127.0.0.1',
            port: Number(config?.pgPort || process.env.PGPORT) || 5432,
            database: config?.pgDatabase || process.env.PGDATABASE || 'invoice_manager',
            user: config?.pgUser || process.env.PGUSER || 'postgres',
            password: config?.pgPassword || process.env.PGPASSWORD || 'postgres',
            ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized } : false,
          },
      pool: { min: 0, max: 10 },
    });
  } else {
    const sqlitePath = config?.sqlitePath || getDefaultSqlitePath();
    const dir = path.dirname(sqlitePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = knex({
      client: 'sqlite3',
      connection: {
        filename: sqlitePath,
      },
      useNullAsDefault: true,
      pool: {
        min: 1,
        max: 1,
        afterCreate: (conn: any, cb: any) => {
          conn.run(
            'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;',
            cb
          );
        },
      },
    });
  }

  // Run schema migrations automatically on startup
  await runMigrations(db);

  cachedDb = db;
  return db;
}

export function getDatabase(): Knex {
  if (!cachedDb) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return cachedDb;
}

export async function closeDatabase(): Promise<void> {
  if (cachedDb) {
    await cachedDb.destroy();
    cachedDb = null;
  }
}
