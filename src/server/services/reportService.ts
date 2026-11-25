// src/server/services/reportService.ts - Real-Time Financial Dashboard & GST Reporting Engine
import { Knex } from 'knex';
import Decimal from 'decimal.js';
import ExcelJS from 'exceljs';
import { generateHsnSummary, HsnSummaryRow, validateGSTIN } from '../finance/gstEngine';
import { INDIAN_STATES } from '../../shared/constants';
import { InvoiceItem } from '../../shared/types';

export interface DashboardMetrics {
  totalSales: string;
  totalPurchases: string;
  totalInvoicesCount: number;
  totalQuotationsCount: number;
  paidInvoicesAmount: string;
  unpaidInvoicesAmount: string;
  outstandingReceivables: string;
  outstandingPayables: string;
  totalPaymentsReceived: string;
  totalSupplierPayments: string;
  currentStockValue: string;
  lowStockCount: number;
  monthlySales: { month: string; sales: number; purchases: number }[];
  invoiceStatusCounts: { status: string; count: number }[];
  quotationStatusCounts: { status: string; count: number }[];
}

export interface GstSummaryReport {
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalTax: string;
  hsnSummary: HsnSummaryRow[];
}

export interface TallyGstr1SummarySection {
  title: string;
  tableNo: string;
  voucherCount: number;
  taxableValue: string;
  integratedTax: string;
  centralTax: string;
  stateTax: string;
  cess: string;
  totalTax: string;
  totalInvoiceValue: string;
}

export interface TallyB2BRow {
  recipientGstin: string;
  recipientName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: string;
  placeOfSupply: string;
  reverseCharge: string;
  rate: string;
  taxableValue: string;
  integratedTax: string;
  centralTax: string;
  stateTax: string;
  cess: string;
}

export interface TallyB2CLargeRow {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: string;
  placeOfSupply: string;
  rate: string;
  taxableValue: string;
  integratedTax: string;
  cess: string;
}

export interface TallyB2CSmallRow {
  placeOfSupply: string;
  rate: string;
  taxableValue: string;
  integratedTax: string;
  centralTax: string;
  stateTax: string;
  cess: string;
}

export interface TallyDocSummaryRow {
  natureOfDoc: string;
  srNoFrom: string;
  srNoTo: string;
  totalNumber: number;
  cancelled: number;
  netIssued: number;
}

export interface TallyGstr1Report {
  company: {
    name: string;
    gstin?: string;
    state?: string;
    stateCode?: string;
  };
  period: {
    startDate?: string;
    endDate?: string;
  };
  statistics: {
    totalVouchers: number;
    includedInReturn: number;
    notRelevantForReturn: number;
    mismatchCount: number;
  };
  summarySections: TallyGstr1SummarySection[];
  b2bList: TallyB2BRow[];
  b2clList: TallyB2CLargeRow[];
  b2csList: TallyB2CSmallRow[];
  hsnSummary: HsnSummaryRow[];
  docSummary: TallyDocSummaryRow[];
  totals: {
    voucherCount: number;
    taxableValue: string;
    integratedTax: string;
    centralTax: string;
    stateTax: string;
    cess: string;
    totalTax: string;
    totalInvoiceValue: string;
  };
}

export interface TallyGstr3BReport {
  company: {
    name: string;
    gstin?: string;
    state?: string;
    stateCode?: string;
  };
  period: {
    startDate?: string;
    endDate?: string;
  };
  table31OutwardSupplies: {
    a_taxable: { taxableValue: string; igst: string; cgst: string; sgst: string; cess: string };
    b_zeroRated: { taxableValue: string; igst: string; cgst: string; sgst: string; cess: string };
    c_nilExempt: { taxableValue: string; igst: string; cgst: string; sgst: string; cess: string };
    d_reverseChargeInward: { taxableValue: string; igst: string; cgst: string; sgst: string; cess: string };
    e_nonGstOutward: { taxableValue: string; igst: string; cgst: string; sgst: string; cess: string };
    total: { taxableValue: string; igst: string; cgst: string; sgst: string; cess: string };
  };
  table32InterStateUnregistered: {
    placeOfSupply: string;
    taxableValue: string;
    igst: string;
  }[];
  table4EligibleItc: {
    allOtherItc: { taxableValue: string; igst: string; cgst: string; sgst: string; cess: string };
    itcReversed: { taxableValue: string; igst: string; cgst: string; sgst: string; cess: string };
    netItcAvailable: { taxableValue: string; igst: string; cgst: string; sgst: string; cess: string };
  };
  taxPayableVsItc: {
    outwardTaxPayable: { igst: string; cgst: string; sgst: string; total: string };
    itcAvailable: { igst: string; cgst: string; sgst: string; total: string };
    netTaxPayableInCash: { igst: string; cgst: string; sgst: string; total: string };
  };
}

export interface TallyGstr2Row {
  supplierGstin: string;
  supplierName: string;
  billNumber: string;
  billDate: string;
  billValue: string;
  placeOfSupply: string;
  rate: string;
  taxableValue: string;
  integratedTax: string;
  centralTax: string;
  stateTax: string;
  itcEligibility: string;
}

export interface TallyGstr2Report {
  company: {
    name: string;
    gstin?: string;
    state?: string;
    stateCode?: string;
  };
  period: {
    startDate?: string;
    endDate?: string;
  };
  bills: TallyGstr2Row[];
  totals: {
    billCount: number;
    taxableValue: string;
    integratedTax: string;
    centralTax: string;
    stateTax: string;
    totalItc: string;
    totalBillValue: string;
  };
}

export class ReportService {
  constructor(private db: Knex) {}

  /**
   * Calculates real-time dashboard figures strictly from transactional database records
   */
  async getDashboardMetrics(
    companyId: string,
    filters?: { startDate?: string; endDate?: string }
  ): Promise<DashboardMetrics> {
    // 1. Sales & Invoices
    let invQuery = this.db('invoices')
      .where({ company_id: companyId })
      .whereIn('status', ['FINALIZED', 'DRAFT', 'REVIEW']);

    if (filters?.startDate) invQuery = invQuery.andWhere('invoice_date', '>=', filters.startDate);
    if (filters?.endDate) invQuery = invQuery.andWhere('invoice_date', '<=', filters.endDate);

    const invoices = await invQuery;

    let totalSales = new Decimal(0);
    let paidInvoicesAmount = new Decimal(0);
    let unpaidInvoicesAmount = new Decimal(0);
    const invoiceStatusMap = new Map<string, number>();

    for (const inv of invoices) {
      if (inv.status === 'FINALIZED') {
        totalSales = totalSales.add(new Decimal(inv.grand_total));
        paidInvoicesAmount = paidInvoicesAmount.add(new Decimal(inv.paid_amount));
        unpaidInvoicesAmount = unpaidInvoicesAmount.add(new Decimal(inv.balance_amount));
      }
      invoiceStatusMap.set(inv.status, (invoiceStatusMap.get(inv.status) || 0) + 1);
    }

    // 2. Customer Receivables & Supplier Payables
    const customers = await this.db('customers').where({ company_id: companyId, is_archived: false });
    let outstandingReceivables = new Decimal(0);
    for (const c of customers) {
      outstandingReceivables = outstandingReceivables.add(new Decimal(c.current_balance || 0));
    }

    const suppliers = await this.db('suppliers').where({ company_id: companyId, is_archived: false });
    let outstandingPayables = new Decimal(0);
    for (const s of suppliers) {
      outstandingPayables = outstandingPayables.add(new Decimal(s.current_balance || 0));
    }

    // 3. Purchases
    let purQuery = this.db('purchase_invoices').where({ company_id: companyId, is_finalized: true });
    if (filters?.startDate) purQuery = purQuery.andWhere('bill_date', '>=', filters.startDate);
    if (filters?.endDate) purQuery = purQuery.andWhere('bill_date', '<=', filters.endDate);
    const purchases = await purQuery;

    let totalPurchases = new Decimal(0);
    for (const p of purchases) {
      totalPurchases = totalPurchases.add(new Decimal(p.grand_total));
    }

    // 4. Quotations
    let quoteQuery = this.db('quotations').where({ company_id: companyId });
    if (filters?.startDate) quoteQuery = quoteQuery.andWhere('quotation_date', '>=', filters.startDate);
    if (filters?.endDate) quoteQuery = quoteQuery.andWhere('quotation_date', '<=', filters.endDate);
    const quotations = await quoteQuery;
    const quoteStatusMap = new Map<string, number>();
    for (const q of quotations) {
      quoteStatusMap.set(q.status, (quoteStatusMap.get(q.status) || 0) + 1);
    }

    // 5. Payments Received & Payments Made
    let custPayQuery = this.db('customer_payments').where({ company_id: companyId });
    if (filters?.startDate) custPayQuery = custPayQuery.andWhere('payment_date', '>=', filters.startDate);
    if (filters?.endDate) custPayQuery = custPayQuery.andWhere('payment_date', '<=', filters.endDate);
    const customerPayments = await custPayQuery;

    let totalPaymentsReceived = new Decimal(0);
    for (const cp of customerPayments) {
      totalPaymentsReceived = totalPaymentsReceived.add(new Decimal(cp.amount));
    }

    let supPayQuery = this.db('supplier_payments').where({ company_id: companyId });
    if (filters?.startDate) supPayQuery = supPayQuery.andWhere('payment_date', '>=', filters.startDate);
    if (filters?.endDate) supPayQuery = supPayQuery.andWhere('payment_date', '<=', filters.endDate);
    const supplierPayments = await supPayQuery;

    let totalSupplierPayments = new Decimal(0);
    for (const sp of supplierPayments) {
      totalSupplierPayments = totalSupplierPayments.add(new Decimal(sp.amount));
    }

    // 6. Stock Valuation & Low Stock Products
    const products = await this.db('products').where({ company_id: companyId, item_type: 'PRODUCT', is_archived: false });
    let currentStockValue = new Decimal(0);
    let lowStockCount = 0;

    for (const prod of products) {
      const stock = new Decimal(prod.current_stock || 0);
      const minStock = new Decimal(prod.minimum_stock || 0);
      const purchasePrice = new Decimal(prod.purchase_price || 0);

      if (stock.gt(0)) {
        currentStockValue = currentStockValue.add(stock.mul(purchasePrice));
      }
      if (stock.lte(minStock) && minStock.gt(0)) {
        lowStockCount++;
      }
    }

    // 7. Monthly Aggregates for Chart (Indian FY Apr..Mar mapped dynamically from actual invoice & purchase dates)
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    const calIdxToLabel = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const salesByMonth = new Map<string, Decimal>(months.map((m) => [m, new Decimal(0)]));
    const purchasesByMonth = new Map<string, Decimal>(months.map((m) => [m, new Decimal(0)]));

    const resolveMonthLabel = (dateStr?: string): string | null => {
      if (!dateStr) return null;
      const parts = dateStr.split('-');
      if (parts.length >= 2) {
        const mNum = parseInt(parts[1], 10);
        if (mNum >= 1 && mNum <= 12) return calIdxToLabel[mNum - 1];
      }
      const d = new Date(dateStr);
      if (!Number.isNaN(d.getTime())) {
        return calIdxToLabel[d.getUTCMonth()];
      }
      return null;
    };

    for (const inv of invoices) {
      if (inv.status === 'FINALIZED') {
        const mLabel = resolveMonthLabel(inv.invoice_date);
        if (mLabel && salesByMonth.has(mLabel)) {
          salesByMonth.set(mLabel, salesByMonth.get(mLabel)!.add(new Decimal(inv.grand_total || 0)));
        }
      }
    }

    for (const pur of purchases) {
      const mLabel = resolveMonthLabel(pur.bill_date);
      if (mLabel && purchasesByMonth.has(mLabel)) {
        purchasesByMonth.set(mLabel, purchasesByMonth.get(mLabel)!.add(new Decimal(pur.grand_total || 0)));
      }
    }

    const monthlySales = months.map((m) => ({
      month: m,
      sales: salesByMonth.get(m)!.toNumber(),
      purchases: purchasesByMonth.get(m)!.toNumber(),
    }));

    return {
      totalSales: totalSales.toFixed(2),
      totalPurchases: totalPurchases.toFixed(2),
      totalInvoicesCount: invoices.length,
      totalQuotationsCount: quotations.length,
      paidInvoicesAmount: paidInvoicesAmount.toFixed(2),
      unpaidInvoicesAmount: unpaidInvoicesAmount.toFixed(2),
      outstandingReceivables: outstandingReceivables.toFixed(2),
      outstandingPayables: outstandingPayables.toFixed(2),
      totalPaymentsReceived: totalPaymentsReceived.toFixed(2),
      totalSupplierPayments: totalSupplierPayments.toFixed(2),
      currentStockValue: currentStockValue.toFixed(2),
      lowStockCount,
      monthlySales,
      invoiceStatusCounts: Array.from(invoiceStatusMap.entries()).map(([status, count]) => ({ status, count })),
      quotationStatusCounts: Array.from(quoteStatusMap.entries()).map(([status, count]) => ({ status, count })),
    };
  }

  /**
   * Generates Indian GST Sales & GSTR-1 supporting report
   */
  async getGstSalesReport(companyId: string, startDate?: string, endDate?: string): Promise<GstSummaryReport> {
    let query = this.db('invoices')
      .where({ company_id: companyId, status: 'FINALIZED' })
      .whereIn('document_type', ['TAX_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE']);

    if (startDate) query = query.andWhere('invoice_date', '>=', startDate);
    if (endDate) query = query.andWhere('invoice_date', '<=', endDate);

    const invoices = await query;
    const invoiceIds = invoices.map((i) => i.id);

    let taxableValue = new Decimal(0);
    let cgst = new Decimal(0);
    let sgst = new Decimal(0);
    let igst = new Decimal(0);
    let totalTax = new Decimal(0);

    for (const inv of invoices) {
      const isCreditNote = inv.document_type === 'CREDIT_NOTE';
      const factor = isCreditNote ? new Decimal(-1) : new Decimal(1);

      taxableValue = taxableValue.add(new Decimal(inv.total_taxable_value).mul(factor));
      cgst = cgst.add(new Decimal(inv.total_cgst).mul(factor));
      sgst = sgst.add(new Decimal(inv.total_sgst).mul(factor));
      igst = igst.add(new Decimal(inv.total_igst).mul(factor));
      totalTax = totalTax.add(new Decimal(inv.total_tax).mul(factor));
    }

    const items: InvoiceItem[] = invoiceIds.length > 0
      ? await this.db('invoice_items').whereIn('invoice_id', invoiceIds)
      : [];

    const hsnSummary = generateHsnSummary(items);

    return {
      taxableValue: taxableValue.toFixed(2),
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      igst: igst.toFixed(2),
      totalTax: totalTax.toFixed(2),
      hsnSummary,
    };
  }

  /**
   * Generates comprehensive Tally Prime & GST Portal compliant GSTR-1 Return Report
   */
  async getTallyGstr1Report(
    companyId: string,
    startDate?: string,
    endDate?: string
  ): Promise<TallyGstr1Report> {
    const company = await this.db('companies').where({ id: companyId }).first();
    const companyGstin = (company?.gstin || '').toUpperCase().trim();
    const companyState = company?.state || '';
    const companyStateCode = company?.state_code || (companyGstin ? companyGstin.substring(0, 2) : '');

    let invQuery = this.db('invoices').where({ company_id: companyId });
    if (startDate) invQuery = invQuery.andWhere('invoice_date', '>=', startDate);
    if (endDate) invQuery = invQuery.andWhere('invoice_date', '<=', endDate);
    const allInvoices = await invQuery.orderBy('invoice_date', 'asc').orderBy('invoice_number', 'asc');

    const totalVouchers = allInvoices.length;
    let notRelevantForReturn = 0;
    let mismatchCount = 0;
    const includedInvoices: any[] = [];

    for (const inv of allInvoices) {
      if (inv.status === 'CANCELLED') {
        notRelevantForReturn++;
        continue;
      }
      if (inv.status !== 'FINALIZED') {
        notRelevantForReturn++;
        continue;
      }
      includedInvoices.push(inv);
    }

    const invoiceIds = includedInvoices.map((i) => i.id);
    const allItems: any[] = invoiceIds.length > 0
      ? await this.db('invoice_items').whereIn('invoice_id', invoiceIds).orderBy('sort_order', 'asc')
      : [];

    const itemsByInvoiceId = new Map<string, any[]>();
    for (const it of allItems) {
      const arr = itemsByInvoiceId.get(it.invoice_id) || [];
      arr.push(it);
      itemsByInvoiceId.set(it.invoice_id, arr);
    }

    const b2bList: TallyB2BRow[] = [];
    const b2clList: TallyB2CLargeRow[] = [];
    const b2csMap = new Map<string, {
      placeOfSupply: string;
      rate: string;
      taxableValue: Decimal;
      integratedTax: Decimal;
      centralTax: Decimal;
      stateTax: Decimal;
      cess: Decimal;
    }>();

    let b2bVoucherCount = 0;
    let b2clVoucherCount = 0;
    let b2csVoucherCount = 0;
    let nilVoucherCount = 0;
    let creditDebitVoucherCount = 0;

    let b2bTaxable = new Decimal(0);
    let b2bIgst = new Decimal(0);
    let b2bCgst = new Decimal(0);
    let b2bSgst = new Decimal(0);
    let b2bTotalTax = new Decimal(0);
    let b2bTotalVal = new Decimal(0);

    let b2clTaxable = new Decimal(0);
    let b2clIgst = new Decimal(0);
    let b2clTotalTax = new Decimal(0);
    let b2clTotalVal = new Decimal(0);

    let b2csTaxable = new Decimal(0);
    let b2csIgst = new Decimal(0);
    let b2csCgst = new Decimal(0);
    let b2csSgst = new Decimal(0);
    let b2csTotalTax = new Decimal(0);
    let b2csTotalVal = new Decimal(0);

    let cdnTaxable = new Decimal(0);
    let cdnIgst = new Decimal(0);
    let cdnCgst = new Decimal(0);
    let cdnSgst = new Decimal(0);
    let cdnTotalTax = new Decimal(0);
    let cdnTotalVal = new Decimal(0);

    let nilTaxable = new Decimal(0);

    for (const inv of includedInvoices) {
      const gstin = (inv.customer_gstin || '').toUpperCase().trim();
      const isRegistered = gstin.length === 15;
      const isValidGst = isRegistered ? validateGSTIN(gstin).isValid : false;
      if (isRegistered && !isValidGst) {
        mismatchCount++;
      }

      const invItems = itemsByInvoiceId.get(inv.id) || [];
      const isCreditDebit = inv.document_type === 'CREDIT_NOTE' || inv.document_type === 'DEBIT_NOTE';
      const pos = inv.place_of_supply_state || inv.place_of_supply_code || companyState;
      const posCode = inv.place_of_supply_code || (pos.length === 2 ? pos : companyStateCode);
      const isInterState = inv.is_inter_state || (posCode !== companyStateCode);
      const grandTotalNum = new Decimal(inv.grand_total || 0);

      // Group items by rate
      const rateGroups = new Map<string, {
        taxable: Decimal;
        cgst: Decimal;
        sgst: Decimal;
        igst: Decimal;
        totalTax: Decimal;
      }>();

      for (const it of invItems) {
        const rateKey = new Decimal(it.gst_rate || 0).toFixed(2);
        const curr = rateGroups.get(rateKey) || {
          taxable: new Decimal(0),
          cgst: new Decimal(0),
          sgst: new Decimal(0),
          igst: new Decimal(0),
          totalTax: new Decimal(0),
        };
        curr.taxable = curr.taxable.add(new Decimal(it.taxable_value || 0));
        curr.cgst = curr.cgst.add(new Decimal(it.cgst_amount || 0));
        curr.sgst = curr.sgst.add(new Decimal(it.sgst_amount || 0));
        curr.igst = curr.igst.add(new Decimal(it.igst_amount || 0));
        curr.totalTax = curr.totalTax.add(new Decimal(it.total_tax || 0));
        rateGroups.set(rateKey, curr);
      }

      if (isCreditDebit) {
        creditDebitVoucherCount++;
        const factor = inv.document_type === 'CREDIT_NOTE' ? new Decimal(-1) : new Decimal(1);
        cdnTaxable = cdnTaxable.add(new Decimal(inv.total_taxable_value || 0).mul(factor));
        cdnIgst = cdnIgst.add(new Decimal(inv.total_igst || 0).mul(factor));
        cdnCgst = cdnCgst.add(new Decimal(inv.total_cgst || 0).mul(factor));
        cdnSgst = cdnSgst.add(new Decimal(inv.total_sgst || 0).mul(factor));
        cdnTotalTax = cdnTotalTax.add(new Decimal(inv.total_tax || 0).mul(factor));
        cdnTotalVal = cdnTotalVal.add(grandTotalNum.mul(factor));
      } else if (isRegistered) {
        // B2B
        b2bVoucherCount++;
        b2bTotalVal = b2bTotalVal.add(grandTotalNum);
        for (const [rateStr, vals] of rateGroups.entries()) {
          b2bTaxable = b2bTaxable.add(vals.taxable);
          b2bIgst = b2bIgst.add(vals.igst);
          b2bCgst = b2bCgst.add(vals.cgst);
          b2bSgst = b2bSgst.add(vals.sgst);
          b2bTotalTax = b2bTotalTax.add(vals.totalTax);

          b2bList.push({
            recipientGstin: gstin,
            recipientName: inv.customer_name || 'Registered Customer',
            invoiceNumber: inv.invoice_number,
            invoiceDate: inv.invoice_date,
            invoiceValue: grandTotalNum.toFixed(2),
            placeOfSupply: `${posCode}-${pos}`,
            reverseCharge: inv.is_reverse_charge ? 'Y' : 'N',
            rate: rateStr,
            taxableValue: vals.taxable.toFixed(2),
            integratedTax: vals.igst.toFixed(2),
            centralTax: vals.cgst.toFixed(2),
            stateTax: vals.sgst.toFixed(2),
            cess: '0.00',
          });
        }
      } else {
        // Unregistered: check B2C Large vs B2C Small
        const isB2CLarge = isInterState && grandTotalNum.gt(250000);
        if (isB2CLarge) {
          b2clVoucherCount++;
          b2clTotalVal = b2clTotalVal.add(grandTotalNum);
          for (const [rateStr, vals] of rateGroups.entries()) {
            b2clTaxable = b2clTaxable.add(vals.taxable);
            b2clIgst = b2clIgst.add(vals.igst);
            b2clTotalTax = b2clTotalTax.add(vals.totalTax);

            b2clList.push({
              invoiceNumber: inv.invoice_number,
              invoiceDate: inv.invoice_date,
              invoiceValue: grandTotalNum.toFixed(2),
              placeOfSupply: `${posCode}-${pos}`,
              rate: rateStr,
              taxableValue: vals.taxable.toFixed(2),
              integratedTax: vals.igst.toFixed(2),
              cess: '0.00',
            });
          }
        } else {
          b2csVoucherCount++;
          b2csTotalVal = b2csTotalVal.add(grandTotalNum);
          for (const [rateStr, vals] of rateGroups.entries()) {
            b2csTaxable = b2csTaxable.add(vals.taxable);
            b2csIgst = b2csIgst.add(vals.igst);
            b2csCgst = b2csCgst.add(vals.cgst);
            b2csSgst = b2csSgst.add(vals.sgst);
            b2csTotalTax = b2csTotalTax.add(vals.totalTax);

            const mapKey = `${posCode}-${pos}_${rateStr}`;
            const existing = b2csMap.get(mapKey) || {
              placeOfSupply: `${posCode}-${pos}`,
              rate: rateStr,
              taxableValue: new Decimal(0),
              integratedTax: new Decimal(0),
              centralTax: new Decimal(0),
              stateTax: new Decimal(0),
              cess: new Decimal(0),
            };
            existing.taxableValue = existing.taxableValue.add(vals.taxable);
            existing.integratedTax = existing.integratedTax.add(vals.igst);
            existing.centralTax = existing.centralTax.add(vals.cgst);
            existing.stateTax = existing.stateTax.add(vals.sgst);
            b2csMap.set(mapKey, existing);
          }
        }
      }
    }

    const b2csList: TallyB2CSmallRow[] = Array.from(b2csMap.values()).map((row) => ({
      placeOfSupply: row.placeOfSupply,
      rate: row.rate,
      taxableValue: row.taxableValue.toFixed(2),
      integratedTax: row.integratedTax.toFixed(2),
      centralTax: row.centralTax.toFixed(2),
      stateTax: row.stateTax.toFixed(2),
      cess: row.cess.toFixed(2),
    }));

    // HSN Summary (Table 12)
    const hsnSummary = generateHsnSummary(allItems);

    // Document Summary (Table 13)
    const invoiceNumbers = allInvoices.map((i) => i.invoice_number).filter(Boolean);
    const minInvNum = invoiceNumbers.length > 0 ? invoiceNumbers[0] : '-';
    const maxInvNum = invoiceNumbers.length > 0 ? invoiceNumbers[invoiceNumbers.length - 1] : '-';
    const cancelledCount = allInvoices.filter((i) => i.status === 'CANCELLED').length;
    const docSummary: TallyDocSummaryRow[] = [
      {
        natureOfDoc: 'Invoices for outward supply',
        srNoFrom: minInvNum,
        srNoTo: maxInvNum,
        totalNumber: allInvoices.length,
        cancelled: cancelledCount,
        netIssued: allInvoices.length - cancelledCount,
      },
    ];

    // Build Summary Sections (Exact Tally Prime GSTR-1 Structure)
    const summarySections: TallyGstr1SummarySection[] = [
      {
        title: 'B2B Invoices - 4A, 4B, 4C, 6B, 6C',
        tableNo: '4',
        voucherCount: b2bVoucherCount,
        taxableValue: b2bTaxable.toFixed(2),
        integratedTax: b2bIgst.toFixed(2),
        centralTax: b2bCgst.toFixed(2),
        stateTax: b2bSgst.toFixed(2),
        cess: '0.00',
        totalTax: b2bTotalTax.toFixed(2),
        totalInvoiceValue: b2bTotalVal.toFixed(2),
      },
      {
        title: 'B2C (Large) Invoices - 5A, 5B',
        tableNo: '5',
        voucherCount: b2clVoucherCount,
        taxableValue: b2clTaxable.toFixed(2),
        integratedTax: b2clIgst.toFixed(2),
        centralTax: '0.00',
        stateTax: '0.00',
        cess: '0.00',
        totalTax: b2clTotalTax.toFixed(2),
        totalInvoiceValue: b2clTotalVal.toFixed(2),
      },
      {
        title: 'B2C (Small) Invoices - 7',
        tableNo: '7',
        voucherCount: b2csVoucherCount,
        taxableValue: b2csTaxable.toFixed(2),
        integratedTax: b2csIgst.toFixed(2),
        centralTax: b2csCgst.toFixed(2),
        stateTax: b2csSgst.toFixed(2),
        cess: '0.00',
        totalTax: b2csTotalTax.toFixed(2),
        totalInvoiceValue: b2csTotalVal.toFixed(2),
      },
      {
        title: 'Credit / Debit Notes (Registered) - 9B',
        tableNo: '9B',
        voucherCount: creditDebitVoucherCount,
        taxableValue: cdnTaxable.toFixed(2),
        integratedTax: cdnIgst.toFixed(2),
        centralTax: cdnCgst.toFixed(2),
        stateTax: cdnSgst.toFixed(2),
        cess: '0.00',
        totalTax: cdnTotalTax.toFixed(2),
        totalInvoiceValue: cdnTotalVal.toFixed(2),
      },
      {
        title: 'Nil Rated / Exempt Supplies - 8A, 8B, 8C, 8D',
        tableNo: '8',
        voucherCount: nilVoucherCount,
        taxableValue: nilTaxable.toFixed(2),
        integratedTax: '0.00',
        centralTax: '0.00',
        stateTax: '0.00',
        cess: '0.00',
        totalTax: '0.00',
        totalInvoiceValue: nilTaxable.toFixed(2),
      },
      {
        title: 'HSN / SAC Summary of Outward Supplies - 12',
        tableNo: '12',
        voucherCount: hsnSummary.length,
        taxableValue: hsnSummary.reduce((acc, h) => acc.add(new Decimal(h.taxable_value || 0)), new Decimal(0)).toFixed(2),
        integratedTax: hsnSummary.reduce((acc, h) => acc.add(new Decimal(h.igst_amount || 0)), new Decimal(0)).toFixed(2),
        centralTax: hsnSummary.reduce((acc, h) => acc.add(new Decimal(h.cgst_amount || 0)), new Decimal(0)).toFixed(2),
        stateTax: hsnSummary.reduce((acc, h) => acc.add(new Decimal(h.sgst_amount || 0)), new Decimal(0)).toFixed(2),
        cess: '0.00',
        totalTax: hsnSummary.reduce((acc, h) => acc.add(new Decimal(h.total_tax || 0)), new Decimal(0)).toFixed(2),
        totalInvoiceValue: hsnSummary.reduce((acc, h) => acc.add(new Decimal(h.total_value || 0)), new Decimal(0)).toFixed(2),
      },
      {
        title: 'Documents Issued during the Tax Period - 13',
        tableNo: '13',
        voucherCount: allInvoices.length,
        taxableValue: '-',
        integratedTax: '-',
        centralTax: '-',
        stateTax: '-',
        cess: '-',
        totalTax: '-',
        totalInvoiceValue: '-',
      },
    ];

    // Compute Totals
    const totalTaxable = b2bTaxable.add(b2clTaxable).add(b2csTaxable).add(cdnTaxable);
    const totalIgst = b2bIgst.add(b2clIgst).add(b2csIgst).add(cdnIgst);
    const totalCgst = b2bCgst.add(b2csCgst).add(cdnCgst);
    const totalSgst = b2bSgst.add(b2csSgst).add(cdnSgst);
    const grandTax = b2bTotalTax.add(b2clTotalTax).add(b2csTotalTax).add(cdnTotalTax);
    const grandVal = b2bTotalVal.add(b2clTotalVal).add(b2csTotalVal).add(cdnTotalVal);

    return {
      company: {
        name: company?.name || 'Company',
        gstin: companyGstin,
        state: companyState,
        stateCode: companyStateCode,
      },
      period: {
        startDate,
        endDate,
      },
      statistics: {
        totalVouchers,
        includedInReturn: includedInvoices.length,
        notRelevantForReturn,
        mismatchCount,
      },
      summarySections,
      b2bList,
      b2clList,
      b2csList,
      hsnSummary,
      docSummary,
      totals: {
        voucherCount: includedInvoices.length,
        taxableValue: totalTaxable.toFixed(2),
        integratedTax: totalIgst.toFixed(2),
        centralTax: totalCgst.toFixed(2),
        stateTax: totalSgst.toFixed(2),
        cess: '0.00',
        totalTax: grandTax.toFixed(2),
        totalInvoiceValue: grandVal.toFixed(2),
      },
    };
  }

  /**
   * Generates GSTR-3B Monthly / Periodic Summary Return with Output Tax and Input Tax Credit (ITC)
   */
  async getTallyGstr3BReport(
    companyId: string,
    startDate?: string,
    endDate?: string
  ): Promise<TallyGstr3BReport> {
    const gstr1 = await this.getTallyGstr1Report(companyId, startDate, endDate);

    // 1. Table 3.1: Outward supplies
    const taxableVal = gstr1.totals.taxableValue;
    const igstVal = gstr1.totals.integratedTax;
    const cgstVal = gstr1.totals.centralTax;
    const sgstVal = gstr1.totals.stateTax;

    const table31 = {
      a_taxable: { taxableValue: taxableVal, igst: igstVal, cgst: cgstVal, sgst: sgstVal, cess: '0.00' },
      b_zeroRated: { taxableValue: '0.00', igst: '0.00', cgst: '0.00', sgst: '0.00', cess: '0.00' },
      c_nilExempt: { taxableValue: '0.00', igst: '0.00', cgst: '0.00', sgst: '0.00', cess: '0.00' },
      d_reverseChargeInward: { taxableValue: '0.00', igst: '0.00', cgst: '0.00', sgst: '0.00', cess: '0.00' },
      e_nonGstOutward: { taxableValue: '0.00', igst: '0.00', cgst: '0.00', sgst: '0.00', cess: '0.00' },
      total: { taxableValue: taxableVal, igst: igstVal, cgst: cgstVal, sgst: sgstVal, cess: '0.00' },
    };

    // 2. Table 3.2: Inter-State supplies made to unregistered persons
    const interStateMap = new Map<string, { taxable: Decimal; igst: Decimal }>();
    for (const b2cl of gstr1.b2clList) {
      const cur = interStateMap.get(b2cl.placeOfSupply) || { taxable: new Decimal(0), igst: new Decimal(0) };
      cur.taxable = cur.taxable.add(new Decimal(b2cl.taxableValue));
      cur.igst = cur.igst.add(new Decimal(b2cl.integratedTax));
      interStateMap.set(b2cl.placeOfSupply, cur);
    }
    for (const b2cs of gstr1.b2csList) {
      const igstDec = new Decimal(b2cs.integratedTax);
      if (igstDec.gt(0)) {
        const cur = interStateMap.get(b2cs.placeOfSupply) || { taxable: new Decimal(0), igst: new Decimal(0) };
        cur.taxable = cur.taxable.add(new Decimal(b2cs.taxableValue));
        cur.igst = cur.igst.add(igstDec);
        interStateMap.set(b2cs.placeOfSupply, cur);
      }
    }
    const table32 = Array.from(interStateMap.entries()).map(([pos, val]) => ({
      placeOfSupply: pos,
      taxableValue: val.taxable.toFixed(2),
      igst: val.igst.toFixed(2),
    }));

    // 3. Table 4: Eligible ITC from Purchase Invoices
    let purQuery = this.db('purchase_invoices').where({ company_id: companyId, is_finalized: true });
    if (startDate) purQuery = purQuery.andWhere('bill_date', '>=', startDate);
    if (endDate) purQuery = purQuery.andWhere('bill_date', '<=', endDate);
    const purchases = await purQuery;

    let itcTaxable = new Decimal(0);
    let itcIgst = new Decimal(0);
    let itcCgst = new Decimal(0);
    let itcSgst = new Decimal(0);

    const purchaseIds = purchases.map((p) => p.id);
    if (purchaseIds.length > 0) {
      const pItems = await this.db('purchase_invoice_items').whereIn('purchase_invoice_id', purchaseIds);
      for (const pi of pItems) {
        itcTaxable = itcTaxable.add(new Decimal(pi.taxable_value || 0));
        itcIgst = itcIgst.add(new Decimal(pi.igst_amount || 0));
        itcCgst = itcCgst.add(new Decimal(pi.cgst_amount || 0));
        itcSgst = itcSgst.add(new Decimal(pi.sgst_amount || 0));
      }
    }

    const table4 = {
      allOtherItc: {
        taxableValue: itcTaxable.toFixed(2),
        igst: itcIgst.toFixed(2),
        cgst: itcCgst.toFixed(2),
        sgst: itcSgst.toFixed(2),
        cess: '0.00',
      },
      itcReversed: { taxableValue: '0.00', igst: '0.00', cgst: '0.00', sgst: '0.00', cess: '0.00' },
      netItcAvailable: {
        taxableValue: itcTaxable.toFixed(2),
        igst: itcIgst.toFixed(2),
        cgst: itcCgst.toFixed(2),
        sgst: itcSgst.toFixed(2),
        cess: '0.00',
      },
    };

    // 4. Tax Payable vs ITC Offset
    const outIgst = new Decimal(igstVal);
    const outCgst = new Decimal(cgstVal);
    const outSgst = new Decimal(sgstVal);

    const netCashIgst = Decimal.max(0, outIgst.sub(itcIgst));
    const netCashCgst = Decimal.max(0, outCgst.sub(itcCgst));
    const netCashSgst = Decimal.max(0, outSgst.sub(itcSgst));

    return {
      company: gstr1.company,
      period: gstr1.period,
      table31OutwardSupplies: table31,
      table32InterStateUnregistered: table32,
      table4EligibleItc: table4,
      taxPayableVsItc: {
        outwardTaxPayable: {
          igst: outIgst.toFixed(2),
          cgst: outCgst.toFixed(2),
          sgst: outSgst.toFixed(2),
          total: outIgst.add(outCgst).add(outSgst).toFixed(2),
        },
        itcAvailable: {
          igst: itcIgst.toFixed(2),
          cgst: itcCgst.toFixed(2),
          sgst: itcSgst.toFixed(2),
          total: itcIgst.add(itcCgst).add(itcSgst).toFixed(2),
        },
        netTaxPayableInCash: {
          igst: netCashIgst.toFixed(2),
          cgst: netCashCgst.toFixed(2),
          sgst: netCashSgst.toFixed(2),
          total: netCashIgst.add(netCashCgst).add(netCashSgst).toFixed(2),
        },
      },
    };
  }

  /**
   * Generates GSTR-2 Purchase / Inward Supplies Register
   */
  async getTallyGstr2Report(
    companyId: string,
    startDate?: string,
    endDate?: string
  ): Promise<TallyGstr2Report> {
    const company = await this.db('companies').where({ id: companyId }).first();
    let query = this.db('purchase_invoices').where({ company_id: companyId, is_finalized: true });
    if (startDate) query = query.andWhere('bill_date', '>=', startDate);
    if (endDate) query = query.andWhere('bill_date', '<=', endDate);
    const bills = await query.orderBy('bill_date', 'asc');

    const billIds = bills.map((b) => b.id);
    const pItems = billIds.length > 0
      ? await this.db('purchase_invoice_items').whereIn('purchase_invoice_id', billIds)
      : [];

    const itemsByBillId = new Map<string, any[]>();
    for (const it of pItems) {
      const arr = itemsByBillId.get(it.purchase_invoice_id) || [];
      arr.push(it);
      itemsByBillId.set(it.purchase_invoice_id, arr);
    }

    const rows: TallyGstr2Row[] = [];
    let totTaxable = new Decimal(0);
    let totIgst = new Decimal(0);
    let totCgst = new Decimal(0);
    let totSgst = new Decimal(0);
    let totBillVal = new Decimal(0);

    for (const b of bills) {
      const items = itemsByBillId.get(b.id) || [];
      const billVal = new Decimal(b.grand_total || 0);
      totBillVal = totBillVal.add(billVal);

      // Group by rate
      const rateMap = new Map<string, { taxable: Decimal; igst: Decimal; cgst: Decimal; sgst: Decimal }>();
      for (const it of items) {
        const rKey = new Decimal(it.gst_rate || 0).toFixed(2);
        const cur = rateMap.get(rKey) || {
          taxable: new Decimal(0),
          igst: new Decimal(0),
          cgst: new Decimal(0),
          sgst: new Decimal(0),
        };
        cur.taxable = cur.taxable.add(new Decimal(it.taxable_value || 0));
        cur.igst = cur.igst.add(new Decimal(it.igst_amount || 0));
        cur.cgst = cur.cgst.add(new Decimal(it.cgst_amount || 0));
        cur.sgst = cur.sgst.add(new Decimal(it.sgst_amount || 0));
        rateMap.set(rKey, cur);
      }

      for (const [rateStr, vals] of rateMap.entries()) {
        totTaxable = totTaxable.add(vals.taxable);
        totIgst = totIgst.add(vals.igst);
        totCgst = totCgst.add(vals.cgst);
        totSgst = totSgst.add(vals.sgst);

        rows.push({
          supplierGstin: b.supplier_gstin || '-',
          supplierName: b.supplier_name || 'Vendor',
          billNumber: b.bill_number,
          billDate: b.bill_date,
          billValue: billVal.toFixed(2),
          placeOfSupply: company?.state || 'Local',
          rate: rateStr,
          taxableValue: vals.taxable.toFixed(2),
          integratedTax: vals.igst.toFixed(2),
          centralTax: vals.cgst.toFixed(2),
          stateTax: vals.sgst.toFixed(2),
          itcEligibility: 'Inputs',
        });
      }
    }

    const totalItc = totIgst.add(totCgst).add(totSgst);

    return {
      company: {
        name: company?.name || 'Company',
        gstin: company?.gstin || '',
        state: company?.state || '',
        stateCode: company?.state_code || '',
      },
      period: { startDate, endDate },
      bills: rows,
      totals: {
        billCount: bills.length,
        taxableValue: totTaxable.toFixed(2),
        integratedTax: totIgst.toFixed(2),
        centralTax: totCgst.toFixed(2),
        stateTax: totSgst.toFixed(2),
        totalItc: totalItc.toFixed(2),
        totalBillValue: totBillVal.toFixed(2),
      },
    };
  }

  /**
   * Builds official multi-sheet Excel workbook for GSTR-1 (matching Tally Prime & GST Offline Tool)
   */
  async exportGstr1ToExcel(companyId: string, startDate?: string, endDate?: string): Promise<ExcelJS.Workbook> {
    const data = await this.getTallyGstr1Report(companyId, startDate, endDate);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Enterprise Management - Tally GST Engine';
    workbook.created = new Date();

    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };
    const headerFont: Partial<ExcelJS.Font> = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };

    // 1. Summary Sheet
    const sumSheet = workbook.addWorksheet('GSTR-1 Summary');
    sumSheet.columns = [
      { header: 'Table No', key: 'tableNo', width: 12 },
      { header: 'Particulars', key: 'title', width: 44 },
      { header: 'Voucher Count', key: 'voucherCount', width: 15 },
      { header: 'Taxable Value (Rs)', key: 'taxableValue', width: 20 },
      { header: 'Integrated Tax (Rs)', key: 'integratedTax', width: 20 },
      { header: 'Central Tax (Rs)', key: 'centralTax', width: 18 },
      { header: 'State Tax (Rs)', key: 'stateTax', width: 18 },
      { header: 'Cess (Rs)', key: 'cess', width: 14 },
      { header: 'Total Tax (Rs)', key: 'totalTax', width: 18 },
      { header: 'Total Value (Rs)', key: 'totalInvoiceValue', width: 20 },
    ];
    sumSheet.getRow(1).fill = headerFill;
    sumSheet.getRow(1).font = headerFont;
    sumSheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

    data.summarySections.forEach((s) => {
      sumSheet.addRow(s);
    });

    const totRow = sumSheet.addRow({
      tableNo: 'TOTAL',
      title: 'Grand Total of Outward Supplies',
      voucherCount: data.totals.voucherCount,
      taxableValue: data.totals.taxableValue,
      integratedTax: data.totals.integratedTax,
      centralTax: data.totals.centralTax,
      stateTax: data.totals.stateTax,
      cess: data.totals.cess,
      totalTax: data.totals.totalTax,
      totalInvoiceValue: data.totals.totalInvoiceValue,
    });
    totRow.font = { bold: true };

    // 2. B2B Sheet
    const b2bSheet = workbook.addWorksheet('b2b');
    b2bSheet.columns = [
      { header: 'GSTIN/UIN of Recipient', key: 'recipientGstin', width: 22 },
      { header: 'Receiver Name', key: 'recipientName', width: 30 },
      { header: 'Invoice Number', key: 'invoiceNumber', width: 18 },
      { header: 'Invoice date', key: 'invoiceDate', width: 15 },
      { header: 'Invoice Value', key: 'invoiceValue', width: 16 },
      { header: 'Place Of Supply', key: 'placeOfSupply', width: 22 },
      { header: 'Reverse Charge', key: 'reverseCharge', width: 15 },
      { header: 'Applicable % of Tax Rate', key: 'appRate', width: 24 },
      { header: 'Invoice Type', key: 'invType', width: 16 },
      { header: 'E-Commerce GSTIN', key: 'ecomGstin', width: 18 },
      { header: 'Rate', key: 'rate', width: 12 },
      { header: 'Taxable Value', key: 'taxableValue', width: 16 },
      { header: 'Cess Amount', key: 'cess', width: 14 },
    ];
    b2bSheet.getRow(1).fill = headerFill;
    b2bSheet.getRow(1).font = headerFont;
    data.b2bList.forEach((row) => {
      b2bSheet.addRow({
        recipientGstin: row.recipientGstin,
        recipientName: row.recipientName,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate,
        invoiceValue: parseFloat(row.invoiceValue),
        placeOfSupply: row.placeOfSupply,
        reverseCharge: row.reverseCharge,
        appRate: '',
        invType: 'Regular',
        ecomGstin: '',
        rate: parseFloat(row.rate),
        taxableValue: parseFloat(row.taxableValue),
        cess: parseFloat(row.cess || '0'),
      });
    });

    // 3. B2CL Sheet
    const b2clSheet = workbook.addWorksheet('b2cl');
    b2clSheet.columns = [
      { header: 'Invoice Number', key: 'invoiceNumber', width: 18 },
      { header: 'Invoice date', key: 'invoiceDate', width: 15 },
      { header: 'Invoice Value', key: 'invoiceValue', width: 16 },
      { header: 'Place Of Supply', key: 'placeOfSupply', width: 22 },
      { header: 'Applicable % of Tax Rate', key: 'appRate', width: 24 },
      { header: 'Rate', key: 'rate', width: 12 },
      { header: 'Taxable Value', key: 'taxableValue', width: 16 },
      { header: 'Cess Amount', key: 'cess', width: 14 },
      { header: 'E-Commerce GSTIN', key: 'ecomGstin', width: 18 },
    ];
    b2clSheet.getRow(1).fill = headerFill;
    b2clSheet.getRow(1).font = headerFont;
    data.b2clList.forEach((row) => {
      b2clSheet.addRow({
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate,
        invoiceValue: parseFloat(row.invoiceValue),
        placeOfSupply: row.placeOfSupply,
        appRate: '',
        rate: parseFloat(row.rate),
        taxableValue: parseFloat(row.taxableValue),
        cess: parseFloat(row.cess || '0'),
        ecomGstin: '',
      });
    });

    // 4. B2CS Sheet
    const b2csSheet = workbook.addWorksheet('b2cs');
    b2csSheet.columns = [
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Place Of Supply', key: 'placeOfSupply', width: 22 },
      { header: 'Applicable % of Tax Rate', key: 'appRate', width: 24 },
      { header: 'Rate', key: 'rate', width: 12 },
      { header: 'Taxable Value', key: 'taxableValue', width: 16 },
      { header: 'Cess Amount', key: 'cess', width: 14 },
      { header: 'E-Commerce GSTIN', key: 'ecomGstin', width: 18 },
    ];
    b2csSheet.getRow(1).fill = headerFill;
    b2csSheet.getRow(1).font = headerFont;
    data.b2csList.forEach((row) => {
      b2csSheet.addRow({
        type: 'OE',
        placeOfSupply: row.placeOfSupply,
        appRate: '',
        rate: parseFloat(row.rate),
        taxableValue: parseFloat(row.taxableValue),
        cess: parseFloat(row.cess || '0'),
        ecomGstin: '',
      });
    });

    // 5. HSN Sheet
    const hsnSheet = workbook.addWorksheet('hsn');
    hsnSheet.columns = [
      { header: 'HSN', key: 'hsn_sac', width: 16 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'UQC', key: 'uqc', width: 12 },
      { header: 'Total Quantity', key: 'total_quantity', width: 16 },
      { header: 'Total Value', key: 'total_value', width: 16 },
      { header: 'Taxable Value', key: 'taxable_value', width: 16 },
      { header: 'Integrated Tax Amount', key: 'igst_amount', width: 22 },
      { header: 'Central Tax Amount', key: 'cgst_amount', width: 20 },
      { header: 'State/UT Tax Amount', key: 'sgst_amount', width: 20 },
      { header: 'Cess Amount', key: 'cess_amount', width: 14 },
    ];
    hsnSheet.getRow(1).fill = headerFill;
    hsnSheet.getRow(1).font = headerFont;
    data.hsnSummary.forEach((row) => {
      hsnSheet.addRow({
        hsn_sac: row.hsn_sac,
        description: row.description || '',
        uqc: row.uqc,
        total_quantity: parseFloat(row.total_quantity),
        total_value: parseFloat(row.total_value),
        taxable_value: parseFloat(row.taxable_value),
        igst_amount: parseFloat(row.igst_amount),
        cgst_amount: parseFloat(row.cgst_amount),
        sgst_amount: parseFloat(row.sgst_amount),
        cess_amount: 0,
      });
    });

    // 6. Docs Sheet
    const docsSheet = workbook.addWorksheet('docs');
    docsSheet.columns = [
      { header: 'Nature of Document', key: 'natureOfDoc', width: 32 },
      { header: 'Sr. No. From', key: 'srNoFrom', width: 18 },
      { header: 'Sr. No. To', key: 'srNoTo', width: 18 },
      { header: 'Total Number', key: 'totalNumber', width: 16 },
      { header: 'Cancelled', key: 'cancelled', width: 14 },
      { header: 'Net Issued', key: 'netIssued', width: 14 },
    ];
    docsSheet.getRow(1).fill = headerFill;
    docsSheet.getRow(1).font = headerFont;
    data.docSummary.forEach((row) => {
      docsSheet.addRow(row);
    });

    return workbook;
  }

  /**
   * Generates JSON file matching official GST Portal GSTR-1 schema
   */
  async exportGstr1ToJson(companyId: string, startDate?: string, endDate?: string): Promise<any> {
    const report = await this.getTallyGstr1Report(companyId, startDate, endDate);
    const dateForFp = startDate ? new Date(startDate) : new Date();
    const mm = String(dateForFp.getMonth() + 1).padStart(2, '0');
    const yyyy = String(dateForFp.getFullYear());
    const fp = `${mm}${yyyy}`;

    const b2bByGstin = new Map<string, any[]>();
    for (const b of report.b2bList) {
      const arr = b2bByGstin.get(b.recipientGstin) || [];
      arr.push(b);
      b2bByGstin.set(b.recipientGstin, arr);
    }

    const b2bJson: any[] = [];
    for (const [ctin, rows] of b2bByGstin.entries()) {
      const invMap = new Map<string, any[]>();
      for (const r of rows) {
        const arr = invMap.get(r.invoiceNumber) || [];
        arr.push(r);
        invMap.set(r.invoiceNumber, arr);
      }
      const invList: any[] = [];
      for (const [inum, irows] of invMap.entries()) {
        const first = irows[0];
        invList.push({
          inum,
          idt: first.invoiceDate,
          val: parseFloat(first.invoiceValue),
          pos: first.placeOfSupply.substring(0, 2),
          rchrg: first.reverseCharge,
          inv_typ: 'R',
          itms: irows.map((ir, num) => ({
            num: num + 1,
            itm_det: {
              rt: parseFloat(ir.rate),
              txval: parseFloat(ir.taxableValue),
              iamt: parseFloat(ir.integratedTax),
              camt: parseFloat(ir.centralTax),
              samt: parseFloat(ir.stateTax),
              csamt: parseFloat(ir.cess || '0'),
            },
          })),
        });
      }
      b2bJson.push({
        ctin,
        inv: invList,
      });
    }

    return {
      gstin: report.company.gstin || '',
      fp,
      cur_gt: parseFloat(report.totals.totalInvoiceValue),
      gt: parseFloat(report.totals.totalInvoiceValue),
      b2b: b2bJson,
      b2cl: report.b2clList.map((l) => ({
        pos: l.placeOfSupply.substring(0, 2),
        inv: [
          {
            inum: l.invoiceNumber,
            idt: l.invoiceDate,
            val: parseFloat(l.invoiceValue),
            itms: [
              {
                num: 1,
                itm_det: {
                  rt: parseFloat(l.rate),
                  txval: parseFloat(l.taxableValue),
                  iamt: parseFloat(l.integratedTax),
                  csamt: parseFloat(l.cess || '0'),
                },
              },
            ],
          },
        ],
      })),
      b2cs: report.b2csList.map((s) => ({
        sply_ty: parseFloat(s.integratedTax) > 0 ? 'INTER' : 'INTRA',
        pos: s.placeOfSupply.substring(0, 2),
        typ: 'OE',
        rt: parseFloat(s.rate),
        txval: parseFloat(s.taxableValue),
        iamt: parseFloat(s.integratedTax),
        camt: parseFloat(s.centralTax),
        samt: parseFloat(s.stateTax),
        csamt: parseFloat(s.cess || '0'),
      })),
      hsn: {
        data: report.hsnSummary.map((h, num) => ({
          num: num + 1,
          hsn_sc: h.hsn_sac,
          desc: h.description,
          uqc: h.uqc,
          qty: parseFloat(h.total_quantity),
          val: parseFloat(h.total_value),
          txval: parseFloat(h.taxable_value),
          iamt: parseFloat(h.igst_amount),
          camt: parseFloat(h.cgst_amount),
          samt: parseFloat(h.sgst_amount),
          csamt: 0,
        })),
      },
      doc_issue: {
        doc_det: report.docSummary.map((d) => ({
          doc_num: 1,
          doc_typ: d.natureOfDoc,
          from: d.srNoFrom,
          to: d.srNoTo,
          totnum: d.totalNumber,
          canc: d.cancelled,
          net_issue: d.netIssued,
        })),
      },
    };
  }
}
