// src/renderer/views/SuppliersView.tsx - Supplier Directory & Accounts Payable
import React, { useState, useEffect, useMemo } from 'react';
import { Supplier, CustomerBankAccount, PurchaseInvoice } from '../../shared/types';
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
  Phone,
  Mail,
  Edit2,
  Trash2,
  X,
  Landmark,
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier>>({});
  const [reminderDaysInput, setReminderDaysInput] = useState<string>('');

  const stateOptions = useMemo(() => {
    return INDIAN_STATES.map((s) => ({
      value: s.code,
      label: s.name,
      code: s.code,
    }));
  }, []);

  useEffect(() => {
    if (companyId) {
      loadSuppliers();
    }
  }, [companyId]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const [data, bills] = await Promise.all([
        api.getSuppliers(companyId),
        api.getPurchaseInvoices(companyId).catch(() => []),
      ]);
      setSuppliers(data);
      setPurchaseBills(bills);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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
      await loadSuppliers();
    } catch (err: any) {
      alert(err.message || 'Error archiving supplier');
    }
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
    <div className="p-6 space-y-5 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
            <Truck className="w-5 h-5 text-brand-600" />
            <span>Suppliers & Accounts Payable</span>
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
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Supplier</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
        <div className="relative w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search company name, mobile, GSTIN, bank..."
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
              <th className="py-3 px-4">GSTIN / PAN</th>
              <th className="py-3 px-4">State</th>
              <th className="py-3 px-4">Payment Reminder</th>
              <th className="py-3 px-4 text-right">Outstanding Payable</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
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
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                    <div>{s.name}</div>
                    {s.bank_name && (
                      <div
                        className="text-[10px] text-slate-400 font-normal flex items-center space-x-1 mt-0.5"
                        title={`Bank: ${s.bank_name}${s.bank_account_no ? ` | A/c: ${s.bank_account_no}` : ''}${s.bank_ifsc ? ` | IFSC: ${s.bank_ifsc}` : ''}`}
                      >
                        <Building className="w-2.5 h-2.5 text-slate-400" />
                        <span className="truncate max-w-[150px]">{s.bank_name}</span>
                        {s.additional_bank_accounts && s.additional_bank_accounts.length > 0 && (
                          <span className="px-1 py-0.2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[9px] font-semibold">
                            +{s.additional_bank_accounts.length} more
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    <div>{s.mobile}</div>
                    {s.email && <div className="text-[10px] text-slate-400">{s.email}</div>}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    <div>{s.gstin || '-'}</div>
                    {s.pan && <div className="text-[10px] text-slate-400">PAN: {s.pan}</div>}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    <div>{s.state} ({s.state_code})</div>
                    {s.pin_code && <div className="text-[10px] text-slate-400 font-mono">PIN: {s.pin_code}</div>}
                  </td>
                  <td className="py-3 px-4">
                    {urgent ? (
                      <div
                        className="space-y-0.5"
                        title={pendingBills
                          .map(
                            (p) =>
                              `${p.bill.bill_number}: ${
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
                            urgent.countdown.daysLeft < 0
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                              : urgent.countdown.daysLeft === 0
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : urgent.countdown.daysLeft <= 5
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
                          {urgent.bill.bill_number} • Due {formatShortDate(urgent.countdown.dueDate)}
                          {pendingBills.length > 1 && (
                            <span className="ml-1 text-brand-600 font-sans font-semibold">
                              (+{pendingBills.length - 1} more)
                            </span>
                          )}
                        </div>
                      </div>
                    ) : s.payment_terms_days > 0 ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{s.payment_terms_days} days reminder</span>
                        </span>
                        <div className="text-[10px] text-slate-400">No pending bills</div>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                    {formatIndianCurrency(s.current_balance)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSupplier({
                            ...s,
                            additional_bank_accounts: s.additional_bank_accounts
                              ? s.additional_bank_accounts.map((b) => ({ ...b }))
                              : [],
                          });
                          setReminderDaysInput(s.payment_terms_days > 0 ? String(s.payment_terms_days) : '');
                          setIsModalOpen(true);
                        }}
                        className="p-1 text-slate-400 hover:text-brand-600"
                        title="Edit Supplier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        className="p-1 text-slate-400 hover:text-rose-600"
                        title="Archive Supplier"
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

      {/* Add / Edit Supplier Modal */}
      {isModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <Truck className="w-4 h-4 text-brand-600" />
                <span>{editingSupplier.id ? 'Edit Supplier' : 'Add New Supplier'}</span>
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Company Name *</label>
                  <input
                    type="text"
                    placeholder="Company Name"
                    value={editingSupplier.name || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mobile Phone *</label>
                  <input
                    type="text"
                    placeholder="Mobile"
                    value={editingSupplier.mobile || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, mobile: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="orders@vendor.com"
                    value={editingSupplier.email || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, email: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">GSTIN</label>
                  <input
                    type="text"
                    placeholder="15-character GSTIN"
                    value={editingSupplier.gstin || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, gstin: e.target.value.toUpperCase() })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">PAN</label>
                  <input
                    type="text"
                    placeholder="10-digit PAN"
                    value={editingSupplier.pan || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, pan: e.target.value.toUpperCase() })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Address</label>
                  <textarea
                    rows={2}
                    placeholder="Street Address, Area, City"
                    value={editingSupplier.address || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, address: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded p-2 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">State & Code *</label>
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
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">PIN Code</label>
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
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-brand-600" />
                    <span>Payment Reminder (Days to Pay Vendor)</span>
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
                        if (!raw || raw === '0') {
                          setReminderDaysInput('');
                        } else {
                          setReminderDaysInput(String(Math.min(365, parseInt(raw, 10))));
                        }
                      }}
                      className="w-36 border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
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
                    value={editingSupplier.bank_name || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, bank_name: e.target.value })}
                    placeholder="State Bank of India"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bank Account Number</label>
                  <input
                    type="text"
                    value={editingSupplier.bank_account_no || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, bank_account_no: e.target.value })}
                    placeholder="Account Number"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={editingSupplier.bank_ifsc || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, bank_ifsc: e.target.value.toUpperCase() })}
                    placeholder="e.g. SBIN0001234"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Branch Details</label>
                  <input
                    type="text"
                    value={editingSupplier.bank_branch || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, bank_branch: e.target.value })}
                    placeholder="e.g. Main Branch, MG Road"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 outline-none focus:ring-2 focus:ring-brand-500"
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
                Save Supplier
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
};
