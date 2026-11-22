// src/renderer/components/Navbar.tsx - Desktop Top Navigation Bar
import React from 'react';
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
} from 'lucide-react';
import { getIndianFinancialYear } from '../../server/services/numberingService';
import { NotificationsBell } from './NotificationsBell';

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
}) => {
  const currentFy = getIndianFinancialYear();
  const canAccess = (menuId: string) => !allowedMenus || allowedMenus.length === 0 || allowedMenus.includes(menuId);
  const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI);

  return (
    <header
      className={`h-14 border-b border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 flex items-center justify-between px-4 select-none z-20 ${
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
          <span className="hidden sm:inline">Enterprise Invoicer</span>
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

        {/* Business Selector Pill matching user workflow */}
        <button
          type="button"
          onClick={onOpenCompanyModal}
          className="flex items-center space-x-2 px-3 py-1 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors border border-slate-200 dark:border-slate-700"
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
        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded text-[11px] font-mono font-bold">
          FY {currentFy}
        </span>
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

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

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
  );
};
