// src/renderer/views/BackupRestoreView.tsx - Database Backup & Safe Restore
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  Database,
  Download,
  RotateCcw,
  ShieldCheck,
  HardDrive,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

export const BackupRestoreView: React.FC = () => {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const data = await api.getBackups();
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
      await api.createBackup();
      setMessage('Full database snapshot backup created successfully!');
      await loadBackups();
    } catch (err: any) {
      alert(err.message || 'Error creating backup');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (filename: string) => {
    if (
      !window.confirm(
        `Are you sure you want to restore from ${filename}? A safety snapshot of your current database will be saved automatically prior to restoration.`
      )
    ) {
      return;
    }

    try {
      await api.restoreBackup(filename);
      alert('Database restored successfully! The application will refresh.');
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Error restoring database');
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
            <Database className="w-5 h-5 text-brand-600" />
            <span>Database Backup & Point-in-Time Restore</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Zero-cloud offline snapshots, automated safety backups, and disaster recovery
          </p>
        </div>

        <button
          type="button"
          onClick={handleCreateBackup}
          disabled={creating}
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all disabled:opacity-50"
        >
          <HardDrive className="w-4 h-4" />
          <span>{creating ? 'Creating Snapshot...' : 'Create Full Backup Now'}</span>
        </button>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>{message}</span>
        </div>
      )}

      {/* Backup Archives Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 font-bold text-xs text-slate-800 dark:text-slate-200">
          Saved Database Snapshots ({backups.length})
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Backup File Name</th>
              <th className="py-3 px-4">Created Date & Time</th>
              <th className="py-3 px-4 text-right">Size</th>
              <th className="py-3 px-4 text-center">Safety Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {backups.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-400">
                  No previous backup snapshots found. Click "Create Full Backup Now" to safeguard your data.
                </td>
              </tr>
            ) : (
              backups.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                    {b.filename}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {new Date(b.createdAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600">
                    {(b.sizeBytes / 1024).toFixed(1)} KB
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleRestore(b.filename)}
                      className="inline-flex items-center space-x-1 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[11px] font-bold shadow-sm transition-all"
                      title="Safely restore database to this snapshot"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore Snapshot</span>
                    </button>
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
