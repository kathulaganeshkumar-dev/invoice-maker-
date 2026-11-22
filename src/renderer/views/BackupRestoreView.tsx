// src/renderer/views/BackupRestoreView.tsx - Simple One-Click Company Backup, Download & Direct Live Restore
import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Database, Download, Upload, RotateCcw, ShieldCheck, HardDrive } from 'lucide-react';

interface Props {
  companyId?: string;
  companyName?: string;
}

export const BackupRestoreView: React.FC<Props> = ({ companyId, companyName }) => {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMessage('');
    loadBackups();
  }, [companyId]);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const data = await api.getBackups(companyId);
      setBackups(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    setCreating(true);
    setMessage('');
    try {
      // Automatically backs up the currently active company (or full DB if no company is active)
      const created = await api.createBackup(companyId || undefined);
      setMessage(
        companyName
          ? `Backup created for "${companyName}" (${created.filename})!`
          : `Database snapshot created (${created.filename})!`
      );
      await loadBackups();
    } catch (err: any) {
      alert(err.message || 'Error creating backup');
    } finally {
      setCreating(false);
    }
  };

  const finishRestore = (res: any) => {
    const s = res?.summary;
    if (companyId) {
      sessionStorage.setItem('eim_restore_active_company_id', companyId);
    } else {
      sessionStorage.removeItem('eim_restore_active_company_id');
    }
    const targetLabel = s?.targetCompanyName || companyName;
    const details = s
      ? `\n\nRestored: ${s.customers} customers, ${s.suppliers} suppliers, ${s.products} products, ${s.invoices} invoices, ${s.quotations} quotations, ${s.purchases} purchases, ${s.payments} payments.`
      : '';
    alert(
      `Backup restored successfully${targetLabel ? ` into "${targetLabel}"` : ''}!${details}\n\nThe software will now reload with your updated data.`
    );
    window.location.href = '/';
  };

  const handleUploadRestore = async (file: File | null) => {
    if (!file) return;
    setRestoring(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (companyId) {
        formData.append('mode', 'INTO_COMPANY');
        formData.append('targetCompanyId', companyId);
      } else {
        formData.append('mode', 'FULL_REPLACE');
      }
      const res = await api.uploadRestoreBackup(formData);
      finishRestore(res);
    } catch (err: any) {
      alert(err.message || 'Invalid backup file. Please upload a valid .sqlite3 backup file.');
    } finally {
      setRestoring(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const handleSavedRestore = async (filename: string) => {
    const targetText = companyName ? ` into "${companyName}"` : '';
    if (
      !confirm(
        `Restore backup "${filename}"${targetText}?\n\nA safety backup of your current data will be saved automatically before restoring.`
      )
    ) {
      return;
    }

    setRestoring(true);
    setMessage('');
    try {
      const res = await api.restoreBackup(
        filename,
        companyId
          ? { mode: 'INTO_COMPANY', targetCompanyId: companyId }
          : { mode: 'FULL_REPLACE' }
      );
      finishRestore(res);
    } catch (err: any) {
      alert(err.message || 'Error restoring backup');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
            Database Backup &amp; Point-in-Time Restore
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Offline backup snapshots, USB/drive downloads, and direct one-step restore
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={uploadInputRef}
            type="file"
            accept=".sqlite3,.sqlite,.db"
            className="hidden"
            onChange={(e) => handleUploadRestore(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={restoring || creating}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold shadow-sm transition-all disabled:opacity-50"
            title="Upload a .sqlite3 backup file to restore directly"
          >
            <span>{restoring ? 'Restoring Backup...' : 'Upload & Restore Backup'}</span>
          </button>

          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={creating || restoring}
            className="inline-flex items-center space-x-1.5 px-4 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <span>{creating ? 'Creating Backup...' : 'Create Backup Now'}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg flex items-center space-x-2">
          <span>{message}</span>
        </div>
      )}

      {/* Backup Archives Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 font-bold text-xs text-slate-800 dark:text-slate-200">
          {companyName
            ? `Saved Snapshots for "${companyName}" (${backups.length})`
            : `Saved Database Snapshots (${backups.length})`}
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Backup File Name</th>
              <th className="py-3 px-4">Created Date &amp; Time</th>
              <th className="py-3 px-4 text-right">Size</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-400">
                  Loading backup snapshots...
                </td>
              </tr>
            ) : backups.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-400">
                  No previous backup snapshots found. Click &quot;Create Backup Now&quot; to safeguard your data.
                </td>
              </tr>
            ) : (
              backups.map((b) => (
                <tr key={b.id}>
                  <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                    {b.filename}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {new Date(b.createdAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                    {(b.sizeBytes / 1024).toFixed(1)} KB
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <a
                        href={api.getBackupDownloadUrl(b.filename, companyId)}
                        download={b.filename}
                        className="inline-flex items-center space-x-1 px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-[11px] font-bold shadow-sm transition-all"
                        title="Download this backup file to save on a USB drive or external folder"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </a>

                      <button
                        type="button"
                        disabled={restoring || creating}
                        onClick={() => handleSavedRestore(b.filename)}
                        className="inline-flex items-center space-x-1 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[11px] font-bold shadow-sm transition-all disabled:opacity-50"
                        title="Restore this backup directly into your active company"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore Snapshot</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
