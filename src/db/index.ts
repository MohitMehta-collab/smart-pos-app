import Dexie, { type Table } from 'dexie';
import type {
  StockItem,
  SalesReceipt,
  Customer,
  AppUser,
  SyncMetadata,
  Category,
  RoleDefinition,
  PermissionKey,
} from '../types';

export const ALL_PERMISSIONS: PermissionKey[] = [
  'view_dashboard',
  'create_receipt',
  'edit_receipt',
  'delete_receipt',
  'view_history',
  'view_stock',
  'edit_stock',
  'view_cost_price',
  'remote_whatsapp',
  'manage_roles',
];

export const DEFAULT_ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: 'admin',
    name: 'Administrator',
    description: 'Full unrestricted access to all POS modules, cost prices, and staff roles',
    permissions: [...ALL_PERMISSIONS],
    isSystem: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'manager',
    name: 'Store Manager',
    description: 'Can manage stock, view cost prices, handle receipts, and view reports',
    permissions: [
      'view_dashboard',
      'create_receipt',
      'edit_receipt',
      'view_history',
      'view_stock',
      'edit_stock',
      'view_cost_price',
      'remote_whatsapp',
    ],
    isSystem: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cashier',
    name: 'Cashier',
    description: 'Front-desk billing and stock availability lookup (cost prices hidden)',
    permissions: [
      'view_dashboard',
      'create_receipt',
      'edit_receipt',
      'view_history',
      'view_stock',
    ],
    isSystem: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * POS DATABASE (Business-Scoped)
 *
 * Each business gets its own completely isolated IndexedDB database.
 * Naming convention: SmartPOS_Biz_<businessId>
 *
 * This guarantees stock, receipts, roles, and customer data NEVER mix between businesses.
 */
export class POSDatabase extends Dexie {
  stockItems!: Table<StockItem, string>;
  receipts!: Table<SalesReceipt, string>;
  customers!: Table<Customer, string>;
  users!: Table<AppUser, string>;
  roles!: Table<RoleDefinition, string>;
  syncMeta!: Table<SyncMetadata, string>;
  categories!: Table<Category, string>;

  constructor(businessId: string = 'default') {
    const safeId = businessId.replace(/[^a-zA-Z0-9_-]/g, '_');
    super(`SmartPOS_Biz_${safeId}`);

    // Schema version 1
    this.version(1).stores({
      stockItems: 'id, serialNumber, name, shelfLocation, category, quantityLeft, threshold, updatedAt',
      receipts: 'id, status, customerName, customerPhone, createdAt, updatedAt, grandTotal',
      customers: 'id, name, phone, createdAt',
      users: 'id, username, role',
      syncMeta: 'id, key',
      categories: 'id, name, createdAt',
    });

    // Schema version 2: Add custom roles table for granular RBAC
    this.version(2)
      .stores({
        stockItems: 'id, serialNumber, name, shelfLocation, category, quantityLeft, threshold, updatedAt',
        receipts: 'id, status, customerName, customerPhone, createdAt, updatedAt, grandTotal',
        customers: 'id, name, phone, createdAt',
        users: 'id, username, role',
        roles: 'id, name, createdAt',
        syncMeta: 'id, key',
        categories: 'id, name, createdAt',
      })
      .upgrade(async (tx) => {
        const rolesTable = tx.table('roles');
        const existingCount = await rolesTable.count();
        if (existingCount === 0) {
          await rolesTable.bulkAdd(DEFAULT_ROLE_DEFINITIONS);
        }
      });
  }
}

/**
 * Factory: create or retrieve the database for a specific business.
 */
export function getPOSDatabase(businessId: string): POSDatabase {
  return new POSDatabase(businessId);
}

/**
 * Seed default roles, users, and sample stock for a business if its database is empty.
 */
export async function seedBusinessDataIfNeeded(businessDb: POSDatabase) {
  const roleCount = await businessDb.roles.count();
  if (roleCount === 0) {
    await businessDb.roles.bulkAdd(DEFAULT_ROLE_DEFINITIONS);
  }

  const userCount = await businessDb.users.count();
  if (userCount === 0) {
    await businessDb.users.bulkAdd([
      {
        id: 'usr-admin',
        username: 'admin',
        fullName: 'System Administrator',
        role: 'admin',
        pinCode: '1234',
        password: 'admin123',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'usr-manager',
        username: 'manager',
        fullName: 'Store Manager',
        role: 'manager',
        pinCode: '2222',
        password: 'manager123',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'usr-cashier',
        username: 'cashier',
        fullName: 'Primary Cashier',
        role: 'cashier',
        pinCode: '0000',
        password: 'cashier123',
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  const stockCount = await businessDb.stockItems.count();
  if (stockCount === 0) {
    const now = new Date().toISOString();
    await businessDb.stockItems.bulkAdd([
      {
        id: 'ITEM-101',
        serialNumber: 'SN-00101',
        name: 'Cotton Casual Shirt',
        hindiName: 'सूती शर्ट (कॉटन)',
        category: 'cat-clothing',
        shelfLocation: 'A-12',
        unitType: 'count',
        hasVariants: true,
        quantityLeft: 18,
        threshold: 10,
        sellingPrice: 799,
        averagePurchasePrice: 420,
        purchaseHistory: [
          {
            id: 'ph-1',
            date: new Date(Date.now() - 86400000 * 10).toISOString(),
            quantity: 10,
            purchasePrice: 400,
            supplier: 'ABC Garments',
          },
          {
            id: 'ph-2',
            date: new Date(Date.now() - 86400000 * 2).toISOString(),
            quantity: 10,
            purchasePrice: 440,
            supplier: 'Surat Textiles',
          },
        ],
        variants: [
          {
            id: 'var-1',
            color: 'Blue',
            size: 'M',
            quantityLeft: 8,
            sellingPrice: 799,
            purchasePrice: 420,
            threshold: 5,
          },
          {
            id: 'var-2',
            color: 'Blue',
            size: 'L',
            quantityLeft: 4,
            sellingPrice: 799,
            purchasePrice: 420,
            threshold: 5,
          },
          {
            id: 'var-3',
            color: 'White',
            size: 'M',
            quantityLeft: 6,
            sellingPrice: 849,
            purchasePrice: 420,
            threshold: 4,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ITEM-102',
        serialNumber: 'SN-00102',
        name: 'Basmati Rice Premium',
        hindiName: 'बासमती चावल प्रीमियम',
        category: 'cat-grocery',
        shelfLocation: 'G-04',
        unitType: 'weight',
        hasVariants: false,
        quantityLeft: 4.5,
        threshold: 15,
        sellingPrice: 120,
        averagePurchasePrice: 85,
        purchaseHistory: [
          {
            id: 'ph-3',
            date: new Date(Date.now() - 86400000 * 15).toISOString(),
            quantity: 50,
            purchasePrice: 85,
            supplier: 'Kisan Agro Foods',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ITEM-103',
        serialNumber: 'SN-00103',
        name: 'Organic Honey 500g',
        hindiName: 'जैविक शहद ५०० ग्राम',
        category: 'cat-grocery',
        shelfLocation: 'D-02',
        unitType: 'both',
        hasVariants: false,
        quantityLeft: 2,
        threshold: 5,
        sellingPrice: 350,
        averagePurchasePrice: 210,
        purchaseHistory: [
          {
            id: 'ph-4',
            date: new Date(Date.now() - 86400000 * 7).toISOString(),
            quantity: 10,
            purchasePrice: 210,
            supplier: 'Himalayan Nectar',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }

  const syncRow = await businessDb.syncMeta.get('cloud_sync');
  if (!syncRow) {
    await businessDb.syncMeta.put({
      id: 'cloud_sync',
      key: 'cloud_sync',
      lastSyncedAt: new Date().toISOString(),
      syncedRecordsCount: 0,
      status: 'idle',
    });
  }

  const categoryCount = await businessDb.categories.count();
  if (categoryCount === 0) {
    const now = new Date().toISOString();
    await businessDb.categories.bulkAdd([
      { id: 'cat-clothing', name: 'Clothing', createdAt: now, updatedAt: now },
      { id: 'cat-grocery', name: 'Grocery', createdAt: now, updatedAt: now },
      { id: 'cat-electronics', name: 'Electronics', createdAt: now, updatedAt: now },
      { id: 'cat-hardware', name: 'Hardware', createdAt: now, updatedAt: now },
      { id: 'cat-pharmacy', name: 'Pharmacy', createdAt: now, updatedAt: now },
      { id: 'cat-other', name: 'Other', createdAt: now, updatedAt: now },
    ]);
  }
}
