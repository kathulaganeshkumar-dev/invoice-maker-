// src/renderer/views/LetterheadsView.tsx - Upload & Manage Invoice / Quotation Print Templates
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LetterheadTemplate, Company, TemplateAppliesTo } from '../../shared/types';
import { api } from '../services/api';
import { ModalPortal } from '../components/ModalPortal';
import {
  FileUp,
  FileText,
  Trash2,
  CheckCircle,
  Building2,
  ExternalLink,
  Upload,
  Eye,
  Edit2,
  X,
  Filter,
  Check,
} from 'lucide-react';

interface Props {
  companyId: string;
}

export const LetterheadsView: React.FC<Props> = ({ companyId }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [viewingCompanyId, setViewingCompanyId] = useState<string>(companyId);
  const [templates, setTemplates] = useState<LetterheadTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'INVOICE' | 'QUOTATION' | 'BOTH'>('ALL');

  // Upload Print Template Form State
  const [uploadCompanyId, setUploadCompanyId] = useState<string>(companyId);
  const [templateName, setTemplateName] = useState<string>('');
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [orientation, setOrientation] = useState<'AUTO' | 'PORTRAIT' | 'LANDSCAPE'>('AUTO');
  const [appliesTo, setAppliesTo] = useState<TemplateAppliesTo>('BOTH');
  const [uploading, setUploading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Modal State
  const [editingTemplate, setEditingTemplate] = useState<LetterheadTemplate | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editAppliesTo, setEditAppliesTo] = useState<TemplateAppliesTo>('BOTH');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  useEffect(() => {
    if (companyId) {
      setViewingCompanyId(companyId);
      setUploadCompanyId(companyId);
    }
  }, [companyId]);

  useEffect(() => {
    loadCompanies();
  }, [companyId]);

  useEffect(() => {
    loadTemplates(viewingCompanyId || 'default');
  }, [viewingCompanyId]);

  const loadCompanies = async () => {
    try {
      const comps = await api.getCompanies();
      setCompanies(comps);
      if (!viewingCompanyId && comps.length > 0) {
        setViewingCompanyId(comps[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadTemplates = async (cid: string) => {
    setLoading(true);
    try {
      const data = await api.getLetterheads(cid);
      setTemplates(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateFile) {
      setErrorMsg('Please select a PDF, Word (.docx), PNG, or JPG print template file to upload.');
      return;
    }

    const cid = uploadCompanyId || viewingCompanyId || companyId;
    if (!cid) {
      setErrorMsg('Please select a company.');
      return;
    }

    setUploading(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', templateFile);
      formData.append('target_company_id', cid);
      if (templateName.trim()) formData.append('name', templateName.trim());
      if (orientation !== 'AUTO') formData.append('orientation', orientation);
      formData.append('applies_to', appliesTo);
      formData.append('is_default', 'false');
      formData.append('auto_detect', 'true');

      const res = await api.importLetterhead(cid, formData);
      const compName = companies.find((c) => c.id === cid)?.name || 'company';
      setSuccessMsg(`Uploaded print template "${res.template.name}" for ${compName}.`);

      setTemplateFile(null);
      setTemplateName('');
      setOrientation('AUTO');
      setAppliesTo('BOTH');
      if (fileInputRef.current) fileInputRef.current.value = '';

      if (cid === viewingCompanyId) {
        await loadTemplates(cid);
      } else {
        setViewingCompanyId(cid);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload print template.');
    } finally {
      setUploading(false);
    }
  };

  const handleSetDefault = async (tpl: LetterheadTemplate) => {
    try {
      await api.updateLetterhead(viewingCompanyId, tpl.id, { is_default: true });
      await loadTemplates(viewingCompanyId);
    } catch (err: any) {
      alert(err.message || 'Could not update default print template');
    }
  };

  const handleDelete = async (tpl: LetterheadTemplate) => {
    if (!window.confirm(`Delete print template "${tpl.name}"?`)) return;
    try {
      await api.deleteLetterhead(viewingCompanyId, tpl.id);
      await loadTemplates(viewingCompanyId);
    } catch (err: any) {
      alert(err.message || 'Could not delete print template');
    }
  };

  const handleOpenEditModal = (tpl: LetterheadTemplate) => {
    setEditingTemplate(tpl);
    setEditName(tpl.name);
    setEditAppliesTo(tpl.applies_to || 'BOTH');
  };

  const handleSaveEdit = async () => {
    if (!editingTemplate) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      alert('Template name cannot be empty.');
      return;
    }

    setIsSavingEdit(true);
    try {
      await api.updateLetterhead(viewingCompanyId, editingTemplate.id, {
        name: trimmed,
        applies_to: editAppliesTo,
      });
      setSuccessMsg(`Template "${trimmed}" updated successfully.`);
      setEditingTemplate(null);
      await loadTemplates(viewingCompanyId);
    } catch (err: any) {
      alert(err.message || 'Could not update template.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const viewingCompany = companies.find((c) => c.id === viewingCompanyId);

  const filteredTemplates = useMemo(() => {
    if (activeTab === 'ALL') return templates;
    if (activeTab === 'INVOICE') {
      return templates.filter((t) => t.applies_to === 'INVOICE');
    }
    if (activeTab === 'QUOTATION') {
      return templates.filter((t) => t.applies_to === 'QUOTATION');
    }
    if (activeTab === 'BOTH') {
      return templates.filter((t) => !t.applies_to || t.applies_to === 'BOTH');
    }
    return templates;
  }, [templates, activeTab]);

  const countInvoice = templates.filter((t) => t.applies_to === 'INVOICE').length;
  const countQuotation = templates.filter((t) => t.applies_to === 'QUOTATION').length;
  const countBoth = templates.filter((t) => !t.applies_to || t.applies_to === 'BOTH').length;

  const renderAppliesToBadge = (scope?: TemplateAppliesTo) => {
    if (scope === 'INVOICE') {
      return (
        <span className="text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 font-bold px-2.5 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
          Invoices Only
        </span>
      );
    }
    if (scope === 'QUOTATION') {
      return (
        <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
          Quotations Only
        </span>
      );
    }
    return (
      <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 font-bold px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
        Invoices &amp; Quotations
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
            Print Templates (Invoices &amp; Quotations)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure print templates, customize where each template is used (Invoices, Quotations, or Both), and preview format files.
          </p>
        </div>

        {companies.length > 1 && (
          <div className="flex items-center space-x-2">
            <select
              value={viewingCompanyId}
              onChange={(e) => {
                setViewingCompanyId(e.target.value);
                setUploadCompanyId(e.target.value);
              }}
              className="border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.gstin ? `(${c.gstin})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Upload Print Template Card */}
      <form
        onSubmit={handleUploadTemplate}
        className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4"
      >
        <div className="flex items-center space-x-2 font-bold text-sm text-slate-800 dark:text-slate-100">
          <Upload className="w-4 h-4 text-brand-600" />
          <span>Upload New Print Template</span>
        </div>

        {successMsg && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg('')}
              className="text-emerald-600 hover:text-emerald-800 text-xs font-bold"
            >
              ×
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs font-semibold flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              className="text-rose-600 hover:text-rose-800 text-xs font-bold"
            >
              ×
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Template Name
            </label>
            <input
              type="text"
              placeholder="e.g. Sales Invoice Template"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Template File (PDF / DOCX / PNG / JPG) *
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.docx,.doc,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setTemplateFile(f);
                setErrorMsg('');
                if (f && !templateName.trim()) {
                  setTemplateName(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
                }
              }}
              className="w-full border border-dashed border-brand-400 rounded-lg px-2.5 py-1.5 bg-brand-50/40 dark:bg-slate-900 cursor-pointer"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Where to Use (Availability)
            </label>
            <select
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as TemplateAppliesTo)}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 font-medium"
            >
              <option value="BOTH">Both Invoices &amp; Quotations</option>
              <option value="INVOICE">Invoices Only</option>
              <option value="QUOTATION">Quotations Only</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Page Orientation
            </label>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as any)}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 font-medium"
            >
              <option value="AUTO">Auto Detect</option>
              <option value="PORTRAIT">Portrait (A4)</option>
              <option value="LANDSCAPE">Landscape (A4)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={uploading || !templateFile}
            className="inline-flex items-center space-x-1.5 px-4 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer transition-colors"
          >
            <span>{uploading ? 'Uploading Template...' : 'Upload Print Template'}</span>
          </button>
        </div>
      </form>

      {/* Filter Tabs & Uploaded Templates Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Available Print Templates ({templates.length})
          </h2>

          {/* Availability Scope Filter Tabs */}
          <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 space-x-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'ALL'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All ({templates.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('INVOICE')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'INVOICE'
                  ? 'bg-purple-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Invoices Only ({countInvoice})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('QUOTATION')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'QUOTATION'
                  ? 'bg-amber-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Quotations Only ({countQuotation})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('BOTH')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'BOTH'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Both ({countBoth})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full py-10 text-center text-xs text-slate-400">
              Loading print templates...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="col-span-full bg-white dark:bg-slate-800 p-10 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
              <div className="w-11 h-11 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                No Print Templates Found for Filter
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No templates currently match the selected filter tab. Try clicking "All" or editing a template's availability.
              </p>
            </div>
          ) : (
            filteredTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex flex-col justify-between space-y-4 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
              >
                <div>
                  {/* Title & Badges */}
                  <div className="flex items-start justify-between gap-2 mb-2 min-h-[42px]">
                    <span
                      className="font-bold text-sm text-slate-900 dark:text-white leading-snug line-clamp-2"
                      title={tpl.name}
                    >
                      {tpl.name}
                    </span>
                    <div className="flex items-center space-x-1.5 shrink-0 pt-0.5">
                      {tpl.id.startsWith('builtin-') && (
                        <span className="text-[10px] bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 font-bold px-2 py-0.5 rounded-full">
                          Built-in
                        </span>
                      )}
                      {tpl.is_default ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full inline-flex items-center space-x-1 shadow-xs">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          <span>Default</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(tpl)}
                          className="text-[10px] bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 dark:bg-slate-750 dark:hover:bg-emerald-950/60 dark:text-slate-300 dark:hover:text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600 hover:border-emerald-300 transition-colors cursor-pointer"
                          title="Click to set as default template"
                        >
                          Set Default
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Availability Badge */}
                  <div className="mb-2 h-5 flex items-center">
                    {renderAppliesToBadge(tpl.applies_to)}
                  </div>

                  {viewingCompany && (
                    <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center space-x-1 mb-2 h-4">
                      <Building2 className="w-3 h-3 text-brand-600" />
                      <span className="truncate">{viewingCompany.name}</span>
                    </div>
                  )}

                  <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 mt-2">
                    <div className="flex justify-between">
                      <span>File Type:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{tpl.file_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Paper Size:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {tpl.page_size} ({tpl.orientation})
                      </span>
                    </div>
                    {tpl.file_path && (
                      <div className="flex justify-between items-center pt-1">
                        <span>Format File:</span>
                        <span
                          className="text-[11px] font-mono text-slate-700 dark:text-slate-300 truncate max-w-[170px]"
                          title={tpl.file_path}
                        >
                          {tpl.file_path.split(/[\\/]/).pop()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Prominent Open Template Format Button */}
                  <div className="pt-3">
                    <button
                      type="button"
                      onClick={() => window.open(api.getLetterheadFileUrl(viewingCompanyId, tpl.id), '_blank')}
                      className="w-full inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      title="Open and check this blank template format file in a new tab"
                    >
                      <Eye className="w-3.5 h-3.5 text-brand-600" />
                      <span>Open Template Format</span>
                      <ExternalLink className="w-3 h-3 text-slate-400 ml-1" />
                    </button>
                  </div>
                </div>

                {/* Footer Controls: Edit Name/Usage, Delete */}
                <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-3">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(tpl)}
                    className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 border border-slate-200 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    title="Change template name or set where it should be used"
                  >
                    <Edit2 className="w-3 h-3 text-amber-600" />
                    <span>Edit Name &amp; Usage</span>
                  </button>

                  {!tpl.id.startsWith('builtin-') && (
                    <button
                      type="button"
                      onClick={() => handleDelete(tpl)}
                      className="text-slate-400 hover:text-rose-600 p-1 transition-colors rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      title="Delete Print Template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit Template Modal */}
      {editingTemplate && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
                    <Edit2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      Edit Print Template
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Change template name and configure where it is available.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Template Display Name *
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter template name..."
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    This name will appear in the Print Template dropdowns.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Where should this template be available? *
                  </label>
                  <div className="space-y-2">
                    <label
                      className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        editAppliesTo === 'INVOICE'
                          ? 'bg-purple-50/70 border-purple-400 dark:bg-purple-950/40 dark:border-purple-700'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                      }`}
                    >
                      <input
                        type="radio"
                        name="appliesTo"
                        value="INVOICE"
                        checked={editAppliesTo === 'INVOICE'}
                        onChange={() => setEditAppliesTo('INVOICE')}
                        className="mt-0.5 text-purple-600 cursor-pointer"
                      />
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                          <span>Invoices Only</span>
                          <span className="text-[9px] bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300 font-bold px-1.5 py-0.2 rounded">
                            Sales &amp; Tax Invoices
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Only available when creating and printing Sales &amp; Tax Invoices. Hidden from Commercial Quotations.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        editAppliesTo === 'QUOTATION'
                          ? 'bg-amber-50/70 border-amber-400 dark:bg-amber-950/40 dark:border-amber-700'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                      }`}
                    >
                      <input
                        type="radio"
                        name="appliesTo"
                        value="QUOTATION"
                        checked={editAppliesTo === 'QUOTATION'}
                        onChange={() => setEditAppliesTo('QUOTATION')}
                        className="mt-0.5 text-amber-600 cursor-pointer"
                      />
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                          <span>Quotations Only</span>
                          <span className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 font-bold px-1.5 py-0.2 rounded">
                            Quotations
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Only available when creating and printing Commercial Quotations. Hidden from Invoices.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        editAppliesTo === 'BOTH'
                          ? 'bg-blue-50/70 border-blue-400 dark:bg-blue-950/40 dark:border-blue-700'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                      }`}
                    >
                      <input
                        type="radio"
                        name="appliesTo"
                        value="BOTH"
                        checked={editAppliesTo === 'BOTH'}
                        onChange={() => setEditAppliesTo('BOTH')}
                        className="mt-0.5 text-blue-600 cursor-pointer"
                      />
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                          <span>Both Invoices &amp; Quotations</span>
                          <span className="text-[9px] bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 font-bold px-1.5 py-0.2 rounded">
                            Universal
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Available in both Commercial Quotations and Sales &amp; Tax Invoices.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* File info summary */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1 text-[11px] text-slate-500">
                  <div className="flex justify-between">
                    <span>Format File:</span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {editingTemplate.file_path.split(/[\\/]/).pop()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>File Type / Paper:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {editingTemplate.file_type} • {editingTemplate.page_size} ({editingTemplate.orientation})
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingEdit || !editName.trim()}
                  onClick={handleSaveEdit}
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer transition-colors inline-flex items-center space-x-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};
