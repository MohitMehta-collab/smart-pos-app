// import { useAppStore } from '../store/useAppStore';
// import type { StockItem, ReceiptItem, PurchaseHistoryEntry } from '../types';
// import { calculateWeightedAveragePrice } from '../utils/pricing';

// const getDb = () => {
//   const db = useAppStore.getState().currentDb;
//   if (!db) throw new Error('Database not initialized. Please login.');
//   return db;
// };

// export const StockService = {
//   /**
//    * Fetch all stock items with live counts
//    */
//   async getAllItems(): Promise<StockItem[]> {
//     const db = getDb();
//     return await db.stockItems.toArray();
//   },

//   /**
//    * Search stock items by text query (id, name, serial, shelf)
//    */
//   async searchItems(query: string): Promise<StockItem[]> {
//     const db = getDb();
//     const q = query.trim().toLowerCase();
//     if (!q) return await db.stockItems.toArray();

//     return await db.stockItems
//       .filter((item) => {
//         return (
//           item.id.toLowerCase().includes(q) ||
//           item.name.toLowerCase().includes(q) ||
//           !!(item.hindiName && item.hindiName.toLowerCase().includes(q)) ||
//           !!(item.serialNumber && item.serialNumber.toLowerCase().includes(q)) ||
//           item.shelfLocation.toLowerCase().includes(q)
//         );
//       })
//       .toArray();
//   },

//   /**
//    * Get single item by ID
//    */
//   async getItemById(id: string): Promise<StockItem | undefined> {
//     const db = getDb();
//     return await db.stockItems.get(id);
//   },

//   /**
//    * Add a new stock item with initial purchase batch
//    */
//   async createItem(item: StockItem): Promise<string> {
//     const db = getDb();
//     const now = new Date().toISOString();
//     const finalItem: StockItem = {
//       ...item,
//       createdAt: now,
//       updatedAt: now,
//     };
//     return await db.stockItems.add(finalItem);
//   },

//   /**
//    * Add a new restock/purchase batch and update weighted average price
//    */
//   async addRestockBatch(
//     itemId: string,
//     addedQuantity: number,
//     batchPurchasePrice: number,
//     supplier?: string,
//     newSellingPrice?: number
//   ): Promise<void> {
//     const db = getDb();
//     const item = await db.stockItems.get(itemId);
//     if (!item) throw new Error('Item not found');

//     const newAvgPrice = calculateWeightedAveragePrice(
//       item.quantityLeft,
//       item.averagePurchasePrice,
//       addedQuantity,
//       batchPurchasePrice
//     );

//     const historyEntry: PurchaseHistoryEntry = {
//       id: `ph-${Date.now()}`,
//       date: new Date().toISOString(),
//       quantity: addedQuantity,
//       purchasePrice: batchPurchasePrice,
//       supplier: supplier || 'General Purchase',
//     };

//     const updatedHistory = [historyEntry, ...(item.purchaseHistory || [])];
//     const updatedQuantity = item.quantityLeft + addedQuantity;

//     await db.stockItems.update(itemId, {
//       quantityLeft: updatedQuantity,
//       averagePurchasePrice: newAvgPrice,
//       sellingPrice: newSellingPrice && newSellingPrice > 0 ? newSellingPrice : item.sellingPrice,
//       purchaseHistory: updatedHistory,
//       updatedAt: new Date().toISOString(),
//     });
//   },

//   /**
//    * Adjust stock quantities when sales receipt items are added/modified/returned.
//    * Runs inside an atomic Dexie transaction to prevent race conditions.
//    */
//   async adjustStockForReceipt(receiptItems: ReceiptItem[]): Promise<void> {
//     const db = getDb();
//     await db.transaction('rw', db.stockItems, async () => {
//       for (const line of receiptItems) {
//         const item = await db.stockItems.get(line.stockItemId);
//         if (!item) continue;

//         const delta = line.isReturn ? line.quantity : -line.quantity;

//         if (item.hasVariants && line.variantId && item.variants) {
//           const updatedVariants = item.variants.map((v) => {
//             if (v.id === line.variantId) {
//               return {
//                 ...v,
//                 quantityLeft: Math.max(0, v.quantityLeft + delta),
//               };
//             }
//             return v;
//           });

//           const totalQty = updatedVariants.reduce((sum, v) => sum + v.quantityLeft, 0);

//           await db.stockItems.update(item.id, {
//             variants: updatedVariants,
//             quantityLeft: totalQty,
//             updatedAt: new Date().toISOString(),
//           });
//         } else {
//           const newQty = Math.max(0, item.quantityLeft + delta);
//           await db.stockItems.update(item.id, {
//             quantityLeft: newQty,
//             updatedAt: new Date().toISOString(),
//           });
//         }
//       }
//     });
//   },

//   /**
//    * Delete a stock item by ID (Admin/Manager only - checked in UI)
//    */
//   async deleteItem(itemId: string): Promise<void> {
//     const db = getDb();
//     await db.stockItems.delete(itemId);
//   },

//   /**
//    * Update an existing stock item (used by the Edit Item flow)
//    */
//   async updateItem(itemId: string, updates: Partial<StockItem>): Promise<void> {
//     const db = getDb();
//     await db.stockItems.update(itemId, {
//       ...updates,
//       updatedAt: new Date().toISOString(),
//     });
//   },

//   /**
//    * Get all categories (id -> name)
//    */
//   async getAllCategories(): Promise<{ id: string; name: string }[]> {
//     const db = getDb();
//     const cats = await db.categories.toArray();
//     return cats.map((c) => ({ id: c.id, name: c.name }));
//   },

//   /**
//    * Add a new category (idempotent — returns existing if name matches)
//    */
//   async addCategory(name: string): Promise<string> {
//     const db = getDb();
//     const trimmed = name.trim();
//     if (!trimmed) throw new Error('Category name is required');

//     const existing = await db.categories.where('name').equalsIgnoreCase(trimmed).first();
//     if (existing) return existing.id;

//     const id = `cat-${Date.now()}`;
//     const now = new Date().toISOString();
//     await db.categories.add({ id, name: trimmed, createdAt: now, updatedAt: now });
//     return id;
//   },
// };


import { useAppStore } from '../store/useAppStore';
import type { StockItem, ReceiptItem, PurchaseHistoryEntry } from '../types';
import { calculateWeightedAveragePrice } from '../utils/pricing';

const getDb = () => {
  const db = useAppStore.getState().currentDb;
  if (!db) throw new Error('Database not initialized. Please login.');
  return db;
};

const roundQty = (val: number): number => Math.round(Math.max(0, val) * 1000) / 1000;

export const StockService = {
  /**
   * Fetch all stock items with live counts
   */
  async getAllItems(): Promise<StockItem[]> {
    const db = getDb();
    return await db.stockItems.toArray();
  },

  /**
   * Search stock items by text query (id, name, hindiName, serial, shelf)
   */
  async searchItems(query: string): Promise<StockItem[]> {
    const db = getDb();
    const q = query.trim().toLowerCase();
    if (!q) return await db.stockItems.toArray();

    return await db.stockItems
      .filter((item) => {
        return (
          item.id.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          !!(item.hindiName && item.hindiName.toLowerCase().includes(q)) ||
          !!(item.serialNumber && item.serialNumber.toLowerCase().includes(q)) ||
          item.shelfLocation.toLowerCase().includes(q)
        );
      })
      .toArray();
  },

  /**
   * Get single item by ID
   */
  async getItemById(id: string): Promise<StockItem | undefined> {
    const db = getDb();
    return await db.stockItems.get(id);
  },

  /**
   * Add a new stock item with initial purchase batch
   */
  async createItem(item: StockItem): Promise<string> {
    const db = getDb();
    const existing = await db.stockItems.get(item.id);
    if (existing) {
      throw new Error(`Item ID "${item.id}" already exists.`);
    }

    const now = new Date().toISOString();
    const finalItem: StockItem = {
      ...item,
      createdAt: now,
      updatedAt: now,
    };
    return await db.stockItems.add(finalItem);
  },

  /**
   * Add a new restock/purchase batch and update weighted average price atomically
   */
  async addRestockBatch(
    itemId: string,
    addedQuantity: number,
    batchPurchasePrice: number,
    supplier?: string,
    newSellingPrice?: number
  ): Promise<void> {
    const db = getDb();
    await db.transaction('rw', db.stockItems, async () => {
      const item = await db.stockItems.get(itemId);
      if (!item) throw new Error('Item not found');

      const newAvgPrice = calculateWeightedAveragePrice(
        item.quantityLeft,
        item.averagePurchasePrice,
        addedQuantity,
        batchPurchasePrice
      );

      const historyEntry: PurchaseHistoryEntry = {
        id: `ph-${Date.now()}`,
        date: new Date().toISOString(),
        quantity: addedQuantity,
        purchasePrice: batchPurchasePrice,
        supplier: supplier?.trim() || 'General Purchase',
      };

      const updatedHistory = [historyEntry, ...(item.purchaseHistory || [])];
      const updatedQuantity = roundQty(item.quantityLeft + addedQuantity);

      await db.stockItems.update(itemId, {
        quantityLeft: updatedQuantity,
        averagePurchasePrice: newAvgPrice,
        sellingPrice:
          newSellingPrice !== undefined && newSellingPrice >= 0
            ? newSellingPrice
            : item.sellingPrice,
        purchaseHistory: updatedHistory,
        updatedAt: new Date().toISOString(),
      });
    });
  },

  /**
   * Adjust stock quantities when sales receipt items are added/modified/returned.
   * Runs inside an atomic Dexie transaction to prevent race conditions.
   */
  async adjustStockForReceipt(receiptItems: ReceiptItem[]): Promise<void> {
    const db = getDb();
    await db.transaction('rw', db.stockItems, async () => {
      for (const line of receiptItems) {
        const item = await db.stockItems.get(line.stockItemId);
        if (!item) continue;

        const delta = line.isReturn ? line.quantity : -line.quantity;

        if (item.hasVariants && line.variantId && item.variants) {
          const updatedVariants = item.variants.map((v) => {
            if (v.id === line.variantId) {
              return {
                ...v,
                quantityLeft: roundQty(v.quantityLeft + delta),
              };
            }
            return v;
          });

          const totalQty = roundQty(
            updatedVariants.reduce((sum, v) => sum + v.quantityLeft, 0)
          );

          await db.stockItems.update(item.id, {
            variants: updatedVariants,
            quantityLeft: totalQty,
            updatedAt: new Date().toISOString(),
          });
        } else {
          const newQty = roundQty(item.quantityLeft + delta);
          await db.stockItems.update(item.id, {
            quantityLeft: newQty,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    });
  },

  /**
   * Delete a stock item by ID (Admin/Manager only - checked in UI)
   */
  async deleteItem(itemId: string): Promise<void> {
    const db = getDb();
    await db.stockItems.delete(itemId);
  },

  /**
   * Update an existing stock item (used by the Edit Item flow)
   */
  async updateItem(itemId: string, updates: Partial<StockItem>): Promise<void> {
    const db = getDb();
    await db.stockItems.update(itemId, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  },

  /**
   * Get all categories (id -> name)
   */
  async getAllCategories(): Promise<{ id: string; name: string }[]> {
    const db = getDb();
    const cats = await db.categories.toArray();
    return cats.map((c) => ({ id: c.id, name: c.name }));
  },

  /**
   * Add a new category (idempotent — returns existing if name matches)
   */
  async addCategory(name: string): Promise<string> {
    const db = getDb();
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Category name is required');

    const existing = await db.categories.where('name').equalsIgnoreCase(trimmed).first();
    if (existing) return existing.id;

    const id = `cat-${Date.now()}`;
    const now = new Date().toISOString();
    await db.categories.add({ id, name: trimmed, createdAt: now, updatedAt: now });
    return id;
  },

  /**
   * Update an existing category's display name
   */
  async updateCategory(id: string, name: string): Promise<void> {
    const db = getDb();
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Category name is required');

    const existing = await db.categories.where('name').equalsIgnoreCase(trimmed).first();
    if (existing && existing.id !== id) {
      throw new Error(`Category "${trimmed}" already exists.`);
    }

    await db.categories.update(id, {
      name: trimmed,
      updatedAt: new Date().toISOString(),
    });
  },
};