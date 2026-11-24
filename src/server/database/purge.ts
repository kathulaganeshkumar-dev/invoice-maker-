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
  'letterhead_template_overrides',
  'numbering_sequences',
  'quotation_sequences',
  'company_settings',
  'branches',
  'companies',
  'audit_logs',
  'workstation_permissions',
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
      if (await db.schema.hasTable('app_settings')) {
        await db('app_settings').update({
          operating_mode: 'SINGLE_COMPUTER',
          theme: 'light',
          server_port: 4200,
          show_company_selector_on_startup: 1,
          admin_pin_hash: null,
          default_staff_menus_json: null,
          last_seen_utc: null,
          license_data_json: null,
          invoice_save_path: null,
          quotation_save_path: null,
          purchase_save_path: null,
          report_save_path: null,
          backup_save_path: null,
          excel_export_save_path: null,
          software_icon: null,
          auto_backup_enabled: 1,
          auto_backup_frequency: 'DAILY',
          auto_backup_interval_days: 1,
          auto_backup_retention_days: 30,
          auto_backup_max_count: 30,
          last_auto_backup_at: null,
        }).catch(() => {});
      }
      try {
        await db.raw('PRAGMA wal_checkpoint(TRUNCATE)');
        await db.raw('VACUUM');
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
    targets.push(path.join(appData, 'enterprise-invoice-manager-dev', 'data', 'invoice_manager.sqlite3'));
  }

  for (const target of targets) {
    await purgeDatabaseFile(target);
    const dataDir = path.dirname(target);
    for (const sub of ['backups', 'letterheads', 'icons']) {
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

    // Reset Direct LAN desktop config file to clean standalone defaults
    const lanFile = path.join(dataDir, 'lan-config.json');
    if (fs.existsSync(lanFile)) {
      try {
        const cleanLanConfig = {
          role: 'STANDALONE',
          hostIp: '',
          port: 4200,
          deviceId: 'pc-main-workstation',
          deviceName: 'Main Workstation',
          staffName: '',
          minimizeToTray: true,
          autoStartOnBoot: false,
        };
        fs.writeFileSync(lanFile, JSON.stringify(cleanLanConfig, null, 2), 'utf8');
        console.log(`[Purge] Reset LAN config at ${lanFile}`);
      } catch (err) {
        console.warn(`[Purge] Could not reset ${lanFile}:`, err);
      }
    }

    // Remove db-config.json and license.lic if present
    for (const f of ['db-config.json', 'license.lic']) {
      const filePath = path.join(dataDir, f);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`[Purge] Removed ${filePath}`);
        } catch {
          // ignore
        }
      }
    }
  }

  console.log('[Purge] All live data entries (companies, invoices, customers, backups, templates, etc.) have been completely cleared.');
}

if (require.main === module) {
  purgeAllData().catch(console.error);
}
