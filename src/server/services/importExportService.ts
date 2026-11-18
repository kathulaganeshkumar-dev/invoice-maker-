// src/server/services/importExportService.ts - Full Excel & CSV Backup / Import Portability Engine
import { Knex } from 'knex';
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { MasterDataService } from './masterDataService';
import { PurchaseService } from './purchaseService';
import { PaymentService } from './paymentService';
import { CustomerBankAccount, CustomerType, PaymentMethod } from '../../shared/types';
import { INDIAN_STATES } from '../../shared/constants';

export type ImportCategory =
  | 'customers'
  | 'products'
  | 'suppliers'
  | 'purchases'
  | 'inventory'
  | 'payments-receivable'
  | 'payments-suppliers';

export interface ImportResult {
  category: ImportCategory;
  imported: number;
  updated: number;
  skipped: number;
  extraColumnsCaptured: string[];
  errors: string[];
}

interface ParsedRow {
  rowNumber: number;
  values: Record<string, string>; // original header -> cleaned string value
}

interface ParsedSheet {
  name: string;
  headers: string[];
  rows: ParsedRow[];
}

/**
 * Sanitizes cell values to prevent CSV / Excel formula injection (CWE-1236).
 * Any string value starting with formula indicators (=, +, -, @, \t, \r) is prefixed with a single quote (').
 */
export function sanitizeCellValue<T>(val: T): T {
  if (typeof val === 'string' && /^[=+@\-\t\r]/.test(val)) {
    return ("'" + val) as unknown as T;
  }
  return val;
}

function normalizeHeader(header: string): string {
  return String(header || '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[*₹%#]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanImportedCell(raw: any): string {
  if (raw === null || raw === undefined) return '';
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const yy = raw.getFullYear();
    const mm = String(raw.getMonth() + 1).padStart(2, '0');
    const dd = String(raw.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }
  if (typeof raw === 'object') {
    if ('text' in raw && typeof raw.text === 'string') return stripExportPrefix(raw.text);
    if ('result' in raw && raw.result !== undefined && raw.result !== null) return stripExportPrefix(String(raw.result));
    if ('richText' in raw && Array.isArray(raw.richText)) {
      return stripExportPrefix(raw.richText.map((rt: any) => rt.text || '').join(''));
    }
  }
  return stripExportPrefix(String(raw));
}

function stripExportPrefix(val: string): string {
  const trimmed = val.trim();
  // Remove leading single quote that sanitizeCellValue adds for formula safety on export
  if (trimmed.length >= 2 && trimmed.startsWith("'") && /^[=+@\-\t\r]/.test(trimmed[1])) {
    return trimmed.slice(1).trim();
  }
  return trimmed;
}

function parseCsvText(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const text = csvText.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function parseDecimalStr(val: string, fallback = '0.00'): string {
  const cleaned = String(val || '').replace(/[₹,\s]/g, '').trim();
  if (!cleaned) return fallback;
  try {
    const d = new Decimal(cleaned);
    return d.isFinite() ? d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) : fallback;
  } catch {
    return fallback;
  }
}

function parseOptionalDecimalStr(val: string): string | null {
  const cleaned = String(val || '').replace(/[₹,\s]/g, '').trim();
  if (!cleaned) return null;
  try {
    const d = new Decimal(cleaned);
    return d.isFinite() ? d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) : null;
  } catch {
    return null;
  }
}

function parseDateIso(val: string, fallback = ''): string {
  const v = String(val || '').trim();
  if (!v) return fallback;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  // Support DD/MM/YYYY or DD-MM-YYYY
  const dmy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${mm}-${dd}`;
  }
  const dt = new Date(v);
  if (!isNaN(dt.getTime())) {
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }
  return fallback;
}

function parseBoolYes(val: string, defaultVal = false): boolean {
  const v = String(val || '').trim().toLowerCase();
  if (!v) return defaultVal;
  return v === 'yes' || v === 'true' || v === '1' || v === 'y' || v === 'received & posted' || v === 'finalized';
}

function resolveStateAndCode(rawState: string, rawCode: string): { state: string; stateCode: string } {
  const st = rawState.trim();
  const code = rawCode.trim();
  if (st && code) return { state: st, stateCode: code.padStart(2, '0').slice(0, 2) };
  if (code) {
    const found = INDIAN_STATES.find((s) => s.code === code.padStart(2, '0'));
    return { state: found?.name || '', stateCode: code.padStart(2, '0').slice(0, 2) };
  }
  if (st) {
    const found = INDIAN_STATES.find((s) => s.name.toLowerCase() === st.toLowerCase());
    return { state: found?.name || st, stateCode: found?.code || '' };
  }
  return { state: '', stateCode: '' };
}

function parseAdditionalBankAccounts(raw: string): CustomerBankAccount[] {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through to semicolon parsing
    }
  }
  return trimmed
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split('|').map((p) => p.trim());
      let bank_name = '';
      let bank_account_no = '';
      let bank_ifsc = '';
      let bank_branch = '';
      for (const p of parts) {
        if (/^a\/c\s*:/i.test(p)) bank_account_no = p.replace(/^a\/c\s*:/i, '').trim();
        else if (/^ifsc\s*:/i.test(p)) bank_ifsc = p.replace(/^ifsc\s*:/i, '').trim().toUpperCase();
        else if (/^branch\s*:/i.test(p)) bank_branch = p.replace(/^branch\s*:/i, '').trim();
        else if (!bank_name) bank_name = p;
        else if (!bank_account_no) bank_account_no = p;
        else if (!bank_ifsc) bank_ifsc = p.toUpperCase();
        else bank_branch = p;
      }
      return { bank_name, bank_account_no, bank_ifsc, bank_branch };
    })
    .filter((b) => b.bank_name || b.bank_account_no || b.bank_ifsc || b.bank_branch);
}

function normalizeCustomerType(raw: string): CustomerType {
  const v = raw.trim().toUpperCase();
  if (v.includes('GOV')) return 'GOVERNMENT';
  if (v.includes('INFRA')) return 'INFRASTRUCTURE';
  if (v.includes('EDU')) return 'EDUCATION';
  return 'CORPORATE';
}

function normalizePaymentMode(raw: string): PaymentMethod {
  const v = raw.trim().toUpperCase();
  if (!v) return 'BANK_TRANSFER';
  if (v.includes('CASH')) return 'CASH';
  if (v.includes('CHEQUE') || v.includes('CHECK')) return 'CHEQUE';
  if (v.includes('CARD')) return 'CARD';
  return 'BANK_TRANSFER';
}

/**
 * Helper to extract fields from a parsed row by alias list while tracking matched headers,
 * so ALL remaining non-empty columns can be automatically captured into Notes (Rule 3).
 */
class RowMapper {
  private matchedHeaders = new Set<string>();
  private normMap = new Map<string, { header: string; value: string }>();

  constructor(private row: ParsedRow) {
    for (const [header, value] of Object.entries(row.values)) {
      const norm = normalizeHeader(header);
      if (norm && !this.normMap.has(norm)) {
        this.normMap.set(norm, { header, value });
      }
    }
  }

  get(...aliases: string[]): string {
    for (const alias of aliases) {
      const norm = normalizeHeader(alias);
      const found = this.normMap.get(norm);
      if (found) {
        this.matchedHeaders.add(found.header);
        return found.value;
      }
    }
    return '';
  }

  /**
   * Collects explicit `Notes` column plus any extra unrecognized columns as `Header: Value`
   */
  collectNotesAndExtras(extraTracker: Set<string>): string {
    const explicitNotes = this.get('notes', 'note', 'remarks', 'extra details', 'additional notes', 'company notes');
    const extras: string[] = [];

    for (const [header, value] of Object.entries(this.row.values)) {
      if (this.matchedHeaders.has(header)) continue;
      if (!value || !value.trim()) continue;
      extraTracker.add(header);
      extras.push(`${header}: ${value.trim()}`);
    }

    if (explicitNotes && extras.length > 0) {
      return `${explicitNotes}\n${extras.join(' | ')}`;
    }
    if (extras.length > 0) {
      return extras.join(' | ');
    }
    return explicitNotes;
  }
}

export class ImportExportService {
  private purchaseService: PurchaseService;
  private paymentService: PaymentService;

  constructor(
    private db: Knex,
    private masterDataService: MasterDataService,
    purchaseService?: PurchaseService,
    paymentService?: PaymentService
  ) {
    this.purchaseService = purchaseService || new PurchaseService(db);
    this.paymentService = paymentService || new PaymentService(db);
  }

  private styleHeaderRow(sheet: ExcelJS.Worksheet) {
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };
  }

  private async parseUploadedSheets(buffer: Buffer, originalName: string): Promise<ParsedSheet[]> {
    const lower = (originalName || '').toLowerCase();
    if (lower.endsWith('.csv')) {
      const csvRows = parseCsvText(buffer.toString('utf8'));
      if (csvRows.length === 0) return [];
      const headers = csvRows[0].map((h, i) => h.trim() || `Column_${i + 1}`);
      const rows: ParsedRow[] = [];
      for (let r = 1; r < csvRows.length; r++) {
        const line = csvRows[r];
        const values: Record<string, string> = {};
        let hasAny = false;
        headers.forEach((h, idx) => {
          const val = cleanImportedCell(line[idx] ?? '');
          if (val) hasAny = true;
          values[h] = val;
        });
        if (hasAny) rows.push({ rowNumber: r + 1, values });
      }
      return [{ name: 'CSV', headers, rows }];
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheets: ParsedSheet[] = [];

    workbook.eachSheet((ws) => {
      const headers: string[] = [];
      const headerRow = ws.getRow(1);
      headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        headers[colNumber - 1] = cleanImportedCell(cell.value);
      });
      if (headers.filter(Boolean).length === 0) return;

      const rows: ParsedRow[] = [];
      for (let r = 2; r <= ws.rowCount; r++) {
        const excelRow = ws.getRow(r);
        const values: Record<string, string> = {};
        let hasAny = false;
        for (let c = 0; c < headers.length; c++) {
          const header = headers[c];
          if (!header) continue;
          const cellVal = cleanImportedCell(excelRow.getCell(c + 1).value);
          if (cellVal) hasAny = true;
          values[header] = cellVal;
        }
        if (hasAny) {
          rows.push({ rowNumber: r, values });
        }
      }
      sheets.push({ name: ws.name, headers: headers.filter(Boolean), rows });
    });

    return sheets;
  }

  // ===================== EXPORTS (7 CATEGORIES) =====================

  async exportCustomersToExcel(companyId: string): Promise<Buffer> {
    const customers = await this.masterDataService.getCustomers(companyId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Customers');

    sheet.columns = [
      { header: 'Customer Type', key: 'customer_type', width: 16 },
      { header: 'Customer / Trade Name', key: 'name', width: 26 },
      { header: 'Company Name', key: 'company_name', width: 25 },
      { header: 'Contact Person', key: 'contact_person', width: 20 },
      { header: 'Mobile Phone', key: 'mobile', width: 16 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'GSTIN', key: 'gstin', width: 18 },
      { header: 'PAN', key: 'pan', width: 14 },
      { header: 'Year of Registration', key: 'registration_year', width: 20 },
      { header: 'Billing Address', key: 'billing_address', width: 35 },
      { header: 'City', key: 'city', width: 16 },
      { header: 'State', key: 'state', width: 20 },
      { header: 'State Code', key: 'state_code', width: 12 },
      { header: 'PIN Code', key: 'pin_code', width: 12 },
      { header: 'Payment Reminder (Days)', key: 'payment_terms_days', width: 22 },
      { header: 'Bank Name', key: 'bank_name', width: 22 },
      { header: 'Bank Account Number', key: 'bank_account_no', width: 22 },
      { header: 'IFSC Code', key: 'bank_ifsc', width: 15 },
      { header: 'Branch Details', key: 'bank_branch', width: 25 },
      { header: 'Additional Bank Accounts', key: 'additional_banks', width: 35 },
      { header: 'Opening Balance (₹)', key: 'opening_balance', width: 18 },
      { header: 'Current Balance (₹)', key: 'current_balance', width: 18 },
      { header: 'Notes', key: 'notes', width: 35 },
    ];
    this.styleHeaderRow(sheet);

    for (const c of customers) {
      const extraBanks = (c.additional_bank_accounts || [])
        .map((b) => [b.bank_name, b.bank_account_no && `A/c: ${b.bank_account_no}`, b.bank_ifsc && `IFSC: ${b.bank_ifsc}`, b.bank_branch && `Branch: ${b.bank_branch}`].filter(Boolean).join(' | '))
        .filter(Boolean)
        .join('; ');

      sheet.addRow({
        customer_type: sanitizeCellValue(c.customer_type),
        name: sanitizeCellValue(c.name),
        company_name: sanitizeCellValue(c.company_name || ''),
        contact_person: sanitizeCellValue(c.contact_person || ''),
        mobile: sanitizeCellValue(c.mobile),
        email: sanitizeCellValue(c.email || ''),
        gstin: sanitizeCellValue(c.gstin || ''),
        pan: sanitizeCellValue(c.pan || ''),
        registration_year: sanitizeCellValue(c.registration_year || ''),
        billing_address: sanitizeCellValue(c.billing_address || ''),
        city: sanitizeCellValue(c.city || ''),
        state: sanitizeCellValue(c.state || ''),
        state_code: sanitizeCellValue(c.state_code || ''),
        pin_code: sanitizeCellValue(c.pin_code || ''),
        payment_terms_days: c.payment_terms_days || '',
        bank_name: sanitizeCellValue(c.bank_name || ''),
        bank_account_no: sanitizeCellValue(c.bank_account_no || ''),
        bank_ifsc: sanitizeCellValue(c.bank_ifsc || ''),
        bank_branch: sanitizeCellValue(c.bank_branch || ''),
        additional_banks: sanitizeCellValue(extraBanks),
        opening_balance: c.opening_balance || '0.00',
        current_balance: c.current_balance || '0.00',
        notes: sanitizeCellValue(c.notes || ''),
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportProductsToExcel(companyId: string): Promise<Buffer> {
    const products = await this.masterDataService.getProducts(companyId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products & Services');

    sheet.columns = [
      { header: 'Type', key: 'item_type', width: 12 },
      { header: 'Item Name', key: 'name', width: 30 },
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Category', key: 'category_name', width: 20 },
      { header: 'HSN/SAC', key: 'hsn_or_sac', width: 14 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'GST Rate (%)', key: 'gst_rate', width: 12 },
      { header: 'Purchase Price (₹)', key: 'purchase_price', width: 18 },
      { header: 'Min Selling Price (₹)', key: 'min_selling_price', width: 20 },
      { header: 'Max Selling Price (₹)', key: 'max_selling_price', width: 20 },
      { header: 'Selling Price (₹)', key: 'selling_price', width: 18 },
      { header: 'Tax Inclusive', key: 'is_tax_inclusive', width: 14 },
      { header: 'Current Stock', key: 'current_stock', width: 15 },
      { header: 'Minimum Stock', key: 'minimum_stock', width: 15 },
      { header: 'Custom Notes', key: 'custom_notes', width: 32 },
      { header: 'Notes', key: 'notes', width: 35 },
    ];
    this.styleHeaderRow(sheet);

    for (const p of products) {
      sheet.addRow({
        item_type: sanitizeCellValue(p.item_type),
        name: sanitizeCellValue(p.name),
        sku: sanitizeCellValue(p.sku || ''),
        category_name: sanitizeCellValue(p.category_name || ''),
        hsn_or_sac: sanitizeCellValue(p.hsn_or_sac || ''),
        unit: sanitizeCellValue(p.unit || ''),
        gst_rate: p.gst_rate,
        purchase_price: p.purchase_price,
        min_selling_price: p.min_selling_price || '',
        max_selling_price: p.max_selling_price || '',
        selling_price: p.selling_price,
        is_tax_inclusive: p.is_tax_inclusive ? 'YES' : 'NO',
        current_stock: p.current_stock,
        minimum_stock: p.minimum_stock,
        custom_notes: sanitizeCellValue(Array.isArray(p.custom_notes) ? p.custom_notes.join(' | ') : ''),
        notes: sanitizeCellValue(p.description || ''),
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportSuppliersToExcel(companyId: string): Promise<Buffer> {
    const suppliers = await this.masterDataService.getSuppliers(companyId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Suppliers');

    sheet.columns = [
      { header: 'Supplier / Company Name', key: 'name', width: 28 },
      { header: 'Trade Name', key: 'company_name', width: 24 },
      { header: 'Contact Person', key: 'contact_person', width: 20 },
      { header: 'Mobile', key: 'mobile', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'GSTIN', key: 'gstin', width: 18 },
      { header: 'PAN', key: 'pan', width: 14 },
      { header: 'Address', key: 'address', width: 35 },
      { header: 'State', key: 'state', width: 20 },
      { header: 'State Code', key: 'state_code', width: 12 },
      { header: 'PIN Code', key: 'pin_code', width: 12 },
      { header: 'Payment Reminder (Days)', key: 'payment_terms_days', width: 22 },
      { header: 'Bank Name', key: 'bank_name', width: 22 },
      { header: 'Bank Account Number', key: 'bank_account_no', width: 22 },
      { header: 'IFSC Code', key: 'bank_ifsc', width: 15 },
      { header: 'Branch Details', key: 'bank_branch', width: 24 },
      { header: 'Additional Bank Accounts', key: 'additional_banks', width: 35 },
      { header: 'Opening Balance (₹)', key: 'opening_balance', width: 18 },
      { header: 'Outstanding Payable (₹)', key: 'current_balance', width: 22 },
      { header: 'Notes', key: 'notes', width: 35 },
    ];
    this.styleHeaderRow(sheet);

    for (const s of suppliers) {
      const extraBanks = (s.additional_bank_accounts || [])
        .map((b) => [b.bank_name, b.bank_account_no && `A/c: ${b.bank_account_no}`, b.bank_ifsc && `IFSC: ${b.bank_ifsc}`, b.bank_branch && `Branch: ${b.bank_branch}`].filter(Boolean).join(' | '))
        .filter(Boolean)
        .join('; ');

      sheet.addRow({
        name: sanitizeCellValue(s.name),
        company_name: sanitizeCellValue(s.company_name || ''),
        contact_person: sanitizeCellValue(s.contact_person || ''),
        mobile: sanitizeCellValue(s.mobile),
        email: sanitizeCellValue(s.email || ''),
        gstin: sanitizeCellValue(s.gstin || ''),
        pan: sanitizeCellValue(s.pan || ''),
        address: sanitizeCellValue(s.address || ''),
        state: sanitizeCellValue(s.state || ''),
        state_code: sanitizeCellValue(s.state_code || ''),
        pin_code: sanitizeCellValue(s.pin_code || ''),
        payment_terms_days: s.payment_terms_days || '',
        bank_name: sanitizeCellValue(s.bank_name || ''),
        bank_account_no: sanitizeCellValue(s.bank_account_no || ''),
        bank_ifsc: sanitizeCellValue(s.bank_ifsc || ''),
        bank_branch: sanitizeCellValue(s.bank_branch || ''),
        additional_banks: sanitizeCellValue(extraBanks),
        opening_balance: s.opening_balance || '0.00',
        current_balance: s.current_balance || '0.00',
        notes: sanitizeCellValue(s.notes || ''),
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportPurchasesToExcel(companyId: string): Promise<Buffer> {
    const [bills, warehouses] = await Promise.all([
      this.db('purchase_invoices').where({ company_id: companyId }).orderBy('bill_date', 'desc'),
      this.db('warehouses').where({ company_id: companyId }),
    ]);

    const whMap = new Map<string, string>(warehouses.map((w: any) => [w.id, `${w.name} (${w.code})`]));
    const billIds = bills.map((b: any) => b.id);
    const items = billIds.length > 0
      ? await this.db('purchase_invoice_items').whereIn('purchase_invoice_id', billIds)
      : [];
    const billMap = new Map<string, any>(bills.map((b: any) => [b.id, b]));

    const workbook = new ExcelJS.Workbook();

    const billSheet = workbook.addWorksheet('Purchase Bills');
    billSheet.columns = [
      { header: 'Bill #', key: 'bill_number', width: 20 },
      { header: 'Bill Date', key: 'bill_date', width: 14 },
      { header: 'Due Date', key: 'due_date', width: 14 },
      { header: 'Supplier Name', key: 'supplier_name', width: 26 },
      { header: 'Supplier GSTIN', key: 'supplier_gstin', width: 18 },
      { header: 'Warehouse', key: 'warehouse', width: 24 },
      { header: 'Subtotal (₹)', key: 'subtotal', width: 16 },
      { header: 'Total GST (₹)', key: 'total_tax', width: 16 },
      { header: 'Total After GST (₹)', key: 'total_after_gst', width: 20 },
      { header: 'Discount Type', key: 'discount_type', width: 15 },
      { header: 'Discount %', key: 'discount_pct', width: 12 },
      { header: 'Discount Amount (₹)', key: 'discount_amt', width: 20 },
      { header: 'Grand Total (₹)', key: 'grand_total', width: 18 },
      { header: 'Paid Amount (₹)', key: 'paid_amount', width: 16 },
      { header: 'Balance Due (₹)', key: 'balance_amount', width: 16 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Notes', key: 'notes', width: 32 },
    ];
    this.styleHeaderRow(billSheet);

    for (const b of bills) {
      const totalAfterGst = new Decimal(b.subtotal || 0)
        .add(new Decimal(b.total_tax || 0))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toFixed(2);
      billSheet.addRow({
        bill_number: sanitizeCellValue(b.bill_number),
        bill_date: b.bill_date,
        due_date: b.due_date,
        supplier_name: sanitizeCellValue(b.supplier_name),
        supplier_gstin: sanitizeCellValue(b.supplier_gstin || ''),
        warehouse: sanitizeCellValue(whMap.get(b.warehouse_id) || ''),
        subtotal: b.subtotal || '0.00',
        total_tax: b.total_tax || '0.00',
        total_after_gst: totalAfterGst,
        discount_type: sanitizeCellValue(b.overall_discount_type || 'AMOUNT'),
        discount_pct: b.overall_discount_percentage || '0.00',
        discount_amt: b.overall_discount_amount || '0.00',
        grand_total: b.grand_total || '0.00',
        paid_amount: b.paid_amount || '0.00',
        balance_amount: b.balance_amount || '0.00',
        status: b.is_finalized ? 'RECEIVED & POSTED' : 'DRAFT',
        notes: sanitizeCellValue(b.notes || ''),
      });
    }

    const itemSheet = workbook.addWorksheet('Purchase Line Items');
    itemSheet.columns = [
      { header: 'Bill #', key: 'bill_number', width: 20 },
      { header: 'Bill Date', key: 'bill_date', width: 14 },
      { header: 'Supplier Name', key: 'supplier_name', width: 24 },
      { header: 'Product / Item', key: 'item_name', width: 28 },
      { header: 'HSN Code', key: 'hsn_code', width: 14 },
      { header: 'Quantity', key: 'quantity', width: 12 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Purchase Rate (₹)', key: 'rate', width: 18 },
      { header: 'GST %', key: 'gst_rate', width: 10 },
      { header: 'Taxable Value (₹)', key: 'taxable_value', width: 18 },
      { header: 'Total Tax (₹)', key: 'total_tax', width: 16 },
      { header: 'Line Total (₹)', key: 'line_total', width: 18 },
    ];
    this.styleHeaderRow(itemSheet);

    for (const it of items) {
      const parent = billMap.get(it.purchase_invoice_id);
      itemSheet.addRow({
        bill_number: sanitizeCellValue(parent?.bill_number || ''),
        bill_date: parent?.bill_date || '',
        supplier_name: sanitizeCellValue(parent?.supplier_name || ''),
        item_name: sanitizeCellValue(it.item_name),
        hsn_code: sanitizeCellValue(it.hsn_code || ''),
        quantity: it.quantity || '0.00',
        unit: sanitizeCellValue(it.unit || 'NOS'),
        rate: it.rate || '0.00',
        gst_rate: it.gst_rate || '0.00',
        taxable_value: it.taxable_value || '0.00',
        total_tax: it.total_tax || '0.00',
        line_total: it.line_total || '0.00',
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportInventoryToExcel(companyId: string): Promise<Buffer> {
    const [products, warehouses, balances, transactions] = await Promise.all([
      this.masterDataService.getProducts(companyId, { item_type: 'PRODUCT' }),
      this.db('warehouses').where({ company_id: companyId }),
      this.db('stock_balances').where({ company_id: companyId }),
      this.db('inventory_transactions')
        .where({ company_id: companyId })
        .orderBy('transaction_date', 'desc')
        .orderBy('created_at', 'desc'),
    ]);

    const whMap = new Map<string, any>(warehouses.map((w: any) => [w.id, w]));
    const prodMap = new Map<string, any>(products.map((p: any) => [p.id, p]));

    const workbook = new ExcelJS.Workbook();

    const balSheet = workbook.addWorksheet('Inventory & Stock');
    balSheet.columns = [
      { header: 'Product Name', key: 'product_name', width: 30 },
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'HSN Code', key: 'hsn', width: 14 },
      { header: 'Warehouse', key: 'warehouse_name', width: 22 },
      { header: 'Warehouse Code', key: 'warehouse_code', width: 15 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Quantity On Hand', key: 'quantity_on_hand', width: 18 },
      { header: 'Average Unit Cost (₹)', key: 'average_unit_cost', width: 20 },
      { header: 'Total Stock Value (₹)', key: 'total_stock_value', width: 20 },
      { header: 'Minimum Stock Alert', key: 'minimum_stock', width: 20 },
      { header: 'Stock Status', key: 'status', width: 15 },
      { header: 'Notes', key: 'notes', width: 30 },
    ];
    this.styleHeaderRow(balSheet);

    const balancedProdIds = new Set<string>();
    for (const bal of balances) {
      const prod = prodMap.get(bal.product_id);
      const wh = whMap.get(bal.warehouse_id);
      if (prod) balancedProdIds.add(prod.id);

      const qty = new Decimal(bal.quantity_on_hand || 0);
      const minStock = new Decimal(prod?.minimum_stock || 0);
      const status = qty.lte(0) ? 'OUT OF STOCK' : minStock.gt(0) && qty.lte(minStock) ? 'LOW STOCK' : 'IN STOCK';

      balSheet.addRow({
        product_name: sanitizeCellValue(prod?.name || 'Unknown Product'),
        sku: sanitizeCellValue(prod?.sku || ''),
        hsn: sanitizeCellValue(prod?.hsn_or_sac || ''),
        warehouse_name: sanitizeCellValue(wh?.name || ''),
        warehouse_code: sanitizeCellValue(wh?.code || ''),
        unit: sanitizeCellValue(prod?.unit || 'NOS'),
        quantity_on_hand: qty.toFixed(2),
        average_unit_cost: new Decimal(bal.average_unit_cost || 0).toFixed(2),
        total_stock_value: new Decimal(bal.total_stock_value || 0).toFixed(2),
        minimum_stock: minStock.toFixed(2),
        status,
        notes: sanitizeCellValue(prod?.description || ''),
      });
    }

    for (const prod of products) {
      if (balancedProdIds.has(prod.id)) continue;
      const qty = new Decimal(prod.current_stock || 0);
      const cost = new Decimal(prod.purchase_price || 0);
      const val = qty.mul(cost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const minStock = new Decimal(prod.minimum_stock || 0);
      const status = qty.lte(0) ? 'OUT OF STOCK' : minStock.gt(0) && qty.lte(minStock) ? 'LOW STOCK' : 'IN STOCK';

      balSheet.addRow({
        product_name: sanitizeCellValue(prod.name),
        sku: sanitizeCellValue(prod.sku || ''),
        hsn: sanitizeCellValue(prod.hsn_or_sac || ''),
        warehouse_name: '',
        warehouse_code: '',
        unit: sanitizeCellValue(prod.unit || 'NOS'),
        quantity_on_hand: qty.toFixed(2),
        average_unit_cost: cost.toFixed(2),
        total_stock_value: val.toFixed(2),
        minimum_stock: minStock.toFixed(2),
        status,
        notes: sanitizeCellValue(prod.description || ''),
      });
    }

    const ledgerSheet = workbook.addWorksheet('Stock Movements Ledger');
    ledgerSheet.columns = [
      { header: 'Date', key: 'transaction_date', width: 14 },
      { header: 'Movement Type', key: 'movement_type', width: 20 },
      { header: 'Warehouse', key: 'warehouse', width: 22 },
      { header: 'Product Name', key: 'product_name', width: 28 },
      { header: 'Reference Type', key: 'ref_type', width: 18 },
      { header: 'Reference #', key: 'ref_num', width: 20 },
      { header: 'Quantity', key: 'quantity', width: 14 },
      { header: 'Unit Cost (₹)', key: 'unit_cost', width: 16 },
      { header: 'Total Cost (₹)', key: 'total_cost', width: 16 },
      { header: 'Notes', key: 'notes', width: 35 },
    ];
    this.styleHeaderRow(ledgerSheet);

    for (const tx of transactions) {
      const wh = whMap.get(tx.warehouse_id);
      const prod = prodMap.get(tx.product_id);
      ledgerSheet.addRow({
        transaction_date: tx.transaction_date,
        movement_type: sanitizeCellValue(tx.movement_type),
        warehouse: sanitizeCellValue(wh ? `${wh.name} (${wh.code})` : ''),
        product_name: sanitizeCellValue(prod?.name || ''),
        ref_type: sanitizeCellValue(tx.reference_document_type || ''),
        ref_num: sanitizeCellValue(tx.reference_document_number || ''),
        quantity: tx.quantity || '0.00',
        unit_cost: tx.unit_cost || '0.00',
        total_cost: tx.total_cost || '0.00',
        notes: sanitizeCellValue(tx.notes || ''),
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportCustomerPaymentsToExcel(companyId: string): Promise<Buffer> {
    const [payments, invoices] = await Promise.all([
      this.db('customer_payments').where({ company_id: companyId }).orderBy('payment_date', 'desc').orderBy('created_at', 'desc'),
      this.db('invoices').where({ company_id: companyId, status: 'FINALIZED' }).orderBy('invoice_date', 'desc'),
    ]);

    const payIds = payments.map((p: any) => p.id);
    const allocations = payIds.length > 0
      ? await this.db('payment_allocations').whereIn('payment_id', payIds)
      : [];

    const allocMap = new Map<string, any[]>();
    for (const a of allocations) {
      const list = allocMap.get(a.payment_id) || [];
      list.push(a);
      allocMap.set(a.payment_id, list);
    }

    const workbook = new ExcelJS.Workbook();

    const recSheet = workbook.addWorksheet('Customer Receipts');
    recSheet.columns = [
      { header: 'Receipt #', key: 'payment_number', width: 20 },
      { header: 'Payment Date', key: 'payment_date', width: 14 },
      { header: 'Customer Name', key: 'customer_name', width: 26 },
      { header: 'Amount Received (₹)', key: 'amount', width: 20 },
      { header: 'Allocated Amount (₹)', key: 'allocated', width: 20 },
      { header: 'Unallocated / Advance (₹)', key: 'unallocated', width: 22 },
      { header: 'Payment Mode', key: 'payment_method', width: 18 },
      { header: 'Company Bank Account', key: 'bank_account', width: 28 },
      { header: 'Reference / UTR / Cheque #', key: 'reference_number', width: 24 },
      { header: 'Linked Invoices', key: 'linked_invoices', width: 30 },
      { header: 'Notes', key: 'notes', width: 32 },
    ];
    this.styleHeaderRow(recSheet);

    for (const p of payments) {
      const allocs = allocMap.get(p.id) || [];
      const amountDec = new Decimal(p.amount || 0);
      const unallocDec = new Decimal(p.unallocated_amount || 0);
      const allocDec = Decimal.max(0, amountDec.sub(unallocDec));
      const linkedStr = allocs.map((a) => `${a.document_number} (₹${a.allocated_amount})`).join(', ');

      recSheet.addRow({
        payment_number: sanitizeCellValue(p.payment_number),
        payment_date: p.payment_date,
        customer_name: sanitizeCellValue(p.customer_name),
        amount: amountDec.toFixed(2),
        allocated: allocDec.toFixed(2),
        unallocated: unallocDec.toFixed(2),
        payment_method: sanitizeCellValue(p.payment_method || ''),
        bank_account: sanitizeCellValue(p.bank_account || ''),
        reference_number: sanitizeCellValue(p.reference_number || ''),
        linked_invoices: sanitizeCellValue(linkedStr),
        notes: sanitizeCellValue(p.notes || ''),
      });
    }

    const dueSheet = workbook.addWorksheet('Pending Receivables');
    dueSheet.columns = [
      { header: 'Invoice #', key: 'invoice_number', width: 20 },
      { header: 'Invoice Date', key: 'invoice_date', width: 14 },
      { header: 'Due Date', key: 'due_date', width: 14 },
      { header: 'Customer Name', key: 'customer_name', width: 26 },
      { header: 'Grand Total (₹)', key: 'grand_total', width: 18 },
      { header: 'Paid Amount (₹)', key: 'paid_amount', width: 18 },
      { header: 'Balance Receivable (₹)', key: 'balance_amount', width: 22 },
      { header: 'Payment Status', key: 'pay_status', width: 16 },
    ];
    this.styleHeaderRow(dueSheet);

    for (const inv of invoices) {
      const bal = new Decimal(inv.balance_amount || 0);
      if (bal.lte(0)) continue;
      const paid = new Decimal(inv.paid_amount || 0);
      dueSheet.addRow({
        invoice_number: sanitizeCellValue(inv.invoice_number),
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        customer_name: sanitizeCellValue(inv.customer_name),
        grand_total: new Decimal(inv.grand_total || 0).toFixed(2),
        paid_amount: paid.toFixed(2),
        balance_amount: bal.toFixed(2),
        pay_status: paid.gt(0) ? 'PARTIAL PAY' : 'UNPAID',
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportSupplierPaymentsToExcel(companyId: string): Promise<Buffer> {
    const [payments, bills] = await Promise.all([
      this.db('supplier_payments').where({ company_id: companyId }).orderBy('payment_date', 'desc').orderBy('created_at', 'desc'),
      this.db('purchase_invoices').where({ company_id: companyId }).orderBy('bill_date', 'desc'),
    ]);

    const payIds = payments.map((p: any) => p.id);
    const allocations = payIds.length > 0
      ? await this.db('payment_allocations').whereIn('payment_id', payIds)
      : [];

    const allocMap = new Map<string, any[]>();
    for (const a of allocations) {
      const list = allocMap.get(a.payment_id) || [];
      list.push(a);
      allocMap.set(a.payment_id, list);
    }

    const workbook = new ExcelJS.Workbook();

    const paySheet = workbook.addWorksheet('Vendor Payments');
    paySheet.columns = [
      { header: 'Payment #', key: 'payment_number', width: 20 },
      { header: 'Payment Date', key: 'payment_date', width: 14 },
      { header: 'Supplier Name', key: 'supplier_name', width: 26 },
      { header: 'Amount Paid (₹)', key: 'amount', width: 18 },
      { header: 'Allocated Amount (₹)', key: 'allocated', width: 20 },
      { header: 'Unallocated / Advance (₹)', key: 'unallocated', width: 22 },
      { header: 'Payment Mode', key: 'payment_method', width: 18 },
      { header: 'Company Bank (Paid From)', key: 'bank_account', width: 28 },
      { header: 'Vendor Bank (Paid To)', key: 'vendor_bank_account', width: 28 },
      { header: 'Reference / UTR / Cheque #', key: 'reference_number', width: 24 },
      { header: 'Linked Purchase Bills', key: 'linked_bills', width: 30 },
      { header: 'Notes', key: 'notes', width: 32 },
    ];
    this.styleHeaderRow(paySheet);

    for (const p of payments) {
      const allocs = allocMap.get(p.id) || [];
      const amountDec = new Decimal(p.amount || 0);
      const unallocDec = new Decimal(p.unallocated_amount || 0);
      const allocDec = Decimal.max(0, amountDec.sub(unallocDec));
      const linkedStr = allocs.map((a) => `${a.document_number} (₹${a.allocated_amount})`).join(', ');

      paySheet.addRow({
        payment_number: sanitizeCellValue(p.payment_number),
        payment_date: p.payment_date,
        supplier_name: sanitizeCellValue(p.supplier_name),
        amount: amountDec.toFixed(2),
        allocated: allocDec.toFixed(2),
        unallocated: unallocDec.toFixed(2),
        payment_method: sanitizeCellValue(p.payment_method || ''),
        bank_account: sanitizeCellValue(p.bank_account || ''),
        vendor_bank_account: sanitizeCellValue(p.vendor_bank_account || ''),
        reference_number: sanitizeCellValue(p.reference_number || ''),
        linked_bills: sanitizeCellValue(linkedStr),
        notes: sanitizeCellValue(p.notes || ''),
      });
    }

    const dueSheet = workbook.addWorksheet('Pending Payables');
    dueSheet.columns = [
      { header: 'Bill #', key: 'bill_number', width: 20 },
      { header: 'Bill Date', key: 'bill_date', width: 14 },
      { header: 'Due Date', key: 'due_date', width: 14 },
      { header: 'Supplier Name', key: 'supplier_name', width: 26 },
      { header: 'Grand Total (₹)', key: 'grand_total', width: 18 },
      { header: 'Paid Amount (₹)', key: 'paid_amount', width: 18 },
      { header: 'Balance Payable (₹)', key: 'balance_amount', width: 20 },
      { header: 'Status', key: 'status', width: 18 },
    ];
    this.styleHeaderRow(dueSheet);

    for (const b of bills) {
      const bal = new Decimal(b.balance_amount || 0);
      if (bal.lte(0)) continue;
      dueSheet.addRow({
        bill_number: sanitizeCellValue(b.bill_number),
        bill_date: b.bill_date,
        due_date: b.due_date,
        supplier_name: sanitizeCellValue(b.supplier_name),
        grand_total: new Decimal(b.grand_total || 0).toFixed(2),
        paid_amount: new Decimal(b.paid_amount || 0).toFixed(2),
        balance_amount: bal.toFixed(2),
        status: b.is_finalized ? 'RECEIVED & POSTED' : 'DRAFT',
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ===================== DOWNLOADABLE STANDARD IMPORT TEMPLATES (ALL 7 CATEGORIES) =====================

  async getImportTemplate(category: ImportCategory): Promise<{ filename: string; buffer: Buffer }> {
    const workbook = new ExcelJS.Workbook();

    if (category === 'customers') {
      const sheet = workbook.addWorksheet('Customers Import');
      sheet.columns = [
        { header: 'Customer Type (CORPORATE/GOVERNMENT/INFRASTRUCTURE/EDUCATION)', key: 'customer_type', width: 32 },
        { header: 'Customer / Trade Name *', key: 'name', width: 26 },
        { header: 'Company Name', key: 'company_name', width: 24 },
        { header: 'Contact Person', key: 'contact_person', width: 20 },
        { header: 'Mobile Phone', key: 'mobile', width: 16 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'GSTIN', key: 'gstin', width: 18 },
        { header: 'PAN', key: 'pan', width: 14 },
        { header: 'Year of Registration', key: 'registration_year', width: 20 },
        { header: 'Billing Address', key: 'billing_address', width: 35 },
        { header: 'City', key: 'city', width: 16 },
        { header: 'State', key: 'state', width: 20 },
        { header: 'State Code', key: 'state_code', width: 12 },
        { header: 'PIN Code', key: 'pin_code', width: 12 },
        { header: 'Payment Reminder (Days)', key: 'payment_terms_days', width: 22 },
        { header: 'Bank Name', key: 'bank_name', width: 22 },
        { header: 'Bank Account Number', key: 'bank_account_no', width: 22 },
        { header: 'IFSC Code', key: 'bank_ifsc', width: 15 },
        { header: 'Branch Details', key: 'bank_branch', width: 25 },
        { header: 'Additional Bank Accounts', key: 'additional_banks', width: 32 },
        { header: 'Opening Balance (₹)', key: 'opening_balance', width: 18 },
        { header: 'Notes', key: 'notes', width: 35 },
      ];
      this.styleHeaderRow(sheet);
      const buffer = await workbook.xlsx.writeBuffer();
      return { filename: 'Customer_Import_Template.xlsx', buffer: Buffer.from(buffer) };
    }

    if (category === 'products') {
      const sheet = workbook.addWorksheet('Products Import');
      sheet.columns = [
        { header: 'Type (PRODUCT/SERVICE)', key: 'item_type', width: 22 },
        { header: 'Item Name *', key: 'name', width: 30 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Category', key: 'category_name', width: 20 },
        { header: 'HSN/SAC', key: 'hsn_or_sac', width: 14 },
        { header: 'Unit', key: 'unit', width: 12 },
        { header: 'GST Rate (%)', key: 'gst_rate', width: 14 },
        { header: 'Purchase Price (₹)', key: 'purchase_price', width: 18 },
        { header: 'Min Selling Price (₹)', key: 'min_selling_price', width: 20 },
        { header: 'Max Selling Price (₹)', key: 'max_selling_price', width: 20 },
        { header: 'Selling Price (₹)', key: 'selling_price', width: 18 },
        { header: 'Tax Inclusive (YES/NO)', key: 'is_tax_inclusive', width: 20 },
        { header: 'Current Stock', key: 'current_stock', width: 15 },
        { header: 'Minimum Stock', key: 'minimum_stock', width: 15 },
        { header: 'Custom Notes', key: 'custom_notes', width: 30 },
        { header: 'Notes', key: 'notes', width: 35 },
      ];
      this.styleHeaderRow(sheet);
      const buffer = await workbook.xlsx.writeBuffer();
      return { filename: 'Products_Import_Template.xlsx', buffer: Buffer.from(buffer) };
    }

    if (category === 'suppliers') {
      const sheet = workbook.addWorksheet('Suppliers Import');
      sheet.columns = [
        { header: 'Supplier / Company Name *', key: 'name', width: 28 },
        { header: 'Trade Name', key: 'company_name', width: 24 },
        { header: 'Contact Person', key: 'contact_person', width: 20 },
        { header: 'Mobile Phone', key: 'mobile', width: 16 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'GSTIN', key: 'gstin', width: 18 },
        { header: 'PAN', key: 'pan', width: 14 },
        { header: 'Address', key: 'address', width: 35 },
        { header: 'State', key: 'state', width: 20 },
        { header: 'State Code', key: 'state_code', width: 12 },
        { header: 'PIN Code', key: 'pin_code', width: 12 },
        { header: 'Payment Reminder (Days)', key: 'payment_terms_days', width: 22 },
        { header: 'Bank Name', key: 'bank_name', width: 22 },
        { header: 'Bank Account Number', key: 'bank_account_no', width: 22 },
        { header: 'IFSC Code', key: 'bank_ifsc', width: 15 },
        { header: 'Branch Details', key: 'bank_branch', width: 25 },
        { header: 'Additional Bank Accounts', key: 'additional_banks', width: 32 },
        { header: 'Opening Balance (₹)', key: 'opening_balance', width: 18 },
        { header: 'Notes', key: 'notes', width: 35 },
      ];
      this.styleHeaderRow(sheet);
      const buffer = await workbook.xlsx.writeBuffer();
      return { filename: 'Suppliers_Import_Template.xlsx', buffer: Buffer.from(buffer) };
    }

    if (category === 'purchases') {
      const sheet = workbook.addWorksheet('Purchases Import');
      sheet.columns = [
        { header: 'Vendor Bill # *', key: 'bill_number', width: 20 },
        { header: 'Bill Date (YYYY-MM-DD)', key: 'bill_date', width: 20 },
        { header: 'Due Date (YYYY-MM-DD)', key: 'due_date', width: 20 },
        { header: 'Supplier Name *', key: 'supplier_name', width: 26 },
        { header: 'Supplier GSTIN', key: 'supplier_gstin', width: 18 },
        { header: 'Warehouse', key: 'warehouse', width: 22 },
        { header: 'Product / Item *', key: 'item_name', width: 28 },
        { header: 'HSN Code', key: 'hsn_code', width: 14 },
        { header: 'Inward Qty *', key: 'quantity', width: 14 },
        { header: 'Unit', key: 'unit', width: 10 },
        { header: 'Purchase Rate (₹)', key: 'rate', width: 18 },
        { header: 'Min Selling Price (₹)', key: 'min_selling_price', width: 20 },
        { header: 'Max Selling Price (₹)', key: 'max_selling_price', width: 20 },
        { header: 'GST %', key: 'gst_rate', width: 10 },
        { header: 'Discount Type (AMOUNT/PERCENTAGE)', key: 'discount_type', width: 28 },
        { header: 'Discount Value', key: 'discount_value', width: 16 },
        { header: 'Receive Stock Immediately (YES/NO)', key: 'receive_stock', width: 28 },
        { header: 'Notes', key: 'notes', width: 35 },
      ];
      this.styleHeaderRow(sheet);
      const buffer = await workbook.xlsx.writeBuffer();
      return { filename: 'Purchases_Import_Template.xlsx', buffer: Buffer.from(buffer) };
    }

    if (category === 'inventory') {
      const sheet = workbook.addWorksheet('Inventory Stock Import');
      sheet.columns = [
        { header: 'Product Name *', key: 'product_name', width: 30 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'HSN Code', key: 'hsn', width: 14 },
        { header: 'Warehouse', key: 'warehouse_name', width: 22 },
        { header: 'Warehouse Code', key: 'warehouse_code', width: 16 },
        { header: 'Unit', key: 'unit', width: 10 },
        { header: 'Quantity On Hand *', key: 'quantity_on_hand', width: 18 },
        { header: 'Average Unit Cost (₹)', key: 'average_unit_cost', width: 20 },
        { header: 'Minimum Stock Alert', key: 'minimum_stock', width: 20 },
        { header: 'Date (YYYY-MM-DD)', key: 'transaction_date', width: 18 },
        { header: 'Notes', key: 'notes', width: 35 },
      ];
      this.styleHeaderRow(sheet);
      const buffer = await workbook.xlsx.writeBuffer();
      return { filename: 'Inventory_Stock_Import_Template.xlsx', buffer: Buffer.from(buffer) };
    }

    if (category === 'payments-receivable') {
      const sheet = workbook.addWorksheet('Customer Receipts Import');
      sheet.columns = [
        { header: 'Payment Date (YYYY-MM-DD)', key: 'payment_date', width: 22 },
        { header: 'Customer Name *', key: 'customer_name', width: 26 },
        { header: 'Invoice Number', key: 'invoice_number', width: 22 },
        { header: 'Amount Received (₹) *', key: 'amount', width: 20 },
        { header: 'Payment Mode (BANK_TRANSFER/CASH/CHEQUE/CARD)', key: 'payment_method', width: 32 },
        { header: 'Company Bank Account', key: 'bank_account', width: 26 },
        { header: 'Reference / UTR / Cheque #', key: 'reference_number', width: 24 },
        { header: 'Notes', key: 'notes', width: 35 },
      ];
      this.styleHeaderRow(sheet);
      const buffer = await workbook.xlsx.writeBuffer();
      return { filename: 'Payments_Receivable_Import_Template.xlsx', buffer: Buffer.from(buffer) };
    }

    // payments-suppliers
    const sheet = workbook.addWorksheet('Vendor Payments Import');
    sheet.columns = [
      { header: 'Payment Date (YYYY-MM-DD)', key: 'payment_date', width: 22 },
      { header: 'Supplier Name *', key: 'supplier_name', width: 26 },
      { header: 'Purchase Bill #', key: 'bill_number', width: 22 },
      { header: 'Amount Paid (₹) *', key: 'amount', width: 20 },
      { header: 'Payment Mode (BANK_TRANSFER/CASH/CHEQUE/CARD)', key: 'payment_method', width: 32 },
      { header: 'Company Bank (Paid From)', key: 'bank_account', width: 26 },
      { header: 'Vendor Bank (Paid To)', key: 'vendor_bank_account', width: 26 },
      { header: 'Reference / UTR / Cheque #', key: 'reference_number', width: 24 },
      { header: 'Notes', key: 'notes', width: 35 },
    ];
    this.styleHeaderRow(sheet);
    const buffer = await workbook.xlsx.writeBuffer();
    return { filename: 'Payments_To_Suppliers_Import_Template.xlsx', buffer: Buffer.from(buffer) };
  }

  async getCustomerImportTemplate(): Promise<Buffer> {
    return (await this.getImportTemplate('customers')).buffer;
  }

  // ===================== UNIVERSAL IMPORTERS (ALL 7 CATEGORIES) =====================

  async importFromFile(
    companyId: string,
    category: ImportCategory,
    buffer: Buffer,
    originalName: string
  ): Promise<ImportResult> {
    const sheets = await this.parseUploadedSheets(buffer, originalName);
    if (sheets.length === 0) {
      throw new Error('The uploaded file contains no readable rows or headers.');
    }

    switch (category) {
      case 'customers':
        return this.importCustomers(companyId, sheets[0]);
      case 'products':
        return this.importProducts(companyId, sheets[0]);
      case 'suppliers':
        return this.importSuppliers(companyId, sheets[0]);
      case 'purchases':
        return this.importPurchases(companyId, sheets);
      case 'inventory':
        return this.importInventory(companyId, sheets[0]);
      case 'payments-receivable':
        return this.importPaymentsReceivable(companyId, sheets[0]);
      case 'payments-suppliers':
        return this.importPaymentsToSuppliers(companyId, sheets[0]);
      default:
        throw new Error(`Unsupported import category: ${category}`);
    }
  }

  // 1. IMPORT CUSTOMERS
  private async importCustomers(companyId: string, sheet: ParsedSheet): Promise<ImportResult> {
    const existing = await this.masterDataService.getCustomers(companyId);
    const existingByName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));
    const extraColumns = new Set<string>();
    const errors: string[] = [];
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of sheet.rows) {
      try {
        const m = new RowMapper(row);
        const name = m.get('customer trade name', 'customer name', 'name', 'client name', 'party name');
        if (!name) {
          skipped++;
          errors.push(`Row ${row.rowNumber}: Skipped because Customer Name is empty.`);
          continue;
        }

        const customerTypeRaw = m.get('customer type', 'type');
        const companyName = m.get('company name', 'trade name', 'business name');
        const contactPerson = m.get('contact person');
        const mobile = m.get('mobile phone', 'mobile', 'phone', 'contact number', 'phone number');
        const email = m.get('email', 'email id', 'email address');
        const gstin = m.get('gstin', 'gst no', 'gst number');
        const pan = m.get('pan', 'pan no', 'pan number');
        const regYear = m.get('year of registration', 'registration year', 'reg year');
        const billingAddress = m.get('billing address', 'address');
        const shippingAddress = m.get('shipping address');
        const city = m.get('city');
        const rawState = m.get('state');
        const rawStateCode = m.get('state code');
        const pinCode = m.get('pin code', 'pincode', 'pin', 'zip', 'postal code');
        const reminderRaw = m.get('payment reminder', 'payment reminder days', 'payment terms', 'payment terms days', 'reminder days');
        const bankName = m.get('bank name');
        const bankAccountNo = m.get('bank account number', 'account number', 'bank account no', 'account no');
        const bankIfsc = m.get('ifsc code', 'ifsc', 'bank ifsc');
        const bankBranch = m.get('branch details', 'bank branch', 'branch');
        const additionalBanksRaw = m.get('additional bank accounts', 'other bank accounts');
        const upiId = m.get('upi id', 'upi');
        const openingBalRaw = m.get('opening balance', 'current balance', 'balance');
        const notes = m.collectNotesAndExtras(extraColumns);

        const { state, stateCode } = resolveStateAndCode(rawState, rawStateCode);
        const paymentTermsDays = reminderRaw ? Math.max(0, Math.round(Number(reminderRaw) || 0)) : 0;
        const additionalBanks = parseAdditionalBankAccounts(additionalBanksRaw);

        const payload: any = {
          customer_type: customerTypeRaw ? normalizeCustomerType(customerTypeRaw) : 'CORPORATE',
          name,
          company_name: companyName || undefined,
          contact_person: contactPerson || undefined,
          mobile: mobile || '',
          email: email || undefined,
          gstin: gstin ? gstin.toUpperCase() : undefined,
          pan: pan ? pan.toUpperCase() : undefined,
          registration_year: regYear || undefined,
          billing_address: billingAddress || '',
          shipping_address: shippingAddress || billingAddress || '',
          city: city || '',
          state,
          state_code: stateCode,
          pin_code: pinCode || '',
          payment_terms_days: paymentTermsDays,
          bank_name: bankName || undefined,
          bank_account_no: bankAccountNo || undefined,
          bank_ifsc: bankIfsc ? bankIfsc.toUpperCase() : undefined,
          bank_branch: bankBranch || undefined,
          additional_bank_accounts: additionalBanks,
          upi_id: upiId || undefined,
          opening_balance: parseDecimalStr(openingBalRaw, '0.00'),
          notes: notes || undefined,
        };

        const match = existingByName.get(name.toLowerCase());
        if (match) {
          const mergedNotes = notes && match.notes && !match.notes.includes(notes)
            ? `${match.notes}\n${notes}`
            : (notes || match.notes);
          await this.masterDataService.updateCustomer(companyId, match.id, {
            ...payload,
            notes: mergedNotes || undefined,
          });
          updated++;
        } else {
          const created = await this.masterDataService.createCustomer(companyId, payload);
          existingByName.set(name.toLowerCase(), created);
          imported++;
        }
      } catch (err: any) {
        skipped++;
        errors.push(`Row ${row.rowNumber}: ${err.message || 'Failed to import customer'}`);
      }
    }

    return {
      category: 'customers',
      imported,
      updated,
      skipped,
      extraColumnsCaptured: Array.from(extraColumns),
      errors,
    };
  }

  // 2. IMPORT PRODUCTS & SERVICES
  private async importProducts(companyId: string, sheet: ParsedSheet): Promise<ImportResult> {
    const [existingProds, existingCats] = await Promise.all([
      this.masterDataService.getProducts(companyId),
      this.masterDataService.getCategories(companyId),
    ]);
    const prodMap = new Map(existingProds.map((p) => [p.name.trim().toLowerCase(), p]));
    const catMap = new Map(existingCats.map((c) => [c.name.trim().toLowerCase(), c]));
    const extraColumns = new Set<string>();
    const errors: string[] = [];
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of sheet.rows) {
      try {
        const m = new RowMapper(row);
        const name = m.get('item name', 'product name', 'name', 'product', 'service name');
        if (!name) {
          skipped++;
          errors.push(`Row ${row.rowNumber}: Skipped because Item Name is empty.`);
          continue;
        }

        const rawType = m.get('type', 'item type');
        const itemType = rawType.toUpperCase().includes('SERVICE') ? 'SERVICE' : 'PRODUCT';
        const sku = m.get('sku', 'sku code', 'item code', 'product code');
        const categoryName = m.get('category', 'category name');
        const hsn = m.get('hsn sac', 'hsn', 'sac', 'hsn code', 'hsn or sac');
        const unit = m.get('unit', 'uom', 'unit of measure');
        const gstRateRaw = m.get('gst rate', 'gst', 'tax rate');
        const purchasePriceRaw = m.get('purchase price', 'purchase rate', 'cost price', 'cost');
        const minSellingRaw = m.get('min selling price', 'min price', 'minimum selling price');
        const maxSellingRaw = m.get('max selling price', 'max price', 'maximum selling price');
        const sellingPriceRaw = m.get('selling price', 'sale price', 'rate', 'price');
        const taxInclRaw = m.get('tax inclusive', 'is tax inclusive', 'incl gst');
        const currentStockRaw = m.get('current stock', 'opening stock', 'stock', 'quantity', 'qty');
        const minStockRaw = m.get('minimum stock', 'min stock', 'minimum stock alert');
        const customNotesRaw = m.get('custom notes', 'item notes', 'product notes');
        const notes = m.collectNotesAndExtras(extraColumns);

        let categoryId: string | undefined;
        if (categoryName) {
          const foundCat = catMap.get(categoryName.toLowerCase());
          if (foundCat) {
            categoryId = foundCat.id;
          } else {
            const createdCat = await this.masterDataService.createCategory(companyId, categoryName, '');
            catMap.set(categoryName.toLowerCase(), createdCat);
            categoryId = createdCat.id;
          }
        }

        const minSelling = parseOptionalDecimalStr(minSellingRaw);
        const maxSelling = parseOptionalDecimalStr(maxSellingRaw);
        const sellingPrice = parseOptionalDecimalStr(sellingPriceRaw) || maxSelling || minSelling || '0.00';
        const customNotesArr = customNotesRaw
          ? customNotesRaw.split('|').map((n) => n.trim()).filter(Boolean)
          : [];

        const payload: any = {
          item_type: itemType,
          name,
          sku: sku || undefined,
          category_id: categoryId,
          hsn_or_sac: hsn || '',
          unit: unit ? unit.toUpperCase() : 'NOS',
          gst_rate: parseDecimalStr(gstRateRaw, '18.00'),
          purchase_price: parseDecimalStr(purchasePriceRaw, '0.00'),
          selling_price: sellingPrice,
          min_selling_price: minSelling,
          max_selling_price: maxSelling,
          is_tax_inclusive: parseBoolYes(taxInclRaw, false),
          current_stock: parseDecimalStr(currentStockRaw, '0.00'),
          minimum_stock: parseDecimalStr(minStockRaw, '0.00'),
          custom_notes: customNotesArr,
          description: notes || undefined,
          is_active: true,
        };

        const match = prodMap.get(name.toLowerCase());
        if (match) {
          await this.masterDataService.updateProduct(companyId, match.id, payload);
          updated++;
        } else {
          const created = await this.masterDataService.createProduct(companyId, payload);
          prodMap.set(name.toLowerCase(), created);
          imported++;
        }
      } catch (err: any) {
        skipped++;
        errors.push(`Row ${row.rowNumber}: ${err.message || 'Failed to import product'}`);
      }
    }

    return {
      category: 'products',
      imported,
      updated,
      skipped,
      extraColumnsCaptured: Array.from(extraColumns),
      errors,
    };
  }

  // 3. IMPORT SUPPLIERS
  private async importSuppliers(companyId: string, sheet: ParsedSheet): Promise<ImportResult> {
    const existing = await this.masterDataService.getSuppliers(companyId);
    const existingByName = new Map(existing.map((s) => [s.name.trim().toLowerCase(), s]));
    const extraColumns = new Set<string>();
    const errors: string[] = [];
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of sheet.rows) {
      try {
        const m = new RowMapper(row);
        const name = m.get('supplier company name', 'company supplier name', 'supplier name', 'vendor name', 'company name', 'name');
        if (!name) {
          skipped++;
          errors.push(`Row ${row.rowNumber}: Skipped because Supplier Name is empty.`);
          continue;
        }

        const tradeName = m.get('trade name');
        const contactPerson = m.get('contact person');
        const mobile = m.get('mobile phone', 'mobile', 'phone', 'contact number');
        const email = m.get('email', 'email id', 'email address');
        const gstin = m.get('gstin', 'gst no', 'gst number');
        const pan = m.get('pan', 'pan no', 'pan number');
        const address = m.get('address', 'billing address');
        const rawState = m.get('state');
        const rawStateCode = m.get('state code');
        const pinCode = m.get('pin code', 'pincode', 'pin', 'zip');
        const reminderRaw = m.get('payment reminder', 'payment reminder days', 'payment terms', 'payment terms days', 'reminder days');
        const bankName = m.get('bank name');
        const bankAccountNo = m.get('bank account number', 'account number', 'bank account no', 'account no');
        const bankIfsc = m.get('ifsc code', 'ifsc', 'bank ifsc');
        const bankBranch = m.get('branch details', 'bank branch', 'branch');
        const additionalBanksRaw = m.get('additional bank accounts', 'other bank accounts');
        const openingBalRaw = m.get('opening balance', 'outstanding payable', 'current balance', 'balance');
        const notes = m.collectNotesAndExtras(extraColumns);

        const { state, stateCode } = resolveStateAndCode(rawState, rawStateCode);
        const paymentTermsDays = reminderRaw ? Math.max(0, Math.round(Number(reminderRaw) || 0)) : 0;
        const additionalBanks = parseAdditionalBankAccounts(additionalBanksRaw);

        const payload: any = {
          name,
          company_name: tradeName || undefined,
          contact_person: contactPerson || undefined,
          mobile: mobile || '',
          email: email || undefined,
          gstin: gstin ? gstin.toUpperCase() : undefined,
          pan: pan ? pan.toUpperCase() : undefined,
          address: address || '',
          state,
          state_code: stateCode,
          pin_code: pinCode || '',
          payment_terms_days: paymentTermsDays,
          bank_name: bankName || undefined,
          bank_account_no: bankAccountNo || undefined,
          bank_ifsc: bankIfsc ? bankIfsc.toUpperCase() : undefined,
          bank_branch: bankBranch || undefined,
          additional_bank_accounts: additionalBanks,
          opening_balance: parseDecimalStr(openingBalRaw, '0.00'),
          notes: notes || undefined,
        };

        const match = existingByName.get(name.toLowerCase());
        if (match) {
          const mergedNotes = notes && match.notes && !match.notes.includes(notes)
            ? `${match.notes}\n${notes}`
            : (notes || match.notes);
          await this.masterDataService.updateSupplier(companyId, match.id, {
            ...payload,
            notes: mergedNotes || undefined,
          });
          updated++;
        } else {
          const created = await this.masterDataService.createSupplier(companyId, payload);
          existingByName.set(name.toLowerCase(), created);
          imported++;
        }
      } catch (err: any) {
        skipped++;
        errors.push(`Row ${row.rowNumber}: ${err.message || 'Failed to import supplier'}`);
      }
    }

    return {
      category: 'suppliers',
      imported,
      updated,
      skipped,
      extraColumnsCaptured: Array.from(extraColumns),
      errors,
    };
  }

  // Helper: ensure warehouse exists by name/code or return default warehouse
  private async resolveOrCreateWarehouse(companyId: string, nameOrLabel: string, codeHint = ''): Promise<string> {
    const warehouses = await this.db('warehouses').where({ company_id: companyId });
    const cleaned = nameOrLabel.trim();

    if (cleaned) {
      const codeMatch = cleaned.match(/\(([^)]+)\)\s*$/);
      const extractedCode = (codeHint || codeMatch?.[1] || '').trim().toUpperCase();
      const extractedName = cleaned.replace(/\s*\([^)]+\)\s*$/, '').trim();

      const found = warehouses.find(
        (w: any) =>
          w.name.trim().toLowerCase() === extractedName.toLowerCase() ||
          (extractedCode && w.code.trim().toUpperCase() === extractedCode)
      );
      if (found) return found.id;

      // Auto-create warehouse
      const branch = await this.db('branches').where({ company_id: companyId, is_default: true }).first()
        || await this.db('branches').where({ company_id: companyId }).first();
      const id = uuidv4();
      const now = new Date().toISOString();
      await this.db('warehouses').insert({
        id,
        company_id: companyId,
        branch_id: branch?.id || 'DEFAULT_BRANCH',
        name: extractedName || cleaned,
        code: extractedCode || `WH${String(warehouses.length + 1).padStart(2, '0')}`,
        address: '',
        is_default: warehouses.length === 0,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
      return id;
    }

    const defWh = warehouses.find((w: any) => w.is_default) || warehouses[0];
    if (defWh) return defWh.id;

    // Create Main Warehouse if company has none
    const branch = await this.db('branches').where({ company_id: companyId, is_default: true }).first()
      || await this.db('branches').where({ company_id: companyId }).first();
    const id = uuidv4();
    const now = new Date().toISOString();
    await this.db('warehouses').insert({
      id,
      company_id: companyId,
      branch_id: branch?.id || 'DEFAULT_BRANCH',
      name: 'Main Warehouse',
      code: 'MW01',
      address: '',
      is_default: true,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    return id;
  }

  // 4. IMPORT PURCHASES (supports BOTH our 2-sheet exported Purchases.xlsx AND 1-sheet import template)
  private async importPurchases(companyId: string, sheets: ParsedSheet[]): Promise<ImportResult> {
    const [existingSuppliers, existingProducts, existingBills] = await Promise.all([
      this.masterDataService.getSuppliers(companyId),
      this.masterDataService.getProducts(companyId, { item_type: 'PRODUCT' }),
      this.db('purchase_invoices').where({ company_id: companyId }),
    ]);

    const supplierMap = new Map(existingSuppliers.map((s) => [s.name.trim().toLowerCase(), s]));
    const productMap = new Map(existingProducts.map((p) => [p.name.trim().toLowerCase(), p]));
    const existingBillKeys = new Set(
      existingBills.map((b: any) => `${b.supplier_id}::${String(b.bill_number).trim().toLowerCase()}`)
    );

    const extraColumns = new Set<string>();
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;
    const todayIso = new Date().toISOString().split('T')[0];

    const ensureSupplier = async (name: string, gstin = '') => {
      const existing = supplierMap.get(name.toLowerCase());
      if (existing) return existing;
      const created = await this.masterDataService.createSupplier(companyId, {
        name,
        mobile: '',
        gstin: gstin ? gstin.toUpperCase() : undefined,
        address: '',
        state: '',
        state_code: '',
        pin_code: '',
        payment_terms_days: 0,
      });
      supplierMap.set(name.toLowerCase(), created);
      return created;
    };

    const ensureProduct = async (
      itemName: string,
      hsn: string,
      unit: string,
      rate: string,
      gstRate: string,
      minSell: string | null,
      maxSell: string | null
    ) => {
      const existing = productMap.get(itemName.toLowerCase());
      if (existing) {
        if (minSell || maxSell) {
          await this.masterDataService.updateProduct(companyId, existing.id, {
            min_selling_price: minSell,
            max_selling_price: maxSell,
            selling_price: maxSell || minSell || existing.selling_price,
          });
        }
        return existing;
      }
      const created = await this.masterDataService.createProduct(companyId, {
        item_type: 'PRODUCT',
        name: itemName,
        hsn_or_sac: hsn || '',
        unit: unit ? unit.toUpperCase() : 'NOS',
        gst_rate: parseDecimalStr(gstRate, '18.00'),
        purchase_price: parseDecimalStr(rate, '0.00'),
        selling_price: maxSell || minSell || parseDecimalStr(rate, '0.00'),
        min_selling_price: minSell,
        max_selling_price: maxSell,
        current_stock: '0.00',
        minimum_stock: '0.00',
        is_active: true,
      });
      productMap.set(itemName.toLowerCase(), created);
      return created;
    };

    // Detect 2-sheet exported workbook format ("Purchase Bills" + "Purchase Line Items")
    const itemsSheet = sheets.find((s) => normalizeHeader(s.name).includes('line item'));
    if (itemsSheet && sheets[0]) {
      const billSheet = sheets[0];
      const lineItemsByBill = new Map<string, any[]>();

      for (const itemRow of itemsSheet.rows) {
        const im = new RowMapper(itemRow);
        const bNo = im.get('bill', 'bill no', 'bill number', 'vendor bill');
        const supName = im.get('supplier name', 'supplier', 'vendor name');
        const itemName = im.get('product item', 'item name', 'product name', 'item', 'product');
        if (!bNo || !itemName) continue;
        const hsn = im.get('hsn code', 'hsn', 'hsn sac');
        const qty = im.get('quantity', 'inward qty', 'qty');
        const unit = im.get('unit');
        const rate = im.get('purchase rate', 'rate', 'price');
        const gst = im.get('gst', 'gst rate');
        im.get('bill date', 'taxable value', 'total tax', 'line total'); // mark known read-only export cols
        const key = `${supName.toLowerCase()}::${bNo.toLowerCase()}`;
        const list = lineItemsByBill.get(key) || [];
        list.push({ itemName, hsn, qty, unit, rate, gst });
        lineItemsByBill.set(key, list);
      }

      for (const row of billSheet.rows) {
        try {
          const m = new RowMapper(row);
          const billNumber = m.get('bill', 'bill no', 'bill number', 'vendor bill');
          const supplierName = m.get('supplier name', 'supplier', 'vendor name');
          if (!billNumber || !supplierName) {
            skipped++;
            errors.push(`Row ${row.rowNumber}: Missing Bill # or Supplier Name.`);
            continue;
          }

          const billDate = parseDateIso(m.get('bill date', 'date'), todayIso);
          const dueDate = parseDateIso(m.get('due date'), billDate);
          const supplierGstin = m.get('supplier gstin', 'gstin');
          const warehouseLabel = m.get('warehouse', 'receiving warehouse');
          const discTypeRaw = m.get('discount type', 'overall discount type');
          const discPctRaw = m.get('discount', 'discount pct', 'discount percentage', 'overall discount percentage');
          const discAmtRaw = m.get('discount amount', 'overall discount amount', 'discount value');
          const statusRaw = m.get('status', 'receive stock immediately');
          m.get('subtotal', 'total gst', 'total after gst', 'grand total', 'paid amount', 'balance due');
          const notes = m.collectNotesAndExtras(extraColumns);

          const sup = await ensureSupplier(supplierName, supplierGstin);
          const billKey = `${sup.id}::${billNumber.toLowerCase()}`;
          if (existingBillKeys.has(billKey)) {
            skipped++;
            errors.push(`Row ${row.rowNumber}: Bill "${billNumber}" for "${supplierName}" already exists (skipped).`);
            continue;
          }

          const whId = await this.resolveOrCreateWarehouse(companyId, warehouseLabel);
          const rawItems = lineItemsByBill.get(`${supplierName.toLowerCase()}::${billNumber.toLowerCase()}`) || [];
          if (rawItems.length === 0) {
            skipped++;
            errors.push(`Row ${row.rowNumber}: Bill "${billNumber}" has no matching items in Purchase Line Items sheet.`);
            continue;
          }

          const resolvedItems = [];
          for (const it of rawItems) {
            const prod = await ensureProduct(it.itemName, it.hsn, it.unit, it.rate, it.gst, null, null);
            resolvedItems.push({
              product_id: prod.id,
              item_name: prod.name,
              hsn_code: it.hsn || prod.hsn_or_sac || '',
              unit: (it.unit || prod.unit || 'NOS').toUpperCase(),
              quantity: parseDecimalStr(it.qty, '1.00'),
              rate: parseDecimalStr(it.rate, '0.00'),
              gst_rate: parseDecimalStr(it.gst, '18.00'),
            });
          }

          const discType = discTypeRaw.toUpperCase() === 'PERCENTAGE' ? 'PERCENTAGE' : 'AMOUNT';
          const created = await this.purchaseService.createPurchaseInvoice(companyId, {
            supplier_id: sup.id,
            supplier_name: sup.name,
            supplier_gstin: sup.gstin,
            warehouse_id: whId,
            bill_number: billNumber,
            bill_date: billDate,
            due_date: dueDate,
            overall_discount_type: discType,
            overall_discount_percentage: discType === 'PERCENTAGE' ? parseDecimalStr(discPctRaw, '0.00') : '0.00',
            overall_discount_amount: discType === 'AMOUNT' ? parseDecimalStr(discAmtRaw, '0.00') : '0.00',
            notes: notes || undefined,
            items: resolvedItems,
          });
          if (parseBoolYes(statusRaw, true)) {
            await this.purchaseService.finalizePurchaseInvoice(companyId, created.id);
          }
          existingBillKeys.add(billKey);
          imported++;
        } catch (err: any) {
          skipped++;
          errors.push(`Row ${row.rowNumber}: ${err.message || 'Failed to import purchase bill'}`);
        }
      }

      return {
        category: 'purchases',
        imported,
        updated: 0,
        skipped,
        extraColumnsCaptured: Array.from(extraColumns),
        errors,
      };
    }

    // 1-sheet flat format: group rows by (Supplier Name + Vendor Bill #)
    interface GroupedBill {
      firstRowNumber: number;
      billNumber: string;
      billDate: string;
      dueDate: string;
      supplierName: string;
      supplierGstin: string;
      warehouseLabel: string;
      discountType: 'AMOUNT' | 'PERCENTAGE';
      discountValue: string;
      receiveImmediately: boolean;
      notesList: string[];
      items: any[];
    }

    const grouped = new Map<string, GroupedBill>();

    for (const row of sheets[0].rows) {
      const m = new RowMapper(row);
      const billNumber = m.get('vendor bill', 'bill', 'bill no', 'bill number');
      const supplierName = m.get('supplier name', 'supplier', 'vendor name', 'vendor');
      const itemName = m.get('product item', 'product', 'item name', 'product name', 'item');

      if (!billNumber || !supplierName || !itemName) {
        skipped++;
        errors.push(`Row ${row.rowNumber}: Skipped — Vendor Bill #, Supplier Name, and Product are required.`);
        continue;
      }

      const billDate = parseDateIso(m.get('bill date', 'date'), todayIso);
      const dueDate = parseDateIso(m.get('due date'), '');
      const supplierGstin = m.get('supplier gstin', 'gstin');
      const warehouseLabel = m.get('warehouse', 'receiving warehouse');
      const hsn = m.get('hsn code', 'hsn', 'hsn sac');
      const qty = m.get('inward qty', 'quantity', 'qty');
      const unit = m.get('unit');
      const rate = m.get('purchase rate', 'rate', 'purchase price', 'price');
      const minSell = parseOptionalDecimalStr(m.get('min selling price', 'min price'));
      const maxSell = parseOptionalDecimalStr(m.get('max selling price', 'max price'));
      const gst = m.get('gst', 'gst rate');
      const discTypeRaw = m.get('discount type', 'overall discount type');
      const discValRaw = m.get('discount value', 'discount amount', 'overall discount', 'discount');
      const receiveRaw = m.get('receive stock immediately', 'receive stock', 'status');
      const notes = m.collectNotesAndExtras(extraColumns);

      const groupKey = `${supplierName.toLowerCase()}::${billNumber.toLowerCase()}`;
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          firstRowNumber: row.rowNumber,
          billNumber,
          billDate,
          dueDate,
          supplierName,
          supplierGstin,
          warehouseLabel,
          discountType: discTypeRaw.toUpperCase() === 'PERCENTAGE' ? 'PERCENTAGE' : 'AMOUNT',
          discountValue: discValRaw,
          receiveImmediately: parseBoolYes(receiveRaw, true),
          notesList: [],
          items: [],
        });
      }
      const grp = grouped.get(groupKey)!;
      if (notes && !grp.notesList.includes(notes)) grp.notesList.push(notes);
      grp.items.push({ itemName, hsn, qty, unit, rate, minSell, maxSell, gst });
    }

    for (const grp of grouped.values()) {
      try {
        const sup = await ensureSupplier(grp.supplierName, grp.supplierGstin);
        const billKey = `${sup.id}::${grp.billNumber.toLowerCase()}`;
        if (existingBillKeys.has(billKey)) {
          skipped++;
          errors.push(`Row ${grp.firstRowNumber}: Bill "${grp.billNumber}" for "${grp.supplierName}" already exists (skipped).`);
          continue;
        }

        const whId = await this.resolveOrCreateWarehouse(companyId, grp.warehouseLabel);
        const resolvedItems = [];
        for (const it of grp.items) {
          const prod = await ensureProduct(it.itemName, it.hsn, it.unit, it.rate, it.gst, it.minSell, it.maxSell);
          resolvedItems.push({
            product_id: prod.id,
            item_name: prod.name,
            hsn_code: it.hsn || prod.hsn_or_sac || '',
            unit: (it.unit || prod.unit || 'NOS').toUpperCase(),
            quantity: parseDecimalStr(it.qty, '1.00'),
            rate: parseDecimalStr(it.rate, '0.00'),
            gst_rate: parseDecimalStr(it.gst, '18.00'),
          });
        }

        const effectiveDue = grp.dueDate || grp.billDate;
        const created = await this.purchaseService.createPurchaseInvoice(companyId, {
          supplier_id: sup.id,
          supplier_name: sup.name,
          supplier_gstin: sup.gstin,
          warehouse_id: whId,
          bill_number: grp.billNumber,
          bill_date: grp.billDate,
          due_date: effectiveDue,
          overall_discount_type: grp.discountType,
          overall_discount_percentage: grp.discountType === 'PERCENTAGE' ? parseDecimalStr(grp.discountValue, '0.00') : '0.00',
          overall_discount_amount: grp.discountType === 'AMOUNT' ? parseDecimalStr(grp.discountValue, '0.00') : '0.00',
          notes: grp.notesList.join('\n') || undefined,
          items: resolvedItems,
        });

        if (grp.receiveImmediately) {
          await this.purchaseService.finalizePurchaseInvoice(companyId, created.id);
        }
        existingBillKeys.add(billKey);
        imported++;
      } catch (err: any) {
        skipped++;
        errors.push(`Row ${grp.firstRowNumber}: ${err.message || 'Failed to import purchase bill'}`);
      }
    }

    return {
      category: 'purchases',
      imported,
      updated: 0,
      skipped,
      extraColumnsCaptured: Array.from(extraColumns),
      errors,
    };
  }

  // 5. IMPORT INVENTORY & STOCK
  private async importInventory(companyId: string, sheet: ParsedSheet): Promise<ImportResult> {
    const existingProducts = await this.masterDataService.getProducts(companyId, { item_type: 'PRODUCT' });
    const prodMap = new Map(existingProducts.map((p) => [p.name.trim().toLowerCase(), p]));
    const branch = await this.db('branches').where({ company_id: companyId, is_default: true }).first()
      || await this.db('branches').where({ company_id: companyId }).first();

    const extraColumns = new Set<string>();
    const errors: string[] = [];
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const todayIso = new Date().toISOString().split('T')[0];

    for (const row of sheet.rows) {
      try {
        const m = new RowMapper(row);
        const productName = m.get('product name', 'item name', 'product', 'name');
        if (!productName) {
          skipped++;
          errors.push(`Row ${row.rowNumber}: Skipped because Product Name is empty.`);
          continue;
        }

        const sku = m.get('sku', 'sku code');
        const hsn = m.get('hsn code', 'hsn', 'hsn sac');
        const warehouseName = m.get('warehouse', 'warehouse name');
        const warehouseCode = m.get('warehouse code');
        const unit = m.get('unit');
        const qtyRaw = m.get('quantity on hand', 'quantity', 'qty', 'current stock', 'opening stock', 'stock');
        const costRaw = m.get('average unit cost', 'unit cost', 'purchase price', 'cost');
        const minStockRaw = m.get('minimum stock alert', 'minimum stock', 'min stock');
        const txDate = parseDateIso(m.get('date', 'transaction date'), todayIso);
        m.get('total stock value', 'stock status'); // read-only export cols
        const notes = m.collectNotesAndExtras(extraColumns);

        const qtyDec = new Decimal(parseDecimalStr(qtyRaw, '0.00'));
        const costDec = new Decimal(parseDecimalStr(costRaw, '0.00'));
        const minStockStr = parseOptionalDecimalStr(minStockRaw);

        let prod = prodMap.get(productName.toLowerCase());
        if (!prod) {
          prod = await this.masterDataService.createProduct(companyId, {
            item_type: 'PRODUCT',
            name: productName,
            sku: sku || undefined,
            hsn_or_sac: hsn || '',
            unit: unit ? unit.toUpperCase() : 'NOS',
            purchase_price: costDec.toFixed(2),
            selling_price: costDec.toFixed(2),
            gst_rate: '18.00',
            current_stock: '0.00',
            minimum_stock: minStockStr || '0.00',
            description: notes || undefined,
            is_active: true,
          });
          prodMap.set(productName.toLowerCase(), prod);
        } else if (minStockStr !== null || notes) {
          const updateFields: any = {};
          if (minStockStr !== null) updateFields.minimum_stock = minStockStr;
          if (costDec.gt(0)) updateFields.purchase_price = costDec.toFixed(2);
          if (notes) {
            updateFields.description = prod.description && !prod.description.includes(notes)
              ? `${prod.description}\n${notes}`
              : notes;
          }
          await this.masterDataService.updateProduct(companyId, prod.id, updateFields);
        }

        const whId = await this.resolveOrCreateWarehouse(companyId, warehouseName, warehouseCode);
        const now = new Date().toISOString();

        await this.db.transaction(async (trx) => {
          const existingBal = await trx('stock_balances')
            .where({ company_id: companyId, warehouse_id: whId, product_id: prod!.id })
            .first();

          const prevQty = existingBal ? new Decimal(existingBal.quantity_on_hand || 0) : new Decimal(0);
          const delta = qtyDec.sub(prevQty);
          const totalVal = qtyDec.mul(costDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

          if (existingBal) {
            await trx('stock_balances').where({ id: existingBal.id }).update({
              quantity_on_hand: qtyDec.toFixed(2),
              average_unit_cost: costDec.toFixed(2),
              total_stock_value: totalVal.toFixed(2),
              last_updated_at: now,
            });
            updated++;
          } else {
            await trx('stock_balances').insert({
              id: uuidv4(),
              company_id: companyId,
              warehouse_id: whId,
              product_id: prod!.id,
              quantity_on_hand: qtyDec.toFixed(2),
              average_unit_cost: costDec.toFixed(2),
              total_stock_value: totalVal.toFixed(2),
              last_updated_at: now,
            });
            imported++;
          }

          if (!delta.eq(0)) {
            await trx('inventory_transactions').insert({
              id: uuidv4(),
              company_id: companyId,
              branch_id: branch?.id || 'DEFAULT_BRANCH',
              warehouse_id: whId,
              product_id: prod!.id,
              movement_type: existingBal ? (delta.gt(0) ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_REDUCE') : 'OPENING_BALANCE',
              quantity: delta.toFixed(2),
              unit_cost: costDec.toFixed(2),
              total_cost: delta.abs().mul(costDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
              reference_document_type: 'EXCEL_IMPORT',
              reference_document_id: prod!.id,
              reference_document_number: 'IMPORT-STOCK',
              notes: notes || 'Imported from Excel',
              transaction_date: txDate,
              created_at: now,
            });
          }

          // Recompute product total current_stock across all warehouses strictly with Decimal
          const allBals = await trx('stock_balances').where({ company_id: companyId, product_id: prod!.id });
          let sumStock = new Decimal(0);
          for (const b of allBals) {
            sumStock = sumStock.add(new Decimal(b.quantity_on_hand || 0));
          }
          await trx('products').where({ id: prod!.id, company_id: companyId }).update({
            current_stock: sumStock.toFixed(2),
            updated_at: now,
          });
        });
      } catch (err: any) {
        skipped++;
        errors.push(`Row ${row.rowNumber}: ${err.message || 'Failed to import inventory row'}`);
      }
    }

    return {
      category: 'inventory',
      imported,
      updated,
      skipped,
      extraColumnsCaptured: Array.from(extraColumns),
      errors,
    };
  }

  // 6. IMPORT PAYMENTS RECEIVABLE (CUSTOMER RECEIPTS)
  private async importPaymentsReceivable(companyId: string, sheet: ParsedSheet): Promise<ImportResult> {
    const [customers, invoices, branch] = await Promise.all([
      this.masterDataService.getCustomers(companyId),
      this.db('invoices').where({ company_id: companyId }),
      this.db('branches').where({ company_id: companyId, is_default: true }).first(),
    ]);

    const custMap = new Map(customers.map((c) => [c.name.trim().toLowerCase(), c]));
    const invByNum = new Map(invoices.map((i: any) => [String(i.invoice_number || '').trim().toLowerCase(), i]));
    const extraColumns = new Set<string>();
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;
    const todayIso = new Date().toISOString().split('T')[0];

    for (const row of sheet.rows) {
      try {
        const m = new RowMapper(row);
        const customerName = m.get('customer name', 'customer', 'received from customer', 'client name');
        const amountRaw = m.get('amount received', 'amount', 'received amount', 'paid amount');
        if (!customerName || !amountRaw) {
          skipped++;
          errors.push(`Row ${row.rowNumber}: Skipped — Customer Name and Amount Received are required.`);
          continue;
        }

        const amountDec = new Decimal(parseDecimalStr(amountRaw, '0.00'));
        if (amountDec.lte(0)) {
          skipped++;
          errors.push(`Row ${row.rowNumber}: Skipped — Amount Received must be greater than 0.`);
          continue;
        }

        const paymentDate = parseDateIso(m.get('payment date', 'date'), todayIso);
        const invoiceRef = m.get('invoice number', 'linked invoices', 'invoice no', 'invoice');
        const paymentMode = normalizePaymentMode(m.get('payment mode', 'payment method', 'mode'));
        const bankAccount = m.get('company bank account', 'bank account', 'received in');
        const referenceNumber = m.get('reference utr cheque', 'reference number', 'reference', 'utr', 'cheque no');
        m.get('receipt', 'allocated amount', 'unallocated advance'); // read-only export cols
        const notes = m.collectNotesAndExtras(extraColumns);

        let cust = custMap.get(customerName.toLowerCase());
        if (!cust) {
          cust = await this.masterDataService.createCustomer(companyId, {
            customer_type: 'CORPORATE',
            name: customerName,
            mobile: '',
            billing_address: '',
            city: '',
            state: '',
            state_code: '',
            pin_code: '',
            payment_terms_days: 0,
          });
          custMap.set(customerName.toLowerCase(), cust);
        }

        // Link invoice if found and still has balance due
        const allocations: { invoiceId: string; amount: string }[] = [];
        if (invoiceRef) {
          const firstInvNum = invoiceRef.split(',')[0].replace(/\s*\(.*?\)\s*$/, '').trim();
          const matchedInv = invByNum.get(firstInvNum.toLowerCase());
          if (matchedInv && matchedInv.customer_id === cust.id) {
            const bal = new Decimal(matchedInv.balance_amount || 0);
            if (bal.gt(0)) {
              const allocAmt = Decimal.min(bal, amountDec).toFixed(2);
              allocations.push({ invoiceId: matchedInv.id, amount: allocAmt });
              matchedInv.balance_amount = bal.sub(new Decimal(allocAmt)).toFixed(2);
            }
          }
        }

        await this.paymentService.recordCustomerPayment(companyId, {
          branchId: branch?.id || 'DEFAULT_BRANCH',
          customerId: cust.id,
          customerName: cust.name,
          amount: amountDec.toFixed(2),
          paymentMethod: paymentMode,
          bankAccount: bankAccount || undefined,
          paymentDate,
          referenceNumber: referenceNumber || undefined,
          notes: notes || undefined,
          allocations,
        });
        imported++;
      } catch (err: any) {
        skipped++;
        errors.push(`Row ${row.rowNumber}: ${err.message || 'Failed to import customer receipt'}`);
      }
    }

    return {
      category: 'payments-receivable',
      imported,
      updated: 0,
      skipped,
      extraColumnsCaptured: Array.from(extraColumns),
      errors,
    };
  }

  // 7. IMPORT PAYMENTS TO SUPPLIERS (VENDOR PAYMENTS)
  private async importPaymentsToSuppliers(companyId: string, sheet: ParsedSheet): Promise<ImportResult> {
    const [suppliers, bills, branch] = await Promise.all([
      this.masterDataService.getSuppliers(companyId),
      this.db('purchase_invoices').where({ company_id: companyId }),
      this.db('branches').where({ company_id: companyId, is_default: true }).first(),
    ]);

    const supMap = new Map(suppliers.map((s) => [s.name.trim().toLowerCase(), s]));
    const billByNum = new Map(bills.map((b: any) => [String(b.bill_number || '').trim().toLowerCase(), b]));
    const extraColumns = new Set<string>();
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;
    const todayIso = new Date().toISOString().split('T')[0];

    for (const row of sheet.rows) {
      try {
        const m = new RowMapper(row);
        const supplierName = m.get('supplier name', 'supplier', 'paid to supplier', 'vendor name', 'vendor');
        const amountRaw = m.get('amount paid', 'amount', 'paid amount', 'amount paid to supplier');
        if (!supplierName || !amountRaw) {
          skipped++;
          errors.push(`Row ${row.rowNumber}: Skipped — Supplier Name and Amount Paid are required.`);
          continue;
        }

        const amountDec = new Decimal(parseDecimalStr(amountRaw, '0.00'));
        if (amountDec.lte(0)) {
          skipped++;
          errors.push(`Row ${row.rowNumber}: Skipped — Amount Paid must be greater than 0.`);
          continue;
        }

        const paymentDate = parseDateIso(m.get('payment date', 'date'), todayIso);
        const billRef = m.get('purchase bill', 'linked purchase bills', 'bill number', 'bill no', 'bill');
        const paymentMode = normalizePaymentMode(m.get('payment mode', 'payment method', 'mode'));
        const bankAccount = m.get('company bank', 'company bank paid from', 'bank account', 'paid from');
        const vendorBankAccount = m.get('vendor bank', 'vendor bank paid to', 'supplier bank', 'paid to');
        const referenceNumber = m.get('reference utr cheque', 'reference number', 'reference', 'utr', 'cheque no');
        m.get('payment', 'allocated amount', 'unallocated advance'); // read-only export cols
        const notes = m.collectNotesAndExtras(extraColumns);

        let sup = supMap.get(supplierName.toLowerCase());
        if (!sup) {
          sup = await this.masterDataService.createSupplier(companyId, {
            name: supplierName,
            mobile: '',
            address: '',
            state: '',
            state_code: '',
            pin_code: '',
            payment_terms_days: 0,
          });
          supMap.set(supplierName.toLowerCase(), sup);
        }

        const allocations: { billId: string; amount: string }[] = [];
        if (billRef) {
          const firstBillNum = billRef.split(',')[0].replace(/\s*\(.*?\)\s*$/, '').trim();
          const matchedBill = billByNum.get(firstBillNum.toLowerCase());
          if (matchedBill && matchedBill.supplier_id === sup.id) {
            const bal = new Decimal(matchedBill.balance_amount || 0);
            if (bal.gt(0)) {
              const allocAmt = Decimal.min(bal, amountDec).toFixed(2);
              allocations.push({ billId: matchedBill.id, amount: allocAmt });
              matchedBill.balance_amount = bal.sub(new Decimal(allocAmt)).toFixed(2);
            }
          }
        }

        await this.paymentService.recordSupplierPayment(companyId, {
          branchId: branch?.id || 'DEFAULT_BRANCH',
          supplierId: sup.id,
          amount: amountDec.toFixed(2),
          paymentMethod: paymentMode,
          bankAccount: bankAccount || undefined,
          vendorBankAccount: vendorBankAccount || undefined,
          paymentDate,
          referenceNumber: referenceNumber || undefined,
          notes: notes || undefined,
          allocations,
        });
        imported++;
      } catch (err: any) {
        skipped++;
        errors.push(`Row ${row.rowNumber}: ${err.message || 'Failed to import vendor payment'}`);
      }
    }

    return {
      category: 'payments-suppliers',
      imported,
      updated: 0,
      skipped,
      extraColumnsCaptured: Array.from(extraColumns),
      errors,
    };
  }
}
