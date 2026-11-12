// src/server/services/masterDataService.ts - Customers, Suppliers, Products, Units, Categories
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { Customer, Supplier, Product, Category, Unit, NumberingSequence } from '../../shared/types';
import Decimal from 'decimal.js';

export class MasterDataService {
  constructor(private db: Knex) {}

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
    return query.orderBy('name', 'asc');
  }

  async getCustomerById(companyId: string, customerId: string, trx?: Knex.Transaction | Knex): Promise<Customer | null> {
    const qb = trx || this.db;
    const cust = await qb('customers').where({ company_id: companyId, id: customerId }).first();
    return cust || null;
  }

  async createCustomer(companyId: string, data: Partial<Customer>): Promise<Customer> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const customer: Customer = {
      id,
      company_id: companyId,
      customer_type: data.customer_type || 'BUSINESS',
      name: data.name || '',
      company_name: data.company_name || undefined,
      contact_person: data.contact_person || undefined,
      mobile: data.mobile || (data as any).phone || '',
      alternate_phone: data.alternate_phone || undefined,
      email: data.email || undefined,
      gstin: data.gstin?.toUpperCase() || undefined,
      pan: data.pan?.toUpperCase() || undefined,
      billing_address: data.billing_address || '',
      shipping_address: data.shipping_address || data.billing_address || '',
      city: data.city || '',
      state: data.state || 'Madhya Pradesh',
      state_code: data.state_code || '23',
      pin_code: data.pin_code || '',
      opening_balance: new Decimal(data.opening_balance || 0).toFixed(2),
      current_balance: new Decimal(data.opening_balance || 0).toFixed(2),
      credit_limit: new Decimal(data.credit_limit || 0).toFixed(2),
      payment_terms_days: Number(data.payment_terms_days) || 30,
      notes: data.notes || undefined,
      is_archived: false,
      created_at: now,
      updated_at: now,
    };

    await this.db('customers').insert(customer);
    return customer;
  }

  async updateCustomer(companyId: string, customerId: string, data: Partial<Customer>): Promise<Customer> {
    const now = new Date().toISOString();
    const updateData = { ...data, updated_at: now };
    delete (updateData as any).id;
    delete (updateData as any).company_id;

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
    return query.orderBy('name', 'asc');
  }

  async getSupplierById(companyId: string, supplierId: string): Promise<Supplier | null> {
    const sup = await this.db('suppliers').where({ company_id: companyId, id: supplierId }).first();
    return sup || null;
  }

  async createSupplier(companyId: string, data: Partial<Supplier>): Promise<Supplier> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const supplier: Supplier = {
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
      bank_ifsc: data.bank_ifsc || undefined,
      upi_id: data.upi_id || undefined,
      opening_balance: new Decimal(data.opening_balance || 0).toFixed(2),
      current_balance: new Decimal(data.opening_balance || 0).toFixed(2),
      payment_terms_days: Number(data.payment_terms_days) || 30,
      notes: data.notes || undefined,
      is_archived: false,
      created_at: now,
      updated_at: now,
    };

    await this.db('suppliers').insert(supplier);
    return supplier;
  }

  async updateSupplier(companyId: string, supplierId: string, data: Partial<Supplier>): Promise<Supplier> {
    const now = new Date().toISOString();
    const updateData = { ...data, updated_at: now };
    delete (updateData as any).id;
    delete (updateData as any).company_id;

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
          .orWhereRaw('LOWER(products.hsn_or_sac) LIKE ?', [s]);
      });
    }

    return query.orderBy('products.name', 'asc');
  }

  async getProductById(companyId: string, productId: string): Promise<Product | null> {
    const p = await this.db('products')
      .leftJoin('categories', 'products.category_id', 'categories.id')
      .select('products.*', 'categories.name as category_name')
      .where('products.company_id', companyId)
      .where('products.id', productId)
      .first();
    return p || null;
  }

  async createProduct(companyId: string, data: Partial<Product>): Promise<Product> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const product: Product = {
      id,
      company_id: companyId,
      item_type: data.item_type || 'PRODUCT',
      name: data.name || '',
      sku: data.sku || undefined,
      product_code: data.product_code || undefined,
      barcode: data.barcode || undefined,
      category_id: data.category_id || undefined,
      description: data.description || undefined,
      image_url: data.image_url || undefined,
      unit: data.unit || 'NOS',
      hsn_or_sac: data.hsn_or_sac || '',
      gst_rate: new Decimal(data.gst_rate || 18).toFixed(2),
      purchase_price: new Decimal(data.purchase_price || 0).toFixed(2),
      selling_price: new Decimal(data.selling_price || 0).toFixed(2),
      is_tax_inclusive: Boolean(data.is_tax_inclusive),
      minimum_stock: new Decimal(data.minimum_stock || 0).toFixed(2),
      current_stock: new Decimal(data.current_stock || 0).toFixed(2),
      preferred_supplier_id: data.preferred_supplier_id || undefined,
      is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
      is_archived: false,
      created_at: now,
      updated_at: now,
    };

    await this.db('products').insert(product);
    return product;
  }

  async updateProduct(companyId: string, productId: string, data: Partial<Product>): Promise<Product> {
    const now = new Date().toISOString();
    const updateData = { ...data, updated_at: now };
    delete (updateData as any).id;
    delete (updateData as any).company_id;
    delete (updateData as any).category_name;

    if (updateData.gst_rate !== undefined) updateData.gst_rate = new Decimal(updateData.gst_rate).toFixed(2);
    if (updateData.purchase_price !== undefined) updateData.purchase_price = new Decimal(updateData.purchase_price).toFixed(2);
    if (updateData.selling_price !== undefined) updateData.selling_price = new Decimal(updateData.selling_price).toFixed(2);
    if (updateData.minimum_stock !== undefined) updateData.minimum_stock = new Decimal(updateData.minimum_stock).toFixed(2);

    await this.db('products').where({ company_id: companyId, id: productId }).update(updateData);
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
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    delete (updateData as any).id;
    delete (updateData as any).company_id;

    await this.db('numbering_sequences').where({ company_id: companyId, id: seqId }).update(updateData);
    return this.db('numbering_sequences').where({ company_id: companyId, id: seqId }).first();
  }
}
