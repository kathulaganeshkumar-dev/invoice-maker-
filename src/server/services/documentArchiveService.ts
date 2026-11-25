// src/server/services/documentArchiveService.ts - Automatic Host Server File Archiving Engine
import fs from 'fs';
import path from 'path';
import { Knex } from 'knex';
import { PdfEngine } from './pdfEngine';
import { getDefaultDataDir } from '../database/connection';
import { validateSafeLocalSaveDir, sanitizeFilenameSegment } from './pathSecurity';
import { InvoiceService } from './invoiceService';
import { QuotationService } from './quotationService';
import { CompanyService } from './companyService';
import { LetterheadService } from './letterheadService';

export class DocumentArchiveService {
  constructor(
    private db: Knex,
    private companyService: CompanyService,
    private invoiceService: InvoiceService,
    private quotationService: QuotationService,
    private letterheadService: LetterheadService
  ) {}

  /**
   * Automatically archives an invoice on the Host PC disk:
   * 1. Uses the user-configured invoice_save_path (from company_settings or app_settings)
   * 2. If not configured or invalid, automatically saves into <server_data_dir>/invoices/
   * 3. Generates the vector-accurate PDF and stores it permanently on the Host PC.
   */
  async archiveInvoice(companyId: string, invoiceId: string): Promise<{ savedPath: string | null; error?: string }> {
    try {
      const invoice = await this.invoiceService.getInvoiceById(companyId, invoiceId);
      if (!invoice) return { savedPath: null, error: 'Invoice not found' };

      const company = await this.companyService.getCompanyById(companyId);
      if (!company) return { savedPath: null, error: 'Company not found' };

      const branch = invoice.branch_id
        ? await this.companyService.getBranchById(companyId, invoice.branch_id)
        : null;

      const template = (invoice as any).letterhead_template_id
        ? await this.letterheadService.getTemplateById(companyId, (invoice as any).letterhead_template_id)
        : null;

      const pdfBytes = await PdfEngine.generateInvoicePdf(invoice, {
        mode: 'DIGITAL_LETTERHEAD',
        template: template || undefined,
        company,
        branch,
      });

      // Determine target folder on the Host PC
      const compSettings = await this.db('company_settings').where({ company_id: companyId }).first();
      const appSettings = await this.db('app_settings').first();
      const customPath = compSettings?.invoice_save_path || appSettings?.invoice_save_path;

      let targetDir = '';
      if (customPath && String(customPath).trim()) {
        try {
          targetDir = validateSafeLocalSaveDir(customPath);
        } catch (dirErr) {
          console.warn('[Archive] Custom invoice save path invalid, falling back to default:', dirErr);
        }
      }

      if (!targetDir) {
        targetDir = path.join(getDefaultDataDir(), 'invoices');
      }

      // Enforce strict company data isolation on disk by saving in company-specific subfolder
      const companyFolder = sanitizeFilenameSegment(company.name || company.legal_name || companyId, 'company');
      const companyTargetDir = path.join(targetDir, companyFolder);

      if (!fs.existsSync(companyTargetDir)) {
        fs.mkdirSync(companyTargetDir, { recursive: true });
      }

      const safeFileName = `${sanitizeFilenameSegment(invoice.invoice_number, 'invoice')}.pdf`;
      const fullFilePath = path.join(companyTargetDir, safeFileName);
      fs.writeFileSync(fullFilePath, Buffer.from(pdfBytes));

      // Also save JSON data payload for comprehensive business data backup
      const jsonFileName = `${sanitizeFilenameSegment(invoice.invoice_number, 'invoice')}.json`;
      const fullJsonPath = path.join(companyTargetDir, jsonFileName);
      fs.writeFileSync(fullJsonPath, JSON.stringify(invoice, null, 2), 'utf-8');

      console.log(`[Archive] Invoice ${invoice.invoice_number} saved on Host PC at: ${fullFilePath}`);
      return { savedPath: fullFilePath };
    } catch (err: any) {
      console.error('[Archive] Failed to archive invoice on Host PC:', err);
      return { savedPath: null, error: err.message };
    }
  }

  /**
   * Automatically archives a quotation on the Host PC disk:
   * 1. Uses quotation_save_path (from company_settings or app_settings)
   * 2. If not configured, saves into <server_data_dir>/quotations/
   */
  async archiveQuotation(companyId: string, quotationId: string): Promise<{ savedPath: string | null; error?: string }> {
    try {
      const quotation = await this.quotationService.getQuotationById(companyId, quotationId);
      if (!quotation) return { savedPath: null, error: 'Quotation not found' };

      const company = await this.companyService.getCompanyById(companyId);
      if (!company) return { savedPath: null, error: 'Company not found' };

      const branch = quotation.branch_id
        ? await this.companyService.getBranchById(companyId, quotation.branch_id)
        : null;

      const template = (quotation as any).letterhead_template_id
        ? await this.letterheadService.getTemplateById(companyId, (quotation as any).letterhead_template_id)
        : null;

      const pdfBytes = await PdfEngine.generateQuotationPdf(quotation, {
        mode: 'DIGITAL_LETTERHEAD',
        template: template || undefined,
        company,
        branch,
      } as any);

      // Determine target folder on the Host PC
      const compSettings = await this.db('company_settings').where({ company_id: companyId }).first();
      const appSettings = await this.db('app_settings').first();
      const customPath = compSettings?.quotation_save_path || appSettings?.quotation_save_path;

      let targetDir = '';
      if (customPath && String(customPath).trim()) {
        try {
          targetDir = validateSafeLocalSaveDir(customPath);
        } catch (dirErr) {
          console.warn('[Archive] Custom quotation save path invalid, falling back to default:', dirErr);
        }
      }

      if (!targetDir) {
        targetDir = path.join(getDefaultDataDir(), 'quotations');
      }

      // Enforce strict company data isolation on disk by saving in company-specific subfolder
      const companyFolder = sanitizeFilenameSegment(company.name || company.legal_name || companyId, 'company');
      const companyTargetDir = path.join(targetDir, companyFolder);

      if (!fs.existsSync(companyTargetDir)) {
        fs.mkdirSync(companyTargetDir, { recursive: true });
      }

      const safeFileName = `${sanitizeFilenameSegment(quotation.quotation_number, 'quotation')}.pdf`;
      const fullFilePath = path.join(companyTargetDir, safeFileName);
      fs.writeFileSync(fullFilePath, Buffer.from(pdfBytes));

      // Also save JSON data payload
      const jsonFileName = `${sanitizeFilenameSegment(quotation.quotation_number, 'quotation')}.json`;
      const fullJsonPath = path.join(companyTargetDir, jsonFileName);
      fs.writeFileSync(fullJsonPath, JSON.stringify(quotation, null, 2), 'utf-8');

      console.log(`[Archive] Quotation ${quotation.quotation_number} saved on Host PC at: ${fullFilePath}`);
      return { savedPath: fullFilePath };
    } catch (err: any) {
      console.error('[Archive] Failed to archive quotation on Host PC:', err);
      return { savedPath: null, error: err.message };
    }
  }

  /**
   * Automatically archives purchase bill data on the Host PC disk.
   */
  async archivePurchaseBill(companyId: string, bill: any): Promise<{ savedPath: string | null }> {
    try {
      const compSettings = await this.db('company_settings').where({ company_id: companyId }).first();
      const appSettings = await this.db('app_settings').first();
      const customPath = compSettings?.purchase_save_path || appSettings?.purchase_save_path;

      let targetDir = '';
      if (customPath && String(customPath).trim()) {
        try {
          targetDir = validateSafeLocalSaveDir(customPath);
        } catch (dirErr) {
          console.warn('[Archive] Custom purchase save path invalid:', dirErr);
        }
      }

      if (!targetDir) {
        targetDir = path.join(getDefaultDataDir(), 'purchases');
      }

      const comp = await this.companyService.getCompanyById(companyId).catch(() => null);
      const companyFolder = sanitizeFilenameSegment(comp?.name || comp?.legal_name || companyId, 'company');
      const companyTargetDir = path.join(targetDir, companyFolder);

      if (!fs.existsSync(companyTargetDir)) {
        fs.mkdirSync(companyTargetDir, { recursive: true });
      }

      const safeFileName = `${sanitizeFilenameSegment(bill.bill_number || bill.id, 'purchase_bill')}.json`;
      const fullFilePath = path.join(companyTargetDir, safeFileName);
      fs.writeFileSync(fullFilePath, JSON.stringify(bill, null, 2), 'utf-8');

      return { savedPath: fullFilePath };
    } catch (err) {
      console.error('[Archive] Failed to archive purchase bill on Host PC:', err);
      return { savedPath: null };
    }
  }
}
