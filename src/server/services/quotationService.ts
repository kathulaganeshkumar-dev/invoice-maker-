// src/server/services/quotationService.ts - Quotation Lifecycle and 1-Click Conversion Engine
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import { Quotation, QuotationItem, QuotationStatus, Invoice } from '../../shared/types';
import { calculateLineItem, calculateDocumentTotals } from '../finance/decimalCalc';
import { convertAmountToWords } from '../finance/numberToWords';
import { NumberingService } from './numberingService';
import { InvoiceService } from './invoiceService';

export class QuotationService {
  constructor(private db: Knex, private invoiceService: InvoiceService) {}

  async getQuotations(
    companyId: string,
    filters?: { status?: QuotationStatus; customerId?: string; search?: string }
  ): Promise<Quotation[]> {
    let query = this.db('quotations').where({ company_id: companyId });

    if (filters?.status) {
      query = query.andWhere('status', filters.status);
    }
    if (filters?.customerId) {
      query = query.andWhere('customer_id', filters.customerId);
    }
    if (filters?.search) {
      const s = `%${filters.search.toLowerCase()}%`;
      query = query.andWhere((qb) => {
        qb.whereRaw('LOWER(quotation_number) LIKE ?', [s])
          .orWhereRaw('LOWER(customer_name) LIKE ?', [s]);
      });
    }

    const quotes = await query.orderBy('created_at', 'desc');
    for (const q of quotes) {
      q.items = await this.db('quotation_items').where({ quotation_id: q.id }).orderBy('sort_order', 'asc');
    }
    return quotes;
  }

  async getQuotationById(companyId: string, quotationId: string, trx?: Knex.Transaction | Knex): Promise<Quotation | null> {
    const qb = trx || this.db;
    const q = await qb('quotations').where({ company_id: companyId, id: quotationId }).first();
    if (!q) return null;

    q.items = await qb('quotation_items').where({ quotation_id: q.id }).orderBy('sort_order', 'asc');
    return q;
  }

  async createQuotation(companyId: string, input: any): Promise<Quotation> {
    return this.db.transaction(async (trx) => {
      const now = new Date().toISOString();
      const quotationId = uuidv4();

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
        await trx('branches').insert({
          id: newBranchId,
          company_id: companyId,
          name: 'Main Branch',
          branch_code: 'HO',
          is_default: true,
          created_at: now,
          updated_at: now,
        });
        branch = await trx('branches').where({ id: newBranchId }).first();
      }

      const supplierStateCode = branch?.state_code || '23';
      const posCode = input.place_of_supply_code || supplierStateCode;
      const isInterState = supplierStateCode !== posCode;

      // Calculate Line Items
      const calculatedItems: QuotationItem[] = [];
      const lineInputs = input.items || [];

      for (let i = 0; i < lineInputs.length; i++) {
        const item = lineInputs[i];
        const rawQty = new Decimal(item.quantity ?? 0);
        const rawRate = new Decimal(item.rate ?? item.unit_price ?? 0);
        const rawGst = new Decimal(item.gst_rate !== undefined ? item.gst_rate : 18);
        if (!rawQty.isFinite() || rawQty.lte(0)) {
          throw new Error(`Invalid quantity for quotation item "${item.item_name || i + 1}": must be greater than zero.`);
        }
        if (!rawRate.isFinite() || rawRate.lt(0)) {
          throw new Error(`Invalid rate for quotation item "${item.item_name || i + 1}": cannot be negative.`);
        }
        if (!rawGst.isFinite() || rawGst.lt(0) || rawGst.gt(100)) {
          throw new Error(`Invalid GST rate for quotation item "${item.item_name || i + 1}": must be between 0% and 100%.`);
        }

        const lineCalc = calculateLineItem({
          quantity: rawQty.toString(),
          rate: rawRate.toString(),
          discountPercentage: item.discount_percentage,
          discountAmount: item.discount_amount,
          gstRate: rawGst.toString(),
          isTaxInclusive: false,
          isInterState,
        });

        const itemId = item.item_id || item.product_id || undefined;
        let itemName = item.item_name || item.name || item.description || 'Item';
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
          quotation_id: quotationId,
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

      const docTotals = calculateDocumentTotals({
        items: calculatedItems as any,
        overallDiscountAmount: input.overall_discount_amount,
        additionalCharges: input.additional_charges,
      });

      const amountInWords = convertAmountToWords(docTotals.grandTotal);

      // Number generation for quotation
      const { number: qNumber } = await NumberingService.getNextNumber(
        trx,
        companyId,
        'QUOTATION',
        branch?.id,
        input.quotation_date
      );

      let customerName = input.customer_name;
      let customerGstin = input.customer_gstin;
      let billingAddress = input.billing_address;
      let shippingAddress = input.shipping_address;
      let posState = input.place_of_supply_state;
      let posCodeToUse = posCode;

      if (input.customer_id) {
        const custRec = await trx('customers').where({ id: input.customer_id, company_id: companyId }).first();
        if (custRec) {
          customerName = customerName || custRec.name;
          customerGstin = customerGstin || custRec.gstin;
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

      const quotation: Quotation = {
        id: quotationId,
        company_id: companyId,
        branch_id: branch?.id || input.branch_id,
        quotation_number: qNumber,
        revision_number: 1,
        quotation_date: input.quotation_date || now.split('T')[0],
        valid_until_date: input.valid_until_date || now.split('T')[0],
        customer_id: input.customer_id,
        customer_name: customerName,
        customer_gstin: customerGstin || undefined,
        billing_address: billingAddress || '',
        shipping_address: shippingAddress || billingAddress || '',
        place_of_supply_state: posState || branch?.state || 'Madhya Pradesh',
        place_of_supply_code: posCodeToUse,
        items: calculatedItems,
        subtotal: docTotals.subtotal,
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
        status: 'DRAFT',
        letterhead_template_id: input.letterhead_template_id || undefined,
        notes: input.notes || undefined,
        terms_conditions: input.terms_conditions || undefined,
        created_at: now,
        updated_at: now,
      };

      const { items, ...quoteRow } = quotation;
      await trx('quotations').insert({
        ...quoteRow,
        created_by_device_id: input.created_by_device_id || null,
        created_by_device_name: input.created_by_device_name || null,
      });

      for (const item of calculatedItems) {
        await trx('quotation_items').insert(item);
      }

      return quotation;
    });
  }

  async updateQuotationStatus(companyId: string, quotationId: string, status: QuotationStatus): Promise<Quotation> {
    await this.db('quotations').where({ company_id: companyId, id: quotationId }).update({
      status,
      updated_at: new Date().toISOString(),
    });
    return (await this.getQuotationById(companyId, quotationId))!;
  }

  /**
   * 1-Click Manual Conversion of Quotation to Draft Invoice
   */
  async convertToInvoice(companyId: string, quotationId: string): Promise<Invoice> {
    const q = await this.getQuotationById(companyId, quotationId);
    if (!q) throw new Error('Quotation not found');

    const invoicePayload = {
      branch_id: q.branch_id,
      document_type: 'TAX_INVOICE',
      customer_id: q.customer_id,
      customer_name: q.customer_name,
      customer_gstin: q.customer_gstin,
      billing_address: q.billing_address,
      shipping_address: q.shipping_address,
      place_of_supply_state: q.place_of_supply_state,
      place_of_supply_code: q.place_of_supply_code,
      reference_number: `Ref: ${q.quotation_number}`,
      notes: q.notes ? `Converted from Quotation ${q.quotation_number}.\n${q.notes}` : `Converted from Quotation ${q.quotation_number}.`,
      terms_conditions: q.terms_conditions,
      letterhead_template_id: q.letterhead_template_id,
      items: q.items.map((item) => ({
        item_id: item.item_id,
        item_type: item.item_type,
        item_name: item.item_name,
        description: item.description,
        hsn_or_sac: item.hsn_or_sac,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        discount_percentage: item.discount_percentage,
        discount_amount: item.discount_amount,
        gst_rate: item.gst_rate,
      })),
    };

    const newInvoice = await this.invoiceService.createInvoice(companyId, invoicePayload);

    // Update quotation status to CONVERTED
    await this.db('quotations').where({ id: quotationId }).update({
      status: 'CONVERTED',
      converted_invoice_id: newInvoice.id,
      converted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return newInvoice;
  }

  /**
   * Permanently deletes a quotation and its line items.
   */
  async deleteQuotation(companyId: string, quotationId: string): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const q = await trx('quotations').where({ company_id: companyId, id: quotationId }).first();
      if (!q) throw new Error('Quotation not found');

      await trx('quotation_items').where({ quotation_id: quotationId }).del();
      await trx('quotations').where({ id: quotationId }).del();

      const now = new Date().toISOString();
      await trx('audit_logs').insert({
        id: uuidv4(),
        company_id: companyId,
        entity_type: 'QUOTATION',
        entity_id: quotationId,
        action: 'DELETE',
        details: `Deleted quotation ${q.quotation_number}`,
        timestamp: now,
      });

      return true;
    });
  }
}
