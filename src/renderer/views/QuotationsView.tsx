// src/renderer/views/QuotationsView.tsx - Quotations Management, Template Selection & 1-Click Conversion
import React, { useState, useEffect, useMemo } from 'react';
import Decimal from 'decimal.js';
import { Quotation, Customer, Product, LetterheadTemplate } from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency, calculateLineItem, calculateDocumentTotals } from '../../server/finance/decimalCalc';
import { GST_RATES } from '../../shared/constants';
import { SearchableSelect } from '../components/SearchableSelect';
import { ModalPortal } from '../components/ModalPortal';
import { DateInput, isoToDisplayDate } from '../components/DateInput';
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
  FileText,
  BookmarkPlus,
  Sparkles,
  Package,
  Users,
  Shield,
} from 'lucide-react';

interface Props {
  companyId: string;
  onNavigateToInvoice?: () => void;
  modalOnly?: boolean;
  onCloseModal?: () => void;
}

export const QuotationsView: React.FC<Props> = ({
  companyId,
  onNavigateToInvoice,
  modalOnly = false,
  onCloseModal,
}) => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<LetterheadTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterAuthor, setFilterAuthor] = useState<'ALL' | 'STAFF' | 'HOST'>('ALL');
  const [loading, setLoading] = useState<boolean>(!modalOnly);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(Boolean(modalOnly));
  const [viewingQuotation, setViewingQuotation] = useState<Quotation | null>(null);

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    if (modalOnly && onCloseModal) {
      onCloseModal();
    }
  };

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [quoteDate, setQuoteDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState<string>(
    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [items, setItems] = useState<any[]>([
    { item_name: '', hsn_or_sac: '', quantity: '', rate: '', gst_rate: '18.00', unit: 'NOS' },
  ]);
  const [notes, setNotes] = useState<string>('');
  const [autoSaveNewItems, setAutoSaveNewItems] = useState<boolean>(true);
  const [isQuickProductModalOpen, setIsQuickProductModalOpen] = useState<boolean>(false);
  const [targetItemRowIdx, setTargetItemRowIdx] = useState<number | null>(null);
  const [savingToCatalogIdx, setSavingToCatalogIdx] = useState<number | null>(null);

  const [quickProduct, setQuickProduct] = useState({
    name: '',
    item_type: 'PRODUCT' as 'PRODUCT' | 'SERVICE',
    unit: 'NOS',
    hsn_or_sac: '',
    selling_price: '',
    gst_rate: '18.00',
    description: '',
  });

  // Selected print template in the viewing modal
  const [activePrintTemplateId, setActivePrintTemplateId] = useState<string>('');

  const customerOptions = useMemo(() => {
    return [
      { value: '', label: '-- Select Customer --' },
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
      label: tpl.name,
      sublabel: `${tpl.file_type} - ${tpl.orientation || 'Portrait'}`,
    }));
  }, [templates]);

  const printTemplateOptions = useMemo(() => {
    return templates.map((tpl) => ({
      value: tpl.id,
      label: tpl.name,
      sublabel: `${tpl.file_type} - ${tpl.orientation || 'Portrait'}`,
    }));
  }, [templates]);

  const catalogItemOptions = useMemo(() => {
    return [
      { value: '', label: '-- Manual / Custom Item --' },
      { value: '__NEW__', label: '✨ + Add New Item (Not In Stock)...', isAction: true },
      ...products.map((p) => {
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
      }),
    ];
  }, [products]);

  useEffect(() => {
    if (companyId) {
      if (!modalOnly) {
        loadQuotations();
      }
      loadMaster();
    }
  }, [companyId, modalOnly]);

  const loadQuotationsSilently = async () => {
    try {
      const data = await api.getQuotations(companyId);
      setQuotations(data);
    } catch {
      // ignore silent errors
    }
  };

  useEffect(() => {
    if (modalOnly || !companyId) return;
    const onDataChanged = () => {
      loadQuotationsSilently();
      loadMaster();
    };

    // Live silent auto-sync every 3.5 seconds so newly created quotations from staff show up automatically!
    const syncTimer = setInterval(() => {
      loadQuotationsSilently();
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
  }, [companyId, modalOnly]);

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

  const handleAddItem = (isNonStock = false) => {
    setItems([
      ...items,
      {
        item_name: '',
        hsn_or_sac: '',
        quantity: '',
        rate: '',
        gst_rate: '18.00',
        unit: 'NOS',
        is_custom: isNonStock,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleProductSelect = (index: number, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    const prodNotes = Array.isArray(prod.custom_notes)
      ? prod.custom_notes.map((n) => n.trim()).filter((n) => n.length > 0)
      : [];
    const formattedDesc =
      prodNotes.length === 1
        ? prodNotes[0]
        : prodNotes.length > 1
          ? prodNotes.map((n, i) => `#${i + 1}: ${n}`).join('\n')
          : prod.description || '';

    const copy = [...items];
    copy[index] = {
      ...copy[index],
      item_id: prod.id,
      item_type: prod.item_type,
      item_name: prod.name,
      description: formattedDesc,
      hsn_or_sac: prod.hsn_or_sac,
      rate: Number(prod.selling_price) > 0 ? prod.selling_price : '',
      min_selling_price: prod.min_selling_price || null,
      max_selling_price: prod.max_selling_price || null,
      gst_rate: prod.gst_rate,
      unit: prod.unit,
      is_custom: false,
    };
    setItems(copy);
  };

  const handleSaveCustomItemToCatalog = async (index: number) => {
    const row = items[index];
    if (!row || !row.item_name?.trim()) {
      alert('Please enter an item name first');
      return;
    }
    setSavingToCatalogIdx(index);
    try {
      const created = await api.createProduct(companyId, {
        name: row.item_name.trim(),
        item_type: row.item_type || 'PRODUCT',
        hsn_or_sac: row.hsn_or_sac || '9999',
        unit: row.unit || 'NOS',
        selling_price: String(row.rate || '0.00'),
        purchase_price: '0.00',
        gst_rate: String(row.gst_rate || '18.00'),
        is_tax_inclusive: false,
        current_stock: '0.00',
        is_active: true,
      });
      setProducts((prev) => [...prev, created]);
      const copy = [...items];
      copy[index] = {
        ...copy[index],
        item_id: created.id,
        item_name: created.name,
        hsn_or_sac: created.hsn_or_sac,
        rate: created.selling_price,
        gst_rate: created.gst_rate,
        unit: created.unit,
        is_custom: false,
      };
      setItems(copy);
      alert(`Saved "${created.name}" to Products & Services list (Stock: 0)!`);
    } catch (err: any) {
      alert(err.message || 'Could not save item to products list');
    } finally {
      setSavingToCatalogIdx(null);
    }
  };

  const handleQuickProductSave = async () => {
    if (!quickProduct.name.trim()) {
      alert('Product name is required');
      return;
    }
    try {
      const created = await api.createProduct(companyId, {
        name: quickProduct.name.trim(),
        item_type: quickProduct.item_type,
        unit: quickProduct.unit || 'NOS',
        hsn_or_sac: quickProduct.hsn_or_sac || '9999',
        selling_price: String(quickProduct.selling_price || '0.00'),
        purchase_price: '0.00',
        gst_rate: String(quickProduct.gst_rate || '18.00'),
        description: quickProduct.description || undefined,
        current_stock: '0.00',
        is_active: true,
      });

      setProducts((prev) => [...prev, created]);

      if (targetItemRowIdx !== null && items[targetItemRowIdx]) {
        const copy = [...items];
        copy[targetItemRowIdx] = {
          ...copy[targetItemRowIdx],
          item_id: created.id,
          item_type: created.item_type,
          item_name: created.name,
          hsn_or_sac: created.hsn_or_sac,
          rate: created.selling_price,
          gst_rate: created.gst_rate,
          unit: created.unit,
          is_custom: false,
        };
        setItems(copy);
      } else {
        setItems([
          ...items,
          {
            item_id: created.id,
            item_type: created.item_type,
            item_name: created.name,
            hsn_or_sac: created.hsn_or_sac,
            quantity: '',
            rate: Number(created.selling_price) > 0 ? created.selling_price : '',
            gst_rate: created.gst_rate,
            unit: created.unit,
            is_custom: false,
          },
        ]);
      }

      setIsQuickProductModalOpen(false);
      setQuickProduct({
        name: '',
        item_type: 'PRODUCT',
        unit: 'NOS',
        hsn_or_sac: '',
        selling_price: '',
        gst_rate: '18.00',
        description: '',
      });
      setTargetItemRowIdx(null);
    } catch (err: any) {
      alert(err.message || 'Error creating product');
    }
  };

  const handleCreateQuotation = async () => {
    const cust = customers.find((c) => c.id === selectedCustomerId);
    if (!cust) {
      alert('Please select a customer');
      return;
    }

    const validItems = items.filter((it) => it.item_name && it.item_name.trim() !== '');
    if (validItems.length === 0) {
      alert('Please add at least one item.');
      return;
    }
    const invalidQty = validItems.find((it) => !it.quantity || Number(it.quantity) <= 0);
    if (invalidQty) {
      alert(`Please enter a valid quantity for "${invalidQty.item_name}".`);
      return;
    }

    try {
      // Automatically save new non-catalog items to products list if enabled
      let finalItems = validItems.map((it) => ({
        ...it,
        quantity: it.quantity || '1',
        rate: it.rate || '0.00',
      }));
      if (autoSaveNewItems) {
        for (let i = 0; i < finalItems.length; i++) {
          const it = finalItems[i];
          if (!it.item_id && it.item_name?.trim()) {
            try {
              const created = await api.createProduct(companyId, {
                name: it.item_name.trim(),
                item_type: it.item_type || 'PRODUCT',
                hsn_or_sac: it.hsn_or_sac || '9999',
                unit: it.unit || 'NOS',
                selling_price: String(it.rate || '0.00'),
                purchase_price: '0.00',
                gst_rate: String(it.gst_rate || '18.00'),
                is_tax_inclusive: false,
                current_stock: '0.00',
                is_active: true,
              });
              setProducts((prev) => [...prev, created]);
              finalItems[i] = {
                ...finalItems[i],
                item_id: created.id,
              };
            } catch (e) {
              console.warn('Could not auto-save product:', e);
            }
          }
        }
      }

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
        items: finalItems,
        notes,
      });

      resetForm();
      window.dispatchEvent(new CustomEvent('eim-data-changed', { detail: { type: 'quotation' } }));
      closeCreateModal();
      if (!modalOnly) {
        await loadQuotations();
      }
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
    const templateId = activePrintTemplateId || selectedTemplateId || templates[0]?.id || '';
    const url = api.getQuotationPdfUrl(companyId, quoteId, mode, templateId || undefined);
    window.open(url, '_blank');
  };

  const resetForm = () => {
    setSelectedCustomerId('');
    setItems([{ item_name: '', hsn_or_sac: '', quantity: '', rate: '', gst_rate: '18.00', unit: 'NOS' }]);
    setNotes('');
    setAutoSaveNewItems(true);
  };

  const previewDocTotals = calculateDocumentTotals({
    items: items.map((it) => {
      const line = calculateLineItem({
        quantity: it.quantity || 0,
        rate: it.rate || 0,
        gstRate: it.gst_rate || 0,
        isTaxInclusive: false,
        isInterState: false,
      });
      return {
        ...it,
        quantity: line.quantity,
        rate: line.rate,
        taxable_value: line.taxableValue,
        total_tax: line.totalTax,
        line_total: line.lineTotal,
      };
    }) as any,
  });

  const isStaffQuotation = (q: Quotation) => {
    const devName = (q.created_by_device_name || '').trim();
    const devId = (q.created_by_device_id || '').trim();
    if (!devName && !devId) return false;
    if (devName === 'Main Office PC' || devId === 'local-host-pc') return false;
    return true;
  };

  const staffQuotations = useMemo(() => {
    return quotations.filter(isStaffQuotation);
  }, [quotations]);

  const hostQuotations = useMemo(() => {
    return quotations.filter((q) => !isStaffQuotation(q));
  }, [quotations]);

  const staffContributors = useMemo(() => {
    const names = new Set<string>();
    for (const q of staffQuotations) {
      if (q.created_by_device_name) names.add(q.created_by_device_name);
    }
    return Array.from(names);
  }, [staffQuotations]);

  const staffTotalAmount = useMemo(() => {
    let tot = new Decimal(0);
    for (const q of staffQuotations) {
      if (q.status !== 'REJECTED') {
        tot = tot.plus(new Decimal(q.grand_total || '0'));
      }
    }
    return tot.toFixed(2);
  }, [staffQuotations]);

  const quotationStats = useMemo(() => {
    let totRev = new Decimal(0);
    let acceptedCount = 0;
    for (const q of quotations) {
      if (q.status !== 'REJECTED') {
        totRev = totRev.plus(new Decimal(q.grand_total || '0'));
        if (q.status === 'ACCEPTED' || q.status === 'CONVERTED') acceptedCount++;
      }
    }
    return {
      revenue: totRev.toFixed(2),
      acceptedCount,
    };
  }, [quotations]);

  const filtered = quotations.filter((q) => {
    if (filterAuthor === 'STAFF' && !isStaffQuotation(q)) return false;
    if (filterAuthor === 'HOST' && isStaffQuotation(q)) return false;

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
    <>
      {!modalOnly && (
        <div className="p-6 space-y-5 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-brand-600" />
            <span>Commercial Quotations &amp; Estimates</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Create professional price estimates, revisions, print with uploaded templates, and 1-click convert to Sales Invoices.
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-slate-500 dark:text-slate-400 font-medium">Total Quotations</div>
          <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
            {quotations.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Rs. {formatIndianCurrency(quotationStats.revenue)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-slate-500 dark:text-slate-400 font-medium">Accepted / Converted</div>
          <div className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
            {quotationStats.acceptedCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Converted to Invoices</div>
        </div>

        {/* Staff Created Quotations Card */}
        <div
          onClick={() => setFilterAuthor((prev) => (prev === 'STAFF' ? 'ALL' : 'STAFF'))}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all shadow-sm ${
            filterAuthor === 'STAFF'
              ? 'bg-purple-100 dark:bg-purple-900/50 border-purple-400 dark:border-purple-600'
              : 'bg-purple-50/70 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800/60 hover:border-purple-300'
          }`}
          title="Click to filter quotations created by staff"
        >
          <div className="flex items-center justify-between">
            <span className="text-purple-800 dark:text-purple-300 font-bold flex items-center space-x-1">
              <Users className="w-3.5 h-3.5 text-purple-600" />
              <span>Created by Staff</span>
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-200/80 text-purple-900 dark:bg-purple-800 dark:text-purple-100">
              {staffQuotations.length} Quotes
            </span>
          </div>
          <div className="text-lg font-extrabold text-purple-950 dark:text-purple-100 mt-0.5">
            Rs. {formatIndianCurrency(staffTotalAmount)}
          </div>
          <div className="text-[10px] text-purple-700 dark:text-purple-300 truncate mt-0.5">
            {staffContributors.length > 0 ? staffContributors.join(', ') : 'No staff quotes yet'}
          </div>
        </div>
      </div>

      {/* Staff Activity Alert Banner */}
      {staffQuotations.length > 0 && (
        <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-sm">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-purple-600 text-white rounded-lg">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-purple-950 dark:text-purple-200">
                Staff Activity: {staffQuotations.length} quotation{staffQuotations.length > 1 ? 's' : ''} created by office staff ({staffContributors.join(', ') || 'Staff Workstations'})
              </span>
              <span className="text-purple-700 dark:text-purple-300 ml-2">
                Total value: Rs. {formatIndianCurrency(staffTotalAmount)}. Synced live over office LAN.
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
            {filterAuthor === 'STAFF' ? 'Showing Staff Quotes (Show All)' : `View Only Staff Quotes (${staffQuotations.length})`}
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterAuthor('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterAuthor === 'ALL'
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            All Quotes ({quotations.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterAuthor('STAFF')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
              filterAuthor === 'STAFF'
                ? 'bg-purple-700 text-white'
                : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
            }`}
          >
            <Users className="w-3.5 h-3.5 mr-1" />
            <span>Staff ({staffQuotations.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterAuthor('HOST')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
              filterAuthor === 'HOST'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5 mr-1" />
            <span>Host / MD ({hostQuotations.length})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-80">
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
              <th className="py-3 px-4">Created By</th>
              <th className="py-3 px-4 text-right">Grand Total</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  No quotations found matching current filter.
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
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {isoToDisplayDate(q.quotation_date) || q.quotation_date}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {isoToDisplayDate(q.valid_until_date) || q.valid_until_date}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-100">
                    {q.customer_name}
                  </td>
                  <td className="py-3 px-4">
                    {isStaffQuotation(q) ? (
                      <span
                        className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                        title={`Created on staff workstation: ${q.created_by_device_name || 'Staff'}`}
                      >
                        <Users className="w-3 h-3 text-purple-600" />
                        <span>Staff: {q.created_by_device_name || 'Staff PC'}</span>
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
                    <div className="flex items-center justify-center space-x-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrintPdf(q.id, 'DIGITAL_LETTERHEAD');
                        }}
                        className="inline-flex items-center space-x-1 px-2 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300 rounded text-xs font-bold border border-brand-200 dark:border-brand-800 transition-colors shadow-xs"
                        title="Open Quotation PDF immediately"
                      >
                        <FileText className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                        <span>PDF</span>
                      </button>

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
        </div>
      )}

      {/* VIEW QUOTATION MODAL */}
      {!modalOnly && viewingQuotation && (
        <ModalPortal>
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
                    Issued: {isoToDisplayDate(viewingQuotation.quotation_date) || viewingQuotation.quotation_date} | Valid Until: {isoToDisplayDate(viewingQuotation.valid_until_date) || viewingQuotation.valid_until_date}
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
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-visible">
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
                    onClick={() => handlePrintPdf(viewingQuotation.id, 'DIGITAL_LETTERHEAD')}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print / Download PDF</span>
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
        </ModalPortal>
      )}

      {/* CREATE QUOTATION MODAL */}
      {isCreateModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-brand-600" />
                <span>Create Commercial Quotation</span>
              </h2>
              <button onClick={closeCreateModal} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Customer *</label>
                  <SearchableSelect
                    options={customerOptions}
                    value={selectedCustomerId}
                    onChange={(val) => setSelectedCustomerId(val)}
                    placeholder="Search customer by name or GSTIN..."
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Quote Date</label>
                  <DateInput
                    value={quoteDate}
                    onChange={(val) => setQuoteDate(val)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Valid Until Date</label>
                  <DateInput
                    value={validUntil}
                    onChange={(val) => setValidUntil(val)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Print Template Selection for new quotation */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center space-x-1">
                  <FileText className="w-3.5 h-3.5 text-brand-600" />
                  <span>Print Template</span>
                </label>
                <SearchableSelect
                  options={templateOptions}
                  value={selectedTemplateId}
                  onChange={(val) => setSelectedTemplateId(val)}
                  placeholder="Select print template..."
                />
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-visible">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="p-2">Select Catalog Item</th>
                      <th className="p-2">Custom Description</th>
                      <th className="p-2 w-20">Qty</th>
                      <th className="p-2 w-28">Rate (₹)</th>
                      <th className="p-2 w-24">GST Rate</th>
                      <th className="p-2 w-28 text-right">Amount (₹)</th>
                      <th className="p-2 w-16 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((item, idx) => {
                      const qty = Number(item.quantity) || 0;
                      const rate = Number(item.rate) || 0;
                      const gst = Number(item.gst_rate) || 0;
                      const taxable = qty * rate;
                      const totalTax = taxable * (gst / 100);
                      const lineTotal = taxable + totalTax;
                      const isUnsavedNonStock = !item.item_id && Boolean(item.item_name?.trim());

                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors">
                          <td className="p-2">
                            <SearchableSelect
                              options={catalogItemOptions}
                              value={item.item_id || ''}
                              onChange={(val) => {
                                if (val === '__NEW__') {
                                  setTargetItemRowIdx(idx);
                                  setQuickProduct({
                                    name: item.item_name || '',
                                    item_type: 'PRODUCT',
                                    unit: item.unit || 'NOS',
                                    hsn_or_sac: item.hsn_or_sac || '',
                                    selling_price: item.rate || '0.00',
                                    gst_rate: item.gst_rate || '18.00',
                                    description: '',
                                  });
                                  setIsQuickProductModalOpen(true);
                                } else {
                                  handleProductSelect(idx, val);
                                }
                              }}
                              placeholder="-- Manual / Catalog --"
                              size="sm"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="Item name / non-stock description"
                              value={item.item_name}
                              onChange={(e) => {
                                const copy = [...items];
                                copy[idx].item_name = e.target.value;
                                setItems(copy);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700 text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="Qty"
                              value={item.quantity ?? ''}
                              onChange={(e) => {
                                const copy = [...items];
                                copy[idx].quantity = e.target.value;
                                setItems(copy);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700 text-xs text-right font-mono"
                            />
                          </td>
                          <td className="p-2 align-top">
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
                                    min="0"
                                    step="any"
                                    placeholder="0.00"
                                    value={item.rate ?? ''}
                                    onChange={(e) => {
                                      const copy = [...items];
                                      copy[idx].rate = e.target.value;
                                      setItems(copy);
                                    }}
                                    className={`w-full border rounded px-2 py-1 text-xs text-right font-mono ${
                                      isBelowMin
                                        ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                                        : isAboveMax
                                          ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                                          : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700'
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
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-2">
                            <select
                              value={item.gst_rate}
                              onChange={(e) => {
                                const copy = [...items];
                                copy[idx].gst_rate = e.target.value;
                                setItems(copy);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700 text-xs"
                            >
                              {GST_RATES.map((rate) => (
                                <option key={rate} value={rate}>
                                  {rate}%
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                            {formatIndianCurrency(lineTotal)}
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              {isUnsavedNonStock && (
                                <button
                                  type="button"
                                  disabled={savingToCatalogIdx === idx}
                                  onClick={() => handleSaveCustomItemToCatalog(idx)}
                                  className="text-brand-600 hover:text-brand-800 dark:text-brand-400 p-1 rounded hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"
                                  title="Save this new / non-stock item into Products Catalog"
                                >
                                  <BookmarkPlus className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
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

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleAddItem(false)}
                    className="inline-flex items-center space-x-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-bold transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Item Row</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTargetItemRowIdx(null);
                      setQuickProduct({
                        name: '',
                        item_type: 'PRODUCT',
                        unit: 'NOS',
                        hsn_or_sac: '',
                        selling_price: '',
                        gst_rate: '18.00',
                        description: '',
                      });
                      setIsQuickProductModalOpen(true);
                    }}
                    className="inline-flex items-center space-x-1.5 text-xs px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-700 rounded-lg font-bold transition-all shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>+ Add New Item (Not In Stock)</span>
                  </button>
                </div>

                <div className="flex items-center space-x-4 text-xs bg-slate-50 dark:bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500">Taxable: <strong className="text-slate-800 dark:text-slate-200">{formatIndianCurrency(previewDocTotals.totalTaxableValue)}</strong></span>
                  <span className="text-slate-500">Tax: <strong className="text-slate-800 dark:text-slate-200">{formatIndianCurrency(previewDocTotals.totalTax)}</strong></span>
                  <span className="text-slate-500">Grand Total: <strong className="text-brand-600 text-sm font-bold">{formatIndianCurrency(previewDocTotals.grandTotal)}</strong></span>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-amber-50/60 dark:bg-amber-900/10 border border-amber-200/80 dark:border-amber-800/40 rounded-lg">
                <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoSaveNewItems}
                    onChange={(e) => setAutoSaveNewItems(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                  />
                  <span>
                    <strong>Add new items to Products List automatically</strong> (Creates newly entered items in your catalog with initial stock of 0)
                  </span>
                </label>
              </div>

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
                onClick={closeCreateModal}
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
        </ModalPortal>
      )}

      {/* QUICK ADD PRODUCT (NOT IN STOCK) MODAL */}
      {isQuickProductModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Add New Item (Not In Stock) to Products List</span>
              </h2>
              <button
                onClick={() => setIsQuickProductModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-amber-800 dark:text-amber-200 flex items-start space-x-2">
                <Package className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  This product will be saved to your <strong>Products & Services List</strong> with initial stock of <strong>0.00 (Not In Stock)</strong> and inserted into your current quotation.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Product / Item Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Industrial Control Valve 2-inch"
                  value={quickProduct.name}
                  onChange={(e) => setQuickProduct({ ...quickProduct, name: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 font-medium"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Item Type
                  </label>
                  <select
                    value={quickProduct.item_type}
                    onChange={(e) => setQuickProduct({ ...quickProduct, item_type: e.target.value as any })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  >
                    <option value="PRODUCT">Physical Product</option>
                    <option value="SERVICE">Service / Labor</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    placeholder="NOS, PCS, MTR..."
                    value={quickProduct.unit}
                    onChange={(e) => setQuickProduct({ ...quickProduct, unit: e.target.value.toUpperCase() })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Selling Rate (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={quickProduct.selling_price}
                    onChange={(e) => setQuickProduct({ ...quickProduct, selling_price: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    GST Rate
                  </label>
                  <select
                    value={quickProduct.gst_rate}
                    onChange={(e) => setQuickProduct({ ...quickProduct, gst_rate: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  >
                    {GST_RATES.map((r) => (
                      <option key={r} value={r}>{r}%</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    HSN / SAC
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 8481"
                    value={quickProduct.hsn_or_sac}
                    onChange={(e) => setQuickProduct({ ...quickProduct, hsn_or_sac: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description / Specification
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional technical specifications or item notes..."
                  value={quickProduct.description}
                  onChange={(e) => setQuickProduct({ ...quickProduct, description: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded p-2 bg-white dark:bg-slate-700"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsQuickProductModalOpen(false)}
                className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleQuickProductSave}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save to Products & Insert</span>
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
};
