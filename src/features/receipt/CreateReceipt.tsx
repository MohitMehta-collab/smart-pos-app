import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StockService } from '../../services/stockService';
import { ReceiptService } from '../../services/receiptService';
import { useAppStore, scheduleCloudSync } from '../../store/useAppStore';
import type {
  StockItem,
  ItemVariant,
  SalesReceipt,
  ReceiptItem,
  PaymentEntry,
} from '../../types';
import {
  formatCurrency,
  formatQuantity,
} from '../../utils/pricing';
import {
  Search,
  X,
  Trash2,
  Edit2,
  Printer,
  User,
  ArrowLeft,
  CreditCard,
  Share2,
  Copy,
  Check,
  Info,
} from 'lucide-react';

interface CreateReceiptProps {
  editReceiptId?: string | null;
  onReceiptSaved: () => void;
}

interface CustomerSuggestion {
  name: string;
  phone: string;
  address: string;
}

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const toLocalDateStr = (isoOrDate: string | Date) => {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const CreateReceipt: React.FC<CreateReceiptProps> = ({
  editReceiptId,
  onReceiptSaved,
}) => {
  const { t } = useTranslation();
  const { currency, activeBusiness, canAccess } = useAppStore();

  // ------------------------------------------------------------------
  // Data loading & auto-save tracking (with queued retry lock)
  // ------------------------------------------------------------------
  const [items, setItems] = useState<StockItem[]>([]);
  const [receipt, setReceipt] = useState<SalesReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const isHydratedRef = useRef(false);
  const persistedReceiptIdRef = useRef<string | null>(editReceiptId ?? null);
  const lastStockSyncedItemsRef = useRef<ReceiptItem[]>([]);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const latestSaveFnRef = useRef<() => Promise<SalesReceipt | null>>(async () => null);

  // ------------------------------------------------------------------
  // Customer directory autocomplete state
  // ------------------------------------------------------------------
  const [knownCustomers, setKnownCustomers] = useState<CustomerSuggestion[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // ------------------------------------------------------------------
  // Item selection / search
  // ------------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStockItem, setSelectedStockItem] = useState<StockItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ItemVariant | null>(null);

  // ------------------------------------------------------------------
  // Line-item form state
  // ------------------------------------------------------------------
  const [lineQty, setLineQty] = useState<number | ''>(1);
  const [lineWeight, setLineWeight] = useState<number | ''>('');
  const [lineColor, setLineColor] = useState('');
  const [lineSize, setLineSize] = useState('');
  const [lineUnitPrice, setLineUnitPrice] = useState<number | ''>('');
  const [lineDiscount, setLineDiscount] = useState<number | ''>(0);
  const [lineIsReturn, setLineIsReturn] = useState(false);
  const [lineReturnReason, setLineReturnReason] = useState('');

  // ------------------------------------------------------------------
  // Customer form state
  // ------------------------------------------------------------------
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');

  // ------------------------------------------------------------------
  // Payment / discount / GST / status state
  // ------------------------------------------------------------------
  const [globalDiscount, setGlobalDiscount] = useState<number | ''>(0);
  const [gstRate, setGstRate] = useState<number>(0);
  const [billType, setBillType] = useState<'composition' | 'tax_invoice'>('composition');
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [newPaymentAmount, setNewPaymentAmount] = useState<number | ''>('');
  const [newPaymentMethod, setNewPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'bank_transfer' | 'credit' | 'check'>('cash');
  const [newPaymentRef, setNewPaymentRef] = useState('');
  const [receiptStatus, setReceiptStatus] = useState<SalesReceipt['status']>('inProgress');
  const [receiptNotes, setReceiptNotes] = useState('');

  // ------------------------------------------------------------------
  // Editing an existing line item
  // ------------------------------------------------------------------
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Modals
  // ------------------------------------------------------------------
  const [showPurchaseHistory, setShowPurchaseHistory] = useState<StockItem | null>(null);

  // ------------------------------------------------------------------
  // Load receipt & build unique customer autocomplete list
  // ------------------------------------------------------------------
  const loadReceipt = useCallback(async () => {
    setLoading(true);
    isHydratedRef.current = false;
    try {
      const [allItems, allReceipts] = await Promise.all([
        StockService.getAllItems(),
        ReceiptService.getAllReceipts(),
      ]);
      setItems(allItems);

      // Extract unique customers from historical receipts
      const custMap = new Map<string, CustomerSuggestion>();
      for (const r of allReceipts) {
        const name = (r.customerName || r.customer?.name || '').trim();
        const phone = (r.customerPhone || r.customer?.phone || '').trim();
        const address = (r.customerAddress || r.customer?.address || '').trim();
        if (!name || name.toLowerCase() === 'walk-in customer') continue;
        const key = phone ? `p:${phone}` : `n:${name.toLowerCase()}`;
        if (!custMap.has(key)) {
          custMap.set(key, { name, phone, address });
        }
      }
      setKnownCustomers(Array.from(custMap.values()));

      if (editReceiptId) {
        const db = useAppStore.getState().currentDb;
        if (!db) throw new Error('Database not initialized');
        const existing = await db.receipts.get(editReceiptId);
        if (existing) {
          setReceipt(existing);
          setCustName(existing.customerName || '');
          setCustPhone(existing.customerPhone || '');
          setCustAddress(existing.customerAddress || '');
          setGlobalDiscount(existing.totalDiscount || 0);
          setReceiptStatus(existing.status);
          setReceiptNotes(existing.notes || '');
          setPayments(existing.payments || []);

          // Infer GST rate if taxAmount was saved
          const taxableBase = Math.max(0, existing.subtotal - (existing.totalDiscount || 0));
          if (existing.taxAmount > 0 && taxableBase > 0) {
            const inferred = Math.round((existing.taxAmount / taxableBase) * 100);
            setGstRate(inferred);
            setBillType('tax_invoice');
          } else {
            setGstRate(0);
            setBillType('composition');
          }

          persistedReceiptIdRef.current = existing.id;
          lastStockSyncedItemsRef.current = existing.items || [];
          setAutoSaveStatus('saved');
        }
      } else {
        const now = new Date().toISOString();
        const newReceipt: SalesReceipt = {
          id: `REC-${new Date().getFullYear()}-0000`,
          customerName: '',
          status: 'inProgress',
          items: [],
          subtotal: 0,
          totalDiscount: 0,
          taxAmount: 0,
          grandTotal: 0,
          amountReceived: 0,
          balanceDue: 0,
          payments: [],
          createdAt: now,
          updatedAt: now,
        };
        setReceipt(newReceipt);
        persistedReceiptIdRef.current = null;
        lastStockSyncedItemsRef.current = [];
        setAutoSaveStatus('idle');
      }
    } catch (err) {
      console.error('Failed to load receipt', err);
      alert('Failed to load receipt data.');
    } finally {
      setLoading(false);
      setTimeout(() => {
        isHydratedRef.current = true;
      }, 0);
    }
  }, [editReceiptId]);

  useEffect(() => {
    loadReceipt();
  }, [loadReceipt]);

  // ------------------------------------------------------------------
  // Filtered Customer Autocomplete Matches
  // ------------------------------------------------------------------
  const matchingCustomers = useMemo(() => {
    const qName = custName.trim().toLowerCase();
    const qPhone = custPhone.trim();
    if (!qName && !qPhone) return [];
    return knownCustomers
      .filter((c) => {
        const nameMatch = qName.length >= 2 && c.name.toLowerCase().includes(qName);
        const phoneMatch = qPhone.length >= 3 && c.phone.includes(qPhone);
        return nameMatch || phoneMatch;
      })
      .slice(0, 6);
  }, [knownCustomers, custName, custPhone]);

  const handleSelectCustomerSuggestion = (c: CustomerSuggestion) => {
    setCustName(c.name);
    if (c.phone) setCustPhone(c.phone);
    if (c.address) setCustAddress(c.address);
    setShowCustomerDropdown(false);
  };

  // ------------------------------------------------------------------
  // Derived computations
  // ------------------------------------------------------------------
  const lineItems: ReceiptItem[] = receipt?.items ?? [];

  const subtotal = useMemo(() => {
    return lineItems.reduce((sum, it) => sum + (it.totalPrice || 0), 0);
  }, [lineItems]);

  const gd = parseFloat(String(globalDiscount)) || 0;
  const taxableAmount = useMemo(() => Math.max(0, subtotal - gd), [subtotal, gd]);
  const taxAmount = useMemo(() => {
    if (billType === 'composition' || gstRate <= 0) return 0;
    return Number(((taxableAmount * gstRate) / 100).toFixed(2));
  }, [billType, gstRate, taxableAmount]);

  const grandTotal = useMemo(() => Number((taxableAmount + taxAmount).toFixed(2)), [taxableAmount, taxAmount]);

  const amountReceived = useMemo(() => {
    return payments.reduce((sum, p) => sum + p.amount, 0);
  }, [payments]);

  const balanceDue = useMemo(() => Math.max(0, Number((grandTotal - amountReceived).toFixed(2))), [grandTotal, amountReceived]);

  const selectedIsLowStock = useMemo(() => {
    if (!selectedStockItem) return false;
    if (selectedVariant) {
      return selectedVariant.quantityLeft <= selectedVariant.threshold;
    }
    return selectedStockItem.quantityLeft <= selectedStockItem.threshold;
  }, [selectedStockItem, selectedVariant]);

  const selectedAvailableQty = useMemo(() => {
    if (!selectedStockItem) return 0;
    if (selectedVariant) return selectedVariant.quantityLeft;
    return selectedStockItem.quantityLeft;
  }, [selectedStockItem, selectedVariant]);

  const regularQtyInReceipt = useMemo(() => {
    if (!selectedStockItem) return 0;
    return lineItems
      .filter(
        (it) =>
          !it.isReturn &&
          it.stockItemId === selectedStockItem.id &&
          (selectedVariant ? it.variantId === selectedVariant.id : !it.variantId)
      )
      .reduce((sum, it) => sum + it.quantity, 0);
  }, [selectedStockItem, selectedVariant, lineItems]);

  const returnedQtyInReceipt = useMemo(() => {
    if (!selectedStockItem) return 0;
    return lineItems
      .filter(
        (it) =>
          it.isReturn &&
          it.id !== editingLineId &&
          it.stockItemId === selectedStockItem.id &&
          (selectedVariant ? it.variantId === selectedVariant.id : !it.variantId)
      )
      .reduce((sum, it) => sum + it.quantity, 0);
  }, [selectedStockItem, selectedVariant, lineItems, editingLineId]);

  const maxReturnAllowed = useMemo(() => {
    return Math.max(0, regularQtyInReceipt - returnedQtyInReceipt);
  }, [regularQtyInReceipt, returnedQtyInReceipt]);

  // ------------------------------------------------------------------
  // Handlers: item search / selection
  // ------------------------------------------------------------------
  const handleSelectItem = (item: StockItem) => {
    setSelectedStockItem(item);
    setSelectedVariant(null);
    setLineQty(item.unitType === 'weight' ? '' : 1);
    setLineWeight('');
    setLineColor('');
    setLineSize('');
    const unitPrice = item.sellingPrice ?? 0;
    setLineUnitPrice(unitPrice > 0 ? unitPrice : '');
    setLineDiscount(0);
    setLineIsReturn(false);
    setLineReturnReason('');
    setSearchQuery(item.name || item.id);
  };

  const handlePickVariant = (variant: ItemVariant) => {
    setSelectedVariant(variant);
    setLineQty(selectedStockItem?.unitType === 'weight' ? '' : 1);
    setLineWeight('');
    const unitPrice = variant.sellingPrice ?? 0;
    setLineUnitPrice(unitPrice > 0 ? unitPrice : '');
    setLineDiscount(0);
    setLineIsReturn(false);
    setLineReturnReason('');
  };

  const handleClearSelection = () => {
    setSelectedStockItem(null);
    setSelectedVariant(null);
    setSearchQuery('');
    setLineQty(1);
    setLineWeight('');
    setLineColor('');
    setLineSize('');
    setLineUnitPrice('');
    setLineDiscount(0);
    setLineIsReturn(false);
    setLineReturnReason('');
  };

  // ------------------------------------------------------------------
  // Handlers: add / edit line item
  // ------------------------------------------------------------------
  const handleAddLineItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockItem) {
      alert(t('receipt.selectItemPlaceholder'));
      return;
    }

    if (
      selectedStockItem.hasVariants &&
      selectedStockItem.variants &&
      selectedStockItem.variants.length > 0 &&
      !selectedVariant
    ) {
      alert(t('receipt.selectVariant'));
      return;
    }

    const qtyVal =
      selectedStockItem.unitType === 'weight' ? parseFloat(String(lineWeight)) : parseFloat(String(lineQty));

    if (!qtyVal || qtyVal <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }

    if (!lineIsReturn) {
      const alreadySyncedQty = lastStockSyncedItemsRef.current
        .filter(
          (it) =>
            !it.isReturn &&
            it.stockItemId === selectedStockItem.id &&
            (selectedVariant ? it.variantId === selectedVariant.id : !it.variantId)
        )
        .reduce((sum, it) => sum + it.quantity, 0);

      const effectiveAvailable = selectedAvailableQty + alreadySyncedQty;

      const otherLinesQty =
        regularQtyInReceipt -
        (editingLineId
          ? lineItems.find((it) => it.id === editingLineId && !it.isReturn)?.quantity || 0
          : 0);

      if (otherLinesQty + qtyVal > effectiveAvailable) {
        const remainingAvailable = Math.max(0, effectiveAvailable - otherLinesQty);
        alert(
          `Insufficient stock. Only ${formatQuantity(remainingAvailable, selectedStockItem.unitType)} available.`
        );
        return;
      }
    } else {
      if (regularQtyInReceipt === 0) {
        alert(
          `Return/refund can only be added for items already present in this receipt. No '${selectedStockItem.name}' sales items found.`
        );
        return;
      }
      if (qtyVal > maxReturnAllowed) {
        alert(
          `Cannot return more quantity than added in receipt. Maximum refundable quantity for '${selectedStockItem.name}' is ${formatQuantity(maxReturnAllowed, selectedStockItem.unitType)}.`
        );
        return;
      }
    }

    const unitPrice = parseFloat(String(lineUnitPrice)) || 0;
    const discount = parseFloat(String(lineDiscount)) || 0;
    const netPrice = Math.max(0, qtyVal * unitPrice - discount);
    const totalPrice = lineIsReturn ? -netPrice : netPrice;
    const now = new Date().toISOString();

    if (editingLineId) {
      setReceipt((prev) => {
        if (!prev) return prev;
        const updatedItems = prev.items.map((it) => {
          if (it.id !== editingLineId) return it;
          return {
            ...it,
            stockItemId: selectedStockItem.id,
            stockItemName: selectedStockItem.name,
            variantId: selectedVariant?.id ?? undefined,
            variantDescription: selectedVariant
              ? `${selectedVariant.color || ''} ${selectedVariant.size || ''}`.trim()
              : undefined,
            color: lineColor || selectedVariant?.color,
            size: lineSize || selectedVariant?.size,
            weight:
              selectedStockItem.unitType === 'weight'
                ? typeof lineWeight === 'number'
                  ? lineWeight
                  : undefined
                : selectedVariant?.weightGrams
                ? selectedVariant.weightGrams / 1000
                : undefined,
            quantity: qtyVal,
            unitPrice,
            discountAmount: discount,
            totalPrice,
            isReturn: lineIsReturn,
            returnReason: lineIsReturn ? lineReturnReason : undefined,
            addedAt: now,
          };
        });
        return { ...prev, items: updatedItems, updatedAt: now };
      });
      setEditingLineId(null);
    } else {
      const newLine: ReceiptItem = {
        id: uid('line'),
        stockItemId: selectedStockItem.id,
        stockItemName: selectedStockItem.name,
        variantId: selectedVariant?.id,
        variantDescription: selectedVariant
          ? `${selectedVariant.color || ''} ${selectedVariant.size || ''}`.trim()
          : undefined,
        color: lineColor || selectedVariant?.color,
        size: lineSize || selectedVariant?.size,
        weight:
          selectedStockItem.unitType === 'weight'
            ? typeof lineWeight === 'number'
              ? lineWeight
              : undefined
            : selectedVariant?.weightGrams
            ? selectedVariant.weightGrams / 1000
            : undefined,
        quantity: qtyVal,
        unitPrice,
        discountAmount: discount,
        totalPrice,
        isReturn: lineIsReturn,
        returnReason: lineIsReturn ? lineReturnReason : undefined,
        addedAt: now,
      };

      setReceipt((prev) => {
        if (!prev) return prev;
        return { ...prev, items: [...prev.items, newLine], updatedAt: now };
      });
    }

    handleClearSelection();
  };

  // ------------------------------------------------------------------
  // Handlers: remove / edit / return line
  // ------------------------------------------------------------------
  const handleRemoveLine = async (lineId: string) => {
    if (!window.confirm('Remove this item from the receipt?')) return;
    const line = lineItems.find((l) => l.id === lineId);
    if (!line) return;

    setReceipt((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.filter((l) => l.id !== lineId),
        updatedAt: new Date().toISOString(),
      };
    });
    if (editingLineId === lineId) setEditingLineId(null);
  };

  const handleEditLine = (line: ReceiptItem) => {
    const item = items.find((i) => i.id === line.stockItemId);
    if (!item) return;
    setSelectedStockItem(item);
    setSelectedVariant(line.variantId ? item.variants?.find((v) => v.id === line.variantId) ?? null : null);
    setSearchQuery(item.name || item.id);
    setLineQty(line.quantity);
    setLineWeight(line.weight ?? '');
    setLineColor(line.color || '');
    setLineSize(line.size || '');
    setLineUnitPrice(line.unitPrice);
    setLineDiscount(line.discountAmount);
    setLineIsReturn(!!line.isReturn);
    setLineReturnReason(line.returnReason || '');
    setEditingLineId(line.id);
  };

  const handleCancelEditLine = () => {
    setEditingLineId(null);
    handleClearSelection();
  };

  const handleToggleReturn = (checked: boolean) => {
    if (!checked) {
      setLineIsReturn(false);
      return;
    }
    if (!selectedStockItem) return;
    if (regularQtyInReceipt === 0) {
      alert(
        `Return/refund can only be added for items already present in this receipt. No '${selectedStockItem.name}' sales items found.`
      );
      return;
    }
    if (maxReturnAllowed <= 0) {
      alert(
        `All added quantity of '${selectedStockItem.name}' in this receipt has already been returned/refunded.`
      );
      return;
    }
    setLineIsReturn(true);
  };

  // ------------------------------------------------------------------
  // Handlers: payments
  // ------------------------------------------------------------------
  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(String(newPaymentAmount));
    if (!amt || amt <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }
    const payment: PaymentEntry = {
      id: uid('pay'),
      date: new Date().toISOString(),
      amount: amt,
      method: newPaymentMethod,
      transactionRef: newPaymentRef.trim() || undefined,
    };
    setPayments([...payments, payment]);
    setNewPaymentAmount('');
    setNewPaymentRef('');
  };

  const handleRemovePayment = (payId: string) => {
    setPayments(payments.filter((p) => p.id !== payId));
  };

  // ------------------------------------------------------------------
  // Auto-save receipt with queued-retry concurrency lock
  // ------------------------------------------------------------------
  const performAutoSave = useCallback(async (): Promise<SalesReceipt | null> => {
    if (!receipt || !isHydratedRef.current) return null;

    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return null;
    }

    if (lineItems.length === 0 && !persistedReceiptIdRef.current) return null;

    const finalCustomerName = custName.trim() || receipt.customerName || '';
    if (!finalCustomerName) return null;

    const effectiveStatus: SalesReceipt['status'] =
      receiptStatus === 'completed' && balanceDue > 0 ? 'inProgress' : receiptStatus;

    if (effectiveStatus !== receiptStatus) {
      setReceiptStatus(effectiveStatus);
    }

    isSavingRef.current = true;
    setSaving(true);
    setAutoSaveStatus('saving');

    let savedReceipt: SalesReceipt | null = null;

    try {
      const now = new Date().toISOString();

      let targetId = persistedReceiptIdRef.current || receipt.id;
      if (targetId.startsWith('REC-') && targetId.endsWith('-0000')) {
        targetId = await ReceiptService.generateReceiptId();
        persistedReceiptIdRef.current = targetId;
        setReceipt((prev) => (prev ? { ...prev, id: targetId } : prev));
      }

      const customerDetails = {
        name: finalCustomerName,
        phone: custPhone.trim() || undefined,
        address: custAddress.trim() || undefined,
      };

      const receiptToSave: SalesReceipt = {
        ...receipt,
        id: targetId,
        status: effectiveStatus,
        items: lineItems,
        subtotal,
        totalDiscount: gd,
        taxAmount,
        grandTotal,
        amountReceived,
        balanceDue,
        payments,
        notes: receiptNotes || undefined,
        updatedAt: now,
        createdAt: receipt.createdAt || now,
        customerName: customerDetails.name,
        customerPhone: customerDetails.phone,
        customerAddress: customerDetails.address,
        customer: {
          id: receipt.customer?.id || `cust-${Date.now()}`,
          name: customerDetails.name,
          phone: customerDetails.phone || '',
          address: customerDetails.address,
          createdAt: receipt.customer?.createdAt || now,
        },
        ...(effectiveStatus === 'completed' && !receipt.completedAt ? { completedAt: now } : {}),
      };

      const itemsChanged =
        JSON.stringify(lineItems) !== JSON.stringify(lastStockSyncedItemsRef.current);

      if (itemsChanged) {
        if (lastStockSyncedItemsRef.current.length > 0) {
          await StockService.adjustStockForReceipt(
            lastStockSyncedItemsRef.current.map((it) => ({ ...it, isReturn: !it.isReturn }))
          );
        }
        if (lineItems.length > 0) {
          await StockService.adjustStockForReceipt(lineItems);
        }
        lastStockSyncedItemsRef.current = lineItems;

        const refreshedItems = await StockService.getAllItems();
        setItems(refreshedItems);

        setSelectedStockItem((prevSelected) => {
          if (!prevSelected) return null;
          const updated = refreshedItems.find((i) => i.id === prevSelected.id) || null;
          if (updated && selectedVariant) {
            const updatedVar = updated.variants?.find((v) => v.id === selectedVariant.id) || null;
            setSelectedVariant(updatedVar);
          }
          return updated;
        });
      }

      await ReceiptService.saveReceipt(receiptToSave, false);
      savedReceipt = receiptToSave;
      setAutoSaveStatus('saved');
      scheduleCloudSync();
    } catch (err) {
      console.error('Auto-save failed', err);
      setAutoSaveStatus('error');
    } finally {
      isSavingRef.current = false;
      setSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void latestSaveFnRef.current();
      }
    }

    return savedReceipt;
  }, [
    receipt,
    lineItems,
    custName,
    custPhone,
    custAddress,
    receiptStatus,
    balanceDue,
    subtotal,
    gd,
    taxAmount,
    grandTotal,
    amountReceived,
    payments,
    receiptNotes,
    selectedVariant,
  ]);

  useEffect(() => {
    latestSaveFnRef.current = performAutoSave;
  }, [performAutoSave]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    if ((lineItems.length === 0 && !persistedReceiptIdRef.current) || !custName.trim()) {
      setAutoSaveStatus('idle');
      return;
    }

    setAutoSaveStatus('saving');
    const timer = setTimeout(() => {
      void performAutoSave();
    }, 600);

    return () => clearTimeout(timer);
  }, [
    lineItems,
    custName,
    custPhone,
    custAddress,
    payments,
    globalDiscount,
    taxAmount,
    receiptStatus,
    receiptNotes,
    performAutoSave,
  ]);

  const handleStatusChange = (nextStatus: SalesReceipt['status']) => {
    if (nextStatus === 'completed' && balanceDue > 0) {
      alert(
        `Cannot mark order as completed until payment is cleared. Amount due: ${formatCurrency(balanceDue, currency)}`
      );
      return;
    }
    setReceiptStatus(nextStatus);
  };

  // ------------------------------------------------------------------
  // Share receipt (current itemized receipt, full, or by date range)
  // ------------------------------------------------------------------
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareScope, setShareScope] = useState<'current' | 'full' | 'partial'>('current');
  const [shareMessage, setShareMessage] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [shareFrom, setShareFrom] = useState('');
  const [shareTo, setShareTo] = useState('');

  const paymentMethodLabel = useCallback(
    (m: string) => {
      const translated = m === 'cash' ? t('common.cash') : '';
      const cashLabel = translated && translated !== 'common.cash' ? translated : 'Cash';
      const labels: Record<string, string> = {
        cash: cashLabel,
        upi: 'UPI',
        card: 'Card',
        bank_transfer: 'Bank Transfer',
        credit: 'Credit',
        check: 'Check',
      };
      return labels[m] || m;
    },
    [t]
  );

  const buildSingleReceiptShareMessage = useCallback(
    (rec: SalesReceipt, range?: { from?: string; to?: string }) => {
      const bizName = activeBusiness?.name || 'Smart POS Store';
      const createdDate = new Date(rec.createdAt).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const fromStr = range?.from || '1900-01-01';
      const toStr = range?.to || '2999-12-31';
      const isRangeFiltered = Boolean(range?.from || range?.to);

      const filteredItems = isRangeFiltered
        ? rec.items.filter((it) => {
            const itemDate = toLocalDateStr(it.addedAt || rec.createdAt);
            return itemDate >= fromStr && itemDate <= toStr;
          })
        : rec.items;

      const filteredPayments = isRangeFiltered
        ? (rec.payments || []).filter((p) => {
            const payDate = toLocalDateStr(p.date || rec.createdAt);
            return payDate >= fromStr && payDate <= toStr;
          })
        : rec.payments || [];

      const effectiveSubtotal = isRangeFiltered
        ? filteredItems.reduce((sum, it) => sum + (it.totalPrice || 0), 0)
        : rec.subtotal;

      const effectiveTaxable = Math.max(0, effectiveSubtotal - (rec.totalDiscount || 0));
      const effectiveTax = isRangeFiltered ? 0 : rec.taxAmount || 0;
      const effectiveGrandTotal = isRangeFiltered
        ? effectiveTaxable
        : rec.grandTotal;

      const effectivePaid = isRangeFiltered
        ? filteredPayments.reduce((sum, p) => sum + p.amount, 0)
        : rec.amountReceived;

      const effectiveBalanceDue = isRangeFiltered
        ? Math.max(0, effectiveGrandTotal - effectivePaid)
        : rec.balanceDue;

      const header =
        `🧾 *${bizName} - ${billType === 'tax_invoice' ? 'Tax Invoice' : 'Sales Estimate / Receipt'}*\n` +
        `🆔 Receipt #: ${rec.id}\n` +
        `📅 Date: ${createdDate}\n` +
        `📌 Status: ${rec.status.toUpperCase()}\n` +
        `👤 Customer: ${rec.customerName || 'N/A'}` +
        `${rec.customerPhone ? ` (${rec.customerPhone})` : ''}` +
        `${rec.customerAddress ? `\n📍 Address: ${rec.customerAddress}` : ''}\n` +
        `────────────────────\n` +
        `*ITEMIZED DETAILS (${filteredItems.length})*\n\n`;

      // Group items chronologically by the date they were added
      const dateGroupsMap = new Map<string, ReceiptItem[]>();
      filteredItems.forEach((it) => {
        const key = toLocalDateStr(it.addedAt || rec.createdAt) || 'unknown';
        if (!dateGroupsMap.has(key)) dateGroupsMap.set(key, []);
        dateGroupsMap.get(key)!.push(it);
      });
      const sortedDateEntries = Array.from(dateGroupsMap.entries()).sort(([a], [b]) =>
        a.localeCompare(b)
      );

      const itemsBlock =
        filteredItems.length === 0
          ? '_No items in selected date range_\n'
          : sortedDateEntries
              .map(([dateKey, groupItems]) => {
                const dateLabel =
                  dateKey !== 'unknown'
                    ? new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : new Date(rec.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      });

                const daySubtotal = groupItems.reduce((s, it) => s + (it.totalPrice || 0), 0);

                const groupLines = groupItems
                  .map((it, idx) => {
                    const variantParts = Array.from(
                      new Set(
                        [
                          it.variantDescription,
                          [it.color, it.size].filter(Boolean).join(' '),
                        ].filter(Boolean)
                      )
                    );
                    const variantStr =
                      variantParts.length > 0 ? ` (${variantParts.join(' • ')})` : '';
                    const returnTag = it.isReturn
                      ? ` [RETURN${it.returnReason ? `: ${it.returnReason}` : ''}]`
                      : '';
                    const qtyStr = `${it.quantity}${it.weight ? ` (${it.weight} kg)` : ''}`;
                    const discStr =
                      it.discountAmount > 0
                        ? ` | Disc: -${formatCurrency(it.discountAmount, currency)}`
                        : '';

                    return (
                      `${idx + 1}. *${it.stockItemName}*${variantStr}${returnTag}\n` +
                      `   • Qty: ${qtyStr} | Rate: ${formatCurrency(it.unitPrice, currency)}${discStr}\n` +
                      `   • Amount: *${formatCurrency(it.totalPrice, currency)}* (Added: ${dateLabel})`
                    );
                  })
                  .join('\n\n');

                const dayFooter =
                  sortedDateEntries.length > 1
                    ? `\n   _Subtotal (${dateLabel}): ${formatCurrency(daySubtotal, currency)}_`
                    : '';

                return `📅 *Items Added on ${dateLabel}:*\n${groupLines}${dayFooter}`;
              })
              .join('\n\n');

      const sortedPayments = [...filteredPayments].sort(
        (a, b) => new Date(a.date || rec.createdAt).getTime() - new Date(b.date || rec.createdAt).getTime()
      );

      const paymentsBlock =
        sortedPayments.length > 0
          ? `\n────────────────────\n💳 *PAYMENT / DEPOSIT HISTORY (${sortedPayments.length})*\n` +
            sortedPayments
              .map((p, idx) => {
                const payDateLabel = new Date(p.date || rec.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                });
                return (
                  `${idx + 1}. 📅 ${payDateLabel}: *${formatCurrency(p.amount, currency)}* via *${paymentMethodLabel(p.method)}*` +
                  `${p.transactionRef ? ` (Ref: #${p.transactionRef})` : ''}` +
                  `${p.notes ? ` - ${p.notes}` : ''}`
                );
              })
              .join('\n') +
            '\n'
          : '\n────────────────────\n💳 *PAYMENT / DEPOSIT HISTORY*\n_No payments deposited yet_\n';

      const totalsBlock =
        `\n────────────────────\n` +
        `• Subtotal: ${formatCurrency(effectiveSubtotal, currency)}\n` +
        (rec.totalDiscount > 0
          ? `• Discount: -${formatCurrency(rec.totalDiscount, currency)}\n`
          : '') +
        (effectiveTax > 0
          ? `• GST (${gstRate}%): +${formatCurrency(effectiveTax, currency)}\n`
          : '') +
        `• *Grand Total: ${formatCurrency(effectiveGrandTotal, currency)}*\n` +
        `• Amount Paid: ${formatCurrency(effectivePaid, currency)}\n` +
        `• *Balance Due: ${formatCurrency(effectiveBalanceDue, currency)}*\n` +
        (rec.notes ? `📝 Notes: ${rec.notes}\n` : '');

      return `${header}${itemsBlock}${paymentsBlock}${totalsBlock}────────────────────\n— Sent from ${bizName}`;
    },
    [activeBusiness?.name, billType, currency, gstRate, paymentMethodLabel]
  );

  const buildReceiptShareMessage = useCallback(
    (list: SalesReceipt[], range?: { from?: string; to?: string }) => {
      if (list.length === 1) {
        return buildSingleReceiptShareMessage(list[0], range);
      }
      const bizName = activeBusiness?.name || 'Smart POS Store';
      const today = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const header = `📋 *${bizName} - Sales Receipts*\n📅 Generated: ${today}\n📊 Total Receipts: ${list.length}\n\n`;

      const summary = list
        .map((rec) => buildSingleReceiptShareMessage(rec, range))
        .join('\n\n====================\n\n');

      const fromStr = range?.from || '1900-01-01';
      const toStr = range?.to || '2999-12-31';
      const isRangeFiltered = Boolean(range?.from || range?.to);

      const grandTotalSum = list.reduce((sum, r) => {
        if (!isRangeFiltered) return sum + r.grandTotal;
        const sub = r.items
          .filter((it) => {
            const d = toLocalDateStr(it.addedAt || r.createdAt);
            return d >= fromStr && d <= toStr;
          })
          .reduce((s, it) => s + (it.totalPrice || 0), 0);
        return sum + Math.max(0, sub - (r.totalDiscount || 0));
      }, 0);

      const totalPaidSum = list.reduce((sum, r) => {
        if (!isRangeFiltered) return sum + r.amountReceived;
        const paid = (r.payments || [])
          .filter((p) => {
            const d = toLocalDateStr(p.date || r.createdAt);
            return d >= fromStr && d <= toStr;
          })
          .reduce((s, p) => s + p.amount, 0);
        return sum + paid;
      }, 0);

      const totalDueSum = Math.max(0, grandTotalSum - totalPaidSum);
      const footer =
        `\n\n💰 *Combined Summary (${list.length} Receipts)*\n` +
        `   • Grand Total: ${formatCurrency(grandTotalSum, currency)}\n` +
        `   • Amount Paid: ${formatCurrency(totalPaidSum, currency)}\n` +
        `   • Balance Due: ${formatCurrency(totalDueSum, currency)}\n`;

      return `${header}${summary}${footer}`;
    },
    [activeBusiness?.name, buildSingleReceiptShareMessage, currency]
  );

  // Flush auto-save before sharing so real Receipt ID is always populated instead of DRAFT/-0000
  const handleOpenCurrentReceiptShare = useCallback(async () => {
    setShareScope('current');
    setShareFrom('');
    setShareTo('');

    let saved: SalesReceipt | null = null;
    if (lineItems.length > 0 && custName.trim()) {
      saved = await performAutoSave();
    }

    const resolvedId =
      saved?.id ||
      persistedReceiptIdRef.current ||
      (receipt?.id && !receipt.id.endsWith('-0000') ? receipt.id : 'UNSAVED-DRAFT');

    const currentSnapshot: SalesReceipt = saved || {
      id: resolvedId,
      customerName: custName.trim() || receipt?.customerName || 'Walk-in Customer',
      customerPhone: custPhone.trim() || undefined,
      customerAddress: custAddress.trim() || undefined,
      status: receiptStatus,
      items: lineItems,
      subtotal,
      totalDiscount: gd,
      taxAmount,
      grandTotal,
      amountReceived,
      balanceDue,
      payments,
      notes: receiptNotes || undefined,
      createdAt: receipt?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setShareMessage(buildSingleReceiptShareMessage(currentSnapshot));
    setShareCopied(false);
    setShowShareModal(true);
  }, [
    lineItems,
    custName,
    performAutoSave,
    receipt,
    custPhone,
    custAddress,
    receiptStatus,
    subtotal,
    gd,
    taxAmount,
    grandTotal,
    amountReceived,
    balanceDue,
    payments,
    receiptNotes,
    buildSingleReceiptShareMessage,
  ]);

  const loadFilteredShareReceipts = useCallback(
    async (scope: 'full' | 'partial', fromVal: string, toVal: string, showAlerts: boolean) => {
      try {
        if (lineItems.length > 0 && custName.trim()) {
          await performAutoSave();
        }

        const allReceipts = await ReceiptService.getAllReceipts();
        let list: SalesReceipt[];
        let rangeParam: { from?: string; to?: string } | undefined;

        if (scope === 'full') {
          list = allReceipts;
        } else {
          if (!fromVal && !toVal) {
            if (showAlerts) {
              alert('Please select at least a From or To date to share by date range.');
            }
            return;
          }
          if (fromVal && toVal && fromVal > toVal) {
            if (showAlerts) {
              alert('"From" date cannot be later than "To" date.');
            }
            setShareMessage('');
            return;
          }

          const fromStr = fromVal || '1900-01-01';
          const toStr = toVal || '2999-12-31';
          rangeParam = { from: fromVal || undefined, to: toVal || undefined };

          list = allReceipts.filter((rec) => {
            const recDateStr = toLocalDateStr(rec.createdAt);
            const receiptInRange = recDateStr >= fromStr && recDateStr <= toStr;
            const hasItemInRange = rec.items.some((it) => {
              const d = toLocalDateStr(it.addedAt || rec.createdAt);
              return d >= fromStr && d <= toStr;
            });
            const hasPaymentInRange = (rec.payments || []).some((p) => {
              const d = toLocalDateStr(p.date || rec.createdAt);
              return d >= fromStr && d <= toStr;
            });
            return receiptInRange || hasItemInRange || hasPaymentInRange;
          });
        }

        if (list.length === 0) {
          if (showAlerts) {
            alert('No receipts found to share for the selected criteria.');
          }
          setShareMessage('');
          return;
        }

        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        setShareMessage(buildReceiptShareMessage(list, rangeParam));
        setShareCopied(false);
        setShowShareModal(true);
      } catch (err) {
        console.error('Failed to build share message', err);
        if (showAlerts) {
          alert('Failed to load receipts for sharing.');
        }
      }
    },
    [lineItems.length, custName, performAutoSave, buildReceiptShareMessage]
  );

  const handleShareReceipt = async (scope: 'current' | 'full' | 'partial') => {
    setShareScope(scope);
    if (scope === 'current') {
      await handleOpenCurrentReceiptShare();
      return;
    }
    await loadFilteredShareReceipts(scope, shareFrom, shareTo, true);
  };

  useEffect(() => {
    if (!showShareModal || shareScope !== 'partial') return;
    if (!shareFrom && !shareTo) return;
    loadFilteredShareReceipts('partial', shareFrom, shareTo, false);
  }, [showShareModal, shareScope, shareFrom, shareTo, loadFilteredShareReceipts]);

  const handleCopyShareToClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareMessage);
      } else {
        const ta = document.createElement('textarea');
        ta.value = shareMessage;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
      alert('Unable to copy to clipboard.');
    }
  };

  const handleShareViaWhatsApp = () => {
    const digits = custPhone.replace(/\D/g, '');
    const waPhone =
      shareScope === 'current' && digits
        ? digits.length === 10
          ? `91${digits}`
          : digits
        : '';
    const baseUrl = waPhone ? `https://wa.me/${waPhone}` : 'https://wa.me/';
    const url = `${baseUrl}?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------
  const isLowStockCell = (item: StockItem, variant?: ItemVariant) => {
    if (variant) return variant.quantityLeft <= variant.threshold;
    return item.quantityLeft <= item.threshold;
  };

  const lineLowStock = (line: ReceiptItem) => {
    const item = items.find((i) => i.id === line.stockItemId);
    if (!item) return false;
    if (line.variantId && item.variants) {
      const v = item.variants.find((vr) => vr.id === line.variantId);
      return v ? v.quantityLeft <= v.threshold : false;
    }
    return item.quantityLeft <= item.threshold;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600 font-bold animate-pulse">Loading receipt...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ReceiptIcon className="w-6 h-6 text-indigo-600" />
            {t('receipt.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {editReceiptId ? 'Editing existing receipt' : 'Create a new sales receipt'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              autoSaveStatus === 'saving'
                ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                : autoSaveStatus === 'saved'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : autoSaveStatus === 'error'
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {autoSaveStatus === 'saving' && 'Saving...'}
            {autoSaveStatus === 'saved' && '✓ Auto-saved'}
            {autoSaveStatus === 'error' && '⚠ Auto-save failed'}
            {autoSaveStatus === 'idle' &&
              (!custName.trim()
                ? 'Add customer name to auto-save'
                : lineItems.length === 0
                ? 'Add items to auto-save'
                : 'Draft')}
          </span>
          <button
            onClick={async () => {
              await performAutoSave();
              onReceiptSaved();
            }}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm shadow-indigo-100 transition disabled:opacity-50 inline-flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Done
          </button>
          <button
            onClick={() => void handleOpenCurrentReceiptShare()}
            disabled={lineItems.length === 0 || saving}
            title={lineItems.length === 0 ? 'Add at least one item to share' : 'Share receipt'}
            className="px-3 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Share2 className="w-4 h-4 mr-1.5" /> Share
          </button>
        </div>
      </div>

      {/* Status + sync info bar */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
              receiptStatus === 'inProgress'
                ? 'bg-blue-100 text-blue-800'
                : receiptStatus === 'completed'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {receiptStatus}
          </span>
          <span className="text-xs text-slate-500">•</span>
          <span className="text-xs text-slate-500">
            {t('common.date')}: {new Date(receipt?.createdAt || Date.now()).toLocaleString('en-IN')}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <RefreshCwIcon className="w-3 h-3" />
          {t('lastSynced')}: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Main grid: left form, right summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Customer information + item selection + line items */}
        <div className="lg:col-span-7 space-y-6">
          {/* Customer information with Autocomplete */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-indigo-600" />
                {t('receipt.customerSection')}
              </h3>
              {knownCustomers.length > 0 && (
                <span className="text-[11px] text-slate-400">
                  {knownCustomers.length} saved customers
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                  {t('receipt.customerName')} *
                </label>
                <input
                  type="text"
                  value={custName}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 180)}
                  onChange={(e) => {
                    setCustName(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                  {t('receipt.customerPhone')}
                </label>
                <input
                  type="tel"
                  value={custPhone}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 180)}
                  onChange={(e) => {
                    setCustPhone(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                  {t('receipt.customerAddress')}
                </label>
                <input
                  type="text"
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                  placeholder="Address"
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Repeat Customer Autocomplete Dropdown */}
            {showCustomerDropdown && matchingCustomers.length > 0 && (
              <div className="mt-2 border border-indigo-100 rounded-xl bg-white shadow-lg overflow-hidden divide-y divide-slate-100">
                <div className="px-3 py-1.5 bg-indigo-50/70 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                  Repeat Customers (Click to Auto-fill)
                </div>
                {matchingCustomers.map((c, idx) => (
                  <button
                    key={`${c.phone}-${c.name}-${idx}`}
                    type="button"
                    onMouseDown={() => handleSelectCustomerSuggestion(c)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between text-xs transition"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{c.name}</span>
                      {c.address && (
                        <span className="text-slate-400 ml-2">• {c.address}</span>
                      )}
                    </div>
                    {c.phone && (
                      <span className="font-mono text-indigo-600 font-semibold">{c.phone}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <p className="mt-3 text-[11px] text-slate-500">
              Changes auto-save automatically once customer name and items are entered.
            </p>
          </div>

          {/* Item search & selection */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Search className="w-5 h-5 text-indigo-600" />
                {t('receipt.itemsSection')}
              </h3>
              {editingLineId && (
                <button
                  onClick={handleCancelEditLine}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="relative mt-4">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('receipt.selectItemPlaceholder')}
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>

            {searchQuery.trim() && (
              <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-white shadow-sm z-10">
                {items
                  .filter((it) => {
                    const q = searchQuery.toLowerCase();
                    const matchesMain =
                      it.id.toLowerCase().includes(q) ||
                      it.name.toLowerCase().includes(q) ||
                      !!(it.hindiName && it.hindiName.toLowerCase().includes(q)) ||
                      !!(it.serialNumber && it.serialNumber.toLowerCase().includes(q)) ||
                      it.shelfLocation.toLowerCase().includes(q);
                    const matchesVar =
                      it.hasVariants && it.variants
                        ? it.variants.some(
                            (v) =>
                              v.id.toLowerCase().includes(q) ||
                              !!(v.color && v.color.toLowerCase().includes(q)) ||
                              !!(v.size && v.size.toLowerCase().includes(q)) ||
                              !!(v.barcode && v.barcode.toLowerCase().includes(q)) ||
                              !!(v.shelfLocation && v.shelfLocation.toLowerCase().includes(q))
                          )
                        : false;
                    return matchesMain || matchesVar;
                  })
                  .slice(0, 8)
                  .map((it) => {
                    const low = isLowStockCell(it);
                    return (
                      <button
                        key={it.id}
                        onClick={() => handleSelectItem(it)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm border-b border-slate-50 hover:bg-slate-50 last:border-b-0 transition text-left"
                      >
                        <div className="flex flex-col">
                          <span className={`font-semibold ${low ? 'text-amber-700' : 'text-slate-900'}`}>
                            {it.name}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {it.id} {it.shelfLocation ? `• ${it.shelfLocation}` : ''}
                          </span>
                          {it.hindiName && <span className="text-[11px] text-slate-400">{it.hindiName}</span>}
                        </div>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                            low
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {low ? 'LOW' : formatQuantity(it.quantityLeft, it.unitType)}
                        </span>
                      </button>
                    );
                  })}
                {items.filter((it) => {
                  const q = searchQuery.toLowerCase();
                  const matchesMain =
                    it.id.toLowerCase().includes(q) ||
                    it.name.toLowerCase().includes(q) ||
                    !!(it.hindiName && it.hindiName.toLowerCase().includes(q)) ||
                    !!(it.serialNumber && it.serialNumber.toLowerCase().includes(q)) ||
                    it.shelfLocation.toLowerCase().includes(q);
                  const matchesVar =
                    it.hasVariants && it.variants
                      ? it.variants.some(
                          (v) =>
                            v.id.toLowerCase().includes(q) ||
                            !!(v.color && v.color.toLowerCase().includes(q)) ||
                            !!(v.size && v.size.toLowerCase().includes(q)) ||
                            !!(v.barcode && v.barcode.toLowerCase().includes(q)) ||
                            !!(v.shelfLocation && v.shelfLocation.toLowerCase().includes(q))
                        )
                      : false;
                  return matchesMain || matchesVar;
                }).length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-400">No matching items</div>
                )}
              </div>
            )}

            {/* Variant selection & quantity inputs for the chosen item */}
            {selectedStockItem && (
              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Selected: {selectedStockItem.name}
                      </span>
                      {canAccess('view_cost_price') && (
                        <button
                          type="button"
                          onClick={() => setShowPurchaseHistory(selectedStockItem)}
                          title="View purchase cost history"
                          className="text-indigo-500 hover:text-indigo-700 p-0.5 rounded"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {selectedStockItem.id} {selectedStockItem.shelfLocation ? `• ${selectedStockItem.shelfLocation}` : ''}
                      {selectedStockItem.hindiName && ` • ${selectedStockItem.hindiName}`}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                      selectedIsLowStock
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {selectedIsLowStock
                      ? `⚠ Low Stock (Remaining: ${formatQuantity(selectedAvailableQty, selectedStockItem.unitType)})`
                      : `Avail: ${formatQuantity(selectedAvailableQty, selectedStockItem.unitType)}`}
                  </span>
                </div>

                {selectedStockItem.hasVariants && selectedStockItem.variants && selectedStockItem.variants.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-slate-600 mb-2">
                      {t('receipt.selectVariant')}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      {selectedStockItem.variants.map((v) => {
                        const vLow = v.quantityLeft <= v.threshold;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => handlePickVariant(v)}
                            className={`flex flex-col items-center px-3 py-2.5 rounded-lg border text-sm transition ${
                              selectedVariant?.id === v.id
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm'
                                : vLow
                                ? 'bg-amber-50/50 border-amber-300 text-amber-700'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <span className="font-semibold">{v.color || '—'}</span>
                            <span className="text-xs text-slate-500">{v.size || '—'}</span>
                            <span className={`text-[10px] ${vLow ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                              {v.quantityLeft} left
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {(!selectedStockItem.hasVariants || selectedVariant) && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-slate-600 mb-2">
                      {selectedStockItem.unitType === 'weight'
                        ? 'Weight (kg)'
                        : selectedStockItem.unitType === 'both'
                        ? 'Qty / Weight'
                        : 'Qty (pcs)'}
                    </p>
                    {selectedStockItem.unitType !== 'weight' ? (
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={lineQty === '' ? '' : lineQty}
                        onChange={(e) => setLineQty(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        placeholder="Qty"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : null}
                    {selectedStockItem.unitType === 'weight' || selectedStockItem.unitType === 'both' ? (
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={lineWeight === '' ? '' : lineWeight}
                        onChange={(e) => setLineWeight(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        placeholder="Weight (kg)"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 mt-2"
                      />
                    ) : null}
                  </div>
                )}

                {(!selectedStockItem.hasVariants || selectedVariant) && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={lineIsReturn}
                      onChange={(e) => handleToggleReturn(e.target.checked)}
                      disabled={regularQtyInReceipt === 0 || maxReturnAllowed <= 0}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                    />
                    <label className="text-xs text-slate-600">
                      {t('receipt.isReturnCheckbox')}
                    </label>
                    {regularQtyInReceipt === 0 && (
                      <span className="text-[11px] text-rose-600 ml-1">
                        {t('receipt.returnNotInReceipt')}
                      </span>
                    )}
                    {regularQtyInReceipt > 0 && (
                      <span className="text-[11px] text-amber-600 ml-1">
                        Max return: {formatQuantity(maxReturnAllowed, selectedStockItem.unitType)}
                      </span>
                    )}
                    {lineIsReturn && (
                      <input
                        type="text"
                        placeholder="Return reason"
                        value={lineReturnReason}
                        onChange={(e) => setLineReturnReason(e.target.value)}
                        className="ml-2 px-2 py-1 text-xs border border-slate-300 rounded"
                      />
                    )}
                    {lineIsReturn && (
                      <span className="text-[11px] text-rose-600">{t('receipt.returnNotice')}</span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                      Unit Price ({currency || 'INR'})
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={lineUnitPrice === '' ? '' : lineUnitPrice}
                      onChange={(e) => setLineUnitPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                      {t('receipt.itemDiscount')}
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={lineDiscount === '' ? '' : lineDiscount}
                      onChange={(e) => setLineDiscount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleAddLineItem}
                    disabled={!selectedStockItem}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingLineId ? 'Update Line Item' : t('receipt.addItemBtn')}
                  </button>
                  <button
                    onClick={handleClearSelection}
                    className="px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t('receipt.clearBtn')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Line items table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider text-slate-500">
                Line Items ({lineItems.length})
              </h3>
              <span className="text-xs text-slate-400">
                Editable • returns restore stock
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                    <th className="py-3 px-4">{t('receipt.table.item')}</th>
                    <th className="py-3 px-4 text-center">{t('receipt.table.qty')}</th>
                    <th className="py-3 px-4 text-right">{t('receipt.table.rate')}</th>
                    <th className="py-3 px-4 text-right">{t('receipt.table.disc')}</th>
                    <th className="py-3 px-4 text-right">{t('receipt.table.amount')}</th>
                    <th className="py-3 px-4 text-center">{t('receipt.table.action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lineItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        No items added yet. Search and add an item above.
                      </td>
                    </tr>
                  ) : (
                    lineItems.map((line) => {
                      const item = items.find((i) => i.id === line.stockItemId);
                      const low = lineLowStock(line);
                      const isReturn = line.isReturn;
                      return (
                        <tr key={line.id} className={`hover:bg-slate-50 transition ${isReturn ? 'bg-rose-50' : ''}`}>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col">
                              <span className={`font-semibold ${low ? 'text-amber-700 font-bold' : 'text-slate-900'}`}>
                                {line.stockItemName}
                              </span>
                              {item?.hindiName && (
                                <span className="text-[11px] text-slate-500">{item.hindiName}</span>
                              )}
                              {line.variantDescription && (
                                <span className="text-[11px] text-slate-500 block mt-0.5">
                                  {line.variantDescription}
                                </span>
                              )}
                              {(line.color || line.size) && (
                                <span className="text-[11px] text-slate-400 block mt-0.5">
                                  {line.color || ''} {line.size || ''}
                                </span>
                              )}
                              {isReturn && (
                                <span className="text-[10px] text-rose-600 font-bold block mt-0.5">
                                  [RETURN]{line.returnReason ? ` - ${line.returnReason}` : ''}
                                </span>
                              )}
                              <span className="text-[11px] text-slate-400 block mt-0.5">
                                {item?.id} • added {new Date(line.addedAt).toLocaleDateString('en-IN')}
                              </span>
                              {low && (
                                <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 rounded mt-1 inline-block w-fit">
                                  ⚠ Low Stock
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center font-medium">
                            {line.quantity}
                            {line.weight ? ` (${line.weight} kg)` : ''}
                            {isReturn ? ' (return)' : ''}
                          </td>
                          <td className="py-3.5 px-4 text-right font-semibold text-slate-700">
                            {formatCurrency(line.unitPrice, currency)}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {line.discountAmount > 0 ? (
                              <span className="text-rose-600 font-semibold">
                                -{formatCurrency(line.discountAmount, currency)}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-slate-900">
                            {formatCurrency(line.totalPrice, currency)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleEditLine(line)}
                                className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition"
                                title="Edit line"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemoveLine(line.id)}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition"
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
          </div>
        </div>

        {/* Right: Summary + GST/Billing Mode + Payments */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm uppercase tracking-wider text-slate-500">
                {t('receipt.summary')}
              </h3>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setBillType('composition');
                    setGstRate(0);
                  }}
                  className={`px-2 py-1 rounded-md transition ${
                    billType === 'composition'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  Composition / Est.
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBillType('tax_invoice');
                    if (gstRate === 0) setGstRate(18);
                  }}
                  className={`px-2 py-1 rounded-md transition ${
                    billType === 'tax_invoice'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  GST Invoice
                </button>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{t('receipt.subtotal')}</span>
                <span className="font-medium text-slate-700">{formatCurrency(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-sm text-rose-600">
                <span>{t('receipt.globalDiscount')}</span>
                <span className="font-medium">-{formatCurrency(gd, currency)}</span>
              </div>
              {billType === 'tax_invoice' && (
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <span>GST Slab</span>
                    <select
                      aria-label="GST Slab"
                      value={gstRate}
                      onChange={(e) => setGstRate(Number(e.target.value))}
                      className="px-2 py-0.5 text-xs border border-slate-300 rounded bg-slate-50 font-semibold"
                    >
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  </div>
                  <span className="font-medium">+{formatCurrency(taxAmount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold text-slate-900 border-t pt-2">
                <span>{t('receipt.grandTotal')}</span>
                <span className="text-lg">{formatCurrency(grandTotal, currency)}</span>
              </div>
            </div>

            {/* Receipt discount input */}
            <div className="mb-6">
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-2">
                {t('receipt.globalDiscount')}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={globalDiscount === '' ? '' : globalDiscount}
                onChange={(e) => setGlobalDiscount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Payments */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {t('receipt.amountPaid')} / Payments
                </span>
                <span className="text-xs text-emerald-600 font-bold">
                  {formatCurrency(amountReceived, currency)}
                </span>
              </div>
              <div className="space-y-2 mb-3">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{paymentMethodLabel(p.method)}</span>
                      <span className="text-slate-400">{new Date(p.date).toLocaleDateString('en-IN')}</span>
                      {p.transactionRef && (
                        <span className="text-[10px] text-slate-400">#{p.transactionRef}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">{formatCurrency(p.amount, currency)}</span>
                      <button
                        onClick={() => handleRemovePayment(p.id)}
                        className="p-1 text-rose-500 hover:text-rose-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {payments.length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-400 text-center">
                    No payments recorded yet
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={newPaymentAmount === '' ? '' : newPaymentAmount}
                  onChange={(e) => setNewPaymentAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="Amount"
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <select
                  value={newPaymentMethod}
                  onChange={(e) => setNewPaymentMethod(e.target.value as any)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="credit">Credit</option>
                  <option value="check">Check</option>
                </select>
              </div>
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Ref / UPI ID (optional)"
                  value={newPaymentRef}
                  onChange={(e) => setNewPaymentRef(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={handleAddPayment}
                className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold mt-2 flex items-center justify-center"
              >
                <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Add Payment
              </button>
            </div>

            <div className="border-t border-slate-200 pt-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{t('receipt.balanceDue')}</span>
                <span className={`font-bold ${balanceDue > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {formatCurrency(balanceDue, currency)}
                </span>
              </div>
            </div>

            {/* Status */}
            <div className="mt-5">
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-2">
                {t('receipt.status')}
              </label>
              <select
                value={receiptStatus}
                onChange={(e) => handleStatusChange(e.target.value as SalesReceipt['status'])}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="inProgress">{t('receipt.statusInProgress')}</option>
                <option value="completed">{t('receipt.statusCompleted')}</option>
                <option value="paused">{t('receipt.statusPaused')}</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="mt-5">
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-2">
                Notes
              </label>
              <textarea
                value={receiptNotes}
                onChange={(e) => setReceiptNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={async () => {
                  await performAutoSave();
                  onReceiptSaved();
                }}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm shadow-indigo-200 transition disabled:opacity-50 inline-flex items-center justify-center"
              >
                Done
              </button>
              <button
                onClick={() => window.print()}
                disabled={saving}
                className="px-3 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition disabled:opacity-50 inline-flex items-center justify-center"
              >
                <Printer className="w-4 h-4 mr-2" /> {t('receipt.printReceipt')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Purchase cost history modal (triggered via Info button on selected item) */}
      {showPurchaseHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div>
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  <HistoryIcon className="w-5 h-5 text-indigo-600" />
                  Purchase Cost Audit History
                </h3>
                <p className="text-xs text-slate-500">
                  {showPurchaseHistory.name} ({showPurchaseHistory.id})
                </p>
              </div>
              <button
                onClick={() => setShowPurchaseHistory(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-100 flex items-center justify-between">
              <div>
                <div className="text-xs text-indigo-700 font-medium">Current Weighted Avg Cost</div>
                <div className="text-xl font-black text-indigo-950 mt-0.5">
                  {formatCurrency(showPurchaseHistory.averagePurchasePrice, currency)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-indigo-700 font-medium">In-Stock Qty</div>
                <div className="text-lg font-bold text-indigo-900">
                  {formatQuantity(showPurchaseHistory.quantityLeft, showPurchaseHistory.unitType)}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Batches Added Log
              </h4>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {showPurchaseHistory.purchaseHistory && showPurchaseHistory.purchaseHistory.length > 0 ? (
                  showPurchaseHistory.purchaseHistory.map((ph) => (
                    <div key={ph.id} className="p-3 text-xs flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <div className="font-bold text-slate-800">
                          +{ph.quantity} @ {formatCurrency(ph.purchasePrice, currency)}
                        </div>
                        <div className="text-slate-400 text-[11px] mt-0.5">
                          {ph.supplier || 'General Purchase'} • {new Date(ph.date).toLocaleDateString('en-IN')}
                        </div>
                      </div>
                      <div className="text-right font-semibold text-slate-600">
                        {formatCurrency(ph.quantity * ph.purchasePrice, currency)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400">
                    No batch records yet.
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setShowPurchaseHistory(null)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Share Receipt Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Share2 className="w-5 h-5 text-indigo-600" />
                Share Sales Receipt
              </h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => void handleShareReceipt('current')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition ${
                  shareScope === 'current'
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                This Receipt
              </button>
              <button
                onClick={() => void handleShareReceipt('full')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition ${
                  shareScope === 'full'
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                All Receipts
              </button>
              <button
                onClick={() => void handleShareReceipt('partial')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition ${
                  shareScope === 'partial'
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                By Date Range
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase">From</label>
                <input
                  type="date"
                  value={shareFrom}
                  onChange={(e) => {
                    setShareFrom(e.target.value);
                    setShareScope('partial');
                  }}
                  className="px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase">To</label>
                <input
                  type="date"
                  value={shareTo}
                  onChange={(e) => {
                    setShareTo(e.target.value);
                    setShareScope('partial');
                  }}
                  className="px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {shareMessage ? (
              <div className="flex-1 overflow-y-auto">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Preview
                </p>
                <pre className="whitespace-pre-wrap text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono">
                  {shareMessage}
                </pre>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl">
                {shareScope === 'partial'
                  ? 'Select a From / To date range above to preview matching receipts.'
                  : 'No receipts available for preview.'}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={handleCopyShareToClipboard}
                disabled={!shareMessage}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center disabled:opacity-50"
              >
                {shareCopied ? <Check className="w-4 h-4 mr-1.5 text-emerald-600" /> : <Copy className="w-4 h-4 mr-1.5" />}
                {shareCopied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleShareViaWhatsApp}
                disabled={!shareMessage}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center disabled:opacity-50"
              >
                <Share2 className="w-4 h-4 mr-1.5" /> WhatsApp
              </button>
              <button
                onClick={() => setShowShareModal(false)}
                className="sm:w-28 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
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

function ReceiptIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function RefreshCwIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.857-8m15.857 8V15" />
    </svg>
  );
}
