// src/server/services/invoiceService.ts - Complete Indian GST Invoice Lifecycle & Financial Engine
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import {
  Invoice,
  InvoiceItem,
  DocumentType,
  InvoiceStatus,
} from '../../shared/types';
import { calculateLineItem, calculateDocumentTotals } from '../finance/decimalCalc';
import { convertAmountToWords } from '../finance/numberToWords';
import { NumberingService } from './numberingService';

export class InvoiceService {
  constructor(private db: Knex) {}

  async getInvoices(
    companyId: string,
    filters?: {
      documentType?: DocumentType;
      status?: InvoiceStatus;
      customerId?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    }
  ): Promise<Invoice[]> {
    let query = this.db('invoices').where({ company_id: companyId });

    if (filters?.documentType) {
      query = query.andWhere('document_type', filters.documentType);
    }
    if (filters?.status) {
      query = query.andWhere('status', filters.status);
    }
    if (filters?.customerId) {
      query = query.andWhere('customer_id', filters.customerId);
    }
    if (filters?.startDate) {
      query = query.andWhere('invoice_date', '>=', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.andWhere('invoice_date', '<=', filters.endDate);
    }
    if (filters?.search) {
      const s = `%${filters.search.toLowerCase()}%`;
      query = query.andWhere((qb) => {
        qb.whereRaw('LOWER(invoice_number) LIKE ?', [s])
          .orWhereRaw('LOWER(customer_name) LIKE ?', [s])
          .orWhereRaw('LOWER(reference_number) LIKE ?', [s]);
      });
    }

    const invoices = await query.orderBy('created_at', 'desc');

    // Attach items
    for (const inv of invoices) {
      inv.items = await this.db('invoice_items').where({ invoice_id: inv.id }).orderBy('sort_order', 'asc');
    }

    return invoices;
  }

  async getInvoiceById(companyId: string, invoiceId: string, trx?: Knex.Transaction | Knex): Promise<Invoice | null> {
    const qb = trx || this.db;
    const inv = await qb('invoices').where({ company_id: companyId, id: invoiceId }).first();
    if (!inv) return null;

    inv.items = await qb('invoice_items').where({ invoice_id: inv.id }).orderBy('sort_order', 'asc');
    return inv;
  }

  /**
   * Creates an invoice in DRAFT mode with automatic calculation of line items and totals
   */
  async createInvoice(companyId: string, input: any): Promise<Invoice> {
    return this.db.transaction(async (trx) => {
      const now = new Date().toISOString();
      const invoiceId = uuidv4();

      // Fetch Branch to check supplier state code
      let branch = null;
      if (input.branch_id) {
        branch = await trx('branches').where({ id: input.branch_id, company_id: companyId }).first();
      }
      if (!branch) {
        branch = await trx('branches').where({ company_id: companyId, is_default: true }).first()
          || await trx('branches').where({ company_id: companyId }).first();
      }
      if (!branch) {
        const newBranchId = uuidv4();
        const comp = await trx('companies').where({ id: companyId }).first();
        await trx('branches').insert({
          id: newBranchId,
          company_id: companyId,
          name: 'Head Office',
          code: 'HO',
          address: comp?.registered_address || '',
          phone: comp?.phone || '',
          email: comp?.email || '',
          state: comp?.state || 'Madhya Pradesh',
          state_code: comp?.state_code || '23',
          is_default: true,
          is_archived: false,
          created_at: now,
          updated_at: now,
        });
        branch = await trx('branches').where({ id: newBranchId }).first();
      }

      const supplierStateCode = branch?.state_code || '23';
      const posCode = input.place_of_supply_code || supplierStateCode;
      const isInterState = supplierStateCode !== posCode;

      // Calculate Line Items
      const calculatedItems: InvoiceItem[] = [];
      const lineInputs = input.items || [];

      for (let i = 0; i < lineInputs.length; i++) {
        const item = lineInputs[i];
        const rawQty = new Decimal(item.quantity ?? 0);
        const rawRate = new Decimal(item.rate ?? item.unit_price ?? 0);
        const rawGst = new Decimal(item.gst_rate !== undefined ? item.gst_rate : 18);
        if (!rawQty.isFinite() || rawQty.lte(0)) {
          throw new Error(`Invalid quantity for item "${item.item_name || i + 1}": must be greater than zero.`);
        }
        if (!rawRate.isFinite() || rawRate.lt(0)) {
          throw new Error(`Invalid rate for item "${item.item_name || i + 1}": cannot be negative.`);
        }
        if (!rawGst.isFinite() || rawGst.lt(0) || rawGst.gt(100)) {
          throw new Error(`Invalid GST rate for item "${item.item_name || i + 1}": must be between 0% and 100%.`);
        }

        const lineCalc = calculateLineItem({
          quantity: rawQty.toString(),
          rate: rawRate.toString(),
          discountPercentage: item.discount_percentage,
          discountAmount: item.discount_amount,
          gstRate: rawGst.toString(),
          isTaxInclusive: Boolean(item.is_tax_inclusive),
          isInterState,
        });

        const itemId = item.item_id || item.product_id || undefined;
        let itemName = item.item_name || item.name || item.description || 'Line Item';
        let hsnCode = item.hsn_or_sac || item.hsn || '';
        let itemType = item.item_type || 'PRODUCT';
        let itemUnit = item.unit || 'NOS';

        if (itemId) {
          const prod = await trx('products').where({ id: itemId, company_id: companyId }).first();
          if (prod) {
            itemName = item.item_name || item.name || prod.name || itemName;
            hsnCode = hsnCode || prod.hsn_or_sac || '';
            itemType = prod.item_type || itemType;
            if (!item.unit && prod.unit) {
              itemUnit = prod.unit;
            }
          }
        }

        calculatedItems.push({
          id: uuidv4(),
          invoice_id: invoiceId,
          item_id: itemId,
          item_type: itemType,
          item_name: itemName,
          description: item.description || undefined,
          hsn_or_sac: hsnCode,
          quantity: lineCalc.quantity,
          unit: itemUnit,
          rate: lineCalc.rate,
          discount_percentage: item.discount_percentage ? new Decimal(item.discount_percentage).toFixed(2) : '0.00',
          discount_amount: lineCalc.discountAmount,
          is_tax_inclusive: Boolean(item.is_tax_inclusive),
          taxable_value: lineCalc.taxableValue,
          gst_rate: lineCalc.gstRate,
          cgst_rate: lineCalc.cgstRate,
          cgst_amount: lineCalc.cgstAmount,
          sgst_rate: lineCalc.sgstRate,
          sgst_amount: lineCalc.sgstAmount,
          igst_rate: lineCalc.igstRate,
          igst_amount: lineCalc.igstAmount,
          total_tax: lineCalc.totalTax,
          line_total: lineCalc.lineTotal,
          sort_order: i,
        });
      }

      // Calculate Document Totals
      const docTotals = calculateDocumentTotals({
        items: calculatedItems as any,
        overallDiscountPercentage: input.overallDiscountPercentage,
        overallDiscountAmount: input.overallDiscountAmount,
        additionalCharges: input.additional_charges,
        customRoundOff: input.round_off,
      });

      // Amount in words
      const amountInWords = convertAmountToWords(docTotals.grandTotal);

      // Temporary draft number or preview
      const invoiceNumber = input.invoice_number || `DRAFT-${Date.now()}`;

      let customerName = input.customer_name;
      let customerGstin = input.customer_gstin;
      let customerPan = input.customer_pan;
      let billingAddress = input.billing_address;
      let shippingAddress = input.shipping_address;
      let posState = input.place_of_supply_state;
      let posCodeToUse = posCode;

      if (input.customer_id) {
        const custRec = await trx('customers').where({ id: input.customer_id, company_id: companyId }).first();
        if (custRec) {
          customerName = customerName || custRec.name;
          customerGstin = customerGstin || custRec.gstin;
          customerPan = customerPan || custRec.pan;
          billingAddress = billingAddress || custRec.billing_address || custRec.address || '';
          shippingAddress = shippingAddress || custRec.shipping_address || billingAddress || '';
          posState = posState || custRec.state;
          if (!input.place_of_supply_code && custRec.state_code) {
            posCodeToUse = custRec.state_code;
          }
        }
      }

      if (!customerName) {
        customerName = 'Walk-in Customer';
      }

      const newInvoice: Invoice = {
        id: invoiceId,
        company_id: companyId,
        branch_id: branch?.id || input.branch_id,
        document_type: input.document_type || 'TAX_INVOICE',
        invoice_number: invoiceNumber,
        invoice_date: input.invoice_date || now.split('T')[0],
        due_date: input.due_date || input.invoice_date || now.split('T')[0],
        customer_id: input.customer_id,
        customer_name: customerName,
        customer_gstin: customerGstin || undefined,
        customer_pan: customerPan || undefined,
        billing_address: billingAddress || '',
        shipping_address: shippingAddress || billingAddress || '',
        place_of_supply_state: posState || branch?.state || 'Madhya Pradesh',
        place_of_supply_code: posCodeToUse,
        is_inter_state: isInterState,
        is_reverse_charge: Boolean(input.is_reverse_charge),
        reference_number: input.reference_number || undefined,
        purchase_order_number: input.purchase_order_number || undefined,
        payment_terms: input.payment_terms || undefined,
        items: calculatedItems,
        subtotal: docTotals.subtotal,
        overall_discount_percentage: new Decimal(input.overallDiscountPercentage || 0).toFixed(2),
        overall_discount_amount: docTotals.overallDiscountAmount,
        total_taxable_value: docTotals.totalTaxableValue,
        total_cgst: docTotals.totalCgst,
        total_sgst: docTotals.totalSgst,
        total_igst: docTotals.totalIgst,
        total_tax: docTotals.totalTax,
        additional_charges: docTotals.additionalCharges,
        round_off: docTotals.roundOff,
        grand_total: docTotals.grandTotal,
        amount_in_words: amountInWords,
        paid_amount: '0.00',
        balance_amount: docTotals.grandTotal,
        status: 'DRAFT',
        letterhead_template_id: input.letterhead_template_id || undefined,
        notes: input.notes || undefined,
        terms_conditions: input.terms_conditions || undefined,
        created_at: now,
        updated_at: now,
      };

      const { items, ...invoiceRow } = newInvoice;
      await trx('invoices').insert({
        ...invoiceRow,
        created_by_device_id: input.created_by_device_id || null,
        created_by_device_name: input.created_by_device_name || null,
      });

      for (const item of calculatedItems) {
        await trx('invoice_items').insert(item);
      }

      if (input.mark_as_paid) {
        await this.finalizeInvoiceInTrx(trx, companyId, invoiceId);
        return await this.markPaidInTrx(trx, companyId, invoiceId, {
          amount: input.payment_amount,
          paymentMethod: input.payment_method,
          paymentDate: input.payment_date || input.invoice_date,
          referenceNumber: input.payment_reference,
          notes: input.payment_notes,
        });
      }

      if (input.finalize_on_create) {
        return await this.finalizeInvoiceInTrx(trx, companyId, invoiceId);
      }

      return newInvoice;
    });
  }

  /**
   * Internal transactional finalization helper (reused to prevent nested SQLite transactions)
   */
  private async finalizeInvoiceInTrx(trx: Knex.Transaction, companyId: string, invoiceId: string): Promise<Invoice> {
    const inv = await trx('invoices').where({ company_id: companyId, id: invoiceId }).first();
    if (!inv) {
      throw new Error('Invoice not found');
    }
    if (inv.status === 'FINALIZED') {
      throw new Error('Invoice is already finalized and locked.');
    }
    if (inv.status === 'CANCELLED') {
      throw new Error('Cannot finalize a cancelled invoice.');
    }

    const now = new Date().toISOString();

    // Generate sequential number atomically
    const { number: finalDocNumber } = await NumberingService.getNextNumber(
      trx,
      companyId,
      inv.document_type,
      inv.branch_id,
      inv.invoice_date
    );

    // Update invoice record
    await trx('invoices').where({ id: invoiceId }).update({
      invoice_number: finalDocNumber,
      status: 'FINALIZED',
      finalized_at: now,
      updated_at: now,
    });

    // Update Customer Current Balance using Decimal precision
    const grandTotalDec = new Decimal(inv.grand_total);
    const customer = await trx('customers').where({ id: inv.customer_id, company_id: companyId }).first();
    if (customer) {
      const currentBal = new Decimal(customer.current_balance || 0);
      const updatedBal =
        inv.document_type === 'CREDIT_NOTE'
          ? currentBal.sub(grandTotalDec)
          : currentBal.add(grandTotalDec);

      await trx('customers')
        .where({ id: inv.customer_id, company_id: companyId })
        .update({
          current_balance: updatedBal.toFixed(2),
          updated_at: now,
        });
    }

    // Check if document type affects physical inventory
    const stockMovementTypes: DocumentType[] = [
      'TAX_INVOICE',
      'STANDARD_INVOICE',
      'COMMERCIAL_INVOICE',
      'EXPORT_INVOICE',
      'DELIVERY_CHALLAN',
    ];

    if (stockMovementTypes.includes(inv.document_type)) {
      const items = await trx('invoice_items').where({ invoice_id: invoiceId });
      const trackedProductItems = items.filter((item: any) => item.item_type === 'PRODUCT' && item.item_id);

      if (trackedProductItems.length > 0) {
        // Fetch warehouse or ensure a fallback warehouse exists for FK safety
        let warehouse =
          (await trx('warehouses').where({ company_id: companyId, branch_id: inv.branch_id, is_active: true }).first()) ||
          (await trx('warehouses').where({ company_id: companyId, is_default: true, is_active: true }).first()) ||
          (await trx('warehouses').where({ company_id: companyId, is_active: true }).first());

        if (!warehouse) {
          const fallbackWhId = uuidv4();
          await trx('warehouses').insert({
            id: fallbackWhId,
            company_id: companyId,
            branch_id: inv.branch_id,
            name: 'Main Warehouse',
            code: 'MW01',
            address: '',
            is_default: true,
            is_active: true,
            created_at: now,
            updated_at: now,
          });
          warehouse = await trx('warehouses').where({ id: fallbackWhId }).first();
        }

        const warehouseId = warehouse.id;
        const compSettings = await trx('company_settings').where({ company_id: companyId }).first();
        const allowNegativeStock = Boolean(compSettings?.allow_negative_stock);

        for (const item of trackedProductItems) {
          const qtyOut = new Decimal(item.quantity);

          // Decrement product current_stock (enforcing allow_negative_stock policy)
          const prod = await trx('products').where({ id: item.item_id, company_id: companyId }).first();
          if (prod) {
            const currentProdStock = new Decimal(prod.current_stock || 0);
            const newProdStock = currentProdStock.sub(qtyOut);
            if (!allowNegativeStock && newProdStock.lt(0)) {
              throw new Error(
                `Insufficient stock for "${prod.name}" (available: ${currentProdStock.toFixed(2)}, requested: ${qtyOut.toFixed(2)}). Enable "Allow Negative Stock" in Settings to override.`
              );
            }
            await trx('products')
              .where({ id: item.item_id, company_id: companyId })
              .update({
                current_stock: newProdStock.toFixed(2),
                updated_at: now,
              });
          }

          // Record outward stock movement
          await trx('inventory_transactions').insert({
            id: uuidv4(),
            company_id: companyId,
            branch_id: inv.branch_id,
            warehouse_id: warehouseId,
            product_id: item.item_id,
            movement_type: 'SALES_DISPATCH',
            quantity: qtyOut.negated().toFixed(2),
            unit_cost: item.rate,
            total_cost: qtyOut.mul(new Decimal(item.rate)).toFixed(2),
            reference_document_type: inv.document_type,
            reference_document_id: invoiceId,
            reference_document_number: finalDocNumber,
            notes: `Dispatched against ${finalDocNumber}`,
            transaction_date: inv.invoice_date,
            created_at: now,
          });

          // Update stock_balances
          const existingBalance = await trx('stock_balances')
            .where({ company_id: companyId, warehouse_id: warehouseId, product_id: item.item_id })
            .first();

          if (existingBalance) {
            const newQty = new Decimal(existingBalance.quantity_on_hand || 0).sub(qtyOut);
            const avgCost = new Decimal(existingBalance.average_unit_cost || 0);
            await trx('stock_balances')
              .where({ id: existingBalance.id })
              .update({
                quantity_on_hand: newQty.toFixed(2),
                total_stock_value: newQty.mul(avgCost).toFixed(2),
                last_updated_at: now,
              });
          }
        }
      }
    }

    // Audit log entry
    await trx('audit_logs').insert({
      id: uuidv4(),
      company_id: companyId,
      entity_type: 'INVOICE',
      entity_id: invoiceId,
      action: 'FINALIZE',
      details: `Finalized document ${finalDocNumber} for customer ${inv.customer_name} (Total: ₹ ${inv.grand_total})`,
      timestamp: now,
    });

    return (await this.getInvoiceById(companyId, invoiceId, trx))!;
  }

  /**
   * Finalizes an existing draft invoice atomically
   */
  async finalizeInvoice(companyId: string, invoiceId: string): Promise<Invoice> {
    return this.db.transaction(async (trx) => {
      return this.finalizeInvoiceInTrx(trx, companyId, invoiceId);
    });
  }

  /**
   * Internal transactional mark-as-paid helper
   */
  private async markPaidInTrx(
    trx: Knex.Transaction,
    companyId: string,
    invoiceId: string,
    options?: {
      amount?: string | number;
      paymentMethod?: string;
      paymentDate?: string;
      referenceNumber?: string;
      notes?: string;
      closeRemainingBalance?: boolean;
    }
  ): Promise<Invoice> {
    let inv = await trx('invoices').where({ company_id: companyId, id: invoiceId }).first();
    if (!inv) {
      throw new Error('Invoice not found');
    }
    if (inv.status === 'CANCELLED') {
      throw new Error('Cannot mark a cancelled invoice as paid.');
    }

    if (inv.status !== 'FINALIZED') {
      await this.finalizeInvoiceInTrx(trx, companyId, invoiceId);
      inv = await trx('invoices').where({ company_id: companyId, id: invoiceId }).first();
    }

    const now = new Date().toISOString();
    const outstanding = new Decimal(inv.balance_amount || 0);

    if (outstanding.lte(0)) {
      return (await this.getInvoiceById(companyId, invoiceId, trx))!;
    }

    // Determine payment amount (full balance or partial pay)
    let payAmt = outstanding;
    if (options?.amount !== undefined && options?.amount !== null && options?.amount !== '') {
      const parsedAmt = new Decimal(options.amount);
      if (parsedAmt.gt(0)) {
        if (parsedAmt.gt(outstanding)) {
          throw new Error(`Payment amount (₹ ${parsedAmt.toFixed(2)}) cannot exceed remaining balance (₹ ${outstanding.toFixed(2)}).`);
        }
        payAmt = parsedAmt;
      }
    }

    const isPartial = payAmt.lt(outstanding);
    const paymentDate = options?.paymentDate || inv.invoice_date || now.split('T')[0];
    const paymentMethod = options?.paymentMethod || 'BANK_TRANSFER';
    const paymentId = uuidv4();

    const { number: payNum } = await NumberingService.getNextNumber(
      trx,
      companyId,
      'CUSTOMER_PAYMENT',
      inv.branch_id,
      paymentDate
    );

    await trx('customer_payments').insert({
      id: paymentId,
      company_id: companyId,
      branch_id: inv.branch_id || 'DEFAULT_BRANCH',
      payment_number: payNum,
      payment_date: paymentDate,
      customer_id: inv.customer_id,
      customer_name: inv.customer_name,
      amount: payAmt.toFixed(2),
      payment_method: paymentMethod,
      reference_number: options?.referenceNumber || inv.invoice_number,
      notes: options?.notes || `${isPartial ? 'Partial' : 'Full'} payment marked for invoice ${inv.invoice_number}`,
      unallocated_amount: '0.00',
      created_at: now,
    });

    await trx('payment_allocations').insert({
      id: uuidv4(),
      payment_id: paymentId,
      document_type: 'INVOICE',
      document_id: inv.id,
      document_number: inv.invoice_number,
      allocated_amount: payAmt.toFixed(2),
      allocated_at: now,
    });

    const shouldClose = Boolean(options?.closeRemainingBalance);
    const newPaid = new Decimal(inv.paid_amount || 0).add(payAmt);
    const newBalance = shouldClose ? new Decimal(0) : outstanding.sub(payAmt);
    const waivedBal = shouldClose ? outstanding.sub(payAmt) : new Decimal(0);

    let updatedNotes = inv.notes;
    if (shouldClose && waivedBal.gt(0)) {
      const annot = `[Closed with ₹ ${payAmt.toFixed(2)} payment - Remaining ₹ ${waivedBal.toFixed(2)} waived into PAID]`;
      updatedNotes = inv.notes ? `${inv.notes}\n${annot}` : annot;
    }

    await trx('invoices').where({ id: inv.id }).update({
      paid_amount: newPaid.toFixed(2),
      balance_amount: newBalance.toFixed(2),
      notes: updatedNotes,
      updated_at: now,
    });

    const customer = await trx('customers').where({ id: inv.customer_id, company_id: companyId }).first();
    if (customer) {
      const totalReduction = shouldClose ? outstanding : payAmt;
      const updatedBal = new Decimal(customer.current_balance || 0).sub(totalReduction);
      await trx('customers')
        .where({ id: inv.customer_id, company_id: companyId })
        .update({
          current_balance: updatedBal.toFixed(2),
          updated_at: now,
        });
    }

    await trx('audit_logs').insert({
      id: uuidv4(),
      company_id: companyId,
      entity_type: 'INVOICE',
      entity_id: invoiceId,
      action: shouldClose ? 'CLOSE_AND_MARK_PAID' : isPartial ? 'PARTIAL_PAYMENT' : 'MARK_PAID',
      details: `${
        shouldClose
          ? `Recorded ₹ ${payAmt.toFixed(2)} and CLOSED invoice at paid amount (₹ ${waivedBal.toFixed(2)} waived into PAID)`
          : isPartial
          ? 'Partial payment'
          : 'Marked PAID'
      } for ${inv.invoice_number} (₹ ${payAmt.toFixed(2)} via ${paymentMethod}, Voucher ${payNum})`,
      timestamp: now,
    });

    return (await this.getInvoiceById(companyId, invoiceId, trx))!;
  }

  /**
   * Marks an existing invoice as fully Paid or partially Paid (finalizing first if still Draft), recording payment voucher & allocation.
   */
  async markInvoiceAsPaid(
    companyId: string,
    invoiceId: string,
    options?: {
      amount?: string | number;
      paymentMethod?: string;
      paymentDate?: string;
      referenceNumber?: string;
      notes?: string;
      closeRemainingBalance?: boolean;
    }
  ): Promise<Invoice> {
    return this.db.transaction(async (trx) => {
      return this.markPaidInTrx(trx, companyId, invoiceId, options);
    });
  }

  /**
   * Closes and settles an invoice at the amount already paid (waiving the remaining balance),
   * sets balance_amount to 0.00, clears customer outstanding liability, and transports it to PAID.
   */
  async closeInvoice(
    companyId: string,
    invoiceId: string,
    options?: { reason?: string; notes?: string }
  ): Promise<Invoice> {
    return this.db.transaction(async (trx) => {
      const inv = await trx('invoices').where({ company_id: companyId, id: invoiceId }).first();
      if (!inv) throw new Error('Invoice not found');
      if (inv.status === 'CANCELLED') throw new Error('Cannot close a cancelled invoice.');

      const now = new Date().toISOString();
      const remainingBalance = new Decimal(inv.balance_amount || 0);

      if (remainingBalance.lte(0)) {
        return (await this.getInvoiceById(companyId, invoiceId, trx))!;
      }

      const settlementReason =
        options?.reason?.trim() || options?.notes?.trim() || 'Settled and closed invoice at collected amount; remaining balance waived.';
      const annot = `[Closed at collected amount ₹ ${inv.paid_amount} - Remaining ₹ ${remainingBalance.toFixed(2)} waived into PAID: ${settlementReason}]`;
      const updatedNotes = inv.notes ? `${inv.notes}\n${annot}` : annot;

      await trx('invoices').where({ id: inv.id }).update({
        balance_amount: '0.00',
        notes: updatedNotes,
        updated_at: now,
      });

      const customer = await trx('customers').where({ id: inv.customer_id, company_id: companyId }).first();
      if (customer) {
        const updatedBal = new Decimal(customer.current_balance || 0).sub(remainingBalance);
        await trx('customers')
          .where({ id: inv.customer_id, company_id: companyId })
          .update({
            current_balance: updatedBal.toFixed(2),
            updated_at: now,
          });
      }

      await trx('audit_logs').insert({
        id: uuidv4(),
        company_id: companyId,
        entity_type: 'INVOICE',
        entity_id: invoiceId,
        action: 'CLOSE_INVOICE',
        details: `Closed and settled invoice ${inv.invoice_number} at paid amount of ₹ ${inv.paid_amount}. Remaining balance of ₹ ${remainingBalance.toFixed(2)} waived into PAID (Reason: ${settlementReason})`,
        timestamp: now,
      });

      return (await this.getInvoiceById(companyId, invoiceId, trx))!;
    });
  }

  /**
   * Cancels a finalized document with mandatory reason, reversing balances and inventory.
   */
  async cancelInvoice(companyId: string, invoiceId: string, reason: string): Promise<Invoice> {
    if (!reason || !reason.trim()) {
      throw new Error('Cancellation requires a mandatory reason.');
    }

    return this.db.transaction(async (trx) => {
      const inv = await trx('invoices').where({ company_id: companyId, id: invoiceId }).first();
      if (!inv) throw new Error('Invoice not found');
      if (inv.status === 'CANCELLED') throw new Error('Invoice is already cancelled.');

      const now = new Date().toISOString();
      const wasFinalized = inv.status === 'FINALIZED';

      // Mark cancelled
      await trx('invoices').where({ id: invoiceId }).update({
        status: 'CANCELLED',
        cancelled_at: now,
        cancellation_reason: reason.trim(),
        updated_at: now,
      });

      if (wasFinalized) {
        // Reverse customer balance with Decimal precision
        const grandTotalDec = new Decimal(inv.grand_total);
        const custRec = await trx('customers').where({ id: inv.customer_id, company_id: companyId }).first();
        if (custRec) {
          const prevBal = new Decimal(custRec.current_balance || 0);
          const nextBal = inv.document_type === 'CREDIT_NOTE' ? prevBal.add(grandTotalDec) : prevBal.sub(grandTotalDec);
          await trx('customers')
            .where({ id: inv.customer_id, company_id: companyId })
            .update({
              current_balance: nextBal.toFixed(2),
              updated_at: now,
            });
        }

        // Reverse stock if previously dispatched
        const stockMovements = await trx('inventory_transactions').where({
          reference_document_id: invoiceId,
          company_id: companyId,
        });

        for (const mov of stockMovements) {
          const qty = new Decimal(mov.quantity).abs(); // inward reversal

          await trx('inventory_transactions').insert({
            id: uuidv4(),
            company_id: companyId,
            branch_id: mov.branch_id,
            warehouse_id: mov.warehouse_id,
            product_id: mov.product_id,
            movement_type: 'SALES_RETURN',
            quantity: qty.toFixed(2),
            unit_cost: mov.unit_cost,
            total_cost: mov.total_cost,
            reference_document_type: 'CANCELLATION',
            reference_document_id: invoiceId,
            reference_document_number: inv.invoice_number,
            notes: `Stock reversal for cancelled ${inv.invoice_number}. Reason: ${reason}`,
            transaction_date: now.split('T')[0],
            created_at: now,
          });

          const prodRec = await trx('products').where({ id: mov.product_id, company_id: companyId }).first();
          if (prodRec) {
            const restoredStock = new Decimal(prodRec.current_stock || 0).add(qty);
            await trx('products')
              .where({ id: mov.product_id, company_id: companyId })
              .update({
                current_stock: restoredStock.toFixed(2),
                updated_at: now,
              });
          }

          // Restore warehouse stock_balances so warehouse ledger stays synchronized with products.current_stock
          const existingBal = await trx('stock_balances')
            .where({ company_id: companyId, warehouse_id: mov.warehouse_id, product_id: mov.product_id })
            .first();
          if (existingBal) {
            const newWhQty = new Decimal(existingBal.quantity_on_hand || 0).add(qty);
            const avgCost = new Decimal(existingBal.average_unit_cost || mov.unit_cost || 0);
            await trx('stock_balances')
              .where({ id: existingBal.id })
              .update({
                quantity_on_hand: newWhQty.toFixed(2),
                total_stock_value: newWhQty.mul(avgCost).toFixed(2),
                last_updated_at: now,
              });
          }
        }
      }

      await trx('audit_logs').insert({
        id: uuidv4(),
        company_id: companyId,
        entity_type: 'INVOICE',
        entity_id: invoiceId,
        action: 'CANCEL',
        details: `Cancelled document ${inv.invoice_number}. Reason: ${reason}`,
        timestamp: now,
      });

      return (await this.getInvoiceById(companyId, invoiceId, trx))!;
    });
  }

  /**
   * Deletes a draft or cancelled invoice permanently. Finalized invoices must be cancelled first.
   */
  async deleteInvoice(companyId: string, invoiceId: string): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const inv = await trx('invoices').where({ company_id: companyId, id: invoiceId }).first();
      if (!inv) throw new Error('Invoice not found');
      if (inv.status === 'FINALIZED') {
        throw new Error('Finalized invoices cannot be deleted. Please cancel the invoice first to audit the cancellation.');
      }

      await trx('invoice_items').where({ invoice_id: invoiceId }).del();
      await trx('payment_allocations').where({ document_type: 'INVOICE', document_id: invoiceId }).del();
      await trx('invoices').where({ id: invoiceId }).del();

      const now = new Date().toISOString();
      await trx('audit_logs').insert({
        id: uuidv4(),
        company_id: companyId,
        entity_type: 'INVOICE',
        entity_id: invoiceId,
        action: 'DELETE',
        details: `Deleted ${inv.status.toLowerCase()} invoice ${inv.invoice_number}`,
        timestamp: now,
      });

      return true;
    });
  }
}
