// src/renderer/views/SuppliersView.tsx - Supplier Directory & Accounts Payable
import React, { useState, useEffect } from 'react';
import { Supplier } from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import { INDIAN_STATES } from '../../shared/constants';
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
} from 'lucide-react';

interface Props {
  companyId: string;
}

export const SuppliersView: React.FC<Props> = ({ companyId }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier>>({});

  useEffect(() => {
    if (companyId) {
      loadSuppliers();
    }
  }, [companyId]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const data = await api.getSuppliers(companyId);
      setSuppliers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingSupplier.name || !editingSupplier.mobile) {
      alert('Supplier Name and Mobile are required');
      return;
    }

    try {
      if (editingSupplier.id) {
        await api.updateSupplier(companyId, editingSupplier.id, editingSupplier);
      } else {
        await api.createSupplier(companyId, editingSupplier);
      }
      setIsModalOpen(false);
      setEditingSupplier({});
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

  const filtered = suppliers.filter((s) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.company_name && s.company_name.toLowerCase().includes(q)) ||
        s.mobile.includes(q) ||
        (s.gstin && s.gstin.toLowerCase().includes(q))
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
              payment_terms_days: 30,
            });
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
            placeholder="Search supplier name, mobile, GSTIN..."
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
              <th className="py-3 px-4">Supplier Name</th>
              <th className="py-3 px-4">Contact & Mobile</th>
              <th className="py-3 px-4">GSTIN / PAN</th>
              <th className="py-3 px-4">State</th>
              <th className="py-3 px-4 text-right">Outstanding Payable</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No suppliers found. Click "+ Add Supplier" to record your vendors.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                    {s.name}
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
                    {s.state} ({s.state_code})
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                    {formatIndianCurrency(s.current_balance)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSupplier({ ...s });
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Supplier Modal */}
      {isModalOpen && (
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
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Supplier Trade Name *</label>
                  <input
                    type="text"
                    placeholder="Supplier Name"
                    value={editingSupplier.name || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Contact Person</label>
                  <input
                    type="text"
                    placeholder="Sales Rep / Manager"
                    value={editingSupplier.contact_person || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, contact_person: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mobile Phone *</label>
                  <input
                    type="text"
                    placeholder="Mobile"
                    value={editingSupplier.mobile || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, mobile: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="orders@vendor.com"
                    value={editingSupplier.email || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, email: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">GSTIN</label>
                  <input
                    type="text"
                    placeholder="GSTIN"
                    value={editingSupplier.gstin || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, gstin: e.target.value.toUpperCase() })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">State</label>
                  <select
                    value={editingSupplier.state_code || '27'}
                    onChange={(e) => {
                      const st = INDIAN_STATES.find((s) => s.code === e.target.value);
                      setEditingSupplier({
                        ...editingSupplier,
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
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bank Name</label>
                  <input
                    type="text"
                    placeholder="Bank Name"
                    value={editingSupplier.bank_name || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, bank_name: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bank Account Number</label>
                  <input
                    type="text"
                    placeholder="A/c Number"
                    value={editingSupplier.bank_account_no || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, bank_account_no: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
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
      )}
    </div>
  );
};
