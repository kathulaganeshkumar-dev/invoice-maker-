// src/renderer/App.tsx - Main Application Shell & View Routing
import React, { useState, useEffect } from 'react';
import { Company, Branch } from '../shared/types';
import { api } from './services/api';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { CompanyBranchModal } from './components/CompanyBranchModal';
import { ConfigurationModal } from './components/ConfigurationModal';
import { DashboardView } from './views/DashboardView';
import { InvoicesView } from './views/InvoicesView';
import { QuotationsView } from './views/QuotationsView';
import { CustomersView } from './views/CustomersView';
import { SuppliersView } from './views/SuppliersView';
import { ProductsView } from './views/ProductsView';
import { PurchasesView } from './views/PurchasesView';
import { InventoryView } from './views/InventoryView';
import { PaymentsView } from './views/PaymentsView';
import { LetterheadsView } from './views/LetterheadsView';
import { ReportsView } from './views/ReportsView';
import { ImportExportView } from './views/ImportExportView';
import { BackupRestoreView } from './views/BackupRestoreView';
import { RefreshCw, Building2, PlusCircle } from 'lucide-react';

export const App: React.FC = () => {
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [initializing, setInitializing] = useState<boolean>(true);

  useEffect(() => {
    bootstrap();
  }, []);

  const bootstrap = async () => {
    try {
      const [companies, appSettings] = await Promise.all([
        api.getCompanies(),
        api.getAppSettings().catch(() => null),
      ]);

      if (companies.length > 0) {
        const defaultComp = companies.find((c) => c.is_default) || companies[0];
        setActiveCompany(defaultComp);

        const branches = await api.getBranches(defaultComp.id);
        const defaultBranch = branches.find((b) => b.is_default) || branches[0];
        setActiveBranch(defaultBranch || null);

        if (appSettings?.show_company_selector_on_startup) {
          setIsCompanyModalOpen(true);
        }
      } else {
        // First run - force open company creation modal
        setIsCompanyModalOpen(true);
      }
    } catch (err) {
      console.error('Bootstrap error:', err);
      setIsCompanyModalOpen(true);
    } finally {
      setInitializing(false);
    }
  };

  const handleSelectCompanyBranch = (company: Company | null, branch?: Branch | null) => {
    setActiveCompany(company);
    setActiveBranch(branch || null);
  };

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return next;
    });
  };

  if (initializing) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white select-none">
        <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center font-bold text-2xl shadow-lg mb-4">
          Σ
        </div>
        <div className="text-lg font-bold">Enterprise Invoice & Business Manager</div>
        <div className="flex items-center text-xs text-slate-400 mt-2 space-x-2">
          <RefreshCw className="w-4 h-4 animate-spin text-brand-400" />
          <span>Starting local database & engine...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${isDarkMode ? 'dark' : ''}`}>
      {/* Top Navbar */}
      <Navbar
        company={activeCompany}
        branch={activeBranch}
        onOpenCompanyModal={() => setIsCompanyModalOpen(true)}
        onOpenConfigModal={() => (activeCompany ? setIsConfigModalOpen(true) : setIsCompanyModalOpen(true))}
        onNavigate={(tab) => setActiveTab(tab)}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
      />

      {/* Main Container: Sidebar + View Content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeTab={activeTab} onSelectTab={(tab) => setActiveTab(tab)} />

        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
          {!activeCompany ? (
            activeTab === 'backup_restore' ? (
              <BackupRestoreView />
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 flex items-center justify-center mb-4 shadow-sm">
                  <Building2 className="w-8 h-8 text-brand-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">No Business Profile Selected</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mt-2">
                  Create your company profile to start managing GST invoices, quotations, purchases, warehouses, payments, and letterhead templates.
                </p>
                <button
                  type="button"
                  onClick={() => setIsCompanyModalOpen(true)}
                  className="mt-5 inline-flex items-center space-x-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold shadow-md transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Create or Select Company Profile</span>
                </button>
              </div>
            )
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView companyId={activeCompany.id} onNavigate={(tab) => setActiveTab(tab)} />
              )}
              {activeTab === 'invoices' && (
                <InvoicesView companyId={activeCompany.id} />
              )}
              {activeTab === 'quotations' && (
                <QuotationsView
                  companyId={activeCompany.id}
                  onNavigateToInvoice={() => setActiveTab('invoices')}
                />
              )}
              {activeTab === 'customers' && (
                <CustomersView companyId={activeCompany.id} />
              )}
              {activeTab === 'suppliers' && (
                <SuppliersView companyId={activeCompany.id} />
              )}
              {activeTab === 'products' && (
                <ProductsView companyId={activeCompany.id} />
              )}
              {activeTab === 'purchases' && (
                <PurchasesView companyId={activeCompany.id} />
              )}
              {activeTab === 'inventory' && (
                <InventoryView companyId={activeCompany.id} />
              )}
              {activeTab === 'payments' && (
                <PaymentsView companyId={activeCompany.id} />
              )}
              {activeTab === 'letterheads' && (
                <LetterheadsView companyId={activeCompany.id} />
              )}
              {activeTab === 'reports' && (
                <ReportsView companyId={activeCompany.id} />
              )}
              {activeTab === 'import_export' && (
                <ImportExportView companyId={activeCompany.id} />
              )}
              {activeTab === 'backup_restore' && (
                <BackupRestoreView />
              )}
            </>
          )}
        </main>
      </div>

      {/* Company Selection / Creation Modal */}
      <CompanyBranchModal
        isOpen={isCompanyModalOpen}
        onClose={() => setIsCompanyModalOpen(false)}
        onSelect={handleSelectCompanyBranch}
        currentCompanyId={activeCompany?.id}
      />

      {/* System & Company Configuration Modal */}
      {activeCompany && (
        <ConfigurationModal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          companyId={activeCompany.id}
        />
      )}
    </div>
  );
};
