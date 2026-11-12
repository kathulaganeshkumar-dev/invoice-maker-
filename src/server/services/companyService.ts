// src/server/services/companyService.ts - Multi-company and branch business logic
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { Company, Branch, CompanySettings } from '../../shared/types';
import { STANDARD_UNITS } from '../../shared/constants';
import { getDefaultDataDir } from '../database/connection';

export class CompanyService {
  constructor(private db: Knex) {}

  async getAllCompanies(includeArchived = false): Promise<Company[]> {
    let query = this.db('companies').select('*').orderBy('name', 'asc');
    if (!includeArchived) {
      query = query.where({ is_archived: false });
    }
    return query;
  }

  async getCompanyById(companyId: string): Promise<Company | null> {
    const comp = await this.db('companies').where({ id: companyId }).first();
    return comp || null;
  }

  async createCompany(data: Partial<Company>): Promise<Company> {
    return this.db.transaction(async (trx) => {
      const companyId = uuidv4();
      const branchId = uuidv4();
      const now = new Date().toISOString();

      const newCompany: Company = {
        id: companyId,
        name: data.name || 'New Company',
        legal_name: data.legal_name || data.name || 'New Company',
        business_type: data.business_type || 'Private Limited Company',
        logo_url: data.logo_url || undefined,
        registered_address: data.registered_address || '',
        gstin: data.gstin?.toUpperCase() || undefined,
        pan: data.pan?.toUpperCase() || undefined,
        state: data.state || 'Madhya Pradesh',
        state_code: data.state_code || '23',
        pin_code: data.pin_code || '452001',
        phone: data.phone || '',
        email: data.email || '',
        website: data.website || undefined,
        bank_name: data.bank_name || undefined,
        bank_account_no: data.bank_account_no || undefined,
        bank_ifsc: data.bank_ifsc || undefined,
        bank_branch: data.bank_branch || undefined,
        upi_id: data.upi_id || undefined,
        default_invoice_terms: data.default_invoice_terms || '',
        default_quotation_terms: data.default_quotation_terms || '',
        is_default: Boolean(data.is_default),
        is_archived: false,
        created_at: now,
        updated_at: now,
      };

      if (newCompany.is_default) {
        await trx('companies').update({ is_default: false });
      }

      await trx('companies').insert(newCompany);

      // Create primary default branch
      const newBranch: Branch = {
        id: branchId,
        company_id: companyId,
        name: 'Head Office',
        code: 'HO01',
        address: newCompany.registered_address,
        phone: newCompany.phone,
        email: newCompany.email,
        gstin: newCompany.gstin,
        state: newCompany.state,
        state_code: newCompany.state_code,
        is_default: true,
        is_archived: false,
        created_at: now,
        updated_at: now,
      };
      await trx('branches').insert(newBranch);

      // Create company settings
      await trx('company_settings').insert({
        id: uuidv4(),
        company_id: companyId,
        invoice_overdue_days: 0,
        print_invoice_after_save: true,
        show_postal_code_before_city: false,
        include_additional_notes_in_search: true,
        sort_invoices_by_number: true,
        show_amount_in_words: true,
        zero_not_displayed: false,
        indian_number_style: true,
        currency_name: 'Rupees',
        currency_symbol: '₹',
        decimal_name: 'Paise',
        printed_date_format: 'DD/MM/YYYY',
        allow_negative_stock: false,
        inventory_valuation_method: 'FIFO',
        enable_reverse_charge_by_default: false,
        created_at: now,
        updated_at: now,
      });

      // Default warehouse
      await trx('warehouses').insert({
        id: uuidv4(),
        company_id: companyId,
        branch_id: branchId,
        name: 'Main Warehouse',
        code: 'MW01',
        address: newCompany.registered_address,
        is_default: true,
        is_active: true,
        created_at: now,
        updated_at: now,
      });

      // Initialize default numbering sequences for all document types
      const cleanPrefix = (newCompany.name.replace(/[^A-Za-z0-9]/g, '').substring(0, 3) || 'INV').toUpperCase();
      const defaultDocs = [
        { type: 'TAX_INVOICE', prefix: `${cleanPrefix}/`, curr: 0 },
        { type: 'STANDARD_INVOICE', prefix: 'INV/', curr: 0 },
        { type: 'BILL_OF_SUPPLY', prefix: 'BOS/', curr: 0 },
        { type: 'PROFORMA_INVOICE', prefix: 'PI/', curr: 0 },
        { type: 'SERVICE_INVOICE', prefix: 'SRV/', curr: 0 },
        { type: 'COMMERCIAL_INVOICE', prefix: 'CI/', curr: 0 },
        { type: 'EXPORT_INVOICE', prefix: 'EXP/', curr: 0 },
        { type: 'RECURRING_INVOICE', prefix: 'REC-INV/', curr: 0 },
        { type: 'ADVANCE_PAYMENT_INVOICE', prefix: 'ADV/', curr: 0 },
        { type: 'CREDIT_NOTE', prefix: 'CN/', curr: 0 },
        { type: 'DEBIT_NOTE', prefix: 'DN/', curr: 0 },
        { type: 'DELIVERY_CHALLAN', prefix: 'DC/', curr: 0 },
        { type: 'QUOTATION', prefix: 'QT/', curr: 0 },
        { type: 'PURCHASE_ORDER', prefix: 'PO/', curr: 0 },
        { type: 'PURCHASE_INVOICE', prefix: 'PINV/', curr: 0 },
        { type: 'CUSTOMER_PAYMENT', prefix: 'RCP/', curr: 0 },
        { type: 'SUPPLIER_PAYMENT', prefix: 'PAY/', curr: 0 },
      ];

      for (const d of defaultDocs) {
        await trx('numbering_sequences').insert({
          id: uuidv4(),
          company_id: companyId,
          branch_id: branchId,
          document_type: d.type,
          prefix: d.prefix,
          suffix: '',
          padding_length: 4,
          current_number: d.curr,
          include_financial_year: true,
          fy_format: 'YYYY-YY',
          separator: '/',
          updated_at: now,
        });
      }

      // Default units
      for (const u of STANDARD_UNITS) {
        await trx('units').insert({
          id: uuidv4(),
          company_id: companyId,
          name: u.name,
          code: u.code,
          is_decimal_allowed: u.is_decimal_allowed,
        });
      }

      return newCompany;
    });
  }

  async updateCompany(companyId: string, data: Partial<Company>): Promise<Company> {
    const now = new Date().toISOString();
    const updateData = {
      ...data,
      updated_at: now,
    };
    delete (updateData as any).id;

    if (updateData.is_default) {
      await this.db('companies').whereNot({ id: companyId }).update({ is_default: false });
    }

    await this.db('companies').where({ id: companyId }).update(updateData);
    return (await this.getCompanyById(companyId))!;
  }

  async setDefaultCompany(companyId: string): Promise<void> {
    await this.db.transaction(async (trx) => {
      await trx('companies').update({ is_default: false });
      await trx('companies').where({ id: companyId }).update({ is_default: true });
    });
  }

  async deleteCompany(companyId: string): Promise<void> {
    await this.db.transaction(async (trx) => {
      const existing = await trx('companies').where({ id: companyId }).first();
      if (!existing) {
        throw new Error('Company profile not found.');
      }

      const deleteByChunkedIds = async (table: string, col: string, ids: string[], extraWhere?: Record<string, any>) => {
        if (ids.length === 0) return;
        const chunkSize = 400;
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize);
          let qb = trx(table).whereIn(col, chunk);
          if (extraWhere) {
            qb = qb.andWhere(extraWhere);
          }
          await qb.del();
        }
      };

      const fetchIds = async (table: string): Promise<string[]> => {
        const rows = await trx(table).where({ company_id: companyId }).select('id');
        return rows.map((r: any) => r.id);
      };

      const [customerIds, invoiceIds, quotationIds, poIds, purInvIds, custPayIds, supPayIds] = await Promise.all([
        fetchIds('customers'),
        fetchIds('invoices'),
        fetchIds('quotations'),
        fetchIds('purchase_orders'),
        fetchIds('purchase_invoices'),
        fetchIds('customer_payments'),
        fetchIds('supplier_payments'),
      ]);

      // 1. Payment allocations (no company_id column; remove by payment_id & linked document_id)
      await deleteByChunkedIds('payment_allocations', 'payment_id', [...custPayIds, ...supPayIds]);
      await deleteByChunkedIds('payment_allocations', 'document_id', invoiceIds, { document_type: 'INVOICE' });
      await deleteByChunkedIds('payment_allocations', 'document_id', purInvIds, { document_type: 'PURCHASE_INVOICE' });

      // 2. Payments & inventory movements
      await trx('customer_payments').where({ company_id: companyId }).del();
      await trx('supplier_payments').where({ company_id: companyId }).del();
      await trx('inventory_transactions').where({ company_id: companyId }).del();
      await trx('stock_balances').where({ company_id: companyId }).del();

      // 3. Purchase documents
      await deleteByChunkedIds('purchase_invoice_items', 'purchase_invoice_id', purInvIds);
      await trx('purchase_invoices').where({ company_id: companyId }).del();
      await deleteByChunkedIds('purchase_order_items', 'purchase_order_id', poIds);
      await trx('purchase_orders').where({ company_id: companyId }).del();

      // 4. Sales documents
      await deleteByChunkedIds('invoice_items', 'invoice_id', invoiceIds);
      await trx('invoices').where({ company_id: companyId }).del();
      await deleteByChunkedIds('quotation_items', 'quotation_id', quotationIds);
      await trx('quotations').where({ company_id: companyId }).del();

      // 5. Templates, logs & master data
      await trx('letterhead_templates').where({ company_id: companyId }).del();
      await trx('audit_logs').where({ company_id: companyId }).del();
      await deleteByChunkedIds('customer_addresses', 'customer_id', customerIds);
      await trx('customers').where({ company_id: companyId }).del();
      await trx('suppliers').where({ company_id: companyId }).del();
      await trx('products').where({ company_id: companyId }).del();
      await trx('categories').where({ company_id: companyId }).del();
      await trx('units').where({ company_id: companyId }).del();
      await trx('warehouses').where({ company_id: companyId }).del();
      await trx('numbering_sequences').where({ company_id: companyId }).del();
      await trx('company_settings').where({ company_id: companyId }).del();
      await trx('branches').where({ company_id: companyId }).del();

      // 6. Company root record
      await trx('companies').where({ id: companyId }).del();

      // 7. Promote another remaining active company to default if needed
      const remaining = await trx('companies').where({ is_archived: false }).orderBy('created_at', 'asc');
      if (remaining.length > 0 && !remaining.some((c: any) => Boolean(c.is_default))) {
        await trx('companies').where({ id: remaining[0].id }).update({
          is_default: true,
          updated_at: new Date().toISOString(),
        });
      }
    });

    // Clean up local uploaded letterhead directory for deleted company (best-effort)
    try {
      const safeFolder = companyId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const baseLetterheadDir = path.join(getDefaultDataDir(), 'letterheads');
      for (const folder of new Set([safeFolder, companyId])) {
        const dirPath = path.join(baseLetterheadDir, folder);
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      }
    } catch (err) {
      console.warn('[CompanyService] Unable to clean up letterhead folder:', err);
    }
  }

  // Branch operations
  async getBranches(companyId: string): Promise<Branch[]> {
    return this.db('branches').where({ company_id: companyId, is_archived: false }).orderBy('name', 'asc');
  }

  async deleteBranch(companyId: string, branchId: string): Promise<void> {
    const branches = await this.db('branches').where({ company_id: companyId, is_archived: false });
    if (branches.length <= 1) {
      throw new Error('Cannot delete the only existing branch for this company.');
    }
    await this.db('branches').where({ id: branchId }).update({ is_archived: true, updated_at: new Date().toISOString() });
  }

  async createBranch(companyId: string, data: Partial<Branch>): Promise<Branch> {
    const branchId = uuidv4();
    const now = new Date().toISOString();

    const branch: Branch = {
      id: branchId,
      company_id: companyId,
      name: data.name || 'Branch Office',
      code: data.code || 'BR01',
      address: data.address || '',
      phone: data.phone || '',
      email: data.email || '',
      gstin: data.gstin || undefined,
      state: data.state || '',
      state_code: data.state_code || '',
      is_default: Boolean(data.is_default),
      is_archived: false,
      created_at: now,
      updated_at: now,
    };

    if (branch.is_default) {
      await this.db('branches').where({ company_id: companyId }).update({ is_default: false });
    }

    await this.db('branches').insert(branch);
    return branch;
  }

  async updateBranch(branchId: string, data: Partial<Branch>): Promise<Branch> {
    const now = new Date().toISOString();
    const updateData = { ...data, updated_at: now };
    delete (updateData as any).id;
    delete (updateData as any).company_id;

    if (updateData.is_default) {
      const b = await this.db('branches').where({ id: branchId }).first();
      if (b) {
        await this.db('branches').where({ company_id: b.company_id }).update({ is_default: false });
      }
    }

    await this.db('branches').where({ id: branchId }).update(updateData);
    return this.db('branches').where({ id: branchId }).first();
  }

  // Company Settings
  async getCompanySettings(companyId: string): Promise<CompanySettings> {
    let settings = await this.db('company_settings').where({ company_id: companyId }).first();
    if (!settings) {
      const now = new Date().toISOString();
      settings = {
        id: uuidv4(),
        company_id: companyId,
        invoice_overdue_days: 0,
        print_invoice_after_save: true,
        show_postal_code_before_city: false,
        include_additional_notes_in_search: true,
        sort_invoices_by_number: true,
        show_amount_in_words: true,
        zero_not_displayed: false,
        indian_number_style: true,
        currency_name: 'Rupees',
        currency_symbol: '₹',
        decimal_name: 'Paise',
        printed_date_format: 'DD/MM/YYYY',
        allow_negative_stock: false,
        inventory_valuation_method: 'FIFO',
        enable_reverse_charge_by_default: false,
        created_at: now,
        updated_at: now,
      };
      await this.db('company_settings').insert(settings);
    }
    return settings;
  }

  async updateCompanySettings(companyId: string, data: Partial<CompanySettings>): Promise<CompanySettings> {
    await this.getCompanySettings(companyId);
    const now = new Date().toISOString();
    const allowed = new Set([
      'invoice_overdue_days',
      'print_invoice_after_save',
      'show_postal_code_before_city',
      'include_additional_notes_in_search',
      'sort_invoices_by_number',
      'show_amount_in_words',
      'zero_not_displayed',
      'indian_number_style',
      'currency_name',
      'currency_symbol',
      'decimal_name',
      'printed_date_format',
      'allow_negative_stock',
      'inventory_valuation_method',
      'enable_reverse_charge_by_default',
      'invoice_save_path',
      'quotation_save_path',
      'purchase_save_path',
      'report_save_path',
      'backup_save_path',
      'default_invoice_notes',
      'default_quotation_notes',
      'quotation_validity_days',
      'default_tax_inclusive',
    ]);
    const updateData: Record<string, any> = { updated_at: now };
    for (const [k, v] of Object.entries(data)) {
      if (allowed.has(k)) {
        updateData[k] = v;
      }
    }

    await this.db('company_settings').where({ company_id: companyId }).update(updateData);
    return this.getCompanySettings(companyId);
  }
}
