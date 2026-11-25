// src/renderer/views/ReportsView.tsx - Tally Prime / ERP 9 & GST Portal Compliant Indian GST Returns Engine
import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import {
  FileSpreadsheet,
  Download,
  Printer,
  RefreshCw,
  Building2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  FileText,
  TrendingUp,
  ShieldCheck,
  Layers,
  ArrowRight,
  Filter,
  DollarSign,
} from 'lucide-react';

interface Props {
  companyId: string;
}

type GstReturnType = 'gstr1' | 'gstr3b' | 'gstr2';
type Gstr1SubTab = 'summary' | 'b2b' | 'b2cl' | 'b2cs' | 'hsn' | 'docs';
type PeriodPreset = 'this_month' | 'last_month' | 'this_quarter' | 'full_fy' | 'all_time' | 'custom';

export const ReportsView: React.FC<Props> = ({ companyId }) => {
  const [returnType, setReturnType] = useState<GstReturnType>('gstr1');
  const [gstr1SubTab, setGstr1SubTab] = useState<Gstr1SubTab>('summary');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this_month');

  // Dates
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Data states
  const [gstr1Report, setGstr1Report] = useState<any>(null);
  const [gstr3bReport, setGstr3bReport] = useState<any>(null);
  const [gstr2Report, setGstr2Report] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Compute preset date ranges
  const computePresetDates = (preset: PeriodPreset) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexed

    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'this_month') {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      return { start: toYMD(first), end: toYMD(last) };
    }

    if (preset === 'last_month') {
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      return { start: toYMD(first), end: toYMD(last) };
    }

    if (preset === 'this_quarter') {
      // Indian fiscal quarters: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar
      let qStartM = 0;
      let qEndM = 2;
      let qYear = y;
      if (m >= 3 && m <= 5) {
        qStartM = 3;
        qEndM = 5;
      } else if (m >= 6 && m <= 8) {
        qStartM = 6;
        qEndM = 8;
      } else if (m >= 9 && m <= 11) {
        qStartM = 9;
        qEndM = 11;
      } else {
        qStartM = 0;
        qEndM = 2;
      }
      const first = new Date(qYear, qStartM, 1);
      const last = new Date(qYear, qEndM + 1, 0);
      return { start: toYMD(first), end: toYMD(last) };
    }

    if (preset === 'full_fy') {
      // Indian FY starts April 1st
      const fyStartYear = m >= 3 ? y : y - 1;
      const first = new Date(fyStartYear, 3, 1); // 1 Apr
      const last = new Date(fyStartYear + 1, 2, 31); // 31 Mar
      return { start: toYMD(first), end: toYMD(last) };
    }

    if (preset === 'all_time') {
      return { start: '', end: '' };
    }

    return { start: startDate, end: endDate };
  };

  // Initial load date setup
  useEffect(() => {
    const dates = computePresetDates(periodPreset);
    setStartDate(dates.start);
    setEndDate(dates.end);
  }, [periodPreset]);

  // Load report data whenever company, returnType, or dates change
  const loadReports = async (showSpinner = true) => {
    if (!companyId) return;
    if (showSpinner) setLoading(true);
    else setRefreshing(true);

    try {
      if (returnType === 'gstr1') {
        const data = await api.getTallyGstr1Report(companyId, startDate || undefined, endDate || undefined);
        setGstr1Report(data);
      } else if (returnType === 'gstr3b') {
        const data = await api.getTallyGstr3BReport(companyId, startDate || undefined, endDate || undefined);
        setGstr3bReport(data);
      } else if (returnType === 'gstr2') {
        const data = await api.getTallyGstr2Report(companyId, startDate || undefined, endDate || undefined);
        setGstr2Report(data);
      }
    } catch (err) {
      console.error('Failed to load GST reports:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadReports(true);
  }, [companyId, returnType, startDate, endDate]);

  // Reactivity & live sync
  useEffect(() => {
    if (!companyId) return;
    const handleSync = () => {
      loadReports(false);
    };

    window.addEventListener('eim-data-changed', handleSync);
    window.addEventListener('eim-data-sync', handleSync);

    return () => {
      window.removeEventListener('eim-data-changed', handleSync);
      window.removeEventListener('eim-data-sync', handleSync);
    };
  }, [companyId, returnType, startDate, endDate]);

  // Excel / JSON Export URLs
  const excelExportUrl = useMemo(() => {
    return api.getGstr1ExcelUrl(companyId, startDate || undefined, endDate || undefined);
  }, [companyId, startDate, endDate]);

  const jsonExportUrl = useMemo(() => {
    return api.getGstr1JsonUrl(companyId, startDate || undefined, endDate || undefined);
  }, [companyId, startDate, endDate]);

  const handlePrint = () => {
    window.print();
  };

  const companyInfo = gstr1Report?.company || gstr3bReport?.company || gstr2Report?.company;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto text-slate-800 dark:text-slate-100">
      {/* Top Banner: Tally Prime Style Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              Tally Prime Compliant
            </span>
            <span className="text-xs text-slate-400 font-medium">Offline GST Returns Engine</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight mt-1 text-slate-900 dark:text-white flex items-center gap-2">
            GST Returns &amp; Tax Intelligence
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-3">
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              {companyInfo?.name || 'Selected Company'}
            </span>
            <span>•</span>
            <span>GSTIN: <strong className="font-mono text-slate-800 dark:text-slate-200">{companyInfo?.gstin || 'Unregistered / Not Provided'}</strong></span>
            <span>•</span>
            <span>State: <strong>{companyInfo?.state || 'Local'} ({companyInfo?.stateCode || '--'})</strong></span>
          </p>
        </div>

        {/* Global Export & Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadReports(false)}
            disabled={refreshing}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors shadow-sm"
            title="Recalculate report from live database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-brand-600' : 'text-slate-500'}`} />
            <span>{refreshing ? 'Refreshing...' : 'Recalculate'}</span>
          </button>

          <a
            href={excelExportUrl}
            download
            className="px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition-colors shadow-sm"
            title="Export official multi-sheet Excel file (b2b, b2cl, b2cs, hsn, docs)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export to Excel</span>
          </a>

          <a
            href={jsonExportUrl}
            download
            className="px-3 py-2 text-xs font-bold rounded-lg bg-slate-900 hover:bg-black text-white dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors shadow-sm border border-slate-700"
            title="Download JSON schema ready for upload on GST Portal (gst.gov.in)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Portal JSON</span>
          </a>

          <button
            onClick={handlePrint}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors shadow-sm text-slate-700 dark:text-slate-300"
            title="Print Summary Return"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Date & Period Controls Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        {/* Preset Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1 mr-1">
            <Calendar className="w-3.5 h-3.5" /> Period:
          </span>
          {[
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'this_quarter', label: 'This Quarter' },
            { id: 'full_fy', label: 'Full FY' },
            { id: 'all_time', label: 'All Time' },
            { id: 'custom', label: 'Custom' },
          ].map((chip) => (
            <button
              key={chip.id}
              onClick={() => setPeriodPreset(chip.id as PeriodPreset)}
              className={`px-2.5 py-1 rounded-md font-semibold text-xs transition-colors ${
                periodPreset === chip.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Date Pickers */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-slate-400">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-400">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>
      </div>

      {/* Main Return Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 sm:gap-2">
        <button
          onClick={() => setReturnType('gstr1')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${
            returnType === 'gstr1'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-950/20 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>GSTR-1 (Outward Supplies)</span>
        </button>

        <button
          onClick={() => setReturnType('gstr3b')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${
            returnType === 'gstr3b'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-950/20 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>GSTR-3B (Summary Return &amp; ITC)</span>
        </button>

        <button
          onClick={() => setReturnType('gstr2')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${
            returnType === 'gstr2'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-950/20 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>GSTR-2 (Inward Purchase ITC)</span>
        </button>
      </div>

      {/* Loading state indicator */}
      {loading && (
        <div className="py-16 text-center text-slate-400 space-y-2">
          <RefreshCw className="w-8 h-8 mx-auto animate-spin text-brand-600" />
          <p className="text-sm font-medium">Computing GST Return vouchers and tax balances...</p>
        </div>
      )}

      {/* ===================== GSTR-1 TAB ===================== */}
      {!loading && returnType === 'gstr1' && gstr1Report && (
        <div className="space-y-4">
          {/* Tally Return Statistics Banner */}
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="border-r border-slate-800 pr-3">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Vouchers</div>
              <div className="text-2xl font-black text-white mt-0.5">{gstr1Report.statistics?.totalVouchers || 0}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Recorded in the period</div>
            </div>

            <div className="border-r border-slate-800 pr-3">
              <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Included in Return
              </div>
              <div className="text-2xl font-black text-emerald-300 mt-0.5">{gstr1Report.statistics?.includedInReturn || 0}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Finalized tax invoices</div>
            </div>

            <div className="border-r border-slate-800 pr-3">
              <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Not Relevant for Return</div>
              <div className="text-2xl font-black text-amber-300 mt-0.5">{gstr1Report.statistics?.notRelevantForReturn || 0}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Cancelled / non-return vouchers</div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-rose-400" /> Incomplete / Mismatch
              </div>
              <div className="text-2xl font-black text-rose-400 mt-0.5">{gstr1Report.statistics?.mismatchCount || 0}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">To be resolved / warnings</div>
            </div>
          </div>

          {/* Tax Liability Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Taxable Value</div>
              <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1 font-mono">
                {formatIndianCurrency(gstr1Report.totals?.taxableValue || '0.00')}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Integrated Tax (IGST)</div>
              <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1 font-mono">
                {formatIndianCurrency(gstr1Report.totals?.integratedTax || '0.00')}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Central Tax (CGST)</div>
              <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1 font-mono">
                {formatIndianCurrency(gstr1Report.totals?.centralTax || '0.00')}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">State / UT Tax (SGST)</div>
              <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1 font-mono">
                {formatIndianCurrency(gstr1Report.totals?.stateTax || '0.00')}
              </div>
            </div>

            <div className="bg-brand-50/70 dark:bg-brand-950/40 p-3.5 rounded-xl border border-brand-200 dark:border-brand-800 shadow-sm">
              <div className="text-[10px] font-bold text-brand-700 dark:text-brand-300 uppercase tracking-wider">Total Output Tax</div>
              <div className="text-base sm:text-lg font-black text-brand-950 dark:text-brand-100 mt-1 font-mono">
                {formatIndianCurrency(gstr1Report.totals?.totalTax || '0.00')}
              </div>
            </div>

            <div className="bg-emerald-50/70 dark:bg-emerald-950/40 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 shadow-sm">
              <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Total Invoice Value</div>
              <div className="text-base sm:text-lg font-black text-emerald-950 dark:text-emerald-100 mt-1 font-mono">
                {formatIndianCurrency(gstr1Report.totals?.totalInvoiceValue || '0.00')}
              </div>
            </div>
          </div>

          {/* GSTR-1 Sub-navigation Tabs */}
          <div className="flex flex-wrap border-b border-slate-200 dark:border-slate-800 gap-1 bg-slate-100/70 dark:bg-slate-800/50 p-1.5 rounded-lg text-xs font-bold">
            <button
              onClick={() => setGstr1SubTab('summary')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                gstr1SubTab === 'summary'
                  ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Summary Particulars (Tally Prime)
            </button>
            <button
              onClick={() => setGstr1SubTab('b2b')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                gstr1SubTab === 'b2b'
                  ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              B2B Invoices - 4 ({gstr1Report.b2bList?.length || 0})
            </button>
            <button
              onClick={() => setGstr1SubTab('b2cl')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                gstr1SubTab === 'b2cl'
                  ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              B2C Large - 5 ({gstr1Report.b2clList?.length || 0})
            </button>
            <button
              onClick={() => setGstr1SubTab('b2cs')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                gstr1SubTab === 'b2cs'
                  ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              B2C Small - 7 ({gstr1Report.b2csList?.length || 0})
            </button>
            <button
              onClick={() => setGstr1SubTab('hsn')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                gstr1SubTab === 'hsn'
                  ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              HSN / SAC - 12 ({gstr1Report.hsnSummary?.length || 0})
            </button>
            <button
              onClick={() => setGstr1SubTab('docs')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                gstr1SubTab === 'docs'
                  ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Doc Summary - 13
            </button>
          </div>

          {/* Sub Tab: Summary Table */}
          {gstr1SubTab === 'summary' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  GSTR-1 Particulars (Return Summary Sections)
                </span>
                <span className="text-[11px] text-slate-400">Click any row to view drilldown</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Table No</th>
                      <th className="py-2.5 px-3">Particulars</th>
                      <th className="py-2.5 px-3 text-center">Voucher Count</th>
                      <th className="py-2.5 px-3 text-right">Taxable Value</th>
                      <th className="py-2.5 px-3 text-right">Integrated Tax</th>
                      <th className="py-2.5 px-3 text-right">Central Tax</th>
                      <th className="py-2.5 px-3 text-right">State / UT Tax</th>
                      <th className="py-2.5 px-3 text-right">Cess</th>
                      <th className="py-2.5 px-3 text-right">Total Tax Amount</th>
                      <th className="py-2.5 px-3 text-right">Total Invoice Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {gstr1Report.summarySections?.map((sec: any, idx: number) => (
                      <tr
                        key={idx}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                        onClick={() => {
                          if (sec.tableNo === '4') setGstr1SubTab('b2b');
                          else if (sec.tableNo === '5') setGstr1SubTab('b2cl');
                          else if (sec.tableNo === '7') setGstr1SubTab('b2cs');
                          else if (sec.tableNo === '12') setGstr1SubTab('hsn');
                          else if (sec.tableNo === '13') setGstr1SubTab('docs');
                        }}
                      >
                        <td className="py-2.5 px-3 font-bold font-mono text-brand-600 dark:text-brand-400">{sec.tableNo}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{sec.title}</span>
                          <ArrowRight className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100" />
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold">{sec.voucherCount}</td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {sec.taxableValue === '-' ? '-' : formatIndianCurrency(sec.taxableValue)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {sec.integratedTax === '-' ? '-' : formatIndianCurrency(sec.integratedTax)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {sec.centralTax === '-' ? '-' : formatIndianCurrency(sec.centralTax)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {sec.stateTax === '-' ? '-' : formatIndianCurrency(sec.stateTax)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {sec.cess === '-' ? '-' : formatIndianCurrency(sec.cess)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {sec.totalTax === '-' ? '-' : formatIndianCurrency(sec.totalTax)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {sec.totalInvoiceValue === '-' ? '-' : formatIndianCurrency(sec.totalInvoiceValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals Footer */}
                  <tfoot className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white">
                    <tr>
                      <td colSpan={2} className="py-3 px-3 uppercase tracking-wider text-[11px]">
                        Total Outward Supplies (Tax Liability)
                      </td>
                      <td className="py-3 px-3 text-center">{gstr1Report.totals?.voucherCount || 0}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatIndianCurrency(gstr1Report.totals?.taxableValue || '0.00')}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatIndianCurrency(gstr1Report.totals?.integratedTax || '0.00')}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatIndianCurrency(gstr1Report.totals?.centralTax || '0.00')}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatIndianCurrency(gstr1Report.totals?.stateTax || '0.00')}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatIndianCurrency(gstr1Report.totals?.cess || '0.00')}</td>
                      <td className="py-3 px-3 text-right font-mono text-brand-600 dark:text-brand-400 font-black">
                        {formatIndianCurrency(gstr1Report.totals?.totalTax || '0.00')}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-black">
                        {formatIndianCurrency(gstr1Report.totals?.totalInvoiceValue || '0.00')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Sub Tab: B2B Invoices */}
          {gstr1SubTab === 'b2b' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Table 4: B2B Invoices (Supplies to Registered Persons)
                </span>
                <span className="text-[11px] font-mono text-slate-500">Total Rows: {gstr1Report.b2bList?.length || 0}</span>
              </div>
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">GSTIN of Recipient</th>
                      <th className="py-2.5 px-3">Receiver Name</th>
                      <th className="py-2.5 px-3">Invoice No</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Invoice Value</th>
                      <th className="py-2.5 px-3">Place of Supply</th>
                      <th className="py-2.5 px-3 text-center">RCHRG</th>
                      <th className="py-2.5 px-3 text-center">Rate</th>
                      <th className="py-2.5 px-3 text-right">Taxable Value</th>
                      <th className="py-2.5 px-3 text-right">IGST</th>
                      <th className="py-2.5 px-3 text-right">CGST</th>
                      <th className="py-2.5 px-3 text-right">SGST</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {gstr1Report.b2bList?.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-8 text-center text-slate-400">
                          No B2B invoices recorded in this tax period.
                        </td>
                      </tr>
                    ) : (
                      gstr1Report.b2bList?.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2 px-3 font-mono font-bold text-brand-600 dark:text-brand-400">{row.recipientGstin}</td>
                          <td className="py-2 px-3 font-medium">{row.recipientName}</td>
                          <td className="py-2 px-3 font-mono font-semibold">{row.invoiceNumber}</td>
                          <td className="py-2 px-3 text-slate-500">{row.invoiceDate}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold">{formatIndianCurrency(row.invoiceValue)}</td>
                          <td className="py-2 px-3">{row.placeOfSupply}</td>
                          <td className="py-2 px-3 text-center">{row.reverseCharge}</td>
                          <td className="py-2 px-3 text-center font-mono">{row.rate}%</td>
                          <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.taxableValue)}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.integratedTax)}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.centralTax)}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.stateTax)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub Tab: B2C Large */}
          {gstr1SubTab === 'b2cl' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Table 5: B2C (Large) Invoices (Inter-State Unregistered &gt; ₹2.5 Lakhs)
                </span>
                <span className="text-[11px] font-mono text-slate-500">Total Rows: {gstr1Report.b2clList?.length || 0}</span>
              </div>
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Invoice Number</th>
                      <th className="py-2.5 px-3">Invoice Date</th>
                      <th className="py-2.5 px-3 text-right">Invoice Value</th>
                      <th className="py-2.5 px-3">Place of Supply</th>
                      <th className="py-2.5 px-3 text-center">Tax Rate</th>
                      <th className="py-2.5 px-3 text-right">Taxable Value</th>
                      <th className="py-2.5 px-3 text-right">Integrated Tax (IGST)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {gstr1Report.b2clList?.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No B2C Large invoices (&gt; ₹2.5 Lakhs inter-state) in this period.
                        </td>
                      </tr>
                    ) : (
                      gstr1Report.b2clList?.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-white">{row.invoiceNumber}</td>
                          <td className="py-2 px-3 text-slate-500">{row.invoiceDate}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold">{formatIndianCurrency(row.invoiceValue)}</td>
                          <td className="py-2 px-3">{row.placeOfSupply}</td>
                          <td className="py-2 px-3 text-center font-mono">{row.rate}%</td>
                          <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.taxableValue)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold">{formatIndianCurrency(row.integratedTax)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub Tab: B2C Small */}
          {gstr1SubTab === 'b2cs' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Table 7: B2C (Small) Invoices (Summarized by Place of Supply &amp; Rate)
                </span>
                <span className="text-[11px] font-mono text-slate-500">Total Groups: {gstr1Report.b2csList?.length || 0}</span>
              </div>
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Place of Supply</th>
                      <th className="py-2.5 px-3 text-center">Tax Rate</th>
                      <th className="py-2.5 px-3 text-right">Taxable Value</th>
                      <th className="py-2.5 px-3 text-right">Integrated Tax</th>
                      <th className="py-2.5 px-3 text-right">Central Tax</th>
                      <th className="py-2.5 px-3 text-right">State / UT Tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {gstr1Report.b2csList?.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No B2C Small supplies recorded in this period.
                        </td>
                      </tr>
                    ) : (
                      gstr1Report.b2csList?.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2 px-3 font-semibold">{row.placeOfSupply}</td>
                          <td className="py-2 px-3 text-center font-mono">{row.rate}%</td>
                          <td className="py-2 px-3 text-right font-mono font-bold">{formatIndianCurrency(row.taxableValue)}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.integratedTax)}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.centralTax)}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.stateTax)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub Tab: HSN Summary */}
          {gstr1SubTab === 'hsn' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Table 12: HSN / SAC Summary of Outward Supplies
                </span>
                <span className="text-[11px] font-mono text-slate-500">Total Codes: {gstr1Report.hsnSummary?.length || 0}</span>
              </div>
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">HSN / SAC</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3">UQC (Unit)</th>
                      <th className="py-2.5 px-3 text-right">Total Qty</th>
                      <th className="py-2.5 px-3 text-right">Total Value</th>
                      <th className="py-2.5 px-3 text-right">Taxable Value</th>
                      <th className="py-2.5 px-3 text-right">IGST</th>
                      <th className="py-2.5 px-3 text-right">CGST</th>
                      <th className="py-2.5 px-3 text-right">SGST</th>
                      <th className="py-2.5 px-3 text-right">Total Tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {gstr1Report.hsnSummary?.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400">
                          No HSN items found in this return period.
                        </td>
                      </tr>
                    ) : (
                      gstr1Report.hsnSummary?.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2 px-3 font-mono font-bold text-brand-600 dark:text-brand-400">{row.hsn_sac}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">{row.description || '-'}</td>
                          <td className="py-2 px-3 font-semibold">{row.uqc}</td>
                          <td className="py-2 px-3 text-right font-medium">{row.total_quantity}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.total_value)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold">{formatIndianCurrency(row.taxable_value)}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.igst_amount)}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.cgst_amount)}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.sgst_amount)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {formatIndianCurrency(row.total_tax)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub Tab: Document Summary */}
          {gstr1SubTab === 'docs' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Table 13: Documents Issued During the Tax Period
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Nature of Document</th>
                      <th className="py-2.5 px-3 font-mono">Sr. No. From</th>
                      <th className="py-2.5 px-3 font-mono">Sr. No. To</th>
                      <th className="py-2.5 px-3 text-center">Total Number</th>
                      <th className="py-2.5 px-3 text-center">Cancelled</th>
                      <th className="py-2.5 px-3 text-center">Net Issued</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {gstr1Report.docSummary?.map((doc: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{doc.natureOfDoc}</td>
                        <td className="py-3 px-3 font-mono font-semibold">{doc.srNoFrom}</td>
                        <td className="py-3 px-3 font-mono font-semibold">{doc.srNoTo}</td>
                        <td className="py-3 px-3 text-center font-bold">{doc.totalNumber}</td>
                        <td className="py-3 px-3 text-center font-semibold text-rose-600 dark:text-rose-400">{doc.cancelled}</td>
                        <td className="py-3 px-3 text-center font-black text-emerald-600 dark:text-emerald-400">{doc.netIssued}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== GSTR-3B TAB ===================== */}
      {!loading && returnType === 'gstr3b' && gstr3bReport && (
        <div className="space-y-4">
          {/* Net Cash Tax Payable Hero Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-brand-950 text-white rounded-xl p-5 shadow-lg border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-300 bg-brand-900/50 px-2 py-0.5 rounded border border-brand-700/50">
                Payment of Tax / Net Cash Liability
              </span>
              <h2 className="text-xl sm:text-2xl font-black mt-1">
                Net Tax Payable in Cash (After ITC Offset)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Output Tax on Sales minus Eligible Input Tax Credit (ITC) from Purchases
              </p>
            </div>

            <div className="flex items-center gap-4 bg-white/10 p-3 rounded-xl border border-white/10 backdrop-blur-sm">
              <div className="text-right">
                <div className="text-[11px] text-slate-300 font-medium">Total Net Cash Payable</div>
                <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-300">
                  {formatIndianCurrency(gstr3bReport.taxPayableVsItc?.netTaxPayableInCash?.total || '0.00')}
                </div>
              </div>
            </div>
          </div>

          {/* Table: Tax Payable vs ITC Comparison Breakdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Tax Liability vs. Input Tax Credit (ITC) Computation
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Tax Head</th>
                    <th className="py-2.5 px-3 text-right">Outward Tax Payable (A)</th>
                    <th className="py-2.5 px-3 text-right">Eligible ITC Available (B)</th>
                    <th className="py-2.5 px-3 text-right">Net Tax Payable in Cash (A - B)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 px-3 font-bold text-blue-600 dark:text-blue-400">Integrated Tax (IGST)</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatIndianCurrency(gstr3bReport.taxPayableVsItc?.outwardTaxPayable?.igst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      {formatIndianCurrency(gstr3bReport.taxPayableVsItc?.itcAvailable?.igst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatIndianCurrency(gstr3bReport.taxPayableVsItc?.netTaxPayableInCash?.igst || '0.00')}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 px-3 font-bold text-indigo-600 dark:text-indigo-400">Central Tax (CGST)</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatIndianCurrency(gstr3bReport.taxPayableVsItc?.outwardTaxPayable?.cgst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      {formatIndianCurrency(gstr3bReport.taxPayableVsItc?.itcAvailable?.cgst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatIndianCurrency(gstr3bReport.taxPayableVsItc?.netTaxPayableInCash?.cgst || '0.00')}
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 px-3 font-bold text-purple-600 dark:text-purple-400">State / UT Tax (SGST)</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatIndianCurrency(gstr3bReport.taxPayableVsItc?.outwardTaxPayable?.sgst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      {formatIndianCurrency(gstr3bReport.taxPayableVsItc?.itcAvailable?.sgst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatIndianCurrency(gstr3bReport.taxPayableVsItc?.netTaxPayableInCash?.sgst || '0.00')}
                    </td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-100 dark:bg-slate-800 font-black border-t-2 border-slate-300 dark:border-slate-700">
                  <tr>
                    <td className="py-3 px-3 uppercase tracking-wider text-[11px]">Total Cash / Bank Tax Liability</td>
                    <td className="py-3 px-3 text-right font-mono">
                      {formatIndianCurrency(gstr3bReport.taxPayableVsItc?.outwardTaxPayable?.total || '0.00')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {formatIndianCurrency(gstr3bReport.taxPayableVsItc?.itcAvailable?.total || '0.00')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                      {formatIndianCurrency(gstr3bReport.taxPayableVsItc?.netTaxPayableInCash?.total || '0.00')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Table 3.1: Details of Outward Supplies */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Table 3.1: Details of Outward Supplies and Inward Supplies Liable to Reverse Charge
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Nature of Supplies</th>
                    <th className="py-2.5 px-3 text-right">Total Taxable Value</th>
                    <th className="py-2.5 px-3 text-right">Integrated Tax</th>
                    <th className="py-2.5 px-3 text-right">Central Tax</th>
                    <th className="py-2.5 px-3 text-right">State / UT Tax</th>
                    <th className="py-2.5 px-3 text-right">Cess</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr>
                    <td className="py-2.5 px-3 font-medium">
                      (a) Outward taxable supplies (other than zero rated, nil rated and exempted)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      {formatIndianCurrency(gstr3bReport.table31OutwardSupplies?.a_taxable?.taxableValue || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatIndianCurrency(gstr3bReport.table31OutwardSupplies?.a_taxable?.igst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatIndianCurrency(gstr3bReport.table31OutwardSupplies?.a_taxable?.cgst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatIndianCurrency(gstr3bReport.table31OutwardSupplies?.a_taxable?.sgst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatIndianCurrency(gstr3bReport.table31OutwardSupplies?.a_taxable?.cess || '0.00')}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-slate-500">
                      (b) Outward taxable supplies (zero rated - Exports)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-slate-500">
                      (c) Other outward supplies (Nil rated, exempted)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-slate-500">
                      (d) Inward supplies (liable to reverse charge)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 4: Eligible Input Tax Credit (ITC) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Table 4: Eligible Input Tax Credit (ITC) from Purchases &amp; Expenses
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Details</th>
                    <th className="py-2.5 px-3 text-right">Integrated Tax</th>
                    <th className="py-2.5 px-3 text-right">Central Tax</th>
                    <th className="py-2.5 px-3 text-right">State / UT Tax</th>
                    <th className="py-2.5 px-3 text-right">Cess</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr>
                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                      (A) (5) All other ITC (Purchases from Registered Suppliers)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                      {formatIndianCurrency(gstr3bReport.table4EligibleItc?.allOtherItc?.igst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {formatIndianCurrency(gstr3bReport.table4EligibleItc?.allOtherItc?.cgst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-600 dark:text-purple-400">
                      {formatIndianCurrency(gstr3bReport.table4EligibleItc?.allOtherItc?.sgst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-slate-500">(B) ITC Reversed</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold border-t border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-400">
                  <tr>
                    <td className="py-2.5 px-3 uppercase tracking-wider text-[11px]">(C) Net ITC Available (A - B)</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatIndianCurrency(gstr3bReport.table4EligibleItc?.netItcAvailable?.igst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatIndianCurrency(gstr3bReport.table4EligibleItc?.netItcAvailable?.cgst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatIndianCurrency(gstr3bReport.table4EligibleItc?.netItcAvailable?.sgst || '0.00')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">₹ 0.00</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== GSTR-2 TAB ===================== */}
      {!loading && returnType === 'gstr2' && gstr2Report && (
        <div className="space-y-4">
          {/* Purchase Quick Totals */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Purchase Bills</div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {gstr2Report.totals?.billCount || 0}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Purchase Taxable</div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                {formatIndianCurrency(gstr2Report.totals?.taxableValue || '0.00')}
              </div>
            </div>

            <div className="bg-emerald-50/70 dark:bg-emerald-950/40 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 shadow-sm">
              <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                Total Eligible ITC
              </div>
              <div className="text-xl font-black text-emerald-950 dark:text-emerald-100 mt-1 font-mono">
                {formatIndianCurrency(gstr2Report.totals?.totalItc || '0.00')}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Purchase Value</div>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                {formatIndianCurrency(gstr2Report.totals?.totalBillValue || '0.00')}
              </div>
            </div>
          </div>

          {/* Inward Supplies Register Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Inward Supplies / Purchase Tax Register (GSTR-2)
              </span>
              <span className="text-[11px] font-mono text-slate-500">Total Entries: {gstr2Report.bills?.length || 0}</span>
            </div>
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Supplier GSTIN</th>
                    <th className="py-2.5 px-3">Supplier Name</th>
                    <th className="py-2.5 px-3">Bill Number</th>
                    <th className="py-2.5 px-3">Bill Date</th>
                    <th className="py-2.5 px-3 text-right">Bill Value</th>
                    <th className="py-2.5 px-3 text-center">Rate</th>
                    <th className="py-2.5 px-3 text-right">Taxable Value</th>
                    <th className="py-2.5 px-3 text-right">IGST</th>
                    <th className="py-2.5 px-3 text-right">CGST</th>
                    <th className="py-2.5 px-3 text-right">SGST</th>
                    <th className="py-2.5 px-3 text-center">ITC Eligibility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {gstr2Report.bills?.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-slate-400">
                        No purchase bills recorded in this tax period.
                      </td>
                    </tr>
                  ) : (
                    gstr2Report.bills?.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-mono font-bold text-brand-600 dark:text-brand-400">{row.supplierGstin}</td>
                        <td className="py-2 px-3 font-medium">{row.supplierName}</td>
                        <td className="py-2 px-3 font-mono font-semibold">{row.billNumber}</td>
                        <td className="py-2 px-3 text-slate-500">{row.billDate}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold">{formatIndianCurrency(row.billValue)}</td>
                        <td className="py-2 px-3 text-center font-mono">{row.rate}%</td>
                        <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.taxableValue)}</td>
                        <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.integratedTax)}</td>
                        <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.centralTax)}</td>
                        <td className="py-2 px-3 text-right font-mono">{formatIndianCurrency(row.stateTax)}</td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {row.itcEligibility}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
