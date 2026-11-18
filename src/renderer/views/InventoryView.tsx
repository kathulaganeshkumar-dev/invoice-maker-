// src/renderer/views/InventoryView.tsx - Multi-Warehouse & Stock Movements Ledger
import React, { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { Warehouse, StockBalance, InventoryTransaction, Product } from '../../shared/types';
import { api } from '../services/api';
import { ModalPortal } from '../components/ModalPortal';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import { isoToDisplayDate } from '../components/DateInput';
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

  useEffect(() => {
    if (companyId) {
      loadData();
    }
  }, [companyId, selectedWarehouseId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [wList, bList, tList, pList] = await Promise.all([
        api.getWarehouses(companyId),
        api.getStockBalances(companyId, selectedWarehouseId || undefined),
        api.getInventoryTransactions(companyId),
        api.getProducts(companyId, { item_type: 'PRODUCT' }),
      ]);
      setWarehouses(wList);
      setBalances(bList);
      setTransactions(tList);
      setProducts(pList);
      if (wList.length > 0 && selectedWarehouseId && !wList.some((w) => w.id === selectedWarehouseId)) {
        setSelectedWarehouseId('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
    <div className="p-6 space-y-5 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight flex items-center space-x-2">
            <Boxes className="w-5 h-5 text-brand-600" />
            <span>Inventory & Warehouse Management</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage warehouses, inter-warehouse transfers, and real-time FIFO / Weighted Average valuation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenNewWarehouse}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Warehouse</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTransferFromWhId(warehouses[0]?.id || '');
              setTransferToWhId(warehouses[1]?.id || '');
              setIsTransferModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold shadow-sm transition-all"
          >
            <ArrowRightLeft className="w-4 h-4 text-sky-600" />
            <span>Transfer Stock</span>
          </button>
          <button
            type="button"
            onClick={() => setIsAdjustModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
          >
            <Sliders className="w-4 h-4" />
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
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Current Stock Balances
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transactions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'transactions'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Stock Movement Ledger
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('warehouses')}
              className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'warehouses'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
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
                    No stock balances found. Items will appear once opening balance or purchases are committed.
                  </td>
                </tr>
              ) : (
                balances.map((b: any) => {
                  const isLow = Number(b.quantity_on_hand) <= Number(b.minimum_stock) && Number(b.minimum_stock) > 0;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {b.product_name}
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
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center space-x-1 w-max mx-auto">
                            <AlertTriangle className="w-3 h-3 mr-0.5" />
                            <span>Low Stock Alert</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
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
                    <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {isoToDisplayDate(tx.transaction_date) || tx.transaction_date}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{tx.product_name}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isPositive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
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
              className="inline-flex items-center space-x-1 px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
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
                  <tr key={wh.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
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
                          className="text-[11px] font-semibold text-brand-600 hover:underline"
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
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm"
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
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-bold shadow-sm"
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
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm"
              >
                Commit Adjustment
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
};
