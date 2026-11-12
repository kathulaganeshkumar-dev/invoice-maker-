// src/renderer/views/CustomersView.tsx - Customer Directory & Accounts Receivable
import React, { useState, useEffect } from 'react';
import { Customer } from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import { INDIAN_STATES } from '../../shared/constants';
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
} from 'lucide-react';

interface Props {
  companyId: string;
}

export const CustomersView: React.FC<Props> = ({ companyId }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer>>({});

  useEffect(() => {
    if (companyId) {
      loadCustomers();
    }
  }, [companyId]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await api.getCustomers(companyId);
      setCustomers(data);
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

    try {
      if (editingCustomer.id) {
        await api.updateCustomer(companyId, editingCustomer.id, editingCustomer);
      } else {
        await api.createCustomer(companyId, editingCustomer);
      }
      setIsModalOpen(false);
      setEditingCustomer({});
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

  const filtered = customers.filter((c) => {
    if (searchQuery) {
      const s = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(s) ||
        (c.company_name && c.company_name.toLowerCase().includes(s)) ||
        c.mobile.includes(s) ||
        (c.gstin && c.gstin.toLowerCase().includes(s))
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
                customer_type: 'BUSINESS',
                state: 'Madhya Pradesh',
                state_code: '23',
                payment_terms_days: 30,
              });
              setIsModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
        <div className="relative w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search customer name, mobile, GSTIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Customer Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Customer Name</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Mobile & Email</th>
              <th className="py-3 px-4">GSTIN / PAN</th>
              <th className="py-3 px-4">City & State</th>
              <th className="py-3 px-4 text-right">Current Balance</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No customers found. Click "+ Add Customer" to create your first client.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900 dark:text-white">{c.name}</div>
                    {c.company_name && (
                      <div className="text-[10px] text-slate-400">{c.company_name}</div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        c.customer_type === 'BUSINESS'
                          ? 'bg-sky-50 text-sky-700 border border-sky-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {c.customer_type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    <div>{c.mobile}</div>
                    {c.email && <div className="text-[10px] text-slate-400">{c.email}</div>}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    <div>{c.gstin || '-'}</div>
                    {c.pan && <div className="text-[10px] text-slate-400">PAN: {c.pan}</div>}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {c.city ? `${c.city}, ${c.state}` : c.state}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                    {formatIndianCurrency(c.current_balance)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCustomer({ ...c });
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Customer Modal */}
      {isModalOpen && (
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
                  <select
                    value={editingCustomer.customer_type || 'BUSINESS'}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, customer_type: e.target.value as any })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  >
                    <option value="BUSINESS">Business / Company</option>
                    <option value="INDIVIDUAL">Individual / Retail</option>
                  </select>
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
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">State</label>
                  <select
                    value={editingCustomer.state_code || '23'}
                    onChange={(e) => {
                      const st = INDIAN_STATES.find((s) => s.code === e.target.value);
                      setEditingCustomer({
                        ...editingCustomer,
                        state_code: e.target.value,
                        state: st?.name || '',
                      });
                    }}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  >
                    {INDIAN_STATES.map((s) => (
                      <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                    ))}
                  </select>
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
      )}
    </div>
  );
};
