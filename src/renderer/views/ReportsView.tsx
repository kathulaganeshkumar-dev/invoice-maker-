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
} from 'lucide-react';

interface Props {
  companyId: string;
}

export const ReportsView: React.FC<Props> = ({ companyId }) => {
  const [reportType, setReportType] = useState<'gst' | 'sales'>('gst');
  const [gstReport, setGstReport] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (companyId) {
      loadReport();
    }
  }, [companyId, reportType]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const data = await api.getGstSalesReport(companyId);
      setGstReport(data);
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
          <thead className="bg-stone-50/80 dark:bg-stone-900/60 border-b border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 font-medium text-xs">
            <tr>
              <th className="py-2.5 px-3">HSN / SAC</th>
              <th className="py-2.5 px-3">UQC (Unit)</th>
              <th className="py-2.5 px-3 text-right">Total qty</th>
              <th className="py-2.5 px-3 text-right">Taxable value</th>
              <th className="py-2.5 px-3 text-right">CGST</th>
              <th className="py-2.5 px-3 text-right">SGST</th>
              <th className="py-2.5 px-3 text-right">IGST</th>
              <th className="py-2.5 px-3 text-right">Total tax</th>
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
    </div>
  );
};
