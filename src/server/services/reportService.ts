// src/server/services/reportService.ts - Real-Time Financial Dashboard & GST Reporting Engine
import { Knex } from 'knex';
import Decimal from 'decimal.js';
import { generateHsnSummary, HsnSummaryRow } from '../finance/gstEngine';
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
}
