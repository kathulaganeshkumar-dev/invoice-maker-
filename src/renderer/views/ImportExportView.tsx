// src/renderer/views/ImportExportView.tsx - Excel, CSV & PDF/Image Letterhead Template Import
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Company } from '../../shared/types';
import { FileDown, FileUp, FileSpreadsheet, Stamp, CheckCircle, Sparkles } from 'lucide-react';

interface Props {
  companyId: string;
}

export const ImportExportView: React.FC<Props> = ({ companyId }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [targetCompanyId, setTargetCompanyId] = useState<string>(companyId);
  const [templateName, setTemplateName] = useState<string>('');
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [isDefault, setIsDefault] = useState<boolean>(false);
  const [autoDetect, setAutoDetect] = useState<boolean>(true);
  const [importing, setImporting] = useState<boolean>(false);
  const [resultMsg, setResultMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (companyId) setTargetCompanyId(companyId);
    loadCompanies();
  }, [companyId]);

  const loadCompanies = async () => {
    try {
      const comps = await api.getCompanies();
      setCompanies(comps);
    } catch (err) {
      console.error(err);
    }
  };

  const handleImportTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateFile) {
      setErrorMsg('Please select a PDF, PNG, or JPG template file to import.');
      return;
    }
    const cid = targetCompanyId || companyId;
    if (!cid) {
      setErrorMsg('Please select a target company.');
      return;
    }

    setImporting(true);
    setResultMsg('');
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', templateFile);
      formData.append('target_company_id', cid);
      if (templateName.trim()) formData.append('name', templateName.trim());
      formData.append('is_default', String(isDefault));
      formData.append('auto_detect', String(autoDetect));

      const res = await api.importLetterhead(cid, formData);
      const compName = companies.find((c) => c.id === cid)?.name || 'selected company';
      const detected = [
        res.analysis?.detected_entities?.company_name && `Company: ${res.analysis.detected_entities.company_name}`,
        res.analysis?.detected_entities?.gstin && `GSTIN: ${res.analysis.detected_entities.gstin}`,
      ]
        .filter(Boolean)
        .join(' • ');

      setResultMsg(
        `Imported "${res.template.name}" (${res.template.file_type}) into ${compName} → Letterheads & Templates.${
          detected ? ` AI Detected: ${detected}` : ''
        }`
      );
      setTemplateFile(null);
      setTemplateName('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to import template file');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
          <FileDown className="w-5 h-5 text-brand-600" />
          <span>Excel, CSV & Template Import / Export Engine</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Export full company data, download standardized Excel templates, or import PDF/Image letterhead templates
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Data Box */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 font-bold text-sm text-slate-800 dark:text-slate-100">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <span>Export Company Master Data</span>
          </div>
          <p className="text-xs text-slate-500">
            Generate clean, formatted Excel workbooks containing complete master records for audits or offline analysis:
          </p>

          <div className="space-y-2.5 pt-2">
            <a
              href={api.getCustomersExportUrl(companyId)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <div>
                <div className="font-bold text-xs text-slate-800 dark:text-slate-100">Customers Directory</div>
                <div className="text-[11px] text-slate-400">All customer contacts, GSTIN, addresses, and live balances</div>
              </div>
              <span className="text-xs font-bold text-brand-600">Download .xlsx</span>
            </a>

            <a
              href={api.getProductsExportUrl(companyId)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <div>
                <div className="font-bold text-xs text-slate-800 dark:text-slate-100">Products & Services Catalog</div>
                <div className="text-[11px] text-slate-400">Items, HSN/SAC codes, GST tax rates, prices, and stock counts</div>
              </div>
              <span className="text-xs font-bold text-brand-600">Download .xlsx</span>
            </a>
          </div>
        </div>

        {/* Import Templates Box */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 font-bold text-sm text-slate-800 dark:text-slate-100">
            <FileUp className="w-5 h-5 text-brand-600" />
            <span>Download Standard Import Templates</span>
          </div>
          <p className="text-xs text-slate-500">
            Use pre-formatted Excel template files with exact headers and column schemas for fast bulk population:
          </p>

          <div className="space-y-2.5 pt-2">
            <a
              href={api.getCustomerImportTemplateUrl()}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <div>
                <div className="font-bold text-xs text-slate-800 dark:text-slate-100">Customer Import Template</div>
                <div className="text-[11px] text-slate-400">Pre-configured Excel file with sample data and validation rules</div>
              </div>
              <span className="text-xs font-bold text-emerald-600">Download Template</span>
            </a>
          </div>
        </div>

        {/* Import New Template (PDF / Image) to Letterheads & Templates */}
        <form
          onSubmit={handleImportTemplate}
          className="md:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 font-bold text-sm text-slate-800 dark:text-slate-100">
              <Stamp className="w-5 h-5 text-brand-600" />
              <span>Import New Template to Letterheads & Templates (PDF / PNG / JPG)</span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 flex items-center space-x-1">
              <Sparkles className="w-3 h-3" />
              <span>Offline AI Layout Detection</span>
            </span>
          </div>

          <p className="text-xs text-slate-500">
            Upload a local PDF letterhead or PNG/JPG stationery template file. It is stored offline and added directly to your company&apos;s{' '}
            <strong>Letterheads & Templates</strong> category for invoices and quotations.
          </p>

          {resultMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{resultMsg}</span>
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
                Assign to Company *
              </label>
              <select
                value={targetCompanyId}
                onChange={(e) => setTargetCompanyId(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 font-semibold"
              >
                {companies.length === 0 ? (
                  <option value={companyId}>Active Company</option>
                ) : (
                  companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.gstin ? `(${c.gstin})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Template Name
              </label>
              <input
                type="text"
                placeholder="e.g. Company Head Office Letterhead"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Select PDF / Image Template *
              </label>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setTemplateFile(f);
                  if (f && !templateName.trim()) {
                    setTemplateName(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
                  }
                }}
                className="w-full border border-dashed border-brand-400 rounded-lg px-2.5 py-1.5 bg-brand-50/40 dark:bg-slate-900 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDetect}
                  onChange={(e) => setAutoDetect(e.target.checked)}
                  className="rounded text-brand-600"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Auto-Detect Margins via Offline AI
                </span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded text-brand-600"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Set as Company Default
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={importing || !templateFile}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <FileUp className="w-4 h-4" />
              <span>{importing ? 'Importing Template...' : 'Import to Letterheads & Templates'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
