// src/renderer/views/CustomersView.tsx - Customer Directory & Accounts Receivable
import React, { useState, useEffect, useMemo } from 'react';
import { Customer, CustomerBankAccount, CustomerType, CUSTOMER_TYPE_OPTIONS, Invoice } from '../../shared/types';
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
  FileDown,
  Clock,
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
        className: 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700',
      };
  }
};

export const CustomersView: React.FC<Props> = ({ companyId }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer>>({});
  const [reminderDaysInput, setReminderDaysInput] = useState<string>('');

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
      const [data, invList] = await Promise.all([
        api.getCustomers(companyId),
        api.getInvoices(companyId).catch(() => []),
      ]);
      setCustomers(data);
      setInvoices(invList);
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
      await loadCustomers();
    } catch (err: any) {
      alert(err.message || 'Error archiving customer');
    }
  };

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
    <div className="p-6 space-y-5 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
            <Users className="w-5 h-5 text-brand-600" />
            <span>Customers & Accounts Receivable</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage corporate clients and retail buyers with live balance tracking
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <a
            href={api.getCustomersExportUrl(companyId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700"
          >
            <FileDown className="w-4 h-4 text-slate-500" />
            <span>Export to Excel</span>
          </a>

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
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
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
            placeholder="Search customer name, mobile, GSTIN..."
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
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Customer Name</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Mobile & Email</th>
              <th className="py-3 px-4">GSTIN / PAN</th>
              <th className="py-3 px-4">City & State</th>
              <th className="py-3 px-4">Payment Reminder</th>
              <th className="py-3 px-4 text-right">Current Balance</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  No customers found. Click "+ Add Customer" to create your first client.
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

                return (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900 dark:text-white">{c.name}</div>
                    {c.company_name && (
                      <div className="text-[10px] text-slate-400">{c.company_name}</div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {(() => {
                      const badge = getCustomerTypeBadge(c.customer_type);
                      return (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    <div>{c.mobile}</div>
                    {c.email && <div className="text-[10px] text-slate-400">{c.email}</div>}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    <div>{c.gstin || '-'}</div>
                    {c.pan && <div className="text-[10px] text-slate-400">PAN: {c.pan}</div>}
                    {c.registration_year && (
                      <div className="text-[10px] text-slate-400 font-sans">Reg. Year: {c.registration_year}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    <div>{c.city ? `${c.city}, ${c.state}` : c.state}</div>
                    {c.bank_name && (
                      <div
                        className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5"
                        title={`Bank: ${c.bank_name}${c.bank_account_no ? ` | A/c: ${c.bank_account_no}` : ''}${c.bank_ifsc ? ` | IFSC: ${c.bank_ifsc}` : ''}`}
                      >
                        <Building className="w-2.5 h-2.5 text-slate-400" />
                        <span className="truncate max-w-[130px]">{c.bank_name}</span>
                        {c.additional_bank_accounts && c.additional_bank_accounts.length > 0 && (
                          <span className="px-1 py-0.2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[9px] font-semibold">
                            +{c.additional_bank_accounts.length} more
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {urgent ? (
                      <div
                        className="space-y-0.5"
                        title={pendingInvoices
                          .map(
                            (p) =>
                              `${p.inv.invoice_number}: ${
                                p.countdown.daysLeft < 0
                                  ? `Overdue by ${Math.abs(p.countdown.daysLeft)}d`
                                  : p.countdown.daysLeft === 0
                                    ? 'Due Today'
                                    : `${p.countdown.daysLeft}d left`
                              } (Due ${formatShortDate(p.countdown.dueDate)})`
                          )
                          .join('\n')}
                      >
                        <span
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            urgent.countdown.daysLeft <= 0
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                              : urgent.countdown.daysLeft <= 7
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          <span>
                            {urgent.countdown.daysLeft < 0
                              ? `Overdue ${Math.abs(urgent.countdown.daysLeft)} day${Math.abs(urgent.countdown.daysLeft) === 1 ? '' : 's'}`
                              : urgent.countdown.daysLeft === 0
                                ? 'Due Today'
                                : `${urgent.countdown.daysLeft} day${urgent.countdown.daysLeft === 1 ? '' : 's'} left`}
                          </span>
                        </span>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {urgent.inv.invoice_number} • Due {formatShortDate(urgent.countdown.dueDate)}
                          {pendingInvoices.length > 1 && (
                            <span className="ml-1 text-brand-600 font-sans font-semibold">
                              (+{pendingInvoices.length - 1} more)
                            </span>
                          )}
                        </div>
                      </div>
                    ) : c.payment_terms_days > 0 ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{c.payment_terms_days} days reminder</span>
                        </span>
                        <div className="text-[10px] text-slate-400">No pending invoices</div>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                    {formatIndianCurrency(c.current_balance)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCustomer({
                            ...c,
                            additional_bank_accounts: c.additional_bank_accounts
                              ? c.additional_bank_accounts.map((b) => ({ ...b }))
                              : [],
                          });
                          setReminderDaysInput(c.payment_terms_days > 0 ? String(c.payment_terms_days) : '');
                          setIsModalOpen(true);
                        }}
                        className="p-1 text-slate-400 hover:text-brand-600"
                        title="Edit Customer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="p-1 text-slate-400 hover:text-rose-600"
                        title="Archive Customer"
                      >
                        <Trash2 className="w-4 h-4" />
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

      {/* Add / Edit Customer Modal */}
      {isModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <Users className="w-4 h-4 text-brand-600" />
                <span>{editingCustomer.id ? 'Edit Customer' : 'Add New Customer'}</span>
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Customer Type *</label>
                  <SearchableSelect
                    options={customerTypeOptions}
                    value={normalizeCustomerType(editingCustomer.customer_type)}
                    onChange={(val) => setEditingCustomer({ ...editingCustomer, customer_type: val as CustomerType })}
                    placeholder="Select Customer Type..."
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Customer / Trade Name *</label>
                  <input
                    type="text"
                    placeholder="Customer Name"
                    value={editingCustomer.name || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mobile Phone *</label>
                  <input
                    type="text"
                    placeholder="Mobile"
                    value={editingCustomer.mobile || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, mobile: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="accounts@client.com"
                    value={editingCustomer.email || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
                <div className="col-span-2 grid grid-cols-3 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">GSTIN</label>
                    <input
                      type="text"
                      placeholder="15-character GSTIN"
                      value={editingCustomer.gstin || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, gstin: e.target.value.toUpperCase() })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">PAN</label>
                    <input
                      type="text"
                      placeholder="10-digit PAN"
                      value={editingCustomer.pan || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, pan: e.target.value.toUpperCase() })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Year of Registration</label>
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
                      className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Billing Address</label>
                  <textarea
                    rows={2}
                    placeholder="Street Address, Area"
                    value={editingCustomer.billing_address || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, billing_address: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">City</label>
                  <input
                    type="text"
                    placeholder="City"
                    value={editingCustomer.city || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, city: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">State & Code *</label>
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
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-brand-600" />
                    <span>Payment Reminder (Days to Remind Customer)</span>
                  </label>
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
                      className="w-36 border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
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
                    className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-700 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Another Bank Account</span>
                  </button>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={editingCustomer.bank_name || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, bank_name: e.target.value })}
                    placeholder="State Bank of India"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bank Account Number</label>
                  <input
                    type="text"
                    value={editingCustomer.bank_account_no || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, bank_account_no: e.target.value })}
                    placeholder="Account Number"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={editingCustomer.bank_ifsc || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, bank_ifsc: e.target.value.toUpperCase() })}
                    placeholder="e.g. SBIN0001234"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Branch Details</label>
                  <input
                    type="text"
                    value={editingCustomer.bank_branch || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, bank_branch: e.target.value })}
                    placeholder="e.g. Main Branch, MG Road"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
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

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 border border-slate-300 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm"
              >
                Save Customer
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
};
