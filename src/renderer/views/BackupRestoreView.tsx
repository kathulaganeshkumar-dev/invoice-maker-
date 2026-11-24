// src/renderer/views/BackupRestoreView.tsx - Simple One-Click Company Backup, Download & Direct Live Restore
import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import {
  Database,
  Download,
  Upload,
  RotateCcw,
  ShieldCheck,
  HardDrive,
  Clock,
  FolderOpen,
  Save,
  Play,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Check,
} from 'lucide-react';
import { AutoBackupSettings } from '../../shared/types';

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

  // Automated Daily Backup & Retention State
  const [autoSettings, setAutoSettings] = useState<AutoBackupSettings>({
    auto_backup_enabled: true,
    auto_backup_frequency: 'DAILY',
    auto_backup_interval_days: 1,
    auto_backup_retention_days: 30,
    auto_backup_max_count: 30,
    backup_save_path: '',
    last_auto_backup_at: null,
    resolved_backup_dir: '',
  });
  const [loadingAuto, setLoadingAuto] = useState<boolean>(true);
  const [savingAuto, setSavingAuto] = useState<boolean>(false);
  const [runningAuto, setRunningAuto] = useState<boolean>(false);
  const [autoMsg, setAutoMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setMessage('');
    setAutoMsg(null);
    loadBackups();
    loadAutoSettings();
  }, [companyId]);

  const loadAutoSettings = async () => {
    setLoadingAuto(true);
    try {
      const data = await api.getAutoBackupSettings(companyId);
      setAutoSettings(data);
    } catch (err) {
      console.error('Error loading auto-backup settings:', err);
    } finally {
      setLoadingAuto(false);
    }
  };

  const handleSaveAutoSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingAuto(true);
    setAutoMsg(null);
    try {
      const res = await api.updateAutoBackupSettings(autoSettings, companyId);
      setAutoSettings(res.settings);
      setAutoMsg({ type: 'success', text: 'Automated backup settings saved successfully!' });
      setTimeout(() => setAutoMsg(null), 4000);
    } catch (err: any) {
      setAutoMsg({ type: 'error', text: err.message || 'Failed to save auto-backup settings.' });
    } finally {
      setSavingAuto(false);
    }
  };

  const handleRunAutoBackupNow = async () => {
    setRunningAuto(true);
    setAutoMsg(null);
    try {
      const res = await api.runAutoBackupNow(companyId);
      if (res.backup) {
        setAutoMsg({
          type: 'success',
          text: `Automated backup created successfully! Saved to: ${res.destinationDir} (${res.backup.filename})${
            res.prunedCount > 0 ? ` [Pruned ${res.prunedCount} old backups according to retention rules]` : ''
          }`,
        });
      } else {
        setAutoMsg({ type: 'success', text: res.message || 'Auto-backup executed.' });
      }
      await loadBackups();
      await loadAutoSettings();
    } catch (err: any) {
      setAutoMsg({ type: 'error', text: err.message || 'Failed to run automated backup.' });
    } finally {
      setRunningAuto(false);
    }
  };

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

      {/* Automated Daily Backup & Retention Control Panel */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 flex items-center justify-center text-brand-600 dark:text-brand-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <span>Automated Daily Backup &amp; Retention Policy</span>
                {autoSettings.auto_backup_enabled ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Active
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-600">
                    Paused
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Scheduled offline database snapshots with custom folder path and automatic disk cleanup
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {autoSettings.last_auto_backup_at && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Last auto-backup: <span className="font-semibold text-slate-700 dark:text-slate-200">{new Date(autoSettings.last_auto_backup_at).toLocaleString()}</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleRunAutoBackupNow}
              disabled={runningAuto || savingAuto}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              title="Trigger an immediate snapshot now to verify settings and folder path"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{runningAuto ? 'Running Backup...' : 'Run Auto-Backup Now'}</span>
            </button>
          </div>
        </div>

        {autoMsg && (
          <div
            className={`mx-5 mt-4 p-3 rounded-lg text-xs font-medium border flex items-center space-x-2 ${
              autoMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            {autoMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{autoMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveAutoSettings} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Toggle */}
            <div className="lg:col-span-1 border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col justify-between">
              <div>
                <label className="flex items-center space-x-2 cursor-pointer font-bold text-xs text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={autoSettings.auto_backup_enabled}
                    onChange={(e) =>
                      setAutoSettings((prev) => ({ ...prev, auto_backup_enabled: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                  />
                  <span>Enable Auto-Backup</span>
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Automatically safeguards data in the background without user intervention.
                </p>
              </div>
            </div>

            {/* 2. Frequency */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-900/30">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                Backup Frequency:
              </label>
              <select
                value={autoSettings.auto_backup_frequency}
                onChange={(e) =>
                  setAutoSettings((prev) => ({
                    ...prev,
                    auto_backup_frequency: e.target.value as 'DAILY' | 'EVERY_N_DAYS',
                  }))
                }
                className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-2.5 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="DAILY">Daily (Every 24 Hours) — Default</option>
                <option value="EVERY_N_DAYS">Custom Interval (Every N Days)</option>
              </select>

              {autoSettings.auto_backup_frequency === 'EVERY_N_DAYS' && (
                <div className="mt-2 flex items-center space-x-2">
                  <span className="text-[11px] text-slate-600 dark:text-slate-400">Run every:</span>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={autoSettings.auto_backup_interval_days}
                    onChange={(e) =>
                      setAutoSettings((prev) => ({
                        ...prev,
                        auto_backup_interval_days: Math.max(1, parseInt(e.target.value) || 1),
                      }))
                    }
                    className="w-16 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-center font-mono font-bold bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold">days</span>
                </div>
              )}
            </div>

            {/* 3. Retention Days (How many days to keep) */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-900/30">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                Retention Days (Keep in Backup):
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={autoSettings.auto_backup_retention_days}
                  onChange={(e) =>
                    setAutoSettings((prev) => ({
                      ...prev,
                      auto_backup_retention_days: Math.max(1, parseInt(e.target.value) || 1),
                    }))
                  }
                  className="w-20 border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-brand-500"
                />
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">Days</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                Backups older than this number of days are automatically deleted.
              </p>
            </div>

            {/* 4. Max Backup Count */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-900/30">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                Max Backups to Retain:
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={autoSettings.auto_backup_max_count}
                  onChange={(e) =>
                    setAutoSettings((prev) => ({
                      ...prev,
                      auto_backup_max_count: Math.max(1, parseInt(e.target.value) || 1),
                    }))
                  }
                  className="w-20 border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-brand-500"
                />
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">Copies</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                Ensures total backup files in folder do not exceed this limit.
              </p>
            </div>
          </div>

          {/* Folder Path Input */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-900/30">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
              Backup Destination Folder (Local Drive Path):
            </label>
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="e.g. D:\Backups\InvoiceManager or C:\Users\YourUser\Documents\BusinessBackups"
                  value={autoSettings.backup_save_path || ''}
                  onChange={(e) =>
                    setAutoSettings((prev) => ({ ...prev, backup_save_path: e.target.value }))
                  }
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <button
                type="submit"
                disabled={savingAuto}
                className="inline-flex items-center space-x-1.5 px-4 py-1.5 bg-slate-900 dark:bg-slate-100 hover:bg-black dark:hover:bg-white text-white dark:text-slate-900 rounded-md text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingAuto ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
              <span>Enter an absolute path on your computer (e.g. D:\Backups or external USB drive).</span>
              {autoSettings.resolved_backup_dir && (
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  Target: <span className="font-bold">{autoSettings.resolved_backup_dir}</span>
                </span>
              )}
            </div>
          </div>
        </form>
      </div>

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
