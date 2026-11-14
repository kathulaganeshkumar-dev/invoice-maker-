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
    <aside className="w-56 border-r border-stone-200/80 bg-stone-50/50 dark:bg-stone-900/60 dark:border-stone-800/80 flex flex-col py-3 select-none flex-shrink-0">
      <div className="px-3 pb-2 text-xs font-medium text-stone-400 dark:text-stone-500">
        Workspace
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
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                isActive
                  ? 'bg-stone-200/80 text-stone-900 dark:bg-stone-800 dark:text-stone-100 font-medium'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/40 dark:hover:bg-stone-800/50 hover:text-stone-900 dark:hover:text-stone-200 font-normal'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-stone-900 dark:text-stone-100' : 'text-stone-400 dark:text-stone-500'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Settings Shortcut Button */}
      {onOpenSettings && (
        <div className="px-2 pt-2 border-t border-stone-200/60 dark:border-stone-800/60">
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md text-xs font-normal text-stone-600 dark:text-stone-400 hover:bg-stone-200/40 dark:hover:bg-stone-800/50 hover:text-stone-900 dark:hover:text-stone-200 transition-colors"
          >
            <Settings className="w-4 h-4 text-stone-400 dark:text-stone-500" />
            <span className="truncate">Settings & Preferences</span>
          </button>
        </div>
      )}

      {/* Software Build Info */}
      <div className="px-3 pt-2 text-[11px] text-stone-400 space-y-0.5">
        <div className="font-medium text-stone-500 dark:text-stone-400">Enterprise Invoicer 2.0</div>
        <div className="text-stone-400 text-[10px]">Local offline mode</div>
      </div>
    </aside>
  );
};
