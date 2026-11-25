// src/server/services/activityService.ts - Centralized Software Activity & Audit Trail Service
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { SoftwareActivityItem, ActivitySummary } from '../../shared/types';
import { broadcastDataChange } from '../events';
import Decimal from 'decimal.js';

function parseTimestamp(isoString: string): { date: string; time: string } {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { date: '', time: '' };
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const time = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
    return { date, time };
  } catch {
    return { date: '', time: '' };
  }
}

export class ActivityService {
  constructor(private db: Knex) {}

  /**
   * Records an explicit activity entry into the audit_logs table and broadcasts via SSE.
   */
  async recordActivity(input: {
    companyId: string;
    entityType: string;
    entityId: string;
    action: string;
    details: string;
    staffName?: string | null;
    deviceName?: string | null;
    deviceId?: string | null;
    module?: string | null;
    documentNumber?: string | null;
    partyName?: string | null;
    amount?: string | number | null;
  }): Promise<void> {
    try {
      const now = new Date().toISOString();
      const id = uuidv4();
      const staff = input.staffName?.trim() || 'Admin / Owner';
      const moduleName = input.module || input.entityType;
      const amtStr = input.amount !== undefined && input.amount !== null ? String(input.amount) : null;

      await this.db('audit_logs').insert({
        id,
        company_id: input.companyId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        action: input.action,
        details: input.details,
        timestamp: now,
        staff_name: staff,
        device_name: input.deviceName || null,
        device_id: input.deviceId || null,
        module: moduleName,
        document_number: input.documentNumber || null,
        party_name: input.partyName || null,
        amount: amtStr,
      });

      broadcastDataChange('activity', 'create', {
        id,
        company_id: input.companyId,
        action: input.action,
        module: moduleName,
        staff_name: staff,
        document_number: input.documentNumber,
        timestamp: now,
      });
    } catch (err) {
      console.error('Failed to record activity log:', err);
    }
  }

  /**
   * Fetches the complete activity feed for the company.
   * Merges audit_logs table entries with historical creations from invoices, quotations,
   * payments, and purchases so that past records prior to this update are fully visible.
   */
  async getActivityFeed(
    companyId: string,
    options?: {
      staffName?: string;
      module?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
      limit?: number;
    }
  ): Promise<SoftwareActivityItem[]> {
    const limit = options?.limit || 500;

    // 1. Fetch raw audit logs
    let auditQ = this.db('audit_logs').where({ company_id: companyId });
    if (options?.startDate) {
      auditQ = auditQ.andWhere('timestamp', '>=', `${options.startDate}T00:00:00.000Z`);
    }
    if (options?.endDate) {
      auditQ = auditQ.andWhere('timestamp', '<=', `${options.endDate}T23:59:59.999Z`);
    }
    const rawAuditLogs = await auditQ.orderBy('timestamp', 'desc').limit(limit);

    // Track existing entity creations in audit logs to prevent double-counting
    const recordedEvents = new Set<string>();
    const items: SoftwareActivityItem[] = [];

    for (const log of rawAuditLogs) {
      const { date, time } = parseTimestamp(log.timestamp);
      recordedEvents.add(`${log.entity_type}:${log.entity_id}:${log.action}`);

      let title = `${log.action} ${log.entity_type}`;
      if (log.document_number) {
        title = `${log.action === 'CREATE' ? 'Created' : log.action} ${log.entity_type} ${log.document_number}`;
      } else if (log.action === 'CREATE') {
        title = `Created ${log.entity_type}`;
      } else if (log.action === 'FINALIZE') {
        title = `Finalized ${log.entity_type}`;
      } else if (log.action === 'CANCEL') {
        title = `Cancelled ${log.entity_type}`;
      } else if (log.action === 'DELETE') {
        title = `Deleted ${log.entity_type}`;
      } else if (log.action === 'CONVERT') {
        title = `Converted Quotation to Invoice`;
      } else if (log.action === 'UPDATE_CREATOR') {
        title = `Reassigned Creator`;
      }

      items.push({
        id: log.id,
        timestamp: log.timestamp,
        date,
        time,
        staff_name: log.staff_name || 'Admin / Owner',
        device_name: log.device_name || null,
        device_id: log.device_id || null,
        module: (log.module || log.entity_type || 'SYSTEM').toUpperCase(),
        action: log.action,
        title,
        details: log.details,
        entity_id: log.entity_id,
        document_number: log.document_number || undefined,
        party_name: log.party_name || undefined,
        amount: log.amount || undefined,
      });
    }

    // 2. Synthesize Historical Invoices (if not already recorded in audit logs)
    let invQ = this.db('invoices').where({ company_id: companyId });
    if (options?.startDate) invQ = invQ.andWhere('invoice_date', '>=', options.startDate);
    if (options?.endDate) invQ = invQ.andWhere('invoice_date', '<=', options.endDate);
    const invoices = await invQ.select(
      'id',
      'invoice_number',
      'customer_name',
      'document_type',
      'grand_total',
      'status',
      'created_at',
      'invoice_date',
      'created_by_device_name',
      'created_by_device_id'
    ).limit(limit);

    for (const inv of invoices) {
      if (!recordedEvents.has(`INVOICE:${inv.id}:CREATE`)) {
        const ts = inv.created_at || (inv.invoice_date ? `${inv.invoice_date}T09:00:00.000Z` : new Date().toISOString());
        const { date, time } = parseTimestamp(ts);
        const staff = inv.created_by_device_name || 'Admin / Owner';
        items.push({
          id: `hist-inv-${inv.id}`,
          timestamp: ts,
          date,
          time,
          staff_name: staff,
          device_id: inv.created_by_device_id || null,
          device_name: staff,
          module: 'INVOICE',
          action: 'CREATE',
          title: `Created Sales Invoice ${inv.invoice_number}`,
          details: `Customer: ${inv.customer_name} • Type: ${inv.document_type || 'Tax Invoice'} • Status: ${inv.status} • Total: ₹ ${Number(inv.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          entity_id: inv.id,
          document_number: inv.invoice_number,
          party_name: inv.customer_name,
          amount: inv.grand_total,
        });
      }
    }

    // 3. Synthesize Historical Quotations
    let quoQ = this.db('quotations').where({ company_id: companyId });
    if (options?.startDate) quoQ = quoQ.andWhere('quotation_date', '>=', options.startDate);
    if (options?.endDate) quoQ = quoQ.andWhere('quotation_date', '<=', options.endDate);
    const quotations = await quoQ.select(
      'id',
      'quotation_number',
      'customer_name',
      'grand_total',
      'status',
      'created_at',
      'quotation_date',
      'valid_until_date',
      'created_by_device_name',
      'created_by_device_id'
    ).limit(limit);

    for (const q of quotations) {
      if (!recordedEvents.has(`QUOTATION:${q.id}:CREATE`)) {
        const ts = q.created_at || (q.quotation_date ? `${q.quotation_date}T09:00:00.000Z` : new Date().toISOString());
        const { date, time } = parseTimestamp(ts);
        const staff = q.created_by_device_name || 'Admin / Owner';
        items.push({
          id: `hist-quo-${q.id}`,
          timestamp: ts,
          date,
          time,
          staff_name: staff,
          device_id: q.created_by_device_id || null,
          device_name: staff,
          module: 'QUOTATION',
          action: 'CREATE',
          title: `Created Quotation ${q.quotation_number}`,
          details: `Customer: ${q.customer_name} • Status: ${q.status} • Valid Until: ${q.valid_until_date || 'N/A'} • Total: ₹ ${Number(q.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          entity_id: q.id,
          document_number: q.quotation_number,
          party_name: q.customer_name,
          amount: q.grand_total,
        });
      }
    }

    // 4. Synthesize Historical Customer Payments
    let cpQ = this.db('customer_payments').where({ company_id: companyId });
    if (options?.startDate) cpQ = cpQ.andWhere('payment_date', '>=', options.startDate);
    if (options?.endDate) cpQ = cpQ.andWhere('payment_date', '<=', options.endDate);
    const custPays = await cpQ.select(
      'id',
      'payment_number',
      'customer_name',
      'amount',
      'payment_method',
      'payment_date',
      'created_at',
      'reference_number',
      'created_by_device_name',
      'created_by_device_id'
    ).limit(limit);

    for (const cp of custPays) {
      if (!recordedEvents.has(`PAYMENT:${cp.id}:CREATE`)) {
        const ts = cp.created_at || (cp.payment_date ? `${cp.payment_date}T09:00:00.000Z` : new Date().toISOString());
        const { date, time } = parseTimestamp(ts);
        const staff = cp.created_by_device_name || 'Admin / Owner';
        items.push({
          id: `hist-cp-${cp.id}`,
          timestamp: ts,
          date,
          time,
          staff_name: staff,
          device_id: cp.created_by_device_id || null,
          device_name: staff,
          module: 'PAYMENT',
          action: 'PAYMENT',
          title: `Recorded Customer Receipt ${cp.payment_number || ''}`,
          details: `Party: ${cp.customer_name || 'Customer'} • Mode: ${cp.payment_method || 'CASH'}${cp.reference_number ? ` • Ref: ${cp.reference_number}` : ''} • Amount: ₹ ${Number(cp.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          entity_id: cp.id,
          document_number: cp.payment_number,
          party_name: cp.customer_name,
          amount: cp.amount,
        });
      }
    }

    // 5. Synthesize Historical Supplier Payments
    let spQ = this.db('supplier_payments').where({ company_id: companyId });
    if (options?.startDate) spQ = spQ.andWhere('payment_date', '>=', options.startDate);
    if (options?.endDate) spQ = spQ.andWhere('payment_date', '<=', options.endDate);
    const supPays = await spQ.select(
      'id',
      'payment_number',
      'supplier_name',
      'amount',
      'payment_method',
      'payment_date',
      'created_at',
      'created_by_device_name',
      'created_by_device_id'
    ).limit(limit);

    for (const sp of supPays) {
      if (!recordedEvents.has(`PAYMENT:${sp.id}:SUPPLIER_PAYMENT`)) {
        const ts = sp.created_at || (sp.payment_date ? `${sp.payment_date}T09:00:00.000Z` : new Date().toISOString());
        const { date, time } = parseTimestamp(ts);
        const staff = sp.created_by_device_name || 'Admin / Owner';
        items.push({
          id: `hist-sp-${sp.id}`,
          timestamp: ts,
          date,
          time,
          staff_name: staff,
          device_id: sp.created_by_device_id || null,
          device_name: staff,
          module: 'PAYMENT',
          action: 'PAYMENT',
          title: `Recorded Supplier Payment ${sp.payment_number || ''}`,
          details: `Supplier: ${sp.supplier_name || 'Vendor'} • Mode: ${sp.payment_method || 'BANK'} • Amount: ₹ ${Number(sp.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          entity_id: sp.id,
          document_number: sp.payment_number,
          party_name: sp.supplier_name,
          amount: sp.amount,
        });
      }
    }

    // 6. Synthesize Historical Purchases
    let purQ = this.db('purchase_invoices').where({ company_id: companyId });
    if (options?.startDate) purQ = purQ.andWhere('bill_date', '>=', options.startDate);
    if (options?.endDate) purQ = purQ.andWhere('bill_date', '<=', options.endDate);
    const purchases = await purQ.select(
      'id',
      'bill_number',
      'supplier_name',
      'grand_total',
      'created_at',
      'bill_date',
      'created_by_device_name',
      'created_by_device_id'
    ).limit(limit);

    for (const pur of purchases) {
      if (!recordedEvents.has(`PURCHASE:${pur.id}:CREATE`)) {
        const ts = pur.created_at || (pur.bill_date ? `${pur.bill_date}T09:00:00.000Z` : new Date().toISOString());
        const { date, time } = parseTimestamp(ts);
        const staff = pur.created_by_device_name || 'Admin / Owner';
        items.push({
          id: `hist-pur-${pur.id}`,
          timestamp: ts,
          date,
          time,
          staff_name: staff,
          device_id: pur.created_by_device_id || null,
          device_name: staff,
          module: 'PURCHASE',
          action: 'CREATE',
          title: `Recorded Purchase Bill ${pur.bill_number}`,
          details: `Supplier: ${pur.supplier_name} • Total: ₹ ${Number(pur.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          entity_id: pur.id,
          document_number: pur.bill_number,
          party_name: pur.supplier_name,
          amount: pur.grand_total,
        });
      }
    }

    // Sort descending by timestamp
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply filtering
    let filtered = items;
    if (options?.staffName && options.staffName.trim()) {
      const term = options.staffName.trim().toLowerCase();
      filtered = filtered.filter((i) => i.staff_name.toLowerCase().includes(term));
    }
    if (options?.module && options.module.trim() && options.module !== 'ALL') {
      const mod = options.module.trim().toUpperCase();
      filtered = filtered.filter((i) => i.module === mod);
    }
    if (options?.startDate) {
      filtered = filtered.filter((i) => i.date >= options.startDate!);
    }
    if (options?.endDate) {
      filtered = filtered.filter((i) => i.date <= options.endDate!);
    }
    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.details.toLowerCase().includes(q) ||
          i.staff_name.toLowerCase().includes(q) ||
          (i.document_number && i.document_number.toLowerCase().includes(q)) ||
          (i.party_name && i.party_name.toLowerCase().includes(q))
      );
    }

    return filtered.slice(0, limit);
  }

  /**
   * Computes today's operational summary metrics for the Activity Dashboard.
   */
  async getActivitySummary(companyId: string): Promise<ActivitySummary> {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const itemsToday = await this.getActivityFeed(companyId, {
      startDate: today,
      endDate: today,
      limit: 1000,
    });

    let invCount = 0;
    let invTotal = new Decimal(0);
    let quoCount = 0;
    let quoTotal = new Decimal(0);
    let payCount = 0;
    let payTotal = new Decimal(0);
    const staffMap = new Map<string, { total_actions: number; invoices_count: number; quotations_count: number }>();

    for (const item of itemsToday) {
      const sName = item.staff_name || 'Admin / Owner';
      let entry = staffMap.get(sName);
      if (!entry) {
        entry = { total_actions: 0, invoices_count: 0, quotations_count: 0 };
        staffMap.set(sName, entry);
      }
      entry.total_actions += 1;

      if (item.module === 'INVOICE' && (item.action === 'CREATE' || item.action === 'FINALIZE')) {
        invCount += 1;
        if (item.amount) invTotal = invTotal.add(new Decimal(item.amount));
        entry.invoices_count += 1;
      } else if (item.module === 'QUOTATION' && item.action === 'CREATE') {
        quoCount += 1;
        if (item.amount) quoTotal = quoTotal.add(new Decimal(item.amount));
        entry.quotations_count += 1;
      } else if (item.module === 'PAYMENT') {
        payCount += 1;
        if (item.amount) payTotal = payTotal.add(new Decimal(item.amount));
      }
    }

    const staffBreakdown = Array.from(staffMap.entries()).map(([staff_name, stats]) => ({
      staff_name,
      total_actions: stats.total_actions,
      invoices_count: stats.invoices_count,
      quotations_count: stats.quotations_count,
    }));

    return {
      total_today: itemsToday.length,
      invoices_today_count: invCount,
      invoices_today_total: invTotal.toFixed(2),
      quotations_today_count: quoCount,
      quotations_today_total: quoTotal.toFixed(2),
      payments_today_count: payCount,
      payments_today_total: payTotal.toFixed(2),
      active_staff_count: staffMap.size,
      staff_breakdown: staffBreakdown,
    };
  }
}
