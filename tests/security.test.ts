import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import knex from 'knex';
import { sanitizeCellValue } from '../src/server/services/importExportService';
import { BackupRestoreService } from '../src/server/services/backupRestoreService';
import { LetterheadService } from '../src/server/services/letterheadService';
import { CompanyService } from '../src/server/services/companyService';
import { MasterDataService } from '../src/server/services/masterDataService';
import { InvoiceService } from '../src/server/services/invoiceService';
import { PaymentService } from '../src/server/services/paymentService';
import { InventoryService } from '../src/server/services/inventoryService';
import { buildIcoFromPngBuffer } from '../src/server/services/softwareIconService';
import {
  normalizeLanConfig,
  saveLanConfig,
  loadLanConfig,
} from '../electron/lanConfig';
import {
  WorkstationService,
  hashAdminPin,
  verifyAdminPin,
} from '../src/server/services/workstationService';
import {
  validateSafeLocalSaveDir,
  sanitizeFilenameSegment,
  writePdfToSafeLocalDir,
  validateSafeDatabaseHost,
} from '../src/server/services/pathSecurity';
import { initDatabase } from '../src/server/database/connection';

describe('Security Hardening Test Suite', () => {
  it('sanitizeCellValue escapes formula injection characters', () => {
    expect(sanitizeCellValue('=1+1')).toBe("'=1+1");
    expect(sanitizeCellValue('+100')).toBe("'+100");
    expect(sanitizeCellValue('-500')).toBe("'-500");
    expect(sanitizeCellValue('@HYPERLINK("http://evil.com")')).toBe("'@HYPERLINK(\"http://evil.com\")");
    expect(sanitizeCellValue('\tTabbed')).toBe("'\tTabbed");
    expect(sanitizeCellValue('Normal Customer Name')).toBe('Normal Customer Name');
    expect(sanitizeCellValue(12345)).toBe(12345);
    expect(sanitizeCellValue(null)).toBe(null);
  });

  it('BackupRestoreService rejects directory traversal and unauthorized filenames', async () => {
    const db = await initDatabase({ type: 'sqlite' });
    const backupService = new BackupRestoreService(db);

    await expect(backupService.restoreFromBackup('../../outside.sqlite3')).rejects.toThrow(
      'Backup file outside.sqlite3 does not exist in authorized backups directory.'
    );

    await expect(backupService.restoreFromBackup('..\\..\\outside.sqlite3')).rejects.toThrow(
      'Backup file outside.sqlite3 does not exist in authorized backups directory.'
    );

    await expect(backupService.restoreFromBackup('malicious.exe')).rejects.toThrow(
      'Invalid backup archive file format. Only .sqlite3 database files are permitted.'
    );

    await expect(backupService.restoreFromBackup('')).rejects.toThrow('Backup filename is required.');
  });

  it('LetterheadService strictly confines template file access to company upload directory', async () => {
    const db = await initDatabase({ type: 'sqlite' });
    const letterheadService = new LetterheadService(db);
    const companyId = 'sec-test-company-1';

    const safeDir = letterheadService.getLetterheadUploadDir(companyId);
    const safeFilePath = path.join(safeDir, 'template1.pdf');

    // Valid path inside upload directory
    expect(letterheadService.validateFilePathInsideUploadDir(companyId, safeFilePath)).toBe(
      path.resolve(safeFilePath)
    );

    // Directory traversal attempt outside upload directory
    expect(() =>
      letterheadService.validateFilePathInsideUploadDir(companyId, 'C:\\Windows\\win.ini')
    ).toThrow('Access denied: Letterhead template file must reside inside company upload directory');

    expect(() =>
      letterheadService.validateFilePathInsideUploadDir(companyId, path.join(safeDir, '..', 'other-company', 'file.pdf'))
    ).toThrow('Access denied: Letterhead template file must reside inside company upload directory');
  });

  it('buildIcoFromPngBuffer creates a valid Windows ICO binary from PNG bytes and rejects invalid input', () => {
    // Minimal valid PNG signature + IHDR chunk (256x256)
    const fakePng = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(fakePng, 0);
    fakePng.writeUInt32BE(256, 16);
    fakePng.writeUInt32BE(256, 20);

    const ico = buildIcoFromPngBuffer(fakePng);
    expect(ico.length).toBe(22 + fakePng.length);
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type = ICO
    expect(ico.readUInt16LE(4)).toBe(1); // 1 image
    expect(ico.readUInt8(6)).toBe(0); // 256 encoded as 0
    expect(ico.readUInt8(7)).toBe(0); // 256 encoded as 0
    expect(ico.readUInt32LE(14)).toBe(fakePng.length);
    expect(ico.readUInt32LE(18)).toBe(22);

    expect(() => buildIcoFromPngBuffer(Buffer.from('not-a-png'))).toThrow('Invalid PNG image data');
  });

  it('validateSafeLocalSaveDir allows user folders while blocking UNC, traversal, and system/Startup folders', () => {
    const safeTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eim-safe-save-'));
    try {
      const validated = validateSafeLocalSaveDir(safeTmpDir);
      expect(validated).toBeTruthy();

      // Safe local PDF write works and sanitizes filename
      const written = writePdfToSafeLocalDir(safeTmpDir, 'INV/2026-27/"001"\r\n', Buffer.from('%PDF-1.4\n'));
      expect(written).toBeTruthy();
      expect(fs.existsSync(written!)).toBe(true);
      expect(path.basename(written!)).toBe('INV_2026-27_001.pdf');

      // Reject dangerous targets
      expect(() => validateSafeLocalSaveDir('\\\\evil-server\\share\\invoices')).toThrow(/UNC/i);
      expect(() => validateSafeLocalSaveDir('//evil-server/share')).toThrow(/UNC/i);
      expect(() => validateSafeLocalSaveDir('relative\\folder')).toThrow(/absolute/i);
      expect(() => validateSafeLocalSaveDir(`${safeTmpDir}\\..\\escape`)).toThrow(/traversal/i);
      expect(() => validateSafeLocalSaveDir('C:\\Windows\\System32')).toThrow(/protected system/i);
      expect(() =>
        validateSafeLocalSaveDir('C:\\Users\\test\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup')
      ).toThrow(/protected system/i);
      expect(() => validateSafeLocalSaveDir('C:\\')).toThrow(/bare drive root/i);
    } finally {
      fs.rmSync(safeTmpDir, { recursive: true, force: true });
    }
  });

  it('sanitizeFilenameSegment strips quotes, slashes, and control characters for Content-Disposition safety', () => {
    expect(sanitizeFilenameSegment('AC/2026-27/0001')).toBe('AC_2026-27_0001');
    expect(sanitizeFilenameSegment('bad"name\r\nX-Injected: 1')).toBe('bad_name_X-Injected_1');
    expect(sanitizeFilenameSegment('...')).toBe('document');
  });

  it('validateSafeDatabaseHost blocks cloud metadata IPs and privileged ports while allowing LAN hosts', () => {
    expect(validateSafeDatabaseHost('192.168.1.50', 5432)).toEqual({ host: '192.168.1.50', port: 5432 });
    expect(validateSafeDatabaseHost('127.0.0.1', '5433')).toEqual({ host: '127.0.0.1', port: 5433 });
    expect(() => validateSafeDatabaseHost('169.254.169.254', 5432)).toThrow(/not permitted/i);
    expect(() => validateSafeDatabaseHost('0.0.0.0', 5432)).toThrow(/not permitted/i);
    expect(() => validateSafeDatabaseHost('127.0.0.1', 22)).toThrow(/between 1024 and 65535/i);
  });

  it('LetterheadService blocks spoofed file extensions and host file-existence oracle', async () => {
    const db = await initDatabase({ type: 'sqlite' });
    const letterheadService = new LetterheadService(db);

    // Spoofed extension without valid PDF/PNG/JPG magic bytes must be rejected
    expect(() =>
      letterheadService.saveUploadedTemplateFile('sec-test-company-2', 'fake.pdf', Buffer.from('<html>not a pdf</html>'))
    ).toThrow(/Unsupported or invalid template binary/i);

    // analyzeLetterhead must reject paths outside company upload dir instead of probing fs.existsSync
    await expect(
      letterheadService.analyzeLetterhead('C:\\Windows\\win.ini', 'sec-test-company-2')
    ).rejects.toThrow(/Access denied/i);
  });

  it('enforces cross-company isolation, mass-assignment blocks, negative-value/stock guards, and backup credential scrubbing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eim-sec-db-'));
    const prevDir = process.env.APP_DATA_DIR;
    process.env.APP_DATA_DIR = tmpDir;
    const secDb = knex({
      client: 'sqlite3',
      connection: { filename: path.join(tmpDir, 'sec.sqlite3') },
      useNullAsDefault: true,
    });

    try {
      const { runMigrations } = await import('../src/server/database/migrations');
      await runMigrations(secDb);

      const companyService = new CompanyService(secDb);
      const masterData = new MasterDataService(secDb);
      const invoiceService = new InvoiceService(secDb);
      const paymentService = new PaymentService(secDb);
      const inventoryService = new InventoryService(secDb);
      const backupService = new BackupRestoreService(secDb);

      const compA = await companyService.createCompany({ name: 'Company A' });
      const compB = await companyService.createCompany({ name: 'Company B' });
      const [branchA] = await companyService.getBranches(compA.id);
      const [branchB] = await companyService.getBranches(compB.id);
      await companyService.createBranch(compA.id, { name: 'Branch A2', code: 'A2' });

      // 1. Cross-company branch update & delete must be rejected
      await expect(companyService.updateBranch(compA.id, branchB.id, { name: 'Hijacked' })).rejects.toThrow(/Branch not found/i);
      await expect(companyService.deleteBranch(compA.id, branchB.id)).rejects.toThrow(/Branch not found/i);

      // 2. Mass assignment on customer/supplier/product must not overwrite ledger balances or stock
      const cust = await masterData.createCustomer(compA.id, { name: 'Cust 1', opening_balance: '100.00' });
      const updatedCust = await masterData.updateCustomer(compA.id, cust.id, {
        name: 'Cust 1 Updated',
        current_balance: '999999.00',
        is_archived: true,
      } as any);
      expect(updatedCust.current_balance).toBe('100.00');
      expect(Boolean(updatedCust.is_archived)).toBe(false);

      const prod = await masterData.createProduct(compA.id, {
        name: 'Router X',
        selling_price: '1000.00',
        current_stock: '5.00',
      });
      const updatedProd = await masterData.updateProduct(compA.id, prod.id, {
        name: 'Router X Pro',
        current_stock: '999.00',
      } as any);
      expect(updatedProd.current_stock).toBe('5.00');

      // 3. Negative quantity / negative payment rejected
      await expect(
        invoiceService.createInvoice(compA.id, {
          branch_id: branchA.id,
          customer_id: cust.id,
          customer_name: cust.name,
          items: [{ item_name: 'Router X Pro', quantity: -2, rate: 1000, gst_rate: 18 }],
        })
      ).rejects.toThrow(/Invalid quantity/i);

      await expect(
        paymentService.recordCustomerPayment(compA.id, {
          customerId: cust.id,
          customerName: cust.name,
          amount: -50,
          paymentMethod: 'CASH',
        })
      ).rejects.toThrow(/greater than zero/i);

      // 4. Negative stock prevented when allow_negative_stock is false
      const oversizedDraft = await invoiceService.createInvoice(compA.id, {
        branch_id: branchA.id,
        customer_id: cust.id,
        customer_name: cust.name,
        items: [{ item_id: prod.id, item_type: 'PRODUCT', item_name: prod.name, quantity: 10, rate: 1000, gst_rate: 18 }],
      });
      await expect(invoiceService.finalizeInvoice(compA.id, oversizedDraft.id)).rejects.toThrow(/Insufficient stock/i);

      // 5. Cancellation restores BOTH products.current_stock and stock_balances.quantity_on_hand
      const [whA] = await inventoryService.getWarehouses(compA.id);
      await secDb('stock_balances').insert({
        id: 'sb-1',
        company_id: compA.id,
        warehouse_id: whA.id,
        product_id: prod.id,
        quantity_on_hand: '5.00',
        average_unit_cost: '800.00',
        total_stock_value: '4000.00',
        last_updated_at: new Date().toISOString(),
      });
      const validInv = await invoiceService.createInvoice(compA.id, {
        branch_id: branchA.id,
        customer_id: cust.id,
        customer_name: cust.name,
        finalize_on_create: true,
        items: [{ item_id: prod.id, item_type: 'PRODUCT', item_name: prod.name, quantity: 2, rate: 1000, gst_rate: 18 }],
      });
      await invoiceService.cancelInvoice(compA.id, validInv.id, 'Customer cancelled order');
      const restoredProd = await masterData.getProductById(compA.id, prod.id);
      const restoredBal = await secDb('stock_balances').where({ id: 'sb-1' }).first();
      expect(restoredProd!.current_stock).toBe('5.00');
      expect(restoredBal.quantity_on_hand).toBe('5.00');

      // 6. Per-company backup scrubs pg_password from app_settings
      await secDb('app_settings').insert({
        id: 'settings-1',
        operating_mode: 'LAN_SERVER',
        db_type: 'sqlite',
        pg_host: '192.168.1.10',
        pg_user: 'admin',
        pg_password: 'super-secret-password',
        server_port: 4200,
        show_company_selector_on_startup: true,
        theme: 'light',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const compBackup = await backupService.createCompanyBackup(compA.id);
      const inspectDb = knex({
        client: 'sqlite3',
        connection: { filename: compBackup.filePath },
        useNullAsDefault: true,
      });
      try {
        const exportedSettings = await inspectDb('app_settings').first();
        expect(exportedSettings.pg_password).toBeNull();
        expect(exportedSettings.pg_user).toBeNull();
        expect(exportedSettings.pg_host).toBeNull();
      } finally {
        await inspectDb.destroy();
      }
    } finally {
      await secDb.destroy();
      if (prevDir === undefined) delete process.env.APP_DATA_DIR;
      else process.env.APP_DATA_DIR = prevDir;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Direct Desktop-to-Desktop LAN config persists per PC and blocks invalid/metadata hosts', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eim-lan-cfg-'));
    try {
      // Defaults cleanly to STANDALONE with persistent deviceId & tray preference
      const initial = loadLanConfig(tmpDir);
      expect(initial.role).toBe('STANDALONE');
      expect(initial.hostIp).toBe('');
      expect(initial.port).toBe(4200);
      expect(initial.deviceId).toMatch(/^pc-/);

      // Saves and loads LAN_HOST and LAN_CLIENT configs while preserving deviceId
      saveLanConfig(tmpDir, {
        role: 'LAN_HOST',
        port: 4200,
        deviceName: 'Office Host PC',
        minimizeToTray: true,
        autoStartOnBoot: true,
      });
      const hostCfg = loadLanConfig(tmpDir);
      expect(hostCfg.role).toBe('LAN_HOST');
      expect(hostCfg.deviceId).toBe(initial.deviceId);
      expect(hostCfg.deviceName).toBe('Office Host PC');
      expect(hostCfg.minimizeToTray).toBe(true);
      expect(hostCfg.autoStartOnBoot).toBe(true);

      saveLanConfig(tmpDir, { role: 'LAN_CLIENT', hostIp: '192.168.1.100', port: 4200, deviceName: 'Billing Desk 1' });
      const clientCfg = loadLanConfig(tmpDir);
      expect(clientCfg.role).toBe('LAN_CLIENT');
      expect(clientCfg.hostIp).toBe('192.168.1.100');
      expect(clientCfg.deviceName).toBe('Billing Desk 1');

      // Rejects missing hostIp for LAN_CLIENT, cloud metadata IPs, and invalid ports
      expect(() => normalizeLanConfig({ role: 'LAN_CLIENT', hostIp: '', port: 4200 })).toThrow(/Main Office PC IP/i);
      expect(() => normalizeLanConfig({ role: 'LAN_CLIENT', hostIp: '169.254.169.254', port: 4200 })).toThrow(
        /not permitted/i
      );
      expect(() => normalizeLanConfig({ role: 'LAN_CLIENT', hostIp: '192.168.1.100', port: 80 })).toThrow(
        /between 1024 and 65535/i
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('WorkstationService enforces MD Admin PIN, per-PC menu permissions (hiding Dashboard/Reports), and Staff Activity tracking', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eim-ws-perm-'));
    const wsDb = knex({
      client: 'sqlite3',
      connection: { filename: path.join(tmpDir, 'ws.sqlite3') },
      useNullAsDefault: true,
    });

    try {
      const { runMigrations } = await import('../src/server/database/migrations');
      await runMigrations(wsDb);

      const wsService = new WorkstationService(wsDb);
      const companyService = new CompanyService(wsDb);
      const masterData = new MasterDataService(wsDb);
      const invoiceService = new InvoiceService(wsDb);

      // 1. MD Admin PIN hashing strictly enforces 4 digits and uses salted scrypt
      expect(() => hashAdminPin('123')).toThrow(/4 numeric digits/);
      expect(() => hashAdminPin('12345')).toThrow(/4 numeric digits/);
      expect(() => hashAdminPin('abcd')).toThrow(/4 numeric digits/);

      const h = hashAdminPin('9876');
      expect(h).not.toContain('9876');
      expect(verifyAdminPin('9876', h)).toBe(true);
      expect(verifyAdminPin('0000', h)).toBe(false);
      expect(verifyAdminPin('987', h)).toBe(false);

      // Default PIN is 1234 when unconfigured
      expect(await wsService.checkAdminPin('1234')).toBe(true);
      expect(await wsService.checkAdminPin('9999')).toBe(false);

      await wsService.setAdminPin('4567');
      expect(await wsService.hasAdminPin()).toBe(true);
      expect(await wsService.checkAdminPin('4567')).toBe(true);
      expect(await wsService.checkAdminPin('1234')).toBe(false);
      expect(await wsService.checkAdminPin('1111')).toBe(false);

      // 2. Host PC gets full admin; remote Staff PC defaults to non-admin without Dashboard & Reports
      const hostWs = await wsService.registerOrTouchWorkstation('pc-host', 'Accounts Host', '127.0.0.1', true);
      expect(hostWs.is_admin).toBe(true);
      expect(hostWs.allowed_menus).toContain('dashboard');
      expect(hostWs.allowed_menus).toContain('reports');

      const staffWs = await wsService.registerOrTouchWorkstation('pc-staff-1', 'Billing Desk 1', '192.168.1.44', false);
      expect(staffWs.is_admin).toBe(false);
      expect(staffWs.allowed_menus).not.toContain('dashboard');
      expect(staffWs.allowed_menus).not.toContain('reports');
      expect(staffWs.allowed_menus).toContain('invoices');

      // 3. MD can customize menus per PC (e.g., restrict to only invoices & quotations, hide settings)
      const updatedStaff = await wsService.updateWorkstationPermission('pc-staff-1', {
        allowed_menus: ['invoices', 'quotations', 'customers'],
        can_open_settings: false,
      });
      expect(updatedStaff.allowed_menus).toEqual(['invoices', 'quotations', 'customers']);
      expect(updatedStaff.can_open_settings).toBe(false);

      // 4. Staff Activity Report tracks documents created per workstation
      const comp = await companyService.createCompany({ name: 'MD Oversight Co' });
      const [branch] = await companyService.getBranches(comp.id);
      const cust = await masterData.createCustomer(comp.id, { name: 'Walk-in Buyer' });

      await invoiceService.createInvoice(comp.id, {
        branch_id: branch.id,
        customer_id: cust.id,
        customer_name: cust.name,
        created_by_device_id: 'pc-staff-1',
        created_by_device_name: 'Billing Desk 1',
        items: [{ item_name: 'Service A', item_type: 'SERVICE', quantity: 1, rate: 1000, gst_rate: 18 }],
      });

      const activity = await wsService.getStaffActivityReport(comp.id);
      const desk1 = activity.find((r) => r.device_id === 'pc-staff-1');
      expect(desk1).toBeDefined();
      expect(desk1!.device_name).toBe('Billing Desk 1');
      expect(desk1!.invoices_count).toBe(1);
      expect(desk1!.invoices_total).toBe('1180.00');
      expect(desk1!.total_documents).toBe(1);

      // 5. Host creates staff member by Name with custom menu permissions; staff connects by name
      const createdStaff = await wsService.createStaffMember('Ramesh', ['invoices', 'quotations'], false);
      expect(createdStaff.device_name).toBe('Ramesh');
      expect(createdStaff.allowed_menus).toEqual(['invoices', 'quotations']);

      // Staff PC connects supplying staffName 'Ramesh' (case-insensitive)
      const connected = await wsService.registerOrTouchWorkstation('remote-device-99', undefined, '192.168.1.105', false, 'ramesh');
      expect(connected.device_name).toBe('Ramesh');
      expect(connected.allowed_menus).toEqual(['invoices', 'quotations']);
      expect(connected.allowed_menus).not.toContain('dashboard');
      expect(connected.allowed_menus).not.toContain('reports');
    } finally {
      await wsDb.destroy();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
