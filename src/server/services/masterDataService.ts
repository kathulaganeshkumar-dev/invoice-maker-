// src/server/services/masterDataService.ts - Customers, Suppliers, Products, Units, Categories
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { Customer, CustomerBankAccount, Supplier, Product, Category, Unit, NumberingSequence } from '../../shared/types';
import Decimal from 'decimal.js';

export class MasterDataService {
  constructor(private db: Knex) {}

  private hydrateCustomer(row: any): Customer {
    let additionalBanks: CustomerBankAccount[] = [];
    if (Array.isArray(row.additional_bank_accounts)) {
      additionalBanks = row.additional_bank_accounts;
    } else if (typeof row.additional_bank_accounts === 'string' && row.additional_bank_accounts.trim()) {
      try {
        const parsed = JSON.parse(row.additional_bank_accounts);
        if (Array.isArray(parsed)) additionalBanks = parsed;
      } catch {
        additionalBanks = [];
      }
    }
    return {
      ...row,
      additional_bank_accounts: additionalBanks,
    };
  }

  private serializeAdditionalBanks(banks?: CustomerBankAccount[] | string): string | null {
    if (!banks) return null;
    if (typeof banks === 'string') return banks;
    const cleaned = banks
      .map((b) => ({
        bank_name: b.bank_name?.trim() || '',
        bank_account_no: b.bank_account_no?.trim() || '',
        bank_ifsc: b.bank_ifsc?.trim().toUpperCase() || '',
        bank_branch: b.bank_branch?.trim() || '',
      }))
      .filter((b) => b.bank_name || b.bank_account_no || b.bank_ifsc || b.bank_branch);
    return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
  }

  // ===================== CUSTOMERS =====================
  async getCustomers(companyId: string, search?: string): Promise<Customer[]> {
    let query = this.db('customers').where({ company_id: companyId, is_archived: false });
    if (search) {
      const s = `%${search.toLowerCase()}%`;
      query = query.andWhere((qb) => {
        qb.whereRaw('LOWER(name) LIKE ?', [s])
          .orWhereRaw('LOWER(company_name) LIKE ?', [s])
          .orWhereRaw('LOWER(mobile) LIKE ?', [s])
          .orWhereRaw('LOWER(gstin) LIKE ?', [s]);
      });
    }
    const rows = await query.orderBy('name', 'asc');
    return rows.map((r: any) => this.hydrateCustomer(r));
  }

  async getCustomerById(companyId: string, customerId: string, trx?: Knex.Transaction | Knex): Promise<Customer | null> {
    const qb = trx || this.db;
    const cust = await qb('customers').where({ company_id: companyId, id: customerId }).first();
    return cust ? this.hydrateCustomer(cust) : null;
  }

  async createCustomer(companyId: string, data: Partial<Customer>): Promise<Customer> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const serializedBanks = this.serializeAdditionalBanks(data.additional_bank_accounts);
    const dbRow: any = {
      id,
      company_id: companyId,
      customer_type: data.customer_type || 'CORPORATE',
      name: data.name || '',
      company_name: data.company_name || undefined,
      contact_person: data.contact_person || undefined,
      mobile: data.mobile || (data as any).phone || '',
      alternate_phone: data.alternate_phone || undefined,
      email: data.email || undefined,
      gstin: data.gstin?.toUpperCase() || undefined,
      pan: data.pan?.toUpperCase() || undefined,
      registration_year: data.registration_year?.trim() || undefined,
      billing_address: data.billing_address || '',
      shipping_address: data.shipping_address || data.billing_address || '',
      city: data.city || '',
      state: data.state ?? '',
      state_code: data.state_code ?? '',
      pin_code: data.pin_code || '',
      bank_name: data.bank_name || undefined,
      bank_account_no: data.bank_account_no || undefined,
      bank_ifsc: data.bank_ifsc?.toUpperCase() || undefined,
      bank_branch: data.bank_branch || undefined,
      additional_bank_accounts: serializedBanks,
      upi_id: data.upi_id || undefined,
      opening_balance: new Decimal(data.opening_balance || 0).toFixed(2),
      current_balance: new Decimal(data.opening_balance || 0).toFixed(2),
      credit_limit: new Decimal(data.credit_limit || 0).toFixed(2),
      payment_terms_days:
        data.payment_terms_days !== undefined &&
        data.payment_terms_days !== null &&
        String(data.payment_terms_days).trim() !== ''
          ? Math.max(0, Math.round(Number(data.payment_terms_days) || 0))
          : 0,
      notes: data.notes || undefined,
      is_archived: false,
      created_at: now,
      updated_at: now,
    };

    await this.db('customers').insert(dbRow);
    return this.hydrateCustomer(dbRow);
  }

  async updateCustomer(companyId: string, customerId: string, data: Partial<Customer>): Promise<Customer> {
    const now = new Date().toISOString();
    const allowed = new Set([
      'customer_type',
      'name',
      'company_name',
      'contact_person',
      'mobile',
      'alternate_phone',
      'email',
      'gstin',
      'pan',
      'registration_year',
      'billing_address',
      'shipping_address',
      'city',
      'state',
      'state_code',
      'pin_code',
      'bank_name',
      'bank_account_no',
      'bank_ifsc',
      'bank_branch',
      'additional_bank_accounts',
      'upi_id',
      'opening_balance',
      'credit_limit',
      'payment_terms_days',
      'notes',
    ]);
    const updateData: Record<string, any> = { updated_at: now };
    for (const [k, v] of Object.entries(data || {})) {
      if (allowed.has(k)) {
        updateData[k] = v;
      }
    }
    if (updateData.gstin) updateData.gstin = String(updateData.gstin).toUpperCase();
    if (updateData.pan) updateData.pan = String(updateData.pan).toUpperCase();
    if (updateData.bank_ifsc) {
      updateData.bank_ifsc = String(updateData.bank_ifsc).toUpperCase();
    }
    if (updateData.registration_year !== undefined) {
      updateData.registration_year = updateData.registration_year ? String(updateData.registration_year).trim() : null;
    }
    if (updateData.additional_bank_accounts !== undefined) {
      updateData.additional_bank_accounts = this.serializeAdditionalBanks(updateData.additional_bank_accounts);
    }
    if (updateData.opening_balance !== undefined) {
      updateData.opening_balance = new Decimal(updateData.opening_balance || 0).toFixed(2);
    }
    if (updateData.credit_limit !== undefined) {
      updateData.credit_limit = new Decimal(updateData.credit_limit || 0).toFixed(2);
    }
    if (updateData.payment_terms_days !== undefined) {
      updateData.payment_terms_days =
        updateData.payment_terms_days !== null && String(updateData.payment_terms_days).trim() !== ''
          ? Math.max(0, Math.round(Number(updateData.payment_terms_days) || 0))
          : 0;
    }

    await this.db('customers').where({ company_id: companyId, id: customerId }).update(updateData);
    return (await this.getCustomerById(companyId, customerId))!;
  }

  async archiveCustomer(companyId: string, customerId: string): Promise<void> {
    const hasInvoices = await this.db('invoices').where({ company_id: companyId, customer_id: customerId }).first();
    const hasQuotes = await this.db('quotations').where({ company_id: companyId, customer_id: customerId }).first();
    if (!hasInvoices && !hasQuotes) {
      await this.db('customers').where({ company_id: companyId, id: customerId }).delete();
    } else {
      await this.db('customers').where({ company_id: companyId, id: customerId }).update({
        is_archived: true,
        updated_at: new Date().toISOString(),
      });
    }
  }

  private hydrateSupplier(row: any): Supplier {
    let additionalBanks: CustomerBankAccount[] = [];
    if (Array.isArray(row.additional_bank_accounts)) {
      additionalBanks = row.additional_bank_accounts;
    } else if (typeof row.additional_bank_accounts === 'string' && row.additional_bank_accounts.trim()) {
      try {
        const parsed = JSON.parse(row.additional_bank_accounts);
        if (Array.isArray(parsed)) additionalBanks = parsed;
      } catch {
        additionalBanks = [];
      }
    }
    return {
      ...row,
      additional_bank_accounts: additionalBanks,
    };
  }

  // ===================== SUPPLIERS =====================
  async getSuppliers(companyId: string, search?: string): Promise<Supplier[]> {
    let query = this.db('suppliers').where({ company_id: companyId, is_archived: false });
    if (search) {
      const s = `%${search.toLowerCase()}%`;
      query = query.andWhere((qb) => {
        qb.whereRaw('LOWER(name) LIKE ?', [s])
          .orWhereRaw('LOWER(company_name) LIKE ?', [s])
          .orWhereRaw('LOWER(mobile) LIKE ?', [s])
          .orWhereRaw('LOWER(gstin) LIKE ?', [s]);
      });
    }
    const rows = await query.orderBy('name', 'asc');
    return rows.map((r: any) => this.hydrateSupplier(r));
  }

  async getSupplierById(companyId: string, supplierId: string): Promise<Supplier | null> {
    const sup = await this.db('suppliers').where({ company_id: companyId, id: supplierId }).first();
    return sup ? this.hydrateSupplier(sup) : null;
  }

  async createSupplier(companyId: string, data: Partial<Supplier>): Promise<Supplier> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const serializedBanks = this.serializeAdditionalBanks(data.additional_bank_accounts);
    const dbRow: any = {
      id,
      company_id: companyId,
      name: data.name || '',
      company_name: data.company_name || undefined,
      contact_person: data.contact_person || undefined,
      mobile: data.mobile || '',
      email: data.email || undefined,
      gstin: data.gstin?.toUpperCase() || undefined,
      pan: data.pan?.toUpperCase() || undefined,
      address: data.address || '',
      state: data.state || '',
      state_code: data.state_code || '',
      pin_code: data.pin_code || '',
      bank_name: data.bank_name || undefined,
      bank_account_no: data.bank_account_no || undefined,
      bank_ifsc: data.bank_ifsc ? data.bank_ifsc.toUpperCase() : undefined,
      bank_branch: data.bank_branch || undefined,
      additional_bank_accounts: serializedBanks,
      upi_id: data.upi_id || undefined,
      opening_balance: new Decimal(data.opening_balance || 0).toFixed(2),
      current_balance: new Decimal(data.opening_balance || 0).toFixed(2),
      payment_terms_days:
        data.payment_terms_days !== undefined && data.payment_terms_days !== null && String(data.payment_terms_days).trim() !== ''
          ? Math.max(0, Math.round(Number(data.payment_terms_days) || 0))
          : 0,
      notes: data.notes || undefined,
      is_archived: false,
      created_at: now,
      updated_at: now,
    };

    await this.db('suppliers').insert(dbRow);
    return this.hydrateSupplier(dbRow);
  }

  async updateSupplier(companyId: string, supplierId: string, data: Partial<Supplier>): Promise<Supplier> {
    const now = new Date().toISOString();
    const allowed = new Set([
      'name',
      'company_name',
      'contact_person',
      'mobile',
      'email',
      'gstin',
      'pan',
      'address',
      'state',
      'state_code',
      'pin_code',
      'bank_name',
      'bank_account_no',
      'bank_ifsc',
      'bank_branch',
      'additional_bank_accounts',
      'upi_id',
      'opening_balance',
      'payment_terms_days',
      'notes',
    ]);
    const updateData: Record<string, any> = { updated_at: now };
    for (const [k, v] of Object.entries(data || {})) {
      if (allowed.has(k)) {
        updateData[k] = v;
      }
    }
    if (updateData.gstin) updateData.gstin = String(updateData.gstin).toUpperCase();
    if (updateData.pan) updateData.pan = String(updateData.pan).toUpperCase();
    if (updateData.bank_ifsc) {
      updateData.bank_ifsc = String(updateData.bank_ifsc).toUpperCase();
    }
    if (updateData.additional_bank_accounts !== undefined) {
      updateData.additional_bank_accounts = this.serializeAdditionalBanks(updateData.additional_bank_accounts);
    }
    if (updateData.opening_balance !== undefined) {
      updateData.opening_balance = new Decimal(updateData.opening_balance || 0).toFixed(2);
    }
    if (updateData.payment_terms_days !== undefined) {
      updateData.payment_terms_days =
        updateData.payment_terms_days !== null && String(updateData.payment_terms_days).trim() !== ''
          ? Math.max(0, Math.round(Number(updateData.payment_terms_days) || 0))
          : 0;
    }

    await this.db('suppliers').where({ company_id: companyId, id: supplierId }).update(updateData);
    return (await this.getSupplierById(companyId, supplierId))!;
  }

  async archiveSupplier(companyId: string, supplierId: string): Promise<void> {
    const hasPurchases = await this.db('purchase_invoices').where({ company_id: companyId, supplier_id: supplierId }).first();
    const hasOrders = await this.db('purchase_orders').where({ company_id: companyId, supplier_id: supplierId }).first();
    if (!hasPurchases && !hasOrders) {
      await this.db('suppliers').where({ company_id: companyId, id: supplierId }).delete();
    } else {
      await this.db('suppliers').where({ company_id: companyId, id: supplierId }).update({
        is_archived: true,
        updated_at: new Date().toISOString(),
      });
    }
  }

  // ===================== PRODUCTS & SERVICES =====================
  private hydrateProduct(row: any): Product {
    let customNotes: string[] = [];
    if (Array.isArray(row.custom_notes)) {
      customNotes = row.custom_notes.map((n: any) => String(n ?? ''));
    } else if (typeof row.custom_notes === 'string' && row.custom_notes.trim()) {
      try {
        const parsed = JSON.parse(row.custom_notes);
        if (Array.isArray(parsed)) {
          customNotes = parsed.map((n: any) => String(n ?? ''));
        }
      } catch {
        customNotes = [row.custom_notes.trim()];
      }
    }
    return {
      ...row,
      custom_notes: customNotes,
    };
  }

  private serializeCustomNotes(notes?: string[] | string): string | null {
    if (!notes) return null;
    if (typeof notes === 'string') {
      const trimmed = notes.trim();
      return trimmed ? JSON.stringify([trimmed]) : null;
    }
    const cleaned = notes.map((n) => String(n ?? '').trim()).filter((n) => n.length > 0);
    return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
  }

  async getProducts(
    companyId: string,
    options?: { item_type?: 'PRODUCT' | 'SERVICE'; category_id?: string; search?: string }
  ): Promise<Product[]> {
    let query = this.db('products')
      .leftJoin('categories', 'products.category_id', 'categories.id')
      .select('products.*', 'categories.name as category_name')
      .where('products.company_id', companyId)
      .where('products.is_archived', false);

    if (options?.item_type) {
      query = query.andWhere('products.item_type', options.item_type);
    }
    if (options?.category_id) {
      query = query.andWhere('products.category_id', options.category_id);
    }
    if (options?.search) {
      const s = `%${options.search.toLowerCase()}%`;
      query = query.andWhere((qb) => {
        qb.whereRaw('LOWER(products.name) LIKE ?', [s])
          .orWhereRaw('LOWER(products.sku) LIKE ?', [s])
          .orWhereRaw('LOWER(products.product_code) LIKE ?', [s])
          .orWhereRaw('LOWER(products.hsn_or_sac) LIKE ?', [s])
          .orWhereRaw('LOWER(products.custom_notes) LIKE ?', [s]);
      });
    }

    const rows = await query.orderBy('products.name', 'asc');
    return rows.map((r: any) => this.hydrateProduct(r));
  }

  async getProductById(companyId: string, productId: string): Promise<Product | null> {
    const p = await this.db('products')
      .leftJoin('categories', 'products.category_id', 'categories.id')
      .select('products.*', 'categories.name as category_name')
      .where('products.company_id', companyId)
      .where('products.id', productId)
      .first();
    return p ? this.hydrateProduct(p) : null;
  }

  async createProduct(companyId: string, data: Partial<Product>): Promise<Product> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const serializedNotes = this.serializeCustomNotes(data.custom_notes);
    const minPrice =
      data.min_selling_price !== undefined && data.min_selling_price !== null && String(data.min_selling_price).trim() !== ''
        ? new Decimal(data.min_selling_price).toFixed(2)
        : null;
    const maxPrice =
      data.max_selling_price !== undefined && data.max_selling_price !== null && String(data.max_selling_price).trim() !== ''
        ? new Decimal(data.max_selling_price).toFixed(2)
        : null;
    if (minPrice !== null && maxPrice !== null && new Decimal(minPrice).gt(new Decimal(maxPrice))) {
      throw new Error('Minimum selling price cannot be greater than maximum selling price.');
    }
    const dbRow: any = {
      id,
      company_id: companyId,
      item_type: data.item_type || 'PRODUCT',
      name: data.name || '',
      sku: data.sku || undefined,
      product_code: data.product_code || undefined,
      barcode: data.barcode || undefined,
      category_id: data.category_id || undefined,
      description: data.description || undefined,
      custom_notes: serializedNotes,
      image_url: data.image_url || undefined,
      unit: data.unit || 'NOS',
      hsn_or_sac: data.hsn_or_sac || '',
      gst_rate: new Decimal(data.gst_rate || 18).toFixed(2),
      purchase_price: new Decimal(data.purchase_price || 0).toFixed(2),
      selling_price: new Decimal(data.selling_price || 0).toFixed(2),
      min_selling_price: minPrice,
      max_selling_price: maxPrice,
      is_tax_inclusive: Boolean(data.is_tax_inclusive),
      minimum_stock: new Decimal(data.minimum_stock || 0).toFixed(2),
      current_stock: new Decimal(data.current_stock || 0).toFixed(2),
      preferred_supplier_id: data.preferred_supplier_id || undefined,
      is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
      is_archived: false,
      created_at: now,
      updated_at: now,
    };

    await this.db('products').insert(dbRow);

    if (dbRow.item_type === 'PRODUCT') {
      try {
        let defaultWh = await this.db('warehouses')
          .where({ company_id: companyId, is_default: true, is_active: true })
          .first();
        if (!defaultWh) {
          defaultWh = await this.db('warehouses').where({ company_id: companyId, is_active: true }).first();
        }
        if (!defaultWh) {
          const defaultBranch =
            (await this.db('branches').where({ company_id: companyId, is_default: true, is_archived: false }).first()) ||
            (await this.db('branches').where({ company_id: companyId, is_archived: false }).first());
          const whId = uuidv4();
          await this.db('warehouses').insert({
            id: whId,
            company_id: companyId,
            branch_id: defaultBranch?.id || 'DEFAULT_BRANCH',
            name: 'Main Warehouse',
            code: 'MW01',
            address: 'Default Local Storage',
            is_default: true,
            is_active: true,
            created_at: now,
            updated_at: now,
          });
          defaultWh = await this.db('warehouses').where({ id: whId }).first();
        }

        if (defaultWh) {
          const qtyDec = new Decimal(dbRow.current_stock || 0);
          const costDec = new Decimal(dbRow.purchase_price || 0);
          const totalVal = qtyDec.mul(costDec).toFixed(2);
          await this.db('stock_balances').insert({
            id: uuidv4(),
            company_id: companyId,
            warehouse_id: defaultWh.id,
            product_id: id,
            quantity_on_hand: qtyDec.toFixed(2),
            average_unit_cost: costDec.toFixed(2),
            total_stock_value: totalVal,
            last_updated_at: now,
          });

          if (qtyDec.gt(0)) {
            await this.db('inventory_transactions').insert({
              id: uuidv4(),
              company_id: companyId,
              branch_id: defaultWh.branch_id || 'DEFAULT_BRANCH',
              warehouse_id: defaultWh.id,
              product_id: id,
              movement_type: 'OPENING_BALANCE',
              quantity: qtyDec.toFixed(2),
              unit_cost: costDec.toFixed(2),
              total_cost: totalVal,
              reference_document_type: 'OPENING_BALANCE',
              reference_document_id: id,
              reference_document_number: 'INIT-STOCK',
              notes: 'Initial opening stock balance',
              transaction_date: now.split('T')[0],
              created_at: now,
            });
          }
        }
      } catch (err) {
        console.error('Failed to initialize stock_balances on createProduct:', err);
      }
    }

    return this.hydrateProduct(dbRow);
  }

  async updateProduct(companyId: string, productId: string, data: Partial<Product>): Promise<Product> {
    const now = new Date().toISOString();
    const allowed = new Set([
      'item_type',
      'name',
      'sku',
      'product_code',
      'barcode',
      'category_id',
      'description',
      'custom_notes',
      'image_url',
      'unit',
      'hsn_or_sac',
      'gst_rate',
      'purchase_price',
      'selling_price',
      'min_selling_price',
      'max_selling_price',
      'is_tax_inclusive',
      'minimum_stock',
      'preferred_supplier_id',
      'is_active',
    ]);
    const updateData: Record<string, any> = { updated_at: now };
    for (const [k, v] of Object.entries(data || {})) {
      if (allowed.has(k)) {
        updateData[k] = v;
      }
    }

    if (updateData.current_stock !== undefined && updateData.current_stock !== null && String(updateData.current_stock).trim() !== '') {
      updateData.current_stock = new Decimal(updateData.current_stock || 0).toFixed(2);
    }

    if (updateData.custom_notes !== undefined) {
      updateData.custom_notes = this.serializeCustomNotes(updateData.custom_notes);
    }
    if (updateData.min_selling_price !== undefined) {
      updateData.min_selling_price =
        updateData.min_selling_price !== null && String(updateData.min_selling_price).trim() !== ''
          ? new Decimal(updateData.min_selling_price).toFixed(2)
          : null;
    }
    if (updateData.max_selling_price !== undefined) {
      updateData.max_selling_price =
        updateData.max_selling_price !== null && String(updateData.max_selling_price).trim() !== ''
          ? new Decimal(updateData.max_selling_price).toFixed(2)
          : null;
    }
    if (
      updateData.min_selling_price !== undefined &&
      updateData.min_selling_price !== null &&
      updateData.max_selling_price !== undefined &&
      updateData.max_selling_price !== null &&
      new Decimal(updateData.min_selling_price).gt(new Decimal(updateData.max_selling_price))
    ) {
      throw new Error('Minimum selling price cannot be greater than maximum selling price.');
    }
    if (updateData.gst_rate !== undefined) {
      const gstDec = new Decimal(updateData.gst_rate || 0);
      if (gstDec.lt(0) || gstDec.gt(100)) throw new Error('GST rate must be between 0% and 100%.');
      updateData.gst_rate = gstDec.toFixed(2);
    }
    if (updateData.purchase_price !== undefined) {
      const pDec = new Decimal(updateData.purchase_price || 0);
      if (pDec.lt(0)) throw new Error('Purchase price cannot be negative.');
      updateData.purchase_price = pDec.toFixed(2);
    }
    if (updateData.selling_price !== undefined) {
      const sDec = new Decimal(updateData.selling_price || 0);
      if (sDec.lt(0)) throw new Error('Selling price cannot be negative.');
      updateData.selling_price = sDec.toFixed(2);
    }
    if (updateData.minimum_stock !== undefined) {
      const mDec = new Decimal(updateData.minimum_stock || 0);
      if (mDec.lt(0)) throw new Error('Minimum stock cannot be negative.');
      updateData.minimum_stock = mDec.toFixed(2);
    }

    await this.db('products').where({ company_id: companyId, id: productId }).update(updateData);

    if (updateData.current_stock !== undefined || updateData.purchase_price !== undefined) {
      try {
        const prod = await this.db('products').where({ id: productId, company_id: companyId }).first();
        if (prod && prod.item_type === 'PRODUCT') {
          const targetQty = new Decimal(prod.current_stock || 0);
          const unitCost = new Decimal(prod.purchase_price || 0);
          const balances = await this.db('stock_balances').where({ company_id: companyId, product_id: productId });

          if (balances.length > 0) {
            const primary = balances[0];
            const oldQty = new Decimal(primary.quantity_on_hand || 0);
            const diff = targetQty.sub(oldQty);

            await this.db('stock_balances').where({ id: primary.id }).update({
              quantity_on_hand: targetQty.toFixed(2),
              average_unit_cost: unitCost.toFixed(2),
              total_stock_value: targetQty.mul(unitCost).toFixed(2),
              last_updated_at: now,
            });

            if (!diff.isZero()) {
              const wh = await this.db('warehouses').where({ id: primary.warehouse_id }).first();
              await this.db('inventory_transactions').insert({
                id: uuidv4(),
                company_id: companyId,
                branch_id: wh?.branch_id || 'DEFAULT_BRANCH',
                warehouse_id: primary.warehouse_id,
                product_id: productId,
                movement_type: diff.gt(0) ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_REDUCE',
                quantity: diff.toFixed(2),
                unit_cost: unitCost.toFixed(2),
                total_cost: diff.abs().mul(unitCost).toFixed(2),
                reference_document_type: 'STOCK_ADJUSTMENT',
                reference_document_id: productId,
                reference_document_number: `ADJ-${Date.now()}`,
                notes: 'Stock quantity updated from Products catalogue',
                transaction_date: now.split('T')[0],
                created_at: now,
              });
            }
          } else {
            let defaultWh = await this.db('warehouses').where({ company_id: companyId, is_default: true, is_active: true }).first();
            if (!defaultWh) {
              defaultWh = await this.db('warehouses').where({ company_id: companyId, is_active: true }).first();
            }
            if (!defaultWh) {
              const defaultBranch =
                (await this.db('branches').where({ company_id: companyId, is_default: true, is_archived: false }).first()) ||
                (await this.db('branches').where({ company_id: companyId, is_archived: false }).first());
              const whId = uuidv4();
              await this.db('warehouses').insert({
                id: whId,
                company_id: companyId,
                branch_id: defaultBranch?.id || 'DEFAULT_BRANCH',
                name: 'Main Warehouse',
                code: 'MW01',
                address: 'Default Local Storage',
                is_default: true,
                is_active: true,
                created_at: now,
                updated_at: now,
              });
              defaultWh = await this.db('warehouses').where({ id: whId }).first();
            }

            if (defaultWh) {
              await this.db('stock_balances').insert({
                id: uuidv4(),
                company_id: companyId,
                warehouse_id: defaultWh.id,
                product_id: productId,
                quantity_on_hand: targetQty.toFixed(2),
                average_unit_cost: unitCost.toFixed(2),
                total_stock_value: targetQty.mul(unitCost).toFixed(2),
                last_updated_at: now,
              });

              if (targetQty.gt(0)) {
                await this.db('inventory_transactions').insert({
                  id: uuidv4(),
                  company_id: companyId,
                  branch_id: defaultWh.branch_id || 'DEFAULT_BRANCH',
                  warehouse_id: defaultWh.id,
                  product_id: productId,
                  movement_type: 'OPENING_BALANCE',
                  quantity: targetQty.toFixed(2),
                  unit_cost: unitCost.toFixed(2),
                  total_cost: targetQty.mul(unitCost).toFixed(2),
                  reference_document_type: 'OPENING_BALANCE',
                  reference_document_id: productId,
                  reference_document_number: 'INIT-STOCK',
                  notes: 'Initial stock balance from Products catalogue',
                  transaction_date: now.split('T')[0],
                  created_at: now,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('Error syncing stock balance on updateProduct:', err);
      }
    }

    return (await this.getProductById(companyId, productId))!;
  }

  async archiveProduct(companyId: string, productId: string): Promise<void> {
    const hasInvItem = await this.db('invoice_items').where({ item_id: productId }).first();
    const hasQuoteItem = await this.db('quotation_items').where({ item_id: productId }).first();
    if (!hasInvItem && !hasQuoteItem) {
      await this.db('stock_balances').where({ company_id: companyId, product_id: productId }).delete();
      await this.db('products').where({ company_id: companyId, id: productId }).delete();
    } else {
      await this.db('products').where({ company_id: companyId, id: productId }).update({
        is_archived: true,
        updated_at: new Date().toISOString(),
      });
    }
  }

  // ===================== CATEGORIES & UNITS =====================
  async getCategories(companyId: string): Promise<Category[]> {
    return this.db('categories').where({ company_id: companyId }).orderBy('name', 'asc');
  }

  async createCategory(companyId: string, name: string, description?: string): Promise<Category> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const cat: Category = {
      id,
      company_id: companyId,
      name,
      description,
      created_at: now,
      updated_at: now,
    };
    await this.db('categories').insert(cat);
    return cat;
  }

  async deleteCategory(companyId: string, categoryId: string): Promise<void> {
    await this.db('products').where({ company_id: companyId, category_id: categoryId }).update({ category_id: null });
    await this.db('categories').where({ company_id: companyId, id: categoryId }).delete();
  }

  async getUnits(companyId: string): Promise<Unit[]> {
    return this.db('units').where({ company_id: companyId }).orderBy('name', 'asc');
  }

  // ===================== NUMBERING SEQUENCES =====================
  async getSequences(companyId: string): Promise<NumberingSequence[]> {
    return this.db('numbering_sequences').where({ company_id: companyId }).orderBy('document_type', 'asc');
  }

  async updateSequence(companyId: string, seqId: string, data: Partial<NumberingSequence>): Promise<NumberingSequence> {
    const allowed = new Set([
      'prefix',
      'suffix',
      'padding_length',
      'current_number',
      'include_financial_year',
      'fy_format',
      'separator',
    ]);
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    for (const [k, v] of Object.entries(data || {})) {
      if (allowed.has(k)) {
        updateData[k] = v;
      }
    }
    if (updateData.current_number !== undefined) {
      const n = Math.floor(Number(updateData.current_number));
      if (!Number.isFinite(n) || n < 0) {
        throw new Error('Sequence current number must be a non-negative integer.');
      }
      updateData.current_number = n;
    }
    if (updateData.padding_length !== undefined) {
      const p = Math.floor(Number(updateData.padding_length));
      if (!Number.isFinite(p) || p < 1 || p > 12) {
        throw new Error('Padding length must be between 1 and 12.');
      }
      updateData.padding_length = p;
    }

    await this.db('numbering_sequences').where({ company_id: companyId, id: seqId }).update(updateData);
    return this.db('numbering_sequences').where({ company_id: companyId, id: seqId }).first();
  }
}
