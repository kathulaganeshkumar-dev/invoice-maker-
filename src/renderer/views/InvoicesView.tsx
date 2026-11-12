// src/renderer/views/InvoicesView.tsx - Invoicing Engine, Template Selection, Document Viewer & Cancellation
import React, { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { Invoice, Customer, Product, DocumentType, LetterheadTemplate } from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency, calculateLineItem, calculateDocumentTotals } from '../../server/finance/decimalCalc';
import { GST_RATES } from '../../shared/constants';
import {
  Receipt,
  Plus,
  Search,
  Filter,
  CheckCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Printer,
  ChevronDown,
  X,
  FileText,
  Trash2,
  Eye,
  Stamp,
  ArrowRightCircle,
  CreditCard,
  BookmarkPlus,
} from 'lucide-react';

interface Props {
  companyId: string;
}

export const InvoicesView: React.FC<Props> = ({ companyId }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<LetterheadTemplate[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [cancelModalInvoice, setCancelModalInvoice] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  // Form State for New Invoice
  const [docType, setDocType] = useState<DocumentType>('TAX_INVOICE');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [invoicePaymentStatus, setInvoicePaymentStatus] = useState<'DRAFT' | 'UNPAID' | 'PAID'>('UNPAID');
  const [paymentMethod, setPaymentMethod] = useState<string>('BANK_TRANSFER');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [items, setItems] = useState<any[]>([
    {
      item_id: undefined,
      item_type: 'PRODUCT',
      item_name: '',
      description: '',
      hsn_or_sac: '',
      unit: 'NOS',
      quantity: '1',
      rate: '0.00',
      gst_rate: '18.00',
      is_tax_inclusive: false,
      is_custom: false,
    },
  ]);
  const [notes, setNotes] = useState<string>('');
  const [savingToCatalogIdx, setSavingToCatalogIdx] = useState<number | null>(null);

  // Mark-Paid modal state for existing invoices
  const [markPaidInvoice, setMarkPaidInvoice] = useState<Invoice | null>(null);
  const [markPaidMethod, setMarkPaidMethod] = useState<string>('BANK_TRANSFER');
  const [markPaidDate, setMarkPaidDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [markPaidRef, setMarkPaidRef] = useState<string>('');
  const [markPaidNotes, setMarkPaidNotes] = useState<string>('');

  // Selected print template in the viewing modal
  const [activePrintTemplateId, setActivePrintTemplateId] = useState<string>('');

  useEffect(() => {
    if (companyId) {
      loadInvoices();
      loadMasterData();
    }
  }, [companyId, filterStatus]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (filterStatus === 'PAID' || filterStatus === 'UNPAID' || filterStatus === 'FINALIZED') {
        filters.status = 'FINALIZED';
      } else if (filterStatus === 'DRAFT') {
        filters.status = 'DRAFT';
      }

      const data = await api.getInvoices(companyId, filters);
      setInvoices(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMasterData = async () => {
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

  const handleAddItem = (isCustom = false) => {
    setItems([
      ...items,
      {
        item_id: undefined,
        item_type: isCustom ? 'SERVICE' : 'PRODUCT',
        item_name: '',
        description: '',
        hsn_or_sac: '',
        unit: 'NOS',
        quantity: '1',
        rate: '0.00',
        gst_rate: '18.00',
        is_tax_inclusive: false,
        is_custom: isCustom,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleProductSelect = (index: number, productId: string) => {
    const newItems = [...items];
    if (!productId) {
      newItems[index] = {
        ...newItems[index],
        item_id: undefined,
        is_custom: true,
      };
      setItems(newItems);
      return;
    }

    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    newItems[index] = {
      ...newItems[index],
      item_id: prod.id,
      item_type: prod.item_type,
      item_name: prod.name,
      hsn_or_sac: prod.hsn_or_sac,
      rate: prod.selling_price,
      gst_rate: prod.gst_rate,
      is_tax_inclusive: prod.is_tax_inclusive,
      unit: prod.unit,
      is_custom: false,
    };
    setItems(newItems);
  };

  const handleSaveCustomItemToCatalog = async (index: number) => {
    const row = items[index];
    if (!row.item_name || !row.item_name.trim()) {
      alert('Please enter an item name before saving to catalog.');
      return;
    }
    setSavingToCatalogIdx(index);
    try {
      const created = await api.createProduct(companyId, {
        item_type: row.item_type || 'PRODUCT',
        name: row.item_name.trim(),
        hsn_or_sac: row.hsn_or_sac || '',
        unit: row.unit || 'NOS',
        selling_price: String(row.rate || '0.00'),
        purchase_price: '0.00',
        gst_rate: String(row.gst_rate || '18.00'),
        is_tax_inclusive: Boolean(row.is_tax_inclusive),
        current_stock: '0.00',
        is_active: true,
      });
      setProducts((prev) => [...prev, created]);
      const copy = [...items];
      copy[index] = {
        ...copy[index],
        item_id: created.id,
        is_custom: false,
      };
      setItems(copy);
      alert(`Saved "${created.name}" to Products & Services catalog!`);
    } catch (err: any) {
      alert(err.message || 'Could not save item to catalog');
    } finally {
      setSavingToCatalogIdx(null);
    }
  };

  const handleCreateInvoice = async () => {
    const cust = customers.find((c) => c.id === selectedCustomerId);
    if (!cust) {
      alert('Please select a customer');
      return;
    }
    const validItems = items.filter((it) => it.item_name && it.item_name.trim() !== '');
    if (validItems.length === 0) {
      alert('Please enter at least one catalog or custom item with a description.');
      return;
    }

    try {
      await api.createInvoice(companyId, {
        document_type: docType,
        customer_id: cust.id,
        customer_name: cust.name,
        customer_gstin: cust.gstin,
        customer_pan: cust.pan,
        billing_address: cust.billing_address,
        place_of_supply_state: cust.state,
        place_of_supply_code: cust.state_code,
        invoice_date: invoiceDate,
        due_date: dueDate,
        letterhead_template_id: selectedTemplateId || undefined,
        finalize_on_create: invoicePaymentStatus === 'UNPAID' || invoicePaymentStatus === 'PAID',
        mark_as_paid: invoicePaymentStatus === 'PAID',
        payment_method: invoicePaymentStatus === 'PAID' ? paymentMethod : undefined,
        payment_date: invoicePaymentStatus === 'PAID' ? paymentDate || invoiceDate : undefined,
        payment_reference: invoicePaymentStatus === 'PAID' ? paymentReference : undefined,
        items: validItems.map((it) => ({
          item_id: it.item_id || undefined,
          item_type: it.item_type || 'PRODUCT',
          item_name: it.item_name.trim(),
          description: it.description || '',
          hsn_or_sac: it.hsn_or_sac || '',
          unit: it.unit || 'NOS',
          quantity: it.quantity || '1',
          rate: it.rate || '0.00',
          gst_rate: it.gst_rate || '18.00',
          is_tax_inclusive: Boolean(it.is_tax_inclusive),
        })),
        notes,
      });

      setIsCreateModalOpen(false);
      resetForm();
      await loadInvoices();
    } catch (err: any) {
      alert(err.message || 'Error creating invoice');
    }
  };

  const handleOpenMarkPaid = (inv: Invoice) => {
    setMarkPaidInvoice(inv);
    setMarkPaidMethod('BANK_TRANSFER');
    setMarkPaidDate(new Date().toISOString().split('T')[0]);
    setMarkPaidRef(inv.invoice_number || '');
    setMarkPaidNotes(`Full payment received for ${inv.invoice_number}`);
  };

  const handleConfirmMarkPaid = async () => {
    if (!markPaidInvoice) return;
    try {
      const updated = await api.markInvoiceAsPaid(companyId, markPaidInvoice.id, {
        payment_method: markPaidMethod,
        payment_date: markPaidDate,
        reference_number: markPaidRef,
        notes: markPaidNotes,
      });
      if (viewingInvoice?.id === markPaidInvoice.id) {
        setViewingInvoice(updated);
      }
      setMarkPaidInvoice(null);
      await loadInvoices();
    } catch (err: any) {
      alert(err.message || 'Error marking invoice as paid');
    }
  };

  const handleFinalize = async (invoiceId: string) => {
    if (!window.confirm('Finalize this invoice? An official sequential document number will be assigned and inventory will be deducted.')) {
      return;
    }
    try {
      const fin = await api.finalizeInvoice(companyId, invoiceId);
      if (viewingInvoice?.id === invoiceId) setViewingInvoice(fin);
      await loadInvoices();
      alert(`Invoice finalized as ${fin.invoice_number}!`);
    } catch (err: any) {
      alert(err.message || 'Error finalizing invoice');
    }
  };

  const handleCancelSubmit = async () => {
    if (!cancelModalInvoice) return;
    if (!cancelReason.trim()) {
      alert('Mandatory cancellation reason required.');
      return;
    }

    try {
      const canc = await api.cancelInvoice(companyId, cancelModalInvoice.id, cancelReason);
      if (viewingInvoice?.id === cancelModalInvoice.id) setViewingInvoice(canc);
      setCancelModalInvoice(null);
      setCancelReason('');
      await loadInvoices();
      alert('Invoice cancelled and reverse ledger recorded.');
    } catch (err: any) {
      alert(err.message || 'Error cancelling invoice');
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this invoice? This cannot be undone.')) {
      return;
    }
    try {
      await api.deleteInvoice(companyId, invoiceId);
      if (viewingInvoice?.id === invoiceId) setViewingInvoice(null);
      await loadInvoices();
      alert('Invoice deleted successfully.');
    } catch (err: any) {
      alert(err.message || 'Error deleting invoice');
    }
  };

  const handlePrintPdf = (invoiceId: string, mode: 'DIGITAL_LETTERHEAD' | 'PREPRINTED_STATIONERY' = 'DIGITAL_LETTERHEAD') => {
    const templateId = activePrintTemplateId || selectedTemplateId;
    const url = api.getInvoicePdfUrl(companyId, invoiceId, mode, templateId);
    window.open(url, '_blank');
  };

  const resetForm = () => {
    setSelectedCustomerId('');
    setInvoicePaymentStatus('UNPAID');
    setPaymentMethod('BANK_TRANSFER');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentReference('');
    setItems([
      {
        item_id: undefined,
        item_type: 'PRODUCT',
        item_name: '',
        description: '',
        hsn_or_sac: '',
        unit: 'NOS',
        quantity: '1',
        rate: '0.00',
        gst_rate: '18.00',
        is_tax_inclusive: false,
        is_custom: false,
      },
    ]);
    setNotes('');
  };

  // Compute live preview totals for Create Invoice modal using Decimal precision
  const previewCalculatedLines = items.map((it) =>
    calculateLineItem({
      quantity: it.quantity || 0,
      rate: it.rate || 0,
      gstRate: it.gst_rate || 0,
      isTaxInclusive: Boolean(it.is_tax_inclusive),
      isInterState: false,
    })
  );
  const previewDocTotals = calculateDocumentTotals({ items: previewCalculatedLines });

  const filteredInvoices = invoices.filter((inv) => {
    if (filterStatus === 'PAID') {
      const isPaid = inv.status === 'FINALIZED' && new Decimal(inv.balance_amount || 0).lte(0);
      if (!isPaid) return false;
    }
    if (filterStatus === 'UNPAID') {
      const isUnpaid = inv.status === 'FINALIZED' && new Decimal(inv.balance_amount || 0).gt(0);
      if (!isUnpaid) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.customer_name.toLowerCase().includes(q) ||
        (inv.customer_gstin && inv.customer_gstin.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="p-6 space-y-5 overflow-y-auto">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
            <Receipt className="w-5 h-5 text-brand-600" />
            <span>Sales & Tax Invoices</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Generate GST-compliant tax invoices, select letterhead templates, review draft states, finalize numbers, and manage cancellations.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Invoice</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center space-x-2">
          {['ALL', 'FINALIZED', 'PAID', 'UNPAID', 'DRAFT'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                filterStatus === st
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL' ? 'All Invoices' : st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search invoice #, customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Invoices Data Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Invoice # (Click to View)</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4 text-right">Grand Total</th>
              <th className="py-3 px-4 text-right">Paid</th>
              <th className="py-3 px-4 text-right">Balance</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400">
                  No invoices found. Click "+ New Invoice" to create one.
                </td>
              </tr>
            ) : (
              filteredInvoices.map((inv) => {
                const isPaid = Number(inv.balance_amount) <= 0;
                return (
                  <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setViewingInvoice(inv);
                          setActivePrintTemplateId(inv.letterhead_template_id || (templates[0]?.id || ''));
                        }}
                        className="text-brand-600 dark:text-brand-400 hover:underline cursor-pointer flex items-center space-x-1"
                        title="Click to view full invoice details"
                      >
                        <span>{inv.invoice_number}</span>
                        <Eye className="w-3.5 h-3.5 text-slate-400 opacity-60 hover:opacity-100" />
                      </button>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-medium text-[10px]">
                      {inv.document_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{inv.invoice_date}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-100">
                      {inv.customer_name}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                      {formatIndianCurrency(inv.grand_total)}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-600 font-semibold">
                      {formatIndianCurrency(inv.paid_amount)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-rose-600">
                      {formatIndianCurrency(inv.balance_amount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.status === 'FINALIZED'
                            ? isPaid
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : inv.status === 'CANCELLED'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {inv.status === 'FINALIZED' ? (isPaid ? 'PAID' : 'UNPAID') : inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        {inv.status === 'DRAFT' && (
                          <button
                            type="button"
                            onClick={() => handleFinalize(inv.id)}
                            className="px-2 py-0.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-[11px] font-bold"
                            title="Finalize Invoice"
                          >
                            Finalize
                          </button>
                        )}

                        {inv.status !== 'CANCELLED' && Number(inv.balance_amount) > 0 && (
                          <button
                            type="button"
                            onClick={() => handleOpenMarkPaid(inv)}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shadow-sm"
                            title="Mark this invoice as Paid & record payment receipt"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Mark Paid</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setViewingInvoice(inv);
                            setActivePrintTemplateId(inv.letterhead_template_id || (templates[0]?.id || ''));
                          }}
                          className="p-1 text-slate-500 hover:text-brand-600"
                          title="View / Print Invoice"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        {inv.status === 'FINALIZED' && (
                          <button
                            type="button"
                            onClick={() => setCancelModalInvoice(inv)}
                            className="p-1 text-slate-400 hover:text-rose-600"
                            title="Cancel Invoice"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}

                        {(inv.status === 'CANCELLED' || inv.status === 'DRAFT') && (
                          <button
                            type="button"
                            onClick={() => handleDeleteInvoice(inv.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title={inv.status === 'CANCELLED' ? 'Delete Cancelled Invoice' : 'Delete Draft Invoice'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* VIEW INVOICE MODAL */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center space-x-3">
                <Receipt className="w-5 h-5 text-brand-600" />
                <div>
                  <h2 className="font-extrabold text-base text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                    <span>{viewingInvoice.document_type.replace(/_/g, ' ')}: {viewingInvoice.invoice_number}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300">
                      {viewingInvoice.status === 'FINALIZED'
                        ? Number(viewingInvoice.balance_amount) <= 0
                          ? 'PAID'
                          : 'UNPAID'
                        : viewingInvoice.status}
                    </span>
                  </h2>
                  <div className="text-xs text-slate-500">
                    Date: {viewingInvoice.invoice_date} | Due Date: {viewingInvoice.due_date}
                  </div>
                </div>
              </div>
              <button onClick={() => setViewingInvoice(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
              {/* Customer Box */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-4">
                <div>
                  <div className="font-semibold text-slate-400 uppercase text-[10px]">Billed To</div>
                  <div className="font-bold text-sm text-slate-800 dark:text-slate-200 mt-0.5">{viewingInvoice.customer_name}</div>
                  {viewingInvoice.billing_address && (
                    <div className="text-slate-600 dark:text-slate-400 mt-1">{viewingInvoice.billing_address}</div>
                  )}
                  {viewingInvoice.customer_gstin && (
                    <div className="font-mono text-slate-500 mt-1">GSTIN: {viewingInvoice.customer_gstin}</div>
                  )}
                </div>

                <div>
                  <div className="font-semibold text-slate-400 uppercase text-[10px]">Supply & Payment Info</div>
                  <div className="font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                    Place of Supply: {viewingInvoice.place_of_supply_state} ({viewingInvoice.place_of_supply_code})
                  </div>
                  <div className="mt-2 text-slate-600 dark:text-slate-400">
                    <div>Balance Due: <span className="font-bold text-rose-600">{formatIndianCurrency(viewingInvoice.balance_amount)}</span></div>
                    <div>Paid to Date: <span className="font-bold text-emerald-600">{formatIndianCurrency(viewingInvoice.paid_amount)}</span></div>
                  </div>
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
                    {viewingInvoice.items?.map((it, idx) => (
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
                    <span>{formatIndianCurrency(viewingInvoice.total_taxable_value || viewingInvoice.subtotal)}</span>
                  </div>
                  {Number(viewingInvoice.total_cgst) > 0 && (
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>CGST:</span>
                      <span>{formatIndianCurrency(viewingInvoice.total_cgst)}</span>
                    </div>
                  )}
                  {Number(viewingInvoice.total_sgst) > 0 && (
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>SGST:</span>
                      <span>{formatIndianCurrency(viewingInvoice.total_sgst)}</span>
                    </div>
                  )}
                  {Number(viewingInvoice.total_igst) > 0 && (
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>IGST:</span>
                      <span>{formatIndianCurrency(viewingInvoice.total_igst)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-extrabold text-sm text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span>Grand Total:</span>
                    <span className="text-brand-600 dark:text-brand-400">{formatIndianCurrency(viewingInvoice.grand_total)}</span>
                  </div>
                  {viewingInvoice.amount_in_words && (
                    <div className="text-[10px] text-slate-500 italic pt-1">{viewingInvoice.amount_in_words}</div>
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
                    onClick={() => handlePrintPdf(viewingInvoice.id, 'DIGITAL_LETTERHEAD')}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Digital PDF Print</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrintPdf(viewingInvoice.id, 'PREPRINTED_STATIONERY')}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 dark:text-slate-200 rounded text-xs font-semibold"
                    title="Print dynamic content on pre-printed physical paper"
                  >
                    <span>Preprinted Paper Mode</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div>
                {(viewingInvoice.status === 'CANCELLED' || viewingInvoice.status === 'DRAFT') && (
                  <button
                    type="button"
                    onClick={() => handleDeleteInvoice(viewingInvoice.id)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-rose-300 text-rose-600 hover:bg-rose-50 rounded text-xs font-bold transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{viewingInvoice.status === 'CANCELLED' ? 'Delete Cancelled Invoice' : 'Delete Draft'}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {viewingInvoice.status === 'DRAFT' && (
                  <button
                    type="button"
                    onClick={() => handleFinalize(viewingInvoice.id)}
                    className="inline-flex items-center space-x-1 px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm"
                  >
                    <span>Finalize & Issue</span>
                  </button>
                )}

                {viewingInvoice.status !== 'CANCELLED' && Number(viewingInvoice.balance_amount) > 0 && (
                  <button
                    type="button"
                    onClick={() => handleOpenMarkPaid(viewingInvoice)}
                    className="inline-flex items-center space-x-1 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Mark as Paid</span>
                  </button>
                )}

                {viewingInvoice.status === 'FINALIZED' && (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelModalInvoice(viewingInvoice);
                      setViewingInvoice(null);
                    }}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 border border-rose-300 text-rose-600 hover:bg-rose-50 rounded text-xs font-semibold"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Cancel Invoice</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setViewingInvoice(null)}
                  className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded text-xs font-semibold hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Invoice Creation Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <Receipt className="w-4 h-4 text-brand-600" />
                <span>Create Sales Document</span>
              </h2>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Document Type *</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as any)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 font-medium"
                  >
                    <option value="TAX_INVOICE">GST Tax Invoice</option>
                    <option value="STANDARD_INVOICE">Standard Invoice</option>
                    <option value="BILL_OF_SUPPLY">Bill of Supply</option>
                    <option value="PROFORMA_INVOICE">Proforma Invoice</option>
                    <option value="SERVICE_INVOICE">Service Invoice</option>
                    <option value="COMMERCIAL_INVOICE">Commercial Invoice</option>
                    <option value="DELIVERY_CHALLAN">Delivery Challan</option>
                    <option value="CREDIT_NOTE">Credit Note</option>
                    <option value="DEBIT_NOTE">Debit Note</option>
                  </select>
                </div>

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
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Letterhead Template Selector */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1">
                    <Stamp className="w-3.5 h-3.5 text-brand-600" />
                    <span>Default Letterhead / Print Template</span>
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

                {/* Payment Status Selection on Create */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Invoice Status & Payment Collection</span>
                  </label>
                  <select
                    value={invoicePaymentStatus}
                    onChange={(e) => setInvoicePaymentStatus(e.target.value as any)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 font-semibold"
                  >
                    <option value="UNPAID">Finalize (Unpaid / Credit Invoice)</option>
                    <option value="PAID">Paid (Finalize & Record Full Payment Now)</option>
                    <option value="DRAFT">Save as Draft (Edit Later)</option>
                  </select>
                </div>
              </div>

              {/* Payment Receipt Fields if Paid is selected */}
              {invoicePaymentStatus === 'PAID' && (
                <div className="grid grid-cols-3 gap-4 p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                  <div>
                    <label className="block font-semibold text-emerald-900 dark:text-emerald-200 mb-1">Payment Mode</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full border border-emerald-300 dark:border-emerald-700 rounded px-2.5 py-1.5 bg-white dark:bg-slate-800"
                    >
                      <option value="BANK_TRANSFER">Bank Transfer (NEFT / RTGS / IMPS)</option>
                      <option value="UPI">UPI</option>
                      <option value="CASH">Cash</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="CARD">Card</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-emerald-900 dark:text-emerald-200 mb-1">Payment Date</label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full border border-emerald-300 dark:border-emerald-700 rounded px-2.5 py-1.5 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-emerald-900 dark:text-emerald-200 mb-1">Reference / UTR #</label>
                    <input
                      type="text"
                      placeholder="Optional UTR / Cheque No."
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      className="w-full border border-emerald-300 dark:border-emerald-700 rounded px-2.5 py-1.5 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Line Items Table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="p-2 w-44">Catalog / Custom Mode</th>
                      <th className="p-2">Item Name, HSN & Unit</th>
                      <th className="p-2 w-20">Qty</th>
                      <th className="p-2 w-24">Rate (₹)</th>
                      <th className="p-2 w-24">GST %</th>
                      <th className="p-2 w-24 text-right">Total (₹)</th>
                      <th className="p-2 w-16 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((item, idx) => {
                      const lineCalc = previewCalculatedLines[idx];
                      const isCustomRow = !item.item_id;
                      return (
                        <tr key={idx} className={isCustomRow ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''}>
                          <td className="p-2 align-top">
                            <select
                              value={item.item_id || ''}
                              onChange={(e) => handleProductSelect(idx, e.target.value)}
                              className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700"
                            >
                              <option value="">-- Custom / Non-Catalog Item --</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({formatIndianCurrency(p.selling_price)})
                                </option>
                              ))}
                            </select>
                            {isCustomRow && (
                              <div className="mt-1 flex items-center space-x-1.5">
                                <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 rounded font-bold">
                                  Custom Item
                                </span>
                                <select
                                  value={item.item_type || 'PRODUCT'}
                                  onChange={(e) => {
                                    const copy = [...items];
                                    copy[idx].item_type = e.target.value;
                                    setItems(copy);
                                  }}
                                  className="text-[10px] border border-slate-200 dark:border-slate-600 rounded px-1 py-0.5 bg-white dark:bg-slate-700"
                                >
                                  <option value="PRODUCT">Product</option>
                                  <option value="SERVICE">Service</option>
                                </select>
                              </div>
                            )}
                          </td>
                          <td className="p-2 align-top space-y-1">
                            <input
                              type="text"
                              placeholder="Enter product/service name or specification *"
                              value={item.item_name}
                              onChange={(e) => {
                                const copy = [...items];
                                copy[idx].item_name = e.target.value;
                                setItems(copy);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 font-medium"
                            />
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                placeholder="HSN/SAC"
                                value={item.hsn_or_sac || ''}
                                onChange={(e) => {
                                  const copy = [...items];
                                  copy[idx].hsn_or_sac = e.target.value;
                                  setItems(copy);
                                }}
                                className="w-24 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 text-[11px] font-mono"
                              />
                              <input
                                type="text"
                                placeholder="Unit (NOS)"
                                value={item.unit || 'NOS'}
                                onChange={(e) => {
                                  const copy = [...items];
                                  copy[idx].unit = e.target.value;
                                  setItems(copy);
                                }}
                                className="w-20 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 text-[11px] uppercase"
                              />
                              <label className="inline-flex items-center space-x-1 text-[10px] text-slate-500 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(item.is_tax_inclusive)}
                                  onChange={(e) => {
                                    const copy = [...items];
                                    copy[idx].is_tax_inclusive = e.target.checked;
                                    setItems(copy);
                                  }}
                                />
                                <span>Incl. GST</span>
                              </label>
                            </div>
                          </td>
                          <td className="p-2 align-top">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={item.quantity}
                              onChange={(e) => {
                                const copy = [...items];
                                copy[idx].quantity = e.target.value;
                                setItems(copy);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-right"
                            />
                          </td>
                          <td className="p-2 align-top">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={item.rate}
                              onChange={(e) => {
                                const copy = [...items];
                                copy[idx].rate = e.target.value;
                                setItems(copy);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-right"
                            />
                          </td>
                          <td className="p-2 align-top">
                            <select
                              value={item.gst_rate}
                              onChange={(e) => {
                                const copy = [...items];
                                copy[idx].gst_rate = e.target.value;
                                setItems(copy);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700"
                            >
                              {GST_RATES.map((rate) => (
                                <option key={rate} value={rate}>{rate}%</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 align-top text-right font-mono font-bold text-slate-800 dark:text-slate-100">
                            {formatIndianCurrency(lineCalc.lineTotal)}
                          </td>
                          <td className="p-2 align-top text-center">
                            <div className="flex items-center justify-center space-x-1">
                              {isCustomRow && item.item_name?.trim() && (
                                <button
                                  type="button"
                                  disabled={savingToCatalogIdx === idx}
                                  onClick={() => handleSaveCustomItemToCatalog(idx)}
                                  className="text-brand-600 hover:text-brand-800 p-0.5"
                                  title="Save this custom item into Products Catalog for future reuse"
                                >
                                  <BookmarkPlus className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="text-slate-400 hover:text-rose-600 p-0.5"
                                title="Remove Row"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-4">
                  <button
                    type="button"
                    onClick={() => handleAddItem(false)}
                    className="inline-flex items-center space-x-1 text-brand-600 font-bold hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Catalog Item Row</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddItem(true)}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-md font-bold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Custom / Non-Catalog Item</span>
                  </button>
                </div>

                <div className="flex items-center space-x-4 text-xs bg-slate-50 dark:bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500">Taxable: <strong className="text-slate-800 dark:text-slate-200">{formatIndianCurrency(previewDocTotals.totalTaxableValue)}</strong></span>
                  <span className="text-slate-500">Tax: <strong className="text-slate-800 dark:text-slate-200">{formatIndianCurrency(previewDocTotals.totalTax)}</strong></span>
                  <span className="text-slate-500">Grand Total: <strong className="text-brand-600 text-sm">{formatIndianCurrency(previewDocTotals.grandTotal)}</strong></span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Invoice Notes & Terms
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Subject to local jurisdiction. Payment due within specified period."
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
                onClick={handleCreateInvoice}
                className={`px-4 py-1.5 rounded-lg font-bold text-xs shadow-sm text-white ${
                  invoicePaymentStatus === 'PAID'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-brand-600 hover:bg-brand-700'
                }`}
              >
                {invoicePaymentStatus === 'PAID'
                  ? 'Finalize & Mark as Paid'
                  : invoicePaymentStatus === 'UNPAID'
                  ? 'Finalize Unpaid Invoice'
                  : 'Save as Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Invoice as Paid Modal */}
      {markPaidInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
              <h3 className="font-bold text-sm text-emerald-700 dark:text-emerald-400 flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5" />
                <span>Mark Invoice Paid ({markPaidInvoice.invoice_number})</span>
              </h3>
              <button onClick={() => setMarkPaidInvoice(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800 flex justify-between items-center">
              <span className="text-emerald-900 dark:text-emerald-200 font-semibold">Amount Being Settled:</span>
              <span className="font-extrabold text-base text-emerald-700 dark:text-emerald-300">
                {formatIndianCurrency(markPaidInvoice.balance_amount)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Payment Mode</label>
                <select
                  value={markPaidMethod}
                  onChange={(e) => setMarkPaidMethod(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                >
                  <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS/IMPS)</option>
                  <option value="UPI">UPI</option>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CARD">Card</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={markPaidDate}
                  onChange={(e) => setMarkPaidDate(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Reference / UTR / Cheque #</label>
              <input
                type="text"
                value={markPaidRef}
                onChange={(e) => setMarkPaidRef(e.target.value)}
                placeholder="Transaction reference number"
                className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Payment Notes</label>
              <input
                type="text"
                value={markPaidNotes}
                onChange={(e) => setMarkPaidNotes(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setMarkPaidInvoice(null)}
                className="px-3.5 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMarkPaid}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-sm"
              >
                Confirm Payment & Mark Paid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Reason Modal */}
      {cancelModalInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2 text-rose-600">
              <AlertCircle className="w-5 h-5" />
              <span>Cancel Invoice {cancelModalInvoice.invoice_number}</span>
            </h3>
            <p className="text-xs text-slate-500">
              Cancelling a finalized invoice will formally record a cancellation audit trail, reverse the customer balance, and return stock to inventory. Mandatory reason required:
            </p>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Order cancelled by client; incorrect item billing"
              className="w-full border border-slate-300 dark:border-slate-600 rounded p-2 text-xs"
            />
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setCancelModalInvoice(null);
                  setCancelReason('');
                }}
                className="px-3 py-1.5 border border-slate-300 text-slate-700 dark:text-slate-300 rounded text-xs"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleCancelSubmit}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
