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
 * Seed default roles and users for a business if its database is empty.
 * Never seeds dummy stock items or default categories so user deletions persist cleanly.
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
}
