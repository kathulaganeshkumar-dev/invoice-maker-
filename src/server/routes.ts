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
  const importExportService = new ImportExportService(db, masterDataService);
  const backupRestoreService = new BackupRestoreService(db);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  const getParams = (req: Request): Record<string, string> => req.params as any;

  // ===================== APP SETTINGS =====================
  router.get('/settings', async (req: Request, res: Response) => {
    try {
      const settings = await db('app_settings').first();
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/settings', async (req: Request, res: Response) => {
    try {
      const updateData = { ...req.body, updated_at: new Date().toISOString() };
      delete updateData.id;
      await db('app_settings').update(updateData);
      const settings = await db('app_settings').first();
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/settings/test-db', async (req: Request, res: Response) => {
    const { pg_host, pg_port, pg_database, pg_user, pg_password } = req.body;
    if (!pg_host || !pg_database || !pg_user) {
      return res.status(400).json({ success: false, error: 'Host IP address, database name, and username are required.' });
    }
    try {
      const testKnex = knex({
        client: 'pg',
        connection: {
          host: pg_host,
          port: Number(pg_port) || 5432,
          database: pg_database,
          user: pg_user,
          password: pg_password,
          connectionTimeoutMillis: 5000,
        },
      });
      await testKnex.raw('SELECT 1');
      await testKnex.destroy();
      res.json({ success: true, message: `Successfully connected to PostgreSQL server at ${pg_host}:${pg_port || 5432}!` });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to connect to database host.' });
    }
  });

  // ===================== COMPANIES & BRANCHES =====================
  router.get('/companies', async (req: Request, res: Response) => {
    try {
      const companies = await companyService.getAllCompanies();
      res.json(companies);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      const { branchId } = getParams(req);
      const branch = await companyService.updateBranch(branchId, req.body);
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
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/companies/:companyId/settings', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const settings = await companyService.updateCompanySettings(companyId, req.body);
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
    }
  });

  // Categories & Units
  router.get('/companies/:companyId/categories', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const cats = await masterDataService.getCategories(companyId);
      res.json(cats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
    }
  });

  // Numbering Sequences
  router.get('/companies/:companyId/sequences', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const seqs = await masterDataService.getSequences(companyId);
      res.json(seqs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId/invoices/:invoiceId', async (req: Request, res: Response) => {
    try {
      const { companyId, invoiceId } = getParams(req);
      const invoice = await invoiceService.getInvoiceById(companyId, invoiceId);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      res.json(invoice);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/invoices', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const invoice = await invoiceService.createInvoice(companyId, req.body);
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
        paymentMethod: req.body?.payment_method,
        paymentDate: req.body?.payment_date,
        referenceNumber: req.body?.reference_number,
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

      const mode = (req.query.mode as any) || 'DIGITAL_LETTERHEAD';
      const pdfBytes = await PdfEngine.generateInvoicePdf(invoice, {
        mode,
        template,
        company: company!,
        branch,
      });

      // Optional: Save to local folder if configured in company_settings or app_settings
      try {
        const compSettings = await db('company_settings').where({ company_id: companyId }).first();
        const appSettings = await db('app_settings').first();
        const targetDir = compSettings?.invoice_save_path || appSettings?.invoice_save_path;
        if (targetDir && fs.existsSync(targetDir)) {
          const safeName = `${invoice.invoice_number.replace(/[\/\\?%*:|"<>]/g, '_')}.pdf`;
          fs.writeFileSync(path.join(targetDir, safeName), Buffer.from(pdfBytes));
        }
      } catch (saveErr) {
        console.warn('[PDF] Custom local directory save error:', saveErr);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${invoice.invoice_number.replace(/\//g, '_')}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId/quotations/:quotationId', async (req: Request, res: Response) => {
    try {
      const { companyId, quotationId } = getParams(req);
      const q = await quotationService.getQuotationById(companyId, quotationId);
      if (!q) return res.status(404).json({ error: 'Quotation not found' });
      res.json(q);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/quotations', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const q = await quotationService.createQuotation(companyId, req.body);
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

      const mode = (req.query.mode as any) || 'DIGITAL_LETTERHEAD';
      const pdfBytes = await PdfEngine.generateQuotationPdf(quotation, {
        mode,
        template,
        company: company!,
        branch,
      });

      // Optional: Save to local folder if configured in company_settings or app_settings
      try {
        const compSettings = await db('company_settings').where({ company_id: companyId }).first();
        const appSettings = await db('app_settings').first();
        const targetDir = compSettings?.quotation_save_path || appSettings?.quotation_save_path;
        if (targetDir && fs.existsSync(targetDir)) {
          const safeName = `${quotation.quotation_number.replace(/[\/\\?%*:|"<>]/g, '_')}.pdf`;
          fs.writeFileSync(path.join(targetDir, safeName), Buffer.from(pdfBytes));
        }
      } catch (saveErr) {
        console.warn('[PDF] Custom local directory save error:', saveErr);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${quotation.quotation_number.replace(/\//g, '_')}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ===================== PURCHASING =====================
  router.get('/companies/:companyId/purchases/orders', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const pos = await purchaseService.getPurchaseOrders(companyId);
      res.json(pos);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/purchases/invoices', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const bill = await purchaseService.createPurchaseInvoice(companyId, req.body);
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/payments/customer', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const payment = await paymentService.recordCustomerPayment(companyId, req.body);
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
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/payments/supplier', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const payment = await paymentService.recordSupplierPayment(companyId, req.body);
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
  router.get('/companies/:companyId/reports/dashboard', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const metrics = await reportService.getDashboardMetrics(companyId, {
        startDate: req.query.start_date as string,
        endDate: req.query.end_date as string,
      });
      res.json(metrics);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/companies/:companyId/reports/gst-sales', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const report = await reportService.getGstSalesReport(
        companyId,
        req.query.start_date as string,
        req.query.end_date as string
      );
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ===================== LETTERHEADS =====================
  router.get('/companies/:companyId/letterheads', async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const templates = await letterheadService.getTemplates(companyId);
      res.json(templates);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/letterheads/analyze', async (req: Request, res: Response) => {
    try {
      const analysis = await letterheadService.analyzeLetterhead(req.body.file_path);
      res.json(analysis);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/companies/:companyId/letterheads/analyze-file', upload.single('file'), async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const targetCompanyId = (req.body?.target_company_id as string) || companyId;
      const uploaded = req.file;
      if (!uploaded) {
        return res.status(400).json({ error: 'Please select a PDF, PNG, or JPG letterhead template file.' });
      }
      const saved = letterheadService.saveUploadedTemplateFile(targetCompanyId, uploaded.originalname, uploaded.buffer);
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

  router.post('/companies/:companyId/letterheads/import', upload.single('file'), async (req: Request, res: Response) => {
    try {
      const { companyId } = getParams(req);
      const targetCompanyId = (req.body?.target_company_id as string) || companyId;
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
        targetCompanyId,
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
      res.setHeader('Content-Type', fileInfo.contentType);
      res.setHeader('Content-Disposition', `inline; filename="${fileInfo.fileName}"`);
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/export/template/customers', async (req: Request, res: Response) => {
    try {
      const buffer = await importExportService.getCustomerImportTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Customer_Import_Template.xlsx"');
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ===================== BACKUP & RESTORE =====================
  router.get('/backups', async (req: Request, res: Response) => {
    try {
      const backups = await backupRestoreService.listBackups();
      res.json(backups);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/backups', async (req: Request, res: Response) => {
    try {
      const backup = await backupRestoreService.createFullBackup();
      res.status(201).json(backup);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/backups/restore', async (req: Request, res: Response) => {
    try {
      await backupRestoreService.restoreFromBackup(req.body.filename);
      res.json({ success: true, message: 'Database restored successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
