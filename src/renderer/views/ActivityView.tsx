// src/renderer/views/ActivityView.tsx - Owner-Exclusive Real-Time Software Activity Log
import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { SoftwareActivityItem, ActivitySummary } from '../../shared/types';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import {
  Shield,
  User,
  Clock,
  Calendar,
  Search,
  Filter,
  FileText,
  CreditCard,
  ShoppingCart,
  Users,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  Eye,
  Layers,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';

interface Props {
  companyId: string;
}

export const ActivityView: React.FC<Props> = ({ companyId }) => {
  const [items, setItems] = useState<SoftwareActivityItem[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStaff, setSelectedStaff] = useState<string>('ALL');
  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [dateRangePreset, setDateRangePreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('today');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const getDateBounds = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'all'): { start?: string; end?: string } => {
    if (preset === 'all') return {};
    const now = new Date();
    const toIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = toIso(now);

    if (preset === 'today') return { start: today, end: today };
    if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = toIso(y);
      return { start: yStr, end: yStr };
    }
    if (preset === 'week') {
      const s = new Date(now);
      const day = s.getDay();
      s.setDate(s.getDate() - (day === 0 ? 6 : day - 1));
      return { start: toIso(s), end: today };
    }
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toIso(startMonth), end: toIso(endMonth) };
  };

  const loadData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      let { start, end } = getDateBounds(dateRangePreset);
      if (customStartDate) start = customStartDate;
      if (customEndDate) end = customEndDate;

      const [feed, sum] = await Promise.all([
        api.getActivityFeed(companyId, {
          staff: selectedStaff !== 'ALL' ? selectedStaff : undefined,
          module: selectedModule !== 'ALL' ? selectedModule : undefined,
          start_date: start,
          end_date: end,
          search: searchTerm || undefined,
          limit: 500,
        }).catch(() => []),
        api.getActivitySummary(companyId).catch(() => null),
      ]);

      setItems(Array.isArray(feed) ? feed : []);
      if (sum) setSummary(sum);
    } catch (err) {
      console.error('Failed to load activity feed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (companyId) {
      loadData();
    }
  }, [companyId, selectedStaff, selectedModule, dateRangePreset, customStartDate, customEndDate, searchTerm]);

  // Real-time SSE synchronization & auto-poll
  useEffect(() => {
    if (!companyId) return;

    const handleSync = () => {
      loadData(true);
    };

    const interval = setInterval(() => {
      loadData(true);
    }, 3000);

    window.addEventListener('eim-data-changed', handleSync);
    window.addEventListener('eim-data-sync', handleSync);
    window.addEventListener('focus', handleSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener('eim-data-changed', handleSync);
      window.removeEventListener('eim-data-sync', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, [companyId, selectedStaff, selectedModule, dateRangePreset, customStartDate, customEndDate, searchTerm]);

  // Distinct staff names list from loaded items and summary
  const availableStaffNames = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.staff_name) set.add(i.staff_name);
    });
    if (summary?.staff_breakdown) {
      summary.staff_breakdown.forEach((s) => set.add(s.staff_name));
    }
    return Array.from(set).sort();
  }, [items, summary]);

  // Format relative time helper
  const getRelativeTime = (isoString: string): string => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  // Badge styling helper
  const getModuleBadge = (mod: string) => {
    switch (mod) {
      case 'INVOICE':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'QUOTATION':
        return 'bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 border-sky-200 dark:border-sky-800';
      case 'PAYMENT':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'PURCHASE':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'bg-emerald-100/70 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200';
      case 'FINALIZE':
        return 'bg-teal-100/70 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200';
      case 'CONVERT':
        return 'bg-blue-100/70 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200';
      case 'PAYMENT':
        return 'bg-indigo-100/70 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200';
      case 'UPDATE_CREATOR':
        return 'bg-sky-100/70 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200';
      case 'CANCEL':
        return 'bg-amber-100/70 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200';
      case 'DELETE':
        return 'bg-rose-100/70 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Top Banner / Header */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Software Activity &amp; Audit Trail
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <Shield className="w-3 h-3 mr-1 text-amber-600" />
              Owner Exclusive
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time audit log of all staff operations, document creations, and transactions across every workstation.
          </p>
        </div>
      </div>

      {/* Top Today Pulse Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Invoices Created Today */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Invoices Created Today
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {summary ? summary.invoices_today_count : 0}
            </span>
            <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
              ₹ {summary ? formatIndianCurrency(summary.invoices_today_total) : '0.00'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Total sales billed today</div>
        </div>

        {/* Card 2: Quotations Prepared Today */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Quotations Prepared
            </span>
            <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950 flex items-center justify-center text-sky-600">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {summary ? summary.quotations_today_count : 0}
            </span>
            <span className="text-xs font-bold font-mono text-sky-600 dark:text-sky-400">
              ₹ {summary ? formatIndianCurrency(summary.quotations_today_total) : '0.00'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Price estimates issued today</div>
        </div>

        {/* Card 3: Payments Recorded Today */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Payments Recorded
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950 flex items-center justify-center text-purple-600">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {summary ? summary.payments_today_count : 0}
            </span>
            <span className="text-xs font-bold font-mono text-purple-600 dark:text-purple-400">
              ₹ {summary ? formatIndianCurrency(summary.payments_today_total) : '0.00'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Total cash / bank receipts</div>
        </div>

        {/* Card 4: Active Staff Members */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Staff Active Today
            </span>
            <div className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-950 flex items-center justify-center text-brand-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {summary ? summary.active_staff_count : 0}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {summary ? `${summary.total_today} total actions` : '0 actions'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            {summary && summary.staff_breakdown && summary.staff_breakdown.length > 0
              ? summary.staff_breakdown.map((s) => s.staff_name).join(', ')
              : 'Waiting for staff operations...'}
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by invoice #, quotation #, customer, staff name..."
              className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Staff Member Filter */}
          <div className="flex items-center space-x-1.5">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center space-x-1">
              <User className="w-3.5 h-3.5 text-sky-600" />
              <span>Staff:</span>
            </label>
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="ALL">All Staff Members &amp; Owner</option>
              {availableStaffNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Module Filter */}
          <div className="flex items-center space-x-1.5">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center space-x-1">
              <Layers className="w-3.5 h-3.5 text-brand-600" />
              <span>Module:</span>
            </label>
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="ALL">All Modules</option>
              <option value="INVOICE">Invoices</option>
              <option value="QUOTATION">Quotations</option>
              <option value="PAYMENT">Payments (AR/AP)</option>
              <option value="PURCHASE">Purchases</option>
            </select>
          </div>

          {/* Date Range Preset */}
          <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            {(['today', 'yesterday', 'week', 'month', 'all'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setDateRangePreset(preset);
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                className={`px-2.5 py-1 text-xs font-bold rounded-md capitalize transition-colors cursor-pointer ${
                  dateRangePreset === preset && !customStartDate && !customEndDate
                    ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Row */}
        <div className="flex items-center space-x-3 text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="font-semibold text-slate-600 dark:text-slate-400 flex items-center space-x-1">
            <Calendar className="w-3.5 h-3.5 text-brand-600" />
            <span>Custom Dates:</span>
          </span>
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => setCustomStartDate(e.target.value)}
            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
          <span>to</span>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => setCustomEndDate(e.target.value)}
            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
          {(customStartDate || customEndDate) && (
            <button
              type="button"
              onClick={() => {
                setCustomStartDate('');
                setCustomEndDate('');
                setDateRangePreset('today');
              }}
              className="text-xs text-rose-600 hover:underline cursor-pointer"
            >
              Clear Custom Range
            </button>
          )}
          <span className="ml-auto text-[11px] text-slate-400">
            Showing <strong className="text-slate-700 dark:text-slate-200">{items.length}</strong> activity records
          </span>
        </div>
      </div>

      {/* Main Activity Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-brand-600 mx-auto" />
            <div className="text-xs font-semibold text-slate-500">Loading activity trail...</div>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
              <Activity className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">No activity records found</div>
            <div className="text-xs text-slate-400 max-w-sm mx-auto">
              No staff or system activity matches your current filters. Try selecting &quot;All Staff&quot; or expanding the date range.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 whitespace-nowrap">Date &amp; Time</th>
                  <th className="py-3 px-4 whitespace-nowrap">Staff Member</th>
                  <th className="py-3 px-4 whitespace-nowrap">Module / Action</th>
                  <th className="py-3 px-4 whitespace-nowrap">Document #</th>
                  <th className="py-3 px-4 whitespace-nowrap">Customer / Party</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Amount</th>
                  <th className="py-3 px-4 whitespace-nowrap">Details &amp; Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Timestamp */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{item.date}</span>
                        <span className="text-slate-400 font-normal">at</span>
                        <span className="font-mono text-[11px] text-brand-600 dark:text-brand-400">{item.time}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {getRelativeTime(item.timestamp)}
                      </div>
                    </td>

                    {/* Staff Member */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          item.staff_name === 'Admin / Owner'
                            ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : 'bg-sky-50 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border-sky-200 dark:border-sky-800'
                        }`}
                      >
                        <User className="w-3 h-3 mr-1 opacity-70" />
                        <span>{item.staff_name}</span>
                      </span>
                    </td>

                    {/* Module & Action */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold border ${getModuleBadge(
                            item.module
                          )}`}
                        >
                          {item.module}
                        </span>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${getActionBadge(
                            item.action
                          )}`}
                        >
                          {item.action}
                        </span>
                      </div>
                    </td>

                    {/* Document Number */}
                    <td className="py-3 px-4 whitespace-nowrap font-bold text-slate-800 dark:text-slate-200 font-mono">
                      {item.document_number || '—'}
                    </td>

                    {/* Party Name */}
                    <td className="py-3 px-4 text-slate-800 dark:text-slate-200 font-medium max-w-[200px] truncate">
                      {item.party_name || '—'}
                    </td>

                    {/* Financial Amount */}
                    <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold">
                      {item.amount !== undefined && item.amount !== null && item.amount !== '' ? (
                        <span className="text-slate-900 dark:text-white">
                          ₹ {formatIndianCurrency(item.amount)}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>

                    {/* Details */}
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 text-[11px] max-w-[340px]">
                      <div className="leading-snug">{item.details}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
