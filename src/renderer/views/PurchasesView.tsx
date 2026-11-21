// src/renderer/views/PurchasesView.tsx - Purchase Orders & Vendor Bills
import React, { useState, useEffect, useMemo } from 'react';
import Decimal from 'decimal.js';
import { PurchaseInvoice, Supplier, Product, Warehouse, Category, Unit } from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import { GST_RATES } from '../../shared/constants';
import { SearchableSelect } from '../components/SearchableSelect';
import { ModalPortal } from '../components/ModalPortal';
import { DateInput, isoToDisplayDate } from '../components/DateInput';
import { QuickAddSupplierModal } from '../components/QuickAddSupplierModal';
import {
  ShoppingCart,
  Plus,
  Search,
  CheckCircle2,
  Trash2,
  X,
  PackageCheck,
  Package,
  Tags,
  Warehouse as WarehouseIcon,
  Edit2,
  Clock,
} from 'lucide-react';

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

function getPurchaseDaysRemaining(bill: PurchaseInvoice, fallbackTermsDays = 0): { daysLeft: number; dueDateStr: string } | null {
  const billPart = (bill.bill_date || '').split('T')[0];
  const duePart = (bill.due_date || '').split('T')[0];
  let effectiveDue = duePart;
  if ((!duePart || duePart <= billPart) && billPart && fallbackTermsDays > 0) {
    effectiveDue = addDaysIso(billPart, fallbackTermsDays);
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

interface Props {
  companyId: string;
}

export const PurchasesView: React.FC<Props> = ({ companyId }) => {
  const [bills, setBills] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [viewingBill, setViewingBill] = useState<PurchaseInvoice | null>(null);
  const [isWarehouseManagerOpen, setIsWarehouseManagerOpen] = useState<boolean>(false);
  const [whForm, setWhForm] = useState<Partial<Warehouse> | null>(null);

  // Quick New Product Modal State
  const [isQuickProductOpen, setIsQuickProductOpen] = useState<boolean>(false);
  const [quickProductTargetIdx, setQuickProductTargetIdx] = useState<number | null>(null);
  const [quickProduct, setQuickProduct] = useState<{
    name: string;
    hsn_or_sac: string;
    category_id: string;
    unit: string;
    purchase_price: string;
    min_selling_price: string;
    max_selling_price: string;
    gst_rate: string;
    minimum_stock: string;
    sku: string;
  }>({
    name: '',
    hsn_or_sac: '',
    category_id: '',
    unit: 'NOS',
    purchase_price: '',
    min_selling_price: '',
    max_selling_price: '',
    gst_rate: '18.00',
    minimum_stock: '',
    sku: '',
  });
  const [isQuickInlineCatOpen, setIsQuickInlineCatOpen] = useState<boolean>(false);
  const [quickInlineCatName, setQuickInlineCatName] = useState<string>('');

  // Form State
  const [isQuickAddSupplierOpen, setIsQuickAddSupplierOpen] = useState<boolean>(false);
  const [companyDefaultState, setCompanyDefaultState] = useState<string>('Telangana');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [billNumber, setBillNumber] = useState<string>('');
  const [billDate, setBillDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [receiveImmediately, setReceiveImmediately] = useState<boolean>(true);
  const [overallDiscountType, setOverallDiscountType] = useState<'AMOUNT' | 'PERCENTAGE'>('AMOUNT');
  const [overallDiscountValue, setOverallDiscountValue] = useState<string>('');
  const [items, setItems] = useState<any[]>([
    {
      product_id: '',
      item_name: '',
      hsn_code: '',
      unit: 'NOS',
      quantity: '',
      rate: '',
      min_selling_price: '',
      max_selling_price: '',
      gst_rate: '18.00',
    },
  ]);

  const supplierOptions = useMemo(() => {
    return [
      { value: '', label: '-- Select Vendor --' },
      {
        value: '__ADD_NEW_SUPPLIER__',
        label: '+ Add New Supplier',
        sublabel: 'Quickly create vendor record',
        isAction: true,
      },
      ...suppliers.map((s) => ({
        value: s.id,
        label: s.name,
        code: s.gstin || undefined,
        sublabel: s.company_name ? s.company_name : undefined,
      })),
    ];
  }, [suppliers]);

  const productOptions = useMemo(() => {
    return [
      ...products.map((p) => ({
        value: p.id,
        label: p.name,
        sublabel: `${formatIndianCurrency(p.purchase_price || p.selling_price)}`,
        badge: p.unit || undefined,
        code: p.hsn_or_sac || undefined,
      })),
      { value: '__NEW__', label: '+ Create New Product...', isAction: true },
    ];
  }, [products]);

  const categoryOptions = useMemo(() => {
    return [
      { value: '', label: '-- No Category --' },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ];
  }, [categories]);

  const unitOptions = useMemo(() => {
    return units.map((u) => ({
      value: u.code,
      label: `${u.name} (${u.code})`,
      code: u.code,
    }));
  }, [units]);

  const compactUnitOptions = useMemo(() => {
    return units.map((u) => ({
      value: u.code,
      label: u.code,
      sublabel: u.name,
    }));
  }, [units]);

  // Live Bill Totals & Overall Discount Calculation (Strict Decimal Arithmetic)
  const billTotals = useMemo(() => {
    const parseNonNeg = (val: any): Decimal => {
      if (val === null || val === undefined || String(val).trim() === '') return new Decimal(0);
      try {
        const d = new Decimal(val);
        return d.isFinite() && d.gt(0) ? d : new Decimal(0);
      } catch {
        return new Decimal(0);
      }
    };

    let subtotal = new Decimal(0);
    let totalTax = new Decimal(0);

    for (const it of items) {
      const qty = parseNonNeg(it.quantity);
      const rate = parseNonNeg(it.rate);
      const gstRate = parseNonNeg(it.gst_rate ?? '18.00');
      const taxable = qty.mul(rate);
      const tax = taxable.mul(gstRate).div(100);
      subtotal = subtotal.add(taxable);
      totalTax = totalTax.add(tax);
    }

    subtotal = subtotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    totalTax = totalTax.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const grossTotal = subtotal.add(totalTax).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const rawDisc = parseNonNeg(overallDiscountValue);
    let discountAmount = new Decimal(0);
    let discountPercentage = new Decimal(0);
    let isDiscountCapped = false;

    if (overallDiscountType === 'PERCENTAGE') {
      if (rawDisc.gt(100)) isDiscountCapped = true;
      discountPercentage = Decimal.min(new Decimal(100), rawDisc).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      discountAmount = grossTotal
        .mul(discountPercentage)
        .div(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    } else {
      if (grossTotal.gt(0) && rawDisc.gt(grossTotal)) isDiscountCapped = true;
      discountAmount = Decimal.min(grossTotal, rawDisc).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      discountPercentage = grossTotal.gt(0)
        ? discountAmount.div(grossTotal).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        : new Decimal(0);
    }

    const netTotal = Decimal.max(0, grossTotal.sub(discountAmount)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      subtotal: subtotal.toFixed(2),
      totalTax: totalTax.toFixed(2),
      grossTotal: grossTotal.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      discountPercentage: discountPercentage.toFixed(2),
      netTotal: netTotal.toFixed(2),
      hasDiscount: discountAmount.gt(0),
      isDiscountCapped,
    };
  }, [items, overallDiscountType, overallDiscountValue]);

  useEffect(() => {
    if (companyId) {
      loadBills();
      loadMaster();
    }
  }, [companyId]);

  // Automatically calculate Due Date from Bill Date + Supplier's Payment Reminder Days
  useEffect(() => {
    const sup = suppliers.find((s) => s.id === selectedSupplierId);
    const terms = sup?.payment_terms_days || 0;
    if (billDate) {
      setDueDate(terms > 0 ? addDaysIso(billDate, terms) : billDate);
    }
  }, [selectedSupplierId, billDate, suppliers]);

  const loadBills = async () => {
    setLoading(true);
    try {
      const data = await api.getPurchaseInvoices(companyId);
      setBills(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMaster = async () => {
    try {
      const [sList, pList, wList, cList, uList, comp] = await Promise.all([
        api.getSuppliers(companyId),
        api.getProducts(companyId, { item_type: 'PRODUCT' }),
        api.getWarehouses(companyId),
        api.getCategories(companyId),
        api.getUnits(companyId),
        api.getCompany(companyId).catch(() => null),
      ]);
      setSuppliers(sList);
      setProducts(pList);
      setWarehouses(wList);
      setCategories(cList);
      setUnits(uList);
      if (comp?.state) {
        setCompanyDefaultState(comp.state);
      }
      if (wList.length > 0 && (!selectedWarehouseId || !wList.some((w) => w.id === selectedWarehouseId))) {
        const def = wList.find((w) => w.is_default) || wList[0];
        setSelectedWarehouseId(def.id);
      } else if (wList.length === 0) {
        setSelectedWarehouseId('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveWarehouse = async () => {
    if (!whForm?.name?.trim()) {
      alert('Warehouse name is required');
      return;
    }
    try {
      if (whForm.id) {
        await api.updateWarehouse(companyId, whForm.id, whForm);
      } else {
        const created = await api.createWarehouse(companyId, whForm);
        setSelectedWarehouseId(created.id);
      }
      setWhForm(null);
      await loadMaster();
    } catch (err: any) {
      alert(err.message || 'Error saving warehouse');
    }
  };

  const handleDeleteWarehouse = async (wh: Warehouse) => {
    if (!window.confirm(`Delete warehouse "${wh.name}" (${wh.code})?`)) return;
    try {
      await api.deleteWarehouse(companyId, wh.id);
      await loadMaster();
    } catch (err: any) {
      alert(err.message || 'Could not delete warehouse');
    }
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        product_id: '',
        item_name: '',
        hsn_code: '',
        unit: 'NOS',
        quantity: '',
        rate: '',
        min_selling_price: '',
        max_selling_price: '',
        gst_rate: '18.00',
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleOpenQuickProduct = (rowIndex: number | null) => {
    const existingRow = rowIndex !== null ? items[rowIndex] : null;
    setQuickProductTargetIdx(rowIndex);
    setQuickProduct({
      name: existingRow?.item_name || '',
      hsn_or_sac: existingRow?.hsn_code || '',
      category_id: '',
      unit: existingRow?.unit || 'NOS',
      purchase_price: existingRow?.rate || '',
      min_selling_price: '',
      max_selling_price: '',
      gst_rate: existingRow?.gst_rate || '18.00',
      minimum_stock: '',
      sku: '',
    });
    setIsQuickInlineCatOpen(false);
    setQuickInlineCatName('');
    setIsQuickProductOpen(true);
  };

  const handleCreateQuickInlineCategory = async () => {
    const trimmed = quickInlineCatName.trim();
    if (!trimmed) {
      setIsQuickInlineCatOpen(false);
      return;
    }
    const existing = categories.find((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setQuickProduct((prev) => ({ ...prev, category_id: existing.id }));
      setQuickInlineCatName('');
      setIsQuickInlineCatOpen(false);
      return;
    }
    try {
      const created = await api.createCategory(companyId, trimmed, '');
      const updatedCats = await api.getCategories(companyId);
      setCategories(updatedCats);
      setQuickProduct((prev) => ({ ...prev, category_id: created.id }));
      setQuickInlineCatName('');
      setIsQuickInlineCatOpen(false);
    } catch (err: any) {
      alert(err.message || 'Error creating category');
    }
  };

  const handleSaveQuickProduct = async () => {
    if (!quickProduct.name.trim()) {
      alert('Product name is required');
      return;
    }
    const minPriceStr = quickProduct.min_selling_price.trim();
    const maxPriceStr = quickProduct.max_selling_price.trim();
    if (minPriceStr && maxPriceStr && new Decimal(minPriceStr).gt(new Decimal(maxPriceStr))) {
      alert('Minimum Selling Price cannot be greater than Maximum Selling Price.');
      return;
    }
    const effectiveSellingPrice =
      maxPriceStr || minPriceStr || quickProduct.purchase_price.trim() || '0.00';

    try {
      const created = await api.createProduct(companyId, {
        item_type: 'PRODUCT',
        name: quickProduct.name.trim(),
        hsn_or_sac: quickProduct.hsn_or_sac.trim(),
        category_id: quickProduct.category_id || undefined,
        unit: quickProduct.unit || 'NOS',
        purchase_price: quickProduct.purchase_price.trim() || '0.00',
        selling_price: effectiveSellingPrice,
        min_selling_price: minPriceStr || null,
        max_selling_price: maxPriceStr || null,
        gst_rate: quickProduct.gst_rate || '18.00',
        minimum_stock: quickProduct.minimum_stock.trim() || '0.00',
        sku: quickProduct.sku.trim() || undefined,
        current_stock: '0.00',
        is_active: true,
      });
      setProducts((prev) => [...prev, created]);

      const rateVal = Number(created.purchase_price) > 0 ? created.purchase_price : '';
      const emptyIdx =
        quickProductTargetIdx !== null && items[quickProductTargetIdx]
          ? quickProductTargetIdx
          : items.findIndex((it) => !it.product_id && !it.item_name?.trim());

      if (emptyIdx !== -1 && items[emptyIdx]) {
        const copy = [...items];
        copy[emptyIdx] = {
          ...copy[emptyIdx],
          product_id: created.id,
          item_name: created.name,
          hsn_code: created.hsn_or_sac,
          unit: created.unit || 'NOS',
          rate: rateVal || copy[emptyIdx].rate || '',
          min_selling_price: created.min_selling_price || '',
          max_selling_price: created.max_selling_price || '',
          gst_rate: created.gst_rate,
        };
        setItems(copy);
      } else {
        setItems([
          ...items,
          {
            product_id: created.id,
            item_name: created.name,
            hsn_code: created.hsn_or_sac,
            unit: created.unit || 'NOS',
            quantity: '',
            rate: rateVal,
            min_selling_price: created.min_selling_price || '',
            max_selling_price: created.max_selling_price || '',
            gst_rate: created.gst_rate,
          },
        ]);
      }

      setIsQuickProductOpen(false);
      setQuickProductTargetIdx(null);
    } catch (err: any) {
      alert(err.message || 'Error creating product');
    }
  };

  const handleProductSelect = (index: number, productId: string) => {
    if (productId === '__NEW__') {
      handleOpenQuickProduct(index);
      return;
    }
    if (!productId) {
      const copy = [...items];
      copy[index] = {
        ...copy[index],
        product_id: '',
      };
      setItems(copy);
      return;
    }

    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    const copy = [...items];
    const legacySelling =
      !prod.min_selling_price && !prod.max_selling_price && Number(prod.selling_price) > 0
        ? prod.selling_price
        : '';
    copy[index] = {
      ...copy[index],
      product_id: prod.id,
      item_name: prod.name,
      hsn_code: prod.hsn_or_sac,
      rate: Number(prod.purchase_price || prod.selling_price) > 0 ? (prod.purchase_price || prod.selling_price) : '',
      min_selling_price: prod.min_selling_price || legacySelling,
      max_selling_price: prod.max_selling_price || '',
      gst_rate: prod.gst_rate,
      unit: prod.unit || 'NOS',
    };
    setItems(copy);
  };

  const handleCreateBill = async () => {
    const sup = suppliers.find((s) => s.id === selectedSupplierId);
    if (!sup) {
      alert('Please select a supplier');
      return;
    }
    if (!selectedWarehouseId) {
      alert('Please select a receiving warehouse');
      return;
    }
    if (!billNumber.trim()) {
      alert('Please enter the Vendor Bill #');
      return;
    }
    const validItems = items.filter((it) => it.item_name && it.item_name.trim() !== '');
    if (validItems.length === 0) {
      alert('Please select or enter at least one product.');
      return;
    }
    const invalidQty = validItems.find((it) => !it.quantity || Number(it.quantity) <= 0);
    if (invalidQty) {
      alert(`Please enter a valid quantity for "${invalidQty.item_name}".`);
      return;
    }

    for (const it of validItems) {
      const minStr = String(it.min_selling_price ?? '').trim();
      const maxStr = String(it.max_selling_price ?? '').trim();
      if (minStr && maxStr && new Decimal(minStr).gt(new Decimal(maxStr))) {
        alert(`Minimum Selling Price cannot be greater than Maximum Selling Price for "${it.item_name}".`);
        return;
      }
    }

    setSaving(true);
    try {
      // Auto-create any newly entered products and sync Min/Max Selling Price back to Products catalog
      const existingProductsMap = new Map<string, Product>(
        products.map((p) => [p.name.trim().toLowerCase(), p])
      );
      const resolvedItems = [];
      for (const it of validItems) {
        let productId = it.product_id || undefined;
        const minStr = String(it.min_selling_price ?? '').trim();
        const maxStr = String(it.max_selling_price ?? '').trim();
        const effectiveSelling = maxStr || minStr || it.rate || '0.00';

        if (!productId) {
          const cleanName = it.item_name.trim();
          const matched = existingProductsMap.get(cleanName.toLowerCase());
          if (matched) {
            productId = matched.id;
          } else {
            const createdProd = await api.createProduct(companyId, {
              item_type: 'PRODUCT',
              name: cleanName,
              hsn_or_sac: (it.hsn_code || '').trim(),
              unit: (it.unit || 'NOS').trim().toUpperCase() || 'NOS',
              purchase_price: it.rate || '0.00',
              selling_price: effectiveSelling,
              min_selling_price: minStr || null,
              max_selling_price: maxStr || null,
              gst_rate: it.gst_rate || '18.00',
              current_stock: '0.00',
              is_active: true,
            });
            productId = createdProd.id;
            existingProductsMap.set(cleanName.toLowerCase(), createdProd);
          }
        } else if (minStr || maxStr) {
          await api.updateProduct(companyId, productId, {
            unit: (it.unit || 'NOS').trim().toUpperCase() || 'NOS',
            selling_price: effectiveSelling,
            min_selling_price: minStr || null,
            max_selling_price: maxStr || null,
          });
        }
        resolvedItems.push({
          ...it,
          product_id: productId,
          item_name: it.item_name.trim(),
          unit: (it.unit || 'NOS').trim().toUpperCase() || 'NOS',
          quantity: it.quantity || '1',
          rate: it.rate || '0.00',
        });
      }

      const trimmedDisc = overallDiscountValue.trim();
      const createdBill = await api.createPurchaseInvoice(companyId, {
        supplier_id: sup.id,
        supplier_name: sup.name,
        supplier_gstin: sup.gstin,
        warehouse_id: selectedWarehouseId,
        bill_number: billNumber.trim(),
        bill_date: billDate,
        due_date: dueDate,
        overall_discount_type: overallDiscountType,
        overall_discount_percentage: overallDiscountType === 'PERCENTAGE' ? (trimmedDisc || '0.00') : '0.00',
        overall_discount_amount: overallDiscountType === 'AMOUNT' ? (trimmedDisc || '0.00') : billTotals.discountAmount,
        items: resolvedItems,
      });

      if (receiveImmediately && createdBill?.id) {
        await api.finalizePurchaseInvoice(companyId, createdBill.id);
      }

      setIsModalOpen(false);
      resetForm();
      await Promise.all([loadBills(), loadMaster()]);
    } catch (err: any) {
      alert(err.message || 'Error creating purchase bill');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizeBill = async (billId: string) => {
    if (!window.confirm('Finalize this purchase bill? Stock will be received into warehouse and supplier balance updated.')) {
      return;
    }
    try {
      await api.finalizePurchaseInvoice(companyId, billId);
      await loadBills();
    } catch (err: any) {
      alert(err.message || 'Failed to finalize purchase');
    }
  };

  const handleDeleteBill = async (bill: PurchaseInvoice) => {
    const confirmMsg = bill.is_finalized
      ? `Delete finalized purchase bill "${bill.bill_number}"?\n\nThis will reverse the stock received into warehouse, inventory ledger transactions, supplier payable balance, and any linked payment allocations.`
      : `Are you sure you want to delete draft purchase bill "${bill.bill_number}"?`;
    if (!window.confirm(confirmMsg)) {
      return;
    }
    try {
      await api.deletePurchaseInvoice(companyId, bill.id);
      if (viewingBill?.id === bill.id) setViewingBill(null);
      await Promise.all([loadBills(), loadMaster()]);
      alert('Purchase bill deleted successfully.');
    } catch (err: any) {
      alert(err.message || 'Failed to delete purchase bill');
    }
  };

  const resetForm = () => {
    setSelectedSupplierId('');
    setBillNumber('');
    setReceiveImmediately(true);
    setOverallDiscountType('AMOUNT');
    setOverallDiscountValue('');
    setItems([
      {
        product_id: '',
        item_name: '',
        hsn_code: '',
        unit: 'NOS',
        quantity: '',
        rate: '',
        min_selling_price: '',
        max_selling_price: '',
        gst_rate: '18.00',
      },
    ]);
  };

  const filtered = bills.filter((b) => {
    if (searchQuery) {
      const s = searchQuery.toLowerCase();
      return b.bill_number.toLowerCase().includes(s) || b.supplier_name.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
            <ShoppingCart className="w-5 h-5 text-brand-600" />
            <span>Purchases & Vendor Invoices</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Record supplier bills, inward stock movements, and accounts payable
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => {
              setWhForm(null);
              setIsWarehouseManagerOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold shadow-sm transition-all"
          >
            <WarehouseIcon className="w-4 h-4 text-brand-600" />
            <span>Warehouses ({warehouses.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setBillNumber('');
              setOverallDiscountType('AMOUNT');
              setOverallDiscountValue('');
              setIsModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Purchase Bill</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
        <div className="relative w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search bill #, vendor name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Bill #</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Supplier</th>
              <th className="py-3 px-4 text-right">Total (After GST)</th>
              <th className="py-3 px-4 text-right">Discount</th>
              <th className="py-3 px-4 text-right">Grand Total</th>
              <th className="py-3 px-4 text-right">Balance Due</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-center">Inward Stock Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400">
                  No purchase bills recorded. Click "+ New Purchase Bill" to log vendor purchases.
                </td>
              </tr>
            ) : (
              filtered.map((b) => {
                const totalAfterGst = new Decimal(b.subtotal || 0)
                  .add(new Decimal(b.total_tax || 0))
                  .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
                const taxDec = new Decimal(b.total_tax || 0);
                const discDec = new Decimal(b.overall_discount_amount || 0);
                return (
                <tr key={b.id}>
                  <td className="py-3 px-4 font-mono font-bold">
                    <button
                      type="button"
                      onClick={() => setViewingBill(b)}
                      className="text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                      title="Click to view purchase bill details"
                    >
                      {b.bill_number}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {isoToDisplayDate(b.bill_date) || b.bill_date}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-100">
                    {b.supplier_name}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-700 dark:text-slate-200">
                    <div>{formatIndianCurrency(totalAfterGst.toFixed(2))}</div>
                    {taxDec.gt(0) && (
                      <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                        GST: {formatIndianCurrency(taxDec.toFixed(2))}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold">
                    {discDec.gt(0) ? (
                      <div className="text-emerald-600 dark:text-emerald-400">
                        <div>- {formatIndianCurrency(discDec.toFixed(2))}</div>
                        {b.overall_discount_type === 'PERCENTAGE' &&
                          new Decimal(b.overall_discount_percentage || 0).gt(0) && (
                            <div className="text-[10px] font-medium">
                              ({new Decimal(b.overall_discount_percentage || 0).toString()}%)
                            </div>
                          )}
                      </div>
                    ) : (
                      <span className="text-slate-400">{formatIndianCurrency('0.00')}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                    {formatIndianCurrency(b.grand_total)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-rose-600">
                    <div>{formatIndianCurrency(b.balance_amount)}</div>
                    {Number(b.balance_amount) > 0 && (() => {
                      const sup = suppliers.find((s) => s.id === b.supplier_id);
                      const cd = getPurchaseDaysRemaining(b, sup?.payment_terms_days || 0);
                      if (!cd) return null;
                      return (
                        <div className="mt-0.5 flex justify-end">
                          <span
                            className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                              cd.daysLeft <= 0
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : cd.daysLeft <= 5
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                            }`}
                            title={`Payment Due Date: ${isoToDisplayDate(cd.dueDateStr) || cd.dueDateStr}`}
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
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        b.is_finalized
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {b.is_finalized ? 'RECEIVED & POSTED' : 'DRAFT'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      {!b.is_finalized && (
                        <button
                          type="button"
                          onClick={() => handleFinalizeBill(b.id)}
                          className="inline-flex items-center space-x-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shadow-sm"
                          title="Confirm Goods Inward into Warehouse"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          <span>Receive Stock</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteBill(b)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        title={b.is_finalized ? 'Delete Purchase Bill & Reverse Stock' : 'Delete Draft Purchase Bill'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* New Purchase Bill Modal */}
      {isModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-[96vw] max-w-7xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4 text-brand-600" />
                <span>Record Supplier Purchase Bill</span>
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Supplier *</label>
                    <button
                      type="button"
                      onClick={() => setIsQuickAddSupplierOpen(true)}
                      className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 font-bold flex items-center space-x-1 hover:underline cursor-pointer"
                      title="Quickly create a new vendor"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ New Supplier</span>
                    </button>
                  </div>
                  <SearchableSelect
                    options={supplierOptions}
                    value={selectedSupplierId}
                    onChange={(val) => {
                      if (val === '__ADD_NEW_SUPPLIER__') {
                        setIsQuickAddSupplierOpen(true);
                      } else {
                        setSelectedSupplierId(val);
                      }
                    }}
                    placeholder="Search vendor by name or GST Number..."
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Receiving Warehouse *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setWhForm({ name: '', code: `WH${String(warehouses.length + 1).padStart(2, '0')}`, address: '', is_default: warehouses.length === 0 });
                        setIsWarehouseManagerOpen(true);
                      }}
                      className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 font-bold flex items-center space-x-1 hover:underline cursor-pointer"
                    >
                      <span>+ Manage / New</span>
                    </button>
                  </div>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
                    {warehouses.length === 0 && <option value="">-- Create Warehouse First --</option>}
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Vendor Bill # *</label>
                  </div>
                  <input
                    type="text"
                    placeholder="Enter vendor bill number"
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Bill Date</label>
                  </div>
                  <DateInput
                    value={billDate}
                    onChange={(val) => setBillDate(val)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                  {(() => {
                    const sup = suppliers.find((s) => s.id === selectedSupplierId);
                    if (!sup || !sup.payment_terms_days || sup.payment_terms_days <= 0) return null;
                    return (
                      <div className="mt-1 text-[10px] font-semibold text-brand-700 dark:text-brand-300 flex items-center space-x-1">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>
                          Pay in {sup.payment_terms_days} days (Due: {isoToDisplayDate(dueDate)})
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Items */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-visible mt-3">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                    <tr>
                      <th className="p-2 min-w-[230px]">
                        <div className="flex items-center justify-between gap-2">
                          <span>Product</span>
                          <button
                            type="button"
                            onClick={() => handleOpenQuickProduct(null)}
                            className="inline-flex items-center space-x-0.5 text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 dark:border-emerald-800 border border-emerald-200 rounded px-1.5 py-0.5 transition-colors shrink-0"
                            title="Create a new product and add it to this bill"
                          >
                            <Plus className="w-3 h-3" />
                            <span>New Product</span>
                          </button>
                        </div>
                      </th>
                      <th className="p-2 w-24">HSN</th>
                      <th className="p-2 w-20">Inward Qty</th>
                      <th className="p-2 w-24">Unit</th>
                      <th className="p-2 w-28">Purchase Rate (₹)</th>
                      <th className="p-2 w-48">Selling Price (₹)</th>
                      <th className="p-2 w-24">GST %</th>
                      <th className="p-2 text-center w-9"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {items.map((item, idx) => (
                      <tr key={idx} className="bg-white dark:bg-slate-800">
                        <td className="p-2 align-middle">
                          <SearchableSelect
                            options={productOptions}
                            value={item.product_id || ''}
                            onChange={(val) => handleProductSelect(idx, val)}
                            placeholder="Enter your product"
                            size="sm"
                          />
                        </td>
                        <td className="p-2 align-middle">
                          <input
                            type="text"
                            placeholder="HSN"
                            value={item.hsn_code || ''}
                            onChange={(e) => {
                              const copy = [...items];
                              copy[idx].hsn_code = e.target.value;
                              setItems(copy);
                            }}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 font-mono bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                        </td>
                        <td className="p-2 align-middle">
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            placeholder="Qty"
                            value={item.quantity ?? ''}
                            onChange={(e) => {
                              const copy = [...items];
                              copy[idx].quantity = e.target.value;
                              setItems(copy);
                            }}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                        </td>
                        <td className="p-2 align-middle">
                          <SearchableSelect
                            options={compactUnitOptions}
                            value={item.unit || 'NOS'}
                            onChange={(val) => {
                              const copy = [...items];
                              copy[idx].unit = val || 'NOS';
                              setItems(copy);
                            }}
                            placeholder="NOS"
                            size="sm"
                          />
                        </td>
                        <td className="p-2 align-middle">
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
                            className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          />
                        </td>
                        <td className="p-2 align-middle">
                          <div className="grid grid-cols-2 gap-1.5">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="Min"
                              value={item.min_selling_price ?? ''}
                              onChange={(e) => {
                                const copy = [...items];
                                copy[idx].min_selling_price = e.target.value;
                                setItems(copy);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                              title="Minimum Selling Price (₹)"
                            />
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="Max"
                              value={item.max_selling_price ?? ''}
                              onChange={(e) => {
                                const copy = [...items];
                                copy[idx].max_selling_price = e.target.value;
                                setItems(copy);
                              }}
                              className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                              title="Maximum Selling Price (₹)"
                            />
                          </div>
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

              <div className="flex flex-col md:flex-row items-start justify-between gap-4 pt-2">
                <div>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex items-center space-x-1 text-brand-600 font-bold hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item Row</span>
                  </button>
                </div>

                {/* Overall Bill Value & Overall Discount Summary */}
                <div className="w-full md:w-96 p-3.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span>Subtotal (Taxable):</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formatIndianCurrency(billTotals.subtotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span>Total GST:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formatIndianCurrency(billTotals.totalTax)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-semibold pt-1.5 border-t border-slate-200/80 dark:border-slate-700/80">
                    <span>Overall Bill Value:</span>
                    <span>{formatIndianCurrency(billTotals.grossTotal)}</span>
                  </div>

                  {/* Overall Discount Input */}
                  <div className="pt-1.5 border-t border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        Overall Discount
                      </label>
                      <div className="flex items-center space-x-1.5">
                        <div className="inline-flex rounded border border-slate-300 dark:border-slate-600 overflow-hidden bg-white dark:bg-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              setOverallDiscountType('AMOUNT');
                              setOverallDiscountValue('');
                            }}
                            className={`px-2 py-1 text-[11px] font-bold transition-colors ${
                              overallDiscountType === 'AMOUNT'
                                ? 'bg-brand-600 text-white'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                            title="Flat discount amount in ₹"
                          >
                            ₹
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOverallDiscountType('PERCENTAGE');
                              setOverallDiscountValue('');
                            }}
                            className={`px-2 py-1 text-[11px] font-bold transition-colors ${
                              overallDiscountType === 'PERCENTAGE'
                                ? 'bg-brand-600 text-white'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                            title="Percentage discount on overall bill"
                          >
                            %
                          </button>
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder={overallDiscountType === 'PERCENTAGE' ? '0%' : '0.00'}
                          value={overallDiscountValue}
                          onChange={(e) => setOverallDiscountValue(e.target.value)}
                          className="w-28 text-right border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700 font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-brand-500 outline-none"
                          title={
                            overallDiscountType === 'PERCENTAGE'
                              ? 'Enter overall bill discount percentage'
                              : 'Enter overall bill discount amount (₹)'
                          }
                        />
                      </div>
                    </div>

                    {billTotals.hasDiscount && (
                      <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                        <span>
                          Discount Applied
                          {overallDiscountType === 'PERCENTAGE' ? ` (${billTotals.discountPercentage}%)` : ''}:
                        </span>
                        <span>- {formatIndianCurrency(billTotals.discountAmount)}</span>
                      </div>
                    )}
                    {billTotals.isDiscountCapped && (
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 text-right">
                        {overallDiscountType === 'PERCENTAGE'
                          ? 'Capped at 100% of overall bill value'
                          : 'Capped at overall bill value'}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between font-extrabold text-sm text-slate-900 dark:text-white pt-2 border-t border-slate-300 dark:border-slate-600">
                    <span>Net Grand Total:</span>
                    <span className="text-brand-600 dark:text-brand-400">
                      {formatIndianCurrency(billTotals.netTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={receiveImmediately}
                  onChange={(e) => setReceiveImmediately(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
                <span>Receive stock into Inventory immediately</span>
              </label>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-1.5 border border-slate-300 rounded text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleCreateBill}
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {saving
                    ? 'Saving...'
                    : receiveImmediately
                      ? 'Save & Receive into Inventory'
                      : 'Save Draft Purchase Bill'}
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Quick Create New Product Modal (saves to Products Catalog & links to Purchase Bill) */}
      {isQuickProductOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <Package className="w-4 h-4 text-emerald-600" />
                <span>Create New Product (Saves to Products &amp; Inventory)</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsQuickProductOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="col-span-2">
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Product Name *</label>
                  </div>
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g. Seagate 1TB Hard Disk"
                    value={quickProduct.name}
                    onChange={(e) => setQuickProduct({ ...quickProduct, name: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">HSN Code</label>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. 8471"
                    value={quickProduct.hsn_or_sac}
                    onChange={(e) => setQuickProduct({ ...quickProduct, hsn_or_sac: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Category</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsQuickInlineCatOpen((prev) => !prev);
                        setQuickInlineCatName('');
                      }}
                      className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200"
                    >
                      <Tags className="w-3 h-3" />
                      <span>{isQuickInlineCatOpen ? 'Close' : '+ New'}</span>
                    </button>
                  </div>
                  <SearchableSelect
                    options={categoryOptions}
                    value={quickProduct.category_id}
                    onChange={(val) => setQuickProduct({ ...quickProduct, category_id: val })}
                    placeholder="-- No Category --"
                  />
                  {isQuickInlineCatOpen && (
                    <div className="mt-1.5 flex items-center space-x-1">
                      <input
                        type="text"
                        placeholder="New category name"
                        value={quickInlineCatName}
                        onChange={(e) => setQuickInlineCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateQuickInlineCategory();
                          }
                        }}
                        className="flex-1 min-w-0 border border-emerald-300 rounded px-2 py-1 text-xs bg-white dark:bg-slate-800"
                      />
                      <button
                        type="button"
                        onClick={handleCreateQuickInlineCategory}
                        className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Purchase Price (₹)</label>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={quickProduct.purchase_price}
                    onChange={(e) => setQuickProduct({ ...quickProduct, purchase_price: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Selling Price (₹)</label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Min Price"
                      value={quickProduct.min_selling_price}
                      onChange={(e) => setQuickProduct({ ...quickProduct, min_selling_price: e.target.value })}
                      className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Max Price"
                      value={quickProduct.max_selling_price}
                      onChange={(e) => setQuickProduct({ ...quickProduct, max_selling_price: e.target.value })}
                      className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">GST Rate (%)</label>
                  </div>
                  <select
                    value={quickProduct.gst_rate}
                    onChange={(e) => setQuickProduct({ ...quickProduct, gst_rate: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
                    {GST_RATES.map((rate) => (
                      <option key={rate} value={rate}>{rate}%</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Unit of Measure</label>
                  </div>
                  <SearchableSelect
                    options={unitOptions}
                    value={quickProduct.unit}
                    onChange={(val) => setQuickProduct({ ...quickProduct, unit: val })}
                    placeholder="NOS"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Minimum Stock Alert</label>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="5"
                    value={quickProduct.minimum_stock}
                    onChange={(e) => setQuickProduct({ ...quickProduct, minimum_stock: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">SKU / Code</label>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. PRD-1001"
                    value={quickProduct.sku}
                    onChange={(e) => setQuickProduct({ ...quickProduct, sku: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsQuickProductOpen(false)}
                className="px-4 py-1.5 border border-slate-300 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveQuickProduct}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-sm"
              >
                Save Product &amp; Add to Bill
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* View Purchase Bill Modal */}
      {viewingBill && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center space-x-3">
                <ShoppingCart className="w-5 h-5 text-brand-600" />
                <div>
                  <h2 className="font-extrabold text-base text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                    <span>Purchase Bill: {viewingBill.bill_number}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300">
                      {viewingBill.is_finalized ? 'RECEIVED & POSTED' : 'DRAFT'}
                    </span>
                  </h2>
                  <div className="text-xs text-slate-500">
                    Bill Date: {isoToDisplayDate(viewingBill.bill_date) || viewingBill.bill_date} | Due Date: {isoToDisplayDate(viewingBill.due_date) || viewingBill.due_date}
                  </div>
                </div>
              </div>
              <button onClick={() => setViewingBill(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
              <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-4">
                <div>
                  <div className="font-semibold text-slate-400 uppercase text-[10px]">Vendor / Supplier</div>
                  <div className="font-bold text-sm text-slate-800 dark:text-slate-200 mt-0.5">{viewingBill.supplier_name}</div>
                  {viewingBill.supplier_gstin && (
                    <div className="font-mono text-slate-500 mt-1">GST Number: {viewingBill.supplier_gstin}</div>
                  )}
                </div>

                <div>
                  <div className="font-semibold text-slate-400 uppercase text-[10px]">Accounts Payable Summary</div>
                  <div className="mt-1 text-slate-700 dark:text-slate-300">
                    <div>Balance Due: <span className="font-bold text-rose-600">{formatIndianCurrency(viewingBill.balance_amount)}</span></div>
                    <div>Paid Amount: <span className="font-bold text-emerald-600">{formatIndianCurrency(viewingBill.paid_amount)}</span></div>
                  </div>
                </div>
                {viewingBill.notes && (
                  <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div className="font-semibold text-slate-400 uppercase text-[10px]">Notes / Extra Details</div>
                    <div className="text-slate-700 dark:text-slate-300 whitespace-pre-line mt-0.5">{viewingBill.notes}</div>
                  </div>
                )}
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Item Name</th>
                      <th className="py-2.5 px-2">HSN</th>
                      <th className="py-2.5 px-2 text-right">Qty</th>
                      <th className="py-2.5 px-2 text-right">Rate</th>
                      <th className="py-2.5 px-2 text-right">GST %</th>
                      <th className="py-2.5 px-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {viewingBill.items?.map((it, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">{it.item_name}</td>
                        <td className="py-2.5 px-2 font-mono text-slate-500">{it.hsn_code || '-'}</td>
                        <td className="py-2.5 px-2 text-right">{it.quantity} {it.unit}</td>
                        <td className="py-2.5 px-2 text-right">{formatIndianCurrency(it.rate)}</td>
                        <td className="py-2.5 px-2 text-right">{it.gst_rate}%</td>
                        <td className="py-2.5 px-3 text-right font-bold">{formatIndianCurrency(it.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <div className="w-72 space-y-1.5 p-3.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Subtotal:</span>
                    <span>{formatIndianCurrency(viewingBill.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Total Tax:</span>
                    <span>{formatIndianCurrency(viewingBill.total_tax)}</span>
                  </div>
                  {Number(viewingBill.overall_discount_amount || 0) > 0 && (
                    <>
                      <div className="flex justify-between text-slate-700 dark:text-slate-300 font-semibold pt-1 border-t border-slate-200/80 dark:border-slate-700/80">
                        <span>Overall Bill Value:</span>
                        <span>
                          {formatIndianCurrency(
                            new Decimal(viewingBill.subtotal || 0)
                              .add(new Decimal(viewingBill.total_tax || 0))
                              .toFixed(2)
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-semibold">
                        <span>
                          Overall Discount
                          {viewingBill.overall_discount_type === 'PERCENTAGE' &&
                          Number(viewingBill.overall_discount_percentage || 0) > 0
                            ? ` (${Number(viewingBill.overall_discount_percentage)}%)`
                            : ''}:
                        </span>
                        <span>- {formatIndianCurrency(viewingBill.overall_discount_amount || '0.00')}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between font-extrabold text-sm text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span>Grand Total:</span>
                    <span className="text-brand-600 dark:text-brand-400">{formatIndianCurrency(viewingBill.grand_total)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div>
                <button
                  type="button"
                  onClick={() => handleDeleteBill(viewingBill)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{viewingBill.is_finalized ? 'Delete Purchase & Reverse Stock' : 'Delete Draft Bill'}</span>
                </button>
              </div>
              <div className="flex items-center space-x-2">
                {!viewingBill.is_finalized && (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleFinalizeBill(viewingBill.id);
                      setViewingBill(null);
                    }}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-sm"
                  >
                    Receive Stock & Post Inward
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingBill(null)}
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

      {/* Warehouse Manager Modal (Create / Edit / Delete Warehouses right inside Purchases) */}
      {isWarehouseManagerOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden text-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <WarehouseIcon className="w-4 h-4 text-brand-600" />
                <span>Manage Receiving Warehouses</span>
              </h3>
              <button
                onClick={() => {
                  setIsWarehouseManagerOpen(false);
                  setWhForm(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {whForm ? (
                <div className="p-4 border border-brand-200 dark:border-slate-700 rounded-xl bg-brand-50/40 dark:bg-slate-900/40 space-y-3">
                  <div className="font-bold text-slate-800 dark:text-slate-100">
                    {whForm.id ? 'Edit Warehouse' : 'Create New Warehouse'}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold mb-1">Warehouse Name *</label>
                      <input
                        type="text"
                        value={whForm.name || ''}
                        onChange={(e) => setWhForm({ ...whForm, name: e.target.value })}
                        placeholder="e.g. Main Godown"
                        className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Code *</label>
                      <input
                        type="text"
                        value={whForm.code || ''}
                        onChange={(e) => setWhForm({ ...whForm, code: e.target.value.toUpperCase() })}
                        placeholder="WH01"
                        className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block font-semibold mb-1">Location Address</label>
                      <input
                        type="text"
                        value={whForm.address || ''}
                        onChange={(e) => setWhForm({ ...whForm, address: e.target.value })}
                        placeholder="Address / Unit No."
                        className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                      />
                    </div>
                  </div>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(whForm.is_default)}
                      onChange={(e) => setWhForm({ ...whForm, is_default: e.target.checked })}
                    />
                    <span className="font-semibold">Set as default warehouse</span>
                  </label>
                  <div className="flex justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setWhForm(null)}
                      className="px-3 py-1 border border-slate-300 rounded font-semibold"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveWarehouse}
                      className="px-3.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded font-bold"
                    >
                      Save Warehouse
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setWhForm({
                        name: '',
                        code: `WH${String(warehouses.length + 1).padStart(2, '0')}`,
                        address: '',
                        is_default: warehouses.length === 0,
                      })
                    }
                    className="inline-flex items-center space-x-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded font-bold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Warehouse</span>
                  </button>
                </div>
              )}

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Code</th>
                      <th className="py-2 px-3">Address</th>
                      <th className="py-2 px-3 text-center">Default</th>
                      <th className="py-2 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {warehouses.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          No warehouses created yet. Click "+ New Warehouse" above.
                        </td>
                      </tr>
                    ) : (
                      warehouses.map((w) => (
                        <tr key={w.id}>
                          <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-100">{w.name}</td>
                          <td className="py-2 px-3 font-mono">{w.code}</td>
                          <td className="py-2 px-3 text-slate-500">{w.address || '-'}</td>
                          <td className="py-2 px-3 text-center">
                            {w.is_default ? (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                                Default
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={async () => {
                                  await api.updateWarehouse(companyId, w.id, { is_default: true });
                                  await loadMaster();
                                }}
                                className="text-brand-600 hover:underline font-semibold"
                              >
                                Make Default
                              </button>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => setWhForm({ ...w })}
                                className="p-1 text-slate-500 hover:text-brand-600"
                                title="Edit Warehouse"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWarehouse(w)}
                                className="p-1 text-slate-400 hover:text-rose-600"
                                title="Delete Warehouse"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsWarehouseManagerOpen(false);
                  setWhForm(null);
                }}
                className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 rounded font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Inline Quick Add Supplier Modal */}
      <QuickAddSupplierModal
        isOpen={isQuickAddSupplierOpen}
        onClose={() => setIsQuickAddSupplierOpen(false)}
        companyId={companyId}
        defaultState={companyDefaultState}
        onSupplierCreated={(newSupplier) => {
          setSuppliers((prev) => [newSupplier, ...prev]);
          setSelectedSupplierId(newSupplier.id);
        }}
      />
    </div>
  );
};
