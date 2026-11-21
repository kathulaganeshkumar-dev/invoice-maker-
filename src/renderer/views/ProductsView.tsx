// src/renderer/views/ProductsView.tsx - Product Catalog & Service Registry
import React, { useState, useEffect, useMemo } from 'react';
import Decimal from 'decimal.js';
import { Product, Category, Unit } from '../../shared/types';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/finance/decimalCalc';
import { GST_RATES } from '../../shared/constants';
import { SearchableSelect } from '../components/SearchableSelect';
import { ModalPortal } from '../components/ModalPortal';
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
  StickyNote,
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
  const [showNotesSection, setShowNotesSection] = useState<boolean>(false);
  const [noteCountInput, setNoteCountInput] = useState<string>('');
  const [isInlineCatOpen, setIsInlineCatOpen] = useState<boolean>(false);
  const [inlineCatName, setInlineCatName] = useState<string>('');
  const [creatingInlineCat, setCreatingInlineCat] = useState<boolean>(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatDesc, setNewCatDesc] = useState<string>('');

  const categoryOptions = useMemo(() => {
    return [
      { value: '', label: '-- No Category --' },
      ...categories.map((c) => ({
        value: c.id,
        label: c.name,
      })),
    ];
  }, [categories]);

  const unitOptions = useMemo(() => {
    return units.map((u) => ({
      value: u.code,
      label: `${u.name} (${u.code})`,
      code: u.code,
    }));
  }, [units]);

  useEffect(() => {
    if (companyId) {
      loadProducts();
      loadCategories();
    }
  }, [companyId, itemTypeFilter, categoryFilter]);

  useEffect(() => {
    const handleSync = () => {
      if (companyId) loadProducts();
    };
    window.addEventListener('eim-data-changed', handleSync);
    window.addEventListener('eim-data-sync', handleSync);
    return () => {
      window.removeEventListener('eim-data-changed', handleSync);
      window.removeEventListener('eim-data-sync', handleSync);
    };
  }, [companyId]);

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

  const handleSetNoteCount = (rawCount: number) => {
    const count = Math.max(0, Math.min(200, Number.isFinite(rawCount) ? rawCount : 0));
    setEditingProduct((prev) => {
      const current = [...(prev.custom_notes || [])];
      if (count > current.length) {
        while (current.length < count) current.push('');
      } else {
        current.length = count;
      }
      return { ...prev, custom_notes: current };
    });
  };

  const handleNoteCountInputChange = (rawVal: string) => {
    const digitsOnly = rawVal.replace(/[^0-9]/g, '');
    if (!digitsOnly) {
      setNoteCountInput('');
      handleSetNoteCount(0);
      return;
    }
    const parsed = Math.min(200, parseInt(digitsOnly, 10));
    if (parsed <= 0) {
      setNoteCountInput('');
      handleSetNoteCount(0);
      return;
    }
    setNoteCountInput(String(parsed));
    handleSetNoteCount(parsed);
  };

  const handleAddNote = () => {
    setShowNotesSection(true);
    setEditingProduct((prev) => {
      const next = [...(prev.custom_notes || []), ''];
      setNoteCountInput(String(next.length));
      return {
        ...prev,
        custom_notes: next,
      };
    });
  };

  const handleUpdateNote = (index: number, value: string) => {
    setEditingProduct((prev) => {
      const next = [...(prev.custom_notes || [])];
      next[index] = value;
      return { ...prev, custom_notes: next };
    });
  };

  const handleRemoveNote = (index: number) => {
    setEditingProduct((prev) => {
      const next = (prev.custom_notes || []).filter((_, i) => i !== index);
      setNoteCountInput(next.length > 0 ? String(next.length) : '');
      return { ...prev, custom_notes: next };
    });
  };

  const handleCloseNotesSection = () => {
    setEditingProduct((prev) => {
      const cleaned = (prev.custom_notes || []).map((n) => n.trim()).filter((n) => n.length > 0);
      setNoteCountInput(cleaned.length > 0 ? String(cleaned.length) : '');
      return {
        ...prev,
        custom_notes: cleaned,
      };
    });
    setShowNotesSection(false);
  };

  const handleToggleNotesSection = () => {
    if (showNotesSection) {
      handleCloseNotesSection();
    } else {
      setShowNotesSection(true);
      const current = editingProduct.custom_notes || [];
      setNoteCountInput(current.length > 0 ? String(current.length) : '');
    }
  };

  const handleSave = async () => {
    if (!editingProduct.name) {
      alert('Product name is required');
      return;
    }

    const minPriceStr = editingProduct.min_selling_price?.toString().trim() || '';
    const maxPriceStr = editingProduct.max_selling_price?.toString().trim() || '';
    if (minPriceStr && maxPriceStr && new Decimal(minPriceStr).gt(new Decimal(maxPriceStr))) {
      alert('Minimum Selling Price cannot be greater than Maximum Selling Price.');
      return;
    }

    const effectiveSellingPrice =
      maxPriceStr || minPriceStr || editingProduct.selling_price?.toString().trim() || '0.00';

    const cleanedNotes = (editingProduct.custom_notes || [])
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    const payload: Partial<Product> = {
      ...editingProduct,
      selling_price: effectiveSellingPrice,
      min_selling_price: minPriceStr || null,
      max_selling_price: maxPriceStr || null,
      purchase_price: editingProduct.purchase_price?.toString().trim() || '0.00',
      minimum_stock: editingProduct.minimum_stock?.toString().trim() || '0.00',
      current_stock: editingProduct.current_stock?.toString().trim() || '0.00',
      custom_notes: cleanedNotes,
    };

    try {
      if (editingProduct.id) {
        await api.updateProduct(companyId, editingProduct.id, payload);
      } else {
        await api.createProduct(companyId, payload);
      }
      setIsModalOpen(false);
      setEditingProduct({});
      setShowNotesSection(false);
      setNoteCountInput('');
      window.dispatchEvent(
        new CustomEvent('eim-data-changed', {
          detail: { type: 'product', id: editingProduct.id, current_stock: payload.current_stock },
        })
      );
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

  const handleOpenEdit = (p: Product) => {
    const existingNotes = Array.isArray(p.custom_notes) ? [...p.custom_notes] : [];
    const legacyPrice =
      !p.min_selling_price && !p.max_selling_price && Number(p.selling_price) > 0
        ? p.selling_price
        : '';
    setEditingProduct({
      ...p,
      current_stock: p.current_stock !== undefined && p.current_stock !== null ? String(p.current_stock) : '0',
      selling_price: Number(p.selling_price) === 0 ? '' : p.selling_price,
      min_selling_price: p.min_selling_price ?? legacyPrice,
      max_selling_price: p.max_selling_price ?? '',
      purchase_price: Number(p.purchase_price) === 0 ? '' : p.purchase_price,
      minimum_stock: Number(p.minimum_stock) === 0 ? '' : p.minimum_stock,
      custom_notes: existingNotes,
    });
    setShowNotesSection(existingNotes.length > 0);
    setNoteCountInput(existingNotes.length > 0 ? String(existingNotes.length) : '');
    setIsInlineCatOpen(false);
    setInlineCatName('');
    setIsModalOpen(true);
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

  const handleCreateInlineCategory = async () => {
    const trimmed = inlineCatName.trim();
    if (!trimmed) {
      setIsInlineCatOpen(false);
      return;
    }
    const existing = categories.find((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setEditingProduct((prev) => ({ ...prev, category_id: existing.id }));
      setInlineCatName('');
      setIsInlineCatOpen(false);
      return;
    }
    setCreatingInlineCat(true);
    try {
      const created = await api.createCategory(companyId, trimmed, '');
      await loadCategories();
      setEditingProduct((prev) => ({ ...prev, category_id: created.id }));
      setInlineCatName('');
      setIsInlineCatOpen(false);
    } catch (err: any) {
      alert(err.message || 'Error creating category');
    } finally {
      setCreatingInlineCat(false);
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
        (p.hsn_or_sac && p.hsn_or_sac.toLowerCase().includes(s)) ||
        (p.custom_notes && p.custom_notes.some((n) => n.toLowerCase().includes(s)))
      );
    }
    return true;
  });

  return (
    <div className="p-6 space-y-5">
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
                current_stock: '0',
                gst_rate: '18.00',
                purchase_price: '',
                selling_price: '',
                min_selling_price: '',
                max_selling_price: '',
                minimum_stock: '',
                custom_notes: [],
              });
              setShowNotesSection(false);
              setNoteCountInput('');
              setIsInlineCatOpen(false);
              setInlineCatName('');
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
              <th className="py-3 px-4 text-right">Purchase Price</th>
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
                  <tr
                    key={p.id}
                    onClick={() => handleOpenEdit(p)}
                    className="cursor-pointer"
                    title={`Click to view/edit ${p.item_type === 'SERVICE' ? 'service' : 'product'} details`}
                  >
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(p);
                        }}
                        className="text-left font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                        title="Click to view and edit details"
                      >
                        {p.name}
                      </button>
                      {p.sku && <div className="text-[10px] text-slate-400 font-mono">SKU: {p.sku}</div>}
                      {p.custom_notes && p.custom_notes.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {p.custom_notes.slice(0, 2).map((note, idx) => (
                            <div
                              key={idx}
                              className="text-[10px] text-slate-500 dark:text-slate-400 flex items-start space-x-1"
                            >
                              <span className="font-mono text-brand-600 dark:text-brand-400 font-semibold shrink-0">
                                #{idx + 1}
                              </span>
                              <span className="truncate max-w-xs" title={note}>{note}</span>
                            </div>
                          ))}
                          {p.custom_notes.length > 2 && (
                            <div
                              className="text-[10px] text-brand-600 dark:text-brand-400 font-semibold"
                              title={p.custom_notes.map((n, i) => `#${i + 1}: ${n}`).join('\n')}
                            >
                              +{p.custom_notes.length - 2} more note{p.custom_notes.length - 2 > 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          p.item_type === 'PRODUCT'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                            : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600'
                        }`}
                      >
                        {p.item_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                      {p.category_name || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {p.hsn_or_sac || '-'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                      {p.gst_rate}%
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                      {p.min_selling_price && p.max_selling_price ? (
                        <div>
                          {formatIndianCurrency(p.min_selling_price)} – {formatIndianCurrency(p.max_selling_price)}
                        </div>
                      ) : p.min_selling_price ? (
                        <div>Min {formatIndianCurrency(p.min_selling_price)}</div>
                      ) : p.max_selling_price ? (
                        <div>Max {formatIndianCurrency(p.max_selling_price)}</div>
                      ) : (
                        <div>{formatIndianCurrency(p.selling_price)}</div>
                      )}
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
                    <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                      {Number(p.purchase_price) > 0 ? (
                        formatIndianCurrency(p.purchase_price)
                      ) : (
                        <span className="text-slate-400 font-normal">₹ 0.00</span>
                      )}
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
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <Package className="w-4 h-4 text-brand-600" />
                <span>
                  {editingProduct.id
                    ? `${editingProduct.item_type === 'SERVICE' ? 'Service' : 'Product'} Details & Settings`
                    : 'New Product / Service'}
                </span>
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Item Type *</label>
                  </div>
                  <select
                    value={editingProduct.item_type || 'PRODUCT'}
                    onChange={(e) => setEditingProduct({ ...editingProduct, item_type: e.target.value as any })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
                    <option value="PRODUCT">Physical Product (Track Stock)</option>
                    <option value="SERVICE">Professional Service (No Stock)</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Item Name *</label>
                    <button
                      type="button"
                      onClick={handleToggleNotesSection}
                      className={`inline-flex items-center space-x-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-colors ${
                        showNotesSection
                          ? 'bg-brand-600 text-white border-brand-700 hover:bg-brand-700'
                          : 'text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300 border-brand-200 dark:border-brand-700'
                      }`}
                      title={showNotesSection ? 'Save & close notes section' : 'Add or edit custom notes for this item'}
                    >
                      <StickyNote className="w-3 h-3" />
                      <span>
                        {(() => {
                          const filledCount = (editingProduct.custom_notes || []).filter((n) => n.trim().length > 0).length;
                          if (showNotesSection) {
                            return filledCount > 0 ? `Done (${filledCount})` : 'Close Note';
                          }
                          return filledCount > 0 ? `Notes (${filledCount})` : '+ Add Note';
                        })()}
                      </span>
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Product or Service Name"
                    value={editingProduct.name || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>

                {showNotesSection && (
                  <div className="col-span-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700 pb-2">
                      <div className="flex items-center space-x-2">
                        <StickyNote className="w-4 h-4 text-brand-600 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                            Custom Product Notes
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Enter number of products to create matching notes (e.g. warranty, hard disk / serial numbers)
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <label className="flex items-center space-x-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          <span>No. of Products:</span>
                          <input
                            type="number"
                            min={1}
                            max={200}
                            placeholder="Qty"
                            value={noteCountInput}
                            onChange={(e) => handleNoteCountInputChange(e.target.value)}
                            className="w-16 h-8 border border-slate-300 dark:border-slate-600 rounded px-2 text-center font-mono bg-white dark:bg-slate-800"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleAddNote}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-[11px] font-semibold shadow-xs transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Note</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCloseNotesSection}
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors"
                          title="Save & close notes"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {(editingProduct.custom_notes || []).length === 0 ? (
                      <div className="text-center py-3 text-[11px] text-slate-400">
                        Enter number of products above or click <span className="font-semibold text-brand-600">+ Add Note</span> to add notes.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {(editingProduct.custom_notes || []).map((note, idx) => (
                          <div key={idx} className="flex items-center space-x-2">
                            <span className="w-8 shrink-0 text-center py-1 bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded font-mono text-[11px] font-bold">
                              #{idx + 1}
                            </span>
                            <input
                              type="text"
                              placeholder={`Note #${idx + 1} (e.g. Warranty: 3 Years, Hard Disk No: SN-00${idx + 1})`}
                              value={note}
                              onChange={(e) => handleUpdateNote(idx, e.target.value)}
                              className="flex-1 h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 bg-white dark:bg-slate-800 text-xs outline-none focus:ring-1 focus:ring-brand-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveNote(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
                              title={`Remove Note #${idx + 1}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">HSN or SAC Code *</label>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. 8517 or 9983"
                    value={editingProduct.hsn_or_sac || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, hsn_or_sac: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Category</label>
                    <button
                      type="button"
                      onClick={() => {
                        if (isInlineCatOpen) {
                          setIsInlineCatOpen(false);
                          setInlineCatName('');
                        } else {
                          setIsInlineCatOpen(true);
                        }
                      }}
                      className={`inline-flex items-center space-x-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-colors ${
                        isInlineCatOpen
                          ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
                          : 'text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700'
                      }`}
                      title={isInlineCatOpen ? 'Close new category input' : 'Create a new category and save it'}
                    >
                      <Tags className="w-3 h-3" />
                      <span>{isInlineCatOpen ? 'Close' : '+ New Category'}</span>
                    </button>
                  </div>
                  <SearchableSelect
                    options={categoryOptions}
                    value={editingProduct.category_id || ''}
                    onChange={(val) => setEditingProduct({ ...editingProduct, category_id: val })}
                    placeholder="-- No Category --"
                  />
                  {isInlineCatOpen && (
                    <div className="mt-2 flex items-center space-x-1.5 p-2 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Category name (e.g. Storage, Hardware)"
                        value={inlineCatName}
                        onChange={(e) => setInlineCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateInlineCategory();
                          } else if (e.key === 'Escape') {
                            setIsInlineCatOpen(false);
                            setInlineCatName('');
                          }
                        }}
                        className="flex-1 min-w-0 h-8 border border-slate-300 dark:border-slate-600 rounded px-2 text-xs bg-white dark:bg-slate-800 outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        disabled={creatingInlineCat || !inlineCatName.trim()}
                        onClick={handleCreateInlineCategory}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold disabled:opacity-50 transition-colors shrink-0"
                      >
                        {creatingInlineCat ? 'Saving...' : 'Add'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsInlineCatOpen(false);
                          setInlineCatName('');
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Selling Price (₹) *</label>
                    <span className="text-[10px] text-slate-400 font-normal">Min / Max Range</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Min Price"
                      value={editingProduct.min_selling_price ?? ''}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, min_selling_price: e.target.value })
                      }
                      className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Max Price"
                      value={editingProduct.max_selling_price ?? ''}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, max_selling_price: e.target.value })
                      }
                      className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Purchase Price (₹)</label>
                    <span className="text-[10px] text-slate-400 font-normal">Cost of acquisition</span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={editingProduct.purchase_price ?? ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, purchase_price: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">GST Tax Rate (%)</label>
                  </div>
                  <select
                    value={editingProduct.gst_rate || '18.00'}
                    onChange={(e) => setEditingProduct({ ...editingProduct, gst_rate: e.target.value })}
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
                    value={editingProduct.unit || 'NOS'}
                    onChange={(val) => setEditingProduct({ ...editingProduct, unit: val })}
                    placeholder="Search unit (e.g. NOS, PCS, KG)..."
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      {editingProduct.id ? 'Stock on Hand / Quantity' : 'Opening Stock'}
                    </label>
                    <span className="text-[10px] text-slate-400 font-normal">
                      {editingProduct.id ? 'Current stock count' : 'Initial quantity'}
                    </span>
                  </div>
                  {editingProduct.item_type === 'PRODUCT' ? (
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0"
                      value={editingProduct.current_stock ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, current_stock: e.target.value })}
                      className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  ) : (
                    <div className="w-full h-9 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg px-3 flex items-center text-slate-400 text-xs italic bg-slate-50/50 dark:bg-slate-800/50">
                      Not applicable for services
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Minimum Stock Alert</label>
                  </div>
                  {editingProduct.item_type === 'PRODUCT' ? (
                    <input
                      type="number"
                      step="any"
                      placeholder="5"
                      value={editingProduct.minimum_stock ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, minimum_stock: e.target.value })}
                      className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  ) : (
                    <div className="w-full h-9 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg px-3 flex items-center text-slate-400 text-xs italic bg-slate-50/50 dark:bg-slate-800/50">
                      Not applicable for services
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">SKU / Code</label>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. PRD-1001"
                    value={editingProduct.sku || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between h-6 mb-1.5">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Barcode / EAN</label>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. 8901234567890"
                    value={editingProduct.barcode || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, barcode: e.target.value })}
                    className="w-full h-9 border border-slate-300 dark:border-slate-600 rounded-lg px-3 text-xs font-mono bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
              <div>
                {editingProduct.id && (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingProduct.id) {
                        handleDelete(editingProduct.id);
                        setIsModalOpen(false);
                      }
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg font-semibold transition-colors border border-rose-200 dark:border-rose-900/50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete {editingProduct.item_type === 'SERVICE' ? 'Service' : 'Product'}</span>
                  </button>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs font-semibold"
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
        </div>
        </ModalPortal>
      )}

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <ModalPortal>
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
        </ModalPortal>
      )}
    </div>
  );
};
