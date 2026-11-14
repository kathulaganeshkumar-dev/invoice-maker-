// src/server/services/backupRestoreService.ts - Database Backup & Safe Restore Engine
import { Knex } from 'knex';
import fs from 'fs';
import path from 'path';
import { getDefaultDataDir, getDefaultSqlitePath } from '../database/connection';

export interface BackupMetadata {
  id: string;
  filename: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
}

export class BackupRestoreService {
  constructor(private db: Knex) {}

  getBackupDir(): string {
    const backupDir = path.join(getDefaultDataDir(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
  }

  /**
   * Creates a full SQLite database snapshot backup file
   */
  async createFullBackup(): Promise<BackupMetadata> {
    const sqlitePath = getDefaultSqlitePath();
    const backupDir = this.getBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_full_${timestamp}.sqlite3`;
    const destPath = path.join(backupDir, filename);

    if (fs.existsSync(sqlitePath)) {
      fs.copyFileSync(sqlitePath, destPath);
    } else {
      // If running memory or external, dump tables to json backup
      const tables = [
        'companies', 'branches', 'company_settings', 'numbering_sequences',
        'customers', 'suppliers', 'categories', 'units', 'products',
        'invoices', 'invoice_items', 'quotations', 'quotation_items',
        'purchase_orders', 'purchase_invoices', 'warehouses', 'stock_balances',
        'inventory_transactions', 'customer_payments', 'supplier_payments',
        'payment_allocations', 'letterhead_templates', 'audit_logs', 'app_settings',
      ];
      const dump: Record<string, any[]> = {};
      for (const t of tables) {
        if (await this.db.schema.hasTable(t)) {
          dump[t] = await this.db(t).select('*');
        }
      }
      fs.writeFileSync(destPath + '.json', JSON.stringify(dump, null, 2));
    }

    const stats = fs.statSync(fs.existsSync(destPath) ? destPath : destPath + '.json');
    return {
      id: filename,
      filename,
      filePath: destPath,
      sizeBytes: stats.size,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Lists available backup archives
   */
  async listBackups(): Promise<BackupMetadata[]> {
    const backupDir = this.getBackupDir();
    const files = fs.readdirSync(backupDir);

    return files.map((f) => {
      const fullPath = path.join(backupDir, f);
      const stats = fs.statSync(fullPath);
      return {
        id: f,
        filename: f,
        filePath: fullPath,
        sizeBytes: stats.size,
        createdAt: stats.birthtime.toISOString(),
      };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Restores database from a selected backup snapshot with automatic safety backup
   */
  async restoreFromBackup(backupFilename: string): Promise<void> {
    if (!backupFilename || typeof backupFilename !== 'string') {
      throw new Error('Backup filename is required.');
    }

    const cleanName = path.basename(backupFilename.trim());
    if (!/^[A-Za-z0-9._-]+\.(?:sqlite3|sqlite|db)$/i.test(cleanName)) {
      throw new Error('Invalid backup archive file format. Only .sqlite3 database files are permitted.');
    }

    const backupDir = path.resolve(this.getBackupDir());
    const backupPath = path.resolve(backupDir, cleanName);

    if (!backupPath.startsWith(backupDir + path.sep) || !fs.existsSync(backupPath)) {
      throw new Error(`Backup file ${cleanName} does not exist in authorized backups directory.`);
    }

    const stat = fs.statSync(backupPath);
    if (!stat.isFile()) {
      throw new Error('Specified backup path is not a valid regular file.');
    }

    // 1. Take safety snapshot of current DB before restoration
    await this.createFullBackup();

    // 2. Perform restore
    const sqlitePath = getDefaultSqlitePath();
    fs.copyFileSync(backupPath, sqlitePath);
  }
}
