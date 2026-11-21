// src/renderer/views/DashboardView.tsx - Real-time Financial & Business Dashboard
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import { DateInput } from '../components/DateInput';
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

  useEffect(() => {
    const onDataChanged = () => {
      if (companyId) loadMetrics();
    };
    window.addEventListener('eim-data-changed', onDataChanged);
    return () => window.removeEventListener('eim-data-changed', onDataChanged);
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
      title: 'Total Sales Revenue',
      value: formatIndianCurrency(metrics?.totalSales || 0),
      subtitle: `${metrics?.totalInvoicesCount || 0} Invoices Generated`,
      icon: TrendingUp,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    },
    {
      title: 'Customer Receivables',
      value: formatIndianCurrency(metrics?.outstandingReceivables || 0),
      subtitle: `Unpaid: ${formatIndianCurrency(metrics?.unpaidInvoicesAmount || 0)}`,
      icon: ArrowDownLeft,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
    },
    {
      title: 'Total Purchases',
      value: formatIndianCurrency(metrics?.totalPurchases || 0),
      subtitle: `Payables: ${formatIndianCurrency(metrics?.outstandingPayables || 0)}`,
      icon: ShoppingCart,
      color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800',
    },
    {
      title: 'Current Inventory Value',
      value: formatIndianCurrency(metrics?.currentStockValue || 0),
      subtitle: `${metrics?.lowStockCount || 0} Products Low in Stock`,
      icon: Package,
      color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* View Header with Date Filters */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
            Executive Financial Dashboard
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time business performance calculated directly from transactional records
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Custom From Date & To Date Pickers */}
          <div className="flex items-center space-x-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 shadow-sm text-xs">
            <Calendar className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />
            <span className="font-semibold text-slate-500 dark:text-slate-400">From:</span>
            <div className="w-32">
              <DateInput
                value={fromDate}
                onChange={(val) => {
                  setDateRange('custom');
                  setFromDate(val);
                }}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 border-none px-0 py-0 shadow-none focus:ring-0"
              />
            </div>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="font-semibold text-slate-500 dark:text-slate-400">To:</span>
            <div className="w-32">
              <DateInput
                value={toDate}
                onChange={(val) => {
                  setDateRange('custom');
                  setToDate(val);
                }}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 border-none px-0 py-0 shadow-none focus:ring-0"
              />
            </div>
          </div>

          {['today', 'this_week', 'this_month', 'this_fy', 'all_time'].map((key) => {
            const labels: Record<string, string> = {
              today: 'Today',
              this_week: 'This Week',
              this_month: 'This Month',
              this_fy: 'This FY',
              all_time: 'All Time',
            };
            return (
              <button
                key={key}
                type="button"
                onClick={() => handlePresetClick(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  dateRange === key
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                {labels[key]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={loadMetrics}
            className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
            title="Refresh figures"
          >
            <RefreshCw className="w-4 h-4" />
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
              className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{card.title}</span>
                <div className={`p-2 rounded-lg border ${card.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl font-extrabold text-slate-900 dark:text-white">{card.value}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">{card.subtitle}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Financial Health Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cashflow & Collections */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
          <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center justify-between">
            <span>Cashflow & Collections</span>
            <CreditCard className="w-4 h-4 text-slate-400" />
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
              <span className="text-slate-600 dark:text-slate-400">Total Customer Collections:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                {formatIndianCurrency(metrics?.totalPaymentsReceived || 0)}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
              <span className="text-slate-600 dark:text-slate-400">Payments Disbursed to Suppliers:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                {formatIndianCurrency(metrics?.totalSupplierPayments || 0)}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
              <span className="text-slate-600 dark:text-slate-400">Paid Invoices Volume:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {formatIndianCurrency(metrics?.paidInvoicesAmount || 0)}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
              <span className="text-slate-600 dark:text-slate-400">Total Active Quotations:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {metrics?.totalQuotationsCount || 0} Active Offers
              </span>
            </div>
          </div>
        </div>

        {/* Monthly Performance Visualizer */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-brand-600" />
              <span>Financial Year Monthly Trajectory (FY 2026-27)</span>
            </h2>
            <div className="flex items-center space-x-3 text-xs">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-600 inline-block" />
                <span className="text-slate-600 dark:text-slate-400">Sales</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                <span className="text-slate-600 dark:text-slate-400">Purchases</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-1.5 h-36 items-end pt-4 border-b border-slate-100 dark:border-slate-700">
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
                      className={`w-2 sm:w-3 rounded-t transition-all ${salesVal > 0 ? 'bg-brand-600 hover:bg-brand-700' : 'bg-slate-200 dark:bg-slate-700'}`}
                      title={`${m.month} Sales: ₹ ${m.sales}`}
                    />
                    <div
                      style={{ height: `${purchasesHeight}%` }}
                      className={`w-2 sm:w-3 rounded-t transition-all ${purchasesVal > 0 ? 'bg-sky-400 hover:bg-sky-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                      title={`${m.month} Purchases: ₹ ${m.purchases}`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-medium">
                    {m.month}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-3">
            <span>
              {fromDate || toDate
                ? `Showing: ${fromDate || 'Start'} to ${toDate || 'Latest'}`
                : 'Showing: All Time Records'}{' '}
              • Sales: {formatIndianCurrency(metrics?.totalSales || 0)}
            </span>
            <button
              onClick={() => onNavigate('reports')}
              className="text-brand-600 dark:text-brand-400 font-bold hover:underline"
            >
              View Full GST & Business Reports →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
