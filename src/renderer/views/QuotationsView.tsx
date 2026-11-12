// src/renderer/views/QuotationsView.tsx - Quotations Management, Template Selection & 1-Click Conversion
import React, { useState, useEffect } from 'react';
import { Quotation, Customer, Product, LetterheadTemplate } from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import { GST_RATES } from '../../shared/constants';
import {
  FileSpreadsheet,
  Plus,
  Search,
  ArrowRightCircle,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  X,
  FileCheck,
  Printer,
  ExternalLink,
  Eye,
  Stamp,
} from 'lucide-react';

interface Props {
  companyId: string;
  onNavigateToInvoice?: () => void;
}

export const QuotationsView: React.FC<Props> = ({ companyId, onNavigateToInvoice }) => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<LetterheadTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [viewingQuotation, setViewingQuotation] = useState<Quotation | null>(null);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [quoteDate, setQuoteDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState<string>(
    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [items, setItems] = useState<any[]>([
    { item_name: '', hsn_or_sac: '', quantity: '1', rate: '0.00', gst_rate: '18.00' },
  ]);
  const [notes, setNotes] = useState<string>('');

  // Selected print template in the viewing modal
  const [activePrintTemplateId, setActivePrintTemplateId] = useState<string>('');

  useEffect(() => {
    if (companyId) {
      loadQuotations();
      loadMaster();
    }
  }, [companyId]);

  const loadQuotations = async () => {
    setLoading(true);
    try {
      const data = await api.getQuotations(companyId);
      setQuotations(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMaster = async () => {
    try {
      const [cList, pList, tList] = await Promise.all([
        api.getCustomers(companyId),
        api.getProducts(companyId),
        api.getLetterheads(companyId),
      ]);
      setCustomers(cList);
      setProducts(pList);
      setTemplates(tList);
      const defTemplate = tList.find((t) => t.is_default) || tList[0];
      if (defTemplate) {
        setSelectedTemplateId(defTemplate.id);
        setActivePrintTemplateId(defTemplate.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddItem = () => {
    setItems([...items, { item_name: '', hsn_or_sac: '', quantity: '1', rate: '0.00', gst_rate: '18.00' }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleProductSelect = (index: number, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    const copy = [...items];
    copy[index] = {
      ...copy[index],
      item_id: prod.id,
      item_type: prod.item_type,
      item_name: prod.name,
      hsn_or_sac: prod.hsn_or_sac,
      rate: prod.selling_price,
      gst_rate: prod.gst_rate,
      unit: prod.unit,
    };
    setItems(copy);
  };

  const handleCreateQuotation = async () => {
    const cust = customers.find((c) => c.id === selectedCustomerId);
    if (!cust) {
      alert('Please select a customer');
      return;
    }

    try {
      await api.createQuotation(companyId, {
        customer_id: cust.id,
        customer_name: cust.name,
        customer_gstin: cust.gstin,
        billing_address: cust.billing_address,
        place_of_supply_state: cust.state,
        place_of_supply_code: cust.state_code,
        quotation_date: quoteDate,
        valid_until_date: validUntil,
        letterhead_template_id: selectedTemplateId || undefined,
        items,
        notes,
      });

      setIsCreateModalOpen(false);
      resetForm();
      await loadQuotations();
    } catch (err: any) {
      alert(err.message || 'Error creating quotation');
    }
  };

  const handleConvertToInvoice = async (quotationId: string) => {
    if (!window.confirm('Convert this quotation into a Sales Invoice draft? All items, customer details, and rates will be copied.')) {
      return;
    }
    try {
      await api.convertQuotationToInvoice(companyId, quotationId);
      await loadQuotations();
      if (viewingQuotation?.id === quotationId) setViewingQuotation(null);
      alert('Quotation converted to draft invoice successfully!');
      if (onNavigateToInvoice) onNavigateToInvoice();
    } catch (err: any) {
      alert(err.message || 'Error converting quotation');
    }
  };

  const handleDeleteQuotation = async (quotationId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this quotation?')) return;
    try {
      await api.deleteQuotation(companyId, quotationId);
      if (viewingQuotation?.id === quotationId) setViewingQuotation(null);
      await loadQuotations();
      alert('Quotation deleted successfully.');
    } catch (err: any) {
      alert(err.message || 'Error deleting quotation');
    }
  };

  const handleStatusChange = async (quotationId: string, status: string) => {
    try {
      await api.updateQuotationStatus(companyId, quotationId, status);
      await loadQuotations();
      if (viewingQuotation?.id === quotationId) {
        setViewingQuotation({ ...viewingQuotation, status: status as any });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrintPdf = (quoteId: string, mode: 'DIGITAL_LETTERHEAD' | 'PREPRINTED_STATIONERY' = 'DIGITAL_LETTERHEAD') => {
    const templateId = activePrintTemplateId || selectedTemplateId;
    const url = api.getQuotationPdfUrl(companyId, quoteId, mode, templateId);
    window.open(url, '_blank');
  };

  const resetForm = () => {
    setSelectedCustomerId('');
    setItems([{ item_name: '', hsn_or_sac: '', quantity: '1', rate: '0.00', gst_rate: '18.00' }]);
    setNotes('');
  };

  const filtered = quotations.filter((q) => {
    if (searchQuery) {
      const s = searchQuery.toLowerCase();
      return (
        q.quotation_number.toLowerCase().includes(s) ||
        q.customer_name.toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <div className="p-6 space-y-5 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-brand-600" />
            <span>Commercial Quotations & Estimates</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Create professional price estimates, revisions, print with custom letterhead templates, and 1-click convert to Sales Invoices.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Quotation</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="relative w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search quotation #, customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Quotations Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Quote # (Click to View)</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Valid Until</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4 text-right">Grand Total</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No quotations found. Click "+ New Quotation" to create an estimate.
                </td>
              </tr>
            ) : (
              filtered.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setViewingQuotation(q);
                        setActivePrintTemplateId(q.letterhead_template_id || (templates[0]?.id || ''));
                      }}
                      className="text-brand-600 dark:text-brand-400 hover:underline cursor-pointer flex items-center space-x-1"
                      title="Click to view full quotation"
                    >
                      <span>{q.quotation_number}</span>
                      <Eye className="w-3.5 h-3.5 text-slate-400 opacity-60 hover:opacity-100" />
                    </button>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{q.quotation_date}</td>
                  <td className="py-3 px-4 text-slate-500">{q.valid_until_date}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-100">
                    {q.customer_name}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                    {formatIndianCurrency(q.grand_total)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        q.status === 'ACCEPTED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : q.status === 'CONVERTED'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                          : q.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {q.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setViewingQuotation(q);
                          setActivePrintTemplateId(q.letterhead_template_id || (templates[0]?.id || ''));
                        }}
                        className="p-1 text-slate-500 hover:text-brand-600"
                        title="View / Print Quotation"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      {q.status !== 'CONVERTED' && (
                        <button
                          type="button"
                          onClick={() => handleConvertToInvoice(q.id)}
                          className="inline-flex items-center space-x-1 px-2 py-0.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-[11px] font-bold shadow-sm"
                          title="Convert quotation to Sales Invoice"
                        >
                          <ArrowRightCircle className="w-3.5 h-3.5" />
                          <span>Convert</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteQuotation(q.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Delete Quotation"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* VIEW QUOTATION MODAL */}
      {viewingQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center space-x-3">
                <FileSpreadsheet className="w-5 h-5 text-brand-600" />
                <div>
                  <h2 className="font-extrabold text-base text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                    <span>Quotation: {viewingQuotation.quotation_number}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300">
                      {viewingQuotation.status}
                    </span>
                  </h2>
                  <div className="text-xs text-slate-500">
                    Issued: {viewingQuotation.quotation_date} | Valid Until: {viewingQuotation.valid_until_date}
                  </div>
                </div>
              </div>
              <button onClick={() => setViewingQuotation(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
              {/* Customer Information Box */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-4">
                <div>
                  <div className="font-semibold text-slate-400 uppercase text-[10px]">Client / Recipient</div>
                  <div className="font-bold text-sm text-slate-800 dark:text-slate-200 mt-0.5">{viewingQuotation.customer_name}</div>
                  {viewingQuotation.billing_address && (
                    <div className="text-slate-600 dark:text-slate-400 mt-1">{viewingQuotation.billing_address}</div>
                  )}
                  {viewingQuotation.customer_gstin && (
                    <div className="font-mono text-slate-500 mt-1">GSTIN: {viewingQuotation.customer_gstin}</div>
                  )}
                </div>

                <div>
                  <div className="font-semibold text-slate-400 uppercase text-[10px]">Tax & Place of Supply</div>
                  <div className="font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                    {viewingQuotation.place_of_supply_state} (State Code: {viewingQuotation.place_of_supply_code})
                  </div>
                  {viewingQuotation.notes && (
                    <div className="mt-2 text-slate-500 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                      <span className="font-semibold text-slate-600 dark:text-slate-400">Notes: </span>
                      {viewingQuotation.notes}
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Item Description</th>
                      <th className="py-2.5 px-2">HSN/SAC</th>
                      <th className="py-2.5 px-2 text-right">Qty</th>
                      <th className="py-2.5 px-2 text-right">Rate</th>
                      <th className="py-2.5 px-2 text-right">GST %</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {viewingQuotation.items?.map((it, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{it.item_name}</div>
                          {it.description && <div className="text-[10px] text-slate-400">{it.description}</div>}
                        </td>
                        <td className="py-2.5 px-2 font-mono text-slate-500">{it.hsn_or_sac || '-'}</td>
                        <td className="py-2.5 px-2 text-right font-medium">{it.quantity} {it.unit}</td>
                        <td className="py-2.5 px-2 text-right">{formatIndianCurrency(it.rate)}</td>
                        <td className="py-2.5 px-2 text-right">{it.gst_rate}%</td>
                        <td className="py-2.5 px-3 text-right font-bold">{formatIndianCurrency(it.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Breakdown */}
              <div className="flex justify-end">
                <div className="w-72 space-y-1.5 p-3.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Taxable Subtotal:</span>
                    <span>{formatIndianCurrency(viewingQuotation.total_taxable_value || viewingQuotation.subtotal)}</span>
                  </div>
                  {Number(viewingQuotation.total_cgst) > 0 && (
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>CGST:</span>
                      <span>{formatIndianCurrency(viewingQuotation.total_cgst)}</span>
                    </div>
                  )}
                  {Number(viewingQuotation.total_sgst) > 0 && (
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>SGST:</span>
                      <span>{formatIndianCurrency(viewingQuotation.total_sgst)}</span>
                    </div>
                  )}
                  {Number(viewingQuotation.total_igst) > 0 && (
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>IGST:</span>
                      <span>{formatIndianCurrency(viewingQuotation.total_igst)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-extrabold text-sm text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span>Grand Total:</span>
                    <span className="text-brand-600 dark:text-brand-400">{formatIndianCurrency(viewingQuotation.grand_total)}</span>
                  </div>
                  {viewingQuotation.amount_in_words && (
                    <div className="text-[10px] text-slate-500 italic pt-1">{viewingQuotation.amount_in_words}</div>
                  )}
                </div>
              </div>

              {/* Template Selection for Printing */}
              <div className="p-4 bg-brand-50/50 dark:bg-slate-900 rounded-xl border border-brand-100 dark:border-slate-700 space-y-2">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                  <Stamp className="w-4 h-4 text-brand-600" />
                  <span>Letterhead & Print Template Selection</span>
                </div>
                <div className="flex items-center space-x-3">
                  <select
                    value={activePrintTemplateId}
                    onChange={(e) => setActivePrintTemplateId(e.target.value)}
                    className="flex-1 border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 text-xs bg-white dark:bg-slate-700"
                  >
                    <option value="">Standard Default Template (No Letterhead)</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name} ({tpl.file_type} - {tpl.orientation})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => handlePrintPdf(viewingQuotation.id, 'DIGITAL_LETTERHEAD')}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Digital PDF Print</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrintPdf(viewingQuotation.id, 'PREPRINTED_STATIONERY')}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 dark:text-slate-200 rounded text-xs font-semibold"
                    title="Print overlay on physical pre-printed letterhead paper"
                  >
                    <span>Preprinted Paper Mode</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleDeleteQuotation(viewingQuotation.id)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-rose-300 text-rose-600 hover:bg-rose-50 rounded text-xs font-bold transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Quotation</span>
              </button>

              <div className="flex items-center space-x-2">
                {viewingQuotation.status !== 'CONVERTED' && (
                  <button
                    type="button"
                    onClick={() => handleConvertToInvoice(viewingQuotation.id)}
                    className="inline-flex items-center space-x-1 px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm"
                  >
                    <ArrowRightCircle className="w-4 h-4" />
                    <span>Convert to Invoice Draft</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setViewingQuotation(null)}
                  className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded text-xs font-semibold hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE QUOTATION MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-brand-600" />
                <span>Create Commercial Quotation</span>
              </h2>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Customer *</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  >
                    <option value="">-- Select Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.company_name ? `(${c.company_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Quote Date</label>
                  <input
                    type="date"
                    value={quoteDate}
                    onChange={(e) => setQuoteDate(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Valid Until Date</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
              </div>

              {/* Letterhead Template Selection for new quotation */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1">
                  <Stamp className="w-3.5 h-3.5 text-brand-600" />
                  <span>Letterhead / Print Template</span>
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                >
                  <option value="">Default Standard Template</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.file_type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="p-2">Select Catalog Item</th>
                      <th className="p-2">Custom Description</th>
                      <th className="p-2 w-20">Qty</th>
                      <th className="p-2 w-28">Rate (₹)</th>
                      <th className="p-2 w-24">GST Rate</th>
                      <th className="p-2 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2">
                          <select
                            onChange={(e) => handleProductSelect(idx, e.target.value)}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1"
                          >
                            <option value="">-- Manual / Catalog --</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({formatIndianCurrency(p.selling_price)})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            placeholder="Item name"
                            value={item.item_name}
                            onChange={(e) => {
                              const copy = [...items];
                              copy[idx].item_name = e.target.value;
                              setItems(copy);
                            }}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const copy = [...items];
                              copy[idx].quantity = e.target.value;
                              setItems(copy);
                            }}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={item.rate}
                            onChange={(e) => {
                              const copy = [...items];
                              copy[idx].rate = e.target.value;
                              setItems(copy);
                            }}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={item.gst_rate}
                            onChange={(e) => {
                              const copy = [...items];
                              copy[idx].gst_rate = e.target.value;
                              setItems(copy);
                            }}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1"
                          >
                            {GST_RATES.map((rate) => (
                              <option key={rate} value={rate}>
                                {rate}%
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center space-x-1 text-brand-600 font-bold hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Item Row</span>
              </button>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Quotation Notes & Scope of Work
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Payment within 30 days, delivery at site."
                  className="w-full border border-slate-300 dark:border-slate-600 rounded p-2"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateQuotation}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm"
              >
                Create Quotation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
