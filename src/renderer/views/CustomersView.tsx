// src/renderer/views/CustomersView.tsx - Customer Directory & Accounts Receivable
import React, { useState, useEffect, useMemo } from 'react';
import { Customer, CustomerBankAccount, CustomerType, CUSTOMER_TYPE_OPTIONS, Invoice, Quotation } from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import { INDIAN_STATES } from '../../shared/constants';
import { SearchableSelect } from '../components/SearchableSelect';
import { ModalPortal } from '../components/ModalPortal';
import {
  Users,
  Plus,
  Search,
  Building,
  User,
  Phone,
  Mail,
  MapPin,
  Edit2,
  Trash2,
  X,
  Clock,
  FileText,
  CheckCircle,
  Receipt,
  Pencil,
  Eye,
  Building2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Calendar,
  CreditCard,
  Briefcase,
  DollarSign,
  ArrowRight,
  TrendingUp,
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
  const d = parseLocalDate(dateStr);
  return d ? formatShortDate(d) : dateStr.split('T')[0];
}

function getInvoiceCountdown(inv: Invoice, fallbackTermsDays: number): { daysLeft: number; dueDate: Date } | null {
  const invDt = parseLocalDate(inv.invoice_date);
  const explicitDue = parseLocalDate(inv.due_date);
  let dueDate: Date | null = null;

  if (explicitDue && invDt && explicitDue.getTime() > invDt.getTime()) {
    dueDate = explicitDue;
  } else if (invDt && fallbackTermsDays > 0) {
    dueDate = addDaysToDate(invDt, fallbackTermsDays);
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

const normalizeCustomerType = (type?: string): CustomerType => {
  switch (type) {
    case 'GOVERNMENT':
    case 'CENTRAL_GOVERNMENT':
    case 'STATE_GOVERNMENT':
    case 'PUBLIC_SECTOR':
      return 'GOVERNMENT';
    case 'INFRASTRUCTURE':
      return 'INFRASTRUCTURE';
    case 'EDUCATION':
      return 'EDUCATION';
    case 'CORPORATE':
    case 'PRIVATE_COMPANY':
    case 'BUSINESS':
    case 'INDIVIDUAL':
    default:
      return 'CORPORATE';
  }
};

const getCustomerTypeBadge = (type?: string) => {
  const normalized = normalizeCustomerType(type);
  switch (normalized) {
    case 'GOVERNMENT':
      return {
        label: 'Government',
        className: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
      };
    case 'INFRASTRUCTURE':
      return {
        label: 'Infrastructure',
        className: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
      };
    case 'CORPORATE':
      return {
        label: 'Corporate',
        className: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
      };
    case 'EDUCATION':
      return {
        label: 'Education',
        className: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700',
      };
  }
};

export const CustomersView: React.FC<Props> = ({ companyId }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer>>({});
  const [reminderDaysInput, setReminderDaysInput] = useState<string>('');

  // Customer Overview & Documents Modal
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [customerActiveTab, setCustomerActiveTab] = useState<'INVOICES' | 'QUOTATIONS' | 'COMPLETED' | 'PROFILE'>('INVOICES');
  const [copiedText, setCopiedText] = useState<string>('');

  const stateOptions = useMemo(() => {
    return INDIAN_STATES.map((s) => ({
      value: s.code,
      label: s.name,
      code: s.code,
    }));
  }, []);

  const customerTypeOptions = useMemo(() => {
    return CUSTOMER_TYPE_OPTIONS.map((opt) => ({
      value: opt.value,
      label: opt.label,
    }));
  }, []);

  useEffect(() => {
    if (companyId) {
      loadCustomers();
    }
  }, [companyId]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const [data, invList, qList] = await Promise.all([
        api.getCustomers(companyId),
        api.getInvoices(companyId).catch(() => []),
        api.getQuotations(companyId).catch(() => []),
      ]);
      setCustomers(data);
      setInvoices(invList);
      setQuotations(qList);
      setViewingCustomer((prev) => {
        if (!prev) return null;
        return data.find((c) => c.id === prev.id) || prev;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingCustomer.name || !editingCustomer.mobile) {
      alert('Customer Name and Mobile number are required');
      return;
    }

    const parsedReminderDays = reminderDaysInput.trim()
      ? Math.max(0, Math.round(Number(reminderDaysInput) || 0))
      : 0;
    const payload: Partial<Customer> = {
      ...editingCustomer,
      payment_terms_days: parsedReminderDays,
    };

    try {
      if (editingCustomer.id) {
        await api.updateCustomer(companyId, editingCustomer.id, payload);
      } else {
        await api.createCustomer(companyId, payload);
      }
      setIsModalOpen(false);
      setEditingCustomer({});
      setReminderDaysInput('');
      await loadCustomers();
    } catch (err: any) {
      alert(err.message || 'Error saving customer');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Archive this customer?')) return;
    try {
      await api.deleteCustomer(companyId, id);
      if (viewingCustomer?.id === id) {
        setViewingCustomer(null);
      }
      await loadCustomers();
    } catch (err: any) {
      alert(err.message || 'Error archiving customer');
    }
  };

  const handleOpenView = (c: Customer) => {
    setViewingCustomer(c);
    setCustomerActiveTab('INVOICES');
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer({
      ...c,
      additional_bank_accounts: c.additional_bank_accounts
        ? c.additional_bank_accounts.map((b) => ({ ...b }))
        : [],
    });
    setReminderDaysInput(c.payment_terms_days > 0 ? String(c.payment_terms_days) : '');
    setIsModalOpen(true);
  };

  const handleCopy = (text: string, label: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 1500);
  };

  const getQuotationStatusBadge = (status?: string) => {
    switch (status) {
      case 'ACCEPTED':
        return {
          label: 'Accepted',
          className: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        };
      case 'CONVERTED':
        return {
          label: 'Converted to Invoice',
          className: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
        };
      case 'SENT':
        return {
          label: 'Sent to Client',
          className: 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
        };
      case 'DRAFT':
        return {
          label: 'Draft',
          className: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
        };
      case 'REJECTED':
        return {
          label: 'Rejected',
          className: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
        };
      case 'EXPIRED':
        return {
          label: 'Expired',
          className: 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
        };
      default:
        return {
          label: status || 'Draft',
          className: 'bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400',
        };
    }
  };

  const getInvoiceStatusBadge = (inv: Invoice) => {
    if (inv.status === 'CANCELLED') {
      return {
        label: 'Cancelled',
        className: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
      };
    }
    if (inv.status === 'DRAFT') {
      return {
        label: 'Draft',
        className: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
      };
    }
    const balance = Number(inv.balance_amount || 0);
    const paid = Number(inv.paid_amount || 0);
    if (balance <= 0) {
      return {
        label: 'Completed / Paid',
        className: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
      };
    }
    if (paid > 0) {
      return {
        label: 'Partially Paid',
        className: 'bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700',
      };
    }
    return {
      label: 'Unpaid',
      className: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    };
  };

  const viewingCustomerDocs = useMemo(() => {
    if (!viewingCustomer) {
      return {
        allInvoices: [],
        activeInvoices: [],
        completedInvoices: [],
        customerQuotations: [],
        totalInvoiced: 0,
        totalOutstanding: 0,
        totalCompleted: 0,
        totalQuotationValue: 0,
      };
    }
    const cId = viewingCustomer.id;
    const allInvoices = invoices.filter((inv) => inv.customer_id === cId);
    const activeInvoices = allInvoices.filter(
      (inv) => inv.status === 'DRAFT' || (inv.status === 'FINALIZED' && Number(inv.balance_amount) > 0)
    );
    const completedInvoices = allInvoices.filter(
      (inv) => inv.status === 'FINALIZED' && Number(inv.balance_amount) <= 0
    );
    const customerQuotations = quotations.filter((q) => q.customer_id === cId);

    const totalInvoiced = allInvoices
      .filter((inv) => inv.status !== 'CANCELLED')
      .reduce((sum, inv) => sum + Number(inv.grand_total || 0), 0);

    const totalOutstanding = activeInvoices.reduce(
      (sum, inv) => sum + Number(inv.balance_amount || 0),
      0
    );

    const totalCompleted = completedInvoices.reduce(
      (sum, inv) => sum + Number(inv.grand_total || 0),
      0
    );

    const totalQuotationValue = customerQuotations
      .filter((q) => q.status !== 'REJECTED' && q.status !== 'EXPIRED')
      .reduce((sum, q) => sum + Number(q.grand_total || 0), 0);

    return {
      allInvoices,
      activeInvoices,
      completedInvoices,
      customerQuotations,
      totalInvoiced,
      totalOutstanding,
      totalCompleted,
      totalQuotationValue,
    };
  }, [viewingCustomer, invoices, quotations]);

  const handleAddBankAccount = () => {
    setEditingCustomer((prev) => ({
      ...prev,
      additional_bank_accounts: [
        ...(prev.additional_bank_accounts || []),
        { bank_name: '', bank_account_no: '', bank_ifsc: '', bank_branch: '' },
      ],
    }));
  };

  const handleUpdateBankAccount = (index: number, field: keyof CustomerBankAccount, value: string) => {
    setEditingCustomer((prev) => {
      const list = [...(prev.additional_bank_accounts || [])];
      list[index] = {
        ...list[index],
        [field]: field === 'bank_ifsc' ? value.toUpperCase() : value,
      };
      return { ...prev, additional_bank_accounts: list };
    });
  };

  const handleRemoveBankAccount = (index: number) => {
    setEditingCustomer((prev) => ({
      ...prev,
      additional_bank_accounts: (prev.additional_bank_accounts || []).filter((_, i) => i !== index),
    }));
  };

  const filtered = customers.filter((c) => {
    const q = searchQuery.toLowerCase();
    const badge = getCustomerTypeBadge(c.customer_type);
    const matchesSearch =
      !searchQuery ||
      c.name.toLowerCase().includes(q) ||
      (c.company_name && c.company_name.toLowerCase().includes(q)) ||
      c.mobile.includes(q) ||
      (c.gstin && c.gstin.toLowerCase().includes(q)) ||
      (c.bank_name && c.bank_name.toLowerCase().includes(q)) ||
      (c.bank_account_no && c.bank_account_no.includes(q)) ||
      (c.customer_type && c.customer_type.toLowerCase().includes(q)) ||
      badge.label.toLowerCase().includes(q);

    const matchesType =
      selectedTypeFilter === 'ALL' ||
      normalizeCustomerType(c.customer_type) === selectedTypeFilter;

    return matchesSearch && matchesType;
  });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
            Customers & Accounts Receivable
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage corporate clients and retail buyers with live balance tracking
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => {
              setEditingCustomer({
                customer_type: 'CORPORATE',
                state: 'Madhya Pradesh',
                state_code: '23',
                payment_terms_days: 0,
                additional_bank_accounts: [],
              });
              setReminderDaysInput('');
              setIsModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-4 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer"
          >
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search customer name, mobile, GST Number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <label className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Customer Type:</label>
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">All Types</option>
            {CUSTOMER_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xs border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px] z-10">
            <tr>
              <th className="py-3 px-4">Customer Name</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Mobile & Email</th>
              <th className="py-3 px-4">GST Number / PAN</th>
              <th className="py-3 px-4">State</th>
              <th className="py-3 px-4">Payment Reminder</th>
              <th className="py-3 px-4 text-right">Current Balance</th>
              <th className="py-3 px-4">City</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400 dark:text-slate-500">
                  No customers found. Click &quot;+ Add Customer&quot; to create your first client.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const pendingInvoices = invoices
                  .filter(
                    (inv) =>
                      inv.customer_id === c.id &&
                      inv.status === 'FINALIZED' &&
                      Number(inv.balance_amount) > 0
                  )
                  .map((inv) => {
                    const countdown = getInvoiceCountdown(inv, c.payment_terms_days || 0);
                    return countdown ? { inv, countdown } : null;
                  })
                  .filter((x): x is { inv: Invoice; countdown: { daysLeft: number; dueDate: Date } } => x !== null)
                  .sort((a, b) => a.countdown.daysLeft - b.countdown.daysLeft);

                const urgent = pendingInvoices[0];
                const badge = getCustomerTypeBadge(c.customer_type);

                return (
                <tr
                  key={c.id}
                  onClick={() => handleOpenView(c)}
                  className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors group"
                  title="Click to view all quotations and invoices for this customer"
                >
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenView(c);
                      }}
                      className="text-left font-bold text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 focus:outline-none cursor-pointer transition-colors"
                      title="Click to view all quotations and invoices for this customer"
                    >
                      {c.name}
                    </button>
                    {c.company_name && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">{c.company_name}</div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {badge.label}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{c.mobile || '-'}</div>
                    {c.email && <div className="text-[11px] text-slate-400 truncate max-w-[160px]">{c.email}</div>}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] tracking-wide text-slate-700 dark:text-slate-300">
                    <div>{c.gstin || '-'}</div>
                    {c.pan && <div className="text-[10px] text-slate-400">PAN: {c.pan}</div>}
                    {c.registration_year && (
                      <div className="text-[10px] text-slate-400 font-sans">Reg: {c.registration_year}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                    <div>{c.state || '-'}</div>
                    {c.bank_name && (
                      <div
                        className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5"
                        title={`Bank: ${c.bank_name}${c.bank_account_no ? ` | A/c: ${c.bank_account_no}` : ''}${c.bank_ifsc ? ` | IFSC: ${c.bank_ifsc}` : ''}`}
                      >
                        <Building className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[130px]">{c.bank_name}</span>
                        {c.additional_bank_accounts && c.additional_bank_accounts.length > 0 && (
                          <span className="px-1 py-0.2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[9px] font-semibold">
                            +{c.additional_bank_accounts.length}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {urgent ? (
                      <span
                        className={`font-medium ${
                          urgent.countdown.daysLeft < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : urgent.countdown.daysLeft === 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                        title={pendingInvoices
                          .map(
                            (p) =>
                              `${p.inv.invoice_number}: Due ${formatShortDate(p.countdown.dueDate)}`
                          )
                          .join('\n')}
                      >
                        <span>
                          {urgent.countdown.daysLeft < 0
                            ? `Overdue by ${Math.abs(urgent.countdown.daysLeft)}d`
                            : urgent.countdown.daysLeft === 0
                              ? 'Due Today'
                              : `${urgent.countdown.daysLeft}d left`}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400 font-mono text-xs">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-mono text-xs font-bold tabular-nums ${Number(c.current_balance || 0) > 0 ? 'text-slate-900 dark:text-white' : 'text-emerald-700 dark:text-emerald-400'}`}>
                      {formatIndianCurrency(c.current_balance)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium">
                    {c.city || '-'}
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center space-x-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleOpenView(c)}
                        className="inline-flex items-center space-x-1 px-2 py-1 text-[11px] font-medium text-brand-700 dark:text-brand-300 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/50 dark:hover:bg-brand-900/60 border border-brand-200 dark:border-brand-800 rounded-md transition-colors"
                        title="View Quotations, Invoices & Overview"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(c)}
                        className="p-1 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                        title="Edit Customer"
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

      {/* Customer Overview & Document History Modal */}
      {viewingCustomer && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
              
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3.5">
                  <div className="w-11 h-11 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                    {(viewingCustomer.name || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2.5 flex-wrap">
                      <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                        {viewingCustomer.name}
                      </h2>
                      {viewingCustomer.company_name && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          ({viewingCustomer.company_name})
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getCustomerTypeBadge(viewingCustomer.customer_type).className}`}>
                        {getCustomerTypeBadge(viewingCustomer.customer_type).label}
                      </span>
                    </div>

                    {/* Quick contacts & info bar */}
                    <div className="flex items-center space-x-4 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap gap-y-1">
                      {viewingCustomer.mobile && (
                        <div className="flex items-center space-x-1">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium text-slate-700 dark:text-slate-300">{viewingCustomer.mobile}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(viewingCustomer.mobile, 'phone')}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-0.5 cursor-pointer"
                            title="Copy Phone"
                          >
                            {copiedText === 'phone' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      )}
                      {viewingCustomer.email && (
                        <div className="flex items-center space-x-1">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-slate-600 dark:text-slate-300">{viewingCustomer.email}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(viewingCustomer.email!, 'email')}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-0.5 cursor-pointer"
                            title="Copy Email"
                          >
                            {copiedText === 'email' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      )}
                      {viewingCustomer.gstin && (
                        <div className="flex items-center space-x-1 font-mono text-[11px]">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">GST: {viewingCustomer.gstin}</span>
                        </div>
                      )}
                      {viewingCustomer.state && (
                        <div className="flex items-center space-x-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{viewingCustomer.city ? `${viewingCustomer.city}, ` : ''}{viewingCustomer.state}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center space-x-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(viewingCustomer)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    title="Edit Customer Profile & Settings"
                  >
                    <Pencil className="w-3.5 h-3.5 text-amber-500" />
                    <span>Edit Customer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingCustomer(null)}
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
                    <span className="font-medium text-[11px] uppercase tracking-wider">Active Invoices</span>
                    <Receipt className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white">
                    {viewingCustomerDocs.activeInvoices.length}
                  </div>
                  <div className="text-[11px] font-semibold mt-0.5 text-rose-600 dark:text-rose-400">
                    Due: {formatIndianCurrency(viewingCustomerDocs.totalOutstanding)}
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-medium text-[11px] uppercase tracking-wider">Quotations</span>
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white">
                    {viewingCustomerDocs.customerQuotations.length}
                  </div>
                  <div className="text-[11px] font-semibold mt-0.5 text-slate-600 dark:text-slate-300">
                    Value: {formatIndianCurrency(viewingCustomerDocs.totalQuotationValue)}
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-medium text-[11px] uppercase tracking-wider">Completed Invoices</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white">
                    {viewingCustomerDocs.completedInvoices.length}
                  </div>
                  <div className="text-[11px] font-semibold mt-0.5 text-emerald-600 dark:text-emerald-400">
                    Settled: {formatIndianCurrency(viewingCustomerDocs.totalCompleted)}
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-medium text-[11px] uppercase tracking-wider">Current Balance</span>
                    <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className={`text-base font-extrabold ${Number(viewingCustomer.current_balance || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {formatIndianCurrency(viewingCustomer.current_balance)}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Total Billed: {formatIndianCurrency(viewingCustomerDocs.totalInvoiced)}
                  </div>
                </div>
              </div>

              {/* Tabs Navigation */}
              <div className="flex items-center px-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-x-1 overflow-x-auto text-xs">
                <button
                  type="button"
                  onClick={() => setCustomerActiveTab('INVOICES')}
                  className={`py-3 px-3.5 font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer ${
                    customerActiveTab === 'INVOICES'
                      ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Invoices</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    customerActiveTab === 'INVOICES'
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {viewingCustomerDocs.activeInvoices.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setCustomerActiveTab('QUOTATIONS')}
                  className={`py-3 px-3.5 font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer ${
                    customerActiveTab === 'QUOTATIONS'
                      ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Quotations</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    customerActiveTab === 'QUOTATIONS'
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {viewingCustomerDocs.customerQuotations.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setCustomerActiveTab('COMPLETED')}
                  className={`py-3 px-3.5 font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer ${
                    customerActiveTab === 'COMPLETED'
                      ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Completed Invoices</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    customerActiveTab === 'COMPLETED'
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {viewingCustomerDocs.completedInvoices.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setCustomerActiveTab('PROFILE')}
                  className={`py-3 px-3.5 font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer ${
                    customerActiveTab === 'PROFILE'
                      ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Customer Info & Bank</span>
                </button>
              </div>

              {/* Tab Body */}
              <div className="flex-1 overflow-y-auto p-6 text-xs">
                {/* TAB 1: INVOICES (Active & Pending) */}
                {customerActiveTab === 'INVOICES' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-700 dark:text-slate-200">
                        Active & Unpaid Invoices ({viewingCustomerDocs.activeInvoices.length})
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                        Pending Balance: <span className="font-bold text-rose-600 dark:text-rose-400">{formatIndianCurrency(viewingCustomerDocs.totalOutstanding)}</span>
                      </div>
                    </div>

                    {viewingCustomerDocs.activeInvoices.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                        <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
                        <div className="font-semibold text-slate-600 dark:text-slate-300">No Pending Invoices!</div>
                        <div className="text-[11px]">All invoices for this customer are fully settled or none issued yet.</div>
                      </div>
                    ) : (
                      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto shadow-2xs">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                            <tr>
                              <th className="py-2.5 px-3">Invoice #</th>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">Due / Countdown</th>
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 px-3 text-right">Total Amount</th>
                              <th className="py-2.5 px-3 text-right">Paid Amount</th>
                              <th className="py-2.5 px-3 text-right">Balance Due</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {viewingCustomerDocs.activeInvoices.map((inv) => {
                              const countdown = getInvoiceCountdown(inv, viewingCustomer.payment_terms_days || 0);
                              const badge = getInvoiceStatusBadge(inv);
                              return (
                                <tr key={inv.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20">
                                  <td className="py-2.5 px-3 font-bold font-mono text-slate-900 dark:text-slate-100">
                                    {inv.invoice_number}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                    {formatDisplayDate(inv.invoice_date)}
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    {countdown ? (
                                      <span
                                        className={`font-semibold ${
                                          countdown.daysLeft < 0
                                            ? 'text-rose-600 dark:text-rose-400'
                                            : countdown.daysLeft === 0
                                            ? 'text-amber-600 dark:text-amber-400'
                                            : 'text-slate-600 dark:text-slate-300'
                                        }`}
                                      >
                                        {countdown.daysLeft < 0
                                          ? `Overdue by ${Math.abs(countdown.daysLeft)}d`
                                          : countdown.daysLeft === 0
                                          ? 'Due Today'
                                          : `${countdown.daysLeft}d left`}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 font-mono">-</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.className}`}>
                                      {badge.label}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                                    {formatIndianCurrency(inv.grand_total)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                                    {formatIndianCurrency(inv.paid_amount || '0')}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-extrabold text-rose-600 dark:text-rose-400">
                                    {formatIndianCurrency(inv.balance_amount)}
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

                {/* TAB 2: QUOTATIONS */}
                {customerActiveTab === 'QUOTATIONS' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-700 dark:text-slate-200">
                        Quotations for this Customer ({viewingCustomerDocs.customerQuotations.length})
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                        Active Quotes Value: <span className="font-bold text-slate-800 dark:text-slate-100">{formatIndianCurrency(viewingCustomerDocs.totalQuotationValue)}</span>
                      </div>
                    </div>

                    {viewingCustomerDocs.customerQuotations.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                        <FileText className="w-8 h-8 text-indigo-400 mx-auto opacity-70" />
                        <div className="font-semibold text-slate-600 dark:text-slate-300">No Quotations Found</div>
                        <div className="text-[11px]">No quotations have been created for this customer yet.</div>
                      </div>
                    ) : (
                      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto shadow-2xs">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                            <tr>
                              <th className="py-2.5 px-3">Quotation #</th>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">Valid Until</th>
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 px-3 text-right">Total Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {viewingCustomerDocs.customerQuotations.map((q) => {
                              const badge = getQuotationStatusBadge(q.status);
                              return (
                                <tr key={q.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20">
                                  <td className="py-2.5 px-3 font-bold font-mono text-slate-900 dark:text-slate-100">
                                    {q.quotation_number}
                                    {q.revision_number > 0 && (
                                      <span className="ml-1 text-[10px] text-slate-400">R{q.revision_number}</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                    {formatDisplayDate(q.quotation_date)}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                    {formatDisplayDate(q.valid_until_date)}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.className}`}>
                                      {badge.label}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900 dark:text-white">
                                    {formatIndianCurrency(q.grand_total)}
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

                {/* TAB 3: COMPLETED INVOICES */}
                {customerActiveTab === 'COMPLETED' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-700 dark:text-slate-200">
                        Completed & Settled Invoices ({viewingCustomerDocs.completedInvoices.length})
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                        Total Settled: <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatIndianCurrency(viewingCustomerDocs.totalCompleted)}</span>
                      </div>
                    </div>

                    {viewingCustomerDocs.completedInvoices.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                        <CheckCircle2 className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                        <div className="font-semibold text-slate-600 dark:text-slate-300">No Completed Invoices Yet</div>
                        <div className="text-[11px]">Invoices will appear here once they are finalized and fully paid with ₹0 balance.</div>
                      </div>
                    ) : (
                      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto shadow-2xs">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                            <tr>
                              <th className="py-2.5 px-3">Invoice #</th>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 px-3 text-right">Invoice Amount</th>
                              <th className="py-2.5 px-3 text-right">Settled Amount</th>
                              <th className="py-2.5 px-3 text-right">Balance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {viewingCustomerDocs.completedInvoices.map((inv) => (
                              <tr key={inv.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20">
                                <td className="py-2.5 px-3 font-bold font-mono text-slate-900 dark:text-slate-100">
                                  {inv.invoice_number}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                  {formatDisplayDate(inv.invoice_date)}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                                    <CheckCircle className="w-3 h-3" />
                                    <span>Completed</span>
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                                  {formatIndianCurrency(inv.grand_total)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  {formatIndianCurrency(inv.paid_amount || inv.grand_total)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                                  ₹0.00
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: PROFILE & BANK ACCOUNTS */}
                {customerActiveTab === 'PROFILE' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Address & Identity */}
                      <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                        <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5 text-xs">
                          <MapPin className="w-4 h-4 text-brand-500" />
                          <span>Address & Contact Information</span>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="text-slate-400 font-medium">Billing Address:</span>
                            <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 whitespace-pre-line">
                              {viewingCustomer.billing_address || 'No billing address provided.'}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <span className="text-slate-400 font-medium">City:</span>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">{viewingCustomer.city || '-'}</div>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium">State & Code:</span>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {viewingCustomer.state || '-'} {viewingCustomer.state_code ? `(${viewingCustomer.state_code})` : ''}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Tax & Registration */}
                      <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                        <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5 text-xs">
                          <Building className="w-4 h-4 text-brand-500" />
                          <span>Tax & Payment Terms</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 font-medium">GSTIN:</span>
                            <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                              {viewingCustomer.gstin || '-'}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-400 font-medium">PAN:</span>
                            <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                              {viewingCustomer.pan || '-'}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-400 font-medium">Year of Registration:</span>
                            <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                              {viewingCustomer.registration_year || '-'}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-400 font-medium">Payment Reminder:</span>
                            <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                              {viewingCustomer.payment_terms_days > 0 ? `${viewingCustomer.payment_terms_days} days after invoice` : 'None configured'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bank Accounts */}
                    <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                      <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-1.5">
                          <Building2 className="w-4 h-4 text-brand-500" />
                          <span>Bank Account Details</span>
                        </div>
                      </div>

                      {/* Primary Bank Account */}
                      {viewingCustomer.bank_name || viewingCustomer.bank_account_no ? (
                        <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 dark:text-slate-200">{viewingCustomer.bank_name || 'Primary Bank'}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
                              Primary Account
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            <div><span className="text-slate-400 font-sans text-xs">A/c: </span>{viewingCustomer.bank_account_no || '-'}</div>
                            <div><span className="text-slate-400 font-sans text-xs">IFSC: </span>{viewingCustomer.bank_ifsc || '-'}</div>
                            <div><span className="text-slate-400 font-sans text-xs">Branch: </span><span className="font-sans">{viewingCustomer.bank_branch || '-'}</span></div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-400 text-xs py-2">No primary bank account configured.</div>
                      )}

                      {/* Additional Bank Accounts */}
                      {viewingCustomer.additional_bank_accounts && viewingCustomer.additional_bank_accounts.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                          <span className="font-semibold text-slate-600 dark:text-slate-400 text-[11px]">Additional Bank Accounts:</span>
                          {viewingCustomer.additional_bank_accounts.map((b, idx) => (
                            <div key={idx} className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs space-y-1">
                              <div className="font-bold text-slate-800 dark:text-slate-200">{b.bank_name || `Account #${idx + 1}`}</div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                <div><span className="text-slate-400 font-sans text-xs">A/c: </span>{b.bank_account_no || '-'}</div>
                                <div><span className="text-slate-400 font-sans text-xs">IFSC: </span>{b.bank_ifsc || '-'}</div>
                                <div><span className="text-slate-400 font-sans text-xs">Branch: </span><span className="font-sans">{b.bank_branch || '-'}</span></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {viewingCustomer.notes && (
                      <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/40 space-y-1">
                        <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">Notes / Remarks:</span>
                        <p className="text-slate-600 dark:text-slate-300 whitespace-pre-line text-xs">{viewingCustomer.notes}</p>
                      </div>
                    )}

                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(viewingCustomer)}
                        className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit Full Customer Details</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                <div className="text-slate-400 text-[11px]">
                  Showing all recorded documents for {viewingCustomer.name}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(viewingCustomer)}
                    className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Customer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingCustomer(null)}
                    className="px-4 py-1.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>

            </div>
          </div>
        </ModalPortal>
      )}

      {/* Add / Edit Customer Modal */}
      {isModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <span>{editingCustomer.id ? 'Customer Details & Settings' : 'Add New Customer'}</span>
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Customer Type *</label>
                  </div>
                  <SearchableSelect
                    options={customerTypeOptions}
                    value={normalizeCustomerType(editingCustomer.customer_type)}
                    onChange={(val) => setEditingCustomer({ ...editingCustomer, customer_type: val as CustomerType })}
                    placeholder="Select Customer Type..."
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Customer / Trade Name *</label>
                  </div>
                  <input
                    type="text"
                    placeholder="Customer Name"
                    value={editingCustomer.name || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
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
                    value={editingCustomer.mobile || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, mobile: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Email</label>
                  </div>
                  <input
                    type="email"
                    placeholder="accounts@client.com"
                    value={editingCustomer.email || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div className="col-span-2 grid grid-cols-3 gap-x-6 gap-y-4">
                  <div>
                    <div className="flex items-center justify-between h-6 mb-1.5">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">GST Number</label>
                    </div>
                    <input
                      type="text"
                      placeholder="15-character GST Number"
                      value={editingCustomer.gstin || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, gstin: e.target.value.toUpperCase() })}
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
                      value={editingCustomer.pan || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, pan: e.target.value.toUpperCase() })}
                      className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono uppercase bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between h-6 mb-1.5">
                      <label className="font-semibold text-slate-700 dark:text-slate-300">Year of Registration</label>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="e.g. 2018"
                      value={editingCustomer.registration_year || ''}
                      onChange={(e) =>
                        setEditingCustomer({
                          ...editingCustomer,
                          registration_year: e.target.value.replace(/[^0-9]/g, '').slice(0, 4),
                        })
                      }
                      className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Billing Address</label>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Street Address, Area"
                    value={editingCustomer.billing_address || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, billing_address: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg p-2.5 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">City</label>
                  </div>
                  <input
                    type="text"
                    placeholder="City"
                    value={editingCustomer.city || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, city: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">State & Code *</label>
                  </div>
                  <SearchableSelect
                    options={stateOptions}
                    value={editingCustomer.state_code || editingCustomer.state || '23'}
                    onChange={(val) => {
                      const st = INDIAN_STATES.find((s) => s.code === val);
                      setEditingCustomer({
                        ...editingCustomer,
                        state_code: val,
                        state: st?.name || '',
                      });
                    }}
                    placeholder="Type state name or code (e.g. Maharashtra or 27)..."
                  />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-brand-600" />
                      <span>Payment Reminder (Days to Remind Customer)</span>
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
                        setReminderDaysInput(raw);
                      }}
                      className="w-36 h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Days after invoice date. Automatically sets Due Date, counts down remaining days, and alerts in Notifications 1 week before due date.
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
                      Bank and settlement details for direct NEFT/RTGS payments, refunds, and record keeping
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
                    value={editingCustomer.bank_name || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, bank_name: e.target.value })}
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
                    value={editingCustomer.bank_account_no || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, bank_account_no: e.target.value })}
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
                    value={editingCustomer.bank_ifsc || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, bank_ifsc: e.target.value.toUpperCase() })}
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
                    value={editingCustomer.bank_branch || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, bank_branch: e.target.value })}
                    placeholder="e.g. Main Branch, MG Road"
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>

                {/* Additional Bank Accounts */}
                {(editingCustomer.additional_bank_accounts || []).map((bank, idx) => (
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
                    placeholder="Additional details, remarks, or extra columns imported from Excel..."
                    value={editingCustomer.notes || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, notes: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded p-2 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div>
                {editingCustomer.id && (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingCustomer.id) {
                        handleDelete(editingCustomer.id);
                        setIsModalOpen(false);
                      }
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg font-semibold transition-colors border border-rose-200 dark:border-rose-900/50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Customer</span>
                  </button>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-xs font-semibold shadow-xs"
                >
                  Save Customer
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
