// src/server/database/purge.ts - Clean slate database purge for live production deployments
import path from 'path';
import fs from 'fs';
import knex from 'knex';
import { runMigrations } from './migrations';
import { seedInitialData } from './seed';

const BUSINESS_TABLES = [
  'payment_allocations',
  'customer_payments',
  'supplier_payments',
  'invoice_items',
  'invoices',
  'quotation_items',
  'quotations',
  'purchase_order_items',
  'purchase_orders',
  'purchase_invoice_items',
  'purchase_invoices',
  'inventory_transactions',
  'stock_balances',
  'customer_addresses',
  'customers',
  'suppliers',
  'products',
  'categories',
  'units',
  'warehouses',
  'letterhead_templates',
  'numbering_sequences',
  'company_settings',
  'branches',
  'companies',
  'audit_logs',
];

export async function purgeDatabaseFile(dbPath: string): Promise<void> {
  if (fs.existsSync(dbPath)) {
    try {
      const db = knex({
        client: 'sqlite3',
        connection: { filename: dbPath },
        useNullAsDefault: true,
      });

      console.log(`[Purge] Purging business data from ${dbPath}...`);
      await db.raw('PRAGMA foreign_keys = OFF');
      for (const table of BUSINESS_TABLES) {
        if (await db.schema.hasTable(table)) {
          await db(table).del();
        }
      }
      await db.raw('PRAGMA foreign_keys = ON');
      try {
        await db.raw('PRAGMA wal_checkpoint(TRUNCATE)');
      } catch {
        // ignore
      }
      await db.destroy();
      console.log(`[Purge] Successfully purged tables in ${dbPath}`);
    } catch (err) {
      console.warn(`[Purge] Could not purge via Knex, removing file directly: ${err}`);
      try {
        fs.unlinkSync(dbPath);
      } catch (e) {
        console.error(`[Purge] Failed to remove ${dbPath}: ${e}`);
      }
    }
  }
}

export async function purgeAllData(): Promise<void> {
  const targets: string[] = [];

  // 1. Workspace local DB
  targets.push(path.join(process.cwd(), 'data', 'invoice_manager.sqlite3'));

  // 2. Desktop AppData DB
  const appData = process.env.APPDATA;
  if (appData) {
    targets.push(path.join(appData, 'enterprise-invoice-manager', 'data', 'invoice_manager.sqlite3'));
  }

  for (const target of targets) {
    await purgeDatabaseFile(target);
    const dataDir = path.dirname(target);
    for (const sub of ['backups', 'letterheads']) {
      const subDir = path.join(dataDir, sub);
      if (fs.existsSync(subDir)) {
        try {
          fs.rmSync(subDir, { recursive: true, force: true });
          fs.mkdirSync(subDir, { recursive: true });
          console.log(`[Purge] Cleared ${subDir}`);
        } catch (err) {
          console.warn(`[Purge] Could not clear ${subDir}:`, err);
        }
      }
    }
  }

  console.log('[Purge] All live data entries (companies, invoices, customers, backups, templates, etc.) have been completely cleared.');
}

if (require.main === module) {
  purgeAllData().catch(console.error);
}
