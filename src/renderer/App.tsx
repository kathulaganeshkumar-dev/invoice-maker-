// src/renderer/App.tsx - Main Application Shell & View Routing
import React, { useState, useEffect } from 'react';
import { Company, Branch } from '../shared/types';
import { api, initDeviceIdentity } from './services/api';
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
import { WorkSummaryView } from './views/WorkSummaryView';
import { ImportExportView } from './views/ImportExportView';
import { BackupRestoreView } from './views/BackupRestoreView';
import { QuickAddCustomerModal } from './components/QuickAddCustomerModal';
import { RefreshCw, Building2, PlusCircle } from 'lucide-react';

export const App: React.FC = () => {
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [hasEnteredCompany, setHasEnteredCompany] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [isQuickInvoiceOpen, setIsQuickInvoiceOpen] = useState<boolean>(false);
  const [isQuickQuotationOpen, setIsQuickQuotationOpen] = useState<boolean>(false);
  const [isQuickCustomerOpen, setIsQuickCustomerOpen] = useState<boolean>(false);
  const [allowedMenus, setAllowedMenus] = useState<string[] | null>(null);
  const [canOpenSettings, setCanOpenSettings] = useState<boolean>(true);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [initializing, setInitializing] = useState<boolean>(true);
  const [dbMode, setDbMode] = useState<any>(null);
  const [softwareIcon, setSoftwareIcon] = useState<string | null>(() => {
    try {
      return localStorage.getItem('eim_software_icon') || null;
    } catch {
      return null;
    }
  });

  const applyBrowserFavicon = (iconDataUrl: string | null) => {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    if (iconDataUrl) {
      link.type = 'image/png';
      link.href = iconDataUrl;
    } else {
      link.type = 'image/svg+xml';
      link.href =
        'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><rect width=%2264%22 height=%2264%22 rx=%2214%22 fill=%22%232563eb%22/><text x=%2250%25%22 y=%2254%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2238%22 font-family=%22Arial%22 font-weight=%22bold%22>Σ</text></svg>';
    }
  };

  useEffect(() => {
    applyBrowserFavicon(softwareIcon);
    try {
      if (softwareIcon) localStorage.setItem('eim_software_icon', softwareIcon);
      else localStorage.removeItem('eim_software_icon');
    } catch {
      // ignore storage quota errors
    }
  }, [softwareIcon]);

  const loadMyPermissions = async () => {
    try {
      const res = await api.getMyWorkstationPermission();
      const ws = res?.workstation;
      if (ws) {
        const menus = ws.is_admin ? null : ws.allowed_menus;
        setAllowedMenus(menus);
        // Staff always allowed to open Settings to disconnect or switch to Standalone mode
        setCanOpenSettings(true);
        if (menus && menus.length > 0) {
          setActiveTab((prev) => (menus.includes(prev) ? prev : menus[0]));
        }
      }
    } catch {
      // keep existing permissions on transient error
    }
  };

  const checkSystemStatus = async () => {
    try {
      const db = await api.getDatabaseMode().catch(() => null);
      if (db) setDbMode(db);
    } catch {
      // ignore
    }
  };

  // LAN Real-Time Synchronization Engine (3.5s interval + focus + eim-data-sync event)
  // Ensures Staff PC automatically receives newly created companies, updated company details,
  // and permissions from the Host PC without requiring manual restarts or reloads.
  const syncLiveLanData = async () => {
    try {
      const freshCompanies = await api.getCompanies();
      if (!Array.isArray(freshCompanies)) return;

      setActiveCompany((current) => {
        // Case 1: Staff PC had NO active company (e.g. host created first company)
        if (!current && freshCompanies.length > 0) {
          const target = freshCompanies.find((c) => c.is_default) || freshCompanies[0];
          setIsCompanyModalOpen(false);
          api
            .getBranches(target.id)
            .then((branches) => {
              const b = branches.find((item) => item.is_default) || branches[0] || null;
              setActiveBranch(b);
            })
            .catch(() => {});
          return target;
        }

        // Case 2: Active company exists, check if details were updated on Host
        if (current) {
          const updated = freshCompanies.find((c) => c.id === current.id);
          if (updated) {
            if (
              updated.name !== current.name ||
              updated.gstin !== current.gstin ||
              updated.registered_address !== current.registered_address ||
              updated.phone !== current.phone ||
              updated.email !== current.email ||
              updated.logo_url !== current.logo_url ||
              updated.state !== current.state
            ) {
              return updated;
            }
          } else if (freshCompanies.length > 0) {
            // Current company was deleted, switch to first available
            const fallback = freshCompanies.find((c) => c.is_default) || freshCompanies[0];
            return fallback;
          }
        }
        return current;
      });
    } catch {
      // transient LAN disconnection, ignore
    }
  };

  useEffect(() => {
    const onIconChanged = (evt: Event) => {
      const custom = evt as CustomEvent<string | null>;
      setSoftwareIcon(custom.detail || null);
    };
    const onPermissionsChanged = () => {
      loadMyPermissions();
      syncLiveLanData();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // Hidden MD / Admin shortcut (Ctrl+Shift+A) to open Configuration even on locked staff PCs
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setIsConfigModalOpen(true);
      }
    };

    // Global mouse-wheel / laptop touchpad intelligent scrolling helper:
    // When a modal dialog is open, if user wheels anywhere inside the modal overlay
    // (even over the header, footer, or modal borders), automatically forward the wheel scroll
    // to the active modal's scrollable container.
    const onWheel = (e: WheelEvent) => {
      const modalOverlays = document.querySelectorAll(
        '.fixed.inset-0.z-50, .fixed.inset-0.z-\\[60\\], .fixed.inset-0.z-\\[70\\], .fixed.inset-0.z-\\[100\\]'
      );
      if (modalOverlays.length > 0) {
        const topModal = modalOverlays[modalOverlays.length - 1] as HTMLElement;
        const target = e.target as HTMLElement | null;
        if (topModal.contains(target)) {
          const scrollables = topModal.querySelectorAll('.overflow-y-auto, .overflow-auto');
          if (scrollables.length > 0) {
            let isInsideScrollable = false;
            for (let i = 0; i < scrollables.length; i++) {
              if (scrollables[i].contains(target)) {
                isInsideScrollable = true;
                break;
              }
            }
            if (!isInsideScrollable) {
              const primaryScroll = scrollables[0] as HTMLElement;
              primaryScroll.scrollTop += e.deltaY;
            }
          }
        }
      }
    };

    // Auto-sync timer every 3.5 seconds
    const syncTimer = setInterval(() => {
      syncLiveLanData();
      loadMyPermissions();
      checkSystemStatus();
    }, 3500);

    window.addEventListener('eim-software-icon-changed', onIconChanged);
    window.addEventListener('eim-permissions-changed', onPermissionsChanged);
    window.addEventListener('eim-data-sync', onPermissionsChanged);
    window.addEventListener('focus', onPermissionsChanged);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel, { passive: true });
    bootstrap();

    return () => {
      clearInterval(syncTimer);
      window.removeEventListener('eim-software-icon-changed', onIconChanged);
      window.removeEventListener('eim-permissions-changed', onPermissionsChanged);
      window.removeEventListener('eim-data-sync', onPermissionsChanged);
      window.removeEventListener('focus', onPermissionsChanged);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);

  const bootstrap = async () => {
    try {
      await initDeviceIdentity();
      const [companies, appSettings] = await Promise.all([
        api.getCompanies(),
        api.getAppSettings().catch(() => null),
        loadMyPermissions(),
        checkSystemStatus(),
      ]);

      if (appSettings && Object.prototype.hasOwnProperty.call(appSettings, 'software_icon')) {
        const iconVal = appSettings.software_icon || null;
        setSoftwareIcon(iconVal);
        const electronAPI = (window as any)?.electronAPI;
        if (iconVal && electronAPI?.setSoftwareIcon) {
          electronAPI.setSoftwareIcon(iconVal).catch(() => {});
        }
      }

      if (companies.length > 0) {
        const restoredCompId = sessionStorage.getItem('eim_restore_active_company_id');
        if (restoredCompId) {
          sessionStorage.removeItem('eim_restore_active_company_id');
          const defaultComp =
            companies.find((c) => c.id === restoredCompId) ||
            companies.find((c) => c.is_default) ||
            companies[0];
          setActiveCompany(defaultComp);

          const branches = await api.getBranches(defaultComp.id);
          const defaultBranch = branches.find((b) => b.is_default) || branches[0];
          setActiveBranch(defaultBranch || null);
          setHasEnteredCompany(true);
        } else {
          // On program startup: do not enter any company yet. Open company selection window.
          setActiveCompany(null);
          setActiveBranch(null);
          setHasEnteredCompany(false);
          setIsCompanyModalOpen(true);
        }
      } else {
        // First run - force open company creation modal
        setActiveCompany(null);
        setActiveBranch(null);
        setHasEnteredCompany(false);
        setIsCompanyModalOpen(true);
      }
    } catch (err) {
      console.error('Bootstrap error:', err);
      setActiveCompany(null);
      setActiveBranch(null);
      setHasEnteredCompany(false);
      setIsCompanyModalOpen(true);
    } finally {
      setInitializing(false);
    }
  };

  const handleSelectCompanyBranch = (company: Company | null, branch?: Branch | null) => {
    setActiveCompany(company);
    setActiveBranch(branch || null);
    if (company) {
      setHasEnteredCompany(true);
    }
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

  useEffect(() => {
    const electronAPI = (window as any)?.electronAPI;
    if (electronAPI?.setTitleBarTheme) {
      electronAPI.setTitleBarTheme(isDarkMode).catch(() => {});
    }
  }, [isDarkMode]);

  if (initializing) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white select-none">
        {softwareIcon ? (
          <img
            src={softwareIcon}
            alt="Software Icon"
            className="w-12 h-12 rounded-xl object-cover shadow-lg mb-4"
          />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center font-bold text-2xl shadow-lg mb-4">
            Σ
          </div>
        )}
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
        softwareIcon={softwareIcon}
        onOpenCompanyModal={() => setIsCompanyModalOpen(true)}
        onOpenConfigModal={() => (activeCompany ? setIsConfigModalOpen(true) : setIsCompanyModalOpen(true))}
        onQuickNewInvoice={() => (activeCompany ? setIsQuickInvoiceOpen(true) : setIsCompanyModalOpen(true))}
        onQuickNewQuotation={() => (activeCompany ? setIsQuickQuotationOpen(true) : setIsCompanyModalOpen(true))}
        onQuickNewCustomer={() => (activeCompany ? setIsQuickCustomerOpen(true) : setIsCompanyModalOpen(true))}
        onNavigate={(tab) => {
          if (!allowedMenus || allowedMenus.includes(tab)) setActiveTab(tab);
        }}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        allowedMenus={allowedMenus}
        canOpenSettings={canOpenSettings}
        hasEnteredCompany={hasEnteredCompany && !isCompanyModalOpen}
      />

      {/* Top Critical Status Banners */}
      {dbMode?.type === 'postgres' && !dbMode?.connected && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between shadow-sm z-50">
          <div className="flex items-center space-x-2">
            <span>Local LAN PostgreSQL Server Unreachable. The software can automatically fall back to SQLite WAL mode to continue working offline.</span>
          </div>
          <button
            onClick={() => api.autoSyncDatabaseMode('STANDALONE').then(checkSystemStatus)}
            className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-1 rounded text-xs font-semibold ml-4 shadow-xs"
          >
            Auto-Switch to SQLite
          </button>
        </div>
      )}

      {/* Main Container: Sidebar + View Content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            if (!allowedMenus || allowedMenus.includes(tab)) setActiveTab(tab);
          }}
          onOpenSettings={() => setIsConfigModalOpen(true)}
          allowedMenus={allowedMenus}
          canOpenSettings={canOpenSettings}
        />

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
                  Create your company profile to start managing GST invoices, quotations, purchases, warehouses, payments, and print templates.
                </p>
                <button
                  type="button"
                  onClick={() => setIsCompanyModalOpen(true)}
                  className="mt-5 inline-flex items-center space-x-2 px-5 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-sm font-semibold shadow-xs transition-colors"
                >
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
                <InvoicesView key="invoices-sales" companyId={activeCompany.id} mode="sales" />
              )}
              {activeTab === 'invoices_other' && (
                <InvoicesView key="invoices-other" companyId={activeCompany.id} mode="other" />
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
              {activeTab === 'work_summary' && (
                <WorkSummaryView companyId={activeCompany.id} />
              )}
              {activeTab === 'import_export' && (
                <ImportExportView companyId={activeCompany.id} />
              )}
              {activeTab === 'backup_restore' && (
                <BackupRestoreView companyId={activeCompany.id} companyName={activeCompany.name} />
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
      <ConfigurationModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        companyId={activeCompany?.id}
        onOpenCompanyModal={() => {
          setIsConfigModalOpen(false);
          setIsCompanyModalOpen(true);
        }}
      />

      {/* Quick Create Sales Invoice Modal (opens directly from Navbar without leaving current menu) */}
      {activeCompany && isQuickInvoiceOpen && (
        <InvoicesView
          companyId={activeCompany.id}
          mode="sales"
          modalOnly
          onCloseModal={() => setIsQuickInvoiceOpen(false)}
          onInvoiceCreated={() => {
            setIsQuickInvoiceOpen(false);
            setActiveTab('invoices');
          }}
        />
      )}

      {/* Quick Create Quotation Modal (opens directly from Navbar without leaving current menu) */}
      {activeCompany && isQuickQuotationOpen && (
        <QuotationsView
          companyId={activeCompany.id}
          modalOnly
          onCloseModal={() => setIsQuickQuotationOpen(false)}
          onQuotationCreated={() => {
            setIsQuickQuotationOpen(false);
            setActiveTab('quotations');
          }}
        />
      )}

      {/* Quick Create Customer Modal (opens directly from Navbar) */}
      {activeCompany && isQuickCustomerOpen && (
        <QuickAddCustomerModal
          isOpen={isQuickCustomerOpen}
          companyId={activeCompany.id}
          onClose={() => setIsQuickCustomerOpen(false)}
          onCustomerCreated={() => {
            setIsQuickCustomerOpen(false);
            setActiveTab('customers');
          }}
        />
      )}
    </div>
  );
};
