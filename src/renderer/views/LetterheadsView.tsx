// src/renderer/views/LetterheadsView.tsx - Upload & Manage Invoice / Quotation Print Templates
import React, { useState, useEffect, useRef } from 'react';
import { LetterheadTemplate, Company } from '../../shared/types';
import { api } from '../services/api';
import {
  FileUp,
  FileText,
  Trash2,
  CheckCircle,
  Building2,
  ExternalLink,
  Upload,
} from 'lucide-react';

interface Props {
  companyId: string;
}

export const LetterheadsView: React.FC<Props> = ({ companyId }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [viewingCompanyId, setViewingCompanyId] = useState<string>(companyId);
  const [templates, setTemplates] = useState<LetterheadTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Upload Print Template Form State
  const [uploadCompanyId, setUploadCompanyId] = useState<string>(companyId);
  const [templateName, setTemplateName] = useState<string>('');
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [orientation, setOrientation] = useState<'AUTO' | 'PORTRAIT' | 'LANDSCAPE'>('AUTO');
  const [setAsDefault, setSetAsDefault] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (viewingCompanyId) {
      loadTemplates(viewingCompanyId);
    }
  }, [viewingCompanyId]);

  const loadCompanies = async () => {
    try {
      const comps = await api.getCompanies();
      setCompanies(comps);
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
      formData.append('is_default', String(setAsDefault));
      formData.append('auto_detect', 'true');

      const res = await api.importLetterhead(cid, formData);
      const compName = companies.find((c) => c.id === cid)?.name || 'company';
      setSuccessMsg(`Uploaded print template "${res.template.name}" for ${compName}.`);

      setTemplateFile(null);
      setTemplateName('');
      setOrientation('AUTO');
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

  const viewingCompany = companies.find((c) => c.id === viewingCompanyId);

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
            <FileUp className="w-5 h-5 text-brand-600" />
            <span>Print Templates (Invoices &amp; Quotations)</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Upload your custom PDF, Word (.docx), PNG, or JPG templates to control how invoices and quotations are printed.
          </p>
        </div>

        {companies.length > 1 && (
          <div className="flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-slate-400" />
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
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
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

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
          <label className="inline-flex items-center space-x-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={setAsDefault}
              onChange={(e) => setSetAsDefault(e.target.checked)}
              className="rounded text-brand-600 cursor-pointer"
            />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Set as default print template for Invoices &amp; Quotations
            </span>
          </label>

          <button
            type="submit"
            disabled={uploading || !templateFile}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer transition-colors"
          >
            <FileUp className="w-4 h-4" />
            <span>{uploading ? 'Uploading Template...' : 'Upload Print Template'}</span>
          </button>
        </div>
      </form>

      {/* Uploaded Templates Grid */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Uploaded Templates ({templates.length})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full py-10 text-center text-xs text-slate-400">
              Loading print templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="col-span-full bg-white dark:bg-slate-800 p-10 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
              <div className="w-11 h-11 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                No Print Templates Uploaded
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Upload a PDF, PNG, or JPG template above to print your invoices and quotations using your own layout.
              </p>
            </div>
          ) : (
            templates.map((tpl) => (
              <div
                key={tpl.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex flex-col justify-between space-y-4 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {tpl.name}
                    </span>
                    <div className="flex items-center space-x-1.5 shrink-0">
                      {tpl.id.startsWith('builtin-') && (
                        <span className="text-[10px] bg-brand-100 text-brand-800 dark:bg-brand-950/60 dark:text-brand-300 font-bold px-2 py-0.5 rounded-full">
                          Built-in Format
                        </span>
                      )}
                      {tpl.is_default && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full inline-flex items-center space-x-1">
                          <CheckCircle className="w-3 h-3" />
                          <span>Default</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {viewingCompany && (
                    <div className="text-[10px] font-semibold text-brand-600 dark:text-brand-400 flex items-center space-x-1 mb-2">
                      <Building2 className="w-3 h-3" />
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
                        <span>Uploaded File:</span>
                        <a
                          href={api.getLetterheadFileUrl(viewingCompanyId, tpl.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1 text-[11px] font-semibold text-brand-600 hover:underline truncate max-w-[170px]"
                          title={tpl.file_path}
                        >
                          <span className="truncate">{tpl.file_path.split(/[\\/]/).pop()}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-3">
                  {tpl.is_default ? (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Active Default Template
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(tpl)}
                      className="text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      Set as Default
                    </button>
                  )}

                  {tpl.id.startsWith('builtin-') ? (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">Built-in Format</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDelete(tpl)}
                      className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
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
    </div>
  );
};
