// src/renderer/views/SuppliersView.tsx - Supplier Directory & Accounts Payable
import React, { useState, useEffect, useMemo } from 'react';
import { Decimal } from 'decimal.js';
import {
  Supplier,
  CustomerBankAccount,
  PurchaseInvoice,
  PurchaseOrder,
  SupplierPayment,
} from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import { INDIAN_STATES } from '../../shared/constants';
import { SearchableSelect } from '../components/SearchableSelect';
import { ModalPortal } from '../components/ModalPortal';
import {
  Truck,
  Plus,
  Search,
  Building,
  Building2,
  Phone,
  Mail,
  Edit2,
  Trash2,
  X,
  Landmark,
  Clock,
  Eye,
  Pencil,
  Check,
  Copy,
  Receipt,
  ShoppingBag,
  CreditCard,
  CheckCircle,
  CheckCircle2,
  FileText,
  History,
  Calendar,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  MapPin,
  DollarSign,
  Wallet,
} from 'lucide-react';

function parseLocalDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const part = dateStr.split('T')[0];
  const [y, m, d] = part.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDaysToDate(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function formatShortDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDisplayDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const part = dateStr.split('T')[0];
  const [y, m, d] = part.split('-').map(Number);
  if (!y || !m || !d) return '-';
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${dd}/${mm}/${y}`;
}

function getPurchaseOrderStatusBadge(status: string) {
  switch (status) {
    case 'COMPLETED':
      return {
        label: 'Completed',
        className: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
      };
    case 'SENT':
      return {
        label: 'Sent to Vendor',
        className: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
      };
    case 'PARTIALLY_RECEIVED':
      return {
        label: 'Partially Received',
        className: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        className: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
      };
    default:
      return {
        label: status || 'Draft',
        className: 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      };
  }
}

function getPaymentMethodBadge(method: string) {
  switch (method) {
    case 'UPI':
      return {
        label: 'UPI',
        className: 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
      };
    case 'BANK_TRANSFER':
      return {
        label: 'Bank Transfer / NEFT',
        className: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
      };
    case 'CASH':
      return {
        label: 'Cash',
        className: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
      };
    case 'CHEQUE':
      return {
        label: 'Cheque',
        className: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
      };
    case 'CARD':
      return {
        label: 'Card',
        className: 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
      };
    default:
      return {
        label: method || 'Payment',
        className: 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      };
  }
}

function getBillCountdown(bill: PurchaseInvoice, fallbackTermsDays: number): { daysLeft: number; dueDate: Date } | null {
  const billDt = parseLocalDate(bill.bill_date);
  const explicitDue = parseLocalDate(bill.due_date);
  let dueDate: Date | null = null;

  if (explicitDue && billDt && explicitDue.getTime() > billDt.getTime()) {
    dueDate = explicitDue;
  } else if (billDt && fallbackTermsDays > 0) {
    dueDate = addDaysToDate(billDt, fallbackTermsDays);
  } else if (explicitDue) {
    dueDate = explicitDue;
  }

  if (!dueDate) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
  return { daysLeft, dueDate };
}

interface Props {
  companyId: string;
}

export const SuppliersView: React.FC<Props> = ({ companyId }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseBills, setPurchaseBills] = useState<PurchaseInvoice[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier>>({});
  const [reminderDaysInput, setReminderDaysInput] = useState<string>('');

  // Supplier Overview Window state
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);
  const [supplierActiveTab, setSupplierActiveTab] = useState<'PENDING' | 'OLD' | 'RECEIPTS' | 'HISTORY' | 'PROFILE'>('PENDING');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const stateOptions = useMemo(() => {
    return INDIAN_STATES.map((s) => ({
      value: s.code,
      label: s.name,
      code: s.code,
    }));
  }, []);

  const loadSuppliersSilently = async () => {
    try {
      const [data, bills, orders, payments] = await Promise.all([
        api.getSuppliers(companyId),
        api.getPurchaseInvoices(companyId).catch(() => []),
        api.getPurchaseOrders(companyId).catch(() => []),
        api.getSupplierPayments(companyId).catch(() => []),
      ]);
      setSuppliers(data);
      setPurchaseBills(bills);
      setPurchaseOrders(orders);
      setSupplierPayments(payments);

      // If viewing a supplier, refresh their record live
      if (viewingSupplier) {
        const fresh = data.find((s) => s.id === viewingSupplier.id);
        if (fresh) {
          setViewingSupplier(fresh);
        }
      }
    } catch {
      // ignore silent background errors
    }
  };

  useEffect(() => {
    if (companyId) {
      loadSuppliers();
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;

    const handleSync = () => {
      loadSuppliersSilently();
    };

    const syncTimer = setInterval(() => {
      loadSuppliersSilently();
    }, 3000);

    window.addEventListener('eim-data-changed', handleSync);
    window.addEventListener('eim-data-sync', handleSync);
    window.addEventListener('focus', handleSync);

    return () => {
      clearInterval(syncTimer);
      window.removeEventListener('eim-data-changed', handleSync);
      window.removeEventListener('eim-data-sync', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, [companyId, viewingSupplier?.id]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const [data, bills, orders, payments] = await Promise.all([
        api.getSuppliers(companyId),
        api.getPurchaseInvoices(companyId).catch(() => []),
        api.getPurchaseOrders(companyId).catch(() => []),
        api.getSupplierPayments(companyId).catch(() => []),
      ]);
      setSuppliers(data);
      setPurchaseBills(bills);
      setPurchaseOrders(orders);
      setSupplierPayments(payments);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, type: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedText(type);
      setTimeout(() => setCopiedText(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleOpenView = (s: Supplier) => {
    setViewingSupplier(s);
    setSupplierActiveTab('PENDING');
  };

  // Comprehensive Document Aggregation for viewingSupplier
  const viewingSupplierDocs = useMemo(() => {
    if (!viewingSupplier) {
      return {
        allBills: [] as PurchaseInvoice[],
        pendingBills: [] as PurchaseInvoice[],
        oldBills: [] as PurchaseInvoice[],
        allOrders: [] as PurchaseOrder[],
        pendingOrders: [] as PurchaseOrder[],
        completedOrders: [] as PurchaseOrder[],
        allPayments: [] as SupplierPayment[],
        historyLedger: [] as Array<{
          id: string;
          date: string;
          type: 'BILL' | 'PAYMENT' | 'PURCHASE_ORDER';
          refNumber: string;
          particulars: string;
          debit: string;
          credit: string;
          status: string;
          raw: any;
        }>,
        totalPurchased: '0.00',
        totalOutstanding: '0.00',
        totalSettled: '0.00',
        totalPaid: '0.00',
        totalPoValue: '0.00',
      };
    }

    const sId = viewingSupplier.id;
    const allBills = purchaseBills.filter((b) => b.supplier_id === sId);
    const allOrders = purchaseOrders.filter((o) => o.supplier_id === sId);
    const allPayments = supplierPayments.filter((p) => p.supplier_id === sId);

    // Pending Purchases: bills where balance_amount > 0
    const pendingBills = allBills.filter((b) => Number(b.balance_amount || 0) > 0);
    // Old Purchases: bills where balance_amount <= 0 (or finalized and fully settled)
    const oldBills = allBills.filter((b) => Number(b.balance_amount || 0) <= 0);

    const pendingOrders = allOrders.filter(
      (o) => o.status !== 'CANCELLED' && (o.status as any) !== 'COMPLETED'
    );
    const completedOrders = allOrders.filter((o) => (o.status as any) === 'COMPLETED');

    let sumPurchased = new Decimal(0);
    let sumOutstanding = new Decimal(0);
    let sumSettled = new Decimal(0);

    allBills.forEach((b) => {
      try {
        const grand = new Decimal(b.grand_total || 0);
        const bal = new Decimal(b.balance_amount || 0);
        const paid = new Decimal(b.paid_amount || 0);
        sumPurchased = sumPurchased.plus(grand);
        if (bal.gt(0)) {
          sumOutstanding = sumOutstanding.plus(bal);
        }
        sumSettled = sumSettled.plus(paid);
      } catch {
        // ignore malformed
      }
    });

    let sumPaid = new Decimal(0);
    allPayments.forEach((p) => {
      try {
        sumPaid = sumPaid.plus(new Decimal(p.amount || 0));
      } catch {
        // ignore
      }
    });

    let sumPo = new Decimal(0);
    allOrders.forEach((o) => {
      try {
        sumPo = sumPo.plus(new Decimal(o.grand_total || 0));
      } catch {
        // ignore
      }
    });

    // Chronological History Ledger: Combine Bills, Payments, and Purchase Orders
    interface LedgerItem {
      id: string;
      date: string;
      type: 'BILL' | 'PAYMENT' | 'PURCHASE_ORDER';
      refNumber: string;
      particulars: string;
      debit: string; // purchase/billed (+)
      credit: string; // paid (-)
      status: string;
      raw: any;
    }

    const ledger: LedgerItem[] = [];

    allBills.forEach((b) => {
      const isSettled = Number(b.balance_amount || 0) <= 0;
      ledger.push({
        id: `bill-${b.id}`,
        date: b.bill_date || b.created_at,
        type: 'BILL',
        refNumber: b.bill_number,
        particulars: b.notes ? `Purchase Bill: ${b.notes}` : `Purchase Bill #${b.bill_number}`,
        debit: b.grand_total,
        credit: '0.00',
        status: isSettled ? 'Settled' : 'Pending',
        raw: b,
      });
    });

    allPayments.forEach((p) => {
      ledger.push({
        id: `pay-${p.id}`,
        date: p.payment_date || p.created_at,
        type: 'PAYMENT',
        refNumber: p.payment_number,
        particulars: `Paid via ${p.payment_method}${p.reference_number ? ` (Ref: ${p.reference_number})` : ''}${p.notes ? ` - ${p.notes}` : ''}`,
        debit: '0.00',
        credit: p.amount,
        status: p.payment_method,
        raw: p,
      });
    });

    allOrders.forEach((o) => {
      ledger.push({
        id: `po-${o.id}`,
        date: o.po_date || o.created_at,
        type: 'PURCHASE_ORDER',
        refNumber: o.po_number,
        particulars: `Purchase Order (${o.items?.length || 0} items)${o.notes ? ` - ${o.notes}` : ''}`,
        debit: o.grand_total,
        credit: '0.00',
        status: o.status,
        raw: o,
      });
    });

    ledger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      allBills,
      pendingBills,
      oldBills,
      allOrders,
      pendingOrders,
      completedOrders,
      allPayments: [...allPayments].sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()),
      historyLedger: ledger,
      totalPurchased: sumPurchased.toFixed(2),
      totalOutstanding: sumOutstanding.toFixed(2),
      totalSettled: sumSettled.toFixed(2),
      totalPaid: sumPaid.toFixed(2),
      totalPoValue: sumPo.toFixed(2),
    };
  }, [viewingSupplier, purchaseBills, purchaseOrders, supplierPayments]);

  const handleSave = async () => {
    if (!editingSupplier.name || !editingSupplier.mobile) {
      alert('Company Name and Mobile are required');
      return;
    }

    const parsedReminderDays = reminderDaysInput.trim()
      ? Math.max(0, Math.round(Number(reminderDaysInput) || 0))
      : 0;
    const payload: Partial<Supplier> = {
      ...editingSupplier,
      payment_terms_days: parsedReminderDays,
    };

    try {
      if (editingSupplier.id) {
        await api.updateSupplier(companyId, editingSupplier.id, payload);
      } else {
        await api.createSupplier(companyId, payload);
      }
      setIsModalOpen(false);
      setEditingSupplier({});
      setReminderDaysInput('');
      await loadSuppliers();
    } catch (err: any) {
      alert(err.message || 'Error saving supplier');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Archive this supplier?')) return;
    try {
      await api.deleteSupplier(companyId, id);
      if (viewingSupplier?.id === id) {
        setViewingSupplier(null);
      }
      await loadSuppliers();
    } catch (err: any) {
      alert(err.message || 'Error archiving supplier');
    }
  };

  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier({
      ...s,
      additional_bank_accounts: s.additional_bank_accounts
        ? s.additional_bank_accounts.map((b) => ({ ...b }))
        : [],
    });
    setReminderDaysInput(s.payment_terms_days > 0 ? String(s.payment_terms_days) : '');
    setIsModalOpen(true);
  };

  const handleAddBankAccount = () => {
    setEditingSupplier((prev) => ({
      ...prev,
      additional_bank_accounts: [
        ...(prev.additional_bank_accounts || []),
        { bank_name: '', bank_account_no: '', bank_ifsc: '', bank_branch: '' },
      ],
    }));
  };

  const handleUpdateBankAccount = (index: number, field: keyof CustomerBankAccount, value: string) => {
    setEditingSupplier((prev) => {
      const list = [...(prev.additional_bank_accounts || [])];
      list[index] = {
        ...list[index],
        [field]: field === 'bank_ifsc' ? value.toUpperCase() : value,
      };
      return { ...prev, additional_bank_accounts: list };
    });
  };

  const handleRemoveBankAccount = (index: number) => {
    setEditingSupplier((prev) => ({
      ...prev,
      additional_bank_accounts: (prev.additional_bank_accounts || []).filter((_, i) => i !== index),
    }));
  };

  const filtered = suppliers.filter((s) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.company_name && s.company_name.toLowerCase().includes(q)) ||
        s.mobile.includes(q) ||
        (s.gstin && s.gstin.toLowerCase().includes(q)) ||
        (s.bank_name && s.bank_name.toLowerCase().includes(q)) ||
        (s.bank_account_no && s.bank_account_no.includes(q))
      );
    }
    return true;
  });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
            Suppliers & Accounts Payable
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage vendors, distributors, and supplier payment balances
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingSupplier({
              state: 'Maharashtra',
              state_code: '27',
              additional_bank_accounts: [],
            });
            setReminderDaysInput('');
            setIsModalOpen(true);
          }}
          className="inline-flex items-center space-x-1.5 px-4 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer"
        >
          <span>Add Supplier</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
        <div className="relative w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search company name, mobile, GST Number, bank..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Company Name</th>
              <th className="py-3 px-4">Mobile & Email</th>
              <th className="py-3 px-4">GST Number</th>
              <th className="py-3 px-4">State</th>
              <th className="py-3 px-4">Payment Reminder</th>
              <th className="py-3 px-4 text-right">Outstanding Payable</th>
              <th className="py-3 px-4">Address</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  No suppliers found. Click "+ Add Supplier" to record your vendors.
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const pendingBills = purchaseBills
                  .filter((b) => b.supplier_id === s.id && Number(b.balance_amount) > 0)
                  .map((b) => ({ bill: b, countdown: getBillCountdown(b, s.payment_terms_days || 0) }))
                  .filter((item): item is { bill: PurchaseInvoice; countdown: { daysLeft: number; dueDate: Date } } => item.countdown !== null)
                  .sort((a, b) => a.countdown.daysLeft - b.countdown.daysLeft);
                const urgent = pendingBills[0];

                return (
                <tr
                  key={s.id}
                  onClick={() => handleOpenView(s)}
                  className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors group"
                  title="Click to view pending purchases, old purchases, paid receipts & history for this supplier"
                >
                  <td className="py-3 px-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenView(s);
                      }}
                      className="text-left font-bold text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 focus:outline-none cursor-pointer transition-colors"
                      title="Click to view purchases, receipts & history"
                    >
                      {s.name}
                    </button>
                    {s.company_name && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">{s.company_name}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    <div>{s.mobile}{s.email ? ` • ${s.email}` : ''}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    <div>{s.gstin || '-'}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    <div>{s.state} ({s.state_code}){s.pin_code ? ` - ${s.pin_code}` : ''}</div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300">
                    {urgent ? (
                      <span
                        className="font-medium"
                        title={pendingBills
                          .map(
                            (p) =>
                              `${p.bill.bill_number}: Due ${formatShortDate(p.countdown.dueDate)}`
                          )
                          .join('\n')}
                      >
                        {urgent.countdown.daysLeft < 0
                          ? `Overdue by ${Math.abs(urgent.countdown.daysLeft)}d`
                          : urgent.countdown.daysLeft === 0
                            ? 'Due Today'
                            : `${urgent.countdown.daysLeft}d left`}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    {formatIndianCurrency(s.current_balance)}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 max-w-xs whitespace-nowrap truncate" title={s.address}>
                    <span className="truncate">{s.address || '-'}</span>
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center space-x-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleOpenView(s)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-medium text-brand-700 dark:text-brand-300 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/50 dark:hover:bg-brand-900/60 border border-brand-200 dark:border-brand-800 rounded-md transition-colors cursor-pointer"
                        title="View Pending Purchases, Old Purchases, Paid Receipts & History"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(s)}
                        className="p-1 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
                        title="Edit Supplier Profile & Settings"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* -------------------- Comprehensive Supplier Overview Modal -------------------- */}
      {viewingSupplier && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3.5">
                  <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                    {(viewingSupplier.name || 'S').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2.5 flex-wrap">
                      <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                        {viewingSupplier.name}
                      </h2>
                      {viewingSupplier.company_name && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          ({viewingSupplier.company_name})
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800">
                        Supplier / Vendor
                      </span>
                    </div>

                    {/* Quick Contacts Bar */}
                    <div className="flex items-center space-x-4 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap gap-y-1">
                      {viewingSupplier.mobile && (
                        <div className="flex items-center space-x-1">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium text-slate-700 dark:text-slate-300">{viewingSupplier.mobile}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(viewingSupplier.mobile, 'phone')}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-0.5 cursor-pointer"
                            title="Copy Phone"
                          >
                            {copiedText === 'phone' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      )}
                      {viewingSupplier.email && (
                        <div className="flex items-center space-x-1">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-slate-600 dark:text-slate-300">{viewingSupplier.email}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(viewingSupplier.email!, 'email')}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-0.5 cursor-pointer"
                            title="Copy Email"
                          >
                            {copiedText === 'email' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      )}
                      {viewingSupplier.gstin && (
                        <div className="flex items-center space-x-1 font-mono text-[11px]">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">GST: {viewingSupplier.gstin}</span>
                        </div>
                      )}
                      {viewingSupplier.state && (
                        <div className="flex items-center space-x-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{(viewingSupplier as any).city ? `${(viewingSupplier as any).city}, ` : ''}{viewingSupplier.state} ({viewingSupplier.state_code})</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center space-x-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(viewingSupplier)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    title="Edit Supplier Profile & Bank Details"
                  >
                    <Pencil className="w-3.5 h-3.5 text-amber-500" />
                    <span>Edit Supplier</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingSupplier(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Summary Metrics Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-700 text-xs">
                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-medium text-[11px] uppercase tracking-wider">Pending Payable</span>
                    <ShoppingBag className="w-3.5 h-3.5 text-rose-500" />
                  </div>
                  <div className={`text-base font-extrabold ${Number(viewingSupplierDocs.totalOutstanding) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {formatIndianCurrency(viewingSupplierDocs.totalOutstanding)}
                  </div>
                  <div className="text-[11px] font-semibold mt-0.5 text-slate-500 dark:text-slate-400">
                    {viewingSupplierDocs.pendingBills.length} pending bill{viewingSupplierDocs.pendingBills.length !== 1 ? 's' : ''}
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-medium text-[11px] uppercase tracking-wider">Old Purchases Settled</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white">
                    {viewingSupplierDocs.oldBills.length}
                  </div>
                  <div className="text-[11px] font-semibold mt-0.5 text-emerald-600 dark:text-emerald-400">
                    Settled: {formatIndianCurrency(viewingSupplierDocs.totalSettled)}
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-medium text-[11px] uppercase tracking-wider">Paid Receipts</span>
                    <Receipt className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white">
                    {viewingSupplierDocs.allPayments.length}
                  </div>
                  <div className="text-[11px] font-semibold mt-0.5 text-blue-600 dark:text-blue-400">
                    Paid: {formatIndianCurrency(viewingSupplierDocs.totalPaid)}
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-medium text-[11px] uppercase tracking-wider">Total Purchases</span>
                    <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white">
                    {formatIndianCurrency(viewingSupplierDocs.totalPurchased)}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {viewingSupplierDocs.allBills.length} total bill{viewingSupplierDocs.allBills.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {/* Tabs Navigation */}
              <div className="flex items-center px-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-x-1 overflow-x-auto text-xs">
                <button
                  type="button"
                  onClick={() => setSupplierActiveTab('PENDING')}
                  className={`py-3 px-3.5 font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer ${
                    supplierActiveTab === 'PENDING'
                      ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Pending Purchases</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    supplierActiveTab === 'PENDING'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {viewingSupplierDocs.pendingBills.length + viewingSupplierDocs.pendingOrders.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSupplierActiveTab('OLD')}
                  className={`py-3 px-3.5 font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer ${
                    supplierActiveTab === 'OLD'
                      ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Old Purchases</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    supplierActiveTab === 'OLD'
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {viewingSupplierDocs.oldBills.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSupplierActiveTab('RECEIPTS')}
                  className={`py-3 px-3.5 font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer ${
                    supplierActiveTab === 'RECEIPTS'
                      ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Paid Receipts</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    supplierActiveTab === 'RECEIPTS'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {viewingSupplierDocs.allPayments.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSupplierActiveTab('HISTORY')}
                  className={`py-3 px-3.5 font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer ${
                    supplierActiveTab === 'HISTORY'
                      ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Purchase History</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    supplierActiveTab === 'HISTORY'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {viewingSupplierDocs.historyLedger.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSupplierActiveTab('PROFILE')}
                  className={`py-3 px-3.5 font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer ${
                    supplierActiveTab === 'PROFILE'
                      ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Supplier Info & Bank</span>
                </button>
              </div>

              {/* Tab Body */}
              <div className="flex-1 overflow-y-auto p-6 text-xs">
                {/* TAB 1: PENDING PURCHASES */}
                {supplierActiveTab === 'PENDING' && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                          Pending & Unpaid Purchase Bills ({viewingSupplierDocs.pendingBills.length})
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Bills with outstanding payable balances and upcoming due dates
                        </p>
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 text-xs">
                        Total Pending Balance: <span className="font-extrabold text-rose-600 dark:text-rose-400 text-sm">{formatIndianCurrency(viewingSupplierDocs.totalOutstanding)}</span>
                      </div>
                    </div>

                    {viewingSupplierDocs.pendingBills.length === 0 ? (
                      <div className="py-10 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                        <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto opacity-80" />
                        <div className="font-semibold text-slate-700 dark:text-slate-200">No Pending Purchase Bills!</div>
                        <div className="text-[11px]">All purchase bills from this supplier are fully settled and paid.</div>
                      </div>
                    ) : (
                      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto shadow-2xs">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                            <tr>
                              <th className="py-2.5 px-3">Bill Number</th>
                              <th className="py-2.5 px-3">Bill Date</th>
                              <th className="py-2.5 px-3">Due / Countdown</th>
                              <th className="py-2.5 px-3 text-right">Total Amount</th>
                              <th className="py-2.5 px-3 text-right">Paid So Far</th>
                              <th className="py-2.5 px-3 text-right">Balance Due</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {viewingSupplierDocs.pendingBills.map((b) => {
                              const countdown = getBillCountdown(b, viewingSupplier.payment_terms_days || 0);
                              return (
                                <tr key={b.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20">
                                  <td className="py-2.5 px-3 font-bold font-mono text-slate-900 dark:text-slate-100">
                                    {b.bill_number}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                    {formatDisplayDate(b.bill_date)}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {countdown ? (
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                          countdown.daysLeft < 0
                                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                            : countdown.daysLeft <= 3
                                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                              : 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                                        }`}
                                      >
                                        {countdown.daysLeft < 0
                                          ? `Overdue by ${Math.abs(countdown.daysLeft)}d`
                                          : countdown.daysLeft === 0
                                            ? 'Due Today'
                                            : `${countdown.daysLeft}d left`}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                                    {formatIndianCurrency(b.grand_total)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-medium text-emerald-600 dark:text-emerald-400">
                                    {formatIndianCurrency(b.paid_amount || '0.00')}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-extrabold text-rose-600 dark:text-rose-400">
                                    {formatIndianCurrency(b.balance_amount)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Open Purchase Orders Sub-section */}
                    {viewingSupplierDocs.pendingOrders.length > 0 && (
                      <div className="pt-2 space-y-3">
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-xs flex items-center space-x-1.5">
                          <FileText className="w-3.5 h-3.5 text-blue-500" />
                          <span>Open Purchase Orders ({viewingSupplierDocs.pendingOrders.length})</span>
                        </div>
                        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto shadow-2xs">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                              <tr>
                                <th className="py-2.5 px-3">PO Number</th>
                                <th className="py-2.5 px-3">PO Date</th>
                                <th className="py-2.5 px-3">Expected Delivery</th>
                                <th className="py-2.5 px-3">Status</th>
                                <th className="py-2.5 px-3 text-right">PO Total Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {viewingSupplierDocs.pendingOrders.map((o) => {
                                const badge = getPurchaseOrderStatusBadge(o.status);
                                return (
                                  <tr key={o.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20">
                                    <td className="py-2.5 px-3 font-bold font-mono text-slate-900 dark:text-slate-100">
                                      {o.po_number}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                      {formatDisplayDate(o.po_date)}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                      {formatDisplayDate(o.expected_delivery_date)}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.className}`}>
                                        {badge.label}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900 dark:text-white">
                                      {formatIndianCurrency(o.grand_total)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: OLD PURCHASES */}
                {supplierActiveTab === 'OLD' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                          Old & Completed Purchases ({viewingSupplierDocs.oldBills.length})
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Past purchase invoices that have been fully paid and cleared with ₹0 balance
                        </p>
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 text-xs">
                        Total Settled: <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">{formatIndianCurrency(viewingSupplierDocs.totalSettled)}</span>
                      </div>
                    </div>

                    {viewingSupplierDocs.oldBills.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                        <CheckCircle2 className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                        <div className="font-semibold text-slate-600 dark:text-slate-300">No Settled Purchases Yet</div>
                        <div className="text-[11px]">Purchases will appear here once they are fully paid with ₹0 outstanding balance.</div>
                      </div>
                    ) : (
                      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto shadow-2xs">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                            <tr>
                              <th className="py-2.5 px-3">Bill Number</th>
                              <th className="py-2.5 px-3">Bill Date</th>
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 px-3 text-right">Bill Amount</th>
                              <th className="py-2.5 px-3 text-right">Settled Amount</th>
                              <th className="py-2.5 px-3 text-right">Balance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {viewingSupplierDocs.oldBills.map((b) => (
                              <tr key={b.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20">
                                <td className="py-2.5 px-3 font-bold font-mono text-slate-900 dark:text-slate-100">
                                  {b.bill_number}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                  {formatDisplayDate(b.bill_date)}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                                    Settled / Paid
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                                  {formatIndianCurrency(b.grand_total)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  {formatIndianCurrency(b.paid_amount || b.grand_total)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                                  ₹ 0.00
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: PAID RECEIPTS */}
                {supplierActiveTab === 'RECEIPTS' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                          Paid Receipts & Vouchers ({viewingSupplierDocs.allPayments.length})
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          All outbound payments and settlement receipts recorded for this vendor
                        </p>
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 text-xs">
                        Total Paid: <span className="font-extrabold text-blue-600 dark:text-blue-400 text-sm">{formatIndianCurrency(viewingSupplierDocs.totalPaid)}</span>
                      </div>
                    </div>

                    {viewingSupplierDocs.allPayments.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                        <Receipt className="w-8 h-8 text-blue-400 mx-auto opacity-70" />
                        <div className="font-semibold text-slate-600 dark:text-slate-300">No Payment Receipts Recorded Yet</div>
                        <div className="text-[11px]">Outbound payments recorded under Payments (AR/AP) will automatically appear here.</div>
                      </div>
                    ) : (
                      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto shadow-2xs">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                            <tr>
                              <th className="py-2.5 px-3">Voucher / Receipt #</th>
                              <th className="py-2.5 px-3">Payment Date</th>
                              <th className="py-2.5 px-3">Payment Mode</th>
                              <th className="py-2.5 px-3">Bank / Reference #</th>
                              <th className="py-2.5 px-3">Notes</th>
                              <th className="py-2.5 px-3 text-right">Amount Paid</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {viewingSupplierDocs.allPayments.map((p) => {
                              const badge = getPaymentMethodBadge(p.payment_method);
                              return (
                                <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20">
                                  <td className="py-2.5 px-3 font-bold font-mono text-slate-900 dark:text-slate-100">
                                    {p.payment_number}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                    {formatDisplayDate(p.payment_date)}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.className}`}>
                                      {badge.label}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                    {p.reference_number || p.bank_account || '-'}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 max-w-xs truncate" title={p.notes}>
                                    {p.notes || '-'}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-extrabold text-blue-600 dark:text-blue-400">
                                    {formatIndianCurrency(p.amount)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: PURCHASE HISTORY */}
                {supplierActiveTab === 'HISTORY' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                          Complete Purchase &amp; Payment History ({viewingSupplierDocs.historyLedger.length})
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Chronological timeline of all purchase bills, paid receipts, and purchase orders
                        </p>
                      </div>
                      <div className="flex items-center space-x-3 text-xs">
                        <div className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 rounded-md">
                          <span className="text-slate-500 dark:text-slate-400">Purchases: </span>
                          <span className="font-bold text-slate-800 dark:text-slate-100">{formatIndianCurrency(viewingSupplierDocs.totalPurchased)}</span>
                        </div>
                        <div className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 rounded-md">
                          <span className="text-blue-600 dark:text-blue-400">Paid: </span>
                          <span className="font-bold text-blue-700 dark:text-blue-300">{formatIndianCurrency(viewingSupplierDocs.totalPaid)}</span>
                        </div>
                        <div className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 rounded-md">
                          <span className="text-rose-600 dark:text-rose-400">Payable: </span>
                          <span className="font-bold text-rose-700 dark:text-rose-300">{formatIndianCurrency(viewingSupplierDocs.totalOutstanding)}</span>
                        </div>
                      </div>
                    </div>

                    {viewingSupplierDocs.historyLedger.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                        <History className="w-8 h-8 text-purple-400 mx-auto opacity-70" />
                        <div className="font-semibold text-slate-600 dark:text-slate-300">No Transaction History Yet</div>
                        <div className="text-[11px]">Purchase invoices and payment receipts will build a historical ledger here.</div>
                      </div>
                    ) : (
                      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto shadow-2xs">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                            <tr>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">Type</th>
                              <th className="py-2.5 px-3">Reference #</th>
                              <th className="py-2.5 px-3">Particulars / Notes</th>
                              <th className="py-2.5 px-3 text-right">Debit / Billed (+)</th>
                              <th className="py-2.5 px-3 text-right">Credit / Paid (-)</th>
                              <th className="py-2.5 px-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {viewingSupplierDocs.historyLedger.map((item) => (
                              <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20">
                                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  {formatDisplayDate(item.date)}
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      item.type === 'BILL'
                                        ? 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                                        : item.type === 'PAYMENT'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                          : 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                                    }`}
                                  >
                                    {item.type === 'BILL'
                                      ? 'Purchase Bill'
                                      : item.type === 'PAYMENT'
                                        ? 'Paid Receipt'
                                        : 'Purchase Order'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-bold font-mono text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                  {item.refNumber}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 max-w-sm truncate" title={item.particulars}>
                                  {item.particulars}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                  {Number(item.debit) > 0 ? formatIndianCurrency(item.debit) : '-'}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                  {Number(item.credit) > 0 ? formatIndianCurrency(item.credit) : '-'}
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                    {item.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 5: SUPPLIER INFO & BANK */}
                {supplierActiveTab === 'PROFILE' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Bank Account Details */}
                      <div className="p-4 bg-slate-50/70 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                          <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                            <Building className="w-4 h-4 text-brand-600" />
                            <span>Primary Settlement Bank Account</span>
                          </div>
                        </div>

                        {viewingSupplier.bank_name || viewingSupplier.bank_account_no ? (
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Bank Name:</span>
                              <span className="font-bold text-slate-800 dark:text-slate-100">{viewingSupplier.bank_name || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Account Number:</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{viewingSupplier.bank_account_no || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">IFSC Code:</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{viewingSupplier.bank_ifsc || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Branch:</span>
                              <span className="text-slate-800 dark:text-slate-100">{viewingSupplier.bank_branch || '-'}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-400 text-center py-4">No primary bank account recorded yet.</div>
                        )}

                        {/* Additional Bank Accounts */}
                        {viewingSupplier.additional_bank_accounts && viewingSupplier.additional_bank_accounts.length > 0 && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                              Additional Bank Accounts ({viewingSupplier.additional_bank_accounts.length})
                            </div>
                            {viewingSupplier.additional_bank_accounts.map((b, idx) => (
                              <div key={idx} className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1 text-xs">
                                <div className="font-bold text-slate-800 dark:text-slate-100">{b.bank_name || `Bank #${idx + 2}`}</div>
                                <div className="flex justify-between text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                                  <span>A/c: {b.bank_account_no || '-'}</span>
                                  <span>IFSC: {b.bank_ifsc || '-'}</span>
                                </div>
                                {b.bank_branch && <div className="text-[10px] text-slate-400">{b.bank_branch}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Address & Tax Details */}
                      <div className="p-4 bg-slate-50/70 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                          <MapPin className="w-4 h-4 text-brand-600" />
                          <span>Address &amp; GST Details</span>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">GST Number:</span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{viewingSupplier.gstin || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">PAN:</span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{viewingSupplier.pan || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">State &amp; Code:</span>
                            <span className="font-medium text-slate-800 dark:text-slate-100">{viewingSupplier.state} ({viewingSupplier.state_code})</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">PIN Code:</span>
                            <span className="font-mono text-slate-800 dark:text-slate-100">{viewingSupplier.pin_code || '-'}</span>
                          </div>
                          <div className="pt-1">
                            <span className="text-slate-500 block mb-0.5">Address:</span>
                            <div className="p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                              {viewingSupplier.address || 'No address specified'}
                            </div>
                          </div>
                          <div className="flex justify-between pt-1">
                            <span className="text-slate-500 flex items-center space-x-1">
                              <Clock className="w-3.5 h-3.5 text-brand-600" />
                              <span>Payment Reminder Terms:</span>
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-100">
                              {viewingSupplier.payment_terms_days ? `${viewingSupplier.payment_terms_days} days` : 'Immediate / No terms'}
                            </span>
                          </div>
                          {viewingSupplier.notes && (
                            <div className="pt-1">
                              <span className="text-slate-500 block mb-0.5">Notes:</span>
                              <div className="p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 italic">
                                {viewingSupplier.notes}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between text-xs">
                <div className="text-slate-500 dark:text-slate-400">
                  Showing complete records for <strong className="text-slate-700 dark:text-slate-200">{viewingSupplier.name}</strong>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(viewingSupplier)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5 text-amber-500" />
                    <span>Edit Supplier</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingSupplier(null)}
                    className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Add / Edit Supplier Modal */}
      {isModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <span>{editingSupplier.id ? 'Edit Supplier' : 'Add New Supplier'}</span>
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="col-span-2">
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Company Name *</label>
                  </div>
                  <input
                    type="text"
                    placeholder="Company Name"
                    value={editingSupplier.name || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Mobile Phone *</label>
                  </div>
                  <input
                    type="text"
                    placeholder="Mobile"
                    value={editingSupplier.mobile || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, mobile: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Email</label>
                  </div>
                  <input
                    type="email"
                    placeholder="orders@vendor.com"
                    value={editingSupplier.email || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, email: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">GST Number</label>
                  </div>
                  <input
                    type="text"
                    placeholder="15-character GST Number"
                    value={editingSupplier.gstin || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, gstin: e.target.value.toUpperCase() })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono uppercase bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">PAN</label>
                  </div>
                  <input
                    type="text"
                    placeholder="10-digit PAN"
                    value={editingSupplier.pan || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, pan: e.target.value.toUpperCase() })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono uppercase bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Address</label>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Street Address, Area, City"
                    value={editingSupplier.address || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, address: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2.5 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">State & Code *</label>
                  </div>
                  <SearchableSelect
                    options={stateOptions}
                    value={editingSupplier.state_code || editingSupplier.state || '27'}
                    onChange={(val) => {
                      const st = INDIAN_STATES.find((s) => s.code === val);
                      setEditingSupplier({
                        ...editingSupplier,
                        state_code: val,
                        state: st?.name || '',
                      });
                    }}
                    placeholder="Type state name or code (e.g. Maharashtra or 27)..."
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">PIN Code</label>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="e.g. 400001"
                    value={editingSupplier.pin_code || ''}
                    onChange={(e) =>
                      setEditingSupplier({
                        ...editingSupplier,
                        pin_code: e.target.value.replace(/[^0-9]/g, '').slice(0, 6),
                      })
                    }
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-brand-600" />
                      <span>Payment Reminder (Days to Pay Vendor)</span>
                    </label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      placeholder="e.g. 15"
                      value={reminderDaysInput}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        if (!raw || raw === '0') {
                          setReminderDaysInput('');
                        } else {
                          setReminderDaysInput(String(Math.min(365, parseInt(raw, 10))));
                        }
                      }}
                      className="w-36 h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Days remaining countdown starts automatically whenever you create a purchase bill from this vendor.
                    </span>
                  </div>
                </div>

                {/* Bank Details section matching creating a company */}
                <div className="col-span-2 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <Building className="w-3.5 h-3.5 text-brand-600" />
                      <span>Bank Account Details</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Bank and settlement details for direct vendor payments, NEFT/RTGS, and records
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddBankAccount}
                    className="inline-flex items-center space-x-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Another Bank Account</span>
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Bank Name</label>
                  </div>
                  <input
                    type="text"
                    value={editingSupplier.bank_name || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, bank_name: e.target.value })}
                    placeholder="State Bank of India"
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Bank Account Number</label>
                  </div>
                  <input
                    type="text"
                    value={editingSupplier.bank_account_no || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, bank_account_no: e.target.value })}
                    placeholder="Account Number"
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">IFSC Code</label>
                  </div>
                  <input
                    type="text"
                    value={editingSupplier.bank_ifsc || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, bank_ifsc: e.target.value.toUpperCase() })}
                    placeholder="e.g. SBIN0001234"
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono uppercase bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Branch Details</label>
                  </div>
                  <input
                    type="text"
                    value={editingSupplier.bank_branch || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, bank_branch: e.target.value })}
                    placeholder="e.g. Main Branch, MG Road"
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>

                {/* Additional Bank Accounts */}
                {(editingSupplier.additional_bank_accounts || []).map((bank, idx) => (
                  <div
                    key={idx}
                    className="col-span-2 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-700 pb-1.5">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                        Additional Bank Account #{idx + 2}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveBankAccount(idx)}
                        className="inline-flex items-center space-x-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 px-1.5 py-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
                        title="Remove this bank account"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bank Name</label>
                        <input
                          type="text"
                          value={bank.bank_name || ''}
                          onChange={(e) => handleUpdateBankAccount(idx, 'bank_name', e.target.value)}
                          placeholder="e.g. HDFC Bank"
                          className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bank Account Number</label>
                        <input
                          type="text"
                          value={bank.bank_account_no || ''}
                          onChange={(e) => handleUpdateBankAccount(idx, 'bank_account_no', e.target.value)}
                          placeholder="Account Number"
                          className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">IFSC Code</label>
                        <input
                          type="text"
                          value={bank.bank_ifsc || ''}
                          onChange={(e) => handleUpdateBankAccount(idx, 'bank_ifsc', e.target.value)}
                          placeholder="e.g. HDFC0001234"
                          className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Branch Details</label>
                        <input
                          type="text"
                          value={bank.bank_branch || ''}
                          onChange={(e) => handleUpdateBankAccount(idx, 'bank_branch', e.target.value)}
                          placeholder="e.g. Civil Lines Branch"
                          className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Notes / Extra Company Details */}
                <div className="col-span-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Notes / Extra Company Details
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Additional vendor details, remarks, or extra columns imported from Excel..."
                    value={editingSupplier.notes || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, notes: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded p-2 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div>
                {editingSupplier.id && (
                  <button
                    type="button"
                    onClick={() => {
                      const idToDelete = editingSupplier.id;
                      if (idToDelete) {
                        handleDelete(idToDelete);
                        setIsModalOpen(false);
                      }
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors border border-rose-200 dark:border-rose-900/50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Supplier</span>
                  </button>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-xs font-semibold shadow-xs"
                >
                  Save Supplier
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
};
