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
  if (!appDataDir) {
    appDataDir = path.join(process.cwd(), 'data');
  }
  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
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

  const dbType = config?.type || 'sqlite';

  let db: Knex;

  if (dbType === 'postgres') {
    db = knex({
      client: 'pg',
      connection: {
        host: config?.pgHost || '127.0.0.1',
        port: config?.pgPort || 5432,
        database: config?.pgDatabase || 'invoice_manager',
        user: config?.pgUser || 'postgres',
        password: config?.pgPassword || 'postgres',
      },
      pool: { min: 2, max: 20 },
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
          conn.run('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;', cb);
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
