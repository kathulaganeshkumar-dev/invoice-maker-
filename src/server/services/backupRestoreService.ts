// src/server/services/backupRestoreService.ts - WAL-Safe Full & Per-Company Database Backup, Inspect & Live Restore Engine
import knex, { Knex } from 'knex';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { getDefaultDataDir, getDefaultSqlitePath } from '../database/connection';
import { runMigrations } from '../database/migrations';
import { validateSafeLocalSaveDir } from './pathSecurity';
import { assertDiskSpace } from './diskSpaceGuard';
import { AutoBackupSettings } from '../../shared/types';

export interface BackupMetadata {
  id: string;
  filename: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupCompanyInfo {
  id: string;
  name: string;
  gstin?: string;
  customers: number;
  suppliers: number;
  products: number;
  invoices: number;
  quotations: number;
  purchases: number;
  payments: number;
  totalRecords: number;
}

export interface BackupInspectResult {
  companies: BackupCompanyInfo[];
}

export interface RestoreOptions {
  mode?: 'INTO_COMPANY' | 'FULL_REPLACE';
  targetCompanyId?: string;
  sourceCompanyId?: string;
}

export interface RestoreSummary {
  mode: 'INTO_COMPANY' | 'FULL_REPLACE';
  targetCompanyId?: string;
  targetCompanyName?: string;
  companies: number;
  customers: number;
  suppliers: number;
  products: number;
  invoices: number;
  quotations: number;
  purchases: number;
  payments: number;
  totalRows: number;
}

const SQLITE_MAGIC_HEADER = Buffer.from('SQLite format 3\0', 'ascii');

// Complete list of all application tables in strict parent -> child dependency order
const ORDERED_TABLES = [
  'app_settings',
  'companies',
  'branches',
  'company_settings',
  'numbering_sequences',
  'categories',
  'units',
  'products',
  'customers',
  'customer_addresses',
  'suppliers',
  'warehouses',
  'invoices',
  'invoice_items',
  'quotations',
  'quotation_items',
  'purchase_orders',
  'purchase_order_items',
  'purchase_invoices',
  'purchase_invoice_items',
  'inventory_transactions',
  'stock_balances',
  'customer_payments',
  'supplier_payments',
  'payment_allocations',
  'letterhead_templates',
  'audit_logs',
];

export class BackupRestoreService {
  private cachedCustomBackupDir: string = '';

  constructor(private db: Knex) {}

  getBackupDir(): string {
    const backupDir = path.join(getDefaultDataDir(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
  }

  /**
   * Returns an isolated per-company backup directory: data/backups/<companyId>/
   */
  getCompanyBackupDir(companyId: string): string {
    const cleanCompanyId = String(companyId || '').trim();
    if (!cleanCompanyId || !/^[A-Za-z0-9_-]+$/.test(cleanCompanyId)) {
      throw new Error('Invalid company identifier for backup directory.');
    }
    const baseDir = path.resolve(this.getBackupDir());
    const companyDir = path.resolve(baseDir, cleanCompanyId);
    if (!companyDir.startsWith(baseDir + path.sep)) {
      throw new Error('Invalid company backup directory path.');
    }
    if (!fs.existsSync(companyDir)) {
      fs.mkdirSync(companyDir, { recursive: true });
    }
    return companyDir;
  }

  private isSqliteClient(): boolean {
    const clientName = String((this.db as any)?.client?.config?.client || '').toLowerCase();
    return clientName.includes('sqlite');
  }

  private getActiveSqliteFilename(): string {
    const configured = (this.db as any)?.client?.config?.connection?.filename;
    if (configured && configured !== ':memory:') {
      return configured;
    }
    return getDefaultSqlitePath();
  }

  private async checkpointWal(): Promise<void> {
    try {
      if (this.isSqliteClient()) {
        await this.db.raw('PRAGMA wal_checkpoint(TRUNCATE)');
      }
    } catch (err) {
      console.warn('[Backup] WAL checkpoint warning (non-fatal):', err);
    }
  }

  resolveAuthorizedBackupPath(
    backupFilename: string,
    allowJson = false,
    companyId?: string
  ): { cleanName: string; backupPath: string } {
    if (!backupFilename || typeof backupFilename !== 'string') {
      throw new Error('Backup filename is required.');
    }

    const cleanName = path.basename(backupFilename.trim());
    const pattern = allowJson
      ? /^[A-Za-z0-9._-]+\.(?:sqlite3|sqlite|db|json)$/i
      : /^[A-Za-z0-9._-]+\.(?:sqlite3|sqlite|db)$/i;

    if (!pattern.test(cleanName)) {
      throw new Error('Invalid backup archive file format. Only .sqlite3 database files are permitted.');
    }

    const candidateDirs = [
      path.resolve(companyId ? this.getCompanyBackupDir(companyId) : this.getBackupDir()),
      path.resolve(this.getBackupDir(), 'rolling'),
    ];
    if (this.cachedCustomBackupDir) {
      candidateDirs.push(path.resolve(this.cachedCustomBackupDir));
    }

    let resolvedValidPath: string | null = null;
    for (const dir of candidateDirs) {
      const candidate = path.resolve(dir, cleanName);
      if (candidate.startsWith(dir + path.sep) && fs.existsSync(candidate)) {
        const stat = fs.statSync(candidate);
        if (stat.isFile()) {
          resolvedValidPath = candidate;
          break;
        }
      }
    }

    if (!resolvedValidPath) {
      throw new Error(`Backup file ${cleanName} does not exist in authorized backups directory.`);
    }

    return { cleanName, backupPath: resolvedValidPath };
  }

  private async readAllTablesFromSqlite(filePath: string): Promise<Map<string, any[]>> {
    const srcDb = knex({
      client: 'sqlite3',
      connection: { filename: filePath },
      useNullAsDefault: true,
    });

    const tableRows = new Map<string, any[]>();
    try {
      const existingTablesRows = await srcDb.raw(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      );
      const srcTableSet = new Set<string>(
        (Array.isArray(existingTablesRows) ? existingTablesRows : []).map((r: any) => String(r.name))
      );

      if (!srcTableSet.has('companies')) {
        throw new Error('Invalid backup file: missing core "companies" table.');
      }

      for (const table of ORDERED_TABLES) {
        if (srcTableSet.has(table)) {
          const rows = await srcDb(table).select('*');
          tableRows.set(table, rows);
        }
      }
    } finally {
      await srcDb.destroy();
    }
    return tableRows;
  }

  private async getLiveColumnsMap(): Promise<Map<string, Set<string>>> {
    const map = new Map<string, Set<string>>();
    for (const table of ORDERED_TABLES) {
      if (await this.db.schema.hasTable(table)) {
        const colInfo = await this.db(table).columnInfo();
        map.set(table, new Set(Object.keys(colInfo)));
      }
    }
    return map;
  }

  private async insertRowsChunked(trx: Knex.Transaction, table: string, rows: any[], validCols: Set<string>): Promise<number> {
    if (!rows || rows.length === 0) return 0;
    const sanitizedRows = rows.map((row) => {
      const cleanRow: Record<string, any> = {};
      for (const [key, val] of Object.entries(row)) {
        if (validCols.has(key)) {
          cleanRow[key] = val;
        }
      }
      return cleanRow;
    });

    const colCount = Math.max(1, Object.keys(sanitizedRows[0]).length);
    const chunkSize = Math.max(1, Math.min(100, Math.floor(800 / colCount)));
    for (let i = 0; i < sanitizedRows.length; i += chunkSize) {
      await trx(table).insert(sanitizedRows.slice(i, i + chunkSize));
    }
    return sanitizedRows.length;
  }

  /**
   * Inspects a .sqlite3 backup file and lists every company inside with record counts
   */
  async inspectBackupFile(filePath: string): Promise<BackupInspectResult> {
    const tableRows = await this.readAllTablesFromSqlite(filePath);
    const companies = (tableRows.get('companies') || []).filter((c) => !c.is_archived);
    const customers = tableRows.get('customers') || [];
    const suppliers = tableRows.get('suppliers') || [];
    const products = tableRows.get('products') || [];
    const invoices = tableRows.get('invoices') || [];
    const quotations = tableRows.get('quotations') || [];
    const purchases = tableRows.get('purchase_invoices') || [];
    const custPay = tableRows.get('customer_payments') || [];
    const supPay = tableRows.get('supplier_payments') || [];

    const result: BackupCompanyInfo[] = companies.map((c) => {
      const cCust = customers.filter((r) => r.company_id === c.id && !r.is_archived).length;
      const cSup = suppliers.filter((r) => r.company_id === c.id && !r.is_archived).length;
      const cProd = products.filter((r) => r.company_id === c.id && !r.is_archived).length;
      const cInv = invoices.filter((r) => r.company_id === c.id).length;
      const cQuote = quotations.filter((r) => r.company_id === c.id).length;
      const cPur = purchases.filter((r) => r.company_id === c.id).length;
      const cPay =
        custPay.filter((r) => r.company_id === c.id).length +
        supPay.filter((r) => r.company_id === c.id).length;
      return {
        id: c.id,
        name: c.name,
        gstin: c.gstin || undefined,
        customers: cCust,
        suppliers: cSup,
        products: cProd,
        invoices: cInv,
        quotations: cQuote,
        purchases: cPur,
        payments: cPay,
        totalRecords: cCust + cSup + cProd + cInv + cQuote + cPur + cPay,
      };
    });

    // Sort richest company first so the UI auto-selects the company with data
    result.sort((a, b) => b.totalRecords - a.totalRecords);
    return { companies: result };
  }

  async inspectSavedBackup(backupFilename: string, companyId?: string): Promise<BackupInspectResult> {
    const { backupPath } = this.resolveAuthorizedBackupPath(backupFilename, false, companyId);
    return this.inspectBackupFile(backupPath);
  }

  async inspectUploadedBuffer(buffer: Buffer): Promise<BackupInspectResult> {
    if (!buffer || buffer.length < 100 || !buffer.subarray(0, 16).equals(SQLITE_MAGIC_HEADER)) {
      throw new Error('Invalid file: Please select a valid .sqlite3 backup file created by this software.');
    }
    const tmpPath = path.join(os.tmpdir(), `eim-inspect-${uuidv4()}.sqlite3`);
    try {
      fs.writeFileSync(tmpPath, buffer);
      return await this.inspectBackupFile(tmpPath);
    } finally {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // ignore cleanup
      }
    }
  }

  /**
   * Creates a full WAL-checkpointed SQLite database snapshot backup file (all companies)
   */
  async createFullBackup(): Promise<BackupMetadata> {
    const sqlitePath = this.getActiveSqliteFilename();
    const backupDir = this.getBackupDir();
    await assertDiskSpace(backupDir, 25 * 1024 * 1024);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_full_${timestamp}.sqlite3`;
    const destPath = path.join(backupDir, filename);

    if (this.isSqliteClient() && fs.existsSync(sqlitePath)) {
      await this.checkpointWal();
      fs.copyFileSync(sqlitePath, destPath);
    } else {
      const dump: Record<string, any[]> = {};
      for (const t of ORDERED_TABLES) {
        if (await this.db.schema.hasTable(t)) {
          dump[t] = await this.db(t).select('*');
        }
      }
      fs.writeFileSync(destPath + '.json', JSON.stringify(dump, null, 2));
    }

    const finalPath = fs.existsSync(destPath) ? destPath : destPath + '.json';
    const finalName = path.basename(finalPath);
    const stats = fs.statSync(finalPath);
    return {
      id: finalName,
      filename: finalName,
      filePath: finalPath,
      sizeBytes: stats.size,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Creates a single-company SQLite backup file inside that company's isolated backup directory
   */
  async createCompanyBackup(companyId: string, filenamePrefix = 'backup'): Promise<BackupMetadata> {
    const company = await this.db('companies').where({ id: companyId }).first();
    if (!company) {
      throw new Error('Company not found for backup.');
    }

    await this.checkpointWal();
    const companyBackupDir = this.getCompanyBackupDir(companyId);
    await assertDiskSpace(companyBackupDir, 15 * 1024 * 1024);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeCompName = String(company.name || 'company')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'company';
    const filename = `${filenamePrefix}_${safeCompName}_${timestamp}.sqlite3`;
    const destPath = path.join(companyBackupDir, filename);

    // Create a fresh SQLite DB with full schema and copy ONLY this company's rows
    const outDb = knex({
      client: 'sqlite3',
      connection: { filename: destPath },
      useNullAsDefault: true,
    });

    try {
      await runMigrations(outDb);
      await outDb.raw('PRAGMA foreign_keys = OFF');

      const [
        appSettings,
        branches,
        compSettings,
        sequences,
        categories,
        units,
        products,
        customers,
        suppliers,
        warehouses,
        invoices,
        quotations,
        pos,
        purInvoices,
        invTx,
        stockBal,
        custPays,
        supPays,
        templates,
        auditLogs,
      ] = await Promise.all([
        this.db('app_settings').select('*'),
        this.db('branches').where({ company_id: companyId }),
        this.db('company_settings').where({ company_id: companyId }),
        this.db('numbering_sequences').where({ company_id: companyId }),
        this.db('categories').where({ company_id: companyId }),
        this.db('units').where({ company_id: companyId }),
        this.db('products').where({ company_id: companyId }),
        this.db('customers').where({ company_id: companyId }),
        this.db('suppliers').where({ company_id: companyId }),
        this.db('warehouses').where({ company_id: companyId }),
        this.db('invoices').where({ company_id: companyId }),
        this.db('quotations').where({ company_id: companyId }),
        this.db('purchase_orders').where({ company_id: companyId }),
        this.db('purchase_invoices').where({ company_id: companyId }),
        this.db('inventory_transactions').where({ company_id: companyId }),
        this.db('stock_balances').where({ company_id: companyId }),
        this.db('customer_payments').where({ company_id: companyId }),
        this.db('supplier_payments').where({ company_id: companyId }),
        this.db('letterhead_templates').where({ company_id: companyId }),
        this.db('audit_logs').where({ company_id: companyId }),
      ]);

      const custIds = customers.map((r: any) => r.id);
      const invIds = invoices.map((r: any) => r.id);
      const qIds = quotations.map((r: any) => r.id);
      const poIds = pos.map((r: any) => r.id);
      const purInvIds = purInvoices.map((r: any) => r.id);
      const payIds = [...custPays.map((r: any) => r.id), ...supPays.map((r: any) => r.id)];

      const [custAddrs, invItems, qItems, poItems, purInvItems, payAllocs] = await Promise.all([
        custIds.length ? this.db('customer_addresses').whereIn('customer_id', custIds) : [],
        invIds.length ? this.db('invoice_items').whereIn('invoice_id', invIds) : [],
        qIds.length ? this.db('quotation_items').whereIn('quotation_id', qIds) : [],
        poIds.length ? this.db('purchase_order_items').whereIn('purchase_order_id', poIds) : [],
        purInvIds.length ? this.db('purchase_invoice_items').whereIn('purchase_invoice_id', purInvIds) : [],
        payIds.length ? this.db('payment_allocations').whereIn('payment_id', payIds) : [],
      ]);

      // Scrub sensitive PostgreSQL server credentials before writing into a per-company portable backup
      const sanitizedAppSettings = appSettings.map((row: any) => ({
        ...row,
        pg_password: null,
        pg_user: null,
        pg_host: null,
      }));

      const dataMap: Record<string, any[]> = {
        app_settings: sanitizedAppSettings,
        companies: [company],
        branches,
        company_settings: compSettings,
        numbering_sequences: sequences,
        categories,
        units,
        products,
        customers,
        customer_addresses: custAddrs,
        suppliers,
        warehouses,
        invoices,
        invoice_items: invItems,
        quotations,
        quotation_items: qItems,
        purchase_orders: pos,
        purchase_order_items: poItems,
        purchase_invoices: purInvoices,
        purchase_invoice_items: purInvItems,
        inventory_transactions: invTx,
        stock_balances: stockBal,
        customer_payments: custPays,
        supplier_payments: supPays,
        payment_allocations: payAllocs,
        letterhead_templates: templates,
        audit_logs: auditLogs,
      };

      await outDb.transaction(async (trx) => {
        for (const table of ORDERED_TABLES) {
          const rows = dataMap[table] || [];
          if (rows.length === 0) continue;
          const colInfo = await trx(table).columnInfo();
          const validCols = new Set(Object.keys(colInfo));
          await this.insertRowsChunked(trx, table, rows, validCols);
        }
      });
    } finally {
      await outDb.destroy();
    }

    const stats = fs.statSync(destPath);
    return {
      id: filename,
      filename,
      filePath: destPath,
      sizeBytes: stats.size,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Retrieves the current automated backup configuration, resolving between company_settings and app_settings
   */
  async getAutoBackupSettings(companyId?: string): Promise<AutoBackupSettings> {
    let compSettings: any = null;
    if (companyId) {
      compSettings = await this.db('company_settings').where({ company_id: companyId }).first();
    }
    const appSettings = await this.db('app_settings').first();

    const enabled = compSettings?.auto_backup_enabled ?? appSettings?.auto_backup_enabled ?? true;
    const frequency = (compSettings?.auto_backup_frequency || appSettings?.auto_backup_frequency || 'DAILY') as 'DAILY' | 'EVERY_N_DAYS';
    const intervalDays = Math.max(1, Number(compSettings?.auto_backup_interval_days ?? appSettings?.auto_backup_interval_days ?? 1));
    const retentionDays = Math.max(1, Number(compSettings?.auto_backup_retention_days ?? appSettings?.auto_backup_retention_days ?? 30));
    const maxCount = Math.max(1, Number(compSettings?.auto_backup_max_count ?? appSettings?.auto_backup_max_count ?? 30));
    const rawPath = String(compSettings?.backup_save_path || appSettings?.backup_save_path || '').trim();
    const lastBackup = compSettings?.last_auto_backup_at || appSettings?.last_auto_backup_at || null;

    let resolvedDir = path.join(this.getBackupDir(), 'rolling');
    if (rawPath) {
      try {
        resolvedDir = validateSafeLocalSaveDir(rawPath);
        this.cachedCustomBackupDir = resolvedDir;
      } catch {
        // Fallback to internal rolling dir if configured path is invalid
      }
    }

    return {
      auto_backup_enabled: Boolean(enabled),
      auto_backup_frequency: frequency === 'EVERY_N_DAYS' ? 'EVERY_N_DAYS' : 'DAILY',
      auto_backup_interval_days: intervalDays,
      auto_backup_retention_days: retentionDays,
      auto_backup_max_count: maxCount,
      backup_save_path: rawPath,
      last_auto_backup_at: lastBackup,
      resolved_backup_dir: resolvedDir,
    };
  }

  /**
   * Updates automated backup configuration across both app_settings and company_settings
   */
  async updateAutoBackupSettings(
    updates: Partial<AutoBackupSettings>,
    companyId?: string
  ): Promise<AutoBackupSettings> {
    const patch: any = {};
    if (updates.auto_backup_enabled !== undefined) {
      patch.auto_backup_enabled = Boolean(updates.auto_backup_enabled);
    }
    if (updates.auto_backup_frequency !== undefined) {
      patch.auto_backup_frequency = updates.auto_backup_frequency === 'EVERY_N_DAYS' ? 'EVERY_N_DAYS' : 'DAILY';
    }
    if (updates.auto_backup_interval_days !== undefined) {
      patch.auto_backup_interval_days = Math.max(1, Math.min(365, Number(updates.auto_backup_interval_days) || 1));
    }
    if (updates.auto_backup_retention_days !== undefined) {
      patch.auto_backup_retention_days = Math.max(1, Math.min(3650, Number(updates.auto_backup_retention_days) || 30));
    }
    if (updates.auto_backup_max_count !== undefined) {
      patch.auto_backup_max_count = Math.max(1, Math.min(1000, Number(updates.auto_backup_max_count) || 30));
    }
    if (updates.backup_save_path !== undefined) {
      const cleanPath = String(updates.backup_save_path || '').trim();
      if (cleanPath) {
        const validated = validateSafeLocalSaveDir(cleanPath);
        this.cachedCustomBackupDir = validated;
      } else {
        this.cachedCustomBackupDir = '';
      }
      patch.backup_save_path = cleanPath;
    }

    if (Object.keys(patch).length > 0) {
      const appSettings = await this.db('app_settings').first();
      if (appSettings) {
        await this.db('app_settings').where({ id: appSettings.id }).update(patch);
      }
      if (companyId) {
        await this.db('company_settings').where({ company_id: companyId }).update(patch);
      }
    }

    return this.getAutoBackupSettings(companyId);
  }

  /**
   * Prunes backup files in a directory according to retention days and max count limits
   */
  pruneDirectoryBackups(
    dirPath: string,
    retentionDays: number,
    maxCount: number
  ): { prunedCount: number; remainingCount: number } {
    if (!fs.existsSync(dirPath)) {
      return { prunedCount: 0, remainingCount: 0 };
    }

    let prunedCount = 0;
    try {
      const files = fs.readdirSync(dirPath);
      const backupFiles = files
        .filter((f) => /^(?:auto_backup_|rolling_).*\.(?:sqlite3|json)$/i.test(f))
        .map((f) => {
          const filePath = path.join(dirPath, f);
          const stat = fs.statSync(filePath);
          return {
            filename: f,
            filePath,
            mtimeMs: stat.mtimeMs,
          };
        });

      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;
      const surviving: typeof backupFiles = [];

      // Step 1: Delete files older than retentionDays
      for (const file of backupFiles) {
        const ageDays = (now - file.mtimeMs) / msPerDay;
        if (ageDays > retentionDays) {
          try {
            fs.unlinkSync(file.filePath);
            prunedCount++;
          } catch {
            // ignore unlink error
          }
        } else {
          surviving.push(file);
        }
      }

      // Step 2: Delete excess files if surviving count exceeds maxCount
      surviving.sort((a, b) => b.mtimeMs - a.mtimeMs);
      if (surviving.length > maxCount) {
        for (let i = maxCount; i < surviving.length; i++) {
          try {
            fs.unlinkSync(surviving[i].filePath);
            prunedCount++;
          } catch {
            // ignore unlink error
          }
        }
      }

      return {
        prunedCount,
        remainingCount: Math.min(surviving.length, maxCount),
      };
    } catch (err) {
      console.warn('[Backup] Directory pruning error:', err);
      return { prunedCount, remainingCount: 0 };
    }
  }

  /**
   * Executes an automated rolling backup with user-defined frequency, custom folder path, and retention policy
   */
  async runDailyRollingBackup(
    force = false,
    companyId?: string
  ): Promise<{
    backup: BackupMetadata | null;
    destinationDir: string;
    prunedCount: number;
    totalRemaining: number;
    message: string;
  }> {
    const settings = await this.getAutoBackupSettings(companyId);

    if (!force && !settings.auto_backup_enabled) {
      return {
        backup: null,
        destinationDir: '',
        prunedCount: 0,
        totalRemaining: 0,
        message: 'Automated backup is disabled in settings.',
      };
    }

    const todayDate = new Date().toISOString().slice(0, 10);

    // Frequency checking (unless forced)
    if (!force) {
      if (settings.auto_backup_frequency === 'DAILY') {
        if (settings.last_auto_backup_at && settings.last_auto_backup_at.startsWith(todayDate)) {
          return {
            backup: null,
            destinationDir: settings.resolved_backup_dir || '',
            prunedCount: 0,
            totalRemaining: 0,
            message: "Today's daily backup has already been completed.",
          };
        }
      } else if (settings.auto_backup_frequency === 'EVERY_N_DAYS') {
        if (settings.last_auto_backup_at) {
          const elapsedMs = Date.now() - new Date(settings.last_auto_backup_at).getTime();
          const intervalMs = settings.auto_backup_interval_days * 24 * 60 * 60 * 1000;
          if (elapsedMs < intervalMs) {
            return {
              backup: null,
              destinationDir: settings.resolved_backup_dir || '',
              prunedCount: 0,
              totalRemaining: 0,
              message: `Backup not due yet (configured interval: every ${settings.auto_backup_interval_days} days).`,
            };
          }
        }
      }
    }

    // Prepare target directories
    const internalRollingDir = path.join(this.getBackupDir(), 'rolling');
    if (!fs.existsSync(internalRollingDir)) {
      fs.mkdirSync(internalRollingDir, { recursive: true });
    }

    let customDir = '';
    if (settings.backup_save_path) {
      try {
        customDir = validateSafeLocalSaveDir(settings.backup_save_path);
        if (!fs.existsSync(customDir)) {
          fs.mkdirSync(customDir, { recursive: true });
        }
        this.cachedCustomBackupDir = customDir;
      } catch (err: any) {
        console.warn('[Backup] Invalid user custom backup path, falling back to internal directory:', err.message);
        customDir = '';
      }
    }

    const primaryDir = customDir || internalRollingDir;
    await assertDiskSpace(primaryDir, 25 * 1024 * 1024);

    // Filename generation
    let filename = `auto_backup_${todayDate}.sqlite3`;
    const primaryPath = path.join(primaryDir, filename);
    if (fs.existsSync(primaryPath) && force) {
      const timeStr = new Date().toISOString().slice(11, 19).replace(/[:.]/g, '');
      filename = `auto_backup_${todayDate}_${timeStr}.sqlite3`;
    }

    const targetFilePath = path.join(primaryDir, filename);
    const internalFilePath = path.join(internalRollingDir, filename);
    const sqlitePath = this.getActiveSqliteFilename();

    if (this.isSqliteClient() && fs.existsSync(sqlitePath)) {
      await this.checkpointWal();
      fs.copyFileSync(sqlitePath, targetFilePath);
      if (customDir && customDir !== internalRollingDir) {
        fs.copyFileSync(sqlitePath, internalFilePath);
      }
    } else {
      const dump: Record<string, any[]> = {};
      for (const t of ORDERED_TABLES) {
        if (await this.db.schema.hasTable(t)) {
          dump[t] = await this.db(t).select('*');
        }
      }
      const jsonContent = JSON.stringify(dump, null, 2);
      const jsonFileName = filename.replace(/\.sqlite3$/, '.json');
      fs.writeFileSync(path.join(primaryDir, jsonFileName), jsonContent);
      if (customDir && customDir !== internalRollingDir) {
        fs.writeFileSync(path.join(internalRollingDir, jsonFileName), jsonContent);
      }
    }

    // Prune both custom folder and internal rolling directory
    const primaryPrune = this.pruneDirectoryBackups(
      primaryDir,
      settings.auto_backup_retention_days,
      settings.auto_backup_max_count
    );
    if (customDir && customDir !== internalRollingDir) {
      this.pruneDirectoryBackups(
        internalRollingDir,
        settings.auto_backup_retention_days,
        settings.auto_backup_max_count
      );
    }

    // Update last_auto_backup_at timestamp in database
    const nowIso = new Date().toISOString();
    try {
      await this.db('app_settings').update({ last_auto_backup_at: nowIso });
      if (companyId) {
        await this.db('company_settings').where({ company_id: companyId }).update({ last_auto_backup_at: nowIso });
      }
    } catch {
      // ignore
    }

    const finalPath = fs.existsSync(targetFilePath) ? targetFilePath : targetFilePath.replace(/\.sqlite3$/, '.json');
    const stats = fs.statSync(finalPath);
    const backupMeta: BackupMetadata = {
      id: path.basename(finalPath),
      filename: path.basename(finalPath),
      filePath: finalPath,
      sizeBytes: stats.size,
      createdAt: nowIso,
    };

    return {
      backup: backupMeta,
      destinationDir: primaryDir,
      prunedCount: primaryPrune.prunedCount,
      totalRemaining: primaryPrune.remainingCount,
      message: `Automated backup successfully saved to ${primaryDir}!`,
    };
  }

  async listBackups(companyId?: string): Promise<BackupMetadata[]> {
    const targetDir = companyId ? this.getCompanyBackupDir(companyId) : this.getBackupDir();
    const rollingDir = path.join(this.getBackupDir(), 'rolling');

    const searchDirs = [targetDir];
    if (fs.existsSync(rollingDir) && rollingDir !== targetDir) {
      searchDirs.push(rollingDir);
    }
    if (this.cachedCustomBackupDir && fs.existsSync(this.cachedCustomBackupDir)) {
      if (!searchDirs.includes(this.cachedCustomBackupDir)) {
        searchDirs.push(this.cachedCustomBackupDir);
      }
    }

    const itemsMap = new Map<string, BackupMetadata>();

    for (const dir of searchDirs) {
      try {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          if (!/\.(?:sqlite3|sqlite|db|json)$/i.test(f)) continue;
          const fullPath = path.join(dir, f);
          try {
            const stats = fs.statSync(fullPath);
            if (!stats.isFile()) continue;
            // Only add if not already added or if this is the target company/main directory
            if (!itemsMap.has(f) || dir === targetDir) {
              itemsMap.set(f, {
                id: f,
                filename: f,
                filePath: fullPath,
                sizeBytes: stats.size,
                createdAt: stats.mtime.toISOString(),
              });
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }

    return Array.from(itemsMap.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getDownloadableBackup(backupFilename: string, companyId?: string): { filename: string; filePath: string } {
    const { cleanName, backupPath } = this.resolveAuthorizedBackupPath(backupFilename, true, companyId);
    return { filename: cleanName, filePath: backupPath };
  }

  /**
   * MODE 1 (DEFAULT WHEN INSIDE A COMPANY):
   * Restores all data from a backup company INTO the target company (e.g. a newly created company),
   * keeping the target company's name/identity AND leaving all other companies untouched!
   */
  private async restoreBackupIntoTargetCompany(
    backupPath: string,
    targetCompanyId: string,
    requestedSourceCompanyId?: string
  ): Promise<RestoreSummary> {
    const targetCompany = await this.db('companies').where({ id: targetCompanyId }).first();
    if (!targetCompany) {
      throw new Error('Target company not found.');
    }

    const tableRows = await this.readAllTablesFromSqlite(backupPath);
    const srcCompanies = (tableRows.get('companies') || []).filter((c) => !c.is_archived);
    if (srcCompanies.length === 0) {
      throw new Error('This backup file contains no companies to restore.');
    }

    // Pick requested source company, or auto-pick matching company name / company with the most data
    let srcCompanyId = requestedSourceCompanyId;
    if (!srcCompanyId || !srcCompanies.some((c) => c.id === srcCompanyId)) {
      const inspected = await this.inspectBackupFile(backupPath);
      const targetNameLower = String(targetCompany.name || '').trim().toLowerCase();
      const nameMatch = inspected.companies.find(
        (c) => c.name.trim().toLowerCase() === targetNameLower && c.totalRecords > 0
      );
      srcCompanyId = nameMatch?.id || inspected.companies[0]?.id || srcCompanies[0].id;
    }

    const filterByCompany = (table: string) =>
      (tableRows.get(table) || []).filter((r) => r.company_id === srcCompanyId);

    const srcBranches = filterByCompany('branches');
    const srcCompSettings = filterByCompany('company_settings');
    const srcSequences = filterByCompany('numbering_sequences');
    const srcCategories = filterByCompany('categories');
    const srcUnits = filterByCompany('units');
    const srcProducts = filterByCompany('products');
    const srcCustomers = filterByCompany('customers');
    const srcSuppliers = filterByCompany('suppliers');
    const srcWarehouses = filterByCompany('warehouses');
    const srcInvoices = filterByCompany('invoices');
    const srcQuotations = filterByCompany('quotations');
    const srcPos = filterByCompany('purchase_orders');
    const srcPurInvoices = filterByCompany('purchase_invoices');
    const srcInvTx = filterByCompany('inventory_transactions');
    const srcStockBal = filterByCompany('stock_balances');
    const srcCustPays = filterByCompany('customer_payments');
    const srcSupPays = filterByCompany('supplier_payments');
    const srcTemplates = filterByCompany('letterhead_templates');
    const srcAuditLogs = filterByCompany('audit_logs');

    const srcCustIds = new Set(srcCustomers.map((r) => r.id));
    const srcInvIds = new Set(srcInvoices.map((r) => r.id));
    const srcQIds = new Set(srcQuotations.map((r) => r.id));
    const srcPoIds = new Set(srcPos.map((r) => r.id));
    const srcPurInvIds = new Set(srcPurInvoices.map((r) => r.id));
    const srcPayIds = new Set([...srcCustPays.map((r) => r.id), ...srcSupPays.map((r) => r.id)]);

    const srcCustAddrs = (tableRows.get('customer_addresses') || []).filter((r) => srcCustIds.has(r.customer_id));
    const srcInvItems = (tableRows.get('invoice_items') || []).filter((r) => srcInvIds.has(r.invoice_id));
    const srcQItems = (tableRows.get('quotation_items') || []).filter((r) => srcQIds.has(r.quotation_id));
    const srcPoItems = (tableRows.get('purchase_order_items') || []).filter((r) => srcPoIds.has(r.purchase_order_id));
    const srcPurInvItems = (tableRows.get('purchase_invoice_items') || []).filter((r) =>
      srcPurInvIds.has(r.purchase_invoice_id)
    );
    const srcPayAllocs = (tableRows.get('payment_allocations') || []).filter((r) => srcPayIds.has(r.payment_id));

    const liveColumnsMap = await this.getLiveColumnsMap();

    // Fresh UUID remapping table so restored records never collide with other companies
    const idMap = new Map<string, string>();
    const mapId = (oldId?: string | null): string | null => {
      if (!oldId) return null;
      if (!idMap.has(oldId)) idMap.set(oldId, uuidv4());
      return idMap.get(oldId)!;
    };

    const existingTargetBranches = await this.db('branches').where({ company_id: targetCompanyId });
    const targetDefaultBranch =
      existingTargetBranches.find((b: any) => b.is_default) || existingTargetBranches[0];
    const fallbackBranchId = targetDefaultBranch?.id || uuidv4();

    // Map source branches cleanly (reusing target's default branch ID for the primary branch)
    const srcDefaultBranch = srcBranches.find((b) => b.is_default) || srcBranches[0];
    for (const b of srcBranches) {
      if (srcDefaultBranch && b.id === srcDefaultBranch.id && targetDefaultBranch) {
        idMap.set(b.id, targetDefaultBranch.id);
      } else {
        idMap.set(b.id, uuidv4());
      }
    }
    const mapBranchId = (oldBranchId?: string | null): string => {
      if (!oldBranchId) return fallbackBranchId;
      return idMap.get(oldBranchId) || fallbackBranchId;
    };

    // Pre-assign fresh IDs for every entity so cross-table foreign keys resolve cleanly
    for (const list of [
      srcCategories,
      srcUnits,
      srcSuppliers,
      srcProducts,
      srcCustomers,
      srcWarehouses,
      srcTemplates,
      srcInvoices,
      srcQuotations,
      srcPos,
      srcPurInvoices,
      srcCustPays,
      srcSupPays,
    ]) {
      for (const row of list) mapId(row.id);
    }

    const isSqlite = this.isSqliteClient();
    if (isSqlite) {
      await this.db.raw('PRAGMA foreign_keys = OFF');
    }

    let totalRows = 0;
    try {
      await this.db.transaction(async (trx) => {
        // 1. Delete existing data belonging ONLY to targetCompanyId (leaves all other companies 100% untouched!)
        const oldCustIds = (await trx('customers').where({ company_id: targetCompanyId }).select('id')).map((r: any) => r.id);
        const oldInvIds = (await trx('invoices').where({ company_id: targetCompanyId }).select('id')).map((r: any) => r.id);
        const oldQIds = (await trx('quotations').where({ company_id: targetCompanyId }).select('id')).map((r: any) => r.id);
        const oldPoIds = (await trx('purchase_orders').where({ company_id: targetCompanyId }).select('id')).map((r: any) => r.id);
        const oldPurIds = (await trx('purchase_invoices').where({ company_id: targetCompanyId }).select('id')).map((r: any) => r.id);
        const oldPayIds = [
          ...(await trx('customer_payments').where({ company_id: targetCompanyId }).select('id')).map((r: any) => r.id),
          ...(await trx('supplier_payments').where({ company_id: targetCompanyId }).select('id')).map((r: any) => r.id),
        ];

        const delInChunks = async (tbl: string, col: string, ids: string[]) => {
          for (let i = 0; i < ids.length; i += 400) {
            await trx(tbl).whereIn(col, ids.slice(i, i + 400)).del();
          }
        };

        await delInChunks('payment_allocations', 'payment_id', oldPayIds);
        await trx('customer_payments').where({ company_id: targetCompanyId }).del();
        await trx('supplier_payments').where({ company_id: targetCompanyId }).del();
        await trx('stock_balances').where({ company_id: targetCompanyId }).del();
        await trx('inventory_transactions').where({ company_id: targetCompanyId }).del();
        await delInChunks('purchase_invoice_items', 'purchase_invoice_id', oldPurIds);
        await trx('purchase_invoices').where({ company_id: targetCompanyId }).del();
        await delInChunks('purchase_order_items', 'purchase_order_id', oldPoIds);
        await trx('purchase_orders').where({ company_id: targetCompanyId }).del();
        await delInChunks('quotation_items', 'quotation_id', oldQIds);
        await trx('quotations').where({ company_id: targetCompanyId }).del();
        await delInChunks('invoice_items', 'invoice_id', oldInvIds);
        await trx('invoices').where({ company_id: targetCompanyId }).del();
        await delInChunks('customer_addresses', 'customer_id', oldCustIds);
        await trx('customers').where({ company_id: targetCompanyId }).del();
        await trx('suppliers').where({ company_id: targetCompanyId }).del();
        await trx('products').where({ company_id: targetCompanyId }).del();
        await trx('categories').where({ company_id: targetCompanyId }).del();
        if (srcUnits.length > 0) await trx('units').where({ company_id: targetCompanyId }).del();
        if (srcWarehouses.length > 0) await trx('warehouses').where({ company_id: targetCompanyId }).del();
        if (srcSequences.length > 0) await trx('numbering_sequences').where({ company_id: targetCompanyId }).del();
        if (srcCompSettings.length > 0) await trx('company_settings').where({ company_id: targetCompanyId }).del();
        await trx('letterhead_templates').where({ company_id: targetCompanyId }).del();
        await trx('audit_logs').where({ company_id: targetCompanyId }).del();

        // Keep targetDefaultBranch, add any additional branches from backup
        const extraBranchesToInsert = srcBranches
          .filter((b) => !(srcDefaultBranch && b.id === srcDefaultBranch.id && targetDefaultBranch))
          .map((b) => ({
            ...b,
            id: mapBranchId(b.id),
            company_id: targetCompanyId,
            is_default: !targetDefaultBranch && Boolean(b.is_default),
          }));

        const sanitizeSavePathForRestore = (p: any): string | null => {
          if (!p) return null;
          try {
            return validateSafeLocalSaveDir(String(p)) || null;
          } catch {
            return null;
          }
        };

        const sanitizeTemplatePathForRestore = (p: any): string => {
          if (!p) return '';
          try {
            const baseLetterheadDir = path.resolve(getDefaultDataDir(), 'letterheads');
            const resolved = path.resolve(String(p));
            return resolved.startsWith(baseLetterheadDir + path.sep) ? resolved : '';
          } catch {
            return '';
          }
        };

        const remappedTables: [string, any[]][] = [
          ['branches', extraBranchesToInsert],
          [
            'company_settings',
            srcCompSettings.map((r) => ({
              ...r,
              id: uuidv4(),
              company_id: targetCompanyId,
              invoice_save_path: sanitizeSavePathForRestore(r.invoice_save_path),
              quotation_save_path: sanitizeSavePathForRestore(r.quotation_save_path),
              purchase_save_path: sanitizeSavePathForRestore(r.purchase_save_path),
              report_save_path: sanitizeSavePathForRestore(r.report_save_path),
              backup_save_path: sanitizeSavePathForRestore(r.backup_save_path),
              excel_export_save_path: sanitizeSavePathForRestore(r.excel_export_save_path),
            })),
          ],
          [
            'numbering_sequences',
            srcSequences.map((r) => ({
              ...r,
              id: uuidv4(),
              company_id: targetCompanyId,
              branch_id: mapBranchId(r.branch_id),
            })),
          ],
          [
            'categories',
            srcCategories.map((r) => ({ ...r, id: mapId(r.id), company_id: targetCompanyId })),
          ],
          [
            'units',
            srcUnits.map((r) => ({ ...r, id: mapId(r.id), company_id: targetCompanyId })),
          ],
          [
            'suppliers',
            srcSuppliers.map((r) => ({ ...r, id: mapId(r.id), company_id: targetCompanyId })),
          ],
          [
            'products',
            srcProducts.map((r) => ({
              ...r,
              id: mapId(r.id),
              company_id: targetCompanyId,
              category_id: mapId(r.category_id),
              preferred_supplier_id: mapId(r.preferred_supplier_id),
            })),
          ],
          [
            'customers',
            srcCustomers.map((r) => ({ ...r, id: mapId(r.id), company_id: targetCompanyId })),
          ],
          [
            'customer_addresses',
            srcCustAddrs.map((r) => ({
              ...r,
              id: uuidv4(),
              customer_id: mapId(r.customer_id),
            })),
          ],
          [
            'warehouses',
            srcWarehouses.map((r) => ({
              ...r,
              id: mapId(r.id),
              company_id: targetCompanyId,
              branch_id: mapBranchId(r.branch_id),
            })),
          ],
          [
            'letterhead_templates',
            srcTemplates.map((r) => ({
              ...r,
              id: mapId(r.id),
              company_id: targetCompanyId,
              branch_id: r.branch_id ? mapBranchId(r.branch_id) : null,
              file_path: sanitizeTemplatePathForRestore(r.file_path),
            })),
          ],
          [
            'invoices',
            srcInvoices.map((r) => ({
              ...r,
              id: mapId(r.id),
              company_id: targetCompanyId,
              branch_id: mapBranchId(r.branch_id),
              customer_id: mapId(r.customer_id),
              letterhead_template_id: mapId(r.letterhead_template_id),
            })),
          ],
          [
            'invoice_items',
            srcInvItems.map((r) => ({
              ...r,
              id: uuidv4(),
              invoice_id: mapId(r.invoice_id),
              item_id: mapId(r.item_id),
            })),
          ],
          [
            'quotations',
            srcQuotations.map((r) => ({
              ...r,
              id: mapId(r.id),
              company_id: targetCompanyId,
              branch_id: mapBranchId(r.branch_id),
              customer_id: mapId(r.customer_id),
              converted_invoice_id: mapId(r.converted_invoice_id),
              letterhead_template_id: mapId(r.letterhead_template_id),
            })),
          ],
          [
            'quotation_items',
            srcQItems.map((r) => ({
              ...r,
              id: uuidv4(),
              quotation_id: mapId(r.quotation_id),
              item_id: mapId(r.item_id),
            })),
          ],
          [
            'purchase_orders',
            srcPos.map((r) => ({
              ...r,
              id: mapId(r.id),
              company_id: targetCompanyId,
              branch_id: mapBranchId(r.branch_id),
              supplier_id: mapId(r.supplier_id),
            })),
          ],
          [
            'purchase_order_items',
            srcPoItems.map((r) => ({
              ...r,
              id: uuidv4(),
              purchase_order_id: mapId(r.purchase_order_id),
              product_id: mapId(r.product_id),
            })),
          ],
          [
            'purchase_invoices',
            srcPurInvoices.map((r) => ({
              ...r,
              id: mapId(r.id),
              company_id: targetCompanyId,
              branch_id: mapBranchId(r.branch_id),
              purchase_order_id: mapId(r.purchase_order_id),
              supplier_id: mapId(r.supplier_id),
              warehouse_id: mapId(r.warehouse_id),
            })),
          ],
          [
            'purchase_invoice_items',
            srcPurInvItems.map((r) => ({
              ...r,
              id: uuidv4(),
              purchase_invoice_id: mapId(r.purchase_invoice_id),
              product_id: mapId(r.product_id),
            })),
          ],
          [
            'inventory_transactions',
            srcInvTx.map((r) => ({
              ...r,
              id: uuidv4(),
              company_id: targetCompanyId,
              branch_id: mapBranchId(r.branch_id),
              warehouse_id: mapId(r.warehouse_id),
              product_id: mapId(r.product_id),
              reference_document_id: idMap.get(r.reference_document_id) || r.reference_document_id,
            })),
          ],
          [
            'stock_balances',
            srcStockBal.map((r) => ({
              ...r,
              id: uuidv4(),
              company_id: targetCompanyId,
              warehouse_id: mapId(r.warehouse_id),
              product_id: mapId(r.product_id),
            })),
          ],
          [
            'customer_payments',
            srcCustPays.map((r) => ({
              ...r,
              id: mapId(r.id),
              company_id: targetCompanyId,
              branch_id: mapBranchId(r.branch_id),
              customer_id: mapId(r.customer_id),
            })),
          ],
          [
            'supplier_payments',
            srcSupPays.map((r) => ({
              ...r,
              id: mapId(r.id),
              company_id: targetCompanyId,
              branch_id: mapBranchId(r.branch_id),
              supplier_id: mapId(r.supplier_id),
            })),
          ],
          [
            'payment_allocations',
            srcPayAllocs.map((r) => ({
              ...r,
              id: uuidv4(),
              payment_id: mapId(r.payment_id),
              document_id: idMap.get(r.document_id) || r.document_id,
            })),
          ],
          [
            'audit_logs',
            srcAuditLogs.map((r) => ({
              ...r,
              id: uuidv4(),
              company_id: targetCompanyId,
              entity_id: idMap.get(r.entity_id) || r.entity_id,
            })),
          ],
        ];

        for (const [table, rows] of remappedTables) {
          const validCols = liveColumnsMap.get(table);
          if (!validCols || rows.length === 0) continue;
          totalRows += await this.insertRowsChunked(trx, table, rows, validCols);
        }
      });
    } finally {
      if (isSqlite) {
        await this.db.raw('PRAGMA foreign_keys = ON');
      }
    }

    await this.checkpointWal();

    return {
      mode: 'INTO_COMPANY',
      targetCompanyId,
      targetCompanyName: targetCompany.name,
      companies: 1,
      customers: srcCustomers.length,
      suppliers: srcSuppliers.length,
      products: srcProducts.length,
      invoices: srcInvoices.length,
      quotations: srcQuotations.length,
      purchases: srcPurInvoices.length,
      payments: srcCustPays.length + srcSupPays.length,
      totalRows,
    };
  }

  /**
   * MODE 2: Replaces the entire live database (all companies) atomically inside the active Knex pool
   */
  private async applyFullSqliteBackupToLiveDb(backupPath: string): Promise<RestoreSummary> {
    const tableRows = await this.readAllTablesFromSqlite(backupPath);
    const liveColumnsMap = await this.getLiveColumnsMap();

    // Validate restored company IDs and sanitize filesystem paths from untrusted backup rows
    const restoredCompanies = tableRows.get('companies') || [];
    for (const c of restoredCompanies) {
      if (!c?.id || !/^[A-Za-z0-9_-]+$/.test(String(c.id))) {
        throw new Error('Backup contains an invalid company identifier and was rejected.');
      }
    }

    const cleanSavePath = (val: any): string | null => {
      if (!val) return null;
      try {
        return validateSafeLocalSaveDir(String(val)) || null;
      } catch {
        return null;
      }
    };
    const baseLetterheadDir = path.resolve(getDefaultDataDir(), 'letterheads');
    const cleanTplPath = (val: any): string => {
      if (!val) return '';
      try {
        const resolved = path.resolve(String(val));
        return resolved.startsWith(baseLetterheadDir + path.sep) ? resolved : '';
      } catch {
        return '';
      }
    };

    if (tableRows.has('app_settings')) {
      tableRows.set(
        'app_settings',
        (tableRows.get('app_settings') || []).map((r) => ({
          ...r,
          invoice_save_path: cleanSavePath(r.invoice_save_path),
          quotation_save_path: cleanSavePath(r.quotation_save_path),
          purchase_save_path: cleanSavePath(r.purchase_save_path),
          report_save_path: cleanSavePath(r.report_save_path),
          backup_save_path: cleanSavePath(r.backup_save_path),
          excel_export_save_path: cleanSavePath(r.excel_export_save_path),
        }))
      );
    }
    if (tableRows.has('company_settings')) {
      tableRows.set(
        'company_settings',
        (tableRows.get('company_settings') || []).map((r) => ({
          ...r,
          invoice_save_path: cleanSavePath(r.invoice_save_path),
          quotation_save_path: cleanSavePath(r.quotation_save_path),
          purchase_save_path: cleanSavePath(r.purchase_save_path),
          report_save_path: cleanSavePath(r.report_save_path),
          backup_save_path: cleanSavePath(r.backup_save_path),
          excel_export_save_path: cleanSavePath(r.excel_export_save_path),
        }))
      );
    }
    if (tableRows.has('letterhead_templates')) {
      tableRows.set(
        'letterhead_templates',
        (tableRows.get('letterhead_templates') || []).map((r) => ({
          ...r,
          file_path: cleanTplPath(r.file_path),
        }))
      );
    }

    const isSqlite = this.isSqliteClient();
    if (isSqlite) {
      await this.db.raw('PRAGMA foreign_keys = OFF');
    }

    let totalRows = 0;
    try {
      await this.db.transaction(async (trx) => {
        for (let i = ORDERED_TABLES.length - 1; i >= 0; i--) {
          const table = ORDERED_TABLES[i];
          if (liveColumnsMap.has(table)) {
            await trx(table).del();
          }
        }

        for (const table of ORDERED_TABLES) {
          const validCols = liveColumnsMap.get(table);
          const rows = tableRows.get(table);
          if (!validCols || !rows || rows.length === 0) continue;
          totalRows += await this.insertRowsChunked(trx, table, rows, validCols);
        }
      });
    } finally {
      if (isSqlite) {
        await this.db.raw('PRAGMA foreign_keys = ON');
      }
    }

    await this.checkpointWal();

    return {
      mode: 'FULL_REPLACE',
      companies: (tableRows.get('companies') || []).length,
      customers: (tableRows.get('customers') || []).length,
      suppliers: (tableRows.get('suppliers') || []).length,
      products: (tableRows.get('products') || []).length,
      invoices: (tableRows.get('invoices') || []).length,
      quotations: (tableRows.get('quotations') || []).length,
      purchases: (tableRows.get('purchase_invoices') || []).length,
      payments:
        (tableRows.get('customer_payments') || []).length +
        (tableRows.get('supplier_payments') || []).length,
      totalRows,
    };
  }

  /**
   * Restores from a saved snapshot (either into active company OR full DB replace)
   */
  async restoreFromBackup(backupFilename: string, options: RestoreOptions = {}): Promise<RestoreSummary> {
    if (options.mode === 'INTO_COMPANY' && options.targetCompanyId) {
      const { backupPath } = this.resolveAuthorizedBackupPath(backupFilename, false, options.targetCompanyId);
      // 1. Take isolated safety snapshot of ONLY the target company before restoration
      await this.createCompanyBackup(options.targetCompanyId, 'pre_restore');
      // 2. Restore directly into the target company
      return this.restoreBackupIntoTargetCompany(
        backupPath,
        options.targetCompanyId,
        options.sourceCompanyId
      );
    }

    const { backupPath } = this.resolveAuthorizedBackupPath(backupFilename, false);
    await this.createFullBackup();
    return this.applyFullSqliteBackupToLiveDb(backupPath);
  }

  /**
   * Restores from an externally uploaded .sqlite3 backup file (e.g. from USB drive)
   */
  async restoreFromUploadedFile(
    buffer: Buffer,
    originalName: string,
    options: RestoreOptions = {}
  ): Promise<RestoreSummary> {
    if (!buffer || buffer.length < 100) {
      throw new Error('Uploaded backup file is empty or too small to be a valid SQLite database.');
    }
    if (!buffer.subarray(0, 16).equals(SQLITE_MAGIC_HEADER)) {
      throw new Error('Invalid file: Please upload a valid .sqlite3 backup file created by this software.');
    }

    const cleanOrig = path.basename(originalName || 'uploaded_backup.sqlite3').replace(/[^A-Za-z0-9._-]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const savedName = `uploaded_${timestamp}_${cleanOrig.endsWith('.sqlite3') ? cleanOrig : `${cleanOrig}.sqlite3`}`;

    if (options.mode === 'INTO_COMPANY' && options.targetCompanyId) {
      // 1. Save isolated safety backup of ONLY this company inside its own backup folder
      await this.createCompanyBackup(options.targetCompanyId, 'pre_restore');

      // 2. Archive the uploaded snapshot strictly inside this company's backup folder and restore it live
      const savedPath = path.join(this.getCompanyBackupDir(options.targetCompanyId), savedName);
      fs.writeFileSync(savedPath, buffer);

      return this.restoreBackupIntoTargetCompany(
        savedPath,
        options.targetCompanyId,
        options.sourceCompanyId
      );
    }

    const savedPath = path.join(this.getBackupDir(), savedName);
    await this.createFullBackup();
    fs.writeFileSync(savedPath, buffer);
    return this.applyFullSqliteBackupToLiveDb(savedPath);
  }
}
