// src/renderer/views/InventoryView.tsx - Multi-Warehouse & Stock Movements Ledger
import React, { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { Warehouse, StockBalance, InventoryTransaction, Product, Category } from '../../shared/types';
import { api } from '../services/api';
import { ModalPortal } from '../components/ModalPortal';
import { SearchableSelect } from '../components/SearchableSelect';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import { isoToDisplayDate } from '../components/DateInput';
import { STANDARD_UNITS, GST_RATES } from '../../shared/constants';
import {
  Boxes,
  Plus,
  ArrowRightLeft,
  Sliders,
  Warehouse as WarehouseIcon,
  AlertTriangle,
  X,
  Edit2,
  Trash2,
  CheckCircle2,
  Pencil,
  Check,
  Package,
  Tags,
  Loader2,
} from 'lucide-react';

interface Props {
  companyId: string;
}

export const InventoryView: React.FC<Props> = ({ companyId }) => {
  const [activeTab, setActiveTab] = useState<'balances' | 'transactions' | 'warehouses'>('balances');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState<boolean>(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState<boolean>(false);

  // Adjustment Modal state
  const [adjustProductId, setAdjustProductId] = useState<string>('');
  const [adjustType, setAdjustType] = useState<'ADJUSTMENT_ADD' | 'ADJUSTMENT_REDUCE'>('ADJUSTMENT_ADD');
  const [adjustQty, setAdjustQty] = useState<string>('');
  const [adjustNotes, setAdjustNotes] = useState<string>('');

  // Transfer Modal state
  const [transferProductId, setTransferProductId] = useState<string>('');
  const [transferFromWhId, setTransferFromWhId] = useState<string>('');
  const [transferToWhId, setTransferToWhId] = useState<string>('');
  const [transferQty, setTransferQty] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState<string>('');

  // Warehouse CRUD Modal state
  const [editingWarehouse, setEditingWarehouse] = useState<Partial<Warehouse>>({});

  // Quick Stock Edit Modal state (for the pen symbol on stock balances)
  const [editingStockBalance, setEditingStockBalance] = useState<any | null>(null);
  const [newStockQty, setNewStockQty] = useState<string>('');
  const [stockEditUnitCost, setStockEditUnitCost] = useState<string>('');
  const [stockEditNotes, setStockEditNotes] = useState<string>('Physical stock audit count correction');
  const [stockEditLoading, setStockEditLoading] = useState<boolean>(false);

  // Create New Product Modal state
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState<boolean>(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isInlineCatOpen, setIsInlineCatOpen] = useState<boolean>(false);
  const [inlineCatName, setInlineCatName] = useState<string>('');
  const [isSavingProduct, setIsSavingProduct] = useState<boolean>(false);
  const [newProductForm, setNewProductForm] = useState({
    name: '',
    sku: '',
    hsn_or_sac: '',
    unit: 'NOS',
    current_stock: '0',
    purchase_price: '',
    min_selling_price: '',
    max_selling_price: '',
    gst_rate: '18.00',
    minimum_stock: '5',
    category_id: '',
    warehouse_id: '',
  });

  useEffect(() => {
    if (companyId) {
      loadData();
    }
  }, [companyId, selectedWarehouseId]);

  useEffect(() => {
    const handleSync = () => {
      if (companyId) loadData();
    };
    window.addEventListener('eim-data-changed', handleSync);
    window.addEventListener('eim-data-sync', handleSync);
    return () => {
      window.removeEventListener('eim-data-changed', handleSync);
      window.removeEventListener('eim-data-sync', handleSync);
    };
  }, [companyId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [wList, bList, tList, pList, cList] = await Promise.all([
        api.getWarehouses(companyId),
        api.getStockBalances(companyId, selectedWarehouseId || undefined),
        api.getInventoryTransactions(companyId),
        api.getProducts(companyId, { item_type: 'PRODUCT' }),
        api.getCategories(companyId),
      ]);
      setWarehouses(wList);
      setBalances(bList);
      setTransactions(tList);
      setProducts(pList);
      setCategories(cList || []);
      if (wList.length > 0 && selectedWarehouseId && !wList.some((w) => w.id === selectedWarehouseId)) {
        setSelectedWarehouseId('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNewProduct = () => {
    const defaultWh = warehouses.find((w) => w.is_default) || warehouses[0];
    setNewProductForm({
      name: '',
      sku: '',
      hsn_or_sac: '',
      unit: 'NOS',
      current_stock: '0',
      purchase_price: '',
      min_selling_price: '',
      max_selling_price: '',
      gst_rate: '18.00',
      minimum_stock: '5',
      category_id: '',
      warehouse_id: defaultWh?.id || '',
    });
    setIsInlineCatOpen(false);
    setInlineCatName('');
    setIsNewProductModalOpen(true);
  };

  const handleCreateInlineCategory = async () => {
    if (!inlineCatName.trim()) return;
    try {
      const created = await api.createCategory(companyId, inlineCatName.trim(), '');
      setCategories((prev) => [...prev, created]);
      setNewProductForm((prev) => ({ ...prev, category_id: created.id }));
      setInlineCatName('');
      setIsInlineCatOpen(false);
    } catch (err: any) {
      alert(err.message || 'Error creating category');
    }
  };

  const handleSaveNewProduct = async () => {
    if (!newProductForm.name || !newProductForm.name.trim()) {
      alert('Product Name is required');
      return;
    }
    setIsSavingProduct(true);
    try {
      const payload: any = {
        item_type: 'PRODUCT',
        name: newProductForm.name.trim(),
        sku: newProductForm.sku?.trim() || undefined,
        hsn_or_sac: newProductForm.hsn_or_sac?.trim() || undefined,
        unit: newProductForm.unit || 'NOS',
        current_stock: newProductForm.current_stock || '0',
        purchase_price: newProductForm.purchase_price ? new Decimal(newProductForm.purchase_price).toFixed(2) : '0.00',
        selling_price: newProductForm.min_selling_price ? new Decimal(newProductForm.min_selling_price).toFixed(2) : '0.00',
        min_selling_price: newProductForm.min_selling_price ? new Decimal(newProductForm.min_selling_price).toFixed(2) : null,
        max_selling_price: newProductForm.max_selling_price ? new Decimal(newProductForm.max_selling_price).toFixed(2) : null,
        gst_rate: newProductForm.gst_rate || '18.00',
        minimum_stock: newProductForm.minimum_stock ? new Decimal(newProductForm.minimum_stock).toFixed(2) : '5.00',
        category_id: newProductForm.category_id || undefined,
      };

      const created = await api.createProduct(companyId, payload);

      // If user selected a specific warehouse that is not the default one, transfer opening stock
      if (newProductForm.warehouse_id && Number(newProductForm.current_stock) > 0) {
        const defaultWh = warehouses.find((w) => w.is_default) || warehouses[0];
        if (defaultWh && defaultWh.id !== newProductForm.warehouse_id) {
          try {
            await api.transferStock(companyId, {
              product_id: created.id,
              from_warehouse_id: defaultWh.id,
              to_warehouse_id: newProductForm.warehouse_id,
              quantity: Number(newProductForm.current_stock),
              notes: 'Initial warehouse allocation upon product creation',
            });
          } catch (tErr) {
            console.warn('Initial transfer warning:', tErr);
          }
        }
      }

      window.dispatchEvent(
        new CustomEvent('eim-data-changed', {
          detail: { type: 'product', id: created.id, current_stock: payload.current_stock },
        })
      );

      setIsNewProductModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error creating product');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleStockAdjustment = async () => {
    if (!adjustProductId) {
      alert('Please select a product');
      return;
    }
    if (!adjustQty || Number(adjustQty) <= 0) {
      alert('Please enter a valid quantity');
      return;
    }
    if (!adjustNotes.trim()) {
      alert('Mandatory audit notes required for stock adjustment');
      return;
    }
    const targetWh = selectedWarehouseId || warehouses.find((w) => w.is_default)?.id || warehouses[0]?.id;
    if (!targetWh) {
      alert('Please create at least one warehouse first.');
      return;
    }

    try {
      await api.recordStockAdjustment(companyId, {
        branchId: warehouses[0]?.branch_id || 'DEFAULT_BRANCH',
        warehouseId: targetWh,
        productId: adjustProductId,
        movementType: adjustType,
        quantity: adjustQty,
        notes: adjustNotes,
      });

      setIsAdjustModalOpen(false);
      setAdjustNotes('');
      setAdjustQty('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error recording adjustment');
    }
  };

  const handleOpenStockEdit = (balance: any) => {
    setEditingStockBalance(balance);
    setNewStockQty(String(balance.quantity_on_hand || '0'));
    setStockEditUnitCost(String(balance.average_unit_cost || '0.00'));
    setStockEditNotes('Physical stock audit count correction');
  };

  const handleSaveStockEdit = async () => {
    if (!editingStockBalance) return;
    const targetQtyDec = new Decimal(newStockQty.trim() || '0');
    if (!targetQtyDec.isFinite() || targetQtyDec.lt(0)) {
      alert('Please enter a valid stock quantity (0 or greater).');
      return;
    }
    const currentQtyDec = new Decimal(editingStockBalance.quantity_on_hand || '0');
    const diff = targetQtyDec.sub(currentQtyDec);
    const unitCostDec = new Decimal(stockEditUnitCost.trim() || '0');

    setStockEditLoading(true);
    try {
      if (!diff.isZero()) {
        const isAdd = diff.gt(0);
        await api.recordStockAdjustment(companyId, {
          warehouseId: editingStockBalance.warehouse_id,
          productId: editingStockBalance.product_id,
          movementType: isAdd ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_REDUCE',
          quantity: diff.abs().toFixed(2),
          unitCost: unitCostDec.isFinite() && unitCostDec.gt(0) ? unitCostDec.toFixed(2) : undefined,
          notes: stockEditNotes.trim() || 'Quick stock update via pen action',
        });
      }

      // Auto update everywhere: broadcast event so Products, Invoices, Quotations, and Dashboard sync immediately
      window.dispatchEvent(
        new CustomEvent('eim-data-changed', {
          detail: {
            type: 'inventory',
            productId: editingStockBalance.product_id,
            newQuantity: targetQtyDec.toFixed(2),
          },
        })
      );

      setEditingStockBalance(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error updating stock on hand');
    } finally {
      setStockEditLoading(false);
    }
  };

  const handleStockTransfer = async () => {
    if (!transferProductId || !transferFromWhId || !transferToWhId) {
      alert('Select product, source warehouse, and destination warehouse');
      return;
    }
    if (!transferQty || Number(transferQty) <= 0) {
      alert('Please enter a valid quantity to transfer');
      return;
    }
    if (transferFromWhId === transferToWhId) {
      alert('Source and destination warehouses cannot be the same');
      return;
    }
    try {
      await api.transferStock(companyId, {
        product_id: transferProductId,
        from_warehouse_id: transferFromWhId,
        to_warehouse_id: transferToWhId,
        quantity: Number(transferQty),
        notes: transferNotes,
      });
      setIsTransferModalOpen(false);
      setTransferQty('');
      setTransferNotes('');
      await loadData();
      alert('Stock transferred successfully!');
    } catch (err: any) {
      alert(err.message || 'Error transferring stock');
    }
  };

  const handleOpenNewWarehouse = () => {
    setEditingWarehouse({
      name: '',
      code: `WH${String(warehouses.length + 1).padStart(2, '0')}`,
      address: '',
      is_default: warehouses.length === 0,
    });
    setIsWarehouseModalOpen(true);
  };

  const handleSaveWarehouse = async () => {
    if (!editingWarehouse.name || !editingWarehouse.name.trim()) {
      alert('Warehouse name is required');
      return;
    }
    try {
      if (editingWarehouse.id) {
        await api.updateWarehouse(companyId, editingWarehouse.id, editingWarehouse);
      } else {
        await api.createWarehouse(companyId, editingWarehouse);
      }
      setIsWarehouseModalOpen(false);
      setEditingWarehouse({});
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error saving warehouse');
    }
  };

  const handleDeleteWarehouse = async (wh: Warehouse) => {
    if (!window.confirm(`Delete warehouse "${wh.name}" (${wh.code})?`)) return;
    try {
      await api.deleteWarehouse(companyId, wh.id);
      if (selectedWarehouseId === wh.id) setSelectedWarehouseId('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Could not delete warehouse');
    }
  };

  const handleSetDefaultWarehouse = async (wh: Warehouse) => {
    try {
      await api.updateWarehouse(companyId, wh.id, { is_default: true });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update default warehouse');
    }
  };

  // Calculate total inventory valuation using Decimal precision
  const totalValuation = balances
    .reduce((sum, b) => sum.add(new Decimal(b.total_stock_value || 0)), new Decimal(0))
    .toFixed(2);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
            Inventory & Warehouse Management
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage warehouses, inter-warehouse transfers, and real-time FIFO / Weighted Average valuation
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleOpenNewProduct}
            className="inline-flex items-center justify-center space-x-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer w-full text-center"
          >
            <span>New Product</span>
          </button>
          <button
            type="button"
            onClick={handleOpenNewWarehouse}
            className="inline-flex items-center justify-center space-x-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer w-full text-center"
          >
            <span>New Warehouse</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTransferFromWhId(warehouses[0]?.id || '');
              setTransferToWhId(warehouses[1]?.id || '');
              setIsTransferModalOpen(true);
            }}
            className="inline-flex items-center justify-center space-x-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer w-full text-center"
          >
            <span>Transfer Stock</span>
          </button>
          <button
            type="button"
            onClick={() => setIsAdjustModalOpen(true)}
            className="inline-flex items-center justify-center space-x-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer w-full text-center"
          >
            <span>Stock Adjustment</span>
          </button>
        </div>
      </div>

      {/* Tabs and Total Valuation Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('balances')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'balances'
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold border border-slate-400 dark:border-slate-500 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Current Stock Balances
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transactions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'transactions'
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold border border-slate-400 dark:border-slate-500 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Stock Movement Ledger
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('warehouses')}
              className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'warehouses'
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold border border-slate-400 dark:border-slate-500 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <WarehouseIcon className="w-3.5 h-3.5" />
              <span>Warehouses ({warehouses.length})</span>
            </button>
          </div>

          {activeTab !== 'warehouses' && warehouses.length > 0 && (
            <div className="flex items-center space-x-2 text-xs">
              <WarehouseIcon className="w-4 h-4 text-slate-400" />
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-medium"
              >
                <option value="">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 flex flex-col justify-center">
          <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300">
            Total Stock Valuation
          </span>
          <span className="text-lg font-extrabold text-emerald-900 dark:text-emerald-100">
            {formatIndianCurrency(totalValuation)}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'balances' ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Warehouse</th>
                <th className="py-3 px-4 text-right">Quantity on Hand</th>
                <th className="py-3 px-4 text-right">Avg Unit Cost</th>
                <th className="py-3 px-4 text-right">Total Valuation</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {balances.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No stock balances found. Click &quot;+ New Product&quot; above to create products with initial stock.
                  </td>
                </tr>
              ) : (
                balances.map((b: any) => {
                  const isLow = Number(b.quantity_on_hand) <= Number(b.minimum_stock) && Number(b.minimum_stock) > 0;
                  return (
                    <tr key={b.id}>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        <button
                          type="button"
                          onClick={() => handleOpenStockEdit(b)}
                          className="text-left font-bold cursor-pointer"
                          title="Click to view & edit stock"
                        >
                          {b.product_name}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {b.warehouse_name}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                        {b.quantity_on_hand} {b.product_unit}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400">
                        {formatIndianCurrency(b.average_unit_cost)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                        {formatIndianCurrency(b.total_stock_value)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isLow ? (
                          <span className="text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center justify-center space-x-1">
                            <AlertTriangle className="w-3 h-3 mr-0.5" />
                            <span>Low Stock Alert</span>
                          </span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium text-xs">
                            Adequate
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'transactions' ? (
        /* Inventory Movements Ledger */
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Movement Type</th>
                <th className="py-3 px-4">Reference Document</th>
                <th className="py-3 px-4 text-right">Quantity</th>
                <th className="py-3 px-4 text-right">Unit Cost</th>
                <th className="py-3 px-4">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No movement records logged yet.
                  </td>
                </tr>
              ) : (
                transactions.map((tx: any) => {
                  const isPositive = Number(tx.quantity) > 0;
                  return (
                    <tr key={tx.id}>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {isoToDisplayDate(tx.transaction_date) || tx.transaction_date}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{tx.product_name}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold text-xs ${
                            isPositive
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {tx.movement_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        {tx.reference_document_number}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          isPositive ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {isPositive ? `+${tx.quantity}` : tx.quantity} {tx.product_unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                        {formatIndianCurrency(tx.unit_cost)}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{tx.notes || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Warehouses CRUD Tab */
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/40">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Configured Storage Warehouses & Godowns
            </span>
            <button
              type="button"
              onClick={handleOpenNewWarehouse}
              className="inline-flex items-center space-x-1 px-3 py-1 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs rounded text-xs font-bold"
            >
              <span>Add Warehouse</span>
            </button>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Warehouse Name</th>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Address / Location</th>
                <th className="py-3 px-4 text-center">Default</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {warehouses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No warehouses configured yet. Click "+ Add Warehouse" to create your storage location.
                  </td>
                </tr>
              ) : (
                warehouses.map((wh) => (
                  <tr key={wh.id}>
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{wh.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">{wh.code}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{wh.address || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      {wh.is_default ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Default</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetDefaultWarehouse(wh)}
                          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                        >
                          Set Default
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingWarehouse({ ...wh });
                            setIsWarehouseModalOpen(true);
                          }}
                          className="p-1 text-slate-500 hover:text-brand-600"
                          title="Edit Warehouse"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteWarehouse(wh)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                          title="Delete Warehouse"
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
      )}

      {/* Create / Edit Warehouse Modal */}
      {isWarehouseModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                <WarehouseIcon className="w-4 h-4 text-brand-600" />
                <span>{editingWarehouse.id ? 'Edit Warehouse' : 'Create New Warehouse'}</span>
              </h3>
              <button onClick={() => setIsWarehouseModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Warehouse Name *</label>
                <input
                  type="text"
                  value={editingWarehouse.name || ''}
                  onChange={(e) => setEditingWarehouse({ ...editingWarehouse, name: e.target.value })}
                  placeholder="e.g. Main Godown / Central Hub"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Warehouse Code *</label>
                <input
                  type="text"
                  value={editingWarehouse.code || ''}
                  onChange={(e) => setEditingWarehouse({ ...editingWarehouse, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. WH01"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Address / Location</label>
                <textarea
                  rows={2}
                  value={editingWarehouse.address || ''}
                  onChange={(e) => setEditingWarehouse({ ...editingWarehouse, address: e.target.value })}
                  placeholder="Industrial Area / Plot location"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded p-2"
                />
              </div>

              <label className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={Boolean(editingWarehouse.is_default)}
                  onChange={(e) => setEditingWarehouse({ ...editingWarehouse, is_default: e.target.checked })}
                  className="w-4 h-4 rounded text-brand-600 border-slate-300"
                />
                <span className="font-semibold">Set as default warehouse for receipts & dispatches</span>
              </label>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIsWarehouseModalOpen(false)}
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveWarehouse}
                className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs rounded text-xs font-bold shadow-sm"
              >
                Save Warehouse
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Stock Transfer Modal */}
      {isTransferModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                <ArrowRightLeft className="w-4 h-4 text-sky-600" />
                <span>Inter-Warehouse Stock Transfer</span>
              </h3>
              <button onClick={() => setIsTransferModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Product *</label>
                <select
                  value={transferProductId}
                  onChange={(e) => setTransferProductId(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                >
                  <option value="">-- Choose Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} (Total: {p.current_stock})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">From Warehouse *</label>
                  <select
                    value={transferFromWhId}
                    onChange={(e) => setTransferFromWhId(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  >
                    <option value="">-- Source --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">To Warehouse *</label>
                  <select
                    value={transferToWhId}
                    onChange={(e) => setTransferToWhId(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  >
                    <option value="">-- Destination --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Quantity to Transfer *</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  placeholder="Enter quantity"
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Transfer Notes</label>
                <input
                  type="text"
                  placeholder="Optional transfer remark"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStockTransfer}
                className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs rounded text-xs font-bold shadow-sm"
              >
                Execute Transfer
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Manual Stock Adjustment Modal */}
      {isAdjustModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                <Sliders className="w-4 h-4 text-brand-600" />
                <span>Manual Stock Adjustment</span>
              </h3>
              <button onClick={() => setIsAdjustModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Select Product *</label>
                <select
                  value={adjustProductId}
                  onChange={(e) => setAdjustProductId(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                >
                  <option value="">-- Choose Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} (Current: {p.current_stock})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Adjustment Action *</label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value as any)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                >
                  <option value="ADJUSTMENT_ADD">Inward Addition (+ Increase Physical Stock)</option>
                  <option value="ADJUSTMENT_REDUCE">Outward Deduction (- Damage, Loss, Correction)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Quantity</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  placeholder="Enter quantity"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Audit Notes / Reason *</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Physical inventory count reconciliation"
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded p-2"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAdjustModalOpen(false)}
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStockAdjustment}
                className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs rounded text-xs font-bold shadow-sm"
              >
                Commit Adjustment
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Quick Stock Edit Modal (Pen Symbol on Stock on Hand) */}
      {editingStockBalance && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-950/60 flex items-center justify-center text-brand-600 dark:text-brand-400">
                    <Pencil className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                      Update Stock on Hand
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Syncs immediately across inventory, catalog &amp; billing
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingStockBalance(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Product and Current Balance Summary Banner */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">Product Name</span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm truncate block mt-0.5" title={editingStockBalance.product_name}>
                    {editingStockBalance.product_name}
                  </span>
                  {editingStockBalance.product_sku && (
                    <span className="text-[10px] font-mono text-slate-500">SKU: {editingStockBalance.product_sku}</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">Warehouse</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5 truncate">
                    {editingStockBalance.warehouse_name}
                  </span>
                  <span className="text-[11px] text-brand-600 dark:text-brand-400 font-bold">
                    Current: {editingStockBalance.quantity_on_hand} {editingStockBalance.product_unit}
                  </span>
                </div>
              </div>

              {/* Input Fields */}
              <div className="space-y-3.5 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-slate-800 dark:text-slate-200">
                      New Stock on Hand ({editingStockBalance.product_unit}) *
                    </label>
                    {/* Live diff indicator */}
                    {(() => {
                      const cur = Number(editingStockBalance.quantity_on_hand || 0);
                      const nxt = Number(newStockQty || 0);
                      const diff = nxt - cur;
                      if (diff > 0) {
                        return (
                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                            + {diff.toFixed(2)} {editingStockBalance.product_unit} (Inward Stock)
                          </span>
                        );
                      }
                      if (diff < 0) {
                        return (
                          <span className="text-[11px] font-bold text-rose-700 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                            {diff.toFixed(2)} {editingStockBalance.product_unit} (Outward Stock)
                          </span>
                        );
                      }
                      return (
                        <span className="text-[11px] font-medium text-slate-400">No change</span>
                      );
                    })()}
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    autoFocus
                    placeholder="Enter new physical count"
                    value={newStockQty}
                    onChange={(e) => setNewStockQty(e.target.value)}
                    className="w-full h-10 border border-slate-300 dark:border-slate-600 rounded-xl px-3 text-sm font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Avg Unit Cost (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={stockEditUnitCost}
                      onChange={(e) => setStockEditUnitCost(e.target.value)}
                      className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Updated Valuation (₹)
                    </label>
                    <div className="w-full h-9 bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3 flex items-center font-bold text-slate-800 dark:text-slate-200">
                      {formatIndianCurrency(
                        new Decimal(newStockQty || 0).mul(new Decimal(stockEditUnitCost || 0)).toFixed(2)
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Adjustment Reason / Audit Note
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Physical inventory count / audit correction"
                    value={stockEditNotes}
                    onChange={(e) => setStockEditNotes(e.target.value)}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[
                      'Physical count correction',
                      'Opening stock correction',
                      'Damaged / expired write-off',
                      'Audit reconciliation',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setStockEditNotes(preset)}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setEditingStockBalance(null)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={stockEditLoading}
                  onClick={handleSaveStockEdit}
                  className="px-5 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs rounded-xl text-xs font-bold shadow-sm disabled:opacity-50 inline-flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <span>{stockEditLoading ? 'Updating Stock...' : 'Save & Update Everywhere'}</span>
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Create New Product Modal */}
      {isNewProductModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/50">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Create New Product
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Add a product and initialize stock balance in a warehouse
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewProductModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Body */}
              <div className="p-6 overflow-y-auto space-y-4 text-xs">
                {/* Product Name & SKU */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Product Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newProductForm.name}
                      onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                      placeholder="e.g. Industrial Steel Pipe 2-inch"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-xs font-medium"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      SKU / Barcode
                    </label>
                    <input
                      type="text"
                      value={newProductForm.sku}
                      onChange={(e) => setNewProductForm({ ...newProductForm, sku: e.target.value })}
                      placeholder="e.g. SKU-1001"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-xs"
                    />
                  </div>
                </div>

                {/* Category & HSN */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Category
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsInlineCatOpen(!isInlineCatOpen)}
                        className="text-[11px] text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white font-semibold cursor-pointer"
                      >
                        {isInlineCatOpen ? 'Cancel' : '+ New Category'}
                      </button>
                    </div>
                    {isInlineCatOpen ? (
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="text"
                          value={inlineCatName}
                          onChange={(e) => setInlineCatName(e.target.value)}
                          placeholder="New category name"
                          className="flex-1 px-2.5 py-1.5 text-xs border border-brand-400 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCreateInlineCategory();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleCreateInlineCategory}
                          className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    ) : (
                      <SearchableSelect
                        options={categories.map((c) => ({ value: c.id, label: c.name }))}
                        value={newProductForm.category_id}
                        onChange={(val) => setNewProductForm({ ...newProductForm, category_id: val })}
                        placeholder="Select category..."
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      HSN / SAC Code
                    </label>
                    <input
                      type="text"
                      value={newProductForm.hsn_or_sac}
                      onChange={(e) => setNewProductForm({ ...newProductForm, hsn_or_sac: e.target.value })}
                      placeholder="e.g. 7306"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-xs"
                    />
                  </div>
                </div>

                {/* Unit & GST Rate */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Unit of Measure
                    </label>
                    <SearchableSelect
                      options={STANDARD_UNITS.map((u) => ({ value: u.code, label: `${u.code} - ${u.name}` }))}
                      value={newProductForm.unit}
                      onChange={(val) => setNewProductForm({ ...newProductForm, unit: val || 'NOS' })}
                      placeholder="Select unit..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      GST Rate (%)
                    </label>
                    <select
                      value={newProductForm.gst_rate}
                      onChange={(e) => setNewProductForm({ ...newProductForm, gst_rate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-xs font-semibold cursor-pointer"
                    >
                      {GST_RATES.map((rate) => (
                        <option key={rate} value={new Decimal(rate).toFixed(2)}>
                          {rate}% GST
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Initial Stock & Warehouse */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 space-y-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                    <Boxes className="w-3.5 h-3.5 text-brand-600" />
                    <span>Inventory Initialization</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Opening Stock Quantity
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={newProductForm.current_stock}
                        onChange={(e) => setNewProductForm({ ...newProductForm, current_stock: e.target.value })}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-xs font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Receiving Warehouse
                      </label>
                      <select
                        value={newProductForm.warehouse_id}
                        onChange={(e) => setNewProductForm({ ...newProductForm, warehouse_id: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-xs cursor-pointer"
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} {w.is_default ? '(Default)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Pricing Details */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Purchase Rate (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newProductForm.purchase_price}
                      onChange={(e) => setNewProductForm({ ...newProductForm, purchase_price: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Min Selling Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newProductForm.min_selling_price}
                      onChange={(e) => setNewProductForm({ ...newProductForm, min_selling_price: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Max Selling Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newProductForm.max_selling_price}
                      onChange={(e) => setNewProductForm({ ...newProductForm, max_selling_price: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-xs"
                    />
                  </div>
                </div>

                {/* Min Stock Alert */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Minimum Stock Alert
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={newProductForm.minimum_stock}
                    onChange={(e) => setNewProductForm({ ...newProductForm, minimum_stock: e.target.value })}
                    placeholder="5"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-xs"
                  />
                  <p className="text-[10px] text-slate-400">
                    Triggers low stock alert badge when inventory falls below this quantity.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setIsNewProductModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingProduct}
                  onClick={handleSaveNewProduct}
                  className="px-5 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs rounded-xl text-xs font-bold shadow-sm disabled:opacity-50 inline-flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  {isSavingProduct ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Save & Add to Inventory</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};
