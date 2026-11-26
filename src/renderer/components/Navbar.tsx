// src/renderer/components/Navbar.tsx - Desktop Top Navigation Bar
import React, { useState, useEffect } from 'react';
import { Company, Branch } from '../../shared/types';
import {
  Building2,
  GitBranch,
  Settings,
  PlusCircle,
  FilePlus,
  Users,
  UserPlus,
  Moon,
  Sun,
  Calendar,
  X,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';
import { getIndianFinancialYear } from '../../server/services/numberingService';
import { NotificationsBell } from './NotificationsBell';
import { ModalPortal } from './ModalPortal';

interface Props {
  company: Company | null;
  branch: Branch | null;
  softwareIcon?: string | null;
  onOpenCompanyModal: () => void;
  onOpenConfigModal: () => void;
  onQuickNewInvoice: () => void;
  onQuickNewQuotation: () => void;
  onQuickNewCustomer?: () => void;
  onNavigate: (tab: string) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  allowedMenus?: string[] | null;
  canOpenSettings?: boolean;
  hasEnteredCompany?: boolean;
  savedServerIp?: string;
}

export const Navbar: React.FC<Props> = ({
  company,
  branch,
  softwareIcon,
  onOpenCompanyModal,
  onOpenConfigModal,
  onQuickNewInvoice,
  onQuickNewQuotation,
  onQuickNewCustomer,
  onNavigate,
  isDarkMode,
  onToggleTheme,
  allowedMenus,
  canOpenSettings = true,
  hasEnteredCompany = false,
  savedServerIp,
}) => {
  const [liveFy, setLiveFy] = useState<string>(() => getIndianFinancialYear());
  const [isFyModalOpen, setIsFyModalOpen] = useState<boolean>(false);
  const [simulationDate, setSimulationDate] = useState<string>('2027-04-01');

  useEffect(() => {
    // Keep liveFy in sync with system clock across day/year boundaries
    const interval = setInterval(() => {
      const next = getIndianFinancialYear();
      setLiveFy((prev) => (prev !== next ? next : prev));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const simulatedFy = getIndianFinancialYear(simulationDate);
  const canAccess = (menuId: string) => !allowedMenus || allowedMenus.length === 0 || allowedMenus.includes(menuId);
  const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI);

  return (
    <>
    <header
      className={`h-14 bg-white dark:bg-slate-900 flex items-center justify-between px-4 select-none z-20 ${
        isElectron ? 'pr-[145px] app-drag-region' : ''
      }`}
    >
      {/* Left: Brand logo & Active Business Selector */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 text-brand-900 dark:text-white font-extrabold text-base tracking-tight">
          {softwareIcon ? (
            <img
              src={softwareIcon}
              alt="Software Icon"
              className="w-8 h-8 rounded-lg object-cover shadow-sm shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white shadow-sm font-bold text-lg shrink-0">
              Σ
            </div>
          )}
          <span className="hidden sm:inline">Enterprise Management</span>
        </div>

        {/* Business Selector Pill matching user workflow */}
        <button
          type="button"
          onClick={onOpenCompanyModal}
          className="flex items-center space-x-2 px-3 py-1 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
          title="Click to switch Company or Branch"
        >
          <span className="max-w-[140px] truncate">{company?.name || 'Select Business'}</span>
          {branch && (
            <>
              <span className="text-slate-400">•</span>
              <span className="text-slate-500 dark:text-slate-400 max-w-[100px] truncate">{branch.name}</span>
            </>
          )}
        </button>

        {/* Financial Year Badge */}
        <button
          type="button"
          onClick={() => setIsFyModalOpen(true)}
          className="group inline-flex items-center space-x-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200/90 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer shadow-2xs hover:shadow-xs"
          title="Indian Financial Year (Auto-advances every 01 April). Click to view details and test auto-rollover."
        >
          <span>FY {liveFy}</span>
        </button>

        {/* Saved Server IP Badge in Staff Mode */}
        {savedServerIp && (
          <div
            className="hidden md:inline-flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-lg text-[11px] font-mono font-semibold shadow-2xs"
            title={`Connected to Main Office Server: ${savedServerIp} (Auto-connected)`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Server: {savedServerIp}</span>
          </div>
        )}
      </div>

      {/* Right: Quick Actions, Theme, Status */}
      <div className="flex items-center space-x-2.5">
        {canAccess('invoices') && (
          <button
            type="button"
            onClick={onQuickNewInvoice}
            className="inline-flex items-center space-x-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 rounded-md text-xs font-semibold transition-all"
            title="Create New Invoice"
          >
            <span>New Invoice</span>
          </button>
        )}

        {canAccess('quotations') && (
          <button
            type="button"
            onClick={onQuickNewQuotation}
            className="inline-flex items-center space-x-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 rounded-md text-xs font-semibold transition-all"
            title="Create New Quotation"
          >
            <span className="hidden md:inline">New Quotation</span>
          </button>
        )}

        {canAccess('customers') && (
          <button
            type="button"
            onClick={onQuickNewCustomer || (() => onNavigate('customers'))}
            className="inline-flex items-center space-x-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 rounded-md text-xs font-semibold transition-all"
            title="Create New Customer"
          >
            <span className="hidden md:inline">New Customer</span>
          </button>
        )}

        {/* Notifications Bell */}
        <NotificationsBell
          companyId={company?.id}
          onNavigate={onNavigate}
          hasEnteredCompany={hasEnteredCompany}
        />

        {/* Dark/Light toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Toggle Dark/Light Mode"
        >
          {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Configuration Modal Trigger - Always accessible so staff can configure network or switch to Standalone mode */}
        <button
          type="button"
          onClick={onOpenConfigModal}
          className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Settings & Preferences (Network, Deployment, Configuration)"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>

    {/* Financial Year & Auto-Rollover Info Modal */}
    {isFyModalOpen && (
      <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-xs">
            
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                    Indian Financial Year & Automatic Rollover
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Dynamic Indian Financial Year (01 April to 31 March)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFyModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-slate-700 dark:text-slate-300">
              {/* Active Financial Year Banner */}
              <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 flex items-start space-x-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                      Current Financial Year: FY {liveFy}
                    </span>
                    <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                      Active & Automatic
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    All newly finalized bills, quotes, and accounts are automatically assigned to <strong className="font-semibold text-slate-900 dark:text-white">FY {liveFy}</strong> based on the transaction date.
                  </p>
                </div>
              </div>

              {/* Rollover Explanation Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 space-y-1.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                    <span>Automatic Transition</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    On <strong className="text-slate-700 dark:text-slate-200 font-semibold">1st April 2027</strong>, the system automatically advances to <strong className="text-brand-600 dark:text-brand-400 font-bold">FY 2027-28</strong>. On 1st April 2028, it advances to <strong className="text-brand-600 dark:text-brand-400 font-bold">FY 2028-29</strong>. Zero manual editing required.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 space-y-1.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                    <Info className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Document Numbering</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Invoices and quotes adopt the new year sequence dynamically based on document date (e.g. <code className="bg-slate-200/70 dark:bg-slate-800 px-1 py-0.5 rounded font-mono font-bold text-slate-800 dark:text-slate-200">VS/2027-28/0001</code>).
                  </p>
                </div>
              </div>

              {/* Interactive Date Simulator */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                    <Calendar className="w-4 h-4 text-brand-500" />
                    <span>Test / Preview Auto-Rollover for Any Date:</span>
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="w-full sm:w-48">
                    <input
                      type="date"
                      value={simulationDate}
                      onChange={(e) => setSimulationDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-mono bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div className="flex items-center space-x-1.5 text-[11px] w-full sm:w-auto flex-wrap gap-y-1">
                    <button
                      type="button"
                      onClick={() => setSimulationDate('2026-11-23')}
                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimulationDate('2027-04-01')}
                      className="px-2 py-1 rounded border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/50 hover:bg-brand-100 dark:hover:bg-brand-900/50 text-brand-700 dark:text-brand-300 font-semibold cursor-pointer"
                    >
                      01 Apr 2027 (Next FY)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimulationDate('2028-04-01')}
                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      01 Apr 2028
                    </button>
                  </div>
                </div>

                {/* Simulation Result */}
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Calculated FY for this date</div>
                    <div className="text-base font-extrabold font-mono text-brand-600 dark:text-brand-400">
                      FY {simulatedFy}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Sample Generated Bill #</div>
                    <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                      VS/{simulatedFy}/0001
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div className="text-[11px] text-slate-400">
                Compliant with Indian CGST Act & Rule 46(b)
              </div>
              <button
                type="button"
                onClick={() => setIsFyModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      </ModalPortal>
    )}
  </>
  );
};
