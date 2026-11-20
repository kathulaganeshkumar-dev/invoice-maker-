// src/server/database/connection.ts - Multi-mode Knex connection manager with WAL durability, Postgres resilience & safe migrations
import knex, { Knex } from 'knex';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrations';
import { assertDiskSpace } from '../services/diskSpaceGuard';

let cachedDb: Knex | null = null;
let activeDbConfig: DbConfig | null = null;

export interface DbConfig {
  type: 'sqlite' | 'postgres' | 'auto';
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

  // Ensure fallback is never inside read-only Program Files
  if (!appDataDir) {
    const isProgramFiles =
      process.cwd().toLowerCase().includes('program files') ||
      process.cwd().toLowerCase().includes('windows');

    if (isProgramFiles) {
      const appData = process.env.APPDATA || process.env.HOME || path.join(process.cwd(), '..');
      appDataDir = path.join(appData, 'enterprise-invoice-manager', 'data');
    } else {
      appDataDir = path.join(process.cwd(), 'data');
    }
  }

  try {
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
    }
  } catch {
    // Fallback to /tmp if current directory is read-only
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

export function getDbConfigFilePath(): string {
  return path.join(getDefaultDataDir(), 'db-config.json');
}

export function getSavedLanRole(): string | null {
  try {
    const lanConfigPath = path.join(getDefaultDataDir(), 'lan-config.json');
    if (fs.existsSync(lanConfigPath)) {
      const parsed = JSON.parse(fs.readFileSync(lanConfigPath, 'utf8'));
      if (parsed && parsed.role) {
        return String(parsed.role).toUpperCase();
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function loadSavedDbConfig(): DbConfig | null {
  try {
    const filePath = getDbConfigFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.type === 'sqlite' || parsed.type === 'postgres' || parsed.type === 'auto')) {
        return parsed as DbConfig;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveDbConfig(config: DbConfig): void {
  try {
    const filePath = getDbConfigFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Database] Could not save db-config.json:', err);
  }
}

/**
 * Creates an automated pre-migration safety copy of the SQLite database
 */
async function createPreMigrationBackup(sqlitePath: string): Promise<void> {
  try {
    if (fs.existsSync(sqlitePath)) {
      const stats = fs.statSync(sqlitePath);
      if (stats.size > 0) {
        const backupDir = path.join(getDefaultDataDir(), 'backups');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        await assertDiskSpace(backupDir, 10 * 1024 * 1024);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `pre_migration_${timestamp}.sqlite3`);
        fs.copyFileSync(sqlitePath, backupPath);
        console.log(`[Database] Pre-migration snapshot saved: ${backupPath}`);
      }
    }
  } catch (err) {
    console.warn('[Database] Pre-migration backup warning:', err);
  }
}

/**
 * Internal helper to initialize SQLite with WAL durability and auto migrations
 */
async function initSqliteDatabase(customPath?: string): Promise<Knex> {
  const sqlitePath = customPath || getDefaultSqlitePath();
  const dir = path.dirname(sqlitePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Pre-migration backup before touching SQLite database
  await createPreMigrationBackup(sqlitePath);

  const db = knex({
    client: 'sqlite3',
    connection: {
      filename: sqlitePath,
    },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      afterCreate: (conn: any, cb: any) => {
        conn.exec(
          'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;',
          cb
        );
      },
    },
  });

  await runMigrations(db);
  cachedDb = db;
  activeDbConfig = { type: 'sqlite', sqlitePath };
  saveDbConfig({ type: 'sqlite', sqlitePath });
  console.log(`[Database] Automatically initialized SQLite WAL Mode at: ${sqlitePath}`);
  return db;
}

export async function initDatabase(config?: DbConfig): Promise<Knex> {
  if (cachedDb) {
    return cachedDb;
  }

  // Automatic Decision Engine:
  // 1. Explicit configuration if supplied
  // 2. Standalone / Staff role in lan-config.json -> Always SQLite WAL (Zero configuration, 100% offline)
  // 3. Saved config if present
  // 4. PostgreSQL environment variables (DATABASE_URL / POSTGRES_URL / PGHOST)
  // 5. Default: Standalone SQLite WAL
  const lanRole = getSavedLanRole();
  const savedConfig = loadSavedDbConfig();
  const hasPgEnv = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PGHOST);

  let targetType: 'sqlite' | 'postgres' | 'auto';
  if (config?.type) {
    targetType = config.type;
  } else if (lanRole === 'STANDALONE' || lanRole === 'LAN_CLIENT') {
    targetType = 'sqlite';
  } else if (savedConfig?.type) {
    targetType = savedConfig.type;
  } else if (hasPgEnv || lanRole === 'LAN_HOST') {
    targetType = hasPgEnv ? 'postgres' : 'auto';
  } else {
    targetType = 'sqlite';
  }

  const effectiveConfig: DbConfig = config || savedConfig || { type: targetType };

  if (targetType === 'postgres' || targetType === 'auto') {
    const connString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
    const pgHost = effectiveConfig.pgHost || process.env.PGHOST || '127.0.0.1';
    const pgPort = Number(effectiveConfig.pgPort || process.env.PGPORT) || 5432;
    const pgDatabase = effectiveConfig.pgDatabase || process.env.PGDATABASE || 'invoice_manager';
    const pgUser = effectiveConfig.pgUser || process.env.PGUSER || 'postgres';
    const pgPassword = effectiveConfig.pgPassword || process.env.PGPASSWORD || 'postgres';

    const pgDb = knex({
      client: 'pg',
      connection: connString
        ? {
            connectionString: connString,
            ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized },
          }
        : {
            host: pgHost,
            port: pgPort,
            database: pgDatabase,
            user: pgUser,
            password: pgPassword,
            ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized } : false,
          },
      pool: {
        min: 0,
        max: 10,
        acquireTimeoutMillis: 2500,
        createTimeoutMillis: 2500,
        idleTimeoutMillis: 30000,
      },
    });

    try {
      // Rapid connectivity verification
      await pgDb.raw('SELECT 1');
      await runMigrations(pgDb);

      cachedDb = pgDb;
      activeDbConfig = {
        type: 'postgres',
        pgHost,
        pgPort,
        pgDatabase,
        pgUser,
      };
      saveDbConfig({
        type: 'postgres',
        pgHost,
        pgPort,
        pgDatabase,
        pgUser,
      });
      console.log(`[Database] Automatically verified and connected to PostgreSQL at ${pgHost}:${pgPort}/${pgDatabase}`);
      return pgDb;
    } catch (pgErr: any) {
      console.warn(`[Database] PostgreSQL unavailable (${pgErr.message || 'connection failed'}). Automatically falling back to SQLite WAL...`);
      try {
        await pgDb.destroy();
      } catch {
        // ignore
      }
      return initSqliteDatabase(effectiveConfig.sqlitePath);
    }
  }

  // Default: SQLite WAL mode
  return initSqliteDatabase(effectiveConfig.sqlitePath);
}

export function getDatabase(): Knex {
  if (!cachedDb) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return cachedDb;
}

export function getActiveDbConfig(): DbConfig | null {
  return activeDbConfig;
}

export async function closeDatabase(): Promise<void> {
  if (cachedDb) {
    try {
      await cachedDb.destroy();
    } catch {
      // ignore
    }
    cachedDb = null;
    activeDbConfig = null;
  }
}

/**
 * Automatically switches database mode and re-initializes Knex connection pool
 */
export async function switchDatabase(newConfig?: DbConfig): Promise<Knex> {
  await closeDatabase();
  if (newConfig) {
    saveDbConfig(newConfig);
  }
  return initDatabase(newConfig);
}
