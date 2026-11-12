// src/renderer/components/ConfigurationModal.tsx - Comprehensive Business & Global Configuration
import React, { useState, useEffect } from 'react';
import { CompanySettings, AppSettings, Company, NumberingSequence } from '../../shared/types';
import { api } from '../services/api';
import {
  Settings,
  DollarSign,
  FileText,
  Package,
  Server,
  X,
  Save,
  CheckCircle,
  Image as ImageIcon,
  FolderOpen,
  ListOrdered,
  FileCheck,
  Check,
  AlertCircle,
  RefreshCw,
  Upload,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
}

export const ConfigurationModal: React.FC<Props> = ({ isOpen, onClose, companyId }) => {
  const [activeCategory, setActiveCategory] = useState<string>('Business_Settings');
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [sequences, setSequences] = useState<NumberingSequence[]>([]);
  const [editingSeqId, setEditingSeqId] = useState<string | null>(null);
  const [seqFormData, setSeqFormData] = useState<Partial<NumberingSequence>>({});

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  // Database Connection Test State
  const [testDbLoading, setTestDbLoading] = useState<boolean>(false);
  const [testDbResult, setTestDbResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isOpen && companyId) {
      loadAllSettings();
    }
  }, [isOpen, companyId]);

  const loadAllSettings = async () => {
    setLoading(true);
    try {
      const [cs, as, comp, seqList] = await Promise.all([
        api.getCompanySettings(companyId),
        api.getAppSettings(),
        api.getCompany(companyId),
        api.getSequences(companyId),
      ]);
      setCompanySettings(cs);
      setAppSettings(as);
      setCompany(comp);
      setSequences(seqList);
    } catch (err) {
      console.error('Error loading configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!companySettings) return;
    try {
      await api.updateCompanySettings(companyId, companySettings);
      if (appSettings) {
        await api.updateAppSettings(appSettings);
      }
      if (company) {
        await api.updateCompany(company.id, company);
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('Error saving settings');
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setCompany({ ...company, logo_url: base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleClearLogo = () => {
    if (company) {
      setCompany({ ...company, logo_url: '' });
    }
  };

  const handleUpdateSequence = async (seqId: string) => {
    try {
      await api.updateSequence(companyId, seqId, seqFormData);
      const updated = await api.getSequences(companyId);
      setSequences(updated);
      setEditingSeqId(null);
      setSeqFormData({});
      alert('Sequence updated successfully!');
    } catch (err: any) {
      alert(err.message || 'Error updating sequence');
    }
  };

  const handleTestDatabaseConnection = async () => {
    if (!appSettings) return;
    setTestDbLoading(true);
    setTestDbResult(null);
    try {
      const res = await api.testDatabaseConnection({
        pg_host: appSettings.pg_host,
        pg_port: appSettings.pg_port || 5432,
        pg_database: appSettings.pg_database,
        pg_user: appSettings.pg_user,
        pg_password: appSettings.pg_password,
      });
      setTestDbResult({ success: true, message: res.message || 'Connection successful!' });
    } catch (err: any) {
      setTestDbResult({ success: false, message: err.message || 'Connection failed' });
    } finally {
      setTestDbLoading(false);
    }
  };

  if (!isOpen || !companySettings || !company) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
        {/* Title Bar */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-bold text-slate-800">Configuration & Preferences</h2>
            <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-semibold border border-brand-200">
              {company.name}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Container: Sidebar + Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Category Sidebar */}
          <div className="w-64 border-r border-slate-200 bg-slate-50/70 p-3 overflow-y-auto space-y-4 text-xs font-medium select-none">
            {/* Business Group */}
            <div>
              <div className="font-bold text-slate-400 uppercase tracking-wider px-2 mb-1 flex items-center space-x-1">
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                <span>Business</span>
              </div>
              <div className="space-y-0.5">
                {[
                  { id: 'Business_Settings', label: 'Document Settings' },
                  { id: 'Business_Currency', label: 'Currency & Numbering' },
                  { id: 'Business_Logo', label: 'Company Logo' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveCategory(item.id)}
                    className={`w-full text-left px-3 py-1.5 rounded-md transition-colors ${
                      activeCategory === item.id ? 'bg-brand-100 text-brand-900 font-bold' : 'text-slate-700 hover:bg-slate-200/60'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sales Documents Group */}
            <div>
              <div className="font-bold text-slate-400 uppercase tracking-wider px-2 mb-1 flex items-center space-x-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Sales & Quotations</span>
              </div>
              <div className="space-y-0.5">
                {[
                  { id: 'Sales_Invoice_Rules', label: 'Invoice Rules & Terms' },
                  { id: 'Sales_Quotation_Defaults', label: 'Quotation Defaults' },
                  { id: 'Sales_Numbering_Sequences', label: 'Numbering Sequences' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveCategory(item.id)}
                    className={`w-full text-left px-3 py-1.5 rounded-md transition-colors ${
                      activeCategory === item.id ? 'bg-brand-100 text-brand-900 font-bold' : 'text-slate-700 hover:bg-slate-200/60'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Saving Paths by Category */}
            <div>
              <div className="font-bold text-slate-400 uppercase tracking-wider px-2 mb-1 flex items-center space-x-1">
                <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                <span>Saving Paths</span>
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setActiveCategory('Category_Save_Paths')}
                  className={`w-full text-left px-3 py-1.5 rounded-md transition-colors ${
                    activeCategory === 'Category_Save_Paths' ? 'bg-brand-100 text-brand-900 font-bold' : 'text-slate-700 hover:bg-slate-200/60'
                  }`}
                >
                  Local Folders by Category
                </button>
              </div>
            </div>

            {/* Inventory Group */}
            <div>
              <div className="font-bold text-slate-400 uppercase tracking-wider px-2 mb-1 flex items-center space-x-1">
                <Package className="w-3.5 h-3.5 text-slate-400" />
                <span>Inventory & Stock</span>
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setActiveCategory('Inventory_Rules')}
                  className={`w-full text-left px-3 py-1.5 rounded-md transition-colors ${
                    activeCategory === 'Inventory_Rules' ? 'bg-brand-100 text-brand-900 font-bold' : 'text-slate-700 hover:bg-slate-200/60'
                  }`}
                >
                  Valuation & Alerts
                </button>
              </div>
            </div>

            {/* Deployment & LAN Group */}
            <div>
              <div className="font-bold text-slate-400 uppercase tracking-wider px-2 mb-1 flex items-center space-x-1">
                <Server className="w-3.5 h-3.5 text-slate-400" />
                <span>Deployment & Network</span>
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setActiveCategory('Deployment_Mode')}
                  className={`w-full text-left px-3 py-1.5 rounded-md transition-colors ${
                    activeCategory === 'Deployment_Mode' ? 'bg-brand-100 text-brand-900 font-bold' : 'text-slate-700 hover:bg-slate-200/60'
                  }`}
                >
                  LAN Multi-User (IP Connect)
                </button>
              </div>
            </div>
          </div>

          {/* Right Main Settings Panel */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            {/* 1. Document Settings */}
            {activeCategory === 'Business_Settings' && (
              <>
                <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white shadow-sm">
                  <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2">Document Behavior</h3>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Invoice overdue days (Grace Period):</label>
                      <input
                        type="number"
                        value={companySettings.invoice_overdue_days}
                        onChange={(e) =>
                          setCompanySettings({ ...companySettings, invoice_overdue_days: Number(e.target.value) })
                        }
                        className="w-32 border border-slate-300 rounded px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 text-xs">
                    <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={companySettings.print_invoice_after_save}
                        onChange={(e) =>
                          setCompanySettings({ ...companySettings, print_invoice_after_save: e.target.checked })
                        }
                        className="w-4 h-4 rounded text-brand-600 border-slate-300"
                      />
                      <span>Print invoice immediately after finalization</span>
                    </label>

                    <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={companySettings.show_postal_code_before_city}
                        onChange={(e) =>
                          setCompanySettings({ ...companySettings, show_postal_code_before_city: e.target.checked })
                        }
                        className="w-4 h-4 rounded text-brand-600 border-slate-300"
                      />
                      <span>Show postal PIN code before city in addresses</span>
                    </label>

                    <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={companySettings.include_additional_notes_in_search}
                        onChange={(e) =>
                          setCompanySettings({
                            ...companySettings,
                            include_additional_notes_in_search: e.target.checked,
                          })
                        }
                        className="w-4 h-4 rounded text-brand-600 border-slate-300"
                      />
                      <span>Include Additional Notes when searching invoices</span>
                    </label>

                    <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={companySettings.sort_invoices_by_number}
                        onChange={(e) =>
                          setCompanySettings({ ...companySettings, sort_invoices_by_number: e.target.checked })
                        }
                        className="w-4 h-4 rounded text-brand-600 border-slate-300"
                      />
                      <span>Sort invoices by document number column by default</span>
                    </label>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white shadow-sm">
                  <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2">Printed Date Format</h3>
                  <div className="w-72 text-xs">
                    <label className="block font-semibold text-slate-700 mb-1">Standard display date format:</label>
                    <select
                      value={companySettings.printed_date_format}
                      onChange={(e) =>
                        setCompanySettings({ ...companySettings, printed_date_format: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 09/11/2026)</option>
                      <option value="DD MMMM YYYY">DD MMMM YYYY (e.g. 09 November 2026)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-11-09)</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* 2. Currency & Numbering */}
            {activeCategory === 'Business_Currency' && (
              <div className="border border-slate-200 rounded-lg p-4 space-y-4 bg-white shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2">
                  Currency & Numbering Formatting
                </h3>
                <div className="space-y-3 text-xs">
                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={companySettings.show_amount_in_words}
                      onChange={(e) =>
                        setCompanySettings({ ...companySettings, show_amount_in_words: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-brand-600 border-slate-300"
                    />
                    <span>Print Amount in Words automatically on document footers</span>
                  </label>

                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={companySettings.indian_number_style}
                      onChange={(e) =>
                        setCompanySettings({ ...companySettings, indian_number_style: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-brand-600 border-slate-300"
                    />
                    <span>Indian Numbering Grouping (Crores & Lakhs, e.g. 12,34,567.00)</span>
                  </label>

                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={companySettings.zero_not_displayed}
                      onChange={(e) =>
                        setCompanySettings({ ...companySettings, zero_not_displayed: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-brand-600 border-slate-300"
                    />
                    <span>Suppress zeroes on printouts</span>
                  </label>

                  <div className="grid grid-cols-3 gap-4 pt-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Currency Name:</label>
                      <input
                        type="text"
                        value={companySettings.currency_name}
                        onChange={(e) =>
                          setCompanySettings({ ...companySettings, currency_name: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder="Rupees"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Currency Symbol:</label>
                      <input
                        type="text"
                        value={companySettings.currency_symbol}
                        onChange={(e) =>
                          setCompanySettings({ ...companySettings, currency_symbol: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder="₹"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Fractional Decimal Name:</label>
                      <input
                        type="text"
                        value={companySettings.decimal_name}
                        onChange={(e) =>
                          setCompanySettings({ ...companySettings, decimal_name: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder="Paise"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Company Logo */}
            {activeCategory === 'Business_Logo' && (
              <div className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2 flex items-center space-x-2">
                  <ImageIcon className="w-4 h-4 text-brand-600" />
                  <span>Company Brand Logo</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Upload your high-resolution company emblem or trade logo. It prints directly on PDF invoices, quotations, and official receipts.
                </p>

                <div className="flex items-center space-x-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="w-36 h-28 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center bg-white overflow-hidden shadow-sm">
                    {company.logo_url ? (
                      <img src={company.logo_url} alt="Company Logo" className="max-w-full max-h-full object-contain p-2" />
                    ) : (
                      <div className="text-center p-3">
                        <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                        <span className="text-[10px] text-slate-400 font-semibold">No Logo Uploaded</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <label className="cursor-pointer inline-flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload New Logo</span>
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="hidden" />
                      </label>

                      {company.logo_url && (
                        <button
                          type="button"
                          onClick={handleClearLogo}
                          className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded text-xs font-semibold"
                        >
                          Remove Logo
                        </button>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Recommended formats: Transparent PNG, high-res JPG. Dimensions: up to 800x400 px.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Invoice Rules & Terms */}
            {activeCategory === 'Sales_Invoice_Rules' && (
              <div className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2 flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-brand-600" />
                  <span>Invoice Rules, Notes & Terms</span>
                </h3>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Default Invoice Terms & Conditions (Prints on every invoice):</label>
                    <textarea
                      rows={4}
                      value={company.default_invoice_terms || ''}
                      onChange={(e) => setCompany({ ...company, default_invoice_terms: e.target.value })}
                      placeholder="1. Goods once sold will not be taken back.&#10;2. Interest @ 18% p.a. charged after due date.&#10;3. Subject to local jurisdiction."
                      className="w-full border border-slate-300 rounded p-2.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Default Invoice Notes / Bank Remittance instructions:</label>
                    <textarea
                      rows={3}
                      value={companySettings.default_invoice_notes || ''}
                      onChange={(e) => setCompanySettings({ ...companySettings, default_invoice_notes: e.target.value })}
                      placeholder="Please remit payment via NEFT/RTGS to Bank Account # ... IFSC ... or UPI business@upi"
                      className="w-full border border-slate-300 rounded p-2.5 text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(companySettings.default_tax_inclusive)}
                        onChange={(e) => setCompanySettings({ ...companySettings, default_tax_inclusive: e.target.checked })}
                        className="w-4 h-4 rounded text-brand-600 border-slate-300"
                      />
                      <span className="font-medium">Default new items to Tax-Inclusive pricing (MRP mode)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Quotation Defaults */}
            {activeCategory === 'Sales_Quotation_Defaults' && (
              <div className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2 flex items-center space-x-2">
                  <FileCheck className="w-4 h-4 text-brand-600" />
                  <span>Quotation Policies & Defaults</span>
                </h3>

                <div className="space-y-4 text-xs">
                  <div className="w-48">
                    <label className="block font-semibold text-slate-700 mb-1">Default Quotation Validity (Days):</label>
                    <input
                      type="number"
                      value={companySettings.quotation_validity_days || 30}
                      onChange={(e) => setCompanySettings({ ...companySettings, quotation_validity_days: Number(e.target.value) })}
                      className="w-full border border-slate-300 rounded px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Default Quotation Terms & Conditions:</label>
                    <textarea
                      rows={4}
                      value={company.default_quotation_terms || ''}
                      onChange={(e) => setCompany({ ...company, default_quotation_terms: e.target.value })}
                      placeholder="1. Quotation valid for 30 days from date of issue.&#10;2. Taxes extra as applicable.&#10;3. Delivery within 7 business days from PO."
                      className="w-full border border-slate-300 rounded p-2.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Default Quotation Notes / Scope of Supply:</label>
                    <textarea
                      rows={3}
                      value={companySettings.default_quotation_notes || ''}
                      onChange={(e) => setCompanySettings({ ...companySettings, default_quotation_notes: e.target.value })}
                      placeholder="Thank you for your inquiry. Please find our best commercial quotation as detailed above."
                      className="w-full border border-slate-300 rounded p-2.5 text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 6. Numbering Sequences */}
            {activeCategory === 'Sales_Numbering_Sequences' && (
              <div className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="font-bold text-sm text-slate-800 flex items-center space-x-2">
                    <ListOrdered className="w-4 h-4 text-brand-600" />
                    <span>Document Numbering Sequences</span>
                  </h3>
                  <span className="text-[11px] text-slate-500">Atomic anti-collision sequence tracking</span>
                </div>

                <p className="text-xs text-slate-500">
                  Configure prefix formats, fiscal year integration, and starting sequence counters for every document type.
                </p>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-semibold uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Document Type</th>
                        <th className="py-2.5 px-3">Prefix</th>
                        <th className="py-2.5 px-3">Current #</th>
                        <th className="py-2.5 px-3">Padding</th>
                        <th className="py-2.5 px-3">Last Generated</th>
                        <th className="py-2.5 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sequences.map((seq) => {
                        const isEditing = editingSeqId === seq.id;
                        return (
                          <tr key={seq.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-semibold text-slate-800">
                              {seq.document_type.replace(/_/g, ' ')}
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={seqFormData.prefix ?? seq.prefix}
                                  onChange={(e) => setSeqFormData({ ...seqFormData, prefix: e.target.value })}
                                  className="w-24 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono"
                                />
                              ) : (
                                seq.prefix
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={seqFormData.current_number ?? seq.current_number}
                                  onChange={(e) => setSeqFormData({ ...seqFormData, current_number: Number(e.target.value) })}
                                  className="w-20 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono"
                                />
                              ) : (
                                seq.current_number
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={seqFormData.padding_length ?? seq.padding_length}
                                  onChange={(e) => setSeqFormData({ ...seqFormData, padding_length: Number(e.target.value) })}
                                  className="w-16 border border-slate-300 rounded px-1.5 py-0.5 text-xs"
                                />
                              ) : (
                                `${seq.padding_length} digits`
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">
                              {seq.last_generated_number || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center space-x-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateSequence(seq.id)}
                                    className="px-2 py-0.5 bg-emerald-600 text-white rounded font-bold text-[10px]"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingSeqId(null)}
                                    className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSeqId(seq.id);
                                    setSeqFormData({
                                      prefix: seq.prefix,
                                      current_number: seq.current_number,
                                      padding_length: seq.padding_length,
                                    });
                                  }}
                                  className="text-brand-600 hover:underline font-bold text-[11px]"
                                >
                                  Edit
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 7. Saving Paths by Category */}
            {activeCategory === 'Category_Save_Paths' && (
              <div className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2 flex items-center space-x-2">
                  <FolderOpen className="w-4 h-4 text-brand-600" />
                  <span>Local Drive Saving Paths by Document Category</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Set designated folders on your local computer or network drive for automatic PDF archiving. Every generated invoice, quotation, or purchase bill can be automatically mirrored to its respective directory.
                </p>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Invoices Save Folder Path:</label>
                    <input
                      type="text"
                      placeholder="e.g. C:\BusinessDocs\Invoices"
                      value={companySettings.invoice_save_path || ''}
                      onChange={(e) => setCompanySettings({ ...companySettings, invoice_save_path: e.target.value })}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Quotations Save Folder Path:</label>
                    <input
                      type="text"
                      placeholder="e.g. C:\BusinessDocs\Quotations"
                      value={companySettings.quotation_save_path || ''}
                      onChange={(e) => setCompanySettings({ ...companySettings, quotation_save_path: e.target.value })}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Purchase Orders & Bills Save Folder Path:</label>
                    <input
                      type="text"
                      placeholder="e.g. C:\BusinessDocs\Purchases"
                      value={companySettings.purchase_save_path || ''}
                      onChange={(e) => setCompanySettings({ ...companySettings, purchase_save_path: e.target.value })}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Reports & Financial Statements Save Folder Path:</label>
                    <input
                      type="text"
                      placeholder="e.g. C:\BusinessDocs\Reports"
                      value={companySettings.report_save_path || ''}
                      onChange={(e) => setCompanySettings({ ...companySettings, report_save_path: e.target.value })}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Automated Backups Save Folder Path:</label>
                    <input
                      type="text"
                      placeholder="e.g. D:\Backups\InvoiceManager"
                      value={companySettings.backup_save_path || ''}
                      onChange={(e) => setCompanySettings({ ...companySettings, backup_save_path: e.target.value })}
                      className="w-full border border-slate-300 rounded px-3 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 8. Inventory Rules */}
            {activeCategory === 'Inventory_Rules' && (
              <div className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2">
                  Inventory Valuation & Control
                </h3>
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Inventory Valuation Costing Method:</label>
                    <select
                      value={companySettings.inventory_valuation_method}
                      onChange={(e) =>
                        setCompanySettings({
                          ...companySettings,
                          inventory_valuation_method: e.target.value as any,
                        })
                      }
                      className="w-64 border border-slate-300 rounded px-3 py-1.5 text-sm bg-white"
                    >
                      <option value="FIFO">FIFO (First In First Out)</option>
                      <option value="WEIGHTED_AVERAGE">Weighted Average Costing</option>
                    </select>
                  </div>

                  <label className="flex items-center space-x-2 text-slate-700 cursor-pointer pt-2">
                    <input
                      type="checkbox"
                      checked={companySettings.allow_negative_stock}
                      onChange={(e) =>
                        setCompanySettings({ ...companySettings, allow_negative_stock: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-brand-600 border-slate-300"
                    />
                    <span>Allow negative stock balance (Disabled by default to prevent selling phantom inventory)</span>
                  </label>
                </div>
              </div>
            )}

            {/* 9. Deployment Mode & Multi-User IP Connect */}
            {activeCategory === 'Deployment_Mode' && appSettings && (
              <div className="border border-slate-200 rounded-lg p-5 space-y-4 bg-white shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2 flex items-center space-x-2">
                  <Server className="w-4 h-4 text-brand-600" />
                  <span>Deployment Architecture & Local Network (LAN)</span>
                </h3>

                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div
                      onClick={() => setAppSettings({ ...appSettings, operating_mode: 'SINGLE_COMPUTER', db_type: 'sqlite' })}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        appSettings.operating_mode === 'SINGLE_COMPUTER'
                          ? 'border-brand-600 bg-brand-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-sm text-slate-800">Mode A: Single-Computer</div>
                      <div className="text-slate-500 mt-1">Zero-configuration embedded SQLite database. 100% offline on this machine.</div>
                    </div>

                    <div
                      onClick={() => setAppSettings({ ...appSettings, operating_mode: 'LOCAL_NETWORK_SERVER', db_type: 'postgres' })}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        appSettings.operating_mode === 'LOCAL_NETWORK_SERVER'
                          ? 'border-brand-600 bg-brand-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-sm text-slate-800">Mode B: LAN Multi-User (PostgreSQL)</div>
                      <div className="text-slate-500 mt-1">Connect 3–5 workstations over office Wi-Fi / Ethernet via IP address. No internet required.</div>
                    </div>
                  </div>

                  {appSettings.operating_mode === 'LOCAL_NETWORK_SERVER' && (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 mt-3">
                      <div className="font-bold text-xs text-slate-800 flex items-center justify-between">
                        <span>Central Server IP & Connection Parameters:</span>
                        <span className="text-[11px] text-slate-500 font-normal">Enter server PC's local IP (e.g. 192.168.1.150)</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Server Host / IP Address *</label>
                          <input
                            type="text"
                            placeholder="e.g. 192.168.1.100 or 127.0.0.1"
                            value={appSettings.pg_host || ''}
                            onChange={(e) => setAppSettings({ ...appSettings, pg_host: e.target.value })}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Port</label>
                          <input
                            type="number"
                            placeholder="5432"
                            value={appSettings.pg_port || 5432}
                            onChange={(e) => setAppSettings({ ...appSettings, pg_port: Number(e.target.value) })}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Database Name *</label>
                          <input
                            type="text"
                            placeholder="invoice_manager"
                            value={appSettings.pg_database || ''}
                            onChange={(e) => setAppSettings({ ...appSettings, pg_database: e.target.value })}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Database Username *</label>
                          <input
                            type="text"
                            placeholder="postgres"
                            value={appSettings.pg_user || ''}
                            onChange={(e) => setAppSettings({ ...appSettings, pg_user: e.target.value })}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block font-semibold text-slate-700 mb-1">Database Password</label>
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={appSettings.pg_password || ''}
                            onChange={(e) => setAppSettings({ ...appSettings, pg_password: e.target.value })}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </div>

                      <div className="pt-2 flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={handleTestDatabaseConnection}
                          disabled={testDbLoading}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          {testDbLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                          <span>Test IP Connection</span>
                        </button>

                        {testDbResult && (
                          <div
                            className={`flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1 rounded ${
                              testDbResult.success
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {testDbResult.success ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                            <span>{testDbResult.message}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            {savedSuccess && (
              <div className="flex items-center space-x-1.5 text-emerald-600 text-xs font-bold">
                <CheckCircle className="w-4 h-4" />
                <span>All settings saved successfully!</span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center space-x-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Configuration</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
