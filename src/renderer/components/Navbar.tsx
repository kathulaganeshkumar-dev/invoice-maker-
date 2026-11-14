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
  Moon,
  Sun,
  ShieldCheck,
} from 'lucide-react';
import { getIndianFinancialYear } from '../../server/services/numberingService';

interface Props {
  company: Company | null;
  branch: Branch | null;
  onOpenCompanyModal: () => void;
  onOpenConfigModal: () => void;
  onNavigate: (tab: string) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<Props> = ({
  company,
  branch,
  onOpenCompanyModal,
  onOpenConfigModal,
  onNavigate,
  isDarkMode,
  onToggleTheme,
}) => {
  const currentFy = getIndianFinancialYear();

  return (
    <header className="h-13 border-b border-stone-200/80 bg-white dark:bg-stone-900 dark:border-stone-800/80 flex items-center justify-between px-4 select-none z-20">
      {/* Left: Brand logo & Active Business Selector */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 text-stone-900 dark:text-stone-100 font-semibold text-sm tracking-tight">
          <div className="w-7 h-7 rounded-md bg-stone-900 dark:bg-stone-100 flex items-center justify-center text-white dark:text-stone-900 font-bold text-xs shadow-none">
            EI
          </div>
          <span className="hidden sm:inline font-medium">Enterprise Invoicer</span>
        </div>

        <div className="h-4 w-px bg-stone-200 dark:bg-stone-800" />

        {/* Business Selector Pill matching user workflow */}
        <button
          type="button"
          onClick={onOpenCompanyModal}
          className="flex items-center space-x-2 px-2.5 py-1 bg-stone-50 hover:bg-stone-100 dark:bg-stone-800/50 dark:hover:bg-stone-800 rounded-md text-xs font-normal text-stone-800 dark:text-stone-200 transition-colors border border-stone-200/80 dark:border-stone-700/60"
          title="Click to switch Company or Branch"
        >
          <Building2 className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
          <span className="max-w-[150px] truncate font-medium">{company?.name || 'Select Business'}</span>
          {branch && (
            <>
              <span className="text-stone-300 dark:text-stone-600">/</span>
              <span className="text-stone-500 dark:text-stone-400 max-w-[100px] truncate">{branch.name}</span>
            </>
          )}
        </button>

        {/* Financial Year Badge */}
        <span className="px-2 py-0.5 bg-stone-50 dark:bg-stone-800/50 border border-stone-200/80 dark:border-stone-700/60 text-stone-600 dark:text-stone-300 rounded text-[11px] font-mono tabular-nums">
          FY {currentFy}
        </span>
      </div>

      {/* Right: Quick Actions, Theme, Status */}
      <div className="flex items-center space-x-2">
        <button
          type="button"
          onClick={() => onNavigate('invoices')}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 rounded-md text-xs font-medium transition-colors shadow-none"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>New invoice</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('quotations')}
          className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 bg-transparent hover:bg-stone-100 text-stone-700 dark:hover:bg-stone-800 dark:text-stone-300 rounded-md text-xs font-medium transition-colors border border-stone-200 dark:border-stone-800"
        >
          <FilePlus className="w-3.5 h-3.5 text-stone-400" />
          <span className="hidden md:inline">Quotation</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('customers')}
          className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 bg-transparent hover:bg-stone-100 text-stone-700 dark:hover:bg-stone-800 dark:text-stone-300 rounded-md text-xs font-medium transition-colors border border-stone-200 dark:border-stone-800"
        >
          <Users className="w-3.5 h-3.5 text-stone-400" />
          <span className="hidden md:inline">Customer</span>
        </button>

        <div className="h-4 w-px bg-stone-200 dark:bg-stone-800 mx-0.5" />

        {/* Offline Security Status */}
        <div className="flex items-center space-x-1.5 text-xs text-stone-500 dark:text-stone-400 px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="hidden lg:inline text-[11px]">Local storage</span>
        </div>

        {/* Dark/Light toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="p-1.5 text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          title="Toggle Dark/Light Mode"
        >
          {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        {/* Configuration Modal Trigger */}
        <button
          type="button"
          onClick={onOpenConfigModal}
          className="p-1.5 text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          title="Settings & Preferences"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
