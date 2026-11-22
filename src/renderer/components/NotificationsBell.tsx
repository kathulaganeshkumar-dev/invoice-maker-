// src/renderer/components/NotificationsBell.tsx - Extensible Local Notification Center
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Decimal from 'decimal.js';
import { api } from '../services/api';
import { ModalPortal } from './ModalPortal';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import {
  Bell,
  X,
} from 'lucide-react';

export type NotificationCategory = 'VENDOR_DUE' | 'CUSTOMER_DUE' | 'INVENTORY';
export type NotificationSeverity = 'critical' | 'warning' | 'info';

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  subtitle: string;
  badge: string;
  amount?: string;
  rawAmount?: string;
  targetTab: string;
  sortOrder: number;
}

interface Props {
  companyId?: string;
  onNavigate: (tab: string) => void;
  hasEnteredCompany?: boolean;
}

const REMINDER_WINDOW_DAYS = 7; // Notify 1 week before due date (and when overdue)

function parseLocalDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const part = dateStr.split('T')[0];
  const [y, m, d] = part.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateDdMmYyyy(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function getDaysUntil(targetDate: Date): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((targetDate.getTime() - today.getTime()) / 86400000);
}

function formatDueBadge(daysLeft: number): string {
  if (daysLeft < 0) {
    const abs = Math.abs(daysLeft);
    return `Overdue ${abs} day${abs === 1 ? '' : 's'}`;
  }
  if (daysLeft === 0) return 'Due Today';
  return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
}

function getTodayKey(): string {
  const now = new Date();
  const yy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

interface DailyAckRecord {
  date: string;
  seenIds: string[];
  desktopNotifiedDate?: string;
}

function readDailyAck(companyId: string): DailyAckRecord | null {
  try {
    const raw = localStorage.getItem(`eim_daily_reminder_ack_${companyId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeDailyAck(companyId: string, record: DailyAckRecord) {
  try {
    localStorage.setItem(`eim_daily_reminder_ack_${companyId}`, JSON.stringify(record));
  } catch {
    // ignore storage errors
  }
}

interface DailyDeletedRecord {
  date: string;
  deletedIds: string[];
}

function readDeletedForToday(companyId: string): string[] {
  try {
    const raw = localStorage.getItem(`eim_daily_deleted_notifs_${companyId}`);
    if (!raw) return [];
    const parsed: DailyDeletedRecord = JSON.parse(raw);
    if (parsed.date !== getTodayKey()) {
      // New calendar day — automatically restore all uncleared reminders!
      localStorage.removeItem(`eim_daily_deleted_notifs_${companyId}`);
      return [];
    }
    return Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [];
  } catch {
    return [];
  }
}

function writeDeletedForToday(companyId: string, deletedIds: string[]) {
  try {
    const payload: DailyDeletedRecord = {
      date: getTodayKey(),
      deletedIds,
    };
    localStorage.setItem(`eim_daily_deleted_notifs_${companyId}`, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export const NotificationsBell: React.FC<Props> = ({ companyId, onNavigate, hasEnteredCompany = true }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [showDailyPopup, setShowDailyPopup] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [deletedTodayIds, setDeletedTodayIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<'ALL' | NotificationCategory>('ALL');
  const [desktopNotifStatus, setDesktopNotifStatus] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported'
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const lastAutoPopupKeyRef = useRef<string>('');

  // When companyId changes or company is exited/entered, reset notifications and popup immediately
  useEffect(() => {
    lastAutoPopupKeyRef.current = '';
    setNotifications([]);
    setShowDailyPopup(false);
  }, [companyId, hasEnteredCompany]);

  const loadNotifications = useCallback(async () => {
    if (!companyId || !hasEnteredCompany) {
      setNotifications([]);
      setShowDailyPopup(false);
      return;
    }
    setLoading(true);
    try {
      const [purchaseBills, suppliers, invoices, customers, products] = await Promise.all([
        api.getPurchaseInvoices(companyId).catch(() => []),
        api.getSuppliers(companyId).catch(() => []),
        api.getInvoices(companyId).catch(() => []),
        api.getCustomers(companyId).catch(() => []),
        api.getProducts(companyId, { item_type: 'PRODUCT' }).catch(() => []),
      ]);

      const items: AppNotification[] = [];
      const supplierTermsMap = new Map<string, number>(
        suppliers.map((s) => [s.id, Number(s.payment_terms_days) || 0])
      );
      const customerTermsMap = new Map<string, number>(
        customers.map((c) => [c.id, Number(c.payment_terms_days) || 0])
      );

      // 1. Vendor Payment Due Reminders (within 7 days before due date or overdue)
      for (const bill of purchaseBills) {
        const balance = new Decimal(bill.balance_amount || 0);
        if (balance.lte(0)) continue;

        const billDate = parseLocalDate(bill.bill_date);
        const explicitDue = parseLocalDate(bill.due_date);
        const termsDays = supplierTermsMap.get(bill.supplier_id) || 0;

        let dueDate: Date | null = null;
        if (explicitDue && billDate && explicitDue.getTime() > billDate.getTime()) {
          dueDate = explicitDue;
        } else if (billDate && termsDays > 0) {
          dueDate = addDays(billDate, termsDays);
        } else if (explicitDue) {
          dueDate = explicitDue;
        }

        if (!dueDate) continue;
        const daysLeft = getDaysUntil(dueDate);
        if (daysLeft <= REMINDER_WINDOW_DAYS) {
          items.push({
            id: `vendor-due-${bill.id}`,
            category: 'VENDOR_DUE',
            severity: daysLeft <= 0 ? 'critical' : 'warning',
            title: `Vendor Payment: ${bill.supplier_name}`,
            subtitle: `Bill ${bill.bill_number} • Due ${formatDateDdMmYyyy(dueDate)}`,
            badge: formatDueBadge(daysLeft),
            amount: formatIndianCurrency(balance.toFixed(2)),
            rawAmount: balance.toFixed(2),
            targetTab: 'payments',
            sortOrder: daysLeft <= 0 ? daysLeft - 1000 : daysLeft,
          });
        }
      }

      // 2. Customer Payment Due Reminders (within 7 days before due date or overdue)
      for (const inv of invoices) {
        if (inv.status !== 'FINALIZED') continue;
        const balance = new Decimal(inv.balance_amount || 0);
        if (balance.lte(0)) continue;

        const invDate = parseLocalDate(inv.invoice_date);
        const explicitDue = parseLocalDate(inv.due_date);
        const termsDays = customerTermsMap.get(inv.customer_id) || 0;

        let dueDate: Date | null = null;
        if (explicitDue && invDate && explicitDue.getTime() > invDate.getTime()) {
          dueDate = explicitDue;
        } else if (invDate && termsDays > 0) {
          dueDate = addDays(invDate, termsDays);
        } else if (explicitDue) {
          dueDate = explicitDue;
        }
        if (!dueDate) continue;

        const daysLeft = getDaysUntil(dueDate);
        if (daysLeft <= REMINDER_WINDOW_DAYS) {
          items.push({
            id: `customer-due-${inv.id}`,
            category: 'CUSTOMER_DUE',
            severity: daysLeft <= 0 ? 'critical' : 'warning',
            title: `Customer Payment: ${inv.customer_name}`,
            subtitle: `Invoice ${inv.invoice_number} • Due ${formatDateDdMmYyyy(dueDate)}`,
            badge: formatDueBadge(daysLeft),
            amount: formatIndianCurrency(balance.toFixed(2)),
            rawAmount: balance.toFixed(2),
            targetTab: 'payments',
            sortOrder: daysLeft <= 0 ? daysLeft - 900 : daysLeft + 10,
          });
        }
      }

      // 3. Inventory Low-Stock / Out-of-Stock Reminders
      for (const prod of products) {
        if (prod.item_type !== 'PRODUCT' || prod.is_archived || prod.is_active === false) continue;
        const stock = new Decimal(prod.current_stock || 0);
        const minStock = new Decimal(prod.minimum_stock || 0);
        const isOut = stock.lte(0);
        const isLow = minStock.gt(0) && stock.lte(minStock);

        if (isOut || isLow) {
          items.push({
            id: `inventory-${prod.id}`,
            category: 'INVENTORY',
            severity: isOut ? 'critical' : 'warning',
            title: `Inventory Alert: ${prod.name}`,
            subtitle: `In Stock: ${stock.toFixed(2)} ${prod.unit}${minStock.gt(0) ? ` • Min Alert: ${minStock.toFixed(2)} ${prod.unit}` : ''}`,
            badge: isOut ? 'Out of Stock' : 'Low Stock',
            targetTab: 'inventory',
            sortOrder: isOut ? -500 : 100,
          });
        }
      }

      items.sort((a, b) => a.sortOrder - b.sortOrder);
      setNotifications(items);

      // Load today's deleted-for-today list (auto-resets at midnight / next day!)
      const currentDeletedToday = readDeletedForToday(companyId);
      setDeletedTodayIds(currentDeletedToday);
      const deletedSet = new Set(currentDeletedToday);
      const activeItems = items.filter((it) => !deletedSet.has(it.id));

      // Daily Automatic Reminder Check:
      // Surfaces every calendar day (and whenever a new pending alert enters the 7-day/overdue window)
      // until every payment/alert is cleared manually.
      if (activeItems.length > 0) {
        const todayKey = getTodayKey();
        const ack = readDailyAck(companyId);
        const ackedToday = ack?.date === todayKey;
        const seenSet = new Set(ackedToday ? ack.seenIds || [] : []);
        const hasNewUnseen = activeItems.some((it) => !seenSet.has(it.id));
        const popupCycleKey = `${companyId}:${todayKey}:${activeItems.map((it) => it.id).join(',')}`;

        if ((!ackedToday || hasNewUnseen) && lastAutoPopupKeyRef.current !== popupCycleKey) {
          lastAutoPopupKeyRef.current = popupCycleKey;
          setShowDailyPopup(true);
        }

        // Fire 1 local OS/Desktop notification per calendar day if user enabled Desktop Alerts
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          window.Notification.permission === 'granted' &&
          ack?.desktopNotifiedDate !== todayKey
        ) {
          const vendorCount = activeItems.filter((i) => i.category === 'VENDOR_DUE').length;
          const customerCount = activeItems.filter((i) => i.category === 'CUSTOMER_DUE').length;
          const invCount = activeItems.filter((i) => i.category === 'INVENTORY').length;
          const parts: string[] = [];
          if (vendorCount > 0) parts.push(`${vendorCount} vendor payment${vendorCount === 1 ? '' : 's'} due`);
          if (customerCount > 0) parts.push(`${customerCount} customer payment${customerCount === 1 ? '' : 's'} due`);
          if (invCount > 0) parts.push(`${invCount} inventory alert${invCount === 1 ? '' : 's'}`);
          try {
            new window.Notification('Daily Payment & Business Reminders', {
              body: `${parts.join(' • ')}. Reminds daily until cleared.`,
            });
            writeDailyAck(companyId, {
              date: ack?.date || '',
              seenIds: ack?.seenIds || [],
              desktopNotifiedDate: todayKey,
            });
          } catch {
            // ignore OS notification error
          }
        }
      } else {
        setShowDailyPopup(false);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [companyId, hasEnteredCompany]);

  useEffect(() => {
    if (companyId && hasEnteredCompany) {
      loadNotifications();
      const timer = setInterval(loadNotifications, 60000);
      return () => clearInterval(timer);
    } else {
      setNotifications([]);
      setShowDailyPopup(false);
    }
  }, [companyId, hasEnteredCompany, loadNotifications]);

  // Close popover on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const visibleNotifications = useMemo(() => {
    if (deletedTodayIds.length === 0) return notifications;
    const deletedSet = new Set(deletedTodayIds);
    return notifications.filter((n) => !deletedSet.has(n.id));
  }, [notifications, deletedTodayIds]);

  const deletedTodayActiveCount = useMemo(() => {
    if (deletedTodayIds.length === 0) return 0;
    const deletedSet = new Set(deletedTodayIds);
    return notifications.filter((n) => deletedSet.has(n.id)).length;
  }, [notifications, deletedTodayIds]);

  const counts = useMemo(() => {
    return {
      ALL: visibleNotifications.length,
      VENDOR_DUE: visibleNotifications.filter((n) => n.category === 'VENDOR_DUE').length,
      CUSTOMER_DUE: visibleNotifications.filter((n) => n.category === 'CUSTOMER_DUE').length,
      INVENTORY: visibleNotifications.filter((n) => n.category === 'INVENTORY').length,
    };
  }, [visibleNotifications]);

  const criticalCount = useMemo(
    () => visibleNotifications.filter((n) => n.severity === 'critical').length,
    [visibleNotifications]
  );

  const filtered = useMemo(() => {
    if (activeCategory === 'ALL') return visibleNotifications;
    return visibleNotifications.filter((n) => n.category === activeCategory);
  }, [visibleNotifications, activeCategory]);

  const dailyTotals = useMemo(() => {
    let vendorTotal = new Decimal(0);
    let customerTotal = new Decimal(0);
    for (const n of visibleNotifications) {
      if (n.category === 'VENDOR_DUE' && n.rawAmount) {
        vendorTotal = vendorTotal.add(new Decimal(n.rawAmount));
      } else if (n.category === 'CUSTOMER_DUE' && n.rawAmount) {
        customerTotal = customerTotal.add(new Decimal(n.rawAmount));
      }
    }
    return {
      vendorTotal: vendorTotal.toFixed(2),
      customerTotal: customerTotal.toFixed(2),
    };
  }, [visibleNotifications]);

  const handleDeleteForToday = (notifId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!companyId) return;
    const next = Array.from(new Set([...deletedTodayIds, notifId]));
    setDeletedTodayIds(next);
    writeDeletedForToday(companyId, next);
    // Also mark seen today so the daily popup doesn't immediately re-trigger for it today
    const prev = readDailyAck(companyId);
    const prevSeen = prev?.date === getTodayKey() ? prev.seenIds || [] : [];
    writeDailyAck(companyId, {
      date: getTodayKey(),
      seenIds: Array.from(new Set([...prevSeen, notifId])),
      desktopNotifiedDate: prev?.desktopNotifiedDate,
    });
  };

  const handleDeleteAllForToday = () => {
    if (!companyId || filtered.length === 0) return;
    const idsToDelete = filtered.map((n) => n.id);
    const next = Array.from(new Set([...deletedTodayIds, ...idsToDelete]));
    setDeletedTodayIds(next);
    writeDeletedForToday(companyId, next);
    const prev = readDailyAck(companyId);
    const prevSeen = prev?.date === getTodayKey() ? prev.seenIds || [] : [];
    writeDailyAck(companyId, {
      date: getTodayKey(),
      seenIds: Array.from(new Set([...prevSeen, ...idsToDelete])),
      desktopNotifiedDate: prev?.desktopNotifiedDate,
    });
  };

  const handleRestoreDeletedToday = () => {
    if (!companyId) return;
    setDeletedTodayIds([]);
    writeDeletedForToday(companyId, []);
  };

  const handleDismissForToday = () => {
    if (companyId) {
      const prev = readDailyAck(companyId);
      writeDailyAck(companyId, {
        date: getTodayKey(),
        seenIds: notifications.map((n) => n.id),
        desktopNotifiedDate: prev?.desktopNotifiedDate,
      });
    }
    setShowDailyPopup(false);
  };

  const handleEnableDesktopAlerts = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await window.Notification.requestPermission();
      setDesktopNotifStatus(perm);
      if (perm === 'granted') {
        new window.Notification('Daily Reminders Enabled', {
          body: 'You will receive daily local alerts 7 days before due dates and every day after until cleared.',
        });
      }
    } catch {
      // ignore
    }
  };

  const handleToggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      loadNotifications();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggleOpen}
        className={`relative p-1.5 rounded-md transition-colors ${
          isOpen
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        title={
          visibleNotifications.length > 0
            ? `${visibleNotifications.length} Notification${visibleNotifications.length === 1 ? '' : 's'}`
            : 'Notifications'
        }
      >
        <Bell className="w-4 h-4" />
        {visibleNotifications.length > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-extrabold text-white flex items-center justify-center shadow-sm ${
              criticalCount > 0 ? 'bg-rose-600' : 'bg-amber-500'
            }`}
          >
            {visibleNotifications.length > 99 ? '99+' : visibleNotifications.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[450px] max-w-[94vw] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                Notifications &amp; Reminders
              </h3>
              {visibleNotifications.length > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                  {visibleNotifications.length}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1">
              {filtered.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteAllForToday}
                  className="px-2 py-1 text-[10px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 rounded transition-colors"
                  title="Clear all notifications in this tab for today (they will return tomorrow if still pending)"
                >
                  Clear Today
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-1 overflow-x-auto text-[11px]">
            {(
              [
                { key: 'ALL', label: 'All' },
                { key: 'VENDOR_DUE', label: 'Vendor Due' },
                { key: 'CUSTOMER_DUE', label: 'Customer Due' },
                { key: 'INVENTORY', label: 'Inventory' },
              ] as const
            ).map((tab) => {
              const isActive = activeCategory === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveCategory(tab.key)}
                  className={`px-2.5 py-1 rounded-md font-semibold whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold border border-slate-400 dark:border-slate-500 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab.label} ({counts[tab.key]})
                </button>
              );
            })}
          </div>

          {/* Notifications List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {!companyId ? (
              <div className="py-10 px-4 text-center text-xs text-slate-400">
                Select a business profile to view notifications.
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {deletedTodayActiveCount > 0 ? 'Cleared for today!' : 'All caught up!'}
                </div>
                <div className="text-[11px] text-slate-400">
                  {deletedTodayActiveCount > 0
                    ? `${deletedTodayActiveCount} deleted reminder${deletedTodayActiveCount === 1 ? '' : 's'} will return automatically tomorrow until cleared.`
                    : 'No pending reminders in this category right now.'}
                </div>
                {deletedTodayActiveCount > 0 && (
                  <button
                    type="button"
                    onClick={handleRestoreDeletedToday}
                    className="mt-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  >
                    Restore deleted today ({deletedTodayActiveCount})
                  </button>
                )}
              </div>
            ) : (
              filtered.map((n) => (
                <div
                  key={n.id}
                  className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-start justify-between gap-3 group"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onNavigate(n.targetTab);
                    }}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {n.title}
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold ${
                          n.severity === 'critical'
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                            : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {n.badge}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {n.subtitle}
                    </div>
                    {n.amount && (
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 font-mono">
                          Due Amount: {n.amount}
                        </span>
                        <span className="text-[9px] font-semibold text-slate-400">
                          Daily until cleared
                        </span>
                      </div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteForToday(n.id, e)}
                    className="mt-0.5 px-2 py-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-[11px] font-medium rounded transition-colors shrink-0"
                    title="Delete for today (will come back tomorrow if not cleared)"
                  >
                    Dismiss
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer info */}
          <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 text-[10px] text-slate-500 flex items-center justify-between gap-2">
            <span>Deleted alerts return tomorrow until cleared</span>
            <div className="flex items-center space-x-2 shrink-0">
              {deletedTodayActiveCount > 0 && filtered.length > 0 && (
                <button
                  type="button"
                  onClick={handleRestoreDeletedToday}
                  className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold"
                  title="Restore alerts deleted earlier today"
                >
                  Restore ({deletedTodayActiveCount})
                </button>
              )}
              {desktopNotifStatus === 'default' && (
                <button
                  type="button"
                  onClick={handleEnableDesktopAlerts}
                  className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold"
                  title="Enable local Windows desktop reminder popups"
                >
                  Desktop Alerts
                </button>
              )}
              {visibleNotifications.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setShowDailyPopup(true);
                  }}
                  className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold"
                >
                  Daily Summary
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Automatic Daily Payment & Alert Reminder Modal (repeats every day until cleared manually) */}
      {showDailyPopup && visibleNotifications.length > 0 && (
        <ModalPortal>
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-xl max-h-[86vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                  <span>Daily Payment &amp; Stock Reminders</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                    {visibleNotifications.length} Pending
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {formatDateDdMmYyyy(new Date())} • Reminds every day from 7 days before due date until cleared manually
                </p>
              </div>
              <button
                type="button"
                onClick={handleDismissForToday}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                title="Dismiss for today (will remind again tomorrow)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Totals Strip */}
            <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-2 text-[11px]">
              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                <div className="text-[10px] font-semibold text-slate-500">Vendor Due ({counts.VENDOR_DUE})</div>
                <div className="font-extrabold text-rose-600 font-mono mt-0.5">
                  {formatIndianCurrency(dailyTotals.vendorTotal)}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                <div className="text-[10px] font-semibold text-slate-500">Customer Due ({counts.CUSTOMER_DUE})</div>
                <div className="font-extrabold text-sky-600 font-mono mt-0.5">
                  {formatIndianCurrency(dailyTotals.customerTotal)}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                <div className="text-[10px] font-semibold text-slate-500">Inventory Alerts</div>
                <div className="font-extrabold text-amber-600 mt-0.5">
                  {counts.INVENTORY} Item{counts.INVENTORY === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            {/* Active Reminder Rows */}
            <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 flex-1">
              {visibleNotifications.map((n) => (
                <div
                  key={n.id}
                  className="px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {n.title}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          n.severity === 'critical'
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                            : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {n.badge}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {n.subtitle}
                    </div>
                    {n.amount && (
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white mt-0.5 font-mono">
                        Pending: {n.amount}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleDeleteForToday(n.id, e)}
                      className="px-2 py-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-semibold rounded transition-colors"
                      title="Dismiss for today (will come back tomorrow)"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleDismissForToday();
                        onNavigate(n.targetTab);
                      }}
                      className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-[11px] font-bold shadow-xs transition-colors"
                    >
                      {n.category === 'INVENTORY' ? 'Check Stock' : 'Clear Payment'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                {desktopNotifStatus === 'default' ? (
                  <button
                    type="button"
                    onClick={handleEnableDesktopAlerts}
                    className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  >
                    Enable Daily Desktop Notifications
                  </button>
                ) : desktopNotifStatus === 'granted' ? (
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Daily Desktop Alerts Active
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    Alerts repeat daily until cleared manually
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleDismissForToday}
                className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs rounded-lg text-xs font-bold shadow-sm transition-colors"
              >
                Remind Me Tomorrow
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
};
