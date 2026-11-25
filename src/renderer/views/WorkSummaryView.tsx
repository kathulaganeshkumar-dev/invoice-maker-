// src/renderer/views/WorkSummaryView.tsx - Office Staff & Workstation Work Summary
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import Decimal from 'decimal.js';
import {
  Monitor,
  FileSpreadsheet,
  Receipt,
  ShoppingCart,
  CreditCard,
  Layers,
  Users,
} from 'lucide-react';

interface Props {
  companyId: string;
}

export const WorkSummaryView: React.FC<Props> = ({ companyId }) => {
  const [staffActivity, setStaffActivity] = useState<any[]>([]);
  const [activityRange, setActivityRange] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [loading, setLoading] = useState<boolean>(true);

  const getActivityDateBounds = (range: 'today' | 'week' | 'month' | 'all'): { start?: string; end?: string } => {
    if (range === 'all') return {};
    const now = new Date();
    const toIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = toIso(now);
    if (range === 'today') return { start: today, end: today };
    if (range === 'week') {
      const s = new Date(now);
      const day = s.getDay();
      s.setDate(s.getDate() - (day === 0 ? 6 : day - 1));
      return { start: toIso(s), end: today };
    }
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toIso(startMonth), end: toIso(endMonth) };
  };

  const loadDataSilently = async () => {
    try {
      const { start, end } = getActivityDateBounds(activityRange);
      const staffData = await api.getStaffActivityReport(companyId, start, end).catch(() => []);
      setStaffActivity(Array.isArray(staffData) ? staffData : []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (companyId) {
      loadData();
    }
  }, [companyId, activityRange]);

  useEffect(() => {
    if (!companyId) return;

    const handleSync = () => {
      loadDataSilently();
    };

    const syncTimer = setInterval(() => {
      loadDataSilently();
    }, 4000);

    window.addEventListener('eim-data-changed', handleSync);
    window.addEventListener('eim-data-sync', handleSync);
    window.addEventListener('focus', handleSync);

    return () => {
      clearInterval(syncTimer);
      window.removeEventListener('eim-data-changed', handleSync);
      window.removeEventListener('eim-data-sync', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, [companyId, activityRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { start, end } = getActivityDateBounds(activityRange);
      const staffData = await api.getStaffActivityReport(companyId, start, end).catch(() => []);
      setStaffActivity(Array.isArray(staffData) ? staffData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Compute aggregate totals
  const totals = staffActivity.reduce(
    (acc, row) => {
      acc.invoices_count += Number(row.invoices_count || 0);
      acc.invoices_total = acc.invoices_total.add(new Decimal(row.invoices_total || 0));
      acc.quotations_count += Number(row.quotations_count || 0);
      acc.purchases_count += Number(row.purchases_count || 0);
      acc.payments_count +=
        Number(row.customer_payments_count || 0) + Number(row.supplier_payments_count || 0);
      acc.total_documents += Number(row.total_documents || 0);
      return acc;
    },
    {
      invoices_count: 0,
      invoices_total: new Decimal(0),
      quotations_count: 0,
      purchases_count: 0,
      payments_count: 0,
      total_documents: 0,
    }
  );

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
            Office Staff &amp; Workstation Work Summary
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tracks how many invoices, quotations, purchase bills, and payments each office computer created.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Range Pills */}
          <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
                { id: 'all', label: 'All Time' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setActivityRange(opt.id)}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activityRange === opt.id
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold border border-slate-400 dark:border-slate-500 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Workstations</span>
          </div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
            {staffActivity.length} Active
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Invoices</span>
          </div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
            {totals.invoices_count}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            {formatIndianCurrency(totals.invoices_total.toFixed(2))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Quotations</span>
          </div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
            {totals.quotations_count}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Purchase Bills</span>
          </div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
            {totals.purchases_count}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Payments</span>
          </div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
            {totals.payments_count}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-brand-200 dark:border-brand-800 shadow-xs bg-brand-50/20">
          <div className="flex items-center justify-between text-brand-700 dark:text-brand-300">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Docs</span>
          </div>
          <div className="text-lg font-extrabold text-brand-700 dark:text-brand-400 mt-1">
            {totals.total_documents}
          </div>
        </div>
      </div>

      {/* Detailed Work Summary Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Staff PC / Workstation</th>
              <th className="py-3 px-4 text-right">Invoices</th>
              <th className="py-3 px-4 text-right">Invoice Value</th>
              <th className="py-3 px-4 text-right">Quotations</th>
              <th className="py-3 px-4 text-right">Purchase Bills</th>
              <th className="py-3 px-4 text-right">Payments (AR/AP)</th>
              <th className="py-3 px-4 text-right font-bold text-slate-800 dark:text-slate-100">Total Docs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  Loading staff activity...
                </td>
              </tr>
            ) : staffActivity.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No staff workstation activity recorded in this period yet.
                </td>
              </tr>
            ) : (
              staffActivity.map((row) => (
                <tr key={row.device_id}>
                  <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                    {row.device_name}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-700 dark:text-slate-300">
                    {row.invoices_count}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                    {formatIndianCurrency(row.invoices_total || 0)}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-700 dark:text-slate-300">
                    {row.quotations_count}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-700 dark:text-slate-300">
                    {row.purchases_count}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-700 dark:text-slate-300">
                    {(row.customer_payments_count || 0) + (row.supplier_payments_count || 0)}
                  </td>
                  <td className="py-3 px-4 text-right font-extrabold text-brand-600 dark:text-brand-400">
                    {row.total_documents}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {staffActivity.length > 0 && (
            <tfoot className="bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white">
              <tr>
                <td className="py-3 px-4">All Staff Total ({staffActivity.length} PCs)</td>
                <td className="py-3 px-4 text-right">{totals.invoices_count}</td>
                <td className="py-3 px-4 text-right font-mono">{formatIndianCurrency(totals.invoices_total.toFixed(2))}</td>
                <td className="py-3 px-4 text-right">{totals.quotations_count}</td>
                <td className="py-3 px-4 text-right">{totals.purchases_count}</td>
                <td className="py-3 px-4 text-right">{totals.payments_count}</td>
                <td className="py-3 px-4 text-right font-extrabold text-brand-600 dark:text-brand-400">
                  {totals.total_documents}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};
