// src/renderer/views/QuotationsView.tsx - Quotations Management, Template Selection & 1-Click Conversion
import React, { useState, useEffect, useMemo } from 'react';
import Decimal from 'decimal.js';
import { Quotation, Customer, Product, LetterheadTemplate, Company } from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency, calculateLineItem, calculateDocumentTotals } from '../../server/finance/decimalCalc';
import { GST_RATES } from '../../shared/constants';
import { SearchableSelect } from '../components/SearchableSelect';
import { ModalPortal } from '../components/ModalPortal';
import { QuickAddCustomerModal } from '../components/QuickAddCustomerModal';
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
  FileText,
  BookmarkPlus,
  Package,
  Users,
  Shield,
  User,
  Edit2,
  Check,
  Eye,
  Download,
  Pencil,
} from 'lucide-react';

interface Props {
  companyId: string;
  onNavigateToInvoice?: () => void;
  modalOnly?: boolean;
  onCloseModal?: () => void;
  onQuotationCreated?: (quotation: Quotation) => void;
  isOwnerOrHost?: boolean;
}

export const DEFAULT_VARUN_TERMS = `Terms &Conditions: No warranty for burn / Physical Damage.
1. Taxes: Inclusive of GST
2. Payment: 100% Advance along with PO
3. Validity: 7 Days
4. Delivery: 1 week form the date of PO
5. Installation and transport Included.`;

export const DEFAULT_VARUN_QUOTATION_TERMS = DEFAULT_VARUN_TERMS;

export const QuotationsView: React.FC<Props> = ({
  companyId,
  onNavigateToInvoice,
  modalOnly = false,
  onCloseModal,
  onQuotationCreated,
  isOwnerOrHost: propIsOwnerOrHost = true,
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
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setEditingQuotation(null);
    if (modalOnly && onCloseModal) {
      onCloseModal();
    }
  };

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerNameInput, setCustomerNameInput] = useState<string>('');
  const [billingAddressInput, setBillingAddressInput] = useState<string>('');
  const [customerGstinInput, setCustomerGstinInput] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [quoteDate, setQuoteDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState<string>(
    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [topMarginMm, setTopMarginMm] = useState<number>(55);
  const [bottomMarginMm, setBottomMarginMm] = useState<number>(32);
  const [companyDefaultTerms, setCompanyDefaultTerms] = useState<string>(DEFAULT_VARUN_TERMS);
  const [companyInfo, setCompanyInfo] = useState<Company | null>(null);
  const [termsAndConditions, setTermsAndConditions] = useState<string>(DEFAULT_VARUN_TERMS);
  const [customRoundOff, setCustomRoundOff] = useState<string>('0.00');
  const [items, setItems] = useState<any[]>([
    { item_name: '', description: '', hsn_or_sac: '', quantity: '1', units: '01', rate: '', gst_rate: '18.00', unit: 'NOS' },
  ]);
  const [notes, setNotes] = useState<string>('');
  const [autoSaveNewItems, setAutoSaveNewItems] = useState<boolean>(true);
  const [savingToCatalogIdx, setSavingToCatalogIdx] = useState<number | null>(null);

  // Selected print template in the viewing modal
  const [activePrintTemplateId, setActivePrintTemplateId] = useState<string>('');
  const [isQuickAddCustomerOpen, setIsQuickAddCustomerOpen] = useState<boolean>(false);

  // Staff and Creator state
  const [availableStaffNames, setAvailableStaffNames] = useState<string[]>(['Admin / Owner']);
  const [creatorName, setCreatorName] = useState<string>(() => {
    return localStorage.getItem('eim_workstation_name') || 'Admin / Owner';
  });
  const [editingCreatorQuotationId, setEditingCreatorQuotationId] = useState<string | null>(null);
  const [editingCreatorValue, setEditingCreatorValue] = useState<string>('');
  const [internalIsOwner, setInternalIsOwner] = useState<boolean>(() => {
    try {
      const lanRole = localStorage.getItem('eim_lan_role');
      const customHost = localStorage.getItem('eim_lan_host_ip');
      return lanRole !== 'LAN_CLIENT' || !customHost;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    api.getMyWorkstationPermission().then((res) => {
      const ws = res?.workstation;
      if (ws) {
        setInternalIsOwner(Boolean(ws.is_admin));
      }
    }).catch(() => {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');
      const isStaff = typeof window !== 'undefined' && localStorage.getItem('eim_lan_role') === 'LAN_CLIENT';
      setInternalIsOwner(isLocal && !isStaff);
    });
  }, []);

  const isOwnerOrHost = propIsOwnerOrHost && internalIsOwner;

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

  const quotationTemplates = useMemo(() => {
    return templates.filter(
      (tpl) => !tpl.applies_to || tpl.applies_to === 'QUOTATION' || tpl.applies_to === 'BOTH'
    );
  }, [templates]);

  const templateOptions = useMemo(() => {
    return quotationTemplates.map((tpl) => ({
      value: tpl.id,
      label: tpl.id.startsWith('builtin-') ? `${tpl.name} (Built-in)` : tpl.name,
      sublabel: `${tpl.file_type} - ${tpl.orientation || 'Portrait'}`,
    }));
  }, [quotationTemplates]);

  const printTemplateOptions = useMemo(() => {
    return quotationTemplates.map((tpl) => ({
      value: tpl.id,
      label: tpl.id.startsWith('builtin-') ? `${tpl.name} (Built-in)` : tpl.name,
      sublabel: `${tpl.file_type} - ${tpl.orientation || 'Portrait'}`,
    }));
  }, [quotationTemplates]);

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
    setQuotations([]);
    setCustomers([]);
    setProducts([]);
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

  const handleOpenQuotation = async (q: Quotation) => {
    try {
      const full = await api.getQuotation(companyId, q.id);
      setViewingQuotation(full || q);
      setActivePrintTemplateId(full?.letterhead_template_id || q.letterhead_template_id || (templates[0]?.id || ''));
    } catch {
      setViewingQuotation(q);
      setActivePrintTemplateId(q.letterhead_template_id || (templates[0]?.id || ''));
    }
  };

  const loadMaster = async () => {
    try {
      const [cList, pList, tList, comp, wsRes] = await Promise.all([
        api.getCustomers(companyId),
        api.getProducts(companyId),
        api.getLetterheads(companyId),
        api.getCompany(companyId).catch(() => null),
        api.getWorkstations().catch(() => ({ workstations: [] })),
      ]);
      setCustomers(cList);
      setProducts(pList);
      setTemplates(tList);
      const availableQuotationTpls = tList.filter(
        (t) => !t.applies_to || t.applies_to === 'QUOTATION' || t.applies_to === 'BOTH'
      );
      const defTemplate = availableQuotationTpls.find((t) => t.is_default) || availableQuotationTpls[0] || tList[0];
      if (defTemplate) {
        setSelectedTemplateId(defTemplate.id);
        setActivePrintTemplateId(defTemplate.id);
      }
      setCompanyInfo(comp);
      const loadedTerms =
        (comp?.default_quotation_terms && comp.default_quotation_terms.trim()) ||
        DEFAULT_VARUN_TERMS;
      setCompanyDefaultTerms(loadedTerms);
      setTermsAndConditions((prev) => (!prev || prev === DEFAULT_VARUN_TERMS ? loadedTerms : prev));

      const staffList = ((wsRes as any)?.workstations || [])
        .map((w: any) => (w.name || w.device_name || '').trim())
        .filter((name: string) => name && name !== 'local-host-pc' && name !== 'Office PC');
      const uniqueNames = Array.from(new Set(['Admin / Owner', ...staffList]));
      setAvailableStaffNames(uniqueNames);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddItem = (isNonStock = false) => {
    setItems((prev) => [
      ...prev,
      {
        item_name: '',
        description: '',
        hsn_or_sac: '',
        quantity: '1',
        units: '01',
        rate: '',
        gst_rate: '18.00',
        unit: 'NOS',
        is_custom: isNonStock,
      },
    ]);
  };

  // Keyboard Shortcuts: 'Ctrl +' to add new item row, 'Escape' to close open modal/window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Shortcut: Ctrl + (or Ctrl + =) to add item row when create modal is open
      const isCtrlPlus =
        (e.ctrlKey || e.metaKey) &&
        (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd' || e.code === 'Equal' || e.key === 'Add');

      if (isCtrlPlus && isCreateModalOpen) {
        e.preventDefault();
        e.stopPropagation();
        handleAddItem(false);
        return;
      }

      // 2. Shortcut: Esc to close open modals
      if (e.key === 'Escape') {
        if (isQuickAddCustomerOpen) {
          e.preventDefault();
          e.stopPropagation();
          setIsQuickAddCustomerOpen(false);
          return;
        }
        if (isCreateModalOpen) {
          e.preventDefault();
          e.stopPropagation();
          closeCreateModal();
          return;
        }
        if (viewingQuotation) {
          e.preventDefault();
          e.stopPropagation();
          setViewingQuotation(null);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isCreateModalOpen,
    isQuickAddCustomerOpen,
    viewingQuotation,
  ]);

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



  const handleEditQuotation = async (q: Quotation) => {
    try {
      const full = await api.getQuotation(companyId, q.id);
      const target = full || q;
      setEditingQuotation(target);
      setSelectedCustomerId(target.customer_id || '');
      setCustomerNameInput(target.customer_name || '');
      setCustomerGstinInput(target.customer_gstin || '');
      setBillingAddressInput(target.billing_address || '');
      setQuoteDate(target.quotation_date ? target.quotation_date.split('T')[0] : new Date().toISOString().split('T')[0]);
      setValidUntil(target.valid_until_date ? target.valid_until_date.split('T')[0] : new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
      setSelectedTemplateId(target.letterhead_template_id || '');
      setCreatorName(target.created_by_device_name || '');
      setTopMarginMm(target.top_margin_mm !== undefined && target.top_margin_mm !== null ? Number(target.top_margin_mm) : 55);
      setBottomMarginMm(target.bottom_margin_mm !== undefined && target.bottom_margin_mm !== null ? Number(target.bottom_margin_mm) : 32);
      setTermsAndConditions(target.terms_and_conditions || companyDefaultTerms);
      setCustomRoundOff(target.round_off ? String(target.round_off) : '0.00');
      setNotes(target.notes || '');

      if (target.items && target.items.length > 0) {
        setItems(
          target.items.map((it: any) => ({
            item_id: it.item_id || it.product_id || undefined,
            item_name: it.item_name || it.description || '',
            description: it.description || '',
            hsn_or_sac: it.hsn_or_sac || '9999',
            quantity: String(it.quantity || '1'),
            units: it.units || String(it.quantity || '01').padStart(2, '0'),
            rate: String(it.rate || it.unit_price || '0.00'),
            gst_rate: String(it.gst_rate || '18.00'),
            unit: it.unit || 'NOS',
          }))
        );
      } else {
        setItems([
          { item_name: '', description: '', hsn_or_sac: '', quantity: '1', units: '01', rate: '', gst_rate: '18.00', unit: 'NOS' },
        ]);
      }

      setIsCreateModalOpen(true);
    } catch (err: any) {
      alert(err.message || 'Error loading quotation details for editing');
    }
  };

  const handleCreateQuotation = async () => {
    const cust = customers.find((c) => c.id === selectedCustomerId);
    const finalCustName = cust ? cust.name : customerNameInput.trim();
    if (!finalCustName) {
      alert('Please select a customer or enter customer name');
      return;
    }

    const validItems = items.filter((it) => it.item_name && it.item_name.trim() !== '');
    if (validItems.length === 0) {
      alert('Please add at least one item.');
      return;
    }

    try {
      let finalItems = validItems.map((it) => {
        const qty = it.quantity || (it.units && !isNaN(Number(it.units)) ? it.units : '1');
        return {
          item_id: it.item_id || undefined,
          item_name: it.item_name.trim(),
          description: it.description || '',
          hsn_or_sac: it.hsn_or_sac || '9999',
          quantity: qty,
          units: it.units || (qty ? String(qty).padStart(2, '0') : '01'),
          rate: it.rate || '0.00',
          base_rate: it.rate || '0.00',
          gst_rate: it.gst_rate || '18.00',
          unit: it.unit || 'NOS',
        };
      });
      if (autoSaveNewItems) {
        for (let i = 0; i < finalItems.length; i++) {
          const it = finalItems[i];
          if (!it.item_id && it.item_name?.trim()) {
            try {
              const created = await api.createProduct(companyId, {
                name: it.item_name.trim(),
                item_type: 'PRODUCT',
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

      if (editingQuotation) {
        const updated = await api.updateQuotation(companyId, editingQuotation.id, {
          customer_id: cust ? cust.id : undefined,
          customer_name: finalCustName,
          customer_gstin: cust ? cust.gstin : customerGstinInput.trim() || undefined,
          billing_address: cust ? cust.billing_address : billingAddressInput.trim() || undefined,
          place_of_supply_state: cust ? cust.state : undefined,
          place_of_supply_code: cust ? cust.state_code : undefined,
          quotation_date: quoteDate,
          valid_until_date: validUntil,
          letterhead_template_id: selectedTemplateId || undefined,
          created_by_device_name: creatorName.trim() || undefined,
          top_margin_mm: topMarginMm,
          bottom_margin_mm: bottomMarginMm,
          terms_and_conditions: termsAndConditions,
          round_off: customRoundOff && customRoundOff.trim() !== '' ? customRoundOff.trim() : '0.00',
          items: finalItems,
          notes,
        });

        // Mirror locally on workstation if path is set
        try {
          const localPath = localStorage.getItem('eim_local_quotation_save_path');
          if (localPath && localPath.trim() && (window as any)?.electronAPI?.saveFileLocally) {
            const pdfUrl = api.getQuotationPdfUrl(companyId, updated.id);
            fetch(pdfUrl)
              .then((r) => r.blob())
              .then((blob) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const base64data = (reader.result as string).split(',')[1];
                  (window as any).electronAPI.saveFileLocally({
                    folderPath: localPath.trim(),
                    filename: updated.quotation_number,
                    fileBase64: base64data,
                  });
                };
                reader.readAsDataURL(blob);
              })
              .catch(() => {});
          }
        } catch (e) {
          console.warn('Could not mirror updated quotation PDF locally:', e);
        }

        resetForm();
        setEditingQuotation(null);
        window.dispatchEvent(new CustomEvent('eim-data-changed', { detail: { type: 'quotation' } }));
        closeCreateModal();
        if (!modalOnly) {
          await loadQuotations();
        }
        alert(`Quotation ${updated.quotation_number} updated successfully in database!`);
        return;
      }

      const created = await api.createQuotation(companyId, {
        customer_id: cust ? cust.id : undefined,
        customer_name: finalCustName,
        customer_gstin: cust ? cust.gstin : customerGstinInput.trim() || undefined,
        billing_address: cust ? cust.billing_address : billingAddressInput.trim() || undefined,
        place_of_supply_state: cust ? cust.state : undefined,
        place_of_supply_code: cust ? cust.state_code : undefined,
        quotation_date: quoteDate,
        valid_until_date: validUntil,
        letterhead_template_id: selectedTemplateId || undefined,
        created_by_device_name: creatorName.trim() || undefined,
        top_margin_mm: topMarginMm,
        bottom_margin_mm: bottomMarginMm,
        terms_and_conditions: termsAndConditions,
        round_off: customRoundOff && customRoundOff.trim() !== '' ? customRoundOff.trim() : '0.00',
        items: finalItems,
        notes,
      });

      // Workstation local copy mirroring (if staff has configured a local quotation save folder on this PC)
      try {
        const localPath = localStorage.getItem('eim_local_quotation_save_path');
        if (localPath && localPath.trim() && (window as any)?.electronAPI?.saveFileLocally) {
          const pdfUrl = api.getQuotationPdfUrl(companyId, created.id);
          fetch(pdfUrl)
            .then((r) => r.blob())
            .then((blob) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64data = (reader.result as string).split(',')[1];
                (window as any).electronAPI.saveFileLocally({
                  folderPath: localPath.trim(),
                  filename: created.quotation_number,
                  fileBase64: base64data,
                });
              };
              reader.readAsDataURL(blob);
            })
            .catch(() => {});
        }
      } catch (e) {
        console.warn('Could not auto-save workstation local quotation copy:', e);
      }

      resetForm();
      window.dispatchEvent(new CustomEvent('eim-data-changed', { detail: { type: 'quotation' } }));
      if (onQuotationCreated) {
        onQuotationCreated(created);
      }
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
    const url = api.getQuotationPdfUrl(companyId, quoteId, { mode, templateId: templateId || undefined });
    window.open(url, '_blank');
  };

  const handleSaveLocalCopy = async (quoteId: string, quoteNumber: string) => {
    try {
      let targetFolder = localStorage.getItem('eim_local_quotation_save_path') || '';
      const electronAPI = (window as any)?.electronAPI;

      if (!targetFolder && electronAPI?.selectFolder) {
        const chosen = await electronAPI.selectFolder();
        if (chosen) {
          targetFolder = chosen;
          localStorage.setItem('eim_local_quotation_save_path', chosen);
        } else {
          return;
        }
      }

      const templateId = activePrintTemplateId || selectedTemplateId || templates[0]?.id || '';
      const pdfUrl = api.getQuotationPdfUrl(companyId, quoteId, { mode: 'DIGITAL_LETTERHEAD', templateId: templateId || undefined });
      const res = await fetch(pdfUrl);
      if (!res.ok) throw new Error('Failed to generate Quotation PDF from server');
      const blob = await res.blob();

      if (targetFolder && electronAPI?.saveFileLocally) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          const saveRes = await electronAPI.saveFileLocally({
            folderPath: targetFolder,
            filename: quoteNumber,
            fileBase64: base64data,
          });
          if (saveRes?.success) {
            alert(`Quotation ${quoteNumber} saved locally on this computer:\n\n${saveRes.savedPath}`);
          } else {
            alert(`Failed to save locally: ${saveRes?.error || 'Unknown error'}`);
          }
        };
        reader.readAsDataURL(blob);
      } else {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${quoteNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      alert(`Could not save quotation: ${err.message}`);
    }
  };

  const resetForm = () => {
    setSelectedCustomerId('');
    setCustomerNameInput('');
    setBillingAddressInput('');
    setCustomerGstinInput('');
    setItems([{ item_name: '', description: '', hsn_or_sac: '', quantity: '1', units: '01', rate: '', gst_rate: '18.00', unit: 'NOS' }]);
    setNotes('');
    setTermsAndConditions(companyDefaultTerms || DEFAULT_VARUN_TERMS);
    setCustomRoundOff('0.00');
    setAutoSaveNewItems(true);
    setEditingQuotation(null);
  };

  const previewCalculatedLines = useMemo(() => {
    return items.map((it) => {
      const qty = it.quantity || (it.units && !isNaN(Number(it.units)) ? it.units : '1');
      return calculateLineItem({
        quantity: qty || '0',
        rate: it.rate || '0.00',
        gstRate: it.gst_rate || '18.00',
        isTaxInclusive: false,
        isInterState: false,
      });
    });
  }, [items]);

  const previewDocTotals = useMemo(() => {
    const roundOffVal =
      customRoundOff !== undefined && customRoundOff !== null && customRoundOff.trim() !== ''
        ? customRoundOff.trim()
        : '0.00';
    return calculateDocumentTotals({
      items: items.map((it, idx) => {
        const line = previewCalculatedLines[idx];
        return {
          ...it,
          quantity: line?.quantity || '0',
          rate: line?.rate || '0.00',
          taxable_value: line?.taxableValue || '0.00',
          total_tax: line?.totalTax || '0.00',
          line_total: line?.lineTotal || '0.00',
        };
      }) as any,
      customRoundOff: roundOffVal,
    });
  }, [items, previewCalculatedLines, customRoundOff]);

  const viewingTotalOfProducts = useMemo(() => {
    if (!viewingQuotation) return '0.00';
    let sum = new Decimal(0);
    if (viewingQuotation.items && viewingQuotation.items.length > 0) {
      for (const it of viewingQuotation.items) {
        const itTot =
          it.total_amount ||
          it.line_total ||
          new Decimal(it.taxable_amount || it.taxable_value || 0)
            .add(new Decimal(it.gst_amount || it.total_tax || 0))
            .toString();
        sum = sum.add(new Decimal(itTot || 0));
      }
    } else {
      sum = new Decimal(viewingQuotation.total_taxable_value || viewingQuotation.subtotal || 0).add(
        new Decimal(viewingQuotation.total_tax || viewingQuotation.gst_total || 0)
      );
    }
    return sum.toFixed(2);
  }, [viewingQuotation]);

  const viewingGrandTotal = useMemo(() => {
    if (!viewingQuotation) return '0.00';
    const prodTot = new Decimal(viewingTotalOfProducts);
    const ro = new Decimal(viewingQuotation.round_off || 0);
    return prodTot.add(ro).toFixed(2);
  }, [viewingQuotation, viewingTotalOfProducts]);

  const getCreatorDisplay = (q: { created_by_device_name?: string | null; created_by_device_id?: string | null }) => {
    const raw = (q.created_by_device_name || '').trim();
    if (!raw || raw === 'Office PC' || raw === 'Main Office PC' || raw === 'local-host-pc' || raw === 'Staff PC') {
      return 'Admin / Owner';
    }
    return raw;
  };

  const isStaffQuotation = (q: Quotation) => {
    const name = getCreatorDisplay(q);
    return name !== 'Admin / Owner';
  };

  const handleSaveCreator = async (quotationId: string) => {
    const val = editingCreatorValue.trim();
    if (!val) {
      setEditingCreatorQuotationId(null);
      return;
    }
    try {
      await api.updateQuotationCreator(companyId, quotationId, val);
      setQuotations((prev) =>
        prev.map((item) => (item.id === quotationId ? { ...item, created_by_device_name: val } : item))
      );
      if (viewingQuotation?.id === quotationId) {
        setViewingQuotation((prev) => (prev ? { ...prev, created_by_device_name: val } : null));
      }
      setEditingCreatorQuotationId(null);
    } catch (err: any) {
      alert(err.message || 'Failed to update quotation creator');
    }
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
      const disp = getCreatorDisplay(q);
      if (disp && disp !== 'Admin / Owner') names.add(disp);
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
        <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
            Commercial Quotations &amp; Estimates
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Create professional price estimates, revisions, print with uploaded templates, and 1-click convert to Sales Invoices.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center space-x-1.5 px-3.5 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer"
        >
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
          <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
            {quotationStats.acceptedCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Converted to Invoices</div>
        </div>

        {/* Staff Created Quotations Card */}
        <div
          onClick={() => setFilterAuthor((prev) => (prev === 'STAFF' ? 'ALL' : 'STAFF'))}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all shadow-sm ${
            filterAuthor === 'STAFF'
              ? 'bg-sky-100 dark:bg-sky-950/60 border-sky-400 dark:border-sky-600'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
          title="Click to filter quotations created by staff"
        >
          <div className="flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300 font-bold flex items-center space-x-1">
              <span>Created by Staff</span>
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
              {staffQuotations.length} Quotes
            </span>
          </div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
            Rs. {formatIndianCurrency(staffTotalAmount)}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {staffContributors.length > 0 ? staffContributors.join(', ') : 'No staff quotes yet'}
          </div>
        </div>
      </div>

      {/* Staff Activity Alert Banner */}
      {staffQuotations.length > 0 && (
        <div className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-sm">
          <div className="flex items-center space-x-2.5">
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                Staff Activity: {staffQuotations.length} quotation{staffQuotations.length > 1 ? 's' : ''} created by office staff ({staffContributors.join(', ') || 'Staff Workstations'})
              </span>
              <span className="text-slate-600 dark:text-slate-300 ml-2">
                Total value: Rs. {formatIndianCurrency(staffTotalAmount)}. Synced live over office LAN.
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFilterAuthor((prev) => (prev === 'STAFF' ? 'ALL' : 'STAFF'))}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-sm ${
              filterAuthor === 'STAFF'
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold border border-slate-400 dark:border-slate-500 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
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
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold border border-slate-400 dark:border-slate-500 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            All Quotes ({quotations.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterAuthor('STAFF')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center ${
              filterAuthor === 'STAFF'
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold border border-slate-400 dark:border-slate-500 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <span>Staff ({staffQuotations.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterAuthor('HOST')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center ${
              filterAuthor === 'HOST'
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold border border-slate-400 dark:border-slate-500 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
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
              <th className="py-3 px-4 whitespace-nowrap">Quote # (Click to View)</th>
              <th className="py-3 px-4 whitespace-nowrap">Date</th>
              <th className="py-3 px-4 whitespace-nowrap">Valid Until</th>
              <th className="py-3 px-4 whitespace-nowrap">Customer</th>
              <th className="py-3 px-4 whitespace-nowrap">Created By</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Grand Total</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Actions</th>
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
                <tr
                  key={q.id}
                  onClick={() => handleOpenQuotation(q)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4 font-mono font-bold">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenQuotation(q);
                      }}
                      className="font-semibold text-slate-800 dark:text-slate-200 hover:text-brand-600 dark:hover:text-brand-400 cursor-pointer"
                      title="Click to view full quotation"
                    >
                      {q.quotation_number}
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
                    {editingCreatorQuotationId === q.id ? (
                      <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          list="staff-creators-list"
                          value={editingCreatorValue}
                          onChange={(e) => setEditingCreatorValue(e.target.value)}
                          className="w-28 text-xs px-2 py-0.5 border border-brand-500 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCreator(q.id);
                            if (e.key === 'Escape') setEditingCreatorQuotationId(null);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveCreator(q.id)}
                          className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded cursor-pointer"
                          title="Save creator"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCreatorQuotationId(null)}
                          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            getCreatorDisplay(q) === 'Admin / Owner'
                              ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              : 'bg-sky-50 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border-sky-200 dark:border-sky-800'
                          }`}
                          title={isOwnerOrHost ? `Created by: ${getCreatorDisplay(q)} (Click pencil to edit)` : `Created by: ${getCreatorDisplay(q)}`}
                        >
                          <User className="w-3 h-3 mr-1 opacity-70" />
                          <span>{getCreatorDisplay(q)}</span>
                        </span>
                        {isOwnerOrHost && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCreatorQuotationId(q.id);
                              setEditingCreatorValue(getCreatorDisplay(q));
                            }}
                            className="p-1 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Change creator name (Host / Owner only)"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                    {formatIndianCurrency(q.grand_total)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`font-bold text-xs ${
                        q.status === 'ACCEPTED'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : q.status === 'CONVERTED'
                          ? 'text-slate-800 dark:text-slate-200'
                          : q.status === 'REJECTED'
                          ? 'text-rose-700 dark:text-rose-400'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {q.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenQuotation(q)}
                        className="inline-flex items-center space-x-1 px-2 py-1 border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/60 text-brand-700 dark:text-brand-300 rounded text-xs font-semibold transition-colors shadow-xs"
                        title="Open Quotation Details"
                      >
                        <Eye className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                        <span>Open</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrintPdf(q.id, 'DIGITAL_LETTERHEAD');
                        }}
                        className="inline-flex items-center space-x-1 px-2 py-1 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-xs font-semibold transition-colors shadow-xs"
                        title="Open Quotation PDF immediately"
                      >
                        <FileText className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                        <span>PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenQuotation(q)}
                        className="p-1 text-slate-500 hover:text-brand-600"
                        title="View / Print Quotation"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      {q.status !== 'CONVERTED' && isOwnerOrHost && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditQuotation(q);
                          }}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 border border-brand-300 dark:border-brand-700 bg-brand-50/70 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-900/60 text-brand-700 dark:text-brand-300 rounded text-xs font-semibold transition-colors shadow-xs cursor-pointer"
                          title="Edit this quotation (Updates database & archives)"
                        >
                          <Pencil className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                          <span>Edit</span>
                        </button>
                      )}

                      {q.status !== 'CONVERTED' && (
                        <button
                          type="button"
                          onClick={() => handleConvertToInvoice(q.id)}
                          className="inline-flex items-center space-x-1 px-2 py-0.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-[11px] font-semibold shadow-xs"
                          title="Convert quotation to Sales Invoice"
                        >
                          <ArrowRightCircle className="w-3.5 h-3.5" />
                          <span>Convert</span>
                        </button>
                      )}

                      {isOwnerOrHost && (
                        <button
                          type="button"
                          onClick={() => handleDeleteQuotation(q.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Delete Quotation (Host / Owner only)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
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
              <button onClick={() => setViewingQuotation(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
              {/* Template Switcher & Print Toolbar */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-2 flex-1 min-w-[260px]">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5 shrink-0">
                    <FileText className="w-4 h-4 text-brand-600" />
                    <span>Template:</span>
                  </span>
                  <div className="flex-1 max-w-sm">
                    <SearchableSelect
                      options={printTemplateOptions}
                      value={activePrintTemplateId}
                      onChange={(val) => setActivePrintTemplateId(val)}
                      placeholder="Select print template..."
                      size="sm"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handlePrintPdf(viewingQuotation.id, 'DIGITAL_LETTERHEAD')}
                    className="inline-flex items-center space-x-1.5 px-4 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold shadow-xs transition-all"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print / Download PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveLocalCopy(viewingQuotation.id, viewingQuotation.quotation_number)}
                    className="inline-flex items-center space-x-1.5 px-4 py-1.5 border border-brand-300 dark:border-brand-700 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/60 dark:hover:bg-brand-900 text-brand-900 dark:text-brand-200 rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-all"
                    title="Save an extra PDF copy to this computer's local folder"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save to This PC</span>
                  </button>
                </div>
              </div>

              {/* Exact Varun Systems Document Preview */}
              <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-md rounded-xl p-8 max-w-3xl mx-auto space-y-4 text-slate-900 dark:text-slate-100 font-serif">
                {/* Centered Document Title */}
                <div className="text-center">
                  <h1 className="text-lg font-bold tracking-wider underline inline-block">QUOTATION</h1>
                </div>

                {/* Top Details: Recipient on left, Quote No & Date on right */}
                <div className="flex justify-between items-start text-xs pt-2">
                  <div className="space-y-0.5 max-w-[60%]">
                    <div className="font-bold">To,</div>
                    <div className="font-bold text-sm text-slate-950 dark:text-slate-50">{viewingQuotation.customer_name}</div>
                    {viewingQuotation.billing_address && (
                      <div className="text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed">{viewingQuotation.billing_address}</div>
                    )}
                    {viewingQuotation.customer_gstin && (
                      <div className="font-bold pt-0.5">GST Number: <span className="font-mono">{viewingQuotation.customer_gstin}</span></div>
                    )}
                    {viewingQuotation.place_of_supply_state && (
                      <div className="text-slate-600 dark:text-slate-400">State: {viewingQuotation.place_of_supply_state} ({viewingQuotation.place_of_supply_code})</div>
                    )}
                  </div>

                  <div className="text-right space-y-1 text-xs">
                    <div><strong>Quotation No:</strong> <span className="font-mono font-bold">{viewingQuotation.quotation_number}</span></div>
                    <div><strong>Date:</strong> <span>{isoToDisplayDate(viewingQuotation.quotation_date) || viewingQuotation.quotation_date}</span></div>
                    {viewingQuotation.valid_until_date && (
                      <div className="text-slate-500 text-[11px]">Valid Until: {isoToDisplayDate(viewingQuotation.valid_until_date) || viewingQuotation.valid_until_date}</div>
                    )}
                    <div><strong>Prepared By:</strong> <span className="font-semibold text-brand-600 dark:text-brand-400">{getCreatorDisplay(viewingQuotation)}</span></div>
                  </div>
                </div>

                {/* Salutation & Opening Paragraph */}
                <div className="space-y-1 pt-2 text-xs">
                  <div className="font-bold">Dear Sir,</div>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    With the reference to your enquiry, we are herewith quoting our lowest and best possible prices of the following.
                  </p>
                </div>

                {/* Document Table (GST or Non-GST format based on active template) */}
                {activePrintTemplateId === 'builtin-varun-nogst' ? (
                  /* WITHOUT GST TABLE */
                  <div className="border border-slate-800 dark:border-slate-300 rounded overflow-hidden">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 dark:border-slate-300 bg-slate-100 dark:bg-slate-800 font-bold">
                          <th className="py-2 px-1.5 border-r border-slate-800 dark:border-slate-300 text-center w-10">Sl.No</th>
                          <th className="py-2 px-3 border-r border-slate-800 dark:border-slate-300 text-left">Description of Goods</th>
                          <th className="py-2 px-1 border-r border-slate-800 dark:border-slate-300 text-center w-14">Units</th>
                          <th className="py-1 px-2 border-r border-slate-800 dark:border-slate-300 text-center w-20 leading-tight">
                            <div>Base</div>
                            <div>rate</div>
                          </th>
                          <th className="py-1 px-2 text-center w-24 leading-tight">
                            <div>Total</div>
                            <div>Amount</div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300 dark:divide-slate-700">
                        {viewingQuotation.items?.map((it, idx) => (
                          <tr key={idx}>
                            <td className="py-2 px-1.5 border-r border-slate-800 dark:border-slate-300 text-center font-medium">{idx + 1}</td>
                            <td className="py-2 px-3 border-r border-slate-800 dark:border-slate-300 text-left">
                              <div className="font-bold text-slate-900 dark:text-slate-100">{it.item_name}</div>
                              {it.description && <div className="text-[11px] text-slate-500 italic mt-0.5">{it.description}</div>}
                            </td>
                            <td className="py-2 px-1 border-r border-slate-800 dark:border-slate-300 text-center font-medium">{it.quantity} {it.unit || 'NOS'}</td>
                            <td className="py-2 px-2 border-r border-slate-800 dark:border-slate-300 text-right font-mono">{formatIndianCurrency(it.rate)}</td>
                            <td className="py-2 px-2 text-right font-bold font-mono">{formatIndianCurrency(it.line_total)}</td>
                          </tr>
                        ))}

                        {/* TOTAL Row */}
                        <tr className="border-t border-slate-800 dark:border-slate-300 bg-slate-50/70 dark:bg-slate-800/50 font-bold">
                          <td colSpan={4} className="py-2 px-3 border-r border-slate-800 dark:border-slate-300 text-right">TOTAL</td>
                          <td className="py-2 px-2 text-right font-mono">{formatIndianCurrency(viewingTotalOfProducts)}</td>
                        </tr>
                        {/* Round Off Row */}
                        <tr className="border-t border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50">
                          <td colSpan={4} className="py-1.5 px-3 border-r border-slate-800 dark:border-slate-300 text-right font-medium">Round Off</td>
                          <td className="py-1.5 px-2 text-right font-mono">{formatIndianCurrency(viewingQuotation.round_off || '0.00')}</td>
                        </tr>
                        {/* Grand Total Row */}
                        <tr className="border-t-2 border-slate-800 dark:border-slate-300 bg-slate-100 dark:bg-slate-800 font-extrabold text-sm">
                          <td colSpan={4} className="py-2 px-3 border-r border-slate-800 dark:border-slate-300 text-right">Grand Total</td>
                          <td className="py-2 px-2 text-right font-mono text-brand-600 dark:text-brand-400">{formatIndianCurrency(viewingGrandTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* GST FORMAT TABLE (Default matching docx) */
                  <div className="border border-slate-800 dark:border-slate-300 rounded overflow-hidden">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 dark:border-slate-300 bg-slate-100 dark:bg-slate-800 font-bold text-[11px]">
                          <th className="py-2 px-1.5 border-r border-slate-800 dark:border-slate-300 text-center w-9">Sl.No</th>
                          <th className="py-2 px-2.5 border-r border-slate-800 dark:border-slate-300 text-left">Description of Goods</th>
                          <th className="py-2 px-1 border-r border-slate-800 dark:border-slate-300 text-center w-14">Units</th>
                          <th className="py-2 px-2 border-r border-slate-800 dark:border-slate-300 text-right w-18">Base rate</th>
                          <th className="py-2 px-2 border-r border-slate-800 dark:border-slate-300 text-right w-20">Taxable Amount</th>
                          <th className="py-2 px-1 border-r border-slate-800 dark:border-slate-300 text-center w-12">GST %</th>
                          <th className="py-2 px-2 border-r border-slate-800 dark:border-slate-300 text-right w-18">GST Amount</th>
                          <th className="py-2 px-2.5 text-right w-22">Total Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300 dark:divide-slate-700">
                        {viewingQuotation.items?.map((it, idx) => (
                          <tr key={idx}>
                            <td className="py-2 px-1.5 border-r border-slate-800 dark:border-slate-300 text-center font-medium">{idx + 1}</td>
                            <td className="py-2 px-2.5 border-r border-slate-800 dark:border-slate-300 text-left">
                              <div className="font-bold text-slate-900 dark:text-slate-100">{it.item_name}</div>
                              {it.description && <div className="text-[11px] text-slate-500 italic mt-0.5">{it.description}</div>}
                            </td>
                            <td className="py-2 px-1 border-r border-slate-800 dark:border-slate-300 text-center font-medium">{it.quantity} {it.unit || 'NOS'}</td>
                            <td className="py-2 px-2 border-r border-slate-800 dark:border-slate-300 text-right font-mono">{formatIndianCurrency(it.rate)}</td>
                            <td className="py-2 px-2 border-r border-slate-800 dark:border-slate-300 text-right font-mono">{formatIndianCurrency(it.taxable_value)}</td>
                            <td className="py-2 px-1 border-r border-slate-800 dark:border-slate-300 text-center font-medium">{it.gst_rate}%</td>
                            <td className="py-2 px-2 border-r border-slate-800 dark:border-slate-300 text-right font-mono">{formatIndianCurrency(it.total_tax)}</td>
                            <td className="py-2 px-2.5 text-right font-bold font-mono">{formatIndianCurrency(it.line_total)}</td>
                          </tr>
                        ))}

                        {/* TOTAL Row */}
                        <tr className="border-t border-slate-800 dark:border-slate-300 bg-slate-50/70 dark:bg-slate-800/50 font-bold">
                          <td colSpan={7} className="py-2 px-3 border-r border-slate-800 dark:border-slate-300 text-right">TOTAL</td>
                          <td className="py-2 px-2.5 text-right font-mono">{formatIndianCurrency(viewingTotalOfProducts)}</td>
                        </tr>
                        {/* Round Off Row */}
                        <tr className="border-t border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50">
                          <td colSpan={7} className="py-1.5 px-3 border-r border-slate-800 dark:border-slate-300 text-right font-medium">Round Off</td>
                          <td className="py-1.5 px-2.5 text-right font-mono">{formatIndianCurrency(viewingQuotation.round_off || '0.00')}</td>
                        </tr>
                        {/* Grand Total Row */}
                        <tr className="border-t-2 border-slate-800 dark:border-slate-300 bg-slate-100 dark:bg-slate-800 font-extrabold text-sm">
                          <td colSpan={7} className="py-2 px-3 border-r border-slate-800 dark:border-slate-300 text-right">Grand Total</td>
                          <td className="py-2 px-2.5 text-right font-mono text-brand-600 dark:text-brand-400">{formatIndianCurrency(viewingGrandTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Amount in Words */}
                {viewingQuotation.amount_in_words && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                    Amount Chargeable (in words): <strong>{viewingQuotation.amount_in_words}</strong>
                  </div>
                )}

                {/* Terms & Conditions */}
                <div className="pt-2 text-xs space-y-1.5">
                  <div className="font-bold underline text-slate-900 dark:text-slate-100">
                    Terms &amp; Conditions:
                  </div>
                  <div className="pl-3 space-y-1 text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed font-sans">
                    {viewingQuotation.terms_and_conditions || viewingQuotation.terms_conditions || 'No warranty for burn / Physical Damage.'}
                  </div>
                  {viewingQuotation.notes && (
                    <div className="pt-1 text-[11px] text-slate-500 italic">
                      Notes: {viewingQuotation.notes}
                    </div>
                  )}
                  <div className="text-slate-600 dark:text-slate-400 pt-2 font-medium">
                    {viewingQuotation.closing_text || 'Thanking you and assuring of our best services and attention at all times.'}
                  </div>
                </div>

                {/* Bank Details & PAN Series */}
                <div className="pt-3 text-xs space-y-1 text-slate-800 dark:text-slate-200 font-sans">
                  <div className="grid grid-cols-[120px_1fr] max-w-sm">
                    <span className="font-bold">PAN Number :</span>
                    <span className="font-mono">{companyInfo?.pan || (companyInfo?.gstin && companyInfo.gstin.length >= 12 ? companyInfo.gstin.slice(2, 12) : '') || ''}</span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] max-w-sm">
                    <span className="font-bold">Bank Name :</span>
                    <span>{companyInfo?.bank_name || ''}</span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] max-w-sm">
                    <span className="font-bold">Account Number :</span>
                    <span className="font-mono">{companyInfo?.bank_account_no || ''}</span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] max-w-sm">
                    <span className="font-bold">IFSC Code :</span>
                    <span className="font-mono">{companyInfo?.bank_ifsc || ''}</span>
                  </div>
                  <div className="grid grid-cols-[130px_1fr] max-w-sm">
                    <span className="font-bold">Branch Address :</span>
                    <span>{companyInfo?.bank_branch || ''}</span>
                  </div>
                </div>

                {/* Sign-off */}
                <div className="flex justify-end pt-4 pb-2 text-xs">
                  <div className="text-right space-y-8 min-w-[200px]">
                    <div>Yours truly,</div>
                    <div>
                      <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 tracking-wide">
                        {viewingQuotation.sign_off_company || (companyInfo?.name ? `For ${companyInfo.name.toUpperCase()}.` : 'For VARUN SYSTEMS.')}
                      </div>
                      <div className="text-[10px] text-slate-400 font-sans">[ Authorized Signatory ]</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div>
                {isOwnerOrHost && (
                  <button
                    type="button"
                    onClick={() => handleDeleteQuotation(viewingQuotation.id)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-rose-300 text-rose-600 hover:bg-rose-50 rounded text-xs font-bold transition-colors cursor-pointer"
                    title="Delete Quotation (Host / Owner only)"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Quotation</span>
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {viewingQuotation.status !== 'CONVERTED' && isOwnerOrHost && (
                  <button
                    type="button"
                    onClick={() => {
                      const toEdit = viewingQuotation;
                      setViewingQuotation(null);
                      handleEditQuotation(toEdit);
                    }}
                    className="inline-flex items-center space-x-1.5 px-4 py-1.5 border border-brand-300 dark:border-brand-700 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/60 dark:hover:bg-brand-900 text-brand-900 dark:text-brand-200 rounded text-xs font-semibold shadow-xs cursor-pointer transition-all"
                    title="Edit this quotation details"
                  >
                    <Pencil className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                    <span>Edit Quotation</span>
                  </button>
                )}

                {viewingQuotation.status !== 'CONVERTED' && (
                  <button
                    type="button"
                    onClick={() => handleConvertToInvoice(viewingQuotation.id)}
                    className="inline-flex items-center space-x-1 px-4 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-xs font-semibold shadow-xs"
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
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <span>
                  {editingQuotation
                    ? `Edit Commercial Quotation: ${editingQuotation.quotation_number}`
                    : 'Create Commercial Quotation'}
                </span>
              </h2>
              <button onClick={closeCreateModal} className="text-slate-400 hover:text-slate-600 cursor-pointer" title="Close window (Esc)">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Customer *</label>
                    <button
                      type="button"
                      onClick={() => setIsQuickAddCustomerOpen(true)}
                      className="text-xs text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white font-semibold cursor-pointer"
                    >
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
                    placeholder="Search customer by name or GST Number..."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Quote Date</label>
                  </div>
                  <DateInput
                    value={quoteDate}
                    onChange={(val) => setQuoteDate(val)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Valid Until Date</label>
                  </div>
                  <DateInput
                    value={validUntil}
                    onChange={(val) => setValidUntil(val)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Print Template Selection for new quotation */}
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

                {/* Created By (Staff / Owner) */}
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
                      <User className="w-3.5 h-3.5 text-sky-600" />
                      <span>Created By (Staff / Owner)</span>
                      {!isOwnerOrHost && (
                        <span className="text-[10px] text-slate-400 font-normal ml-1">
                          (Locked to your profile)
                        </span>
                      )}
                    </label>
                  </div>
                  <input
                    type="text"
                    list={isOwnerOrHost ? 'staff-creators-list' : undefined}
                    value={creatorName}
                    readOnly={!isOwnerOrHost}
                    disabled={!isOwnerOrHost}
                    onChange={(e) => isOwnerOrHost && setCreatorName(e.target.value)}
                    placeholder="e.g. Veer, Sandhya, Admin / Owner"
                    className={`w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-semibold outline-none ${
                      isOwnerOrHost
                        ? 'bg-white dark:bg-slate-700 font-semibold focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 dark:text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                    }`}
                  />
                  {isOwnerOrHost && (
                    <datalist id="staff-creators-list">
                      {availableStaffNames.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  )}
                </div>
              </div>

              {/* 8-Column GST Quotation Table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-visible">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="p-2 w-10 text-center">#</th>
                      <th className="p-2">Description of Goods</th>
                      <th className="p-2 w-16 text-center">Units</th>
                      <th className="p-2 w-28 text-right">Base rate (₹)</th>
                      <th className="p-2 w-28 text-right">Taxable (₹)</th>
                      <th className="p-2 w-20 text-center">GST %</th>
                      <th className="p-2 w-24 text-right">GST (₹)</th>
                      <th className="p-2 w-28 text-right">Total (₹)</th>
                      <th className="p-2 w-12 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((item, idx) => {
                      const lineCalc = previewCalculatedLines[idx] || {
                        taxableValue: '0.00',
                        totalTax: '0.00',
                        lineTotal: '0.00',
                      };
                      const isUnsavedCustom = !item.item_id && Boolean(item.item_name?.trim());

                      return (
                        <tr key={idx}>
                          <td className="p-2 text-center font-mono font-bold text-slate-400 text-xs align-top pt-3">
                            {idx + 1}
                          </td>
                          <td className="p-2 align-top">
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
                                  is_custom: true,
                                };
                                setItems(copy);
                              }}
                              placeholder="Select product or enter description..."
                              size="sm"
                            />
                            <textarea
                              rows={2}
                              placeholder="Specifications / warranty details (e.g. 1 Year Warranty, Intel i5, 16GB RAM...)"
                              value={item.description || ''}
                              onChange={(e) => {
                                const copy = [...items];
                                copy[idx].description = e.target.value;
                                setItems(copy);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-xs bg-slate-50 dark:bg-slate-700/60 mt-1 font-sans"
                            />
                          </td>
                          <td className="p-2 align-top pt-2.5">
                            <input
                              type="text"
                              placeholder="01"
                              value={item.units || item.quantity || '01'}
                              onChange={(e) => {
                                const val = e.target.value;
                                const copy = [...items];
                                copy[idx].units = val;
                                const num = parseFloat(val);
                                copy[idx].quantity = !isNaN(num) && num > 0 ? String(num) : '1';
                                setItems(copy);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-600 rounded px-1.5 py-1 text-center text-xs font-mono bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                            />
                          </td>
                          <td className="p-2 align-top pt-2.5">
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
                                          : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100'
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
                          <td className="p-2 text-right font-mono text-xs text-slate-700 dark:text-slate-300 align-top pt-3">
                            {formatIndianCurrency(lineCalc.taxableValue)}
                          </td>
                          <td className="p-2 align-top pt-2.5">
                            <select
                              value={item.gst_rate}
                              onChange={(e) => {
                                const copy = [...items];
                                copy[idx].gst_rate = e.target.value;
                                setItems(copy);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-600 rounded px-1.5 py-1 bg-white dark:bg-slate-700 text-xs"
                            >
                              {GST_RATES.map((rate) => (
                                <option key={rate} value={rate}>
                                  {rate}%
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 text-right font-mono text-xs text-slate-700 dark:text-slate-300 align-top pt-3">
                            {formatIndianCurrency(lineCalc.totalTax)}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-xs text-slate-800 dark:text-slate-200 align-top pt-3">
                            {formatIndianCurrency(lineCalc.lineTotal)}
                          </td>
                          <td className="p-2 text-center align-top pt-2.5">
                            <div className="flex items-center justify-center space-x-1">
                              {isUnsavedCustom && (
                                <button
                                  type="button"
                                  disabled={savingToCatalogIdx === idx}
                                  onClick={() => handleSaveCustomItemToCatalog(idx)}
                                  className="text-brand-600 hover:text-brand-800 dark:text-brand-400 p-1 rounded hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"
                                  title="Save item to Products Catalog"
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

              {/* Standard Add Row & Totals summary */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => handleAddItem(false)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer"
                    title="Add new item row (Shortcut: Ctrl +)"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item Row</span>
                    <kbd className="ml-1 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400">
                      Ctrl +
                    </kbd>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-50 dark:bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                  <span className="text-slate-500">Taxable: <strong className="text-slate-800 dark:text-slate-200">{formatIndianCurrency(previewDocTotals.totalTaxableValue)}</strong></span>
                  <span className="text-slate-500">GST: <strong className="text-slate-800 dark:text-slate-200">{formatIndianCurrency(previewDocTotals.totalTax)}</strong></span>
                  <span className="text-slate-700 dark:text-slate-200">TOTAL: <strong className="text-slate-900 dark:text-slate-100 font-bold font-mono">{formatIndianCurrency(previewDocTotals.totalProductsAmount)}</strong></span>
                  
                  {/* Custom Round Off */}
                  <div className="flex items-center space-x-1.5 bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 shadow-sm">
                    <span className="text-slate-600 dark:text-slate-300 font-semibold text-[11px] whitespace-nowrap">
                      Round Off:
                    </span>
                    <div className="flex items-center">
                      <span className="text-slate-400 text-[11px] mr-1 font-mono">₹</span>
                      <input
                        type="text"
                        value={customRoundOff}
                        onChange={(e) => setCustomRoundOff(e.target.value)}
                        placeholder="0.00"
                        className="w-16 h-6 px-1.5 text-right font-mono text-xs border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-500 font-semibold"
                        title="Enter custom round off amount (e.g. +15, -0.50, or 0. Defaults to 0.00)"
                      />
                    </div>
                  </div>

                  <span className="text-slate-500">Grand Total: <strong className="text-brand-600 dark:text-brand-400 text-sm font-bold font-mono">{formatIndianCurrency(previewDocTotals.grandTotal)}</strong></span>
                </div>
              </div>

              {/* Physical Letterhead Clearance & Terms */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Pre-Printed Letterhead Clearance (mm)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500">Top Header Margin (mm):</span>
                      <input
                        type="number"
                        min="0"
                        max="120"
                        value={topMarginMm}
                        onChange={(e) => setTopMarginMm(Number(e.target.value) || 55)}
                        className="w-full border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs font-mono bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Bottom Footer Margin (mm):</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={bottomMarginMm}
                        onChange={(e) => setBottomMarginMm(Number(e.target.value) || 32)}
                        className="w-full border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs font-mono bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Default 55mm top / 32mm bottom leaves exact clearance for physical printed stationery.
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300">
                      Terms &amp; Conditions (Varun Systems)
                    </label>
                    <button
                      type="button"
                      onClick={() => setTermsAndConditions(companyDefaultTerms || DEFAULT_VARUN_TERMS)}
                      className="text-[11px] text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-semibold cursor-pointer"
                      title="Reset terms to Settings defaults"
                    >
                      Reset to Settings Default
                    </button>
                  </div>
                  <textarea
                    rows={8}
                    value={termsAndConditions}
                    onChange={(e) => setTermsAndConditions(e.target.value)}
                    placeholder="Enter quotation terms and conditions..."
                    className="w-full border border-slate-300 dark:border-slate-600 rounded p-2 text-xs font-mono leading-relaxed bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Pre-filled from Settings. You can edit, add, or delete points for this quotation. All points print on the quotation.
                  </p>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Quotation Notes &amp; Scope of Work
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Payment within 30 days, delivery at site."
                  className="w-full border border-slate-300 dark:border-slate-600 rounded p-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end space-x-2">
              <button
                type="button"
                onClick={closeCreateModal}
                className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Cancel and close window (Esc)"
              >
                Cancel (Esc)
              </button>
              <button
                type="button"
                onClick={handleCreateQuotation}
                className="px-4 py-1.5 border border-brand-300 dark:border-brand-700 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-semibold shadow-xs cursor-pointer transition-colors"
              >
                {editingQuotation ? 'Update Quotation & Save Changes' : 'Create Quotation'}
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
