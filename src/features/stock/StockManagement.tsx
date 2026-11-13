import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StockService } from '../../services/stockService';
import type { StockItem, ItemVariant, PurchaseHistoryEntry } from '../../types';
import { formatCurrency, formatQuantity, calculateWeightedAveragePrice } from '../../utils/pricing';
import { useAppStore, scheduleCloudSync } from '../../store/useAppStore';
import {
  Plus,
  Search,
  AlertTriangle,
  Info,
  Archive,
  X,
  History,
  Trash2,
  Edit3,
  Layers,
  List,
  Check,
  FolderEdit,
} from 'lucide-react';

async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return text;
}

export const StockManagement: React.FC = () => {
  const { t } = useTranslation();
  const { canAccess, currentUser, currency } = useAppStore();
  const [items, setItems] = useState<StockItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grouped'>('table');

  // Modal states
  const [selectedItemForBatch, setSelectedItemForBatch] = useState<StockItem | null>(null);
  const [selectedItemForHistory, setSelectedItemForHistory] = useState<StockItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);

  // Restock Form state (supports both non-variant batch restock and variant-level restock)
  const [batchVariantsState, setBatchVariantsState] = useState<(ItemVariant & { addedQty?: number; newBatchCost?: number })[]>([]);
  const [batchQty, setBatchQty] = useState<number>(10);
  const [batchCostPrice, setBatchCostPrice] = useState<number>(0);
  const [newSellingPrice, setNewSellingPrice] = useState<number>(0);
  const [batchSupplier, setBatchSupplier] = useState('');

  // Cost price visibility (Web Crypto SHA-256 / fallback protected)
  const [costUnlocked, setCostUnlocked] = useState(false);
  const [showCostPasswordModal, setShowCostPasswordModal] = useState(false);
  const [costPasswordInput, setCostPasswordInput] = useState('');
  const [costPasswordError, setCostPasswordError] = useState('');

  // Categories
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // Item Creation / Edit state + Variant Builder
  const [newItemName, setNewItemName] = useState('');
  const [newItemHindiName, setNewItemHindiName] = useState('');
  const [newItemId, setNewItemId] = useState('');
  const [newItemSerial, setNewItemSerial] = useState('');
  const [newItemShelf, setNewItemShelf] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemUnit, setNewItemUnit] = useState<'count' | 'weight' | 'both'>('count');
  const [newItemInitialQty, setNewItemInitialQty] = useState<number>(10);
  const [newItemThreshold, setNewItemThreshold] = useState<number>(5);
  const [newItemPurchasePrice, setNewItemPurchasePrice] = useState<number>(100);
  const [newItemSellPrice, setNewItemSellPrice] = useState<number>(150);
  const [hasVariants, setHasVariants] = useState<boolean>(false);
  const [variantsList, setVariantsList] = useState<ItemVariant[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const canViewCostPrice = canAccess('view_cost_price');
  const canEditStock = canAccess('edit_stock');
  const canDeleteStock = canAccess('edit_stock');

  const handleUnlockCost = async (e: React.FormEvent) => {
    e.preventDefault();
    const pass = costPasswordInput.trim();
    if (!pass || !currentUser) {
      setCostPasswordError('Incorrect password/PIN');
      return;
    }

    const inputHash = await sha256Hex(pass);
    const storedPass = currentUser.password || '';
    const storedPin = currentUser.pinCode || '';
    const storedPassHash = storedPass ? await sha256Hex(storedPass) : '';
    const storedPinHash = storedPin ? await sha256Hex(storedPin) : '';

    const valid =
      (storedPass && (storedPass === inputHash || storedPassHash === inputHash)) ||
      (storedPin && (storedPin === inputHash || storedPinHash === inputHash));

    if (valid) {
      setCostUnlocked(true);
      setShowCostPasswordModal(false);
      setCostPasswordInput('');
      setCostPasswordError('');
    } else {
      setCostPasswordError('Incorrect password/PIN');
    }
  };

  const handleDeleteItem = async (item: StockItem) => {
    if (!window.confirm(`Delete "${item.name}" (${item.id}) from stock? This cannot be undone.`)) {
      return;
    }
    try {
      await StockService.deleteItem(item.id);
      await loadStock();
      scheduleCloudSync();
    } catch (err) {
      console.error('Failed to delete item', err);
      alert('Failed to delete item.');
    }
  };

  const loadStock = async () => {
    try {
      const data = await StockService.searchItems(searchQuery);
      setItems(data);
    } catch (err) {
      console.error('Failed to load items', err);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await StockService.getAllCategories();
      setCategories(data);
    } catch (err) {
      console.error('Failed to load categories', err);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadStock();
  }, [searchQuery]);

  // Category Handlers
  const openCategoryModal = (catToEdit?: { id: string; name: string }) => {
    setNewCategoryName('');
    if (catToEdit) {
      setEditingCategoryId(catToEdit.id);
      setEditingCategoryName(catToEdit.name);
    } else {
      setEditingCategoryId(null);
      setEditingCategoryName('');
    }
    setShowCategoryModal(true);
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setNewCategoryName('');
    setEditingCategoryId(null);
    setEditingCategoryName('');
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    try {
      await StockService.addCategory(trimmed);
      setNewCategoryName('');
      await loadCategories();
      scheduleCloudSync();
    } catch (err: any) {
      alert(err?.message || 'Failed to add category');
    }
  };

  const handleSaveCategoryEdit = async (categoryId: string) => {
    const trimmed = editingCategoryName.trim();
    if (!trimmed) return;
    try {
      await StockService.updateCategory(categoryId, trimmed);
      setEditingCategoryId(null);
      setEditingCategoryName('');
      await loadCategories();
      await loadStock();
      scheduleCloudSync();
    } catch (err: any) {
      alert(err?.message || 'Failed to update category');
    }
  };

  // Variant Builder Helpers
  const handleAddVariantRow = () => {
    setVariantsList((prev) => [
      ...prev,
      {
        id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        color: '',
        size: '',
        barcode: '',
        quantityLeft: 5,
        threshold: newItemThreshold || 2,
        purchasePrice: Number(newItemPurchasePrice) || 0,
        sellingPrice: Number(newItemSellPrice) || 0,
        shelfLocation: newItemShelf || '',
      },
    ]);
  };

  const handleUpdateVariantRow = (id: string, field: keyof ItemVariant, value: string | number) => {
    setVariantsList((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  };

  const handleRemoveVariantRow = (id: string) => {
    setVariantsList((prev) => prev.filter((v) => v.id !== id));
  };

  // Item Modal Handlers
  const closeItemModal = () => {
    setIsAddModalOpen(false);
    setEditingItem(null);
    setNewItemName('');
    setNewItemHindiName('');
    setNewItemId('');
    setNewItemSerial('');
    setNewItemShelf('');
    setNewItemCategory('');
    setNewItemUnit('count');
    setNewItemInitialQty(10);
    setNewItemThreshold(5);
    setNewItemPurchasePrice(100);
    setNewItemSellPrice(150);
    setHasVariants(false);
    setVariantsList([]);
  };

  const handleOpenAddModal = () => {
    closeItemModal();
    setIsAddModalOpen(true);
  };

  const handleOpenRestock = (item: StockItem) => {
    setSelectedItemForBatch(item);
    setBatchCostPrice(item.averagePurchasePrice || 100);
    setNewSellingPrice(item.sellingPrice || 150);
    setBatchQty(10);
    setBatchSupplier('');
    setBatchVariantsState(
      item.variants
        ? item.variants.map((v) => ({
            ...v,
            addedQty: 0,
            newBatchCost: v.purchasePrice || item.averagePurchasePrice || 0,
          }))
        : []
    );
  };

  const handleOpenEditItem = (item: StockItem) => {
    setEditingItem(item);
    setNewItemId(item.id);
    setNewItemSerial(item.serialNumber || '');
    setNewItemName(item.name);
    setNewItemHindiName(item.hindiName || '');
    setNewItemShelf(item.shelfLocation);
    setNewItemCategory(item.category || '');
    setNewItemUnit(item.unitType);
    setNewItemInitialQty(item.quantityLeft);
    setNewItemThreshold(item.threshold);
    setNewItemPurchasePrice(item.averagePurchasePrice);
    setNewItemSellPrice(item.sellingPrice);
    setHasVariants(Boolean(item.hasVariants && item.variants && item.variants.length > 0));
    setVariantsList(item.variants ? [...item.variants] : []);
    setIsAddModalOpen(true);
  };

  const handleSaveRestockBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForBatch) return;

    try {
      if (selectedItemForBatch.hasVariants && batchVariantsState.length > 0) {
        const now = new Date().toISOString();
        const newHistoryEntries: PurchaseHistoryEntry[] = [];

        const updatedVariants: ItemVariant[] = batchVariantsState.map((v) => {
          const added = Number(v.addedQty) || 0;
          const batchCost = Number(v.newBatchCost) || Number(v.purchasePrice) || 0;
          const existingQty = Number(v.quantityLeft) || 0;
          const existingCost = Number(v.purchasePrice) || 0;

          const newAvgVariantCost =
            added > 0
              ? calculateWeightedAveragePrice(existingQty, existingCost, added, batchCost)
              : existingCost;

          const nextQty = existingQty + added;

          if (added > 0) {
            newHistoryEntries.push({
              id: `ph-var-${v.id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              date: now,
              quantity: added,
              purchasePrice: batchCost,
              supplier: batchSupplier.trim()
                ? `${batchSupplier.trim()} (${v.color || ''} ${v.size || ''})`.trim()
                : `Variant Restock (${v.color || ''} ${v.size || ''})`.trim(),
            });
          }

          const { addedQty, newBatchCost, ...cleanVariant } = v;
          return {
            ...cleanVariant,
            quantityLeft: nextQty,
            purchasePrice: newAvgVariantCost,
            sellingPrice: Number(v.sellingPrice) || 0,
            threshold: Number(v.threshold) || 0,
            shelfLocation: v.shelfLocation?.trim() || selectedItemForBatch.shelfLocation,
          };
        });

        const totalStock = updatedVariants.reduce((sum, v) => sum + v.quantityLeft, 0);
        const totalValue = updatedVariants.reduce(
          (sum, v) => sum + v.quantityLeft * (v.purchasePrice || 0),
          0
        );
        const overallAvgCost =
          totalStock > 0
            ? Number((totalValue / totalStock).toFixed(2))
            : selectedItemForBatch.averagePurchasePrice;

        await StockService.updateItem(selectedItemForBatch.id, {
          variants: updatedVariants,
          quantityLeft: totalStock,
          averagePurchasePrice: overallAvgCost,
          purchaseHistory: [
            ...(selectedItemForBatch.purchaseHistory || []),
            ...newHistoryEntries,
          ],
          updatedAt: now,
        });
      } else {
        await StockService.addRestockBatch(
          selectedItemForBatch.id,
          Number(batchQty),
          Number(batchCostPrice),
          batchSupplier,
          Number(newSellingPrice)
        );
      }

      setSelectedItemForBatch(null);
      await loadStock();
      scheduleCloudSync();
    } catch (err: any) {
      console.error('Failed to save restock batch', err);
      alert(err?.message || 'Failed to save restock batch.');
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !newItemId.trim() || !newItemShelf.trim()) {
      alert('Please fill ID, Name, and Shelf location');
      return;
    }
    if (!newItemCategory) {
      alert('Please select a category');
      return;
    }
    if (hasVariants && variantsList.length === 0) {
      alert('Please add at least one variant or uncheck "Enable Variants".');
      return;
    }

    const now = new Date().toISOString();
    const isEdit = Boolean(editingItem);
    const itemId = editingItem?.id || newItemId.trim().toUpperCase();

    const cleanedVariants: ItemVariant[] | undefined = hasVariants
      ? variantsList.map((v) => ({
          ...v,
          id: v.id || `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          color: (v.color || '').trim(),
          size: (v.size || '').trim(),
          barcode: (v.barcode || '').trim(),
          quantityLeft: Number(v.quantityLeft) || 0,
          threshold: Number(v.threshold) || Number(newItemThreshold) || 0,
          purchasePrice: Number(v.purchasePrice) || Number(newItemPurchasePrice) || 0,
          sellingPrice: Number(v.sellingPrice) || Number(newItemSellPrice) || 0,
          shelfLocation: (v.shelfLocation || newItemShelf).trim().toUpperCase(),
        }))
      : undefined;

    const computedTotalQty =
      hasVariants && cleanedVariants
        ? cleanedVariants.reduce((sum, v) => sum + v.quantityLeft, 0)
        : Number(newItemInitialQty);

    const computedAvgCost =
      hasVariants && cleanedVariants && computedTotalQty > 0
        ? Number(
            (
              cleanedVariants.reduce((sum, v) => sum + v.quantityLeft * v.purchasePrice, 0) /
              computedTotalQty
            ).toFixed(2)
          )
        : Number(newItemPurchasePrice);

    try {
      if (isEdit) {
        const updateData: Partial<StockItem> = {
          serialNumber: newItemSerial.trim() || `SN-${itemId}`,
          name: newItemName.trim(),
          hindiName: newItemHindiName.trim() || undefined,
          category: newItemCategory.trim(),
          shelfLocation: newItemShelf.trim().toUpperCase(),
          unitType: newItemUnit,
          hasVariants,
          variants: cleanedVariants,
          quantityLeft: computedTotalQty,
          threshold: Number(newItemThreshold),
          sellingPrice: Number(newItemSellPrice),
          averagePurchasePrice: computedAvgCost,
          updatedAt: now,
        };
        await StockService.updateItem(itemId, updateData);
      } else {
        const createdItem: StockItem = {
          id: itemId,
          serialNumber: newItemSerial.trim() || `SN-${itemId}`,
          name: newItemName.trim(),
          hindiName: newItemHindiName.trim() || undefined,
          category: newItemCategory.trim(),
          shelfLocation: newItemShelf.trim().toUpperCase(),
          unitType: newItemUnit,
          hasVariants,
          variants: cleanedVariants,
          quantityLeft: computedTotalQty,
          threshold: Number(newItemThreshold),
          sellingPrice: Number(newItemSellPrice),
          averagePurchasePrice: computedAvgCost,
          purchaseHistory: [
            {
              id: `ph-init-${Date.now()}`,
              date: now,
              quantity: computedTotalQty,
              purchasePrice: computedAvgCost,
              supplier: 'Initial Inventory Stock',
            },
          ],
          createdAt: now,
          updatedAt: now,
        };
        await StockService.createItem(createdItem);
      }

      closeItemModal();
      await loadStock();
      scheduleCloudSync();
    } catch (err: any) {
      console.error('Failed to save item', err);
      alert(err?.message || 'Failed to save item.');
    }
  };

  const filteredItems = items.filter((item) => {
    const query = searchQuery.trim().toLowerCase();

    if (filterLowStockOnly) {
      const hasLowStockVariant =
        item.hasVariants && item.variants
          ? item.variants.some((v) => v.quantityLeft <= v.threshold)
          : false;
      if (item.quantityLeft > item.threshold && !hasLowStockVariant) return false;
    }

    if (categoryFilter !== 'all' && (item.category || '') !== categoryFilter) return false;

    if (!query) return true;

    const matchesMain =
      item.name.toLowerCase().includes(query) ||
      (item.hindiName && item.hindiName.toLowerCase().includes(query)) ||
      item.id.toLowerCase().includes(query) ||
      item.shelfLocation.toLowerCase().includes(query) ||
      (item.category && item.category.toLowerCase().includes(query)) ||
      (item.serialNumber && item.serialNumber.toLowerCase().includes(query));

    const matchesVariant =
      item.hasVariants && item.variants
        ? item.variants.some(
            (v) =>
              v.id.toLowerCase().includes(query) ||
              (v.color && v.color.toLowerCase().includes(query)) ||
              (v.size && v.size.toLowerCase().includes(query)) ||
              (v.shelfLocation && v.shelfLocation.toLowerCase().includes(query)) ||
              (v.barcode && v.barcode.toLowerCase().includes(query))
          )
        : false;

    return matchesMain || matchesVariant;
  });

  const renderItemRow = (item: StockItem, showCategoryColumn: boolean) => {
    const isLow = item.quantityLeft <= item.threshold;
    const isOut = item.quantityLeft <= 0;

    return (
      <tr
        key={item.id}
        className={`hover:bg-slate-50/80 transition ${isLow ? 'bg-amber-50/40' : ''}`}
      >
        <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
          {item.serialNumber || '—'}
        </td>

        <td className="py-3.5 px-4">
          <span
            className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md ${
              isLow
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {item.id}
          </span>
        </td>

        {showCategoryColumn && (
          <td className="py-3.5 px-4">
            <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
              {categories.find((c) => c.id === item.category)?.name || item.category || 'Uncategorized'}
            </span>
          </td>
        )}

        <td className="py-3.5 px-4">
          <div className="flex flex-col">
            <span className={`font-semibold ${isLow ? 'text-amber-700 font-bold' : 'text-slate-900'}`}>
              {item.name}
            </span>
            {item.hindiName && (
              <span className="text-xs text-slate-500 font-normal">{item.hindiName}</span>
            )}

            {item.hasVariants && item.variants && (
              <div className="flex flex-wrap gap-1 mt-1">
                {item.variants.map((v: any) => (
                  <span
                    key={v.id}
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      v.quantityLeft <= v.threshold
                        ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                    title={`ID: ${v.id} | Serial: ${v.barcode || 'N/A'} | Shelf: ${v.shelfLocation || item.shelfLocation} | Cost: ₹${v.purchasePrice} | Price: ₹${v.sellingPrice}`}
                  >
                    {v.color || ''} {v.size || ''} ({v.quantityLeft})
                  </span>
                ))}
              </div>
            )}
          </div>
        </td>

        <td className="py-3.5 px-4 text-center">
          <span className="inline-block px-2.5 py-0.5 bg-indigo-50 text-indigo-700 font-mono text-xs font-semibold rounded-md border border-indigo-100">
            {item.shelfLocation}
          </span>
        </td>

        <td className="py-3.5 px-4 text-center">
          <div className="flex flex-col items-center">
            <span
              className={`font-bold ${
                isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-emerald-700'
              }`}
            >
              {formatQuantity(item.quantityLeft, item.unitType)}
            </span>
            {isLow && (
              <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 rounded mt-0.5">
                {t('stock.lowStockBadge')} (&le; {item.threshold})
              </span>
            )}
          </div>
        </td>

        {canViewCostPrice && costUnlocked && (
          <td className="py-3.5 px-4 text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span className="font-medium text-slate-700">
                {formatCurrency(item.averagePurchasePrice, currency)}
              </span>
              <button
                onClick={() => setSelectedItemForHistory(item)}
                className="text-slate-400 hover:text-indigo-600 transition p-0.5 rounded"
                title="Click to view purchase batches & average price history"
              >
                <Info className="w-4 h-4 text-indigo-500 hover:scale-110 transition" />
              </button>
            </div>
          </td>
        )}

        <td className="py-3.5 px-4 text-right font-bold text-slate-900">
          {formatCurrency(item.sellingPrice, currency)}
        </td>

        <td className="py-3.5 px-4 text-center">
          <div className="flex items-center justify-center gap-1.5">
            {canEditStock && (
              <button
                onClick={() => handleOpenEditItem(item)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
              >
                Edit
              </button>
            )}
            {canEditStock && (
              <button
                onClick={() => handleOpenRestock(item)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
              >
                + Restock
              </button>
            )}
            {canDeleteStock && (
              <button
                onClick={() => handleDeleteItem(item)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                title="Delete item"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const validCategoryIds = new Set(categories.map((c) => c.id));
  const groupedSections = [
    ...categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      isRealCategory: true,
      items: filteredItems.filter((item) => item.category === cat.id),
    })),
    {
      id: '__uncategorized__',
      name: 'Uncategorized',
      isRealCategory: false,
      items: filteredItems.filter((item) => !item.category || !validCategoryIds.has(item.category)),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="space-y-6">
      {/* Top Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Archive className="w-6 h-6 text-indigo-600" />
            {t('stock.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('stock.subtitle')}</p>
        </div>

        {canEditStock && (
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-sm shadow-indigo-100 transition"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('stock.addItem')}
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('stock.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {/* View Toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-semibold transition ${
                viewMode === 'table'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5 mr-1" /> All Items
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={`inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-semibold transition ${
                viewMode === 'grouped'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 mr-1" /> By Category
            </button>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
            className={`inline-flex items-center px-3.5 py-2 rounded-lg text-xs font-semibold transition border ${
              filterLowStockOnly
                ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle
              className={`w-3.5 h-3.5 mr-1.5 ${filterLowStockOnly ? 'text-white' : 'text-amber-500'}`}
            />
            {t('stock.filterLowStock')}
          </button>

          {canViewCostPrice && (
            <button
              onClick={() => (costUnlocked ? setCostUnlocked(false) : setShowCostPasswordModal(true))}
              className="inline-flex items-center px-3.5 py-2 rounded-lg text-xs font-semibold transition border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
            >
              {costUnlocked ? 'Hide Cost Prices' : 'Show Cost Prices'}
            </button>
          )}

          {canEditStock && (
            <button
              onClick={() => openCategoryModal()}
              className="inline-flex items-center px-3.5 py-2 rounded-lg text-xs font-semibold transition border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
            >
              <FolderEdit className="w-3.5 h-3.5 mr-1.5" /> Categories
            </button>
          )}
        </div>
      </div>

      {/* Main Content View */}
      {viewMode === 'table' ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">{t('stock.table.serial')}</th>
                  <th className="py-3 px-4">{t('stock.table.id')}</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">{t('stock.table.name')}</th>
                  <th className="py-3 px-4 text-center">{t('stock.table.shelf')}</th>
                  <th className="py-3 px-4 text-center">{t('stock.table.qtyLeft')}</th>
                  {canViewCostPrice && costUnlocked && (
                    <th className="py-3 px-4 text-right">{t('stock.table.avgCost')}</th>
                  )}
                  <th className="py-3 px-4 text-right">{t('stock.table.sellingPrice')}</th>
                  <th className="py-3 px-4 text-center">{t('stock.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canViewCostPrice && costUnlocked ? 9 : 8}
                      className="py-12 text-center text-slate-400"
                    >
                      No items found matching criteria
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => renderItemRow(item, true))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedSections.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl py-12 text-center text-slate-400 text-sm">
              No items found matching criteria
            </div>
          ) : (
            groupedSections.map((group) => {
              const allCountBased = group.items.every((i) => i.unitType === 'count');
              const totalCount = group.items.reduce((sum, i) => sum + i.quantityLeft, 0);

              return (
                <div
                  key={group.id}
                  className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden"
                >
                  <div className="bg-indigo-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-indigo-800">
                        {group.name} ({group.items.length} items)
                      </h3>
                      {canEditStock && group.isRealCategory && (
                        <button
                          type="button"
                          onClick={() => openCategoryModal({ id: group.id, name: group.name })}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-white/80 hover:bg-white text-indigo-700 border border-indigo-200 transition"
                          title="Edit category name"
                        >
                          <Edit3 className="w-3 h-3" /> Edit
                        </button>
                      )}
                    </div>
                    {allCountBased && (
                      <span className="text-xs text-indigo-600 font-semibold">
                        Total Qty: {totalCount} pcs
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          <th className="py-3 px-4">{t('stock.table.serial')}</th>
                          <th className="py-3 px-4">{t('stock.table.id')}</th>
                          <th className="py-3 px-4">{t('stock.table.name')}</th>
                          <th className="py-3 px-4 text-center">{t('stock.table.shelf')}</th>
                          <th className="py-3 px-4 text-center">{t('stock.table.qtyLeft')}</th>
                          {canViewCostPrice && costUnlocked && (
                            <th className="py-3 px-4 text-right">{t('stock.table.avgCost')}</th>
                          )}
                          <th className="py-3 px-4 text-right">{t('stock.table.sellingPrice')}</th>
                          <th className="py-3 px-4 text-center">{t('stock.table.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.items.map((item) => renderItemRow(item, false))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Info CTA Modal: Detailed Purchase Batches and Weighted Average History */}
      {selectedItemForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div>
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  Purchase Cost Audit History
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedItemForHistory.name} ({selectedItemForHistory.id})
                </p>
              </div>
              <button
                onClick={() => setSelectedItemForHistory(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-100 flex items-center justify-between">
              <div>
                <div className="text-xs text-indigo-700 font-medium">Current Weighted Average Cost</div>
                <div className="text-xl font-black text-indigo-950 mt-0.5">
                  {formatCurrency(selectedItemForHistory.averagePurchasePrice, currency)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-indigo-700 font-medium">In-Stock Quantity</div>
                <div className="text-lg font-bold text-indigo-900">
                  {formatQuantity(selectedItemForHistory.quantityLeft, selectedItemForHistory.unitType)}
                </div>
              </div>
            </div>

            {/* Variant-level Average Cost Breakdown */}
            {selectedItemForHistory.hasVariants &&
              selectedItemForHistory.variants &&
              selectedItemForHistory.variants.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Variant Cost & Stock Breakdown
                  </h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {selectedItemForHistory.variants.map((v) => (
                      <div key={v.id} className="p-2.5 text-xs flex items-center justify-between bg-slate-50/60">
                        <div>
                          <span className="font-bold text-slate-800">
                            {v.color || ''} {v.size || ''}
                          </span>
                          <span className="ml-2 text-[10px] font-mono text-slate-500">
                            ({v.id} • {v.barcode || 'No Serial'})
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-indigo-700">
                            Avg Cost: {formatCurrency(v.purchasePrice, currency)}
                          </span>
                          <span className="text-slate-400 ml-2">({v.quantityLeft} in stock)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Batches Added Log
              </h4>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {selectedItemForHistory.purchaseHistory && selectedItemForHistory.purchaseHistory.length > 0 ? (
                  selectedItemForHistory.purchaseHistory.map((ph: any, idx: number) => (
                    <div
                      key={ph.id || idx}
                      className="p-3 text-xs flex items-center justify-between hover:bg-slate-50"
                    >
                      <div>
                        <div className="font-bold text-slate-800">
                          +{ph.quantity} units @ {formatCurrency(ph.purchasePrice, currency)}/unit
                        </div>
                        <div className="text-slate-400 text-[11px] mt-0.5">
                          Supplier: {ph.supplier || 'N/A'} • {new Date(ph.date).toLocaleDateString('en-IN')}
                        </div>
                      </div>
                      <div className="text-right font-semibold text-slate-600">
                        {formatCurrency(ph.quantity * ph.purchasePrice, currency)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400">
                    No individual batch records logged yet.
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setSelectedItemForHistory(null)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Restock Batch / Variant Restock Modal */}
      {selectedItemForBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveRestockBatch}
            className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div>
                <h3 className="font-bold text-lg text-slate-900">{t('stock.addBatchTitle')}</h3>
                <p className="text-xs text-slate-500">
                  {selectedItemForBatch.name} ({selectedItemForBatch.id})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItemForBatch(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedItemForBatch.hasVariants && batchVariantsState.length > 0 ? (
              <div className="space-y-3">
                <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Product Variants Restock
                  </h4>
                  <span className="text-[11px] text-slate-500">Serial numbers remain fixed</span>
                </div>

                {batchVariantsState.map((v, idx) => {
                  const added = Number(v.addedQty) || 0;
                  const batchCost = Number(v.newBatchCost) || Number(v.purchasePrice) || 0;
                  const previewAvg =
                    added > 0
                      ? calculateWeightedAveragePrice(
                          Number(v.quantityLeft) || 0,
                          Number(v.purchasePrice) || 0,
                          added,
                          batchCost
                        )
                      : Number(v.purchasePrice) || 0;

                  return (
                    <div
                      key={v.id}
                      className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5"
                    >
                      <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-xs">
                            {v.color || ''} {v.size || ''}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Existing: <strong>{v.quantityLeft}</strong>
                          </span>
                        </div>
                        <span className="text-[10px] font-mono bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                          Serial: {v.barcode || 'N/A'} (Fixed)
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            + Added Qty
                          </label>
                          <input
                            type="number"
                            min="0"
                            step={selectedItemForBatch.unitType === 'count' ? 1 : 'any'}
                            value={v.addedQty ?? 0}
                            onChange={(e) => {
                              const updated = [...batchVariantsState];
                              updated[idx] = {
                                ...updated[idx],
                                addedQty: parseFloat(e.target.value) || 0,
                              };
                              setBatchVariantsState(updated);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Batch Cost (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={v.newBatchCost ?? v.purchasePrice}
                            onChange={(e) => {
                              const updated = [...batchVariantsState];
                              updated[idx] = {
                                ...updated[idx],
                                newBatchCost: parseFloat(e.target.value) || 0,
                              };
                              setBatchVariantsState(updated);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Selling Price (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={v.sellingPrice}
                            onChange={(e) => {
                              const updated = [...batchVariantsState];
                              updated[idx] = {
                                ...updated[idx],
                                sellingPrice: parseFloat(e.target.value) || 0,
                              };
                              setBatchVariantsState(updated);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-bold text-indigo-700"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Low Alert
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={v.threshold}
                            onChange={(e) => {
                              const updated = [...batchVariantsState];
                              updated[idx] = {
                                ...updated[idx],
                                threshold: parseFloat(e.target.value) || 0,
                              };
                              setBatchVariantsState(updated);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Shelf No.
                          </label>
                          <input
                            type="text"
                            value={v.shelfLocation || ''}
                            onChange={(e) => {
                              const updated = [...batchVariantsState];
                              updated[idx] = {
                                ...updated[idx],
                                shelfLocation: e.target.value.toUpperCase(),
                              };
                              setBatchVariantsState(updated);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-semibold uppercase"
                            placeholder="e.g. A-2"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] bg-emerald-50 text-emerald-800 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                        <span>
                          New Total Qty: <strong>{(Number(v.quantityLeft) || 0) + added}</strong>
                        </span>
                        <span>
                          New Weighted Avg Cost:{' '}
                          <strong>
                            {costUnlocked ? formatCurrency(previewAvg, currency) : '••••••'}
                          </strong>
                        </span>
                      </div>
                    </div>
                  );
                })}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Supplier Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Surat Wholesale Corp"
                    value={batchSupplier}
                    onChange={(e) => setBatchSupplier(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-slate-500">{t('stock.existingStock')}:</span>
                    <span className="font-bold ml-1 text-slate-800">
                      {selectedItemForBatch.quantityLeft}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Current Avg Cost:</span>
                    <span className="font-bold ml-1 text-slate-800">
                      {costUnlocked
                        ? formatCurrency(selectedItemForBatch.averagePurchasePrice, currency)
                        : '••••••'}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t('stock.addedQty')}{' '}
                      {selectedItemForBatch.unitType === 'weight'
                        ? '(kg)'
                        : selectedItemForBatch.unitType === 'both'
                        ? '(qty/kg)'
                        : '(pcs)'}{' '}
                      *
                    </label>
                    <input
                      type="number"
                      required
                      min={selectedItemForBatch.unitType === 'count' ? 1 : 0.01}
                      step={selectedItemForBatch.unitType === 'count' ? 1 : 'any'}
                      value={batchQty}
                      onChange={(e) => setBatchQty(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t('stock.newBatchPrice')} *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={batchCostPrice}
                      onChange={(e) => setBatchCostPrice(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t('stock.newSellingPrice')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={newSellingPrice}
                      onChange={(e) => setNewSellingPrice(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Supplier Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Surat Wholesale Corp"
                      value={batchSupplier}
                      onChange={(e) => setBatchSupplier(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                    <div className="text-[11px] text-emerald-800 font-medium">
                      {t('stock.calcAvgPreview')}:
                    </div>
                    <div className="text-base font-extrabold text-emerald-900 mt-0.5">
                      {costUnlocked
                        ? formatCurrency(
                            calculateWeightedAveragePrice(
                              selectedItemForBatch.quantityLeft,
                              selectedItemForBatch.averagePurchasePrice,
                              Number(batchQty),
                              Number(batchCostPrice)
                            ),
                            currency
                          )
                        : '••••••'}
                      <span className="text-xs font-normal text-emerald-700 ml-1.5">
                        (Total: {selectedItemForBatch.quantityLeft + Number(batchQty)} units)
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedItemForBatch(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs"
              >
                {t('stock.saveBatch')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cost Password Modal */}
      {showCostPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleUnlockCost}
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900">Unlock Cost Prices</h3>
              <button
                type="button"
                onClick={() => {
                  setShowCostPasswordModal(false);
                  setCostPasswordError('');
                  setCostPasswordInput('');
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Enter your password or PIN to view purchase/cost prices.
            </p>
            <input
              type="password"
              value={costPasswordInput}
              onChange={(e) => setCostPasswordInput(e.target.value)}
              placeholder="Password or PIN"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            {costPasswordError && <p className="text-xs text-red-600">{costPasswordError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCostPasswordModal(false);
                  setCostPasswordError('');
                  setCostPasswordInput('');
                }}
                className="flex-1 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
              >
                Unlock
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add / Edit Stock Item Modal with Variant Builder */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveItem}
            className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                {editingItem ? (
                  <>
                    <Edit3 className="w-5 h-5 text-blue-600" />
                    Edit Stock Item
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5 text-indigo-600" />
                    {t('stock.addItem')}
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={closeItemModal}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Item ID / SKU *
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingItem)}
                  placeholder="e.g. ITEM-201"
                  value={newItemId}
                  onChange={(e) => setNewItemId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 uppercase font-mono disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Serial Number (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. SN-00201"
                  value={newItemSerial}
                  onChange={(e) => setNewItemSerial(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Item Name (English) *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 18mm Marine Plywood"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                सामान का नाम (हिंदी)
              </label>
              <input
                type="text"
                placeholder="उदा. 18mm मरीन प्लाईवुड"
                value={newItemHindiName}
                onChange={(e) => setNewItemHindiName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category *
                </label>
                <select
                  required
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select Category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Shelf Location (Where kept) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shelf B-03"
                  value={newItemShelf}
                  onChange={(e) => setNewItemShelf(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Measurement Unit *
              </label>
              <select
                aria-label="Measurement Unit"
                value={newItemUnit}
                onChange={(e) => setNewItemUnit(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="count">Count (Pieces / Pcs)</option>
                <option value="weight">Weight (Kg / Grams)</option>
                <option value="both">Both (Count & Weight)</option>
              </select>
            </div>

            {/* Variants Toggle & Builder */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Product Variants (Color / Finish / Size)
                </h4>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasVariants}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setHasVariants(checked);
                      if (checked && variantsList.length === 0) {
                        handleAddVariantRow();
                      }
                    }}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                  />
                  Enable Variants
                </label>
              </div>

              {hasVariants && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-slate-500 font-medium">
                      Configure attributes, serial numbers, and prices per variant:
                    </span>
                    <button
                      type="button"
                      onClick={handleAddVariantRow}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700"
                    >
                      <Plus className="w-3 h-3" /> Add Variant
                    </button>
                  </div>

                  {variantsList.map((v) => (
                    <div
                      key={v.id}
                      className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5"
                    >
                      <div className="flex justify-between items-center text-[11px] text-slate-500">
                        <span className="font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold">
                          Variant ID: {v.id}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveVariantRow(v.id)}
                          className="text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Remove
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Color / Finish
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Teak"
                            value={v.color || ''}
                            onChange={(e) => handleUpdateVariantRow(v.id, 'color', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Size / Spec
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 8x4"
                            value={v.size || ''}
                            onChange={(e) => handleUpdateVariantRow(v.id, 'size', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Variant Serial No *
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. SN-VAR-01"
                            value={v.barcode || ''}
                            onChange={(e) => handleUpdateVariantRow(v.id, 'barcode', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded font-mono"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Initial Qty
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={v.quantityLeft}
                            onChange={(e) =>
                              handleUpdateVariantRow(
                                v.id,
                                'quantityLeft',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Cost Price (₹)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={v.purchasePrice}
                            onChange={(e) =>
                              handleUpdateVariantRow(
                                v.id,
                                'purchasePrice',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Selling Price (₹) *
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={v.sellingPrice}
                            onChange={(e) =>
                              handleUpdateVariantRow(
                                v.id,
                                'sellingPrice',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded font-bold text-indigo-700"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Low Alert
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={v.threshold}
                            onChange={(e) =>
                              handleUpdateVariantRow(
                                v.id,
                                'threshold',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                            Shelf No.
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. A-1"
                            value={v.shelfLocation || ''}
                            onChange={(e) =>
                              handleUpdateVariantRow(
                                v.id,
                                'shelfLocation',
                                e.target.value.toUpperCase()
                              )
                            }
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded uppercase"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-500">
                    Total stock will automatically sum across all variants (
                    {variantsList.reduce((s, v) => s + (Number(v.quantityLeft) || 0), 0)} units).
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {editingItem ? 'Current Quantity Left' : 'Initial Quantity Left'}{' '}
                  {newItemUnit === 'weight' ? '(kg)' : newItemUnit === 'both' ? '(qty/kg)' : '(pcs)'}
                </label>
                <input
                  type="number"
                  min="0"
                  disabled={hasVariants}
                  step={newItemUnit === 'count' ? 1 : 'any'}
                  value={
                    hasVariants
                      ? variantsList.reduce((s, v) => s + (Number(v.quantityLeft) || 0), 0)
                      : newItemInitialQty
                  }
                  onChange={(e) => setNewItemInitialQty(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Low Stock Threshold {newItemUnit === 'weight' ? '(kg)' : ''}
                </label>
                <input
                  type="number"
                  min="0"
                  step={newItemUnit === 'count' ? 1 : 'any'}
                  value={newItemThreshold}
                  onChange={(e) => setNewItemThreshold(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {editingItem ? 'Average Purchase Price (₹)' : 'Initial Purchase Price (₹)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newItemPurchasePrice}
                  onChange={(e) => setNewItemPurchasePrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Base Selling Price (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newItemSellPrice}
                  onChange={(e) => setNewItemSellPrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={closeItemModal}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs"
              >
                {editingItem ? 'Update Item' : 'Save Item'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manage Categories Modal (Add + Edit Existing Categories) */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <FolderEdit className="w-5 h-5 text-emerald-600" />
                Manage Categories
              </h3>
              <button
                type="button"
                onClick={closeCategoryModal}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add New Category Form */}
            <form onSubmit={handleAddCategory} className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Add New Category
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Plywood, Laminates, Hardware"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white shadow-xs inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </form>

            {/* Existing Categories List with Inline Edit */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Existing Categories ({categories.length})
              </label>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {categories.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    No categories added yet.
                  </div>
                ) : (
                  categories.map((cat) => {
                    const isEditing = editingCategoryId === cat.id;
                    return (
                      <div
                        key={cat.id}
                        className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50"
                      >
                        {isEditing ? (
                          <>
                            <input
                              type="text"
                              value={editingCategoryName}
                              onChange={(e) => setEditingCategoryName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveCategoryEdit(cat.id);
                                } else if (e.key === 'Escape') {
                                  setEditingCategoryId(null);
                                  setEditingCategoryName('');
                                }
                              }}
                              className="flex-1 px-2.5 py-1.5 text-sm border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              autoFocus
                            />
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveCategoryEdit(cat.id)}
                                className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
                                title="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCategoryId(null);
                                  setEditingCategoryName('');
                                }}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-sm font-medium text-slate-800 px-1">
                              {cat.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategoryId(cat.id);
                                setEditingCategoryName(cat.name);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
                            >
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={closeCategoryModal}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
