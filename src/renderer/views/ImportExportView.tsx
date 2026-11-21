// src/renderer/views/ImportExportView.tsx - Full Excel & CSV Backup / Import Portability Engine
import React, { useState, useRef } from 'react';
import { api } from '../services/api';
import {
  FileDown,
  FileUp,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Info,
  Upload,
  Loader2,
} from 'lucide-react';

interface Props {
  companyId: string;
}

interface DataCategory {
  id:
    | 'customers'
    | 'products'
    | 'suppliers'
    | 'purchases'
    | 'inventory'
    | 'payments-receivable'
    | 'payments-suppliers';
  title: string;
  exportDesc: string;
  importDesc: string;
  exportUrl: (companyId: string) => string;
}

const DATA_CATEGORIES: DataCategory[] = [
  {
    id: 'customers',
    title: 'Customers Directory',
    exportDesc: 'All customer contacts, GSTIN, addresses, bank details, reminders, notes & balances',
    importDesc: 'Import previous customer records (extra Excel columns auto-saved into Notes)',
    exportUrl: (cid) => api.getCustomersExportUrl(cid),
  },
  {
    id: 'products',
    title: 'Products & Services Catalog',
    exportDesc: 'Items, HSN/SAC, GST rates, purchase & min/max selling prices, stock & notes',
    importDesc: 'Import products/services with categories, HSN, GST & min/max selling prices',
    exportUrl: (cid) => api.getProductsExportUrl(cid),
  },
  {
    id: 'suppliers',
    title: 'Suppliers Directory',
    exportDesc: 'All vendors, contacts, GSTIN, bank accounts, payment reminder days, notes & payables',
    importDesc: 'Import previous vendor/supplier records (extra Excel columns auto-saved into Notes)',
    exportUrl: (cid) => api.getSuppliersExportUrl(cid),
  },
  {
    id: 'purchases',
    title: 'Purchases & Vendor Bills',
    exportDesc: 'All purchase bills, GST, overall discounts, balances, notes & line items',
    importDesc: 'Import single-sheet or exported 2-sheet purchase bills (auto-links suppliers & stock)',
    exportUrl: (cid) => api.getPurchasesExportUrl(cid),
  },
  {
    id: 'inventory',
    title: 'Inventory & Stock',
    exportDesc: 'Warehouse stock balances, average cost, valuation, low-stock status & stock ledger',
    importDesc: 'Import opening/current warehouse stock quantities, costs & minimum stock alerts',
    exportUrl: (cid) => api.getInventoryExportUrl(cid),
  },
  {
    id: 'payments-receivable',
    title: 'Payments Receivable (Customers)',
    exportDesc: 'Customer receipts, company bank accounts, invoice allocations & pending receivables',
    importDesc: 'Import customer payment receipts with invoice numbers, payment mode, bank & notes',
    exportUrl: (cid) => api.getPaymentsReceivableExportUrl(cid),
  },
  {
    id: 'payments-suppliers',
    title: 'Payments to Suppliers (Vendors)',
    exportDesc: 'Vendor payouts, company & vendor banks, bill allocations & pending payables',
    importDesc: 'Import supplier payments with purchase bill #, company bank, vendor bank & notes',
    exportUrl: (cid) => api.getPaymentsToSuppliersExportUrl(cid),
  },
];

interface ImportFeedback {
  title: string;
  imported: number;
  updated: number;
  skipped: number;
  extraColumnsCaptured: string[];
  errors: string[];
}

export const ImportExportView: React.FC<Props> = ({ companyId }) => {
  const [importingId, setImportingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleFileChange = async (cat: DataCategory, file: File | null) => {
    if (!file) return;
    setImportingId(cat.id);
    setFeedback(null);
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.importExcelData(companyId, cat.id, formData);
      setFeedback({
        title: cat.title,
        imported: res.imported,
        updated: res.updated,
        skipped: res.skipped,
        extraColumnsCaptured: res.extraColumnsCaptured || [],
        errors: res.errors || [],
      });
    } catch (err: any) {
      setErrorMsg(`${cat.title}: ${err.message || 'Failed to import file'}`);
    } finally {
      setImportingId(null);
      const inputEl = fileInputRefs.current[cat.id];
      if (inputEl) inputEl.value = '';
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
          <FileDown className="w-5 h-5 text-brand-600" />
          <span>Excel &amp; CSV Import / Export Engine</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Export full company Excel backups or import previous data across all categories with automatic Notes capture
        </p>
      </div>

      {/* Active Import Rules Callout */}
      <div className="p-3.5 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/70 text-xs text-slate-700 dark:text-slate-200 flex items-start space-x-2.5">
        <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-sky-900 dark:text-sky-200">
            Import Rules Applied to Every Category (.xlsx / .csv)
          </div>
          <div className="text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-4 gap-y-0.5">
            <span><strong>1.</strong> All manual-entry fields match the Excel import template (and exported backups).</span>
            <span><strong>2.</strong> Missing or empty cells are left blank automatically.</span>
            <span><strong>3.</strong> Any extra columns in your sheet are automatically saved into <strong>Notes</strong>.</span>
          </div>
        </div>
      </div>

      {/* Import Success / Error Summary Banner */}
      {feedback && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 font-bold text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Import Complete — {feedback.title}:{' '}
                <strong>{feedback.imported}</strong> added
                {feedback.updated > 0 ? `, ${feedback.updated} updated` : ''}
                {feedback.skipped > 0 ? `, ${feedback.skipped} skipped` : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-[11px] font-semibold text-emerald-700 hover:underline"
            >
              Dismiss
            </button>
          </div>

          {feedback.extraColumnsCaptured.length > 0 && (
            <div className="text-[11px] text-emerald-800 dark:text-emerald-300">
              <strong>Extra columns automatically saved into Notes:</strong>{' '}
              {feedback.extraColumnsCaptured.join(', ')}
            </div>
          )}

          {feedback.errors.length > 0 && (
            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-1 max-h-32 overflow-y-auto">
              <div className="font-bold flex items-center space-x-1 text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Row Notes / Warnings ({feedback.errors.length})</span>
              </div>
              {feedback.errors.slice(0, 15).map((err, i) => (
                <div key={i} className="text-[11px] font-mono">
                  • {err}
                </div>
              ))}
              {feedback.errors.length > 15 && (
                <div className="text-[10px] italic">
                  ...and {feedback.errors.length - 15} more warnings.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} className="text-[11px] underline ml-3">
            Close
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Data Box */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 font-bold text-sm text-slate-800 dark:text-slate-100">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <span>Export Company Data (Excel Backups)</span>
          </div>
          <p className="text-xs text-slate-500">
            Generate clean, formatted Excel workbooks containing complete records for backups, audits, or offline analysis:
          </p>

          <div className="space-y-2.5 pt-1">
            {DATA_CATEGORIES.map((cat) => (
              <a
                key={`export-${cat.id}`}
                href={cat.exportUrl(companyId)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-bold text-xs text-slate-800 dark:text-slate-100">{cat.title}</div>
                  <div className="text-[11px] text-slate-400 truncate">{cat.exportDesc}</div>
                </div>
                <span className="text-xs font-bold text-brand-600 shrink-0">Download .xlsx</span>
              </a>
            ))}
          </div>
        </div>

        {/* Import Data & Templates Box */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 font-bold text-sm text-slate-800 dark:text-slate-100">
            <FileUp className="w-5 h-5 text-brand-600" />
            <span>Import Data &amp; Standard Excel Templates</span>
          </div>
          <p className="text-xs text-slate-500">
            Download a blank template or upload your existing <strong>.xlsx / .csv</strong> file directly for each category:
          </p>

          <div className="space-y-2.5 pt-1">
            {DATA_CATEGORIES.map((cat) => {
              const isBusy = importingId === cat.id;
              return (
                <div
                  key={`import-${cat.id}`}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs text-slate-800 dark:text-slate-100">{cat.title}</div>
                    <div className="text-[11px] text-slate-400 truncate">{cat.importDesc}</div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <a
                      href={api.getImportTemplateUrl(cat.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-colors"
                      title={`Download standard Excel template for ${cat.title}`}
                    >
                      Template
                    </a>

                    <input
                      ref={(el) => {
                        fileInputRefs.current[cat.id] = el;
                      }}
                      type="file"
                      accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                      className="hidden"
                      onChange={(e) => handleFileChange(cat, e.target.files?.[0] || null)}
                    />
                    <button
                      type="button"
                      disabled={importingId !== null}
                      onClick={() => fileInputRefs.current[cat.id]?.click()}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-bold shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
                      title={`Upload .xlsx or .csv file to import ${cat.title}`}
                    >
                      {isBusy ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Importing...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" />
                          <span>Import</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
