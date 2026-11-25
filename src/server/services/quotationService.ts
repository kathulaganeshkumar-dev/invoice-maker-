// src/server/services/quotationService.ts - Quotation Lifecycle and 1-Click Conversion Engine
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import { Quotation, QuotationItem, QuotationStatus, Invoice } from '../../shared/types';
import { calculateLineItem, calculateDocumentTotals } from '../finance/decimalCalc';
import { convertAmountToWords } from '../finance/numberToWords';
import { QuotationSequenceService } from './quotationSequenceService';
import { InvoiceService } from './invoiceService';

export const DEFAULT_VARUN_TERMS = `Terms &Conditions: No warranty for burn / Physical Damage.
1. Taxes: Inclusive of GST
2. Payment: 100% Advance along with PO
3. Validity: 7 Days
4. Delivery: 1 week form the date of PO
5. Installation and transport Included.`;

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
      q.reverse_charge = Boolean(q.reverse_charge);
      q.print_letterhead_overlay = Boolean(q.print_letterhead_overlay);
      q.is_gst = q.is_gst !== undefined ? Boolean(q.is_gst) : true;
    }
    return quotes;
  }

  async getQuotationById(companyId: string, quotationId: string, trx?: Knex.Transaction | Knex): Promise<Quotation | null> {
    const qb = trx || this.db;
    const q = await qb('quotations').where({ company_id: companyId, id: quotationId }).first();
    if (!q) return null;

    q.items = await qb('quotation_items').where({ quotation_id: q.id }).orderBy('sort_order', 'asc');
    q.reverse_charge = Boolean(q.reverse_charge);
    q.print_letterhead_overlay = Boolean(q.print_letterhead_overlay);
    q.is_gst = q.is_gst !== undefined ? Boolean(q.is_gst) : true;
    return q;
  }

  async previewNextNumber(companyId: string, date?: string | Date): Promise<string> {
    return QuotationSequenceService.previewNextQuotationNumber(this.db, companyId, { date });
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

      // Telangana (36) is Varun Systems' default state if unspecified
      const supplierStateCode = branch?.state_code || '36';
      const posCode = input.place_of_supply_code || input.customer_state_code || supplierStateCode;
      const isInterState = supplierStateCode !== posCode;

      // Calculate Line Items using exact decimal math
      const calculatedItems: QuotationItem[] = [];
      const lineInputs = input.items || [];

      for (let i = 0; i < lineInputs.length; i++) {
        const item = lineInputs[i];
        const rawQty = new Decimal(item.quantity ?? item.units ?? 1);
        const rawRate = new Decimal(item.base_rate ?? item.rate ?? item.unit_price ?? 0);
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
          isTaxInclusive: false,
          isInterState,
        });

        const itemId = item.item_id || item.product_id || undefined;
        let itemName = item.item_name || item.name || item.description || `Item ${i + 1}`;
        let hsnCode = item.hsn_or_sac || item.hsn_sac || item.hsn || '';
        let itemType = item.item_type || 'PRODUCT';
        let itemUnit = item.unit || item.units || 'NOS';
        const displayUnits = item.units || (rawQty.gte(10) ? rawQty.toFixed(0) : `0${rawQty.toFixed(0)}`);

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
          hsn_sac: hsnCode,
          quantity: lineCalc.quantity,
          unit: itemUnit,
          units: displayUnits,
          rate: lineCalc.rate,
          base_rate: lineCalc.rate,
          discount_percentage: item.discount_percentage ? new Decimal(item.discount_percentage).toFixed(2) : '0.00',
          discount_amount: lineCalc.discountAmount,
          taxable_value: lineCalc.taxableValue,
          taxable_amount: lineCalc.taxableValue,
          gst_rate: lineCalc.gstRate,
          cgst_rate: lineCalc.cgstRate,
          cgst_amount: lineCalc.cgstAmount,
          sgst_rate: lineCalc.sgstRate,
          sgst_amount: lineCalc.sgstAmount,
          igst_rate: lineCalc.igstRate,
          igst_amount: lineCalc.igstAmount,
          utgst_rate: '0.00',
          utgst_amount: '0.00',
          total_tax: lineCalc.totalTax,
          gst_amount: lineCalc.totalTax,
          line_total: lineCalc.lineTotal,
          total_amount: lineCalc.lineTotal,
          sort_order: i,
        });
      }

      const docTotals = calculateDocumentTotals({
        items: calculatedItems as any,
        overallDiscountAmount: input.overall_discount_amount || input.discount_total,
        additionalCharges: input.additional_charges,
        customRoundOff:
          input.round_off !== undefined && input.round_off !== null && String(input.round_off).trim() !== ''
            ? input.round_off
            : '0.00',
      });

      const amountInWords = convertAmountToWords(docTotals.grandTotal);

      // Number generation for quotation (VS-QT-008-24-25)
      let qNumber = input.quotation_number;
      if (!qNumber) {
        const next = await QuotationSequenceService.getNextQuotationNumber(
          trx,
          companyId,
          { date: input.quotation_date }
        );
        qNumber = next.number;
      }

      let customerName = input.customer_name;
      let customerGstin = input.customer_gstin;
      let billingAddress = input.billing_address;
      let shippingAddress = input.shipping_address;
      let posState = input.place_of_supply_state || input.customer_state;
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

      const terms = input.terms_and_conditions || input.terms_conditions || DEFAULT_VARUN_TERMS;

      const quotation: Quotation = {
        id: quotationId,
        company_id: companyId,
        branch_id: branch?.id || input.branch_id || '',
        quotation_number: qNumber,
        revision_number: 1,
        quotation_date: input.quotation_date || now.split('T')[0],
        valid_until_date: input.valid_until_date || now.split('T')[0],
        customer_id: input.customer_id || undefined,
        customer_name: customerName,
        customer_gstin: customerGstin || undefined,
        billing_address: billingAddress || '',
        shipping_address: shippingAddress || billingAddress || '',
        customer_state: posState || undefined,
        customer_state_code: posCodeToUse || undefined,
        place_of_supply: posState || branch?.state || 'Telangana',
        place_of_supply_state: posState || branch?.state || 'Telangana',
        place_of_supply_code: posCodeToUse,
        contact_person: input.contact_person || undefined,
        contact_phone: input.contact_phone || undefined,
        contact_email: input.contact_email || undefined,
        reverse_charge: Boolean(input.reverse_charge),
        items: calculatedItems,
        subtotal: docTotals.subtotal,
        overall_discount_amount: docTotals.overallDiscountAmount,
        discount_total: docTotals.overallDiscountAmount,
        total_taxable_value: docTotals.totalTaxableValue,
        taxable_total: docTotals.totalTaxableValue,
        total_cgst: docTotals.totalCgst,
        cgst_total: docTotals.totalCgst,
        total_sgst: docTotals.totalSgst,
        sgst_total: docTotals.totalSgst,
        total_igst: docTotals.totalIgst,
        igst_total: docTotals.totalIgst,
        total_utgst: '0.00',
        utgst_total: '0.00',
        total_tax: docTotals.totalTax,
        gst_total: docTotals.totalTax,
        additional_charges: docTotals.additionalCharges,
        round_off: docTotals.roundOff,
        grand_total: docTotals.grandTotal,
        amount_in_words: amountInWords,
        status: 'DRAFT',
        salutation: input.salutation || 'Dear Sir,',
        opening_text: input.opening_text || 'With the reference to your enquiry, we are herewith quoting our lowest and best possible prices of the following.',
        closing_text: input.closing_text || 'Thanking you and assuring of our best services and attention at all times.',
        sign_off_company: input.sign_off_company || 'For VARUN SYSTEMS.',
        letterhead_template_id: input.letterhead_template_id || undefined,
        notes: input.notes || undefined,
        terms_conditions: terms,
        terms_and_conditions: terms,
        top_margin_mm: input.top_margin_mm !== undefined ? Number(input.top_margin_mm) : 55.0,
        bottom_margin_mm: input.bottom_margin_mm !== undefined ? Number(input.bottom_margin_mm) : 32.0,
        left_margin_mm: input.left_margin_mm !== undefined ? Number(input.left_margin_mm) : 15.0,
        right_margin_mm: input.right_margin_mm !== undefined ? Number(input.right_margin_mm) : 15.0,
        print_letterhead_overlay: Boolean(input.print_letterhead_overlay),
        is_gst: input.is_gst !== undefined ? Boolean(input.is_gst) : true,
        created_at: now,
        updated_at: now,
      };

      const { items, ...quoteRow } = quotation;
      const qColInfo = await trx('quotations').columnInfo();
      const validQCols = new Set(Object.keys(qColInfo));
      const rowToInsert: Record<string, any> = {};
      for (const [k, v] of Object.entries(quoteRow)) {
        if (validQCols.has(k)) {
          rowToInsert[k] = v;
        }
      }
      if (validQCols.has('created_by_device_id')) rowToInsert.created_by_device_id = input.created_by_device_id || null;
      if (validQCols.has('created_by_device_name')) rowToInsert.created_by_device_name = input.created_by_device_name || null;

      await trx('quotations').insert(rowToInsert);

      const qiColInfo = await trx('quotation_items').columnInfo();
      const validQiCols = new Set(Object.keys(qiColInfo));
      for (const item of calculatedItems) {
        const itemInsert: Record<string, any> = {};
        for (const [ik, iv] of Object.entries(item)) {
          if (validQiCols.has(ik)) {
            itemInsert[ik] = iv;
          }
        }
        await trx('quotation_items').insert(itemInsert);
      }

      return quotation;
    });
  }

  async updateQuotation(companyId: string, quotationId: string, input: any): Promise<Quotation> {
    return this.db.transaction(async (trx) => {
      const existing = await trx('quotations').where({ company_id: companyId, id: quotationId }).first();
      if (!existing) throw new Error('Quotation not found');
      if (existing.status === 'CONVERTED') {
        throw new Error('Cannot edit a quotation that has already been converted to an invoice.');
      }

      const now = new Date().toISOString();
      const supplierStateCode = '36';
      const posCode = input.place_of_supply_code || input.customer_state_code || existing.place_of_supply_code || supplierStateCode;
      const isInterState = supplierStateCode !== posCode;

      const calculatedItems: QuotationItem[] = [];
      const lineInputs = input.items || [];

      for (let i = 0; i < lineInputs.length; i++) {
        const item = lineInputs[i];
        const rawQty = new Decimal(item.quantity ?? item.units ?? 1);
        const rawRate = new Decimal(item.base_rate ?? item.rate ?? item.unit_price ?? 0);
        const rawGst = new Decimal(item.gst_rate !== undefined ? item.gst_rate : 18);

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
        const itemName = item.item_name || item.name || item.description || `Item ${i + 1}`;
        const hsnCode = item.hsn_or_sac || item.hsn_sac || item.hsn || '';
        const itemType = item.item_type || 'PRODUCT';
        const itemUnit = item.unit || item.units || 'NOS';
        const displayUnits = item.units || (rawQty.gte(10) ? rawQty.toFixed(0) : `0${rawQty.toFixed(0)}`);

        calculatedItems.push({
          id: item.id || uuidv4(),
          quotation_id: quotationId,
          item_id: itemId,
          item_type: itemType,
          item_name: itemName,
          description: item.description || undefined,
          hsn_or_sac: hsnCode,
          hsn_sac: hsnCode,
          quantity: lineCalc.quantity,
          unit: itemUnit,
          units: displayUnits,
          rate: lineCalc.rate,
          base_rate: lineCalc.rate,
          discount_percentage: item.discount_percentage ? new Decimal(item.discount_percentage).toFixed(2) : '0.00',
          discount_amount: lineCalc.discountAmount,
          taxable_value: lineCalc.taxableValue,
          taxable_amount: lineCalc.taxableValue,
          gst_rate: lineCalc.gstRate,
          cgst_rate: lineCalc.cgstRate,
          cgst_amount: lineCalc.cgstAmount,
          sgst_rate: lineCalc.sgstRate,
          sgst_amount: lineCalc.sgstAmount,
          igst_rate: lineCalc.igstRate,
          igst_amount: lineCalc.igstAmount,
          utgst_rate: '0.00',
          utgst_amount: '0.00',
          total_tax: lineCalc.totalTax,
          gst_amount: lineCalc.totalTax,
          line_total: lineCalc.lineTotal,
          total_amount: lineCalc.lineTotal,
          sort_order: i,
        });
      }

      // In updateQuotation:
      const docTotals = calculateDocumentTotals({
        items: calculatedItems as any,
        overallDiscountAmount: input.overall_discount_amount || input.discount_total,
        additionalCharges: input.additional_charges,
        customRoundOff:
          input.round_off !== undefined && input.round_off !== null && String(input.round_off).trim() !== ''
            ? input.round_off
            : (existing.round_off || '0.00'),
      });

      const amountInWords = convertAmountToWords(docTotals.grandTotal);
      const terms = input.terms_and_conditions || input.terms_conditions || existing.terms_conditions || DEFAULT_VARUN_TERMS;

      const updateData: any = {
        quotation_date: input.quotation_date || existing.quotation_date,
        valid_until_date: input.valid_until_date || existing.valid_until_date,
        customer_id: input.customer_id !== undefined ? input.customer_id : existing.customer_id,
        customer_name: input.customer_name || existing.customer_name,
        customer_gstin: input.customer_gstin !== undefined ? input.customer_gstin : existing.customer_gstin,
        billing_address: input.billing_address !== undefined ? input.billing_address : existing.billing_address,
        shipping_address: input.shipping_address !== undefined ? input.shipping_address : existing.shipping_address,
        place_of_supply_state: input.place_of_supply_state || existing.place_of_supply_state,
        place_of_supply_code: posCode,
        subtotal: docTotals.subtotal,
        overall_discount_amount: docTotals.overallDiscountAmount,
        discount_total: docTotals.overallDiscountAmount,
        total_taxable_value: docTotals.totalTaxableValue,
        taxable_total: docTotals.totalTaxableValue,
        total_cgst: docTotals.totalCgst,
        cgst_total: docTotals.totalCgst,
        total_sgst: docTotals.totalSgst,
        sgst_total: docTotals.totalSgst,
        total_igst: docTotals.totalIgst,
        igst_total: docTotals.totalIgst,
        total_tax: docTotals.totalTax,
        gst_total: docTotals.totalTax,
        additional_charges: docTotals.additionalCharges,
        round_off: docTotals.roundOff,
        grand_total: docTotals.grandTotal,
        amount_in_words: amountInWords,
        salutation: input.salutation || existing.salutation,
        opening_text: input.opening_text || existing.opening_text,
        closing_text: input.closing_text || existing.closing_text,
        sign_off_company: input.sign_off_company || existing.sign_off_company,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        terms_conditions: terms,
        terms_and_conditions: terms,
        top_margin_mm: input.top_margin_mm !== undefined ? Number(input.top_margin_mm) : existing.top_margin_mm,
        bottom_margin_mm: input.bottom_margin_mm !== undefined ? Number(input.bottom_margin_mm) : existing.bottom_margin_mm,
        left_margin_mm: input.left_margin_mm !== undefined ? Number(input.left_margin_mm) : existing.left_margin_mm,
        right_margin_mm: input.right_margin_mm !== undefined ? Number(input.right_margin_mm) : existing.right_margin_mm,
        print_letterhead_overlay: input.print_letterhead_overlay !== undefined ? Boolean(input.print_letterhead_overlay) : existing.print_letterhead_overlay,
        is_gst: input.is_gst !== undefined ? Boolean(input.is_gst) : existing.is_gst,
        updated_at: now,
      };

      const qColInfo = await trx('quotations').columnInfo();
      const validQCols = new Set(Object.keys(qColInfo));
      const rowToUpdate: Record<string, any> = {};
      for (const [k, v] of Object.entries(updateData)) {
        if (validQCols.has(k)) {
          rowToUpdate[k] = v;
        }
      }

      await trx('quotations').where({ id: quotationId }).update(rowToUpdate);
      await trx('quotation_items').where({ quotation_id: quotationId }).del();

      const qiColInfo = await trx('quotation_items').columnInfo();
      const validQiCols = new Set(Object.keys(qiColInfo));
      for (const item of calculatedItems) {
        const itemInsert: Record<string, any> = {};
        for (const [ik, iv] of Object.entries(item)) {
          if (validQiCols.has(ik)) {
            itemInsert[ik] = iv;
          }
        }
        await trx('quotation_items').insert(itemInsert);
      }

      return (await this.getQuotationById(companyId, quotationId, trx))!;
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
      round_off: q.round_off,
      created_by_device_id: q.created_by_device_id,
      created_by_device_name: q.created_by_device_name,
      items: q.items.map((item) => ({
        item_id: item.item_id,
        item_type: item.item_type,
        item_name: item.item_name,
        description: item.description,
        hsn_or_sac: item.hsn_or_sac || item.hsn_sac,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.base_rate || item.rate,
        discount_percentage: item.discount_percentage,
        discount_amount: item.discount_amount,
        gst_rate: item.gst_rate,
      })),
    };

    const newInvoice = await this.invoiceService.createInvoice(companyId, invoicePayload);

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
