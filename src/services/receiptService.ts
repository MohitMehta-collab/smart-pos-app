import { useAppStore } from '../store/useAppStore';
import type { SalesReceipt, ReceiptItem } from '../types';
import { StockService } from './stockService';

const getDb = () => {
  const db = useAppStore.getState().currentDb;
  if (!db) throw new Error('Database not initialized. Please login.');
  return db;
};

export const ReceiptService = {
  /**
   * Generate next sequential receipt ID (e.g. REC-2026-0001)
   */
  async generateReceiptId(): Promise<string> {
    const db = getDb();
    const totalCount = await db.receipts.count();
    const nextNumber = totalCount + 1;
    const year = new Date().getFullYear();
    return `REC-${year}-${String(nextNumber).padStart(4, '0')}`;
  },

  /**
   * Save or Update a receipt.
   * If stock deduction should happen (e.g. status moves from inProgress to completed, or items are added),
   * this handles both the receipt record and stock adjustments.
   */
  async saveReceipt(receipt: SalesReceipt, deductInventory: boolean = true): Promise<string> {
    const db = getDb();
    const existing = await db.receipts.get(receipt.id);

    if (existing) {
      // Calculate delta of items if updating existing receipt to adjust stock accurately
      if (deductInventory) {
        // Simple reconciliation: reverse previous items effect, then apply new items
        const reverseItems: ReceiptItem[] = existing.items.map((it) => ({
          ...it,
          isReturn: !it.isReturn, // inverse action
        }));
        await StockService.adjustStockForReceipt(reverseItems);
        await StockService.adjustStockForReceipt(receipt.items);
      }

      await db.receipts.put({
        ...receipt,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // New receipt
      if (deductInventory) {
        await StockService.adjustStockForReceipt(receipt.items);
      }
      await db.receipts.add({
        ...receipt,
        createdAt: receipt.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return receipt.id;
  },

  /**
   * Get all active in-progress or paused receipts for the Sales Dashboard
   */
  async getActiveDashboardReceipts(): Promise<SalesReceipt[]> {
    const db = getDb();
    return await db.receipts
      .filter((r) => r.status === 'inProgress' || r.status === 'paused')
      .reverse()
      .sortBy('updatedAt');
  },

  /**
   * Get all receipts for Order History, sorted by date (newest first)
   */
  async getAllReceipts(query?: string, statusFilter?: string): Promise<SalesReceipt[]> {
    const db = getDb();
    let collection = db.receipts.toCollection();

    let items = await collection.toArray();

    // Sort by date descending (newest first)
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (statusFilter && statusFilter !== 'all') {
      items = items.filter((r) => r.status === statusFilter);
    }

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter((r) => {
        return (
          r.id.toLowerCase().includes(q) ||
          (r.customerName && r.customerName.toLowerCase().includes(q)) ||
          (r.customerPhone && r.customerPhone.toLowerCase().includes(q))
        );
      });
    }

    return items;
  },

  /**
   * Get receipts within an inclusive date range, sorted by date (newest first)
   */
  async getReceiptsByDateRange(fromDate: string, toDate: string): Promise<SalesReceipt[]> {
    const db = getDb();
    const from = new Date(fromDate).setHours(0, 0, 0, 0);
    const to = new Date(toDate).setHours(23, 59, 59, 999);

    const items = await db.receipts
      .filter((r) => {
        const created = new Date(r.createdAt).getTime();
        return created >= from && created <= to;
      })
      .toArray();

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items;
  },

  /**
   * Get orders of a specific customer by phone number or name (for WhatsApp remote query)
   */
  async getCustomerOrders(customerQuery: string): Promise<SalesReceipt[]> {
    const db = getDb();
    const q = customerQuery.trim().toLowerCase();
    const items = await db.receipts.toArray();
    return items
      .filter((r) => {
        return (
          (r.customerPhone && r.customerPhone.toLowerCase().includes(q)) ||
          (r.customerName && r.customerName.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
};