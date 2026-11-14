// src/renderer/components/Sidebar.tsx - Collapsible Modern Desktop Navigation Sidebar
import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  FileSpreadsheet,
  Users,
  Truck,
  Package,
  ShoppingCart,
  Boxes,
  CreditCard,
  Stamp,
  BarChart3,
  FileDown,
  Database,
  Settings,
} from 'lucide-react';

interface Props {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenSettings?: () => void;
}

export const Sidebar: React.FC<Props> = ({ activeTab, onSelectTab, onOpenSettings }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'invoices', label: 'Invoices (Sales)', icon: Receipt },
    { id: 'quotations', label: 'Quotations', icon: FileSpreadsheet },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'suppliers', label: 'Suppliers', icon: Truck },
    { id: 'products', label: 'Products & Services', icon: Package },
    { id: 'purchases', label: 'Purchases', icon: ShoppingCart },
    { id: 'inventory', label: 'Inventory & Stock', icon: Boxes },
    { id: 'payments', label: 'Payments (AR/AP)', icon: CreditCard },
    { id: 'letterheads', label: 'Letterheads & OCR', icon: Stamp },
    { id: 'reports', label: 'Reports & GST', icon: BarChart3 },
    { id: 'import_export', label: 'Excel Import/Export', icon: FileDown },
    { id: 'backup_restore', label: 'Backup & Restore', icon: Database },
  ];

  return (
    <aside className="w-56 border-r border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 flex flex-col py-3 select-none flex-shrink-0">
      <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Navigation
      </div>
      <nav className="flex-1 space-y-0.5 px-2 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Settings Shortcut Button */}
      {onOpenSettings && (
        <div className="px-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200 transition-all"
          >
            <Settings className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            <span className="truncate">Settings & Preferences</span>
          </button>
        </div>
      )}

      {/* Software Build Info */}
      <div className="px-4 pt-2.5 text-[10px] text-slate-400 space-y-0.5">
        <div className="font-semibold text-slate-600 dark:text-slate-400">Enterprise Invoicer v2.0.0</div>
        <div>Offline Enterprise Edition</div>
      </div>
    </aside>
  );
};
