// src/renderer/views/ReportsView.tsx - Real-time Business & Indian GST Reports Engine
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import {
  BarChart3,
  Calendar,
  FileSpreadsheet,
  Download,
  Building,
  RefreshCw,
  Monitor,
} from 'lucide-react';

interface Props {
  companyId: string;
}

export const ReportsView: React.FC<Props> = ({ companyId }) => {
  const [reportType, setReportType] = useState<'gst' | 'sales'>('gst');
  const [gstReport, setGstReport] = useState<any>(null);
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

  useEffect(() => {
    if (companyId) {
      loadReport();
    }
  }, [companyId, reportType, activityRange]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const { start, end } = getActivityDateBounds(activityRange);
      const [gstData, staffData] = await Promise.all([
        api.getGstSalesReport(companyId),
        api.getStaffActivityReport(companyId, start, end).catch(() => []),
      ]);
      setGstReport(gstData);
      setStaffActivity(Array.isArray(staffData) ? staffData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-5 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-brand-600" />
            <span>Business Intelligence & Indian GST Reports</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            GSTR-1, GSTR-3B supporting summaries, tax breakdown, and HSN/SAC table
          </p>
        </div>

        <button
          type="button"
          onClick={loadReport}
          className="inline-flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Tax Breakdown Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-[11px] font-semibold text-slate-500">Total Taxable Value</div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
            {formatIndianCurrency(gstReport?.taxableValue || 0)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-[11px] font-semibold text-slate-500">Central Tax (CGST)</div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
            {formatIndianCurrency(gstReport?.cgst || 0)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-[11px] font-semibold text-slate-500">State / UT Tax (SGST)</div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
            {formatIndianCurrency(gstReport?.sgst || 0)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="text-[11px] font-semibold text-slate-500">Integrated Tax (IGST)</div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
            {formatIndianCurrency(gstReport?.igst || 0)}
          </div>
        </div>
        <div className="bg-brand-50 dark:bg-brand-950/40 p-4 rounded-xl border border-brand-200 dark:border-brand-800">
          <div className="text-[11px] font-bold text-brand-700 dark:text-brand-300">Total GST Liability</div>
          <div className="text-lg font-extrabold text-brand-900 dark:text-brand-100 mt-1">
            {formatIndianCurrency(gstReport?.totalTax || 0)}
          </div>
        </div>
      </div>

      {/* HSN / SAC Summary Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm space-y-3 p-4">
        <div className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center justify-between">
          <span>HSN / SAC Summary (GSTR-1 Table 12)</span>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-2.5 px-3">HSN / SAC</th>
              <th className="py-2.5 px-3">UQC (Unit)</th>
              <th className="py-2.5 px-3 text-right">Total Qty</th>
              <th className="py-2.5 px-3 text-right">Taxable Value</th>
              <th className="py-2.5 px-3 text-right">CGST</th>
              <th className="py-2.5 px-3 text-right">SGST</th>
              <th className="py-2.5 px-3 text-right">IGST</th>
              <th className="py-2.5 px-3 text-right">Total Tax Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {gstReport?.hsnSummary?.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-400">
                  No finalized tax invoices in this period.
                </td>
              </tr>
            ) : (
              gstReport?.hsnSummary?.map((h: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">{h.hsn_sac}</td>
                  <td className="py-2.5 px-3">{h.uqc}</td>
                  <td className="py-2.5 px-3 text-right font-medium">{h.total_quantity}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{formatIndianCurrency(h.taxable_value)}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{formatIndianCurrency(h.central_tax)}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{formatIndianCurrency(h.state_ut_tax)}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{formatIndianCurrency(h.integrated_tax)}</td>
                  <td className="py-2.5 px-3 text-right font-bold font-mono text-slate-900 dark:text-white">
                    {formatIndianCurrency(h.total_tax)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MD Oversight: Office Staff & Workstation Document Activity */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
              <Monitor className="w-4 h-4 text-brand-600" />
              <span>Office Staff &amp; Workstation Work Summary (MD View)</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Tracks how many invoices, quotations, purchase bills, and payments each office computer created.
            </p>
          </div>
          <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg text-[11px] font-semibold">
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
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  activityRange === opt.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-2.5 px-3">Staff PC / Workstation</th>
              <th className="py-2.5 px-3 text-right">Invoices</th>
              <th className="py-2.5 px-3 text-right">Invoice Value</th>
              <th className="py-2.5 px-3 text-right">Quotations</th>
              <th className="py-2.5 px-3 text-right">Purchase Bills</th>
              <th className="py-2.5 px-3 text-right">Payments (AR/AP)</th>
              <th className="py-2.5 px-3 text-right">Total Docs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {staffActivity.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  No staff workstation activity recorded in this period yet.
                </td>
              </tr>
            ) : (
              staffActivity.map((row) => (
                <tr key={row.device_id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-100">{row.device_name}</td>
                  <td className="py-2.5 px-3 text-right font-semibold">{row.invoices_count}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{formatIndianCurrency(row.invoices_total || 0)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold">{row.quotations_count}</td>
                  <td className="py-2.5 px-3 text-right font-semibold">{row.purchases_count}</td>
                  <td className="py-2.5 px-3 text-right font-semibold">
                    {(row.customer_payments_count || 0) + (row.supplier_payments_count || 0)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-extrabold text-brand-700 dark:text-brand-400">
                    {row.total_documents}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
