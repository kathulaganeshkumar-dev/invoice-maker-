// src/renderer/components/Sidebar.tsx - Modern Text-First Desktop Navigation Sidebar
import React from 'react';

interface Props {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenSettings?: () => void;
  allowedMenus?: string[] | null;
  canOpenSettings?: boolean;
}

export const Sidebar: React.FC<Props> = ({
  activeTab,
  onSelectTab,
  onOpenSettings,
  allowedMenus,
  canOpenSettings = true,
}) => {
  const allMenuItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'invoices', label: 'Invoices (Sales)' },
    { id: 'invoices_other', label: 'Invoices (Other)' },
    { id: 'quotations', label: 'Quotations' },
    { id: 'customers', label: 'Customers' },
    { id: 'suppliers', label: 'Suppliers' },
    { id: 'products', label: 'Products & Services' },
    { id: 'purchases', label: 'Purchases' },
    { id: 'inventory', label: 'Inventory & Stock' },
    { id: 'payments', label: 'Payments (AR/AP)' },
    { id: 'letterheads', label: 'Print Templates' },
    { id: 'reports', label: 'Reports & GST' },
    { id: 'work_summary', label: 'Work Summary' },
    { id: 'import_export', label: 'Excel Import/Export' },
    { id: 'backup_restore', label: 'Backup & Restore' },
  ];

  const menuItems =
    allowedMenus && allowedMenus.length > 0
      ? allMenuItems.filter((item) => allowedMenus.includes(item.id))
      : allMenuItems;

  return (
    <aside className="w-60 border-r border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 flex flex-col py-3 select-none flex-shrink-0">
      <nav className="flex-1 space-y-1 px-2.5 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`w-full text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold border border-slate-300 dark:border-slate-700 shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <span className="truncate block">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Settings Shortcut Button - Always accessible so staff can configure network or switch to Standalone mode */}
      {onOpenSettings && (
        <div className="px-2.5 pt-2.5">
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-all"
            title="Settings & Preferences (Deployment, Network, Business Rules)"
          >
            <span className="truncate block">Settings &amp; Preferences</span>
          </button>
        </div>
      )}

      {/* Software Build Info */}
      <div className="px-4 pt-2.5 text-[10px] text-slate-400 space-y-0.5">
        <div className="font-semibold text-slate-600 dark:text-slate-400">Enterprise Management v2.0.0</div>
        <div>Offline Enterprise Edition</div>
      </div>
    </aside>
  );
};
