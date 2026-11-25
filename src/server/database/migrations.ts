// src/server/database/migrations.ts - Automated database schema migrations for SQLite and PostgreSQL
import { Knex } from 'knex';

export async function runMigrations(db: Knex): Promise<void> {
  // 1. Application Settings
  if (!(await db.schema.hasTable('app_settings'))) {
    await db.schema.createTable('app_settings', (table) => {
      table.string('id').primary();
      table.string('operating_mode').defaultTo('SINGLE_COMPUTER');
      table.string('db_type').defaultTo('sqlite');
      table.string('pg_host').nullable();
      table.integer('pg_port').defaultTo(5432);
      table.string('pg_database').nullable();
      table.string('pg_user').nullable();
      table.string('pg_password').nullable();
      table.integer('server_port').defaultTo(4200);
      table.boolean('show_company_selector_on_startup').defaultTo(true);
      table.string('theme').defaultTo('light');
      table.text('software_icon').nullable();
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();
    });
  }

  // 2. Companies
  if (!(await db.schema.hasTable('companies'))) {
    await db.schema.createTable('companies', (table) => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('legal_name').notNullable();
      table.string('business_type').defaultTo('Proprietorship');
      table.text('logo_url').nullable();
      table.text('registered_address').notNullable();
      table.string('gstin').nullable();
      table.string('pan').nullable();
      table.string('tan').nullable();
      table.string('cin').nullable();
      table.string('iso').nullable();
      table.string('msme').nullable();
      table.string('financial_year').nullable();
      table.string('state').notNullable();
      table.string('state_code', 2).notNullable();
      table.string('pin_code', 10).notNullable();
      table.string('phone').notNullable();
      table.string('email').notNullable();
      table.string('website').nullable();
      table.string('bank_name').nullable();
      table.string('bank_account_no').nullable();
      table.string('bank_ifsc').nullable();
      table.string('bank_branch').nullable();
      table.string('upi_id').nullable();
      table.text('default_invoice_terms').nullable();
      table.text('default_quotation_terms').nullable();
      table.boolean('is_default').defaultTo(false);
      table.boolean('is_archived').defaultTo(false);
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();
    });
  }

  // 3. Branches
  if (!(await db.schema.hasTable('branches'))) {
    await db.schema.createTable('branches', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('name').notNullable();
      table.string('code').notNullable();
      table.text('address').notNullable();
      table.string('phone').notNullable();
      table.string('email').notNullable();
      table.string('gstin').nullable();
      table.string('tan').nullable();
      table.string('cin').nullable();
      table.string('iso').nullable();
      table.string('msme').nullable();
      table.string('financial_year').nullable();
      table.string('state').notNullable();
      table.string('state_code', 2).notNullable();
      table.boolean('is_default').defaultTo(false);
      table.boolean('is_archived').defaultTo(false);
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.index(['company_id']);
    });
  }

  // 4. Company Settings
  if (!(await db.schema.hasTable('company_settings'))) {
    await db.schema.createTable('company_settings', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().unique().references('id').inTable('companies').onDelete('CASCADE');
      table.integer('invoice_overdue_days').defaultTo(0);
      table.boolean('print_invoice_after_save').defaultTo(true);
      table.boolean('show_postal_code_before_city').defaultTo(false);
      table.boolean('include_additional_notes_in_search').defaultTo(true);
      table.boolean('sort_invoices_by_number').defaultTo(true);
      table.boolean('show_amount_in_words').defaultTo(true);
      table.boolean('zero_not_displayed').defaultTo(false);
      table.boolean('indian_number_style').defaultTo(true);
      table.string('currency_name').defaultTo('Rupees');
      table.string('currency_symbol').defaultTo('₹');
      table.string('decimal_name').defaultTo('Paise');
      table.string('printed_date_format').defaultTo('DD/MM/YYYY');
      table.boolean('allow_negative_stock').defaultTo(true);
      table.string('inventory_valuation_method').defaultTo('FIFO');
      table.boolean('enable_reverse_charge_by_default').defaultTo(false);
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();
    });
  }

  // 5. Numbering Sequences
  if (!(await db.schema.hasTable('numbering_sequences'))) {
    await db.schema.createTable('numbering_sequences', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('branch_id').nullable();
      table.string('document_type').notNullable();
      table.string('prefix').defaultTo('');
      table.string('suffix').defaultTo('');
      table.integer('padding_length').defaultTo(4);
      table.integer('current_number').defaultTo(0);
      table.boolean('include_financial_year').defaultTo(true);
      table.string('fy_format').defaultTo('YYYY-YY');
      table.string('separator').defaultTo('/');
      table.string('custom_format').nullable();
      table.string('last_generated_number').nullable();
      table.string('updated_at').notNullable();

      table.index(['company_id', 'document_type']);
    });
  }

  // 6. Categories
  if (!(await db.schema.hasTable('categories'))) {
    await db.schema.createTable('categories', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('name').notNullable();
      table.text('description').nullable();
      table.string('parent_id').nullable();
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.index(['company_id']);
    });
  }

  // 7. Units
  if (!(await db.schema.hasTable('units'))) {
    await db.schema.createTable('units', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('name').notNullable();
      table.string('code').notNullable();
      table.boolean('is_decimal_allowed').defaultTo(false);

      table.index(['company_id']);
    });
  }

  // 8. Products and Services
  if (!(await db.schema.hasTable('products'))) {
    await db.schema.createTable('products', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('item_type').defaultTo('PRODUCT'); // PRODUCT or SERVICE
      table.string('name').notNullable();
      table.string('sku').nullable();
      table.string('product_code').nullable();
      table.string('barcode').nullable();
      table.string('category_id').nullable().references('id').inTable('categories').onDelete('SET NULL');
      table.text('description').nullable();
      table.text('custom_notes').nullable();
      table.text('image_url').nullable();
      table.string('unit').defaultTo('NOS');
      table.string('hsn_or_sac').notNullable();
      table.string('gst_rate').defaultTo('18.00');
      table.string('purchase_price').defaultTo('0.00');
      table.string('selling_price').defaultTo('0.00');
      table.string('min_selling_price').nullable();
      table.string('max_selling_price').nullable();
      table.boolean('is_tax_inclusive').defaultTo(false);
      table.string('minimum_stock').defaultTo('0.00');
      table.string('current_stock').defaultTo('0.00');
      table.string('preferred_supplier_id').nullable();
      table.boolean('is_active').defaultTo(true);
      table.boolean('is_archived').defaultTo(false);
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.index(['company_id', 'item_type']);
      table.index(['company_id', 'name']);
    });
  }

  // 9. Customers
  if (!(await db.schema.hasTable('customers'))) {
    await db.schema.createTable('customers', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('customer_type').defaultTo('CORPORATE');
      table.string('name').notNullable();
      table.string('company_name').nullable();
      table.string('contact_person').nullable();
      table.string('mobile').notNullable();
      table.string('alternate_phone').nullable();
      table.string('email').nullable();
      table.string('gstin').nullable();
      table.string('pan').nullable();
      table.string('tan').nullable();
      table.string('cin').nullable();
      table.string('iso').nullable();
      table.string('msme').nullable();
      table.string('financial_year').nullable();
      table.text('billing_address').notNullable();
      table.text('shipping_address').notNullable();
      table.string('city').notNullable();
      table.string('state').notNullable();
      table.string('state_code', 2).notNullable();
      table.string('pin_code', 10).notNullable();
      table.string('bank_name').nullable();
      table.string('bank_account_no').nullable();
      table.string('bank_ifsc').nullable();
      table.string('bank_branch').nullable();
      table.string('upi_id').nullable();
      table.string('opening_balance').defaultTo('0.00');
      table.string('current_balance').defaultTo('0.00');
      table.string('credit_limit').defaultTo('0.00');
      table.integer('payment_terms_days').defaultTo(30);
      table.text('notes').nullable();
      table.boolean('is_archived').defaultTo(false);
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.index(['company_id']);
      table.index(['company_id', 'name']);
    });
  }

  // 10. Customer Addresses
  if (!(await db.schema.hasTable('customer_addresses'))) {
    await db.schema.createTable('customer_addresses', (table) => {
      table.string('id').primary();
      table.string('customer_id').notNullable().references('id').inTable('customers').onDelete('CASCADE');
      table.string('address_type').defaultTo('BILLING');
      table.text('street').notNullable();
      table.string('city').notNullable();
      table.string('state').notNullable();
      table.string('state_code', 2).notNullable();
      table.string('pin_code', 10).notNullable();
      table.boolean('is_default').defaultTo(true);

      table.index(['customer_id']);
    });
  }

  // 11. Suppliers
  if (!(await db.schema.hasTable('suppliers'))) {
    await db.schema.createTable('suppliers', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('name').notNullable();
      table.string('company_name').nullable();
      table.string('contact_person').nullable();
      table.string('mobile').notNullable();
      table.string('email').nullable();
      table.string('gstin').nullable();
      table.string('pan').nullable();
      table.string('tan').nullable();
      table.string('cin').nullable();
      table.string('iso').nullable();
      table.string('msme').nullable();
      table.string('financial_year').nullable();
      table.text('address').notNullable();
      table.string('state').notNullable();
      table.string('state_code', 2).notNullable();
      table.string('pin_code', 10).notNullable();
      table.string('bank_name').nullable();
      table.string('bank_account_no').nullable();
      table.string('bank_ifsc').nullable();
      table.string('bank_branch').nullable();
      table.string('upi_id').nullable();
      table.string('opening_balance').defaultTo('0.00');
      table.string('current_balance').defaultTo('0.00');
      table.integer('payment_terms_days').defaultTo(30);
      table.text('notes').nullable();
      table.boolean('is_archived').defaultTo(false);
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.index(['company_id']);
    });
  }

  // 12. Warehouses
  if (!(await db.schema.hasTable('warehouses'))) {
    await db.schema.createTable('warehouses', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('branch_id').notNullable();
      table.string('name').notNullable();
      table.string('code').notNullable();
      table.text('address').notNullable();
      table.boolean('is_default').defaultTo(false);
      table.boolean('is_active').defaultTo(true);
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.index(['company_id']);
    });
  }

  // 13. Invoices
  if (!(await db.schema.hasTable('invoices'))) {
    await db.schema.createTable('invoices', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('branch_id').notNullable();
      table.string('document_type').notNullable();
      table.string('invoice_number').notNullable();
      table.string('invoice_date').notNullable();
      table.string('due_date').notNullable();
      table.string('customer_id').notNullable().references('id').inTable('customers');
      table.string('customer_name').notNullable();
      table.string('customer_gstin').nullable();
      table.string('customer_pan').nullable();
      table.text('billing_address').notNullable();
      table.text('shipping_address').notNullable();
      table.string('place_of_supply_state').notNullable();
      table.string('place_of_supply_code', 2).notNullable();
      table.boolean('is_inter_state').defaultTo(false);
      table.boolean('is_reverse_charge').defaultTo(false);
      table.string('reference_number').nullable();
      table.string('purchase_order_number').nullable();
      table.string('payment_terms').nullable();
      table.string('subtotal').defaultTo('0.00');
      table.string('overall_discount_percentage').defaultTo('0.00');
      table.string('overall_discount_amount').defaultTo('0.00');
      table.string('total_taxable_value').defaultTo('0.00');
      table.string('total_cgst').defaultTo('0.00');
      table.string('total_sgst').defaultTo('0.00');
      table.string('total_igst').defaultTo('0.00');
      table.string('total_tax').defaultTo('0.00');
      table.string('additional_charges').defaultTo('0.00');
      table.string('round_off').defaultTo('0.00');
      table.string('grand_total').defaultTo('0.00');
      table.text('amount_in_words').notNullable();
      table.string('paid_amount').defaultTo('0.00');
      table.string('balance_amount').defaultTo('0.00');
      table.string('status').defaultTo('DRAFT'); // DRAFT, REVIEW, FINALIZED, CANCELLED
      table.string('finalized_at').nullable();
      table.string('cancelled_at').nullable();
      table.text('cancellation_reason').nullable();
      table.string('letterhead_template_id').nullable();
      table.text('notes').nullable();
      table.text('terms_conditions').nullable();
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.index(['company_id', 'status']);
      table.index(['company_id', 'document_type']);
      table.index(['company_id', 'customer_id']);
      table.unique(['company_id', 'document_type', 'invoice_number']);
    });
  }

  // 14. Invoice Items
  if (!(await db.schema.hasTable('invoice_items'))) {
    await db.schema.createTable('invoice_items', (table) => {
      table.string('id').primary();
      table.string('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
      table.string('item_id').nullable();
      table.string('item_type').defaultTo('PRODUCT');
      table.string('item_name').notNullable();
      table.text('description').nullable();
      table.string('hsn_or_sac').notNullable();
      table.string('quantity').defaultTo('1.00');
      table.string('unit').defaultTo('NOS');
      table.string('rate').defaultTo('0.00');
      table.string('discount_percentage').defaultTo('0.00');
      table.string('discount_amount').defaultTo('0.00');
      table.boolean('is_tax_inclusive').defaultTo(false);
      table.string('taxable_value').defaultTo('0.00');
      table.string('gst_rate').defaultTo('18.00');
      table.string('cgst_rate').defaultTo('9.00');
      table.string('cgst_amount').defaultTo('0.00');
      table.string('sgst_rate').defaultTo('9.00');
      table.string('sgst_amount').defaultTo('0.00');
      table.string('igst_rate').defaultTo('0.00');
      table.string('igst_amount').defaultTo('0.00');
      table.string('total_tax').defaultTo('0.00');
      table.string('line_total').defaultTo('0.00');
      table.integer('sort_order').defaultTo(0);

      table.index(['invoice_id']);
    });
  }

  // 15. Quotations
  if (!(await db.schema.hasTable('quotations'))) {
    await db.schema.createTable('quotations', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('branch_id').nullable();
      table.string('quotation_number').notNullable();
      table.integer('revision_number').defaultTo(1);
      table.string('quotation_date').notNullable();
      table.string('valid_until_date').notNullable();
      table.string('customer_id').nullable().references('id').inTable('customers');
      table.string('customer_name').notNullable();
      table.string('customer_gstin').nullable();
      table.text('billing_address').notNullable();
      table.text('shipping_address').nullable();
      table.string('customer_state').nullable();
      table.string('customer_state_code').nullable();
      table.string('place_of_supply').nullable();
      table.string('place_of_supply_state').nullable();
      table.string('place_of_supply_code', 2).nullable();
      table.string('contact_person').nullable();
      table.string('contact_phone').nullable();
      table.string('contact_email').nullable();
      table.boolean('reverse_charge').defaultTo(false);
      table.string('subtotal').defaultTo('0.00');
      table.string('overall_discount_amount').defaultTo('0.00');
      table.string('discount_total').defaultTo('0.00');
      table.string('total_taxable_value').defaultTo('0.00');
      table.string('taxable_total').defaultTo('0.00');
      table.string('total_cgst').defaultTo('0.00');
      table.string('cgst_total').defaultTo('0.00');
      table.string('total_sgst').defaultTo('0.00');
      table.string('sgst_total').defaultTo('0.00');
      table.string('total_igst').defaultTo('0.00');
      table.string('igst_total').defaultTo('0.00');
      table.string('total_utgst').defaultTo('0.00');
      table.string('utgst_total').defaultTo('0.00');
      table.string('total_tax').defaultTo('0.00');
      table.string('gst_total').defaultTo('0.00');
      table.string('additional_charges').defaultTo('0.00');
      table.string('round_off').defaultTo('0.00');
      table.string('grand_total').defaultTo('0.00');
      table.text('amount_in_words').notNullable();
      table.string('status').defaultTo('DRAFT'); // DRAFT, UNDER_REVIEW, SENT, ACCEPTED, REJECTED, EXPIRED, CONVERTED, CANCELLED
      table.string('converted_invoice_id').nullable();
      table.string('converted_at').nullable();
      table.string('letterhead_template_id').nullable();
      table.string('salutation').defaultTo('Dear Sir,');
      table.text('opening_text').defaultTo('With the reference to your enquiry, we are herewith quoting our lowest and best possible prices of the following.');
      table.text('closing_text').defaultTo('Thanking you and assuring of our best services and attention at all times.');
      table.string('sign_off_company').defaultTo('For VARUN SYSTEMS.');
      table.text('notes').nullable();
      table.text('terms_conditions').nullable();
      table.text('terms_and_conditions').nullable();
      table.float('top_margin_mm').defaultTo(55.0);
      table.float('bottom_margin_mm').defaultTo(32.0);
      table.float('left_margin_mm').defaultTo(15.0);
      table.float('right_margin_mm').defaultTo(15.0);
      table.boolean('print_letterhead_overlay').defaultTo(false);
      table.boolean('is_gst').defaultTo(true);
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.index(['company_id', 'status']);
      table.unique(['company_id', 'quotation_number', 'revision_number']);
    });
  }

  // 16. Quotation Items
  if (!(await db.schema.hasTable('quotation_items'))) {
    await db.schema.createTable('quotation_items', (table) => {
      table.string('id').primary();
      table.string('quotation_id').notNullable().references('id').inTable('quotations').onDelete('CASCADE');
      table.string('item_id').nullable();
      table.string('item_type').defaultTo('PRODUCT');
      table.string('item_name').notNullable();
      table.text('description').nullable();
      table.string('hsn_or_sac').defaultTo('');
      table.string('hsn_sac').defaultTo('');
      table.string('quantity').defaultTo('1.00');
      table.string('unit').defaultTo('NOS');
      table.string('units').defaultTo('01');
      table.string('rate').defaultTo('0.00');
      table.string('base_rate').defaultTo('0.00');
      table.string('discount_percentage').defaultTo('0.00');
      table.string('discount_amount').defaultTo('0.00');
      table.string('taxable_value').defaultTo('0.00');
      table.string('taxable_amount').defaultTo('0.00');
      table.string('gst_rate').defaultTo('18.00');
      table.string('cgst_rate').defaultTo('9.00');
      table.string('cgst_amount').defaultTo('0.00');
      table.string('sgst_rate').defaultTo('9.00');
      table.string('sgst_amount').defaultTo('0.00');
      table.string('igst_rate').defaultTo('0.00');
      table.string('igst_amount').defaultTo('0.00');
      table.string('utgst_rate').defaultTo('0.00');
      table.string('utgst_amount').defaultTo('0.00');
      table.string('total_tax').defaultTo('0.00');
      table.string('gst_amount').defaultTo('0.00');
      table.string('line_total').defaultTo('0.00');
      table.string('total_amount').defaultTo('0.00');
      table.integer('sort_order').defaultTo(0);

      table.index(['quotation_id']);
    });
  }

  // 17. Purchase Orders
  if (!(await db.schema.hasTable('purchase_orders'))) {
    await db.schema.createTable('purchase_orders', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('branch_id').notNullable();
      table.string('po_number').notNullable();
      table.string('po_date').notNullable();
      table.string('expected_delivery_date').nullable();
      table.string('supplier_id').notNullable().references('id').inTable('suppliers');
      table.string('supplier_name').notNullable();
      table.string('supplier_gstin').nullable();
      table.string('subtotal').defaultTo('0.00');
      table.string('total_tax').defaultTo('0.00');
      table.string('grand_total').defaultTo('0.00');
      table.string('status').defaultTo('DRAFT'); // DRAFT, CONFIRMED, RECEIVED, CANCELLED
      table.text('notes').nullable();
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.index(['company_id']);
      table.unique(['company_id', 'po_number']);
    });
  }

  // 18. Purchase Order Items
  if (!(await db.schema.hasTable('purchase_order_items'))) {
    await db.schema.createTable('purchase_order_items', (table) => {
      table.string('id').primary();
      table.string('purchase_order_id').notNullable().references('id').inTable('purchase_orders').onDelete('CASCADE');
      table.string('product_id').nullable();
      table.string('item_name').notNullable();
      table.string('hsn_code').defaultTo('');
      table.string('quantity').defaultTo('1.00');
      table.string('unit').defaultTo('NOS');
      table.string('rate').defaultTo('0.00');
      table.string('discount_amount').defaultTo('0.00');
      table.string('gst_rate').defaultTo('18.00');
      table.string('taxable_value').defaultTo('0.00');
      table.string('total_tax').defaultTo('0.00');
      table.string('line_total').defaultTo('0.00');

      table.index(['purchase_order_id']);
    });
  }

  // 19. Purchase Invoices (Bills)
  if (!(await db.schema.hasTable('purchase_invoices'))) {
    await db.schema.createTable('purchase_invoices', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('branch_id').notNullable();
      table.string('purchase_order_id').nullable();
      table.string('bill_number').notNullable();
      table.string('bill_date').notNullable();
      table.string('due_date').notNullable();
      table.string('supplier_id').notNullable().references('id').inTable('suppliers');
      table.string('supplier_name').notNullable();
      table.string('supplier_gstin').nullable();
      table.string('warehouse_id').notNullable().references('id').inTable('warehouses');
      table.string('subtotal').defaultTo('0.00');
      table.string('total_tax').defaultTo('0.00');
      table.string('overall_discount_type').defaultTo('AMOUNT');
      table.string('overall_discount_percentage').defaultTo('0.00');
      table.string('overall_discount_amount').defaultTo('0.00');
      table.string('grand_total').defaultTo('0.00');
      table.string('paid_amount').defaultTo('0.00');
      table.string('balance_amount').defaultTo('0.00');
      table.boolean('is_finalized').defaultTo(false);
      table.text('notes').nullable();
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.index(['company_id']);
      table.unique(['company_id', 'supplier_id', 'bill_number']);
    });
  }

  // 20. Purchase Invoice Items
  if (!(await db.schema.hasTable('purchase_invoice_items'))) {
    await db.schema.createTable('purchase_invoice_items', (table) => {
      table.string('id').primary();
      table.string('purchase_invoice_id').notNullable().references('id').inTable('purchase_invoices').onDelete('CASCADE');
      table.string('product_id').nullable();
      table.string('item_name').notNullable();
      table.string('hsn_code').defaultTo('');
      table.string('quantity').defaultTo('1.00');
      table.string('unit').defaultTo('NOS');
      table.string('rate').defaultTo('0.00');
      table.string('discount_amount').defaultTo('0.00');
      table.string('gst_rate').defaultTo('18.00');
      table.string('taxable_value').defaultTo('0.00');
      table.string('cgst_amount').defaultTo('0.00');
      table.string('sgst_amount').defaultTo('0.00');
      table.string('igst_amount').defaultTo('0.00');
      table.string('total_tax').defaultTo('0.00');
      table.string('line_total').defaultTo('0.00');

      table.index(['purchase_invoice_id']);
    });
  }

  // 21. Inventory Transactions (Stock Movements)
  if (!(await db.schema.hasTable('inventory_transactions'))) {
    await db.schema.createTable('inventory_transactions', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('branch_id').notNullable();
      table.string('warehouse_id').notNullable().references('id').inTable('warehouses');
      table.string('product_id').notNullable().references('id').inTable('products');
      table.string('movement_type').notNullable();
      table.string('quantity').notNullable(); // Positive for inward, negative for outward
      table.string('unit_cost').defaultTo('0.00');
      table.string('total_cost').defaultTo('0.00');
      table.string('reference_document_type').notNullable();
      table.string('reference_document_id').notNullable();
      table.string('reference_document_number').notNullable();
      table.string('batch_number').nullable();
      table.text('serial_numbers_json').nullable();
      table.text('notes').nullable();
      table.string('transaction_date').notNullable();
      table.string('created_at').notNullable();

      table.index(['company_id', 'product_id']);
      table.index(['company_id', 'warehouse_id']);
    });
  }

  // 22. Stock Balances
  if (!(await db.schema.hasTable('stock_balances'))) {
    await db.schema.createTable('stock_balances', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('warehouse_id').notNullable().references('id').inTable('warehouses');
      table.string('product_id').notNullable().references('id').inTable('products');
      table.string('quantity_on_hand').defaultTo('0.00');
      table.string('average_unit_cost').defaultTo('0.00');
      table.string('total_stock_value').defaultTo('0.00');
      table.string('last_updated_at').notNullable();

      table.unique(['company_id', 'warehouse_id', 'product_id']);
    });
  }

  // 23. Customer Payments
  if (!(await db.schema.hasTable('customer_payments'))) {
    await db.schema.createTable('customer_payments', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('branch_id').notNullable();
      table.string('payment_number').notNullable();
      table.string('payment_date').notNullable();
      table.string('customer_id').notNullable().references('id').inTable('customers');
      table.string('customer_name').notNullable();
      table.string('amount').notNullable();
      table.string('payment_method').defaultTo('BANK_TRANSFER');
      table.string('bank_account').nullable();
      table.string('reference_number').nullable();
      table.text('notes').nullable();
      table.string('unallocated_amount').defaultTo('0.00');
      table.string('created_at').notNullable();

      table.index(['company_id', 'customer_id']);
      table.unique(['company_id', 'payment_number']);
    });
  }

  // 24. Supplier Payments
  if (!(await db.schema.hasTable('supplier_payments'))) {
    await db.schema.createTable('supplier_payments', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('branch_id').notNullable();
      table.string('payment_number').notNullable();
      table.string('payment_date').notNullable();
      table.string('supplier_id').notNullable().references('id').inTable('suppliers');
      table.string('supplier_name').notNullable();
      table.string('amount').notNullable();
      table.string('payment_method').defaultTo('BANK_TRANSFER');
      table.string('bank_account').nullable();
      table.string('vendor_bank_account').nullable();
      table.string('reference_number').nullable();
      table.text('notes').nullable();
      table.string('unallocated_amount').defaultTo('0.00');
      table.string('created_at').notNullable();

      table.index(['company_id', 'supplier_id']);
      table.unique(['company_id', 'payment_number']);
    });
  }

  // 25. Payment Allocations
  if (!(await db.schema.hasTable('payment_allocations'))) {
    await db.schema.createTable('payment_allocations', (table) => {
      table.string('id').primary();
      table.string('payment_id').notNullable();
      table.string('document_type').notNullable(); // INVOICE or PURCHASE_INVOICE
      table.string('document_id').notNullable();
      table.string('document_number').notNullable();
      table.string('allocated_amount').notNullable();
      table.string('allocated_at').notNullable();

      table.index(['payment_id']);
      table.index(['document_id']);
    });
  }

  // 26. Letterhead Templates
  if (!(await db.schema.hasTable('letterhead_templates'))) {
    await db.schema.createTable('letterhead_templates', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('branch_id').nullable();
      table.string('name').notNullable();
      table.text('file_path').notNullable();
      table.string('file_type').defaultTo('PDF');
      table.string('page_size').defaultTo('A4');
      table.string('orientation').defaultTo('PORTRAIT');
      table.boolean('is_default').defaultTo(false);
      table.string('applies_to').defaultTo('BOTH');
      table.text('layout_config_json').notNullable();
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.index(['company_id']);
    });
  }

  // 27. Audit Logs
  if (!(await db.schema.hasTable('audit_logs'))) {
    await db.schema.createTable('audit_logs', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable();
      table.string('entity_type').notNullable();
      table.string('entity_id').notNullable();
      table.string('action').notNullable();
      table.text('details').notNullable();
      table.string('timestamp').notNullable();

      table.index(['company_id', 'entity_type']);
      table.index(['timestamp']);
    });
  }

  // Schema enhancements: Ensure additional columns exist on company_settings and app_settings
  const compSettingsCols = [
    { name: 'invoice_save_path', type: 'text' },
    { name: 'quotation_save_path', type: 'text' },
    { name: 'purchase_save_path', type: 'text' },
    { name: 'report_save_path', type: 'text' },
    { name: 'backup_save_path', type: 'text' },
    { name: 'excel_export_save_path', type: 'text' },
    { name: 'default_invoice_notes', type: 'text' },
    { name: 'default_quotation_notes', type: 'text' },
    { name: 'quotation_validity_days', type: 'integer', defaultVal: 30 },
    { name: 'default_tax_inclusive', type: 'boolean', defaultVal: false },
    { name: 'auto_backup_enabled', type: 'boolean', defaultVal: true },
    { name: 'auto_backup_frequency', type: 'text', defaultVal: 'DAILY' },
    { name: 'auto_backup_interval_days', type: 'integer', defaultVal: 1 },
    { name: 'auto_backup_retention_days', type: 'integer', defaultVal: 30 },
    { name: 'auto_backup_max_count', type: 'integer', defaultVal: 30 },
    { name: 'last_auto_backup_at', type: 'text' },
  ];

  for (const col of compSettingsCols) {
    const exists = await db.schema.hasColumn('company_settings', col.name);
    if (!exists) {
      await db.schema.alterTable('company_settings', (table) => {
        if (col.type === 'text') table.text(col.name).nullable().defaultTo((col as any).defaultVal ?? null);
        else if (col.type === 'integer') table.integer(col.name).defaultTo((col as any).defaultVal ?? 30);
        else if (col.type === 'boolean') table.boolean(col.name).defaultTo((col as any).defaultVal ?? false);
      });
    }
  }

  const appSettingsCols = [
    { name: 'invoice_save_path', type: 'text' },
    { name: 'quotation_save_path', type: 'text' },
    { name: 'purchase_save_path', type: 'text' },
    { name: 'report_save_path', type: 'text' },
    { name: 'backup_save_path', type: 'text' },
    { name: 'excel_export_save_path', type: 'text' },
    { name: 'auto_backup_enabled', type: 'boolean', defaultVal: true },
    { name: 'auto_backup_frequency', type: 'text', defaultVal: 'DAILY' },
    { name: 'auto_backup_interval_days', type: 'integer', defaultVal: 1 },
    { name: 'auto_backup_retention_days', type: 'integer', defaultVal: 30 },
    { name: 'auto_backup_max_count', type: 'integer', defaultVal: 30 },
    { name: 'last_auto_backup_at', type: 'text' },
  ];
  for (const col of appSettingsCols) {
    const exists = await db.schema.hasColumn('app_settings', col.name);
    if (!exists) {
      await db.schema.alterTable('app_settings', (table) => {
        if (col.type === 'text') table.text(col.name).nullable().defaultTo((col as any).defaultVal ?? null);
        else if (col.type === 'integer') table.integer(col.name).defaultTo((col as any).defaultVal ?? 30);
        else if (col.type === 'boolean') table.boolean(col.name).defaultTo((col as any).defaultVal ?? false);
      });
    }
  }

  const companyExtraCols = [
    'tan',
    'cin',
    'iso',
    'msme',
    'financial_year',
  ];
  for (const col of companyExtraCols) {
    const exists = await db.schema.hasColumn('companies', col);
    if (!exists) {
      await db.schema.alterTable('companies', (table) => {
        table.string(col).nullable();
      });
    }
  }

  const branchExtraCols = [
    'tan',
    'cin',
    'iso',
    'msme',
    'financial_year',
  ];
  for (const col of branchExtraCols) {
    const exists = await db.schema.hasColumn('branches', col);
    if (!exists) {
      await db.schema.alterTable('branches', (table) => {
        table.string(col).nullable();
      });
    }
  }

  const branchCols = [
    { name: 'bank_name', type: 'string' },
    { name: 'bank_account_no', type: 'string' },
    { name: 'bank_ifsc', type: 'string' },
    { name: 'bank_branch', type: 'string' },
    { name: 'use_company_bank', type: 'boolean' },
  ];
  for (const col of branchCols) {
    const exists = await db.schema.hasColumn('branches', col.name);
    if (!exists) {
      await db.schema.alterTable('branches', (table) => {
        if (col.type === 'string') table.string(col.name).nullable();
        else if (col.type === 'boolean') table.boolean(col.name).defaultTo(true);
      });
    }
  }

  const customerCols = [
    { name: 'bank_name', type: 'string' },
    { name: 'bank_account_no', type: 'string' },
    { name: 'bank_ifsc', type: 'string' },
    { name: 'bank_branch', type: 'string' },
    { name: 'upi_id', type: 'string' },
    { name: 'registration_year', type: 'string' },
    { name: 'additional_bank_accounts', type: 'text' },
  ];
  for (const col of customerCols) {
    const exists = await db.schema.hasColumn('customers', col.name);
    if (!exists) {
      await db.schema.alterTable('customers', (table) => {
        if (col.type === 'text') table.text(col.name).nullable();
        else table.string(col.name).nullable();
      });
    }
  }

  const supplierCols = [
    { name: 'bank_name', type: 'string' },
    { name: 'bank_account_no', type: 'string' },
    { name: 'bank_ifsc', type: 'string' },
    { name: 'bank_branch', type: 'string' },
    { name: 'upi_id', type: 'string' },
    { name: 'additional_bank_accounts', type: 'text' },
  ];
  for (const col of supplierCols) {
    const exists = await db.schema.hasColumn('suppliers', col.name);
    if (!exists) {
      await db.schema.alterTable('suppliers', (table) => {
        if (col.type === 'text') table.text(col.name).nullable();
        else table.string(col.name).nullable();
      });
    }
  }

  const productHasCustomNotes = await db.schema.hasColumn('products', 'custom_notes');
  if (!productHasCustomNotes) {
    await db.schema.alterTable('products', (table) => {
      table.text('custom_notes').nullable();
    });
  }

  for (const col of ['min_selling_price', 'max_selling_price']) {
    const exists = await db.schema.hasColumn('products', col);
    if (!exists) {
      await db.schema.alterTable('products', (table) => {
        table.string(col).nullable();
      });
    }
  }

  for (const tbl of ['customer_payments', 'supplier_payments']) {
    const exists = await db.schema.hasColumn(tbl, 'bank_account');
    if (!exists) {
      await db.schema.alterTable(tbl, (table) => {
        table.string('bank_account').nullable();
      });
    }
  }

  const supplierPayHasVendorBank = await db.schema.hasColumn('supplier_payments', 'vendor_bank_account');
  if (!supplierPayHasVendorBank) {
    await db.schema.alterTable('supplier_payments', (table) => {
      table.string('vendor_bank_account').nullable();
    });
  }

  const purchaseDiscountCols = [
    { name: 'overall_discount_type', defaultVal: 'AMOUNT' },
    { name: 'overall_discount_percentage', defaultVal: '0.00' },
    { name: 'overall_discount_amount', defaultVal: '0.00' },
  ];
  for (const col of purchaseDiscountCols) {
    const exists = await db.schema.hasColumn('purchase_invoices', col.name);
    if (!exists) {
      await db.schema.alterTable('purchase_invoices', (table) => {
        table.string(col.name).defaultTo(col.defaultVal);
      });
    }
  }

  // Remove any legacy built-in/default templates that do not have an actual uploaded template file
  if (await db.schema.hasTable('letterhead_templates')) {
    await db('letterhead_templates')
      .whereNull('file_path')
      .orWhereRaw("TRIM(file_path) = ''")
      .del();

    const hasAppliesTo = await db.schema.hasColumn('letterhead_templates', 'applies_to');
    if (!hasAppliesTo) {
      await db.schema.alterTable('letterhead_templates', (table) => {
        table.string('applies_to').defaultTo('BOTH');
      });
    }
  }

  // Letterhead Template Overrides (allows company-level renaming and scope customization for built-in & custom templates)
  if (!(await db.schema.hasTable('letterhead_template_overrides'))) {
    await db.schema.createTable('letterhead_template_overrides', (table) => {
      table.string('company_id').notNullable();
      table.string('template_id').notNullable();
      table.string('name').nullable();
      table.string('applies_to').nullable();
      table.boolean('is_default').nullable();
      table.boolean('is_active').defaultTo(true);
      table.string('updated_at').notNullable();
      table.primary(['company_id', 'template_id']);
      table.index(['company_id']);
    });
  }

  const purchaseHasNotes = await db.schema.hasColumn('purchase_invoices', 'notes');
  if (!purchaseHasNotes) {
    await db.schema.alterTable('purchase_invoices', (table) => {
      table.text('notes').nullable();
    });
  }

  const appSettingsHasSoftwareIcon = await db.schema.hasColumn('app_settings', 'software_icon');
  if (!appSettingsHasSoftwareIcon) {
    await db.schema.alterTable('app_settings', (table) => {
      table.text('software_icon').nullable();
    });
  }

  // 28. Per-Workstation Menu Access Permissions (MD / Office Staff Control)
  if (!(await db.schema.hasTable('workstation_permissions'))) {
    await db.schema.createTable('workstation_permissions', (table) => {
      table.string('device_id').primary();
      table.string('device_name').notNullable();
      table.string('staff_name').nullable();
      table.string('role').defaultTo('STAFF'); // 'ADMIN' | 'STAFF'
      table.boolean('is_admin').defaultTo(false);
      table.text('allowed_menus_json').notNullable();
      table.boolean('can_open_settings').defaultTo(true);
      table.string('last_ip').nullable();
      table.string('last_seen_at').notNullable();
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();
    });
  } else {
    const hasStaffName = await db.schema.hasColumn('workstation_permissions', 'staff_name');
    if (!hasStaffName) {
      await db.schema.alterTable('workstation_permissions', (table) => {
        table.string('staff_name').nullable();
      });
    }
  }

  for (const col of ['admin_pin_hash', 'default_staff_menus_json', 'last_seen_utc', 'license_data_json']) {
    const exists = await db.schema.hasColumn('app_settings', col);
    if (!exists) {
      await db.schema.alterTable('app_settings', (table) => {
        table.text(col).nullable();
      });
    }
  }

  // Track which Office PC / Staff Workstation created each document (for MD Activity Reporting)
  for (const tbl of ['invoices', 'quotations', 'purchase_invoices', 'customer_payments', 'supplier_payments']) {
    for (const col of ['created_by_device_id', 'created_by_device_name']) {
      const exists = await db.schema.hasColumn(tbl, col);
      if (!exists) {
        await db.schema.alterTable(tbl, (table) => {
          table.string(col).nullable();
        });
      }
    }
  }

  // Ensure audit_logs table has staff, device, and metadata columns for the Activity Log
  if (await db.schema.hasTable('audit_logs')) {
    for (const col of ['staff_name', 'device_name', 'device_id', 'module', 'document_number', 'party_name', 'amount']) {
      const exists = await db.schema.hasColumn('audit_logs', col);
      if (!exists) {
        await db.schema.alterTable('audit_logs', (table) => {
          table.string(col).nullable();
        });
      }
    }
  }

  // Ensure legacy temporary host PC entries are cleaned up
  if (await db.schema.hasTable('workstation_permissions')) {
    await db('workstation_permissions').where({ device_id: 'local-host-pc' }).del().catch(() => {});
  }

  // 29. Quotation Numbering Sequences (for Varun Systems VS-QT-... sequences)
  if (!(await db.schema.hasTable('quotation_sequences'))) {
    await db.schema.createTable('quotation_sequences', (table) => {
      table.string('id').primary();
      table.string('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('prefix').defaultTo('VS-QT-');
      table.integer('current_number').defaultTo(0);
      table.string('financial_year').notNullable();
      table.integer('padding').defaultTo(3);
      table.string('created_at').notNullable();
      table.string('updated_at').notNullable();

      table.unique(['company_id', 'prefix', 'financial_year']);
      table.index(['company_id']);
    });
  }

  // Ensure all Varun Systems quotation columns exist on existing databases
  if (await db.schema.hasTable('quotations')) {
    const qCols: Array<{ name: string; type: 'string' | 'text' | 'boolean' | 'float'; defaultVal?: any }> = [
      { name: 'reverse_charge', type: 'boolean', defaultVal: false },
      { name: 'discount_total', type: 'string', defaultVal: '0.00' },
      { name: 'taxable_total', type: 'string', defaultVal: '0.00' },
      { name: 'cgst_total', type: 'string', defaultVal: '0.00' },
      { name: 'sgst_total', type: 'string', defaultVal: '0.00' },
      { name: 'igst_total', type: 'string', defaultVal: '0.00' },
      { name: 'utgst_total', type: 'string', defaultVal: '0.00' },
      { name: 'gst_total', type: 'string', defaultVal: '0.00' },
      { name: 'total_utgst', type: 'string', defaultVal: '0.00' },
      { name: 'total_cgst', type: 'string', defaultVal: '0.00' },
      { name: 'total_sgst', type: 'string', defaultVal: '0.00' },
      { name: 'total_igst', type: 'string', defaultVal: '0.00' },
      { name: 'total_tax', type: 'string', defaultVal: '0.00' },
      { name: 'total_taxable_value', type: 'string', defaultVal: '0.00' },
      { name: 'overall_discount_amount', type: 'string', defaultVal: '0.00' },
      { name: 'additional_charges', type: 'string', defaultVal: '0.00' },
      { name: 'round_off', type: 'string', defaultVal: '0.00' },
      { name: 'salutation', type: 'string', defaultVal: 'Dear Sir,' },
      { name: 'opening_text', type: 'text', defaultVal: 'With the reference to your enquiry, we are herewith quoting our lowest and best possible prices of the following.' },
      { name: 'closing_text', type: 'text', defaultVal: 'Thanking you and assuring of our best services and attention at all times.' },
      { name: 'sign_off_company', type: 'string', defaultVal: 'For VARUN SYSTEMS.' },
      { name: 'contact_person', type: 'string' },
      { name: 'contact_phone', type: 'string' },
      { name: 'contact_email', type: 'string' },
      { name: 'customer_state', type: 'string' },
      { name: 'customer_state_code', type: 'string' },
      { name: 'place_of_supply', type: 'string' },
      { name: 'place_of_supply_state', type: 'string' },
      { name: 'place_of_supply_code', type: 'string' },
      { name: 'shipping_address', type: 'text' },
      { name: 'terms_conditions', type: 'text' },
      { name: 'terms_and_conditions', type: 'text' },
      { name: 'top_margin_mm', type: 'float', defaultVal: 55.0 },
      { name: 'bottom_margin_mm', type: 'float', defaultVal: 32.0 },
      { name: 'left_margin_mm', type: 'float', defaultVal: 15.0 },
      { name: 'right_margin_mm', type: 'float', defaultVal: 15.0 },
      { name: 'print_letterhead_overlay', type: 'boolean', defaultVal: false },
      { name: 'is_gst', type: 'boolean', defaultVal: true },
      { name: 'letterhead_template_id', type: 'string' },
    ];

    for (const c of qCols) {
      const exists = await db.schema.hasColumn('quotations', c.name);
      if (!exists) {
        await db.schema.alterTable('quotations', (table) => {
          if (c.type === 'boolean') {
            table.boolean(c.name).defaultTo(c.defaultVal ?? false);
          } else if (c.type === 'text') {
            table.text(c.name).nullable();
          } else if (c.type === 'float') {
            table.float(c.name).defaultTo(c.defaultVal ?? 0);
          } else {
            table.string(c.name).defaultTo(c.defaultVal ?? '');
          }
        });
      }
    }
  }

  if (await db.schema.hasTable('quotation_items')) {
    const qiCols: Array<{ name: string; defaultVal?: string }> = [
      { name: 'units', defaultVal: '01' },
      { name: 'base_rate', defaultVal: '0.00' },
      { name: 'taxable_amount', defaultVal: '0.00' },
      { name: 'utgst_rate', defaultVal: '0.00' },
      { name: 'utgst_amount', defaultVal: '0.00' },
      { name: 'gst_amount', defaultVal: '0.00' },
      { name: 'total_amount', defaultVal: '0.00' },
      { name: 'hsn_sac', defaultVal: '' },
    ];

    for (const c of qiCols) {
      const exists = await db.schema.hasColumn('quotation_items', c.name);
      if (!exists) {
        await db.schema.alterTable('quotation_items', (table) => {
          table.string(c.name).defaultTo(c.defaultVal ?? '');
        });
      }
    }
  }

  // Ensure Varun Systems invoice columns exist on existing databases
  if (await db.schema.hasTable('invoices')) {
    const invCols: Array<{ name: string; type?: string; defaultVal?: any }> = [
      { name: 'purchase_order_date', type: 'string' },
      { name: 'po_date', type: 'string' },
      { name: 'delivery_challan_number', type: 'string' },
      { name: 'delivery_challan_date', type: 'string' },
      { name: 'dc_number', type: 'string' },
      { name: 'dc_date', type: 'string' },
      { name: 'agent_name', type: 'string' },
      { name: 'top_margin_mm', type: 'float', defaultVal: 55.0 },
      { name: 'bottom_margin_mm', type: 'float', defaultVal: 32.0 },
      { name: 'left_margin_mm', type: 'float', defaultVal: 15.0 },
      { name: 'right_margin_mm', type: 'float', defaultVal: 15.0 },
      { name: 'print_letterhead_overlay', type: 'boolean', defaultVal: false },
      { name: 'sign_off_company', type: 'string', defaultVal: 'For VARUN SYSTEMS.' },
    ];

    for (const c of invCols) {
      const exists = await db.schema.hasColumn('invoices', c.name);
      if (!exists) {
        await db.schema.alterTable('invoices', (table) => {
          if (c.type === 'boolean') {
            table.boolean(c.name).defaultTo(c.defaultVal ?? false);
          } else if (c.type === 'float') {
            table.float(c.name).defaultTo(c.defaultVal ?? 0);
          } else {
            table.string(c.name).defaultTo(c.defaultVal ?? '');
          }
        });
      }
    }
  }
}
