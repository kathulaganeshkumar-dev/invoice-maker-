// src/server/services/importExportService.ts - Excel and CSV Data Portability Engine
import { Knex } from 'knex';
import ExcelJS from 'exceljs';
import { MasterDataService } from './masterDataService';

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

export class ImportExportService {
  constructor(private db: Knex, private masterDataService: MasterDataService) {}

  /**
   * Generates an Excel workbook containing Customers data
   */
  async exportCustomersToExcel(companyId: string): Promise<Buffer> {
    const customers = await this.masterDataService.getCustomers(companyId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Customers');

    sheet.columns = [
      { header: 'Customer Type', key: 'customer_type', width: 15 },
      { header: 'Customer Name', key: 'name', width: 25 },
      { header: 'Company Name', key: 'company_name', width: 25 },
      { header: 'Contact Person', key: 'contact_person', width: 20 },
      { header: 'Mobile', key: 'mobile', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'GSTIN', key: 'gstin', width: 18 },
      { header: 'PAN', key: 'pan', width: 12 },
      { header: 'Billing Address', key: 'billing_address', width: 35 },
      { header: 'City', key: 'city', width: 15 },
      { header: 'State', key: 'state', width: 20 },
      { header: 'State Code', key: 'state_code', width: 10 },
      { header: 'PIN Code', key: 'pin_code', width: 10 },
      { header: 'Current Balance (₹)', key: 'current_balance', width: 18 },
    ];

    // Style Header Row
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };

    for (const c of customers) {
      sheet.addRow({
        customer_type: sanitizeCellValue(c.customer_type),
        name: sanitizeCellValue(c.name),
        company_name: sanitizeCellValue(c.company_name || ''),
        contact_person: sanitizeCellValue(c.contact_person || ''),
        mobile: sanitizeCellValue(c.mobile),
        email: sanitizeCellValue(c.email || ''),
        gstin: sanitizeCellValue(c.gstin || ''),
        pan: sanitizeCellValue(c.pan || ''),
        billing_address: sanitizeCellValue(c.billing_address),
        city: sanitizeCellValue(c.city),
        state: sanitizeCellValue(c.state),
        state_code: sanitizeCellValue(c.state_code),
        pin_code: sanitizeCellValue(c.pin_code),
        current_balance: c.current_balance,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Generates an Excel workbook containing Products & Services data
   */
  async exportProductsToExcel(companyId: string): Promise<Buffer> {
    const products = await this.masterDataService.getProducts(companyId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products & Services');

    sheet.columns = [
      { header: 'Type', key: 'item_type', width: 12 },
      { header: 'Item Name', key: 'name', width: 30 },
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Category', key: 'category_name', width: 20 },
      { header: 'HSN/SAC', key: 'hsn_or_sac', width: 12 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'GST Rate (%)', key: 'gst_rate', width: 12 },
      { header: 'Purchase Price (₹)', key: 'purchase_price', width: 18 },
      { header: 'Selling Price (₹)', key: 'selling_price', width: 18 },
      { header: 'Current Stock', key: 'current_stock', width: 15 },
      { header: 'Minimum Stock', key: 'minimum_stock', width: 15 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };

    for (const p of products) {
      sheet.addRow({
        item_type: sanitizeCellValue(p.item_type),
        name: sanitizeCellValue(p.name),
        sku: sanitizeCellValue(p.sku || ''),
        category_name: sanitizeCellValue(p.category_name || ''),
        hsn_or_sac: sanitizeCellValue(p.hsn_or_sac),
        unit: sanitizeCellValue(p.unit),
        gst_rate: p.gst_rate,
        purchase_price: p.purchase_price,
        selling_price: p.selling_price,
        current_stock: p.current_stock,
        minimum_stock: p.minimum_stock,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Generates downloadable Excel template for importing customers
   */
  async getCustomerImportTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Customer Template');

    sheet.columns = [
      { header: 'Customer Type (BUSINESS/INDIVIDUAL)*', key: 'customer_type', width: 30 },
      { header: 'Customer Name*', key: 'name', width: 25 },
      { header: 'Company Name', key: 'company_name', width: 25 },
      { header: 'Mobile*', key: 'mobile', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'GSTIN', key: 'gstin', width: 18 },
      { header: 'PAN', key: 'pan', width: 12 },
      { header: 'Billing Address*', key: 'billing_address', width: 35 },
      { header: 'City*', key: 'city', width: 15 },
      { header: 'State*', key: 'state', width: 20 },
      { header: 'State Code*', key: 'state_code', width: 12 },
      { header: 'PIN Code*', key: 'pin_code', width: 12 },
      { header: 'Opening Balance', key: 'opening_balance', width: 15 },
    ];

    sheet.addRow({
      customer_type: 'BUSINESS',
      name: 'Sample Enterprise',
      company_name: 'Sample Enterprise Pvt Ltd',
      mobile: '9876543210',
      email: 'contact@sample.com',
      gstin: '23AABCS1234D1Z2',
      pan: 'AABCS1234D',
      billing_address: '123 Business Park',
      city: 'Indore',
      state: 'Madhya Pradesh',
      state_code: '23',
      pin_code: '452001',
      opening_balance: '0.00',
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
