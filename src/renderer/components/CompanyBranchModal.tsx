// src/renderer/components/CompanyBranchModal.tsx - Modern Company & Branch Selector
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Company, Branch } from '../../shared/types';
import { INDIAN_STATES } from '../../shared/constants';
import { api } from '../services/api';
import { SearchableSelect } from './SearchableSelect';
import { ModalPortal } from './ModalPortal';
import { getIndianFinancialYear } from '../../server/services/numberingService';
import { Plus, Edit2, Trash2, Check, Building2, GitBranch, X, Globe, Phone, Mail, Landmark, ChevronDown } from 'lucide-react';

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
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingCompany, setEditingCompany] = useState<Partial<Company>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isBranchFormOpen, setIsBranchFormOpen] = useState<boolean>(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchFormData, setBranchFormData] = useState<Partial<Branch>>({});
  const [showBranchesList, setShowBranchesList] = useState<boolean>(false);

  const stateOptions = useMemo(() => {
    return INDIAN_STATES.map((s) => ({
      value: s.code,
      label: s.name,
      code: s.code,
    }));
  }, []);

  const dynamicFyList = useMemo(() => {
    const current = getIndianFinancialYear();
    const [startYear] = current.split('-').map(Number);
    const list: string[] = [];
    for (let offset = -2; offset <= 2; offset++) {
      const sy = startYear + offset;
      const ey = String((sy + 1) % 100).padStart(2, '0');
      list.push(`${sy}-${ey}`);
    }
    return list.reverse();
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
      const interval = setInterval(async () => {
        // Silently poll for newly created companies on Host PC
        if (!isEditing && !isBranchFormOpen) {
          try {
            const comps = await api.getCompanies();
            setCompanies(comps);
            if (!selectedCompanyId && comps.length > 0) {
              const active = comps.find((c) => c.is_default) || comps[0];
              setSelectedCompanyId(active.id);
              api
                .getBranches(active.id)
                .then((brs) => {
                  setBranches(brs);
                  const defBranch = brs.find((b) => b.is_default) || brs[0];
                  if (defBranch) setSelectedBranchId(defBranch.id);
                })
                .catch(() => {});
            }
          } catch {
            // ignore
          }
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen, isEditing, isBranchFormOpen, selectedCompanyId]);

  const handleGstinChange = (val: string) => {
    const gstin = val.toUpperCase();
    const prefix = gstin.substring(0, 2);
    const matched = INDIAN_STATES.find((s) => s.code === prefix);
    const panFromGst = gstin.length >= 12 ? gstin.substring(2, 12) : undefined;
    if (matched && (!editingCompany.state || editingCompany.state === 'Madhya Pradesh')) {
      setEditingCompany((prev) => ({
        ...prev,
        gstin,
        state: matched.name,
        state_code: matched.code,
        pan: prev.pan ? prev.pan : panFromGst,
      }));
    } else {
      setEditingCompany((prev) => ({
        ...prev,
        gstin,
        pan: prev.pan ? prev.pan : panFromGst,
      }));
    }
  };

  const handleOpenAddBranch = () => {
    const comp = companies.find((c) => c.id === selectedCompanyId);
    setEditingBranchId(null);
    setBranchFormData({
      state: comp?.state || 'Madhya Pradesh',
      state_code: comp?.state_code || '23',
      code: `BR0${branches.length + 1}`,
      email: comp?.email || '',
      financial_year: comp?.financial_year || getIndianFinancialYear(),
      tan: comp?.tan || '',
      cin: comp?.cin || '',
      iso: comp?.iso || '',
      msme: comp?.msme || '',
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
      email: branch.email || '',
      financial_year: branch.financial_year || comp?.financial_year || getIndianFinancialYear(),
      tan: branch.tan || '',
      cin: branch.cin || '',
      iso: branch.iso || '',
      msme: branch.msme || '',
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
      setIsBranchFormOpen(false);
      setEditingBranchId(null);
      setBranchFormData({});
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
        email: branchFormData.email ? branchFormData.email.trim() : (comp?.email || ''),
        financial_year: branchFormData.financial_year ? branchFormData.financial_year.trim() : (comp?.financial_year || undefined),
        tan: branchFormData.tan ? branchFormData.tan.toUpperCase().trim() : undefined,
        cin: branchFormData.cin ? branchFormData.cin.toUpperCase().trim() : undefined,
        iso: branchFormData.iso ? branchFormData.iso.trim() : undefined,
        msme: branchFormData.msme ? branchFormData.msme.toUpperCase().trim() : undefined,
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

  const handleToggleBranchesList = () => {
    if (showBranchesList || isBranchFormOpen) {
      setShowBranchesList(false);
      setIsBranchFormOpen(false);
      setEditingBranchId(null);
      setBranchFormData({});
    } else {
      setShowBranchesList(true);
    }
  };

  const loadData = async (preferredCompanyId?: string) => {
    setLoading(true);
    setError('');
    try {
      const comps = await api.getCompanies();
      setCompanies(comps);

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
    setShowBranchesList(false);
    setIsBranchFormOpen(false);
    setEditingBranchId(null);
    setBranchFormData({});
    try {
      const brs = await api.getBranches(compId);
      setBranches(brs);
      const defBranch = brs.find((b) => b.is_default) || brs[0];
      if (defBranch) setSelectedBranchId(defBranch.id);
    } catch {
      // ignore
    }
  };

  const handleDeleteCompany = async (comp: Company) => {
    if (!comp) return;
    const isLastCompany = companies.length <= 1;
    const msg = isLastCompany
      ? `Are you sure you want to delete your ONLY remaining business profile "${comp.name}" along with all its invoices, inventory, customers, and templates? This cannot be undone.`
      : `Are you sure you want to permanently delete business profile "${comp.name}" and all its associated records?`;
    if (!window.confirm(msg)) return;
    try {
      setLoading(true);
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
      setIsEditing(false);
      setEditingCompany({});
    } catch (err: any) {
      setError(err.message || 'Error deleting business profile');
    } finally {
      setLoading(false);
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
        is_default: Boolean(editingCompany.is_default),
        tan: editingCompany.tan ? editingCompany.tan.toUpperCase().trim() : undefined,
        cin: editingCompany.cin ? editingCompany.cin.toUpperCase().trim() : undefined,
        iso: editingCompany.iso ? editingCompany.iso.trim() : undefined,
        msme: editingCompany.msme ? editingCompany.msme.toUpperCase().trim() : undefined,
        email: editingCompany.email ? editingCompany.email.trim() : '',
        financial_year: editingCompany.financial_year ? editingCompany.financial_year.trim() : undefined,
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

  const handleOpenCompany = async (comp: Company) => {
    let targetBranch: Branch | null = null;
    if (comp.id === selectedCompanyId && branches.length > 0) {
      targetBranch =
        branches.find((b) => b.id === selectedBranchId) ||
        branches.find((b) => b.is_default) ||
        branches[0] ||
        null;
    } else {
      try {
        const brs = await api.getBranches(comp.id);
        targetBranch = brs.find((b) => b.is_default) || brs[0] || null;
      } catch {
        // ignore
      }
    }

    setSelectedCompanyId(comp.id);
    onSelect(comp, targetBranch);
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
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 dark:text-slate-100">
        {/* Modal Window Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/80">
          <div className="flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Select Business & Branch</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors"
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
              {/* Action Toolbar: Only New button */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCompany({
                      business_type: 'Private Limited Company',
                      state: 'Madhya Pradesh',
                      state_code: '23',
                      pin_code: '452001',
                      financial_year: getIndianFinancialYear(),
                    });
                    setIsEditing(true);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-sm font-semibold shadow-xs transition-all"
                >
                  <span>New</span>
                </button>
                <span className="text-xs text-slate-500">
                  Click row to open company • Click company name to edit
                </span>
              </div>

              {/* Business Companies Table (scrollable when companies exceed viewport space) */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shadow-sm">
                <div className="max-h-[42vh] overflow-y-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold sticky top-0 z-10 shadow-[inset_0_-1px_0_0_rgb(226,232,240)] dark:shadow-[inset_0_-1px_0_0_rgb(51,65,85)]">
                      <tr>
                        <th className="py-2.5 px-4 w-16">ID</th>
                        <th className="py-2.5 px-4">Business Name</th>
                        <th className="py-2.5 px-4">GST Number</th>
                        <th className="py-2.5 px-4">State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {companies.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400 text-sm">
                            No companies found. Click <span className="font-semibold text-emerald-600 dark:text-emerald-400">+ New</span> above to create your business profile.
                          </td>
                        </tr>
                      ) : (
                        companies.map((c, idx) => (
                          <tr
                            key={c.id}
                            onClick={() => handleOpenCompany(c)}
                            title="Click row to open this company"
                            className="cursor-pointer bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                          >
                            <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 font-mono text-xs">{idx + 1}</td>
                            <td className="py-2.5 px-4 font-semibold">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCompanySelect(c.id);
                                  setEditingCompany({ ...c });
                                  setIsEditing(true);
                                }}
                                className="text-left font-semibold text-slate-900 dark:text-white inline-flex items-center space-x-2 cursor-pointer"
                                title="Click to edit company details"
                              >
                                <span>{c.name}</span>
                              </button>
                            </td>
                            <td className="py-2.5 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">{c.gstin || '-'}</td>
                            <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">{c.state} ({c.state_code})</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Branch Selector & Multiple Branch Management */}
              {branches.length > 0 && (() => {
                const selectedBranch = branches.find((b) => b.id === selectedBranchId) || branches[0];
                return (
                <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <GitBranch className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Operating Branch:</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-56">
                        <SearchableSelect
                          options={branches.map((b) => ({
                            value: b.id,
                            label: b.name,
                            code: b.code,
                            badge: b.is_default ? 'Default' : undefined,
                          }))}
                          value={selectedBranchId}
                          onChange={(val) => {
                            setSelectedBranchId(val);
                            const comp = companies.find((c) => c.id === selectedCompanyId);
                            const br = branches.find((b) => b.id === val);
                            if (comp && br && comp.id === currentCompanyId) {
                              onSelect(comp, br);
                            }
                          }}
                          placeholder="Select branch..."
                          size="sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenAddBranch}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-md border border-slate-300 dark:border-slate-600 transition-colors"
                        title="Add a new branch"
                      >
                        <span>Add</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleBranchesList}
                        className={`inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                          showBranchesList || isBranchFormOpen
                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-sm'
                            : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600'
                        }`}
                        title="View all branches table"
                      >
                        <span>{showBranchesList || isBranchFormOpen ? 'Hide Branches' : `View Branches (${branches.length})`}</span>
                      </button>
                    </div>
                  </div>

                  {/* Branches Table List (when View Branches is clicked) */}
                  {showBranchesList && (
                    <div className="mt-3 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                      <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                          All Branches of Selected Company
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Click row to select, click branch name to edit or delete
                        </span>
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold">
                          <tr>
                            <th className="py-2 px-3 w-10">#</th>
                            <th className="py-2 px-3">Branch Name</th>
                            <th className="py-2 px-3 w-20">Code</th>
                            <th className="py-2 px-3">State & Code</th>
                            <th className="py-2 px-3">Bank Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {branches.map((b, idx) => {
                            const isSelected = b.id === selectedBranchId;
                            return (
                              <tr
                                key={b.id}
                                onClick={() => {
                                  setSelectedBranchId(b.id);
                                  const comp = companies.find((c) => c.id === selectedCompanyId);
                                  if (comp && comp.id === currentCompanyId) {
                                    onSelect(comp, b);
                                  }
                                }}
                                onDoubleClick={() => {
                                  setSelectedBranchId(b.id);
                                  handleOpenEditBranch(b);
                                }}
                                className={`cursor-pointer transition-colors ${
                                  isSelected ? 'bg-sky-50 dark:bg-brand-950/60 font-medium text-brand-900 dark:text-brand-300' : 'text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                                <td className="py-2 px-3 font-semibold">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedBranchId(b.id);
                                      handleOpenEditBranch(b);
                                    }}
                                    className="text-left font-semibold text-brand-700 dark:text-brand-400 flex items-center space-x-1.5 cursor-pointer"
                                    title="Click to view & edit branch details"
                                  >
                                    <span>{b.name}</span>
                                    {b.is_default && (
                                      <span className="text-slate-500 text-[11px] font-normal">
                                        (Default)
                                      </span>
                                    )}
                                  </button>
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-slate-600 dark:text-slate-300">{b.code}</td>
                                <td className="py-2 px-3">{b.state} ({b.state_code})</td>
                                <td className="py-2 px-3 text-slate-500 dark:text-slate-400">
                                  {b.use_company_bank ? (
                                    <span className="text-slate-500 italic">Company Bank</span>
                                  ) : (
                                    <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                                      {b.bank_name || 'Custom'} ({b.bank_ifsc || '-'})
                                    </span>
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
                    <div className="mt-3 p-3.5 bg-white dark:bg-slate-800 border border-brand-200 dark:border-brand-800 rounded-lg shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-1.5">
                        <span className="text-xs font-bold text-brand-800 dark:text-brand-300 uppercase tracking-wide">
                          {editingBranchId ? `Edit Operating Branch: ${branchFormData.name || ''}` : 'Create New Operating Branch'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsBranchFormOpen(false);
                            setEditingBranchId(null);
                            setBranchFormData({});
                          }}
                          className="text-slate-400 hover:text-slate-600 p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Branch Name *</label>
                          <input
                            type="text"
                            placeholder="e.g. Hyderabad Regional Office"
                            value={branchFormData.name || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, name: e.target.value })}
                            className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Branch Code *</label>
                          <input
                            type="text"
                            placeholder="e.g. HYD01"
                            value={branchFormData.code || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, code: e.target.value.toUpperCase() })}
                            className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">GST Number</label>
                          <input
                            type="text"
                            placeholder="Branch GST Number (if separate)"
                            value={branchFormData.gstin || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, gstin: e.target.value.toUpperCase() })}
                            className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mail ID (Email)</label>
                          <input
                            type="email"
                            placeholder="e.g. branch@company.com"
                            value={branchFormData.email || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, email: e.target.value })}
                            className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">TAN Number</label>
                          <input
                            type="text"
                            placeholder="e.g. BLRE12345F"
                            value={branchFormData.tan || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, tan: e.target.value.toUpperCase() })}
                            className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">CIN Number</label>
                          <input
                            type="text"
                            placeholder="e.g. U72900MH2023PTC123456"
                            value={branchFormData.cin || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, cin: e.target.value.toUpperCase() })}
                            className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">MSME / Udyam Number</label>
                          <input
                            type="text"
                            placeholder="e.g. UDYAM-XX-00-0000000"
                            value={branchFormData.msme || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, msme: e.target.value.toUpperCase() })}
                            className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">ISO Number / Certification</label>
                          <input
                            type="text"
                            placeholder="e.g. ISO 9001:2015"
                            value={branchFormData.iso || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, iso: e.target.value })}
                            className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">State & Code</label>
                          <SearchableSelect
                            options={stateOptions}
                            value={branchFormData.state_code || branchFormData.state || '23'}
                            onChange={(val) => {
                              const s = INDIAN_STATES.find((st) => st.code === val);
                              setBranchFormData({
                                ...branchFormData,
                                state_code: val,
                                state: s ? s.name : branchFormData.state,
                              });
                            }}
                            placeholder="Type state name or code..."
                            size="sm"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                          <input
                            type="text"
                            placeholder="e.g. +91 98260 12345"
                            value={branchFormData.phone || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, phone: e.target.value })}
                            className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Financial Year</label>
                          <input
                            type="text"
                            list="fy-branch-list"
                            placeholder={`Auto: ${getIndianFinancialYear()} (Dynamic Rollover)`}
                            value={branchFormData.financial_year || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, financial_year: e.target.value })}
                            className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                          <datalist id="fy-branch-list">
                            <option value="" label="Auto: Dynamic Rollover (Follows System Date)" />
                            {dynamicFyList.map((fy) => (
                              <option key={fy} value={fy} label={fy === getIndianFinancialYear() ? `${fy} (Current Active FY)` : fy} />
                            ))}
                          </datalist>
                        </div>
                        <div className="col-span-2">
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Branch Address</label>
                          <input
                            type="text"
                            placeholder="Plot / Street / Locality"
                            value={branchFormData.address || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, address: e.target.value })}
                            className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        {/* Option: Use Main Branch / Company Bank Details */}
                        <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                          <div className="flex items-center justify-between bg-sky-50/70 dark:bg-sky-950/40 p-2.5 rounded-lg border border-sky-200 dark:border-sky-800">
                            <label className="flex items-center space-x-2 text-xs font-semibold text-brand-900 dark:text-sky-200 cursor-pointer select-none">
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
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              {(branchFormData.use_company_bank ?? true) ? 'Using Company Bank' : 'Custom Branch Bank'}
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bank Name</label>
                          <input
                            type="text"
                            placeholder="e.g. State Bank of India"
                            disabled={branchFormData.use_company_bank ?? true}
                            value={branchFormData.bank_name || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, bank_name: e.target.value })}
                            className={`w-full border rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500 ${
                              (branchFormData.use_company_bank ?? true)
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed border-slate-300 dark:border-slate-700'
                                : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-600'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bank Account Number</label>
                          <input
                            type="text"
                            placeholder="Account Number"
                            disabled={branchFormData.use_company_bank ?? true}
                            value={branchFormData.bank_account_no || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, bank_account_no: e.target.value })}
                            className={`w-full border rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500 ${
                              (branchFormData.use_company_bank ?? true)
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed border-slate-300 dark:border-slate-700'
                                : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-600'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">IFSC Code</label>
                          <input
                            type="text"
                            placeholder="e.g. SBIN0001234"
                            disabled={branchFormData.use_company_bank ?? true}
                            value={branchFormData.bank_ifsc || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, bank_ifsc: e.target.value.toUpperCase() })}
                            className={`w-full border rounded px-2.5 py-1.5 font-mono uppercase outline-none focus:ring-1 focus:ring-brand-500 ${
                              (branchFormData.use_company_bank ?? true)
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed border-slate-300 dark:border-slate-700'
                                : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-600'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Branch Details</label>
                          <input
                            type="text"
                            placeholder="e.g. Main Branch, MG Road"
                            disabled={branchFormData.use_company_bank ?? true}
                            value={branchFormData.bank_branch || ''}
                            onChange={(e) => setBranchFormData({ ...branchFormData, bank_branch: e.target.value })}
                            className={`w-full border rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-brand-500 ${
                              (branchFormData.use_company_bank ?? true)
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed border-slate-300 dark:border-slate-700'
                                : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-600'
                            }`}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-200">
                        {editingBranchId ? (
                          <button
                            type="button"
                            onClick={() => {
                              const b = branches.find((br) => br.id === editingBranchId);
                              if (b) handleDeleteBranch(b);
                            }}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-semibold transition-all shadow-xs"
                            title="Delete this branch"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Branch</span>
                          </button>
                        ) : (
                          <div />
                        )}

                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsBranchFormOpen(false);
                              setEditingBranchId(null);
                              setBranchFormData({});
                            }}
                            className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveBranch}
                            className="inline-flex items-center space-x-1 px-3.5 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-xs font-semibold shadow-xs transition-all"
                          >
                            <span>{editingBranchId ? 'Save Branch' : 'Create Branch'}</span>
                          </button>
                        </div>
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
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">
                  {editingCompany.id ? 'Edit Company Information' : 'Create New Company'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-semibold"
                >
                  Back to list
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Company Name *</label>
                  <input
                    type="text"
                    value={editingCompany.name || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                    placeholder="e.g. Acme Trading Co."
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">GST Number</label>
                  <input
                    type="text"
                    value={editingCompany.gstin || ''}
                    onChange={(e) => handleGstinChange(e.target.value)}
                    placeholder="e.g. 36AABCA1234D1Z5"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 font-mono uppercase outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">PAN</label>
                  <input
                    type="text"
                    value={editingCompany.pan || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, pan: e.target.value.toUpperCase() })}
                    placeholder="e.g. AABCA1234D"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 font-mono uppercase outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">TAN Number</label>
                  <input
                    type="text"
                    value={editingCompany.tan || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, tan: e.target.value.toUpperCase() })}
                    placeholder="e.g. BLRE12345F"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 font-mono uppercase outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">CIN Number</label>
                  <input
                    type="text"
                    value={editingCompany.cin || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, cin: e.target.value.toUpperCase() })}
                    placeholder="e.g. U72900MH2023PTC123456"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 font-mono uppercase outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">MSME / Udyam Number</label>
                  <input
                    type="text"
                    value={editingCompany.msme || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, msme: e.target.value.toUpperCase() })}
                    placeholder="e.g. UDYAM-XX-00-0000000"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 font-mono uppercase outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">ISO Number / Certification</label>
                  <input
                    type="text"
                    value={editingCompany.iso || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, iso: e.target.value })}
                    placeholder="e.g. ISO 9001:2015"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Mail ID (Email)</label>
                  <input
                    type="email"
                    value={editingCompany.email || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, email: e.target.value })}
                    placeholder="e.g. info@company.com"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Financial Year</label>
                  <input
                    type="text"
                    list="fy-company-list"
                    value={editingCompany.financial_year || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, financial_year: e.target.value })}
                    placeholder={`Auto: ${getIndianFinancialYear()} (Dynamic Rollover)`}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                  <datalist id="fy-company-list">
                    <option value="" label="Auto: Dynamic Rollover (Follows System Date)" />
                    {dynamicFyList.map((fy) => (
                      <option key={fy} value={fy} label={fy === getIndianFinancialYear() ? `${fy} (Current Active FY)` : fy} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">State & Code *</label>
                  <SearchableSelect
                    options={stateOptions}
                    value={editingCompany.state_code || editingCompany.state || '23'}
                    onChange={(val) => {
                      const s = INDIAN_STATES.find((st) => st.code === val);
                      setEditingCompany((prev) => ({
                        ...prev,
                        state: s?.name || '',
                        state_code: val,
                      }));
                    }}
                    placeholder="Type state name or code (e.g. Telangana or 36)..."
                    size="sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={editingCompany.phone || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, phone: e.target.value })}
                    placeholder="+91 98260 12345"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Registered Address</label>
                  <textarea
                    rows={2}
                    value={editingCompany.registered_address || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, registered_address: e.target.value })}
                    placeholder="Complete address with PIN code"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={editingCompany.bank_name || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_name: e.target.value })}
                    placeholder="State Bank of India"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Bank Account Number</label>
                  <input
                    type="text"
                    value={editingCompany.bank_account_no || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_account_no: e.target.value })}
                    placeholder="Account Number"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={editingCompany.bank_ifsc || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_ifsc: e.target.value.toUpperCase() })}
                    placeholder="e.g. SBIN0001234"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 font-mono uppercase outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Branch Details</label>
                  <input
                    type="text"
                    value={editingCompany.bank_branch || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_branch: e.target.value })}
                    placeholder="e.g. Main Branch, MG Road"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* Optional manual selection for Default Company */}
                <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="inline-flex items-center space-x-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(editingCompany.is_default)}
                      onChange={(e) => setEditingCompany({ ...editingCompany, is_default: e.target.checked })}
                      className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Set as Default Business Profile</span>
                      <p className="text-[11px] text-slate-400">Manually check this if you want this company pre-selected automatically when opening the software.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                {editingCompany.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      const comp = companies.find((c) => c.id === editingCompany.id);
                      if (comp) handleDeleteCompany(comp);
                    }}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-sm font-semibold transition-all shadow-xs"
                    title="Permanently delete this business profile"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Company</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditingCompany({});
                    }}
                    className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCompany}
                    className="inline-flex items-center space-x-1.5 px-4 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-sm font-semibold shadow-xs transition-all"
                  >
                    <span>{editingCompany.id ? 'Save Changes' : 'Save Business'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};
