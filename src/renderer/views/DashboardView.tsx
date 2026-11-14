// src/renderer/views/DashboardView.tsx - Real-time Financial & Business Dashboard
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import {
  TrendingUp,
  Receipt,
  ShoppingCart,
  Users,
  AlertTriangle,
  CreditCard,
  Package,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  RefreshCw,
} from 'lucide-react';

interface Props {
  companyId: string;
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<Props> = ({ companyId, onNavigate }) => {
  const computePresetDates = (preset: string): { from: string; to: string } => {
    const now = new Date();
    const toIso = (d: Date) => {
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const dy = String(d.getDate()).padStart(2, '0');
      return `${yr}-${mo}-${dy}`;
    };
    const todayStr = toIso(now);

    if (preset === 'today') {
      return { from: todayStr, to: todayStr };
    }
    if (preset === 'this_week') {
      const start = new Date(now);
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diff);
      return { from: toIso(start), to: todayStr };
    }
    if (preset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: toIso(start), to: toIso(end) };
    }
    if (preset === 'this_fy') {
      const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      return { from: `${fyStartYear}-04-01`, to: `${fyStartYear + 1}-03-31` };
    }
    return { from: '', to: '' };
  };

  const initialDates = computePresetDates('this_fy');
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [dateRange, setDateRange] = useState<string>('this_fy');
  const [fromDate, setFromDate] = useState<string>(initialDates.from);
  const [toDate, setToDate] = useState<string>(initialDates.to);

  useEffect(() => {
    if (companyId) {
      loadMetrics();
    }
  }, [companyId, fromDate, toDate]);

  const handlePresetClick = (preset: string) => {
    setDateRange(preset);
    const { from, to } = computePresetDates(preset);
    setFromDate(from);
    setToDate(to);
  };

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const data = await api.getDashboardMetrics(companyId, fromDate || undefined, toDate || undefined);
      setMetrics(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Calculating financial metrics from database...</span>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Sales revenue',
      value: formatIndianCurrency(metrics?.totalSales || 0),
      subtitle: `${metrics?.totalInvoicesCount || 0} invoices generated`,
      icon: TrendingUp,
    },
    {
      title: 'Customer receivables',
      value: formatIndianCurrency(metrics?.outstandingReceivables || 0),
      subtitle: `Unpaid balance: ${formatIndianCurrency(metrics?.unpaidInvoicesAmount || 0)}`,
      icon: ArrowDownLeft,
    },
    {
      title: 'Purchases',
      value: formatIndianCurrency(metrics?.totalPurchases || 0),
      subtitle: `Supplier payables: ${formatIndianCurrency(metrics?.outstandingPayables || 0)}`,
      icon: ShoppingCart,
    },
    {
      title: 'Inventory valuation',
      value: formatIndianCurrency(metrics?.currentStockValue || 0),
      subtitle: `${metrics?.lowStockCount || 0} items low in stock`,
      icon: Package,
    },
  ];

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      {/* View Header with Date Filters */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
            Financial Overview
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Operational and transaction ledger summary for active period
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Custom From Date & To Date Pickers */}
          <div className="flex items-center space-x-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg px-2.5 py-1 text-xs text-stone-600 dark:text-stone-300">
            <Calendar className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
            <span className="text-stone-500 dark:text-stone-400 font-medium">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setDateRange('custom');
                setFromDate(e.target.value);
              }}
              aria-label="From Date"
              className="bg-transparent text-xs text-stone-800 dark:text-stone-200 outline-none"
            />
            <span className="text-stone-300 dark:text-stone-700">·</span>
            <span className="text-stone-500 dark:text-stone-400 font-medium">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setDateRange('custom');
                setToDate(e.target.value);
              }}
              aria-label="To Date"
              className="bg-transparent text-xs text-stone-800 dark:text-stone-200 outline-none"
            />
          </div>

          <div className="inline-flex items-center p-0.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-100/80 dark:bg-stone-900/60 text-xs">
            {['today', 'this_week', 'this_month', 'this_fy', 'all_time'].map((key) => {
              const labels: Record<string, string> = {
                today: 'Today',
                this_week: 'Week',
                this_month: 'Month',
                this_fy: 'This FY',
                all_time: 'All time',
              };
              const active = dateRange === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handlePresetClick(key)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    active
                      ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-medium shadow-2xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  {labels[key]}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={loadMetrics}
            className="p-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition-colors"
            title="Refresh figures"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 4 Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 shadow-2xs flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-stone-500 dark:text-stone-400">{card.title}</span>
                <div className="w-7 h-7 rounded-md border border-stone-200/80 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/60 flex items-center justify-center text-stone-500 dark:text-stone-400">
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-stone-900 dark:text-stone-100 tabular-nums tracking-tight">{card.value}</div>
                <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">{card.subtitle}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Financial Health Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cashflow & Collections */}
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 shadow-2xs space-y-4">
          <h2 className="font-medium text-sm text-stone-900 dark:text-stone-100 flex items-center justify-between">
            <span>Cashflow & Collections</span>
            <CreditCard className="w-4 h-4 text-stone-400" />
          </h2>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between items-center p-2.5 border border-stone-100 dark:border-stone-800/80 bg-stone-50/60 dark:bg-stone-800/30 rounded-lg">
              <span className="text-stone-600 dark:text-stone-400">Customer collections</span>
              <span className="font-semibold text-stone-900 dark:text-stone-100 tabular-nums text-sm">
                {formatIndianCurrency(metrics?.totalPaymentsReceived || 0)}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 border border-stone-100 dark:border-stone-800/80 bg-stone-50/60 dark:bg-stone-800/30 rounded-lg">
              <span className="text-stone-600 dark:text-stone-400">Supplier disbursements</span>
              <span className="font-semibold text-stone-900 dark:text-stone-100 tabular-nums text-sm">
                {formatIndianCurrency(metrics?.totalSupplierPayments || 0)}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 border border-stone-100 dark:border-stone-800/80 bg-stone-50/60 dark:bg-stone-800/30 rounded-lg">
              <span className="text-stone-600 dark:text-stone-400">Paid invoices settled</span>
              <span className="font-medium text-stone-900 dark:text-stone-100 tabular-nums">
                {formatIndianCurrency(metrics?.paidInvoicesAmount || 0)}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 border border-stone-100 dark:border-stone-800/80 bg-stone-50/60 dark:bg-stone-800/30 rounded-lg">
              <span className="text-stone-600 dark:text-stone-400">Active quotations</span>
              <span className="font-medium text-stone-900 dark:text-stone-100 tabular-nums">
                {metrics?.totalQuotationsCount || 0} open offers
              </span>
            </div>
          </div>
        </div>

        {/* Monthly Performance Visualizer */}
        <div className="lg:col-span-2 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-sm text-stone-900 dark:text-stone-100 flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-stone-500" />
              <span>Monthly Sales & Purchases (FY 2026-27)</span>
            </h2>
            <div className="flex items-center space-x-4 text-xs">
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-stone-800 dark:bg-stone-200 inline-block" />
                <span className="text-stone-600 dark:text-stone-400">Sales</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-stone-400 dark:bg-stone-600 inline-block" />
                <span className="text-stone-600 dark:text-stone-400">Purchases</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-1.5 h-36 items-end pt-4 border-b border-stone-100 dark:border-stone-800">
            {metrics?.monthlySales?.map((m: any, i: number) => {
              const seriesMax = Math.max(
                ...(metrics?.monthlySales?.map((x: any) => Math.max(Number(x.sales) || 0, Number(x.purchases) || 0)) || [0]),
                1
              );
              const salesVal = Number(m.sales) || 0;
              const purchasesVal = Number(m.purchases) || 0;
              const salesHeight = salesVal > 0 ? Math.min(100, Math.max(8, (salesVal / seriesMax) * 100)) : 2;
              const purchasesHeight = purchasesVal > 0 ? Math.min(100, Math.max(8, (purchasesVal / seriesMax) * 100)) : 2;

              return (
                <div key={i} className="flex flex-col items-center h-full justify-end group relative">
                  <div className="flex items-end space-x-0.5 w-full justify-center h-full">
                    <div
                      style={{ height: `${salesHeight}%` }}
                      className={`w-2 sm:w-3 rounded-t-xs transition-all ${salesVal > 0 ? 'bg-stone-800 dark:bg-stone-200 hover:opacity-80' : 'bg-stone-200 dark:bg-stone-800'}`}
                      title={`${m.month} Sales: ₹ ${m.sales}`}
                    />
                    <div
                      style={{ height: `${purchasesHeight}%` }}
                      className={`w-2 sm:w-3 rounded-t-xs transition-all ${purchasesVal > 0 ? 'bg-stone-400 dark:bg-stone-600 hover:opacity-80' : 'bg-stone-200 dark:bg-stone-800'}`}
                      title={`${m.month} Purchases: ₹ ${m.purchases}`}
                    />
                  </div>
                  <span className="text-[11px] text-stone-500 dark:text-stone-500 mt-1.5 font-medium tabular-nums">
                    {m.month}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs text-stone-500 pt-3">
            <span className="tabular-nums">
              {fromDate || toDate
                ? `Period: ${fromDate || 'Start'} to ${toDate || 'Latest'}`
                : 'Period: All records'}{' '}
              · Total sales: {formatIndianCurrency(metrics?.totalSales || 0)}
            </span>
            <button
              onClick={() => onNavigate('reports')}
              className="text-stone-800 dark:text-stone-200 font-medium hover:underline inline-flex items-center space-x-1"
            >
              <span>View full reports</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
