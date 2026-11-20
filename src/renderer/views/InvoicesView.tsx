// src/renderer/views/InvoicesView.tsx - Invoicing Engine, Template Selection, Document Viewer & Cancellation
import React, { useState, useEffect, useMemo } from 'react';
import Decimal from 'decimal.js';
import { Invoice, Customer, Product, DocumentType, LetterheadTemplate } from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency, calculateLineItem, calculateDocumentTotals } from '../../server/finance/decimalCalc';
import { GST_RATES } from '../../shared/constants';
import { SearchableSelect } from '../components/SearchableSelect';
import { ModalPortal } from '../components/ModalPortal';
import { QuickAddCustomerModal } from '../components/QuickAddCustomerModal';
import { DateInput, isoToDisplayDate } from '../components/DateInput';
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
  CheckCheck,
  Lock,
  StickyNote,
  Users,
  Shield,
} from 'lucide-react';

const SALES_DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'TAX_INVOICE', label: 'GST Tax Invoice' },
  { value: 'SERVICE_INVOICE', label: 'Service Invoice' },
];

function addDaysIso(dateStr: string, days: number): string {
  const part = (dateStr || '').split('T')[0];
  const [y, m, d] = part.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getInvoiceDaysRemaining(inv: Invoice, fallbackTermsDays = 0): { daysLeft: number; dueDateStr: string } | null {
  const invPart = (inv.invoice_date || '').split('T')[0];
  const duePart = (inv.due_date || '').split('T')[0];
  let effectiveDue = duePart;
  if ((!duePart || duePart <= invPart) && invPart && fallbackTermsDays > 0) {
    effectiveDue = addDaysIso(invPart, fallbackTermsDays);
  }
  if (!effectiveDue) return null;
  const [y, m, d] = effectiveDue.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dueDt = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((dueDt.getTime() - today.getTime()) / 86400000);
  return { daysLeft, dueDateStr: effectiveDue };
}

const OTHER_DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'STANDARD_INVOICE', label: 'Standard Invoice' },
  { value: 'BILL_OF_SUPPLY', label: 'Bill of Supply' },
  { value: 'PROFORMA_INVOICE', label: 'Proforma Invoice' },
  { value: 'COMMERCIAL_INVOICE', label: 'Commercial Invoice' },
  { value: 'DELIVERY_CHALLAN', label: 'Delivery Challan' },
  { value: 'CREDIT_NOTE', label: 'Credit Note' },
  { value: 'DEBIT_NOTE', label: 'Debit Note' },
];

const SALES_DOC_TYPE_SET = new Set<string>(SALES_DOC_TYPES.map((t) => t.value));

interface Props {
  companyId: string;
  mode?: 'sales' | 'other';
  modalOnly?: boolean;
  onCloseModal?: () => void;
}

export const InvoicesView: React.FC<Props> = ({ companyId, mode = 'sales', modalOnly = false, onCloseModal }) => {
  const isOtherMode = mode === 'other';
  const allowedDocTypes = isOtherMode ? OTHER_DOC_TYPES : SALES_DOC_TYPES;
  const defaultDocType: DocumentType = isOtherMode ? 'STANDARD_INVOICE' : 'TAX_INVOICE';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<LetterheadTemplate[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterAuthor, setFilterAuthor] = useState<'ALL' | 'STAFF' | 'HOST'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(!modalOnly);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(Boolean(modalOnly));

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    if (modalOnly && onCloseModal) {
      onCloseModal();
    }
  };
  const [cancelModalInvoice, setCancelModalInvoice] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  // Form State for New Invoice
  const [docType, setDocType] = useState<DocumentType>(defaultDocType);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [invoicePaymentStatus, setInvoicePaymentStatus] = useState<'DRAFT' | 'UNPAID' | 'PARTIAL' | 'PAID'>('UNPAID');
  const [invoicePartialAmount, setInvoicePartialAmount] = useState<string>('');
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
      quantity: '',
      rate: '',
      gst_rate: '18.00',
      is_tax_inclusive: false,
      is_custom: false,
    },
  ]);
  const [notes, setNotes] = useState<string>('');
  const [companyDefaultTerms, setCompanyDefaultTerms] = useState<string>('');
  const [savingToCatalogIdx, setSavingToCatalogIdx] = useState<number | null>(null);

  // Mark-Paid modal state for existing invoices
  const [markPaidInvoice, setMarkPaidInvoice] = useState<Invoice | null>(null);
  const [markPaidType, setMarkPaidType] = useState<'FULL' | 'PARTIAL' | 'CLOSE'>('FULL');
  const [markPaidAmount, setMarkPaidAmount] = useState<string>('');
  const [closeRemainingOnPartial, setCloseRemainingOnPartial] = useState<boolean>(false);
  const [closeReason, setCloseReason] = useState<string>('');
  const [markPaidMethod, setMarkPaidMethod] = useState<string>('BANK_TRANSFER');
  const [markPaidDate, setMarkPaidDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [markPaidRef, setMarkPaidRef] = useState<string>('');
  const [markPaidNotes, setMarkPaidNotes] = useState<string>('');

  // Selected print template in the viewing modal
  const [activePrintTemplateId, setActivePrintTemplateId] = useState<string>('');
  const [isQuickAddCustomerOpen, setIsQuickAddCustomerOpen] = useState<boolean>(false);

  const customerOptions = useMemo(() => {
    return [
      { value: '', label: '-- Select Customer --' },
      {
        value: '__ADD_NEW_CUSTOMER__',
        label: '+ Add New Customer...',
        badge: 'New',
        isAction: true,
      },
      ...customers.map((c) => ({
        value: c.id,
        label: c.name,
        sublabel: c.company_name ? c.company_name : undefined,
        code: c.gstin || undefined,
      })),
    ];
  }, [customers]);

  const templateOptions = useMemo(() => {
    return templates.map((tpl) => ({
      value: tpl.id,
      label: tpl.id.startsWith('builtin-') ? `${tpl.name} (Built-in)` : tpl.name,
      sublabel: `${tpl.file_type} - ${tpl.orientation || 'Portrait'}`,
    }));
  }, [templates]);

  const printTemplateOptions = useMemo(() => {
    return templates.map((tpl) => ({
      value: tpl.id,
      label: tpl.id.startsWith('builtin-') ? `${tpl.name} (Built-in)` : tpl.name,
      sublabel: `${tpl.file_type} - ${tpl.orientation || 'Portrait'}`,
    }));
  }, [templates]);

  const catalogItemOptions = useMemo(() => {
    return products.map((p) => {
      const rangeParts: string[] = [];
      if (p.min_selling_price) rangeParts.push(`Min ${formatIndianCurrency(p.min_selling_price)}`);
      if (p.max_selling_price) rangeParts.push(`Max ${formatIndianCurrency(p.max_selling_price)}`);
      const priceLabel =
        rangeParts.length > 0
          ? `${formatIndianCurrency(p.selling_price)} (${rangeParts.join(' – ')})`
          : formatIndianCurrency(p.selling_price);
      return {
        value: p.id,
        label: p.name,
        sublabel: priceLabel,
        badge: Number(p.current_stock) <= 0 ? 'Out of Stock' : `Stock: ${p.current_stock}`,
        code: p.sku || p.hsn_or_sac || undefined,
      };
    });
  }, [products]);

  useEffect(() => {
    setDocType(defaultDocType);
  }, [defaultDocType]);

  useEffect(() => {
    if (companyId) {
      if (!modalOnly) {
        loadInvoices();
      }
      loadMasterData();
    }
  }, [companyId, filterStatus, modalOnly]);

  const loadInvoicesSilently = async () => {
    try {
      const filters: any = {};
      if (
        filterStatus === 'PAID' ||
        filterStatus === 'PARTIAL PAY' ||
        filterStatus === 'UNPAID' ||
        filterStatus === 'FINALIZED'
      ) {
        filters.status = 'FINALIZED';
      } else if (filterStatus === 'DRAFT') {
        filters.status = 'DRAFT';
      }
      const data = await api.getInvoices(companyId, filters);
      setInvoices(data);
    } catch {
      // ignore silent polling errors
    }
  };

  useEffect(() => {
    if (modalOnly || !companyId) return;
    const onDataChanged = () => {
      loadInvoicesSilently();
      loadMasterData();
    };

    // Live silent auto-sync every 3.5 seconds so newly created invoices from staff show up automatically!
    const syncTimer = setInterval(() => {
      loadInvoicesSilently();
    }, 3500);

    window.addEventListener('eim-data-changed', onDataChanged);
    window.addEventListener('eim-data-sync', onDataChanged);
    window.addEventListener('focus', onDataChanged);

    return () => {
      clearInterval(syncTimer);
      window.removeEventListener('eim-data-changed', onDataChanged);
      window.removeEventListener('eim-data-sync', onDataChanged);
      window.removeEventListener('focus', onDataChanged);
    };
  }, [companyId, filterStatus, modalOnly]);

  // Automatically calculate Due Date from Invoice Date + Customer's Payment Reminder Days
  useEffect(() => {
    const cust = customers.find((c) => c.id === selectedCustomerId);
    const terms = cust?.payment_terms_days || 0;
    if (invoiceDate && selectedCustomerId) {
      setDueDate(terms > 0 ? addDaysIso(invoiceDate, terms) : invoiceDate);
    }
  }, [selectedCustomerId, invoiceDate, customers]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (
        filterStatus === 'PAID' ||
        filterStatus === 'PARTIAL PAY' ||
        filterStatus === 'UNPAID' ||
        filterStatus === 'FINALIZED'
      ) {
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
      const [cList, pList, tList, comp] = await Promise.all([
        api.getCustomers(companyId),
        api.getProducts(companyId),
        api.getLetterheads(companyId),
        api.getCompany(companyId).catch(() => null),
      ]);
      setCustomers(cList);
      setProducts(pList);
      setTemplates(tList);
      const defTemplate = tList.find((t) => t.is_default) || tList[0];
      if (defTemplate) {
        setSelectedTemplateId(defTemplate.id);
        setActivePrintTemplateId(defTemplate.id);
      }
      const loadedTerms = comp?.default_invoice_terms || '';
      setCompanyDefaultTerms(loadedTerms);
      setNotes((prev) => (!prev ? loadedTerms : prev));
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
        quantity: '',
        rate: '',
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

  const formatItemNotesToDescription = (notes?: string[]): string => {
    const cleaned = (notes || []).map((n) => n.trim()).filter((n) => n.length > 0);
    if (cleaned.length === 0) return '';
    if (cleaned.length === 1) return cleaned[0];
    return cleaned.map((n, i) => `#${i + 1}: ${n}`).join('\n');
  };

  const handleUpdateItemNotes = (index: number, nextNotes: string[]) => {
    const copy = [...items];
    copy[index] = {
      ...copy[index],
      custom_notes: nextNotes,
      description: formatItemNotesToDescription(nextNotes),
    };
    setItems(copy);
  };

  const handleMatchItemNotesToQty = (index: number) => {
    const row = items[index];
    const qtyCount = Math.max(1, Math.min(200, Math.round(Number(row.quantity) || 1)));
    const current = [...(row.custom_notes || [])];
    if (qtyCount > current.length) {
      while (current.length < qtyCount) current.push('');
    } else {
      current.length = qtyCount;
    }
    const copy = [...items];
    copy[index] = {
      ...copy[index],
      custom_notes: current,
      show_notes: true,
      description: formatItemNotesToDescription(current),
    };
    setItems(copy);
  };

  const handleProductSelect = (index: number, productId: string) => {
    const newItems = [...items];
    if (!productId) {
      newItems[index] = {
        ...newItems[index],
        item_id: undefined,
        min_selling_price: null,
        max_selling_price: null,
        is_custom: true,
      };
      setItems(newItems);
      return;
    }

    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    const prodNotes = Array.isArray(prod.custom_notes) ? [...prod.custom_notes] : [];
    newItems[index] = {
      ...newItems[index],
      item_id: prod.id,
      item_type: prod.item_type,
      item_name: prod.name,
      custom_notes: prodNotes,
      show_notes: prodNotes.length > 0,
      description: prodNotes.length > 0 ? formatItemNotesToDescription(prodNotes) : (prod.description || ''),
      hsn_or_sac: prod.hsn_or_sac,
      rate: Number(prod.selling_price) > 0 ? prod.selling_price : '',
      min_selling_price: prod.min_selling_price || null,
      max_selling_price: prod.max_selling_price || null,
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
      const cleanedNotes = (row.custom_notes || []).map((n: string) => n.trim()).filter((n: string) => n.length > 0);
      const created = await api.createProduct(companyId, {
        item_type: row.item_type || 'PRODUCT',
        name: row.item_name.trim(),
        hsn_or_sac: row.hsn_or_sac || '',
        unit: row.unit || 'NOS',
        selling_price: String(row.rate || '0.00'),
        purchase_price: '0.00',
        gst_rate: String(row.gst_rate || '18.00'),
        is_tax_inclusive: Boolean(row.is_tax_inclusive),
        custom_notes: cleanedNotes,
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
    const invalidQty = validItems.find((it) => !it.quantity || Number(it.quantity) <= 0);
    if (invalidQty) {
      alert(`Please enter a valid quantity for "${invalidQty.item_name}".`);
      return;
    }

    const priceWarnings: string[] = [];
    for (const it of validItems) {
      const rateStr = String(it.rate ?? '').trim();
      if (!rateStr) continue;
      try {
        const rateDec = new Decimal(rateStr);
        if (it.min_selling_price && rateDec.lt(new Decimal(it.min_selling_price))) {
          priceWarnings.push(
            `• ${it.item_name}: Rate ${formatIndianCurrency(rateDec.toFixed(2))} is below Min Selling Price (${formatIndianCurrency(it.min_selling_price)})`
          );
        }
        if (it.max_selling_price && rateDec.gt(new Decimal(it.max_selling_price))) {
          priceWarnings.push(
            `• ${it.item_name}: Rate ${formatIndianCurrency(rateDec.toFixed(2))} is above Max Selling Price (${formatIndianCurrency(it.max_selling_price)})`
          );
        }
      } catch {
        // ignore invalid decimal during warning check
      }
    }
    if (priceWarnings.length > 0) {
      const proceed = window.confirm(
        `Selling Price Range Warning:\n\n${priceWarnings.join('\n')}\n\nDo you still want to create this invoice with the entered rate?`
      );
      if (!proceed) return;
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
        finalize_on_create: invoicePaymentStatus !== 'DRAFT',
        mark_as_paid: invoicePaymentStatus === 'PAID' || invoicePaymentStatus === 'PARTIAL',
        payment_amount: invoicePaymentStatus === 'PARTIAL' ? invoicePartialAmount : undefined,
        payment_method:
          invoicePaymentStatus === 'PAID' || invoicePaymentStatus === 'PARTIAL' ? paymentMethod : undefined,
        payment_date:
          invoicePaymentStatus === 'PAID' || invoicePaymentStatus === 'PARTIAL'
            ? paymentDate || invoiceDate
            : undefined,
        payment_reference:
          invoicePaymentStatus === 'PAID' || invoicePaymentStatus === 'PARTIAL' ? paymentReference : undefined,
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

      resetForm();
      window.dispatchEvent(new CustomEvent('eim-data-changed', { detail: { type: 'invoice' } }));
      closeCreateModal();
      if (!modalOnly) {
        await loadInvoices();
      }
    } catch (err: any) {
      const msg = err.message || 'Error creating invoice';
      if (msg.includes('Insufficient stock') || msg.includes('Allow Negative Stock')) {
        const enableAndRetry = window.confirm(
          `${msg}\n\nWould you like to automatically enable "Allow Negative Stock" and proceed with creating this invoice now?`
        );
        if (enableAndRetry) {
          try {
            await api.updateCompanySettings(companyId, { allow_negative_stock: true });
            await handleCreateInvoice();
            return;
          } catch (retryErr: any) {
            alert(retryErr.message || 'Error updating settings');
            return;
          }
        }
      } else {
        alert(msg);
      }
    }
  };

  const handleOpenMarkPaid = (inv: Invoice, defaultType: 'FULL' | 'PARTIAL' | 'CLOSE' = 'FULL') => {
    setMarkPaidInvoice(inv);
    setMarkPaidType(defaultType);
    setCloseRemainingOnPartial(false);
    setMarkPaidAmount(Number(inv.balance_amount) > 0 ? inv.balance_amount : '');
    setMarkPaidMethod('BANK_TRANSFER');
    setMarkPaidDate(new Date().toISOString().split('T')[0]);
    setMarkPaidRef(inv.invoice_number || '');
    setCloseReason('Settled and closed invoice at collected amount; remaining balance waived.');
    setMarkPaidNotes(
      defaultType === 'PARTIAL'
        ? `Partial payment for invoice ${inv.invoice_number}`
        : defaultType === 'CLOSE'
        ? `Closed invoice ${inv.invoice_number} at paid amount of ₹ ${inv.paid_amount}`
        : `Full payment for invoice ${inv.invoice_number}`
    );
  };

  const handleConfirmMarkPaid = async () => {
    if (!markPaidInvoice) return;
    try {
      if (markPaidType === 'CLOSE') {
        const reason =
          closeReason.trim() || 'Settled and closed invoice at collected amount; remaining balance waived.';
        const updated = await api.closeInvoice(companyId, markPaidInvoice.id, {
          reason,
          notes: markPaidNotes,
        });
        if (viewingInvoice?.id === markPaidInvoice.id) {
          setViewingInvoice(updated);
        }
        setMarkPaidInvoice(null);
        await loadInvoices();
        alert(
          `Invoice ${markPaidInvoice.invoice_number} has been closed at paid amount of ₹ ${markPaidInvoice.paid_amount} and moved to PAID!`
        );
        return;
      }

      let payAmt = markPaidInvoice.balance_amount;
      if (markPaidType === 'PARTIAL') {
        const parsed = parseFloat(markPaidAmount);
        if (isNaN(parsed) || parsed <= 0) {
          alert('Please enter a valid partial payment amount greater than zero.');
          return;
        }
        if (new Decimal(parsed).gt(new Decimal(markPaidInvoice.balance_amount || 0))) {
          alert(
            `Partial payment amount (₹ ${parsed}) cannot exceed remaining balance (₹ ${markPaidInvoice.balance_amount}).`
          );
          return;
        }
        payAmt = parsed.toFixed(2);
      }

      const updated = await api.markInvoiceAsPaid(companyId, markPaidInvoice.id, {
        amount: payAmt,
        payment_method: markPaidMethod,
        payment_date: markPaidDate,
        reference_number: markPaidRef,
        notes: markPaidNotes,
        close_remaining_balance: markPaidType === 'PARTIAL' ? closeRemainingOnPartial : false,
      });
      if (viewingInvoice?.id === markPaidInvoice.id) {
        setViewingInvoice(updated);
      }
      setMarkPaidInvoice(null);
      await loadInvoices();
      if (markPaidType === 'PARTIAL' && closeRemainingOnPartial) {
        alert(
          `Recorded partial payment of ₹ ${payAmt} and closed ${markPaidInvoice.invoice_number} into PAID!`
        );
      }
    } catch (err: any) {
      alert(err.message || 'Error recording payment');
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
      const msg = err.message || 'Error finalizing invoice';
      if (msg.includes('Insufficient stock') || msg.includes('Allow Negative Stock')) {
        const enableAndRetry = window.confirm(
          `${msg}\n\nWould you like to automatically enable "Allow Negative Stock" and finalize this invoice now?`
        );
        if (enableAndRetry) {
          try {
            await api.updateCompanySettings(companyId, { allow_negative_stock: true });
            await handleFinalize(invoiceId);
            return;
          } catch (retryErr: any) {
            alert(retryErr.message || 'Error updating settings');
            return;
          }
        }
      } else {
        alert(msg);
      }
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
    const templateId = activePrintTemplateId || selectedTemplateId || templates[0]?.id || '';
    const url = api.getInvoicePdfUrl(companyId, invoiceId, mode, templateId || undefined);
    window.open(url, '_blank');
  };

  const resetForm = () => {
    setDocType(defaultDocType);
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
        quantity: '',
        rate: '',
        gst_rate: '18.00',
        is_tax_inclusive: false,
        is_custom: false,
      },
    ]);
    setNotes(companyDefaultTerms || '');
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

  const isStaffInvoice = (inv: Invoice) => {
    const devName = (inv.created_by_device_name || '').trim();
    const devId = (inv.created_by_device_id || '').trim();
    if (!devName && !devId) return false;
    if (devName === 'Main Office PC' || devId === 'local-host-pc') return false;
    return true;
  };

  const modeInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const isSalesInvoice = SALES_DOC_TYPE_SET.has(inv.document_type);
      return isOtherMode ? !isSalesInvoice : isSalesInvoice;
    });
  }, [invoices, isOtherMode]);

  const staffInvoices = useMemo(() => {
    return modeInvoices.filter(isStaffInvoice);
  }, [modeInvoices]);

  const hostInvoices = useMemo(() => {
    return modeInvoices.filter((inv) => !isStaffInvoice(inv));
  }, [modeInvoices]);

  const staffContributors = useMemo(() => {
    const names = new Set<string>();
    for (const inv of staffInvoices) {
      if (inv.created_by_device_name) names.add(inv.created_by_device_name);
    }
    return Array.from(names);
  }, [staffInvoices]);

  const staffTotalAmount = useMemo(() => {
    let tot = new Decimal(0);
    for (const inv of staffInvoices) {
      if (inv.status !== 'CANCELLED') {
        tot = tot.plus(new Decimal(inv.grand_total || '0'));
      }
    }
    return tot.toFixed(2);
  }, [staffInvoices]);

  const invoiceStats = useMemo(() => {
    let totRev = new Decimal(0);
    let totBal = new Decimal(0);
    let finalizedCount = 0;
    for (const inv of modeInvoices) {
      if (inv.status !== 'CANCELLED') {
        totRev = totRev.plus(new Decimal(inv.grand_total || '0'));
        totBal = totBal.plus(new Decimal(inv.balance_amount || '0'));
        if (inv.status === 'FINALIZED') finalizedCount++;
      }
    }
    return {
      revenue: totRev.toFixed(2),
      balance: totBal.toFixed(2),
      finalizedCount,
    };
  }, [modeInvoices]);

  const filteredInvoices = modeInvoices.filter((inv) => {
    if (filterAuthor === 'STAFF' && !isStaffInvoice(inv)) return false;
    if (filterAuthor === 'HOST' && isStaffInvoice(inv)) return false;

    if (filterStatus === 'PAID') {
      const isPaid = inv.status === 'FINALIZED' && new Decimal(inv.balance_amount || 0).lte(0);
      if (!isPaid) return false;
    }
    if (filterStatus === 'PARTIAL PAY') {
      const isPartial =
        inv.status === 'FINALIZED' &&
        new Decimal(inv.paid_amount || 0).gt(0) &&
        new Decimal(inv.balance_amount || 0).gt(0);
      if (!isPartial) return false;
    }
    if (filterStatus === 'UNPAID') {
      const isUnpaid =
        inv.status === 'FINALIZED' &&
        new Decimal(inv.paid_amount || 0).lte(0) &&
        new Decimal(inv.balance_amount || 0).gt(0);
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
    <>
      {!modalOnly && (
        <div className="p-6 space-y-5 overflow-y-auto">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
            {isOtherMode ? (
              <FileText className="w-5 h-5 text-brand-600" />
            ) : (
              <Receipt className="w-5 h-5 text-brand-600" />
            )}
            <span>{isOtherMode ? 'Invoices (Other)' : 'Sales & Tax Invoices'}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isOtherMode
              ? 'Manage Standard Invoices, Bills of Supply, Proforma Invoices, Commercial Invoices, Delivery Challans, Credit Notes, and Debit Notes.'
              : 'Generate GST Tax Invoices and Service Invoices, select print templates, review draft states, finalize numbers, and manage cancellations.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setDocType(defaultDocType);
            setIsCreateModalOpen(true);
          }}
          className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>{isOtherMode ? 'New Other Document' : 'New Invoice'}</span>
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-slate-500 dark:text-slate-400 font-medium">Total Documents</div>
          <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
            {modeInvoices.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Rs. {formatIndianCurrency(invoiceStats.revenue)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-slate-500 dark:text-slate-400 font-medium">Finalized</div>
          <div className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
            {invoiceStats.finalizedCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Ready & Active</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-slate-500 dark:text-slate-400 font-medium">Pending Balance</div>
          <div className="text-lg font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">
            Rs. {formatIndianCurrency(invoiceStats.balance)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">To be collected</div>
        </div>

        {/* Staff Created Files Card */}
        <div
          onClick={() => setFilterAuthor((prev) => (prev === 'STAFF' ? 'ALL' : 'STAFF'))}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all shadow-sm ${
            filterAuthor === 'STAFF'
              ? 'bg-purple-100 dark:bg-purple-900/50 border-purple-400 dark:border-purple-600'
              : 'bg-purple-50/70 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800/60 hover:border-purple-300'
          }`}
          title="Click to filter invoices created by staff"
        >
          <div className="flex items-center justify-between">
            <span className="text-purple-800 dark:text-purple-300 font-bold flex items-center space-x-1">
              <Users className="w-3.5 h-3.5 text-purple-600" />
              <span>Created by Staff</span>
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-200/80 text-purple-900 dark:bg-purple-800 dark:text-purple-100">
              {staffInvoices.length} Files
            </span>
          </div>
          <div className="text-lg font-extrabold text-purple-950 dark:text-purple-100 mt-0.5">
            Rs. {formatIndianCurrency(staffTotalAmount)}
          </div>
          <div className="text-[10px] text-purple-700 dark:text-purple-300 truncate mt-0.5">
            {staffContributors.length > 0 ? staffContributors.join(', ') : 'No staff files yet'}
          </div>
        </div>
      </div>

      {/* Staff Activity Alert Banner */}
      {staffInvoices.length > 0 && (
        <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-sm">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-purple-600 text-white rounded-lg">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-purple-950 dark:text-purple-200">
                Staff Activity: {staffInvoices.length} file{staffInvoices.length > 1 ? 's' : ''} created by office staff ({staffContributors.join(', ') || 'Staff Workstations'})
              </span>
              <span className="text-purple-700 dark:text-purple-300 ml-2">
                Total value: Rs. {formatIndianCurrency(staffTotalAmount)}. All records synced live over office LAN.
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFilterAuthor((prev) => (prev === 'STAFF' ? 'ALL' : 'STAFF'))}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-sm ${
              filterAuthor === 'STAFF'
                ? 'bg-purple-700 text-white'
                : 'bg-white dark:bg-slate-800 text-purple-800 dark:text-purple-200 border border-purple-300 hover:bg-purple-100'
            }`}
          >
            {filterAuthor === 'STAFF' ? 'Showing Staff Invoices (Show All)' : `View Only Staff Invoices (${staffInvoices.length})`}
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filters */}
          {['ALL', 'FINALIZED', 'PAID', 'PARTIAL PAY', 'UNPAID', 'DRAFT'].map((st) => (
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

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-600 mx-1 hidden sm:block" />

          {/* Author Filters */}
          <button
            type="button"
            onClick={() => setFilterAuthor('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              filterAuthor === 'ALL'
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            All Authors ({modeInvoices.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterAuthor('STAFF')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
              filterAuthor === 'STAFF'
                ? 'bg-purple-700 text-white'
                : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
            }`}
          >
            <Users className="w-3 h-3 mr-1" />
            <span>Staff ({staffInvoices.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterAuthor('HOST')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
              filterAuthor === 'HOST'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <Shield className="w-3 h-3 mr-1" />
            <span>Host / MD ({hostInvoices.length})</span>
          </button>
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
              <th className="py-3 px-4">Created By</th>
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
                <td colSpan={10} className="py-8 text-center text-slate-400">
                  No invoices found matching current filter.
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
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                      {isoToDisplayDate(inv.invoice_date) || inv.invoice_date}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-100">
                      {inv.customer_name}
                    </td>
                    <td className="py-3 px-4">
                      {isStaffInvoice(inv) ? (
                        <span
                          className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                          title={`Created on staff workstation: ${inv.created_by_device_name || 'Staff'}`}
                        >
                          <Users className="w-3 h-3 text-purple-600" />
                          <span>Staff: {inv.created_by_device_name || 'Staff PC'}</span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                          title="Created on Host PC / MD Workstation"
                        >
                          <Shield className="w-3 h-3 text-slate-500" />
                          <span>Main PC / MD</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                      {formatIndianCurrency(inv.grand_total)}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-600 font-semibold">
                      {formatIndianCurrency(inv.paid_amount)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-rose-600">
                      <div>{formatIndianCurrency(inv.balance_amount)}</div>
                      {inv.status === 'FINALIZED' && Number(inv.balance_amount) > 0 && (() => {
                        const cust = customers.find((c) => c.id === inv.customer_id);
                        const cd = getInvoiceDaysRemaining(inv, cust?.payment_terms_days || 0);
                        if (!cd) return null;
                        return (
                          <div className="mt-0.5 flex justify-end">
                            <span
                              className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                                cd.daysLeft <= 0
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                  : cd.daysLeft <= 7
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                              }`}
                              title={`Payment Due Date: ${cd.dueDateStr}`}
                            >
                              <Clock className="w-2.5 h-2.5" />
                              <span>
                                {cd.daysLeft < 0
                                  ? `Overdue ${Math.abs(cd.daysLeft)}d`
                                  : cd.daysLeft === 0
                                    ? 'Due Today'
                                    : `${cd.daysLeft}d left`}
                              </span>
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {(() => {
                        if (inv.status === 'FINALIZED') {
                          if (new Decimal(inv.balance_amount || 0).lte(0)) {
                            return (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                PAID
                              </span>
                            );
                          }
                          if (new Decimal(inv.paid_amount || 0).gt(0)) {
                            return (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                PARTIAL PAY
                              </span>
                            );
                          }
                          return (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              UNPAID
                            </span>
                          );
                        }
                        if (inv.status === 'CANCELLED') {
                          return (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              CANCELLED
                            </span>
                          );
                        }
                        return (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                            DRAFT
                          </span>
                        );
                      })()}
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
                            onClick={() => handleOpenMarkPaid(inv, Number(inv.paid_amount) > 0 ? 'PARTIAL' : 'FULL')}
                            className="inline-flex items-center space-x-1 px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shadow-sm"
                            title="Record full or partial customer payment"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{Number(inv.paid_amount) > 0 ? 'Pay / Partial' : 'Record Pay'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrintPdf(inv.id, 'DIGITAL_LETTERHEAD');
                          }}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300 dark:hover:bg-brand-900/60 rounded text-xs font-bold border border-brand-200 dark:border-brand-800 transition-colors shadow-xs"
                          title="Open Invoice PDF immediately (Browser / PDF viewer)"
                        >
                          <FileText className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                          <span>PDF</span>
                        </button>

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
        </div>
      )}

      {/* VIEW INVOICE MODAL */}
      {!modalOnly && viewingInvoice && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center space-x-3">
                <Receipt className="w-5 h-5 text-brand-600" />
                <div>
                  <h2 className="font-extrabold text-base text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                    <span>{viewingInvoice.document_type.replace(/_/g, ' ')}: {viewingInvoice.invoice_number}</span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                        viewingInvoice.status === 'FINALIZED'
                          ? Number(viewingInvoice.balance_amount) <= 0
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : Number(viewingInvoice.paid_amount) > 0
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : viewingInvoice.status === 'CANCELLED'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {viewingInvoice.status === 'FINALIZED'
                        ? Number(viewingInvoice.balance_amount) <= 0
                          ? 'PAID'
                          : Number(viewingInvoice.paid_amount) > 0
                          ? 'PARTIAL PAY'
                          : 'UNPAID'
                        : viewingInvoice.status}
                    </span>
                  </h2>
                  <div className="text-xs text-slate-500">
                    Date: {isoToDisplayDate(viewingInvoice.invoice_date) || viewingInvoice.invoice_date} | Due Date: {isoToDisplayDate(viewingInvoice.due_date) || viewingInvoice.due_date}
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
                          {it.description && <div className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-pre-line mt-0.5">{it.description}</div>}
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
                  <FileText className="w-4 h-4 text-brand-600" />
                  <span>Print Template</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex-1">
                    <SearchableSelect
                      options={printTemplateOptions}
                      value={activePrintTemplateId}
                      onChange={(val) => setActivePrintTemplateId(val)}
                      placeholder="Select print template..."
                      size="sm"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePrintPdf(viewingInvoice.id, 'DIGITAL_LETTERHEAD')}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print / Download PDF</span>
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
                    onClick={() =>
                      handleOpenMarkPaid(
                        viewingInvoice,
                        Number(viewingInvoice.paid_amount) > 0 ? 'PARTIAL' : 'FULL'
                      )
                    }
                    className="inline-flex items-center space-x-1 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {Number(viewingInvoice.paid_amount) > 0
                        ? 'Pay Remaining / Partial'
                        : 'Record / Partial Pay'}
                    </span>
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
        </ModalPortal>
      )}

      {/* New Invoice Creation Modal */}
      {isCreateModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-[96vw] max-w-[90rem] max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                {isOtherMode ? (
                  <FileText className="w-4 h-4 text-brand-600" />
                ) : (
                  <Receipt className="w-4 h-4 text-brand-600" />
                )}
                <span>{isOtherMode ? 'Create Other Invoice / Document' : 'Create Sales Document'}</span>
              </h2>
              <button onClick={closeCreateModal} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Document Type *</label>
                  </div>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as DocumentType)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 font-medium outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
                    {allowedDocTypes.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Customer *</label>
                    <button
                      type="button"
                      onClick={() => setIsQuickAddCustomerOpen(true)}
                      className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 font-bold flex items-center space-x-1 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ New Customer</span>
                    </button>
                  </div>
                  <SearchableSelect
                    options={customerOptions}
                    value={selectedCustomerId}
                    onChange={(val) => {
                      if (val === '__ADD_NEW_CUSTOMER__') {
                        setIsQuickAddCustomerOpen(true);
                      } else {
                        setSelectedCustomerId(val);
                      }
                    }}
                    placeholder="Search customer by name or GSTIN..."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Invoice Date</label>
                  </div>
                  <DateInput
                    value={invoiceDate}
                    onChange={(val) => setInvoiceDate(val)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Due Date</label>
                  </div>
                  <DateInput
                    value={dueDate}
                    onChange={(val) => setDueDate(val)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                  {(() => {
                    const cust = customers.find((c) => c.id === selectedCustomerId);
                    if (!cust || !cust.payment_terms_days || cust.payment_terms_days <= 0) return null;
                    return (
                      <div className="mt-1 text-[10px] font-semibold text-brand-700 dark:text-brand-300 flex items-center space-x-1">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>
                          Customer reminder: {cust.payment_terms_days} days (Due: {isoToDisplayDate(dueDate)})
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Print Template Selector */}
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
                      <FileText className="w-3.5 h-3.5 text-brand-600" />
                      <span>Print Template</span>
                    </label>
                  </div>
                  <SearchableSelect
                    options={templateOptions}
                    value={selectedTemplateId}
                    onChange={(val) => setSelectedTemplateId(val)}
                    placeholder="Select print template..."
                  />
                </div>

                {/* Payment Status Selection on Create */}
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Invoice Status & Payment Collection</span>
                    </label>
                  </div>
                  <select
                    value={invoicePaymentStatus}
                    onChange={(e) => setInvoicePaymentStatus(e.target.value as any)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 font-semibold outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
                    <option value="UNPAID">Finalize (Unpaid / Full Credit)</option>
                    <option value="PARTIAL">Partial Pay (Finalize & Record Partial Payment Now)</option>
                    <option value="PAID">Paid in Full (Finalize & Record Full Payment Now)</option>
                    <option value="DRAFT">Save as Draft (Edit Later)</option>
                  </select>
                </div>
              </div>

              {/* Payment Receipt Fields if Paid or Partial is selected */}
              {(invoicePaymentStatus === 'PAID' || invoicePaymentStatus === 'PARTIAL') && (
                <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-3">
                  <div className="grid grid-cols-3 gap-4">
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
                      <DateInput
                        value={paymentDate}
                        onChange={(val) => setPaymentDate(val)}
                        className="w-full border border-emerald-300 dark:border-emerald-700 rounded px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
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

                  {invoicePaymentStatus === 'PARTIAL' && (
                    <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <label className="block font-semibold text-emerald-950 dark:text-emerald-200 mb-1">
                          Partial Payment Amount Received Now (₹) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 5000.00"
                          value={invoicePartialAmount}
                          onChange={(e) => setInvoicePartialAmount(e.target.value)}
                          className="w-full border border-emerald-300 dark:border-emerald-700 rounded px-3 py-1.5 bg-white dark:bg-slate-800 font-bold"
                        />
                      </div>
                      <div className="text-right text-xs pt-4">
                        <span className="text-slate-500">Remaining Balance: </span>
                        <span className="font-bold text-rose-600">
                          {(() => {
                            const tot = parseFloat(previewDocTotals.grandTotal || '0');
                            const part = parseFloat(invoicePartialAmount || '0');
                            return formatIndianCurrency(Math.max(0, tot - (isNaN(part) ? 0 : part)).toFixed(2));
                          })()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Line Items Table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-visible">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="p-2 min-w-[260px]">Product / Item *</th>
                      <th className="p-2 w-24">HSN / SAC</th>
                      <th className="p-2 w-20">Unit</th>
                      <th className="p-2 w-20">Qty</th>
                      <th className="p-2 w-32">Rate (₹)</th>
                      <th className="p-2 w-24">GST %</th>
                      <th className="p-2 w-16 text-center">Incl. GST</th>
                      <th className="p-2 w-20 text-center">Note</th>
                      <th className="p-2 w-28 text-right">Total (₹)</th>
                      <th className="p-2 w-16 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((item, idx) => {
                      const lineCalc = previewCalculatedLines[idx];
                      const isCustomRow = !item.item_id;
                      const activeNotesCount = item.custom_notes?.filter((n: string) => n.trim()).length || 0;
                      return (
                        <React.Fragment key={idx}>
                          <tr className="bg-white dark:bg-slate-800">
                            <td className="p-2 align-middle">
                              <SearchableSelect
                                options={catalogItemOptions}
                                value={item.item_id || ''}
                                freeTextValue={item.item_name || ''}
                                hideSelectedMeta
                                onChange={(val) => handleProductSelect(idx, val)}
                                onFreeTextChange={(text) => {
                                  const copy = [...items];
                                  copy[idx] = {
                                    ...copy[idx],
                                    item_id: undefined,
                                    item_name: text,
                                    item_type: copy[idx].item_type || (docType === 'SERVICE_INVOICE' ? 'SERVICE' : 'PRODUCT'),
                                    min_selling_price: null,
                                    max_selling_price: null,
                                    is_custom: true,
                                  };
                                  setItems(copy);
                                }}
                                placeholder="Search product or enter custom item..."
                                size="sm"
                              />
                            </td>
                            <td className="p-2 align-middle">
                              <input
                                type="text"
                                placeholder="HSN/SAC"
                                value={item.hsn_or_sac || ''}
                                onChange={(e) => {
                                  const copy = [...items];
                                  copy[idx].hsn_or_sac = e.target.value;
                                  setItems(copy);
                                }}
                                className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-xs font-mono"
                              />
                            </td>
                            <td className="p-2 align-middle">
                              <input
                                type="text"
                                placeholder="NOS"
                                value={item.unit || 'NOS'}
                                onChange={(e) => {
                                  const copy = [...items];
                                  copy[idx].unit = e.target.value;
                                  setItems(copy);
                                }}
                                className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-xs uppercase"
                              />
                            </td>
                            <td className="p-2 align-middle">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                placeholder="Qty"
                                value={item.quantity ?? ''}
                                onChange={(e) => {
                                  const copy = [...items];
                                  copy[idx].quantity = e.target.value;
                                  setItems(copy);
                                }}
                                className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-right"
                              />
                            </td>
                            <td className="p-2 align-middle">
                              {(() => {
                                let isBelowMin = false;
                                let isAboveMax = false;
                                const rateStr = String(item.rate ?? '').trim();
                                if (rateStr) {
                                  try {
                                    const rateDec = new Decimal(rateStr);
                                    if (item.min_selling_price && rateDec.lt(new Decimal(item.min_selling_price))) {
                                      isBelowMin = true;
                                    }
                                    if (item.max_selling_price && rateDec.gt(new Decimal(item.max_selling_price))) {
                                      isAboveMax = true;
                                    }
                                  } catch {
                                    // ignore invalid input while typing
                                  }
                                }
                                return (
                                  <div className="space-y-1">
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      placeholder="0.00"
                                      value={item.rate ?? ''}
                                      onChange={(e) => {
                                        const copy = [...items];
                                        copy[idx].rate = e.target.value;
                                        setItems(copy);
                                      }}
                                      className={`w-full border rounded px-2 py-1 text-right ${
                                        isBelowMin
                                          ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                                          : isAboveMax
                                            ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                                            : 'border-slate-200 dark:border-slate-600'
                                      }`}
                                    />
                                    {(item.min_selling_price || item.max_selling_price) && (
                                      <div className="flex flex-wrap items-center justify-end gap-1 text-[9px] font-mono">
                                        {item.min_selling_price && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const copy = [...items];
                                              copy[idx].rate = item.min_selling_price;
                                              setItems(copy);
                                            }}
                                            className={`px-1 py-0.5 rounded border transition-colors ${
                                              isBelowMin
                                                ? 'bg-rose-100 text-rose-700 border-rose-300 font-bold'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-brand-50 hover:text-brand-700'
                                            }`}
                                            title="Click to apply Minimum Selling Price"
                                          >
                                            Min ₹{item.min_selling_price}
                                          </button>
                                        )}
                                        {item.max_selling_price && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const copy = [...items];
                                              copy[idx].rate = item.max_selling_price;
                                              setItems(copy);
                                            }}
                                            className={`px-1 py-0.5 rounded border transition-colors ${
                                              isAboveMax
                                                ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-brand-50 hover:text-brand-700'
                                            }`}
                                            title="Click to apply Maximum Selling Price"
                                          >
                                            Max ₹{item.max_selling_price}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    {isBelowMin && (
                                      <div className="text-[9px] font-semibold text-rose-600 text-right">
                                        Below min price
                                      </div>
                                    )}
                                    {isAboveMax && (
                                      <div className="text-[9px] font-semibold text-amber-600 text-right">
                                        Above max price
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="p-2 align-middle">
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
                            <td className="p-2 align-middle text-center">
                              <input
                                type="checkbox"
                                checked={Boolean(item.is_tax_inclusive)}
                                onChange={(e) => {
                                  const copy = [...items];
                                  copy[idx].is_tax_inclusive = e.target.checked;
                                  setItems(copy);
                                }}
                                title="Rate is Inclusive of GST"
                                className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-2 align-middle text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const copy = [...items];
                                  const nextShow = !copy[idx].show_notes;
                                  let currentNotes = Array.isArray(copy[idx].custom_notes) ? [...copy[idx].custom_notes] : [];
                                  if (nextShow && currentNotes.length === 0) {
                                    const qtyCount = Math.max(1, Math.min(200, Math.round(Number(copy[idx].quantity) || 1)));
                                    for (let i = 0; i < qtyCount; i++) currentNotes.push('');
                                  } else if (!nextShow) {
                                    currentNotes = currentNotes.map((n: string) => n.trim()).filter((n: string) => n.length > 0);
                                  }
                                  copy[idx] = {
                                    ...copy[idx],
                                    show_notes: nextShow,
                                    custom_notes: currentNotes,
                                    description: formatItemNotesToDescription(currentNotes),
                                  };
                                  setItems(copy);
                                }}
                                className="inline-flex items-center space-x-1 text-[10px] font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300 px-2 py-1 rounded border border-brand-200 dark:border-brand-700 transition-colors whitespace-nowrap"
                                title="Add custom notes per item (e.g. warranty, serial/hard disk numbers)"
                              >
                                <StickyNote className="w-3 h-3" />
                                <span>{activeNotesCount > 0 ? `Notes (${activeNotesCount})` : '+ Note'}</span>
                              </button>
                            </td>
                            <td className="p-2 align-middle text-right font-mono font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                              {formatIndianCurrency(lineCalc.lineTotal)}
                            </td>
                            <td className="p-2 align-middle text-center">
                              <div className="flex items-center justify-center space-x-1">
                                {isCustomRow && item.item_name?.trim() && (
                                  <button
                                    type="button"
                                    disabled={savingToCatalogIdx === idx}
                                    onClick={() => handleSaveCustomItemToCatalog(idx)}
                                    className="text-brand-600 hover:text-brand-800 p-0.5"
                                    title="Save this item into Products Catalog for future reuse"
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

                          {item.show_notes && (
                            <tr className="bg-slate-50/70 dark:bg-slate-900/40">
                              <td colSpan={10} className="px-3 py-2">
                                <div className="p-2 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                      Item Notes — {item.item_name || `Row #${idx + 1}`} ({(item.custom_notes || []).length})
                                    </span>
                                    <div className="flex items-center space-x-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleMatchItemNotesToQty(idx)}
                                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                                        title="Create one note row per quantity"
                                      >
                                        Match Qty ({Math.max(1, Math.round(Number(item.quantity) || 1))})
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateItemNotes(idx, [...(item.custom_notes || []), ''])}
                                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-600 hover:bg-brand-700 text-white"
                                      >
                                        + Add
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const copy = [...items];
                                          const cleaned = (copy[idx].custom_notes || [])
                                            .map((n: string) => n.trim())
                                            .filter((n: string) => n.length > 0);
                                          copy[idx] = {
                                            ...copy[idx],
                                            show_notes: false,
                                            custom_notes: cleaned,
                                            description: formatItemNotesToDescription(cleaned),
                                          };
                                          setItems(copy);
                                        }}
                                        className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                                        title="Save & close notes"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-0.5">
                                    {(item.custom_notes || []).map((noteVal: string, nIdx: number) => (
                                      <div key={nIdx} className="flex items-center space-x-1">
                                        <span className="text-[10px] font-mono font-bold text-slate-500 w-6 shrink-0">
                                          #{nIdx + 1}
                                        </span>
                                        <input
                                          type="text"
                                          placeholder={`Warranty / Serial No. for item #${nIdx + 1}`}
                                          value={noteVal}
                                          onChange={(e) => {
                                            const next = [...(item.custom_notes || [])];
                                            next[nIdx] = e.target.value;
                                            handleUpdateItemNotes(idx, next);
                                          }}
                                          className="flex-1 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 text-[11px] bg-white dark:bg-slate-800"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next = (item.custom_notes || []).filter((_: string, i: number) => i !== nIdx);
                                            handleUpdateItemNotes(idx, next);
                                          }}
                                          className="text-slate-400 hover:text-rose-600 p-0.5"
                                          title="Remove note"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => handleAddItem(false)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300 border border-brand-200 dark:border-brand-800 rounded-lg text-xs font-bold transition-all shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item Row</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddItem(true)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold transition-all shadow-sm"
                    title="Add custom or not-in-stock item"
                  >
                    <Plus className="w-3.5 h-3.5 text-slate-500" />
                    <span>Add Custom Item</span>
                  </button>
                </div>

                <div className="flex items-center space-x-4 text-xs bg-slate-50 dark:bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500">Taxable: <strong className="text-slate-800 dark:text-slate-200">{formatIndianCurrency(previewDocTotals.totalTaxableValue)}</strong></span>
                  <span className="text-slate-500">Tax: <strong className="text-slate-800 dark:text-slate-200">{formatIndianCurrency(previewDocTotals.totalTax)}</strong></span>
                  <span className="text-slate-500">Grand Total: <strong className="text-brand-600 text-sm font-bold">{formatIndianCurrency(previewDocTotals.grandTotal)}</strong></span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    Invoice Notes &amp; Terms
                  </label>
                  {companyDefaultTerms && (
                    <button
                      type="button"
                      onClick={() => setNotes(companyDefaultTerms)}
                      className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      Reset to Settings Default
                    </button>
                  )}
                </div>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Payment instructions, bank transfer details, delivery terms..."
                  className="w-full border border-slate-300 dark:border-slate-600 rounded p-2 text-xs font-mono leading-relaxed"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Pre-filled from Settings. You can edit, add, or delete terms for this invoice.
                </p>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end space-x-2">
              <button
                type="button"
                onClick={closeCreateModal}
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
                  : invoicePaymentStatus === 'PARTIAL'
                  ? 'Finalize & Record Partial Pay'
                  : invoicePaymentStatus === 'UNPAID'
                  ? 'Finalize Unpaid Invoice'
                  : 'Save as Draft'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Mark Invoice as Paid / Partial Pay Modal */}
      {markPaidInvoice && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
              <h3 className="font-bold text-sm text-emerald-700 dark:text-emerald-400 flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5" />
                <span>Record Customer Payment ({markPaidInvoice.invoice_number})</span>
              </h3>
              <button onClick={() => setMarkPaidInvoice(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Financial Overview Card */}
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Total Amount</div>
                <div className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                  {formatIndianCurrency(markPaidInvoice.grand_total)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Already Paid</div>
                <div className="font-bold text-emerald-600 text-xs">
                  {formatIndianCurrency(markPaidInvoice.paid_amount)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Remaining Balance</div>
                <div className="font-bold text-rose-600 text-xs">
                  {formatIndianCurrency(markPaidInvoice.balance_amount)}
                </div>
              </div>
            </div>

            {/* Full Payment vs Partial Pay vs Close Invoice Selection */}
            <div className="flex bg-slate-100 dark:bg-slate-700/60 p-1 rounded-lg border border-slate-200 dark:border-slate-600 gap-1">
              <button
                type="button"
                onClick={() => {
                  setMarkPaidType('FULL');
                  setMarkPaidAmount(markPaidInvoice.balance_amount);
                  setMarkPaidNotes(`Full payment received for invoice ${markPaidInvoice.invoice_number}`);
                }}
                className={`flex-1 py-1.5 px-2 text-center text-xs font-bold rounded-md transition-all ${
                  markPaidType === 'FULL'
                    ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Full Pay ({formatIndianCurrency(markPaidInvoice.balance_amount)})
              </button>
              <button
                type="button"
                onClick={() => {
                  setMarkPaidType('PARTIAL');
                  if (markPaidAmount === markPaidInvoice.balance_amount) {
                    setMarkPaidAmount('');
                  }
                  setMarkPaidNotes(`Partial payment received for invoice ${markPaidInvoice.invoice_number}`);
                }}
                className={`flex-1 py-1.5 px-2 text-center text-xs font-bold rounded-md transition-all ${
                  markPaidType === 'PARTIAL'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Partial Pay (Custom)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMarkPaidType('CLOSE');
                  setCloseReason('Settled and closed invoice at collected amount; remaining balance waived.');
                }}
                className={`flex-1 py-1.5 px-2 text-center text-xs font-bold rounded-md transition-all ${
                  markPaidType === 'CLOSE'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Close Invoice (At Paid)
              </button>
            </div>

            {/* Dynamic Amount / Settlement Section */}
            {markPaidType === 'CLOSE' ? (
              <div className="p-4 bg-indigo-50/80 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800 space-y-3">
                <div className="flex items-start space-x-2.5">
                  <CheckCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm text-indigo-950 dark:text-indigo-200">
                      Close & Settle Invoice at Paid Amount
                    </h4>
                    <p className="text-slate-600 dark:text-slate-300 text-xs mt-1 leading-relaxed">
                      This will close this invoice at the collected amount of{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400">
                        {formatIndianCurrency(markPaidInvoice.paid_amount)}
                      </strong>
                      . The remaining balance of{' '}
                      <strong className="text-rose-600 dark:text-rose-400">
                        {formatIndianCurrency(markPaidInvoice.balance_amount)}
                      </strong>{' '}
                      will be cleared/waived, reducing customer account liability to ₹ 0.00 and transporting this invoice into{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400 font-bold">PAID</strong> invoices.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-indigo-950 dark:text-indigo-200 mb-1">
                    Reason / Settlement Note *
                  </label>
                  <input
                    type="text"
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                    placeholder="e.g. Settled with customer; remaining balance waived / cash discount"
                    className="w-full border border-indigo-200 dark:border-indigo-700 rounded px-3 py-1.5 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            ) : markPaidType === 'PARTIAL' ? (
              <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-amber-900 dark:text-amber-200">
                    Partial Payment Amount (₹) *
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Max: {formatIndianCurrency(markPaidInvoice.balance_amount)}
                  </span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={markPaidInvoice.balance_amount}
                  placeholder="Enter amount customer is paying now"
                  value={markPaidAmount}
                  onChange={(e) => setMarkPaidAmount(e.target.value)}
                  className="w-full border border-amber-300 dark:border-amber-700 rounded px-3 py-1.5 text-sm font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-brand-500"
                />
                {(() => {
                  const amt = parseFloat(markPaidAmount);
                  const bal = parseFloat(markPaidInvoice.balance_amount || '0');
                  if (!isNaN(amt) && amt > 0) {
                    if (amt > bal) {
                      return (
                        <div className="text-[11px] text-rose-600 font-bold">
                          Amount cannot exceed remaining balance of {formatIndianCurrency(markPaidInvoice.balance_amount)}.
                        </div>
                      );
                    }
                    const remaining = (bal - amt).toFixed(2);
                    return (
                      <div className="flex justify-between items-center text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                        <span>Remaining balance after this payment:</span>
                        <span className="font-bold text-amber-700 dark:text-amber-300">
                          {formatIndianCurrency(remaining)}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="pt-2 border-t border-amber-200/80 dark:border-amber-800/60">
                  <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={closeRemainingOnPartial}
                      onChange={(e) => setCloseRemainingOnPartial(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span>Close invoice after this payment (waive/clear remaining balance into PAID)</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800 flex justify-between items-center">
                <span className="text-emerald-900 dark:text-emerald-200 font-semibold">Full Amount Being Settled:</span>
                <span className="font-extrabold text-base text-emerald-700 dark:text-emerald-300">
                  {formatIndianCurrency(markPaidInvoice.balance_amount)}
                </span>
              </div>
            )}

            {markPaidType !== 'CLOSE' && (
              <>
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
                    <DateInput
                      value={markPaidDate}
                      onChange={(val) => setMarkPaidDate(val)}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
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
              </>
            )}

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
                className={`px-4 py-1.5 text-white rounded text-xs font-bold shadow-sm ${
                  markPaidType === 'CLOSE'
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {markPaidType === 'CLOSE'
                  ? `Close Invoice & Move to PAID (${formatIndianCurrency(markPaidInvoice.paid_amount)})`
                  : markPaidType === 'PARTIAL'
                  ? `Confirm Partial Payment (${formatIndianCurrency(markPaidAmount || '0')})${
                      closeRemainingOnPartial ? ' & Close Invoice' : ''
                    }`
                  : `Confirm Full Payment (${formatIndianCurrency(markPaidInvoice.balance_amount)})`}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Cancellation Reason Modal */}
      {cancelModalInvoice && (
        <ModalPortal>
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
        </ModalPortal>
      )}

      {/* Quick Add Customer Modal */}
      {isQuickAddCustomerOpen && (
        <QuickAddCustomerModal
          isOpen={isQuickAddCustomerOpen}
          onClose={() => setIsQuickAddCustomerOpen(false)}
          companyId={companyId}
          onCustomerCreated={(newCust) => {
            setCustomers((prev) => [newCust, ...prev]);
            setSelectedCustomerId(newCust.id);
            setIsQuickAddCustomerOpen(false);
          }}
        />
      )}
    </>
  );
};
