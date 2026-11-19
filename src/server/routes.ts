// src/server/routes.ts - Complete REST API Routes with Express 5 param handling
import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import knex, { Knex } from 'knex';
import { CompanyService } from './services/companyService';
import { MasterDataService } from './services/masterDataService';
import { InvoiceService } from './services/invoiceService';
import { QuotationService } from './services/quotationService';
import { PurchaseService } from './services/purchaseService';
import { InventoryService } from './services/inventoryService';
import { PaymentService } from './services/paymentService';
import { ReportService } from './services/reportService';
import { LetterheadService } from './services/letterheadService';
import { ImportExportService } from './services/importExportService';
import { BackupRestoreService } from './services/backupRestoreService';
import { PdfEngine } from './services/pdfEngine';
import { NumberingService } from './services/numberingService';
import { applySoftwareIconToDesktop } from './services/softwareIconService';
import {
  WorkstationService,
  MENU_CATALOG,
  PRESET_PERMISSIONS,
  MenuId,
  sanitizeDeviceId,
  sanitizeDeviceName,
} from './services/workstationService';
import {
  validateSafeLocalSaveDir,
  sanitizeFilenameSegment,
  writePdfToSafeLocalDir,
  isLoopbackRequest,
  validateSafeDatabaseHost,
  createSimpleRateLimiter,
} from './services/pathSecurity';

export function createApiRouter(db: Knex): Router {
  const router = Router();

  const companyService = new CompanyService(db);
  const masterDataService = new MasterDataService(db);
  const invoiceService = new InvoiceService(db);
  const quotationService = new QuotationService(db, invoiceService);
  const purchaseService = new PurchaseService(db);
  const inventoryService = new InventoryService(db);
  const paymentService = new PaymentService(db);
  const reportService = new ReportService(db);
  const letterheadService = new LetterheadService(db);
  const importExportService = new ImportExportService(db, masterDataService, purchaseService, paymentService);
  const backupRestoreService = new BackupRestoreService(db);
  const workstationService = new WorkstationService(db);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  const getParams = (req: Request): Record<string, string> => req.params as any;

  const adminRateLimiter = createSimpleRateLimiter({
    windowMs: 60 * 1000,
    max: 15,
    message: 'Too many administrative requests. Please wait a moment and try again.',
  });
  const dbTestRateLimiter = createSimpleRateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many database connection tests. Please wait a moment and try again.',
  });
  const uploadRateLimiter = createSimpleRateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many file uploads. Please wait a moment and try again.',
  });

  const sanitizeAppSettings = (settings: any) => {
    if (!settings) return settings;
    const { pg_password, admin_pin_hash, ...safe } = settings;
    return {
      ...safe,
      pg_password: '',
      has_pg_password: Boolean(pg_password && String(pg_password).length > 0),
      has_admin_pin: Boolean(admin_pin_hash && String(admin_pin_hash).length > 0),
    };
  };

  const getRequestDeviceMeta = (req: Request) => {
    const rawId = String(req.headers['x-eim-device-id'] || '').trim();
    const rawName = String(req.headers['x-eim-device-name'] || '').trim();
    const rawStaff = String(req.headers['x-eim-staff-name'] || '').trim();
    const isLocal = isLoopbackRequest(req);
    const remoteIp = req.socket?.remoteAddress || req.ip || '';
    const effectiveName = rawStaff || rawName;
    return {
      deviceId: sanitizeDeviceId(rawId) || (isLocal ? 'local-host-pc' : ''),
      deviceName: sanitizeDeviceName(effectiveName, isLocal ? 'Main Office PC' : `Staff PC (${remoteIp || 'LAN'})`),
      staffName: rawStaff ? sanitizeDeviceName(rawStaff, '') : undefined,
      remoteIp,
      isLocal,
    };
  };

  const requireAdminAuthorization = async (req: Request, res: Response): Promise<boolean> => {
    const suppliedPin = String(req.headers['x-eim-admin-pin'] || req.body?.admin_pin || '').trim();
    if (!suppliedPin || !/^\d{4}$/.test(suppliedPin)) {
      res.status(403).json({ error: 'A valid 4-digit MD / Admin PIN must be entered to save permissions.' });
      return false;
    }
    const ok = await workstationService.checkAdminPin(suppliedPin);
    if (!ok) {
      res.status(403).json({ error: 'Incorrect 4-digit MD / Admin PIN. Permissions cannot be changed.' });
      return false;
    }
    return true;
  };

  const requireAdminReadAuthorization = async (req: Request, res: Response): Promise<boolean> => {
    if (isLoopbackRequest(req)) return true;
    const suppliedPin = String(req.headers['x-eim-admin-pin'] || '').trim();
    if (suppliedPin && (await workstationService.checkAdminPin(suppliedPin))) {
      return true;
    }
    const meta = getRequestDeviceMeta(req);
    if (meta.deviceId) {
      const ws = await workstationService.getWorkstationPermission(meta.deviceId);
      if (ws?.is_admin) return true;
    }
    res.status(403).json({ error: 'Admin access required. Enter MD / Admin PIN to view workstations.' });
    return false;
  };

  const requireMenuAccess = (menuId: MenuId) => {
    return async (req: Request, res: Response, next: any) => {
      try {
        const meta = getRequestDeviceMeta(req);
        if (!meta.deviceId) return next();
        const ws = await workstationService.getWorkstationPermission(meta.deviceId);
        if (!ws || ws.is_admin || ws.allowed_menus.includes(menuId)) {
          return next();
        }
        // Allow MD override if valid Admin PIN header is provided
        const suppliedPin = String(req.headers['x-eim-admin-pin'] || '').trim();
        if (suppliedPin && (await workstationService.hasAdminPin()) && (await workstationService.checkAdminPin(suppliedPin))) {
          return next();
        }
        return res.status(403).json({
          error: `Access to "${menuId}" is restricted on this PC by your MD / Administrator.`,
        });
      } catch {
        return next();
      }
    };
  };

  const sendInternalError = (res: Response, err: any, fallback = 'An internal server error occurred.') => {
    console.error('[API Error]', err);
    return res.status(500).json({ error: fallback });
  };

  // ===================== RESET ALL APPLICATION DATA =====================
  router.post('/reset-all-data', adminRateLimiter, async (req: Request, res: Response) => {
    try {
      if (!isLoopbackRequest(req)) {
        return res.status(403).json({ error: 'Full data reset is only permitted from the local host machine.' });
      }
      const confirmHeader = String(req.headers['x-eim-confirm-reset'] || '').trim();
      if (confirmHeader !== 'CONFIRM_RESET_ALL_DATA') {
        return res.status(403).json({ error: 'Missing required reset confirmation header.' });
      }

      // Take an automatic safety snapshot before wiping all tables
      try {
        await backupRestoreService.createFullBackup();
      } catch (backupErr) {
        console.warn('[Reset] Pre-reset safety backup warning:', backupErr);
      }

      await db.transaction(async (trx) => {
        const tablesToClear = [
          'payment_allocations',
          'customer_payments',
          'supplier_payments',
          'inventory_transactions',
          'stock_balances',
          'invoice_items',
          'invoices',
          'quotation_items',
          'quotations',
          'purchase_order_items',
          'purchase_orders',
          'purchase_invoice_items',
          'purchase_invoices',
          'customer_addresses',
          'customers',
          'suppliers',
          'products',
          'units',
          'categories',
          'warehouses',
          'numbering_sequences',
          'letterhead_templates',
          'audit_logs',
          'branches',
          'company_settings',
          'companies',
          'workstation_permissions',
        ];
        for (const table of tablesToClear) {
          const exists = await trx.schema.hasTable(table);
          if (exists) {
            await trx(table).del();
          }
        }
        if (await trx.schema.hasTable('app_settings')) {
          await trx('app_settings').update({
            admin_pin_hash: null,
            default_staff_menus_json: null,
          }).catch(() => {});
        }
      });
      res.json({ success: true, message: 'All companies and data have been cleared successfully.' });
    } catch (err: any) {
      sendInternalError(res, err, 'Failed to reset application data.');
    }
  });

  // ===================== APP SETTINGS =====================
  router.get('/settings', async (_req: Request, res: Response) => {
    try {
      let settings = await db('app_settings').first();
      if (!settings) {
        const { seedInitialData } = await import('./database/seed');
        await seedInitialData(db);
        settings = await db('app_settings').first();
      }
      res.json(
        sanitizeAppSettings(
          settings || {
            operating_mode: 'SINGLE_COMPUTER',
            db_type: 'sqlite',
            server_port: 4200,
            show_company_selector_on_startup: true,
            theme: 'light',
          }
        )
      );
    } catch (err: any) {
      sendInternalError(res, err, 'Failed to load application settings.');
    }
  });

  router.put('/settings', async (req: Request, res: Response) => {
    try {
      const allowedCols = new Set([
        'operating_mode',
        'db_type',
        'pg_host',
        'pg_port',
        'pg_database',
        'pg_user',
        'pg_password',
        'server_port',
        'show_company_selector_on_startup',
        'theme',
        'invoice_save_path',
        'quotation_save_path',
        'purchase_save_path',
        'report_save_path',
        'backup_save_path',
        'software_icon',
      ]);
      const savePathCols = new Set([
        'invoice_save_path',
        'quotation_save_path',
        'purchase_save_path',
        'report_save_path',
        'backup_save_path',
      ]);
      const hostSensitiveCols = new Set([
        'operating_mode',
        'db_type',
        'pg_host',
        'pg_port',
        'pg_database',
        'pg_user',
        'pg_password',
        'server_port',
        ...savePathCols,
      ]);

      const body = req.body || {};
      const touchesHostSensitive = Object.keys(body).some((k) => hostSensitiveCols.has(k));
      if (touchesHostSensitive && !isLoopbackRequest(req)) {
        return res.status(403).json({
          error: 'Server database and local folder settings can only be modified from the host machine.',
        });
      }

      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      for (const [k, v] of Object.entries(body)) {
        if (!allowedCols.has(k)) continue;
        if (k === 'pg_password') {
          // Only overwrite saved password when a non-empty value is explicitly supplied
          if (typeof v === 'string' && v.trim().length > 0) {
            updateData[k] = v;
          }
          continue;
        }
        if (savePathCols.has(k)) {
          updateData[k] = validateSafeLocalSaveDir(v as any);
          continue;
        }
        updateData[k] = v;
      }

      const existing = await db('app_settings').first();
      const iconChanged =
        Object.prototype.hasOwnProperty.call(updateData, 'software_icon') &&
        (existing?.software_icon || '') !== (updateData.software_icon || '');

      if (existing) {
        await db('app_settings').where({ id: existing.id }).update(updateData);
      } else {
        const { v4: uuidv4 } = await import('uuid');
        await db('app_settings').insert({
          id: uuidv4(),
          operating_mode: 'SINGLE_COMPUTER',
          db_type: 'sqlite',
          server_port: 4200,
          show_company_selector_on_startup: true,
          theme: 'light',
          ...updateData,
          created_at: new Date().toISOString(),
        });
      }
      if (iconChanged && isLoopbackRequest(req)) {
        try {
          await applySoftwareIconToDesktop(updateData.software_icon || null);
        } catch (iconErr) {
          console.warn('[Settings] Desktop icon apply warning:', iconErr);
        }
      }
      const settings = await db('app_settings').first();
      res.json(sanitizeAppSettings(settings));
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to save application settings.' });
    }
  });

  router.post('/settings/software-icon', adminRateLimiter, async (req: Request, res: Response) => {
    try {
      const softwareIcon =
        typeof req.body?.software_icon === 'string' && req.body.software_icon.trim()
          ? req.body.software_icon.trim()
          : null;

      // Only allow local host requests to invoke Windows desktop shortcut updates
      const desktopResult = isLoopbackRequest(req)
        ? await applySoftwareIconToDesktop(softwareIcon)
        : {
            desktopUpdated: false,
            shortcutsUpdated: [] as string[],
            message: 'Software icon saved for web clients.',
          };

      const now = new Date().toISOString();
      const existing = await db('app_settings').first();
      if (existing) {
        await db('app_settings').where({ id: existing.id }).update({
          software_icon: softwareIcon,
          updated_at: now,
        });
      } else {
        const { v4: uuidv4 } = await import('uuid');
        await db('app_settings').insert({
          id: uuidv4(),
          operating_mode: 'SINGLE_COMPUTER',
          db_type: 'sqlite',
          server_port: 4200,
          show_company_selector_on_startup: true,
          theme: 'light',
          software_icon: softwareIcon,
          created_at: now,
          updated_at: now,
        });
      }

      res.json({
        success: true,
        software_icon: softwareIcon,
        ...desktopResult,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update software icon' });
    }
  });

  router.post('/settings/test-db', dbTestRateLimiter, async (req: Request, res: Response) => {
    if (!isLoopbackRequest(req)) {
      return res.status(403).json({ success: false, error: 'Database connection testing is only allowed from the host machine.' });
    }
    const { pg_host, pg_port, pg_database, pg_user, pg_password } = req.body || {};
    if (!pg_host || !pg_database || !pg_user) {
      return res.status(400).json({ success: false, error: 'Host IP address, database name, and username are required.' });
    }
    try {
      const { host, port } = validateSafeDatabaseHost(pg_host, pg_port);
      let effectivePassword = typeof pg_password === 'string' && pg_password.length > 0 ? pg_password : undefined;
      if (!effectivePassword) {
        const saved = await db('app_settings').first();
        effectivePassword = saved?.pg_password || undefined;
      }

      const testKnex = knex({
        client: 'pg',
        connection: {
          host,
          port,
          database: String(pg_database).trim(),
          user: String(pg_user).trim(),
          password: effectivePassword,
          connectionTimeoutMillis: 5000,
        },
      });
      await testKnex.raw('SELECT 1');
      await testKnex.destroy();
      res.json({ success: true, message: `Successfully connected to PostgreSQL server at ${host}:${port}!` });
    } catch (err: any) {
      console.warn('[Settings] PostgreSQL connection test failed:', err?.message || err);
      const safeErr =
        err?.message && /Invalid database host|not permitted|Database port/.test(err.message)
          ? err.message
          : 'Unable to connect to PostgreSQL host. Please verify host, port, database name, and credentials.';
      res.status(400).json({ success: false, error: safeErr });
    }
  });

  // ===================== COMPANIES & BRANCHES =====================
  router.get('/companies', async (req: Request, res: Response) => {
    try {
      const companies = await companyService.getAllCompanies();
      res.json(companies);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies', async (req: Request, res: Response) => {
    try {
      const company = await companyService.createCompany(req.body);
      res.status(201).json(company);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const company = await companyService.getCompanyById(companyId);
      if (!company) return res.status(404).json({ error: 'Company not found' });
      res.json(company);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.put('/companies/:companyId', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const company = await companyService.updateCompany(companyId, req.body);
      res.json(company);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/default', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      await companyService.setDefaultCompany(companyId);
      res.json({ success: true });
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.delete('/companies/:companyId', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      await companyService.deleteCompany(companyId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId/branches', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const branches = await companyService.getBranches(companyId);
      res.json(branches);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/branches', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const branch = await companyService.createBranch(companyId, req.body);
      res.status(201).json(branch);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/companies/:companyId/branches/:branchId', async (req: Request, res: Response) => {
    try {
      const { companyId, branchId } = getParams(req);
      await companyService.deleteBranch(companyId, branchId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/companies/:companyId/branches/:branchId', async (req: Request, res: Response) => {
    try {
      const { companyId, branchId } = getParams(req);
      const branch = await companyService.updateBranch(companyId, branchId, req.body);
      res.json(branch);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId/settings', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const settings = await companyService.getCompanySettings(companyId);
      res.json(settings);
    } catch (err: any) {
      sendInternalError(res, err, 'Failed to load company settings.');
    }
  });

  router.put('/companies/:companyId/settings', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const savePathKeys = [
        'invoice_save_path',
        'quotation_save_path',
        'purchase_save_path',
        'report_save_path',
        'backup_save_path',
      ];
      const body = req.body || {};
      const touchesSavePath = savePathKeys.some((k) => Object.prototype.hasOwnProperty.call(body, k));
      if (touchesSavePath && !isLoopbackRequest(req)) {
        return res.status(403).json({ error: 'Local file save folders can only be modified from the host machine.' });
      }
      const settings = await companyService.updateCompanySettings(companyId, body);
      res.json(settings);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ===================== MASTER DATA =====================
  // Customers
  router.get('/companies/:companyId/customers', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const search = req.query.search as string;
      const customers = await masterDataService.getCustomers(companyId, search);
      res.json(customers);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/customers', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const customer = await masterDataService.createCustomer(companyId, req.body);
      res.status(201).json(customer);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/companies/:companyId/customers/:customerId', async (req: Request, res: Response) => {
    try {
      const { companyId, customerId } = getParams(req);
      const customer = await masterDataService.updateCustomer(companyId, customerId, req.body);
      res.json(customer);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/companies/:companyId/customers/:customerId', async (req: Request, res: Response) => {
    try {
      const { companyId, customerId } = getParams(req);
      await masterDataService.archiveCustomer(companyId, customerId);
      res.json({ success: true });
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  // Suppliers
  router.get('/companies/:companyId/suppliers', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const search = req.query.search as string;
      const suppliers = await masterDataService.getSuppliers(companyId, search);
      res.json(suppliers);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/suppliers', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const supplier = await masterDataService.createSupplier(companyId, req.body);
      res.status(201).json(supplier);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/companies/:companyId/suppliers/:supplierId', async (req: Request, res: Response) => {
    try {
      const { companyId, supplierId } = getParams(req);
      const supplier = await masterDataService.updateSupplier(companyId, supplierId, req.body);
      res.json(supplier);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/companies/:companyId/suppliers/:supplierId', async (req: Request, res: Response) => {
    try {
      const { companyId, supplierId } = getParams(req);
      await masterDataService.archiveSupplier(companyId, supplierId);
      res.json({ success: true });
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  // Products & Services
  router.get('/companies/:companyId/products', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const products = await masterDataService.getProducts(companyId, {
        item_type: req.query.item_type as any,
        category_id: req.query.category_id as string,
        search: req.query.search as string,
      });
      res.json(products);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/products', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const product = await masterDataService.createProduct(companyId, req.body);
      res.status(201).json(product);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/companies/:companyId/products/:productId', async (req: Request, res: Response) => {
    try {
      const { companyId, productId } = getParams(req);
      const product = await masterDataService.updateProduct(companyId, productId, req.body);
      res.json(product);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/companies/:companyId/products/:productId', async (req: Request, res: Response) => {
    try {
      const { companyId, productId } = getParams(req);
      await masterDataService.archiveProduct(companyId, productId);
      res.json({ success: true });
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  // Categories & Units
  router.get('/companies/:companyId/categories', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const cats = await masterDataService.getCategories(companyId);
      res.json(cats);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/categories', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const cat = await masterDataService.createCategory(companyId, req.body.name, req.body.description);
      res.status(201).json(cat);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/companies/:companyId/categories/:categoryId', async (req: Request, res: Response) => {
    try {
      const { companyId, categoryId } = getParams(req);
      await masterDataService.deleteCategory(companyId, categoryId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId/units', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const units = await masterDataService.getUnits(companyId);
      res.json(units);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  // Numbering Sequences
  router.get('/companies/:companyId/sequences', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const seqs = await masterDataService.getSequences(companyId);
      res.json(seqs);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.put('/companies/:companyId/sequences/:seqId', async (req: Request, res: Response) => {
    try {
      const { companyId, seqId } = getParams(req);
      const seq = await masterDataService.updateSequence(companyId, seqId, req.body);
      res.json(seq);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId/sequences/preview', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const docType = (req.query.document_type as string) || 'TAX_INVOICE';
      const branchId = req.query.branch_id as string;
      const preview = await NumberingService.previewNextNumber(db, companyId, docType, branchId);
      res.json({ preview });
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  // ===================== WORKSTATION PERMISSIONS & MD CONTROLS =====================
  router.get('/workstations/me', async (req: Request, res: Response) => {
    try {
      const meta = getRequestDeviceMeta(req);
      const ws = await workstationService.registerOrTouchWorkstation(
        meta.deviceId || 'local-host-pc',
        meta.deviceName,
        meta.remoteIp,
        meta.isLocal,
        meta.staffName
      );
      const [hasAdminPin, hasCustomPin] = await Promise.all([
        workstationService.hasAdminPin(),
        workstationService.isCustomAdminPinSet(),
      ]);
      res.json({
        workstation: ws,
        has_admin_pin: hasAdminPin,
        has_custom_pin: hasCustomPin,
        menu_catalog: MENU_CATALOG,
        presets: PRESET_PERMISSIONS,
      });
    } catch (err: any) {
      sendInternalError(res, err, 'Failed to load workstation permissions.');
    }
  });

  router.post('/workstations/staff', adminRateLimiter, async (req: Request, res: Response) => {
    try {
      const authorized = await requireAdminAuthorization(req, res);
      if (!authorized) return;
      const staffName = String(req.body?.staff_name || '').trim();
      if (!staffName) {
        return res.status(400).json({ error: 'Please enter a staff member name.' });
      }
      const allowedMenus = req.body?.allowed_menus;
      const canOpenSettings = Boolean(req.body?.can_open_settings);
      const ws = await workstationService.createStaffMember(staffName, allowedMenus, canOpenSettings);
      res.status(201).json({ success: true, workstation: ws });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to create staff member.' });
    }
  });

  router.get('/workstations', async (req: Request, res: Response) => {
    try {
      const authorized = await requireAdminReadAuthorization(req, res);
      if (!authorized) return;
      const [workstations, defaultStaffMenus, hasAdminPin, hasCustomPin] = await Promise.all([
        workstationService.listWorkstations(),
        workstationService.getDefaultStaffMenus(),
        workstationService.hasAdminPin(),
        workstationService.isCustomAdminPinSet(),
      ]);
      res.json({
        workstations,
        default_staff_menus: defaultStaffMenus,
        has_admin_pin: hasAdminPin,
        has_custom_pin: hasCustomPin,
        menu_catalog: MENU_CATALOG,
        presets: PRESET_PERMISSIONS,
      });
    } catch (err: any) {
      sendInternalError(res, err, 'Failed to list office workstations.');
    }
  });

  router.put('/workstations/default-staff-menus', adminRateLimiter, async (req: Request, res: Response) => {
    try {
      const authorized = await requireAdminAuthorization(req, res);
      if (!authorized) return;
      const menus = await workstationService.setDefaultStaffMenus(req.body?.allowed_menus || []);
      res.json({ success: true, default_staff_menus: menus });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update default staff menus.' });
    }
  });

  router.put('/workstations/:deviceId', adminRateLimiter, async (req: Request, res: Response) => {
    try {
      const authorized = await requireAdminAuthorization(req, res);
      if (!authorized) return;
      const { deviceId } = getParams(req);
      const updated = await workstationService.updateWorkstationPermission(deviceId, {
        device_name: req.body?.device_name,
        is_admin: req.body?.is_admin,
        allowed_menus: req.body?.allowed_menus,
        can_open_settings: req.body?.can_open_settings,
      });
      res.json({ success: true, workstation: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update workstation permissions.' });
    }
  });

  router.delete('/workstations/:deviceId', adminRateLimiter, async (req: Request, res: Response) => {
    try {
      const authorized = await requireAdminAuthorization(req, res);
      if (!authorized) return;
      const { deviceId } = getParams(req);
      await workstationService.deleteWorkstation(deviceId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to remove workstation.' });
    }
  });

  router.post('/workstations/admin-pin', adminRateLimiter, async (req: Request, res: Response) => {
    try {
      const newPin = String(req.body?.new_pin || '').trim();
      if (!/^\d{4}$/.test(newPin)) {
        return res.status(400).json({ error: 'MD / Admin PIN must be exactly 4 numeric digits (0-9).' });
      }
      const result = await workstationService.setAdminPin(newPin, req.body?.current_pin ?? null);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update MD / Admin PIN.' });
    }
  });

  router.post('/workstations/verify-pin', adminRateLimiter, async (req: Request, res: Response) => {
    try {
      const pin = String(req.body?.pin || '').trim();
      if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({ valid: false, error: 'PIN must be exactly 4 numeric digits.' });
      }
      const valid = await workstationService.checkAdminPin(pin);
      if (!valid) {
        return res.status(403).json({ valid: false, error: 'Incorrect 4-digit MD / Admin PIN.' });
      }
      res.json({ valid: true });
    } catch (err: any) {
      res.status(400).json({ valid: false, error: 'Failed to verify PIN.' });
    }
  });

  // ===================== INVOICES =====================
  router.get('/companies/:companyId/invoices', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const invoices = await invoiceService.getInvoices(companyId, {
        documentType: req.query.document_type as any,
        status: req.query.status as any,
        customerId: req.query.customer_id as string,
        startDate: req.query.start_date as string,
        endDate: req.query.end_date as string,
        search: req.query.search as string,
      });
      res.json(invoices);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.get('/companies/:companyId/invoices/:invoiceId', async (req: Request, res: Response) => {
    try {
      const { companyId, invoiceId } = getParams(req);
      const invoice = await invoiceService.getInvoiceById(companyId, invoiceId);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      res.json(invoice);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/invoices', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const meta = getRequestDeviceMeta(req);
      const invoice = await invoiceService.createInvoice(companyId, {
        ...req.body,
        created_by_device_id: meta.deviceId || undefined,
        created_by_device_name: meta.deviceName || undefined,
      });
      res.status(201).json(invoice);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/invoices/:invoiceId/finalize', async (req: Request, res: Response) => {
    try {
      const { companyId, invoiceId } = getParams(req);
      const invoice = await invoiceService.finalizeInvoice(companyId, invoiceId);
      res.json(invoice);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/invoices/:invoiceId/mark-paid', async (req: Request, res: Response) => {
    try {
      const { companyId, invoiceId } = getParams(req);
      const invoice = await invoiceService.markInvoiceAsPaid(companyId, invoiceId, {
        amount: req.body?.amount,
        paymentMethod: req.body?.payment_method,
        paymentDate: req.body?.payment_date,
        referenceNumber: req.body?.reference_number,
        notes: req.body?.notes,
        closeRemainingBalance: req.body?.close_remaining_balance,
      });
      res.json(invoice);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/invoices/:invoiceId/close', async (req: Request, res: Response) => {
    try {
      const { companyId, invoiceId } = getParams(req);
      const invoice = await invoiceService.closeInvoice(companyId, invoiceId, {
        reason: req.body?.reason,
        notes: req.body?.notes,
      });
      res.json(invoice);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/invoices/:invoiceId/cancel', async (req: Request, res: Response) => {
    try {
      const { companyId, invoiceId } = getParams(req);
      const invoice = await invoiceService.cancelInvoice(companyId, invoiceId, req.body.reason);
      res.json(invoice);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/companies/:companyId/invoices/:invoiceId', async (req: Request, res: Response) => {
    try {
      const { companyId, invoiceId } = getParams(req);
      await invoiceService.deleteInvoice(companyId, invoiceId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId/invoices/:invoiceId/pdf', async (req: Request, res: Response) => {
    try {
      const { companyId, invoiceId } = getParams(req);
      const invoice = await invoiceService.getInvoiceById(companyId, invoiceId);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

      const company = await companyService.getCompanyById(companyId);
      const branch = await db('branches').where({ id: invoice.branch_id }).first();

      let template: any = null;
      const requestedTemplateId = (req.query.template_id as string) || invoice.letterhead_template_id;
      if (requestedTemplateId) {
        template = await letterheadService.getTemplateById(companyId, requestedTemplateId);
      }
      if (!template) {
        template = await letterheadService.getDefaultTemplate(companyId);
      }
      if (template && (!template.file_path || !fs.existsSync(template.file_path))) {
        template = undefined;
      }

      const mode = (req.query.mode as any) || 'DIGITAL_LETTERHEAD';
      const pdfBytes = await PdfEngine.generateInvoicePdf(invoice, {
        mode,
        template: template || undefined,
        company: company!,
        branch,
      });

      // Optional: Securely save to validated local folder if configured in company_settings or app_settings
      try {
        const compSettings = await db('company_settings').where({ company_id: companyId }).first();
        const appSettings = await db('app_settings').first();
        const targetDir = compSettings?.invoice_save_path || appSettings?.invoice_save_path;
        if (targetDir) {
          writePdfToSafeLocalDir(targetDir, invoice.invoice_number, pdfBytes);
        }
      } catch (saveErr) {
        console.warn('[PDF] Custom local directory save blocked/warning:', saveErr);
      }

      const safeHeaderFileName = `${sanitizeFilenameSegment(invoice.invoice_number, 'invoice')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${safeHeaderFileName}"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err: any) {
      sendInternalError(res, err, 'Failed to generate invoice PDF.');
    }
  });

  // ===================== QUOTATIONS =====================
  router.get('/companies/:companyId/quotations', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const quotes = await quotationService.getQuotations(companyId, {
        status: req.query.status as any,
        customerId: req.query.customer_id as string,
        search: req.query.search as string,
      });
      res.json(quotes);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.get('/companies/:companyId/quotations/:quotationId', async (req: Request, res: Response) => {
    try {
      const { companyId, quotationId } = getParams(req);
      const q = await quotationService.getQuotationById(companyId, quotationId);
      if (!q) return res.status(404).json({ error: 'Quotation not found' });
      res.json(q);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/quotations', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const meta = getRequestDeviceMeta(req);
      const q = await quotationService.createQuotation(companyId, {
        ...req.body,
        created_by_device_id: meta.deviceId || undefined,
        created_by_device_name: meta.deviceName || undefined,
      });
      res.status(201).json(q);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/quotations/:quotationId/status', async (req: Request, res: Response) => {
    try {
      const { companyId, quotationId } = getParams(req);
      const q = await quotationService.updateQuotationStatus(companyId, quotationId, req.body.status);
      res.json(q);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/quotations/:quotationId/convert-to-invoice', async (req: Request, res: Response) => {
    try {
      const { companyId, quotationId } = getParams(req);
      const invoice = await quotationService.convertToInvoice(companyId, quotationId);
      res.json(invoice);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/companies/:companyId/quotations/:quotationId', async (req: Request, res: Response) => {
    try {
      const { companyId, quotationId } = getParams(req);
      await quotationService.deleteQuotation(companyId, quotationId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId/quotations/:quotationId/pdf', async (req: Request, res: Response) => {
    try {
      const { companyId, quotationId } = getParams(req);
      const quotation = await quotationService.getQuotationById(companyId, quotationId);
      if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

      const company = await companyService.getCompanyById(companyId);
      const branch = await db('branches').where({ id: quotation.branch_id }).first();

      let template: any = null;
      const requestedTemplateId = (req.query.template_id as string) || quotation.letterhead_template_id;
      if (requestedTemplateId) {
        template = await letterheadService.getTemplateById(companyId, requestedTemplateId);
      }
      if (!template) {
        template = await letterheadService.getDefaultTemplate(companyId);
      }
      if (template && (!template.file_path || !fs.existsSync(template.file_path))) {
        template = undefined;
      }

      const mode = (req.query.mode as any) || 'DIGITAL_LETTERHEAD';
      const pdfBytes = await PdfEngine.generateQuotationPdf(quotation, {
        mode,
        template: template || undefined,
        company: company!,
        branch,
      });

      // Optional: Securely save to validated local folder if configured in company_settings or app_settings
      try {
        const compSettings = await db('company_settings').where({ company_id: companyId }).first();
        const appSettings = await db('app_settings').first();
        const targetDir = compSettings?.quotation_save_path || appSettings?.quotation_save_path;
        if (targetDir) {
          writePdfToSafeLocalDir(targetDir, quotation.quotation_number, pdfBytes);
        }
      } catch (saveErr) {
        console.warn('[PDF] Custom local directory save blocked/warning:', saveErr);
      }

      const safeHeaderFileName = `${sanitizeFilenameSegment(quotation.quotation_number, 'quotation')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${safeHeaderFileName}"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err: any) {
      sendInternalError(res, err, 'Failed to generate quotation PDF.');
    }
  });

  // ===================== PURCHASING =====================
  router.get('/companies/:companyId/purchases/orders', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const pos = await purchaseService.getPurchaseOrders(companyId);
      res.json(pos);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/purchases/orders', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const po = await purchaseService.createPurchaseOrder(companyId, req.body);
      res.status(201).json(po);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/companies/:companyId/purchases/orders/:orderId', async (req: Request, res: Response) => {
    try {
      const { companyId, orderId } = getParams(req);
      await purchaseService.deletePurchaseOrder(companyId, orderId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId/purchases/invoices', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const bills = await purchaseService.getPurchaseInvoices(companyId);
      res.json(bills);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/purchases/invoices', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const meta = getRequestDeviceMeta(req);
      const bill = await purchaseService.createPurchaseInvoice(companyId, {
        ...req.body,
        created_by_device_id: meta.deviceId || undefined,
        created_by_device_name: meta.deviceName || undefined,
      });
      res.status(201).json(bill);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/companies/:companyId/purchases/invoices/:billId', async (req: Request, res: Response) => {
    try {
      const { companyId, billId } = getParams(req);
      await purchaseService.deletePurchaseInvoice(companyId, billId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/purchases/invoices/:billId/finalize', async (req: Request, res: Response) => {
    try {
      const { companyId, billId } = getParams(req);
      const bill = await purchaseService.finalizePurchaseInvoice(companyId, billId);
      res.json(bill);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ===================== INVENTORY & WAREHOUSES =====================
  router.get('/companies/:companyId/inventory/warehouses', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const whs = await inventoryService.getWarehouses(companyId);
      res.json(whs);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/inventory/warehouses', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const wh = await inventoryService.createWarehouse(companyId, req.body);
      res.status(201).json(wh);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/companies/:companyId/inventory/warehouses/:warehouseId', async (req: Request, res: Response) => {
    try {
      const { companyId, warehouseId } = getParams(req);
      const wh = await inventoryService.updateWarehouse(companyId, warehouseId, req.body);
      res.json(wh);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/companies/:companyId/inventory/warehouses/:warehouseId', async (req: Request, res: Response) => {
    try {
      const { companyId, warehouseId } = getParams(req);
      await inventoryService.deleteWarehouse(companyId, warehouseId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId/inventory/balances', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const balances = await inventoryService.getStockBalances(companyId, req.query.warehouse_id as string);
      res.json(balances);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.get('/companies/:companyId/inventory/transactions', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const txs = await inventoryService.getInventoryTransactions(companyId, {
        productId: req.query.product_id as string,
        warehouseId: req.query.warehouse_id as string,
        startDate: req.query.start_date as string,
        endDate: req.query.end_date as string,
      });
      res.json(txs);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/inventory/adjust', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      await inventoryService.recordStockAdjustment(companyId, req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/inventory/transfer', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      await inventoryService.transferStock(companyId, req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ===================== PAYMENTS =====================
  router.get('/companies/:companyId/payments/customer', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const payments = await paymentService.getCustomerPayments(companyId, req.query.customer_id as string);
      res.json(payments);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/payments/customer', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const meta = getRequestDeviceMeta(req);
      const payment = await paymentService.recordCustomerPayment(companyId, {
        ...req.body,
        created_by_device_id: meta.deviceId || undefined,
        created_by_device_name: meta.deviceName || undefined,
      });
      res.status(201).json(payment);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/companies/:companyId/payments/customer/:paymentId', async (req: Request, res: Response) => {
    try {
      const { companyId, paymentId } = getParams(req);
      await paymentService.deleteCustomerPayment(companyId, paymentId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId/payments/supplier', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const payments = await paymentService.getSupplierPayments(companyId, req.query.supplier_id as string);
      res.json(payments);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/payments/supplier', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const meta = getRequestDeviceMeta(req);
      const payment = await paymentService.recordSupplierPayment(companyId, {
        ...req.body,
        created_by_device_id: meta.deviceId || undefined,
        created_by_device_name: meta.deviceName || undefined,
      });
      res.status(201).json(payment);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/companies/:companyId/payments/supplier/:paymentId', async (req: Request, res: Response) => {
    try {
      const { companyId, paymentId } = getParams(req);
      await paymentService.deleteSupplierPayment(companyId, paymentId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ===================== REPORTS & DASHBOARD =====================
  router.get('/companies/:companyId/reports/dashboard', requireMenuAccess('dashboard'), async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const metrics = await reportService.getDashboardMetrics(companyId, {
        startDate: req.query.start_date as string,
        endDate: req.query.end_date as string,
      });
      res.json(metrics);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.get('/companies/:companyId/reports/gst-sales', requireMenuAccess('reports'), async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const report = await reportService.getGstSalesReport(
        companyId,
        req.query.start_date as string,
        req.query.end_date as string
      );
      res.json(report);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.get('/companies/:companyId/reports/staff-activity', requireMenuAccess('reports'), async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const activity = await workstationService.getStaffActivityReport(
        companyId,
        req.query.start_date as string,
        req.query.end_date as string
      );
      res.json(activity);
    } catch (err: any) {
      sendInternalError(res, err, 'Failed to load staff activity report.');
    }
  });

  // ===================== LETTERHEADS =====================
  router.get('/companies/:companyId/letterheads', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const templates = await letterheadService.getTemplates(companyId);
      res.json(templates);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/letterheads', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const template = await letterheadService.createTemplate(companyId, req.body);
      res.status(201).json(template);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/companies/:companyId/letterheads/:templateId', async (req: Request, res: Response) => {
    try {
      const { companyId, templateId } = getParams(req);
      const template = await letterheadService.updateTemplate(companyId, templateId, req.body);
      res.json(template);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/companies/:companyId/letterheads/:templateId', async (req: Request, res: Response) => {
    try {
      const { companyId, templateId } = getParams(req);
      await letterheadService.deleteTemplate(companyId, templateId);
      res.json({ success: true });
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/letterheads/analyze', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const analysis = await letterheadService.analyzeLetterhead(req.body.file_path, companyId);
      res.json(analysis);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/letterheads/analyze-file', uploadRateLimiter, upload.single('file'), async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const uploaded = req.file;
      if (!uploaded) {
        return res.status(400).json({ error: 'Please select a PDF, PNG, or JPG letterhead template file.' });
      }
      const saved = letterheadService.saveUploadedTemplateFile(companyId, uploaded.originalname, uploaded.buffer);
      const analysis = await letterheadService.analyzeLetterheadBuffer(
        uploaded.buffer,
        uploaded.originalname,
        saved.storedPath
      );
      res.json({
        ...analysis,
        stored_file_path: saved.storedPath,
        detected_file_type: saved.fileType,
        suggested_name: saved.cleanTitle,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/letterheads/import', uploadRateLimiter, upload.single('file'), async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const uploaded = req.file;
      if (!uploaded) {
        return res.status(400).json({ error: 'Please select a PDF, PNG, or JPG template file to import.' });
      }
      const isDefault = req.body?.is_default === 'true' || req.body?.is_default === true;
      const autoDetect = req.body?.auto_detect !== 'false' && req.body?.auto_detect !== false;
      const orientation = req.body?.orientation === 'LANDSCAPE' || req.body?.orientation === 'PORTRAIT'
        ? req.body.orientation
        : undefined;

      const result = await letterheadService.importTemplateFile(
        companyId,
        { originalname: uploaded.originalname, buffer: uploaded.buffer },
        {
          name: req.body?.name,
          orientation,
          is_default: isDefault,
          auto_detect: autoDetect,
        }
      );
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId/letterheads/:templateId/file', async (req: Request, res: Response) => {
    try {
      const { companyId, templateId } = getParams(req);
      const fileInfo = await letterheadService.getTemplateFile(companyId, templateId);
      const safeFileName = sanitizeFilenameSegment(fileInfo.fileName, 'template');
      res.setHeader('Content-Type', fileInfo.contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
      res.sendFile(fileInfo.filePath);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // ===================== EXPORT & TEMPLATES =====================
  router.get('/companies/:companyId/export/customers', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const buffer = await importExportService.exportCustomersToExcel(companyId);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Customers.xlsx"');
      res.send(buffer);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.get('/companies/:companyId/export/products', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const buffer = await importExportService.exportProductsToExcel(companyId);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Products.xlsx"');
      res.send(buffer);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.get('/companies/:companyId/export/suppliers', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const buffer = await importExportService.exportSuppliersToExcel(companyId);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Suppliers.xlsx"');
      res.send(buffer);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.get('/companies/:companyId/export/purchases', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const buffer = await importExportService.exportPurchasesToExcel(companyId);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Purchases.xlsx"');
      res.send(buffer);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.get('/companies/:companyId/export/inventory', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const buffer = await importExportService.exportInventoryToExcel(companyId);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Inventory_Stock.xlsx"');
      res.send(buffer);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.get('/companies/:companyId/export/payments-receivable', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const buffer = await importExportService.exportCustomerPaymentsToExcel(companyId);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Payments_Receivable.xlsx"');
      res.send(buffer);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.get('/companies/:companyId/export/payments-suppliers', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const buffer = await importExportService.exportSupplierPaymentsToExcel(companyId);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Payments_To_Suppliers.xlsx"');
      res.send(buffer);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.get('/export/template/:category', async (req: Request, res: Response) => {
    try {
      const { category } = getParams(req);
      const validCategories = [
        'customers',
        'products',
        'suppliers',
        'purchases',
        'inventory',
        'payments-receivable',
        'payments-suppliers',
      ];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `Unsupported template category: ${category}` });
      }
      const { filename, buffer } = await importExportService.getImportTemplate(category as any);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/companies/:companyId/import/:category', uploadRateLimiter, upload.single('file'), async (req: Request, res: Response) => {
    try {
      const { companyId, category } = getParams(req);
      const validCategories = [
        'customers',
        'products',
        'suppliers',
        'purchases',
        'inventory',
        'payments-receivable',
        'payments-suppliers',
      ];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `Unsupported import category: ${category}` });
      }
      const uploaded = req.file;
      if (!uploaded) {
        return res.status(400).json({ error: 'Please select an Excel (.xlsx) or CSV (.csv) file to import.' });
      }
      const result = await importExportService.importFromFile(
        companyId,
        category as any,
        uploaded.buffer,
        uploaded.originalname
      );
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ===================== BACKUP & RESTORE =====================
  router.get('/backups', requireMenuAccess('backup_restore'), async (req: Request, res: Response) => {
    try {
      const companyId = req.query.companyId ? String(req.query.companyId).trim() : '';
      const backups = await backupRestoreService.listBackups(companyId || undefined);
      res.json(backups);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.post('/backups', requireMenuAccess('backup_restore'), async (req: Request, res: Response) => {
    try {
      const companyId = req.body?.companyId ? String(req.body.companyId).trim() : '';
      const backup = companyId
        ? await backupRestoreService.createCompanyBackup(companyId)
        : await backupRestoreService.createFullBackup();
      res.status(201).json(backup);
    } catch (err: any) {
      sendInternalError(res, err);
    }
  });

  router.get('/backups/:filename/inspect', async (req: Request, res: Response) => {
    try {
      const { filename } = getParams(req);
      const companyId = req.query.companyId ? String(req.query.companyId).trim() : '';
      const info = await backupRestoreService.inspectSavedBackup(filename, companyId || undefined);
      res.json(info);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/backups/inspect-upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
      const uploaded = req.file;
      if (!uploaded) {
        return res.status(400).json({ error: 'Please select a .sqlite3 backup file.' });
      }
      const info = await backupRestoreService.inspectUploadedBuffer(uploaded.buffer);
      res.json(info);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/backups/:filename/download', async (req: Request, res: Response) => {
    try {
      const { filename } = getParams(req);
      const companyId = req.query.companyId ? String(req.query.companyId).trim() : '';
      const { filename: cleanName, filePath } = backupRestoreService.getDownloadableBackup(
        filename,
        companyId || undefined
      );
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${cleanName}"`);
      res.sendFile(filePath);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/backups/upload-restore', adminRateLimiter, upload.single('file'), async (req: Request, res: Response) => {
    try {
      const uploaded = req.file;
      if (!uploaded) {
        return res.status(400).json({ error: 'Please select a .sqlite3 backup file to restore.' });
      }
      const mode = req.body?.mode === 'INTO_COMPANY' ? 'INTO_COMPANY' : 'FULL_REPLACE';
      if (mode === 'FULL_REPLACE' && !isLoopbackRequest(req)) {
        return res.status(403).json({ error: 'Full database replacement is only permitted from the host machine.' });
      }
      const targetCompanyId = req.body?.targetCompanyId ? String(req.body.targetCompanyId) : undefined;
      const sourceCompanyId = req.body?.sourceCompanyId ? String(req.body.sourceCompanyId) : undefined;
      const summary = await backupRestoreService.restoreFromUploadedFile(uploaded.buffer, uploaded.originalname, {
        mode,
        targetCompanyId,
        sourceCompanyId,
      });
      res.json({ success: true, message: 'Database restored from uploaded backup file.', summary });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/backups/restore', adminRateLimiter, async (req: Request, res: Response) => {
    try {
      const mode = req.body?.mode === 'INTO_COMPANY' ? 'INTO_COMPANY' : 'FULL_REPLACE';
      if (mode === 'FULL_REPLACE' && !isLoopbackRequest(req)) {
        return res.status(403).json({ error: 'Full database replacement is only permitted from the host machine.' });
      }
      const targetCompanyId = req.body?.targetCompanyId ? String(req.body.targetCompanyId) : undefined;
      const sourceCompanyId = req.body?.sourceCompanyId ? String(req.body.sourceCompanyId) : undefined;
      const summary = await backupRestoreService.restoreFromBackup(req.body.filename, {
        mode,
        targetCompanyId,
        sourceCompanyId,
      });
      res.json({ success: true, message: 'Database restored successfully', summary });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
