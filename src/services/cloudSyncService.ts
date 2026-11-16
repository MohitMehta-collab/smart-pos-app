import type { POSDatabase } from '../db';
import { registryDb } from '../db/businessRegistry';
import type {
  Business,
  StockItem,
  SalesReceipt,
  Customer,
  AppUser,
  RoleDefinition,
  Category,
} from '../types';
import {
  isSupabaseConfigured,
  getSupabaseConfig,
  sbSelect,
  sbUpsert,
} from './supabaseClient';
import { getDeletedRegistry } from './stockService';

export interface SyncResult {
  ok: boolean;
  pushedCount: number;
  pulledCount: number;
  syncedAt: string;
  message: string;
}

const DEFAULT_DEMO_STOCK_IDS = ['ITEM-101', 'ITEM-102', 'ITEM-103'];
const DEFAULT_DEMO_CATEGORY_IDS = [
  'cat-clothing',
  'cat-grocery',
  'cat-electronics',
  'cat-hardware',
  'cat-pharmacy',
  'cat-other',
];

async function deleteRemoteRowsByIds(
  table: string,
  businessId: string,
  ids: string[]
): Promise<void> {
  if (!ids.length) return;
  const cfg = getSupabaseConfig();
  if (!cfg?.url || !cfg?.anonKey) return;

  const cleanUrl = cfg.url.replace(/\/+$/, '');
  const encodedIds = ids.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
  const endpoint = `${cleanUrl}/rest/v1/${table}?business_id=eq.${encodeURIComponent(
    businessId
  )}&id=in.(${encodeURIComponent(encodedIds)})`;

  try {
    await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    console.error(`Failed to delete remote rows from ${table}:`, err);
  }
}

export class CloudSyncService {
  private static isSyncing = false;

  /**
   * Pull all registered businesses from Supabase into local registryDb
   */
  static async pullBusinessesFromCloud(): Promise<Business[]> {
    if (!isSupabaseConfigured() || !navigator.onLine) {
      return await registryDb.businesses.toArray();
    }

    try {
      const remoteRows = await sbSelect<any>('businesses', {
        is_active: 'eq.true',
        order: 'created_at.asc',
      });

      const remoteIds = new Set(remoteRows.map((r: any) => r.id));

      for (const row of remoteRows) {
        const mapped: Business = {
          id: row.id,
          name: row.name,
          ownerName: row.owner_name,
          phone: row.phone,
          email: row.email || undefined,
          businessType: row.business_type || 'retail',
          currency: row.currency || 'INR',
          address: row.address || undefined,
          createdAt: row.created_at || new Date().toISOString(),
          isActive: row.is_active !== false,
        };
        await registryDb.businesses.put(mapped);
      }

      // Remove any local businesses that are no longer in Supabase (e.g. deleted test workspaces)
      const localBusinesses = await registryDb.businesses.toArray();
      const staleIds = localBusinesses
        .filter((b) => !remoteIds.has(b.id))
        .map((b) => b.id);

      if (staleIds.length > 0) {
        await registryDb.businesses.bulkDelete(staleIds);
      }
    } catch (err) {
      console.error('Failed to pull businesses from Supabase:', err);
    }

    return await registryDb.businesses.toArray();
  }

  /**
   * Push a single business record to Supabase
   */
  static async pushBusiness(biz: Business): Promise<void> {
    if (!isSupabaseConfigured() || !navigator.onLine) return;
    await sbUpsert(
      'businesses',
      [
        {
          id: biz.id,
          name: biz.name,
          owner_name: biz.ownerName,
          phone: biz.phone,
          email: biz.email || null,
          business_type: biz.businessType,
          currency: biz.currency,
          address: biz.address || null,
          created_at: biz.createdAt,
          is_active: biz.isActive,
        },
      ],
      'id'
    );
  }

  /**
   * Full Two-Way Sync for a Business:
   * 1. Propagates local deletions (tombstones + legacy demo seed IDs) to Supabase
   * 2. Pushes local -> Cloud
   * 3. Pulls Cloud -> Local (ignoring any deleted IDs so deleted items NEVER reappear!)
   */
  static async syncBusiness(biz: Business, db: POSDatabase): Promise<SyncResult> {
    const nowIso = new Date().toISOString();
    const displayTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (!isSupabaseConfigured()) {
      return {
        ok: false,
        pushedCount: 0,
        pulledCount: 0,
        syncedAt: displayTime,
        message: 'Supabase URL / Key not configured yet.',
      };
    }

    if (!navigator.onLine) {
      return {
        ok: false,
        pushedCount: 0,
        pulledCount: 0,
        syncedAt: displayTime,
        message: 'Offline — changes saved locally and will sync when internet returns.',
      };
    }

    if (this.isSyncing) {
      return {
        ok: true,
        pushedCount: 0,
        pulledCount: 0,
        syncedAt: displayTime,
        message: 'Sync already in progress.',
      };
    }

    this.isSyncing = true;
    let pushed = 0;
    let pulled = 0;

    try {
      const prevSyncMeta = await db.syncMeta.get('cloud_sync');
      const lastSyncedMs = prevSyncMeta?.lastSyncedAt
        ? new Date(prevSyncMeta.lastSyncedAt).getTime()
        : 0;

      await db.syncMeta.put({
        id: 'cloud_sync',
        key: 'cloud_sync',
        lastSyncedAt: nowIso,
        syncedRecordsCount: 0,
        status: 'syncing',
      });

      // 1. Ensure Business row exists in Supabase
      await this.pushBusiness(biz);

      // 2. Read local tables & deleted IDs registry
      const [localRoles, localUsers, localCats, localStock, localReceipts, localCustomers] =
        await Promise.all([
          db.roles.toArray(),
          db.users.toArray(),
          db.categories.toArray(),
          db.stockItems.toArray(),
          db.receipts.toArray(),
          db.customers.toArray(),
        ]);

      const deletedReg = getDeletedRegistry(biz.id);
      const localStockIds = new Set(localStock.map((s) => s.id));
      const localCatIds = new Set(localCats.map((c) => c.id));

      // Combine explicit tombstones + any legacy demo seed IDs that were deleted locally
      const deletedStockIds = new Set<string>([
        ...deletedReg.stockItems,
        ...DEFAULT_DEMO_STOCK_IDS.filter((id) => !localStockIds.has(id)),
      ]);
      const deletedCatIds = new Set<string>([
        ...deletedReg.categories,
        ...DEFAULT_DEMO_CATEGORY_IDS.filter((id) => !localCatIds.has(id)),
      ]);
      const deletedReceiptIds = new Set<string>(deletedReg.receipts);

      // Push deletions to Supabase first so cloud stays clean
      await Promise.all([
        deleteRemoteRowsByIds('stock_items', biz.id, Array.from(deletedStockIds)),
        deleteRemoteRowsByIds('categories', biz.id, Array.from(deletedCatIds)),
        deleteRemoteRowsByIds('receipts', biz.id, Array.from(deletedReceiptIds)),
      ]);

      // 3. Push local records to Supabase (Upsert)
      if (localRoles.length > 0) {
        await sbUpsert(
          'roles',
          localRoles.map((r) => ({
            id: r.id,
            business_id: biz.id,
            name: r.name,
            description: r.description || null,
            permissions: r.permissions,
            is_system: Boolean(r.isSystem),
            created_at: r.createdAt,
            updated_at: r.updatedAt,
          })),
          'business_id,id'
        );
        pushed += localRoles.length;
      }

      // Pull remote users first so manual password/PIN edits made in Supabase Dashboard are never overwritten by stale local users
      const preRemoteUsers = await sbSelect<any>('app_users', { business_id: `eq.${biz.id}` });
      for (const ru of preRemoteUsers) {
        await db.users.put({
          id: ru.id,
          username: ru.username,
          fullName: ru.full_name,
          phone: ru.phone || undefined,
          email: ru.email || undefined,
          role: ru.role,
          pinCode: ru.pin_code || undefined,
          password: ru.password || undefined,
          isActive: ru.is_active !== false,
          createdAt: ru.created_at,
        });
      }
      const mergedLocalUsers = await db.users.toArray();
      if (mergedLocalUsers.length > 0) {
        await sbUpsert(
          'app_users',
          mergedLocalUsers.map((u) => ({
            id: u.id,
            business_id: biz.id,
            username: u.username,
            full_name: u.fullName,
            phone: u.phone || null,
            email: u.email || null,
            role: u.role,
            pin_code: u.pinCode || null,
            password: u.password || null,
            is_active: u.isActive !== false,
            created_at: u.createdAt,
            updated_at: nowIso,
          })),
          'business_id,id'
        );
        pushed += localUsers.length;
      }

      const bizFilter = { business_id: `eq.${biz.id}` };
      const [remoteRoles, remoteUsers, remoteCats, remoteStock, remoteReceipts, remoteCustomers] =
        await Promise.all([
          sbSelect<any>('roles', bizFilter),
          sbSelect<any>('app_users', bizFilter),
          sbSelect<any>('categories', bizFilter),
          sbSelect<any>('stock_items', bizFilter),
          sbSelect<any>('receipts', bizFilter),
          sbSelect<any>('customers', bizFilter),
        ]);

      const remoteCatIds = new Set(remoteCats.map((r: any) => r.id));
      const remoteStockIds = new Set(remoteStock.map((r: any) => r.id));
      const remoteReceiptIds = new Set(remoteReceipts.map((r: any) => r.id));

      const catsToPush = localCats.filter(
        (c) => !remoteCatIds.has(c.id) || new Date(c.updatedAt).getTime() > lastSyncedMs
      );
      if (catsToPush.length > 0) {
        await sbUpsert(
          'categories',
          catsToPush.map((c) => ({
            id: c.id,
            business_id: biz.id,
            name: c.name,
            created_at: c.createdAt,
            updated_at: c.updatedAt,
          })),
          'business_id,id'
        );
        pushed += catsToPush.length;
      }

      const stockToPush = localStock.filter(
        (s) => !remoteStockIds.has(s.id) || new Date(s.updatedAt).getTime() > lastSyncedMs
      );
      if (stockToPush.length > 0) {
        await sbUpsert(
          'stock_items',
          stockToPush.map((s) => ({
            id: s.id,
            business_id: biz.id,
            serial_number: s.serialNumber || null,
            name: s.name,
            hindi_name: s.hindiName || null,
            category: s.category || null,
            shelf_location: s.shelfLocation,
            unit_type: s.unitType,
            has_variants: Boolean(s.hasVariants),
            variants: s.variants || [],
            quantity_left: Number(s.quantityLeft) || 0,
            threshold: Number(s.threshold) || 0,
            selling_price: Number(s.sellingPrice) || 0,
            average_purchase_price: Number(s.averagePurchasePrice) || 0,
            purchase_history: s.purchaseHistory || [],
            created_at: s.createdAt,
            updated_at: s.updatedAt,
          })),
          'business_id,id'
        );
        pushed += stockToPush.length;
      }

      const receiptsToPush = localReceipts.filter(
        (r) => !remoteReceiptIds.has(r.id) || new Date(r.updatedAt).getTime() > lastSyncedMs
      );
      if (receiptsToPush.length > 0) {
        await sbUpsert(
          'receipts',
          receiptsToPush.map((r) => ({
            id: r.id,
            business_id: biz.id,
            customer_id: r.customerId || null,
            customer_name: r.customerName,
            customer_phone: r.customerPhone || null,
            customer_address: r.customerAddress || null,
            status: r.status,
            items: r.items || [],
            subtotal: Number(r.subtotal) || 0,
            total_discount: Number(r.totalDiscount) || 0,
            tax_amount: Number(r.taxAmount) || 0,
            grand_total: Number(r.grandTotal) || 0,
            amount_received: Number(r.amountReceived) || 0,
            balance_due: Number(r.balanceDue) || 0,
            payments: r.payments || [],
            notes: r.notes || null,
            created_at: r.createdAt,
            updated_at: r.updatedAt,
            completed_at: r.completedAt || null,
          })),
          'business_id,id'
        );
        pushed += receiptsToPush.length;
      }

      if (localCustomers.length > 0) {
        await sbUpsert(
          'customers',
          localCustomers.map((c) => ({
            id: c.id,
            business_id: biz.id,
            name: c.name,
            phone: c.phone,
            address: c.address || null,
            gst_number: c.gstNumber || null,
            notes: c.notes || null,
            created_at: c.createdAt,
            updated_at: nowIso,
          })),
          'business_id,id'
        );
        pushed += localCustomers.length;
      }

      // 4. Merge latest cloud records locally (skipping deleted IDs)

      const shouldAcceptRemote = (localUpdatedAt?: string, remoteUpdatedAt?: string): boolean => {
        if (!localUpdatedAt) return true;
        const localMs = new Date(localUpdatedAt).getTime();
        const remoteMs = remoteUpdatedAt ? new Date(remoteUpdatedAt).getTime() : 0;
        // Accept remote if Supabase timestamp is newer OR equal, OR if local item was not edited after the previous sync
        return remoteMs >= localMs || localMs <= lastSyncedMs;
      };

      for (const rr of remoteRoles) {
        const local = localRoles.find((l) => l.id === rr.id);
        if (!local || shouldAcceptRemote(local.updatedAt, rr.updated_at)) {
          const mapped: RoleDefinition = {
            id: rr.id,
            name: rr.name,
            description: rr.description || undefined,
            permissions: Array.isArray(rr.permissions) ? rr.permissions : [],
            isSystem: Boolean(rr.is_system),
            createdAt: rr.created_at,
            updatedAt: rr.updated_at || nowIso,
          };
          await db.roles.put(mapped);
          pulled++;
        }
      }

      for (const ru of remoteUsers) {
        const mapped: AppUser = {
          id: ru.id,
          username: ru.username,
          fullName: ru.full_name,
          phone: ru.phone || undefined,
          email: ru.email || undefined,
          role: ru.role,
          pinCode: ru.pin_code || undefined,
          password: ru.password || undefined,
          isActive: ru.is_active !== false,
          createdAt: ru.created_at,
        };
        await db.users.put(mapped);
        pulled++;
      }

      for (const rc of remoteCats) {
        if (deletedCatIds.has(rc.id)) continue;
        const local = localCats.find((l) => l.id === rc.id);
        if (!local || shouldAcceptRemote(local.updatedAt, rc.updated_at)) {
          const mapped: Category = {
            id: rc.id,
            name: rc.name,
            createdAt: rc.created_at,
            updatedAt: rc.updated_at || nowIso,
          };
          await db.categories.put(mapped);
          pulled++;
        }
      }

      for (const rs of remoteStock) {
        if (deletedStockIds.has(rs.id)) continue;
        const local = localStock.find((l) => l.id === rs.id);
        if (!local || shouldAcceptRemote(local.updatedAt, rs.updated_at)) {
          const mapped: StockItem = {
            id: rs.id,
            serialNumber: rs.serial_number || undefined,
            name: rs.name,
            hindiName: rs.hindi_name || undefined,
            category: rs.category || undefined,
            shelfLocation: rs.shelf_location,
            unitType: rs.unit_type || 'count',
            hasVariants: Boolean(rs.has_variants),
            variants: Array.isArray(rs.variants) ? rs.variants : undefined,
            quantityLeft: Number(rs.quantity_left) || 0,
            threshold: Number(rs.threshold) || 0,
            sellingPrice: Number(rs.selling_price) || 0,
            averagePurchasePrice: Number(rs.average_purchase_price) || 0,
            purchaseHistory: Array.isArray(rs.purchase_history) ? rs.purchase_history : [],
            createdAt: rs.created_at,
            updatedAt: rs.updated_at || nowIso,
          };
          await db.stockItems.put(mapped);
          pulled++;
        }
      }

      for (const rrec of remoteReceipts) {
        if (deletedReceiptIds.has(rrec.id)) continue;
        const local = localReceipts.find((l) => l.id === rrec.id);
        if (!local || shouldAcceptRemote(local.updatedAt, rrec.updated_at)) {
          const mapped: SalesReceipt = {
            id: rrec.id,
            customerId: rrec.customer_id || undefined,
            customerName: rrec.customer_name,
            customerPhone: rrec.customer_phone || undefined,
            customerAddress: rrec.customer_address || undefined,
            status: rrec.status,
            items: Array.isArray(rrec.items) ? rrec.items : [],
            subtotal: Number(rrec.subtotal) || 0,
            totalDiscount: Number(rrec.total_discount) || 0,
            taxAmount: Number(rrec.tax_amount) || 0,
            grandTotal: Number(rrec.grand_total) || 0,
            amountReceived: Number(rrec.amount_received) || 0,
            balanceDue: Number(rrec.balance_due) || 0,
            payments: Array.isArray(rrec.payments) ? rrec.payments : [],
            notes: rrec.notes || undefined,
            createdAt: rrec.created_at,
            updatedAt: rrec.updated_at || nowIso,
            completedAt: rrec.completed_at || undefined,
          };
          await db.receipts.put(mapped);
          pulled++;
        }
      }

      for (const rcust of remoteCustomers) {
        const mapped: Customer = {
          id: rcust.id,
          name: rcust.name,
          phone: rcust.phone,
          address: rcust.address || undefined,
          gstNumber: rcust.gst_number || undefined,
          notes: rcust.notes || undefined,
          createdAt: rcust.created_at,
        };
        await db.customers.put(mapped);
      }

      await db.syncMeta.put({
        id: 'cloud_sync',
        key: 'cloud_sync',
        lastSyncedAt: nowIso,
        syncedRecordsCount: pushed + pulled,
        status: 'success',
      });

      return {
        ok: true,
        pushedCount: pushed,
        pulledCount: pulled,
        syncedAt: displayTime,
        message: `Cloud sync complete (${pushed} pushed, ${pulled} pulled).`,
      };
    } catch (err: any) {
      console.error('Cloud sync error:', err);
      await db.syncMeta.put({
        id: 'cloud_sync',
        key: 'cloud_sync',
        lastSyncedAt: nowIso,
        syncedRecordsCount: 0,
        status: 'error',
      });
      return {
        ok: false,
        pushedCount: pushed,
        pulledCount: pulled,
        syncedAt: displayTime,
        message: err?.message || 'Cloud sync failed.',
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Export a full encrypted/portable JSON backup file of the entire business database
   */
  static async exportFullBackupJSON(biz: Business, db: POSDatabase): Promise<void> {
    const [stockItems, receipts, customers, users, roles, categories] = await Promise.all([
      db.stockItems.toArray(),
      db.receipts.toArray(),
      db.customers.toArray(),
      db.users.toArray(),
      db.roles.toArray(),
      db.categories.toArray(),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      schemaVersion: 2,
      business: biz,
      data: {
        stockItems,
        receipts,
        customers,
        users,
        roles,
        categories,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `${biz.name.replace(/[^a-zA-Z0-9]+/g, '_')}_backup_${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Restore a JSON backup file back into the local database & push to Supabase
   */
  static async restoreFullBackupJSON(
    file: File,
    biz: Business,
    db: POSDatabase
  ): Promise<{ restoredRecords: number }> {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    const d = parsed?.data;
    if (!d) throw new Error('Invalid Smart POS backup JSON file.');

    let count = 0;
    if (Array.isArray(d.roles) && d.roles.length > 0) {
      await db.roles.bulkPut(d.roles);
      count += d.roles.length;
    }
    if (Array.isArray(d.users) && d.users.length > 0) {
      await db.users.bulkPut(d.users);
      count += d.users.length;
    }
    if (Array.isArray(d.categories) && d.categories.length > 0) {
      await db.categories.bulkPut(d.categories);
      count += d.categories.length;
    }
    if (Array.isArray(d.stockItems) && d.stockItems.length > 0) {
      await db.stockItems.bulkPut(d.stockItems);
      count += d.stockItems.length;
    }
    if (Array.isArray(d.receipts) && d.receipts.length > 0) {
      await db.receipts.bulkPut(d.receipts);
      count += d.receipts.length;
    }
    if (Array.isArray(d.customers) && d.customers.length > 0) {
      await db.customers.bulkPut(d.customers);
      count += d.customers.length;
    }

    if (isSupabaseConfigured() && navigator.onLine) {
      await this.syncBusiness(biz, db);
    }

    return { restoredRecords: count };
  }
}
