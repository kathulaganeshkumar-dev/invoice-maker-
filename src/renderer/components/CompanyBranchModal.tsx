// src/renderer/components/CompanyBranchModal.tsx - Modern Company & Branch Selector
import React, { useState, useEffect, useRef } from 'react';
import { Company, Branch } from '../../shared/types';
import { INDIAN_STATES } from '../../shared/constants';
import { api } from '../services/api';
import { Plus, Edit2, Trash2, Check, Building2, GitBranch, X, Globe, Phone, Mail, Landmark, ChevronDown, Eye } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (company: Company | null, branch?: Branch | null) => void;
  currentCompanyId?: string;
}

export const CompanyBranchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSelect,
  currentCompanyId,
}) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(currentCompanyId || '');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [showOnStartup, setShowOnStartup] = useState<boolean>(true);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingCompany, setEditingCompany] = useState<Partial<Company>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [stateQuery, setStateQuery] = useState<string>('');
  const [isStateOpen, setIsStateOpen] = useState<boolean>(false);
  const [isBranchFormOpen, setIsBranchFormOpen] = useState<boolean>(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchFormData, setBranchFormData] = useState<Partial<Branch>>({});
  const [showBranchesList, setShowBranchesList] = useState<boolean>(false);
  const stateDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stateDropdownRef.current && !stateDropdownRef.current.contains(event.target as Node)) {
        setIsStateOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const handleGstinChange = (val: string) => {
    const gstin = val.toUpperCase();
    const prefix = gstin.substring(0, 2);
    const matched = INDIAN_STATES.find((s) => s.code === prefix);
    if (matched && (!editingCompany.state || editingCompany.state === 'Madhya Pradesh')) {
      setEditingCompany((prev) => ({
        ...prev,
        gstin,
        state: matched.name,
        state_code: matched.code,
      }));
      setStateQuery(`${matched.name} (${matched.code})`);
    } else {
      setEditingCompany((prev) => ({ ...prev, gstin }));
    }
  };

  const filteredStates = INDIAN_STATES.filter((s) => {
    const q = stateQuery.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || s.code.includes(q);
  });

  const selectState = (s: typeof INDIAN_STATES[0]) => {
    setEditingCompany((prev) => ({
      ...prev,
      state: s.name,
      state_code: s.code,
    }));
    setStateQuery(`${s.name} (${s.code})`);
    setIsStateOpen(false);
  };

  const handleOpenAddBranch = () => {
    const comp = companies.find((c) => c.id === selectedCompanyId);
    setEditingBranchId(null);
    setBranchFormData({
      state: comp?.state || 'Madhya Pradesh',
      state_code: comp?.state_code || '23',
      code: `BR0${branches.length + 1}`,
      use_company_bank: true,
      bank_name: comp?.bank_name || '',
      bank_account_no: comp?.bank_account_no || '',
      bank_ifsc: comp?.bank_ifsc || '',
      bank_branch: comp?.bank_branch || '',
    });
    setIsBranchFormOpen(true);
  };

  const handleOpenEditBranch = (branch: Branch) => {
    const comp = companies.find((c) => c.id === selectedCompanyId);
    setEditingBranchId(branch.id);
    setBranchFormData({
      ...branch,
      use_company_bank: branch.use_company_bank ?? true,
      bank_name: (branch.use_company_bank ?? true) ? (comp?.bank_name || '') : (branch.bank_name || ''),
      bank_account_no: (branch.use_company_bank ?? true) ? (comp?.bank_account_no || '') : (branch.bank_account_no || ''),
      bank_ifsc: (branch.use_company_bank ?? true) ? (comp?.bank_ifsc || '') : (branch.bank_ifsc || ''),
      bank_branch: (branch.use_company_bank ?? true) ? (comp?.bank_branch || '') : (branch.bank_branch || ''),
    });
    setIsBranchFormOpen(true);
  };

  const handleDeleteBranch = async (branch: Branch) => {
    if (branches.length <= 1) {
      alert('Cannot delete the only branch. Each company must have at least one operating branch.');
      return;
    }
    if (branch.is_default) {
      alert('Cannot delete the default Head Office branch. You can edit its details instead.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete branch "${branch.name}" (${branch.code})?`)) return;

    try {
      await api.deleteBranch(selectedCompanyId, branch.id);
      const brs = await api.getBranches(selectedCompanyId);
      setBranches(brs);
      if (selectedBranchId === branch.id) {
        const def = brs.find((b) => b.is_default) || brs[0];
        setSelectedBranchId(def ? def.id : '');
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting branch');
    }
  };

  const handleSaveBranch = async () => {
    if (!branchFormData.name?.trim()) {
      alert('Branch name is required');
      return;
    }
    const comp = companies.find((c) => c.id === selectedCompanyId);
    try {
      const code = branchFormData.code?.trim() || `BR0${branches.length + 1}`;
      const useCompBank = branchFormData.use_company_bank ?? true;
      const payload: Partial<Branch> = {
        ...branchFormData,
        name: branchFormData.name.trim(),
        code: code.toUpperCase(),
        state: branchFormData.state || comp?.state || 'Madhya Pradesh',
        state_code: branchFormData.state_code || comp?.state_code || '23',
        use_company_bank: useCompBank,
        bank_name: useCompBank ? (comp?.bank_name || undefined) : branchFormData.bank_name,
        bank_account_no: useCompBank ? (comp?.bank_account_no || undefined) : branchFormData.bank_account_no,
        bank_ifsc: useCompBank ? (comp?.bank_ifsc || undefined) : branchFormData.bank_ifsc,
        bank_branch: useCompBank ? (comp?.bank_branch || undefined) : branchFormData.bank_branch,
      };

      if (editingBranchId) {
        await api.updateBranch(selectedCompanyId, editingBranchId, payload);
      } else {
        const created = await api.createBranch(selectedCompanyId, payload);
        setSelectedBranchId(created.id);
      }

      const brs = await api.getBranches(selectedCompanyId);
      setBranches(brs);
      setIsBranchFormOpen(false);
      setEditingBranchId(null);
      setBranchFormData({});
    } catch (err: any) {
      alert(err.message || 'Error saving branch');
    }
  };

  const loadData = async (preferredCompanyId?: string) => {
    setLoading(true);
    setError('');
    try {
      const comps = await api.getCompanies();
      setCompanies(comps);

      const settings = await api.getAppSettings();
      setShowOnStartup(settings?.show_company_selector_on_startup ?? true);

      const active =
        (preferredCompanyId && comps.find((c) => c.id === preferredCompanyId)) ||
        comps.find((c) => c.id === currentCompanyId) ||
        comps.find((c) => c.is_default) ||
        comps[0];
      if (active) {
        setSelectedCompanyId(active.id);
        const brs = await api.getBranches(active.id);
        setBranches(brs);
        const defBranch = brs.find((b) => b.is_default) || brs[0];
        setSelectedBranchId(defBranch ? defBranch.id : '');
      } else {
        setSelectedCompanyId('');
        setBranches([]);
        setSelectedBranchId('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  const handleCompanySelect = async (compId: string) => {
    setSelectedCompanyId(compId);
    try {
      const brs = await api.getBranches(compId);
      setBranches(brs);
      const defBranch = brs.find((b) => b.is_default) || brs[0];
      if (defBranch) setSelectedBranchId(defBranch.id);
    } catch {
      // ignore
    }
  };

  const handleSaveCompany = async () => {
    if (!editingCompany.name) {
      setError('Company name is required');
      return;
    }
    setLoading(true);
    try {
      const companyPayload = {
        ...editingCompany,
        legal_name: editingCompany.legal_name || editingCompany.name,
      };
      let savedId = editingCompany.id;
      if (editingCompany.id) {
        const updated = await api.updateCompany(editingCompany.id, companyPayload);
        if (editingCompany.id === currentCompanyId) {
          const brs = await api.getBranches(updated.id);
          const defBranch = brs.find((b) => b.is_default) || brs[0] || null;
          onSelect(updated, defBranch);
        }
      } else {
        const created = await api.createCompany(companyPayload);
        savedId = created.id;
        setSelectedCompanyId(created.id);
        if (!currentCompanyId || companies.length === 0) {
          const brs = await api.getBranches(created.id);
          const defBranch = brs.find((b) => b.is_default) || brs[0] || null;
          onSelect(created, defBranch);
        }
      }
      setIsEditing(false);
      setEditingCompany({});
      await loadData(savedId);
    } catch (err: any) {
      setError(err.message || 'Error saving company');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSelect = async () => {
    const comp = companies.find((c) => c.id === selectedCompanyId);
    if (!comp) return;

    try {
      await api.updateAppSettings({ show_company_selector_on_startup: showOnStartup });
    } catch {
      // ignore
    }

    const br = branches.find((b) => b.id === selectedBranchId) || branches[0];
    onSelect(comp, br);
    onClose();
  };

  const handleSetDefault = async (compId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.setDefaultCompany(compId);
      setCompanies((prev) => prev.map((c) => ({ ...c, is_default: c.id === compId })));
    } catch (err: any) {
      setError(err.message || 'Failed to set default company');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Window Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-bold text-slate-800">Select Business & Branch</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-100 text-rose-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-rose-500 font-bold ml-2">×</button>
          </div>
        )}

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {!isEditing ? (
            <>
              {/* Action Toolbar inspired by screenshot: New, Edit, Delete */}
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCompany({
                      business_type: 'Private Limited Company',
                      state: 'Madhya Pradesh',
                      state_code: '23',
                      pin_code: '452001',
                    });
                    setStateQuery('Madhya Pradesh (23)');
                    setIsStateOpen(false);
                    setIsEditing(true);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>New</span>
                </button>
                <button
                  type="button"
                  disabled={!selectedCompanyId}
                  onClick={() => {
                    const comp = companies.find((c) => c.id === selectedCompanyId);
                    if (comp) {
                      setEditingCompany({ ...comp });
                      setStateQuery(comp.state ? `${comp.state} (${comp.state_code || ''})` : '');
                      setIsStateOpen(false);
                      setIsEditing(true);
                    }
                  }}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50 rounded-lg text-sm font-semibold transition-all border border-slate-200"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  disabled={!selectedCompanyId}
                  onClick={async () => {
                    const comp = companies.find((c) => c.id === selectedCompanyId);
                    if (!comp) return;
                    const isLastCompany = companies.length <= 1;
                    const msg = isLastCompany
                      ? `Are you sure you want to delete your ONLY remaining business profile "${comp.name}" along with all its invoices, inventory, customers, and templates? This cannot be undone.`
                      : `Are you sure you want to permanently delete business profile "${comp.name}" and all its associated records?`;
                    if (!window.confirm(msg)) return;
                    try {
                      await api.deleteCompany(comp.id);
                      const remaining = await api.getCompanies();
                      setCompanies(remaining);

                      if (remaining.length === 0) {
                        setSelectedCompanyId('');
                        setBranches([]);
                        setSelectedBranchId('');
                        onSelect(null, null);
                      } else {
                        const nextComp = remaining.find((c) => c.is_default) || remaining[0];
                        setSelectedCompanyId(nextComp.id);
                        const brs = await api.getBranches(nextComp.id);
                        setBranches(brs);
                        const defBranch = brs.find((b) => b.is_default) || brs[0] || null;
                        setSelectedBranchId(defBranch ? defBranch.id : '');
                        if (comp.id === currentCompanyId || !currentCompanyId) {
                          onSelect(nextComp, defBranch);
                        }
                      }
                    } catch (err: any) {
                      alert(err.message || 'Error deleting business profile');
                    }
                  }}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 disabled:opacity-50 rounded-lg text-sm font-semibold transition-all border border-rose-200"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              </div>

              {/* Business Companies Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-4 w-16">ID</th>
                      <th className="py-2.5 px-4 w-24 text-center">Default</th>
                      <th className="py-2.5 px-4">Business Name</th>
                      <th className="py-2.5 px-4">GSTIN</th>
                      <th className="py-2.5 px-4">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {companies.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 text-sm">
                          No companies found. Click <span className="font-semibold text-emerald-600">+ New</span> above to create your business profile.
                        </td>
                      </tr>
                    ) : (
                      companies.map((c, idx) => {
                      const isSelected = c.id === selectedCompanyId;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => handleCompanySelect(c.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-sky-50/80 font-medium text-brand-900' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <td className="py-2.5 px-4 text-slate-500 font-mono text-xs">{idx + 1}</td>
                          <td className="py-2.5 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={c.is_default}
                              onChange={(e) => handleSetDefault(c.id, e as any)}
                              className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-4 font-semibold flex items-center space-x-2">
                            <span>{c.name}</span>
                            {c.is_default && (
                              <span className="text-[10px] bg-brand-100 text-brand-800 px-1.5 py-0.5 rounded font-bold">
                                Default
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{c.gstin || '-'}</td>
                          <td className="py-2.5 px-4 text-slate-600">{c.state} ({c.state_code})</td>
                        </tr>
                      );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Branch Selector & Multiple Branch Management */}
              {branches.length > 0 && (() => {
                const selectedBranch = branches.find((b) => b.id === selectedBranchId) || branches[0];
                return (
                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <GitBranch className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-semibold text-slate-700">Operating Branch:</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <select
                        value={selectedBranchId}
                        onChange={(e) => setSelectedBranchId(e.target.value)}
                        className="bg-white border border-slate-300 rounded-md px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none"
                      >
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.code}) {b.is_default ? '• Default' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleOpenAddBranch}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-md border border-emerald-200 transition-colors"
                        title="Add a new branch"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                      {selectedBranch && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditBranch(selectedBranch)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md border border-slate-200 transition-colors"
                          title="Edit selected branch details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      )}
                      {selectedBranch && !selectedBranch.is_default && branches.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteBranch(selectedBranch)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-md border border-rose-200 transition-colors"
                          title="Delete selected sub-branch"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowBranchesList(!showBranchesList)}
                        className={`inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                          showBranchesList
                            ? 'bg-brand-600 text-white border-brand-700 shadow-sm'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                        }`}
                        title="View all branches table"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{showBranchesList ? 'Hide Branches' : `View Branches (${branches.length})`}</span>
                      </button>
                    </div>
                  </div>

                  {/* Branches Table List (when View Branches is clicked) */}
                  {showBranchesList && (
                    <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                      <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                          All Branches of Selected Company
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Click row to select as operating branch
                        </span>
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                          <tr>
                            <th className="py-2 px-3 w-10">#</th>
                            <th className="py-2 px-3">Branch Name</th>
                            <th className="py-2 px-3 w-20">Code</th>
                            <th className="py-2 px-3">State & Code</th>
                            <th className="py-2 px-3">Bank Details</th>
                            <th className="py-2 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {branches.map((b, idx) => {
                            const isSelected = b.id === selectedBranchId;
                            return (
                              <tr
                                key={b.id}
                                onClick={() => setSelectedBranchId(b.id)}
                                className={`cursor-pointer transition-colors ${
                                  isSelected ? 'bg-sky-50 font-medium text-brand-900' : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                                <td className="py-2 px-3 font-semibold">
                                  <div className="flex items-center space-x-1.5">
                                    <span>{b.name}</span>
                                    {b.is_default && (
                                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-bold">
                                        Default
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-slate-600">{b.code}</td>
                                <td className="py-2 px-3">{b.state} ({b.state_code})</td>
                                <td className="py-2 px-3 text-slate-500">
                                  {b.use_company_bank ? (
                                    <span className="text-slate-500 italic">Company Bank</span>
                                  ) : (
                                    <span className="font-mono text-[11px] text-emerald-700 font-medium">
                                      {b.bank_name || 'Custom'} ({b.bank_ifsc || '-'})
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right space-x-1.5" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditBranch(b)}
                                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold text-[11px] border border-slate-200"
                                  >
                                    Edit
                                  </button>
                                  {!b.is_default && branches.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteBranch(b)}
                                      className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded font-semibold text-[11px] border border-rose-200"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Add / Edit Branch Inline Form */}
                  {isBranchFormOpen && (
                    <div className="mt-3 p-3.5 bg-white border border-brand-200 rounded-lg shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span className="text-xs font-bold text-brand-800 uppercase tracking-wide">
                          {editingBranchId ? `Edit Operating Branch: ${branchFormData.name || ''}` : 'Create New Operating Branch'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsBranchFormOpen(false);
                            setEditingBranchId(null);
                            setBranchFormData({});
                          }}
                          className="text-xs text-slate-400 hover:text-slate-600 font-bold px-1"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Branch Name *</label>
                          <input
                            type="text"
                            placeholder="e.g. Hyderabad Regional Office"
                            value={branchFormData.name || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, name: e.target.value })}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Branch Code *</label>
                          <input
                            type="text"
                            placeholder="e.g. HYD01"
                            value={branchFormData.code || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, code: e.target.value.toUpperCase() })}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono uppercase outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">State & Code</label>
                          <select
                            value={branchFormData.state_code || '23'}
                            onChange={(e) => {
                              const s = INDIAN_STATES.find((st) => st.code === e.target.value);
                              setBranchFormData({
                                ...branchFormData,
                                state_code: e.target.value,
                                state: s ? s.name : '',
                              });
                            }}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500"
                          >
                            {INDIAN_STATES.map((s) => (
                              <option key={s.code} value={s.code}>
                                {s.name} ({s.code})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                          <input
                            type="text"
                            placeholder="e.g. +91 98260 12345"
                            value={branchFormData.phone || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, phone: e.target.value })}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block font-semibold text-slate-700 mb-1">Branch Address</label>
                          <input
                            type="text"
                            placeholder="Plot / Street / Locality"
                            value={branchFormData.address || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, address: e.target.value })}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        </div>

                        {/* Option: Use Main Branch / Company Bank Details */}
                        <div className="col-span-2 pt-2 border-t border-slate-100">
                          <div className="flex items-center justify-between bg-sky-50/70 p-2.5 rounded-lg border border-sky-200">
                            <label className="flex items-center space-x-2 text-xs font-semibold text-brand-900 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={branchFormData.use_company_bank ?? true}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  const comp = companies.find((c) => c.id === selectedCompanyId);
                                  setBranchFormData({
                                    ...branchFormData,
                                    use_company_bank: checked,
                                    bank_name: checked ? (comp?.bank_name || '') : (branchFormData.bank_name || ''),
                                    bank_account_no: checked ? (comp?.bank_account_no || '') : (branchFormData.bank_account_no || ''),
                                    bank_ifsc: checked ? (comp?.bank_ifsc || '') : (branchFormData.bank_ifsc || ''),
                                    bank_branch: checked ? (comp?.bank_branch || '') : (branchFormData.bank_branch || ''),
                                  });
                                }}
                                className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500"
                              />
                              <span>Use Main Branch / Company Bank Details</span>
                            </label>
                            <span className="text-[11px] font-medium text-slate-500">
                              {(branchFormData.use_company_bank ?? true) ? 'Using Company Bank' : 'Custom Branch Bank'}
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Bank Name</label>
                          <input
                            type="text"
                            placeholder="e.g. State Bank of India"
                            disabled={branchFormData.use_company_bank ?? true}
                            value={branchFormData.bank_name || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, bank_name: e.target.value })}
                            className={`w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500 ${
                              (branchFormData.use_company_bank ?? true) ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Bank Account Number</label>
                          <input
                            type="text"
                            placeholder="Account Number"
                            disabled={branchFormData.use_company_bank ?? true}
                            value={branchFormData.bank_account_no || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, bank_account_no: e.target.value })}
                            className={`w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500 ${
                              (branchFormData.use_company_bank ?? true) ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">IFSC Code</label>
                          <input
                            type="text"
                            placeholder="e.g. SBIN0001234"
                            disabled={branchFormData.use_company_bank ?? true}
                            value={branchFormData.bank_ifsc || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, bank_ifsc: e.target.value.toUpperCase() })}
                            className={`w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono uppercase outline-none focus:ring-1 focus:ring-brand-500 ${
                              (branchFormData.use_company_bank ?? true) ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Branch Details</label>
                          <input
                            type="text"
                            placeholder="e.g. Main Branch, MG Road"
                            disabled={branchFormData.use_company_bank ?? true}
                            value={branchFormData.bank_branch || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, bank_branch: e.target.value })}
                            className={`w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500 ${
                              (branchFormData.use_company_bank ?? true) ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'
                            }`}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end space-x-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIsBranchFormOpen(false);
                            setEditingBranchId(null);
                            setBranchFormData({});
                          }}
                          className="px-3 py-1 border border-slate-300 text-slate-600 rounded text-xs hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveBranch}
                          className="px-3.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-semibold shadow-sm"
                        >
                          {editingBranchId ? 'Update Branch' : 'Save Branch'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
              })()}
            </>
          ) : (
            /* Company Edit Form */
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-bold text-slate-800">
                  {editingCompany.id ? 'Edit Company Information' : 'Create New Company'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  Back to list
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company Name *</label>
                  <input
                    type="text"
                    value={editingCompany.name || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                    placeholder="e.g. Acme Trading Co."
                    className="w-full border border-slate-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={editingCompany.gstin || ''}
                    onChange={(e) => handleGstinChange(e.target.value)}
                    placeholder="e.g. 36AABCA1234D1Z5"
                    className="w-full border border-slate-300 rounded-md px-3 py-1.5 font-mono uppercase outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">PAN</label>
                  <input
                    type="text"
                    value={editingCompany.pan || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, pan: e.target.value.toUpperCase() })}
                    placeholder="e.g. AABCA1234D"
                    className="w-full border border-slate-300 rounded-md px-3 py-1.5 font-mono uppercase outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div className="relative" ref={stateDropdownRef}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">State & Code *</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={stateQuery}
                      onChange={(e) => {
                        setStateQuery(e.target.value);
                        setIsStateOpen(true);
                      }}
                      onFocus={() => setIsStateOpen(true)}
                      placeholder="Type state name or code (e.g. Telangana or 36)"
                      className="w-full border border-slate-300 rounded-md pl-3 pr-8 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setIsStateOpen((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  {isStateOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-100">
                      {filteredStates.length === 0 ? (
                        <div className="px-3 py-2.5 text-xs text-slate-400 text-center">
                          No matching state or code found
                        </div>
                      ) : (
                        filteredStates.map((s) => {
                          const isSelected = editingCompany.state_code === s.code;
                          return (
                            <button
                              key={s.code}
                              type="button"
                              onClick={() => selectState(s)}
                              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                                isSelected ? 'bg-sky-50 text-brand-700 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <span>{s.name}</span>
                              <span className="text-xs font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                                {s.code}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={editingCompany.phone || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, phone: e.target.value })}
                    placeholder="+91 98260 12345"
                    className="w-full border border-slate-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Registered Address</label>
                  <textarea
                    rows={2}
                    value={editingCompany.registered_address || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, registered_address: e.target.value })}
                    placeholder="Complete address with PIN code"
                    className="w-full border border-slate-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={editingCompany.bank_name || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_name: e.target.value })}
                    placeholder="State Bank of India"
                    className="w-full border border-slate-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Account Number</label>
                  <input
                    type="text"
                    value={editingCompany.bank_account_no || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_account_no: e.target.value })}
                    placeholder="Account Number"
                    className="w-full border border-slate-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={editingCompany.bank_ifsc || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_ifsc: e.target.value.toUpperCase() })}
                    placeholder="e.g. SBIN0001234"
                    className="w-full border border-slate-300 rounded-md px-3 py-1.5 font-mono uppercase outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Details</label>
                  <input
                    type="text"
                    value={editingCompany.bank_branch || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_branch: e.target.value })}
                    placeholder="e.g. Main Branch, MG Road"
                    className="w-full border border-slate-300 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCompany}
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-semibold shadow-sm"
                >
                  Save Business
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Window Footer matching screenshot */}
        {!isEditing && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <label className="flex items-center space-x-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showOnStartup}
                onChange={(e) => setShowOnStartup(e.target.checked)}
                className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500"
              />
              <span>Show this window when program starts.</span>
            </label>

            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={handleConfirmSelect}
                disabled={!selectedCompanyId}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow transition-all disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>Select</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-sm font-semibold transition-all"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
