// src/renderer/views/PurchasesView.tsx - Purchase Orders & Vendor Bills
import React, { useState, useEffect } from 'react';
import { PurchaseInvoice, Supplier, Product, Warehouse } from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import { GST_RATES } from '../../shared/constants';
import {
  ShoppingCart,
  Plus,
  Search,
  CheckCircle2,
  Trash2,
  X,
  PackageCheck,
  Eye,
  Warehouse as WarehouseIcon,
  Edit2,
} from 'lucide-react';

interface Props {
  companyId: string;
}

export const PurchasesView: React.FC<Props> = ({ companyId }) => {
  const [bills, setBills] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [viewingBill, setViewingBill] = useState<PurchaseInvoice | null>(null);
  const [isWarehouseManagerOpen, setIsWarehouseManagerOpen] = useState<boolean>(false);
  const [whForm, setWhForm] = useState<Partial<Warehouse> | null>(null);

  // Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [billNumber, setBillNumber] = useState<string>('');
  const [billDate, setBillDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<any[]>([
    { item_name: '', hsn_code: '', quantity: '1', rate: '0.00', gst_rate: '18.00' },
  ]);

  useEffect(() => {
    if (companyId) {
      loadBills();
      loadMaster();
    }
  }, [companyId]);

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
      const [sList, pList, wList] = await Promise.all([
        api.getSuppliers(companyId),
        api.getProducts(companyId, { item_type: 'PRODUCT' }),
        api.getWarehouses(companyId),
      ]);
      setSuppliers(sList);
      setProducts(pList);
      setWarehouses(wList);
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
    setItems([...items, { item_name: '', hsn_code: '', quantity: '1', rate: '0.00', gst_rate: '18.00' }]);
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
      product_id: prod.id,
      item_name: prod.name,
      hsn_code: prod.hsn_or_sac,
      rate: prod.purchase_price || prod.selling_price,
      gst_rate: prod.gst_rate,
      unit: prod.unit,
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

    try {
      await api.createPurchaseInvoice(companyId, {
        supplier_id: sup.id,
        supplier_name: sup.name,
        supplier_gstin: sup.gstin,
        warehouse_id: selectedWarehouseId,
        bill_number: billNumber || `BILL-${Date.now()}`,
        bill_date: billDate,
        due_date: dueDate,
        items,
      });

      setIsModalOpen(false);
      resetForm();
      await loadBills();
    } catch (err: any) {
      alert(err.message || 'Error creating purchase bill');
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
    setItems([{ item_name: '', hsn_code: '', quantity: '1', rate: '0.00', gst_rate: '18.00' }]);
  };

  const filtered = bills.filter((b) => {
    if (searchQuery) {
      const s = searchQuery.toLowerCase();
      return b.bill_number.toLowerCase().includes(s) || b.supplier_name.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="p-6 space-y-5 overflow-y-auto">
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
              setBillNumber(`BILL-${Date.now().toString().slice(-6)}`);
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
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-stone-50/80 dark:bg-stone-900/60 border-b border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 font-medium text-xs">
            <tr>
              <th className="py-2.5 px-4">Bill #</th>
              <th className="py-2.5 px-4">Date</th>
              <th className="py-2.5 px-4">Supplier</th>
              <th className="py-2.5 px-4 text-right">Grand total</th>
              <th className="py-2.5 px-4 text-right">Balance due</th>
              <th className="py-2.5 px-4 text-center">Status</th>
              <th className="py-2.5 px-4 text-center">Inward stock action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No purchase bills recorded. Click "+ New Purchase Bill" to log vendor purchases.
                </td>
              </tr>
            ) : (
              filtered.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold">
                    <button
                      type="button"
                      onClick={() => setViewingBill(b)}
                      className="text-brand-600 dark:text-brand-400 hover:underline cursor-pointer flex items-center space-x-1"
                      title="Click to view purchase bill details"
                    >
                      <span>{b.bill_number}</span>
                      <Eye className="w-3.5 h-3.5 text-slate-400 opacity-60 hover:opacity-100" />
                    </button>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{b.bill_date}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-100">
                    {b.supplier_name}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                    {formatIndianCurrency(b.grand_total)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-rose-600">
                    {formatIndianCurrency(b.balance_amount)}
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* New Purchase Bill Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
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
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Supplier *</label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                  >
                    <option value="">-- Select Vendor --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Receiving Warehouse *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setWhForm({ name: '', code: `WH${String(warehouses.length + 1).padStart(2, '0')}`, address: '', is_default: warehouses.length === 0 });
                        setIsWarehouseManagerOpen(true);
                      }}
                      className="text-[10px] font-bold text-brand-600 hover:underline"
                    >
                      + Manage / New
                    </button>
                  </div>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                  >
                    {warehouses.length === 0 && <option value="">-- Create Warehouse First --</option>}
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Vendor Bill #</label>
                  <input
                    type="text"
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Bill Date</label>
                  <input
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700"
                  />
                </div>
              </div>

              {/* Items */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden mt-3">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                    <tr>
                      <th className="p-2 w-52">Product</th>
                      <th className="p-2 w-24">HSN</th>
                      <th className="p-2 w-20">Inward Qty</th>
                      <th className="p-2 w-28">Purchase Rate (₹)</th>
                      <th className="p-2 w-24">GST %</th>
                      <th className="p-2 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {items.map((item, idx) => (
                      <tr key={idx} className="bg-white dark:bg-slate-800">
                        <td className="p-2 space-y-1">
                          <select
                            onChange={(e) => handleProductSelect(idx, e.target.value)}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-xs"
                          >
                            <option value="">-- Choose Product to Receive --</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.hsn_code}
                            onChange={(e) => {
                              const copy = [...items];
                              copy[idx].hsn_code = e.target.value;
                              setItems(copy);
                            }}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded px-2 py-1"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0.01"
                            step="any"
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
                            min="0"
                            step="any"
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
                              <option key={rate} value={rate}>{rate}%</option>
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
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 border border-slate-300 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateBill}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm"
              >
                Save Purchase Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Purchase Bill Modal */}
      {viewingBill && (
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
                    Bill Date: {viewingBill.bill_date} | Due Date: {viewingBill.due_date}
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
                  <div className="font-medium text-stone-500 dark:text-stone-400 text-xs">Vendor / supplier</div>
                  <div className="font-semibold text-sm text-stone-900 dark:text-stone-100 mt-0.5">{viewingBill.supplier_name}</div>
                  {viewingBill.supplier_gstin && (
                    <div className="font-mono text-stone-500 text-xs mt-1">GSTIN: {viewingBill.supplier_gstin}</div>
                  )}
                </div>

                <div>
                  <div className="font-medium text-stone-500 dark:text-stone-400 text-xs">Accounts payable summary</div>
                  <div className="mt-1 text-stone-700 dark:text-stone-300">
                    <div>Balance due: <span className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums">{formatIndianCurrency(viewingBill.balance_amount)}</span></div>
                    <div>Paid amount: <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatIndianCurrency(viewingBill.paid_amount)}</span></div>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50/80 dark:bg-stone-900/60 text-stone-600 dark:text-stone-400 font-medium text-xs border-b border-stone-200 dark:border-stone-800">
                    <tr>
                      <th className="py-2 px-3">Item name</th>
                      <th className="py-2 px-2">HSN</th>
                      <th className="py-2 px-2 text-right">Qty</th>
                      <th className="py-2 px-2 text-right">Rate</th>
                      <th className="py-2 px-2 text-right">GST %</th>
                      <th className="py-2 px-3 text-right">Line total</th>
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
      )}

      {/* Warehouse Manager Modal (Create / Edit / Delete Warehouses right inside Purchases) */}
      {isWarehouseManagerOpen && (
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
                  <thead className="bg-stone-50/80 dark:bg-stone-900/60 text-stone-600 dark:text-stone-400 font-medium text-xs border-b border-stone-200 dark:border-stone-800">
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
                        <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
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
      )}
    </div>
  );
};
