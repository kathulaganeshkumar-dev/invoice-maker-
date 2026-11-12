// src/server/services/importExportService.ts - Excel and CSV Data Portability Engine
import { Knex } from 'knex';
import ExcelJS from 'exceljs';
import { MasterDataService } from './masterDataService';

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
        customer_type: c.customer_type,
        name: c.name,
        company_name: c.company_name || '',
        contact_person: c.contact_person || '',
        mobile: c.mobile,
        email: c.email || '',
        gstin: c.gstin || '',
        pan: c.pan || '',
        billing_address: c.billing_address,
        city: c.city,
        state: c.state,
        state_code: c.state_code,
        pin_code: c.pin_code,
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
        item_type: p.item_type,
        name: p.name,
        sku: p.sku || '',
        category_name: p.category_name || '',
        hsn_or_sac: p.hsn_or_sac,
        unit: p.unit,
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
