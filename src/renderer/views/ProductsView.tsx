// src/renderer/views/ProductsView.tsx - Product Catalog & Service Registry
import React, { useState, useEffect } from 'react';
import { Product, Category, Unit } from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import { GST_RATES } from '../../shared/constants';
import {
  Package,
  Plus,
  Search,
  Filter,
  FileDown,
  Edit2,
  Trash2,
  X,
  AlertTriangle,
  Layers,
  Tags,
} from 'lucide-react';

interface Props {
  companyId: string;
}

export const ProductsView: React.FC<Props> = ({ companyId }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [itemTypeFilter, setItemTypeFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product>>({});
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatDesc, setNewCatDesc] = useState<string>('');

  useEffect(() => {
    if (companyId) {
      loadProducts();
      loadCategories();
    }
  }, [companyId, itemTypeFilter, categoryFilter]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (itemTypeFilter !== 'ALL') params.item_type = itemTypeFilter;
      if (categoryFilter) params.category_id = categoryFilter;

      const data = await api.getProducts(companyId, params);
      setProducts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const [cList, uList] = await Promise.all([
        api.getCategories(companyId),
        api.getUnits(companyId),
      ]);
      setCategories(cList);
      setUnits(uList);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    if (!editingProduct.name) {
      alert('Product name is required');
      return;
    }

    try {
      if (editingProduct.id) {
        await api.updateProduct(companyId, editingProduct.id, editingProduct);
      } else {
        await api.createProduct(companyId, editingProduct);
      }
      setIsModalOpen(false);
      setEditingProduct({});
      await loadProducts();
    } catch (err: any) {
      alert(err.message || 'Error saving product');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete/archive this item?')) return;
    try {
      await api.deleteProduct(companyId, id);
      await loadProducts();
    } catch (err: any) {
      alert(err.message || 'Error archiving product');
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) {
      alert('Please enter a category name');
      return;
    }
    try {
      await api.createCategory(companyId, newCatName.trim(), newCatDesc.trim());
      setNewCatName('');
      setNewCatDesc('');
      await loadCategories();
    } catch (err: any) {
      alert(err.message || 'Error creating category');
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    if (!window.confirm('Are you sure you want to delete this category? Products in this category will be unassigned.')) return;
    try {
      await api.deleteCategory(companyId, catId);
      await loadCategories();
      await loadProducts();
    } catch (err: any) {
      alert(err.message || 'Error deleting category');
    }
  };

  const filtered = products.filter((p) => {
    if (searchQuery) {
      const s = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(s) ||
        (p.sku && p.sku.toLowerCase().includes(s)) ||
        (p.hsn_or_sac && p.hsn_or_sac.toLowerCase().includes(s))
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
            <Package className="w-5 h-5 text-brand-600" />
            <span>Products & Services Catalogue</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage inventory items, HSN/SAC codes, GST tax rates, and selling prices
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <a
            href={api.getProductsExportUrl(companyId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700"
          >
            <FileDown className="w-4 h-4 text-slate-500" />
            <span>Export to Excel</span>
          </a>

          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700"
          >
            <Tags className="w-4 h-4 text-slate-500" />
            <span>Categories</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingProduct({
                item_type: 'PRODUCT',
                unit: 'NOS',
                gst_rate: '18.00',
                purchase_price: '0.00',
                selling_price: '0.00',
                minimum_stock: '5.00',
              });
              setIsModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Item</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar matching screenshot */}
      <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          {['ALL', 'PRODUCT', 'SERVICE'].map((t) => (
            <button
              key={t}
              onClick={() => setItemTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                itemTypeFilter === t
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {t === 'ALL' ? 'All Items' : t === 'PRODUCT' ? 'Products' : 'Services'}
            </button>
          ))}

          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 outline-none"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="relative w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search item name, SKU, HSN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Item Name</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">HSN / SAC</th>
              <th className="py-3 px-4">GST Rate</th>
              <th className="py-3 px-4 text-right">Selling Price</th>
              <th className="py-3 px-4 text-right">Stock on Hand</th>
              <th className="py-3 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  No items found. Click "+ New Item" to populate your catalog.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const isLowStock =
                  p.item_type === 'PRODUCT' &&
                  Number(p.minimum_stock) > 0 &&
                  Number(p.current_stock) <= Number(p.minimum_stock);

                return (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-white">{p.name}</div>
                      {p.sku && <div className="text-[10px] text-slate-400 font-mono">SKU: {p.sku}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          p.item_type === 'PRODUCT'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}
                      >
                        {p.item_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                      {p.category_name || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {p.hsn_or_sac}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                      {p.gst_rate}%
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                      {formatIndianCurrency(p.selling_price)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold">
                      {p.item_type === 'SERVICE' ? (
                        <span className="text-slate-400 font-normal">N/A (Service)</span>
                      ) : (
                        <span className={`inline-flex items-center space-x-1 ${isLowStock ? 'text-amber-600' : 'text-slate-800 dark:text-slate-200'}`}>
                          {isLowStock && <AlertTriangle className="w-3.5 h-3.5 mr-0.5" />}
                          <span>{p.current_stock} {p.unit}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct({ ...p });
                            setIsModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-brand-600"
                          title="Edit Item"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                          title="Archive Item"
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

      {/* Add / Edit Item Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <Package className="w-4 h-4 text-brand-600" />
                <span>{editingProduct.id ? 'Edit Item' : 'New Product / Service'}</span>
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Item Type *</label>
                  <select
                    value={editingProduct.item_type || 'PRODUCT'}
                    onChange={(e) => setEditingProduct({ ...editingProduct, item_type: e.target.value as any })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  >
                    <option value="PRODUCT">Physical Product (Track Stock)</option>
                    <option value="SERVICE">Professional Service (No Stock)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Item Name *</label>
                  <input
                    type="text"
                    placeholder="Product or Service Name"
                    value={editingProduct.name || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">HSN or SAC Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. 8517 or 9983"
                    value={editingProduct.hsn_or_sac || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, hsn_or_sac: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                  <select
                    value={editingProduct.category_id || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category_id: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  >
                    <option value="">-- No Category --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Selling Price (₹) *</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={editingProduct.selling_price || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, selling_price: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Purchase Price (₹)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={editingProduct.purchase_price || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, purchase_price: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">GST Tax Rate (%)</label>
                  <select
                    value={editingProduct.gst_rate || '18.00'}
                    onChange={(e) => setEditingProduct({ ...editingProduct, gst_rate: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  >
                    {GST_RATES.map((rate) => (
                      <option key={rate} value={rate}>{rate}%</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Unit of Measure</label>
                  <select
                    value={editingProduct.unit || 'NOS'}
                    onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-700"
                  >
                    {units.map((u) => (
                      <option key={u.code} value={u.code}>{u.name} ({u.code})</option>
                    ))}
                  </select>
                </div>
                {editingProduct.item_type === 'PRODUCT' && (
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Minimum Stock Alert</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="5"
                      value={editingProduct.minimum_stock || '0'}
                      onChange={(e) => setEditingProduct({ ...editingProduct, minimum_stock: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5"
                    />
                  </div>
                )}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">SKU / Code</label>
                  <input
                    type="text"
                    placeholder="e.g. PRD-1001"
                    value={editingProduct.sku || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
              </div>
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
                onClick={handleSave}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold shadow-sm"
              >
                Save Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <Tags className="w-4 h-4 text-brand-600" />
                <span>Manage Product Categories</span>
              </h2>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Add New Category */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="font-semibold text-slate-700 dark:text-slate-300">Add New Category</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Category Name (e.g. Hardware, Network, Services)"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="flex-1 border border-slate-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-800"
                  />
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded font-bold"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Existing Categories List */}
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                <div className="font-semibold text-slate-500 uppercase text-[10px]">Active Categories</div>
                {categories.length === 0 ? (
                  <div className="text-slate-400 py-3 text-center">No categories created yet.</div>
                ) : (
                  categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{cat.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                        title="Delete Category"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="px-4 py-1.5 border border-slate-300 rounded text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
