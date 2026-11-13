import Dexie, { type Table } from 'dexie';
import type { Business, AppUser } from '../types';

/**
 * CENTRAL REGISTRY DATABASE
 * Stores ONLY the list of registered businesses and their credentials.
 * Each business's actual POS data lives in its own separate IndexedDB database.
 * This guarantees complete data isolation between businesses.
 */
export class BusinessRegistryDB extends Dexie {
  businesses!: Table<Business, string>;
  users!: Table<AppUser, string>;

  constructor() {
    super('SmartPOS_Registry');

    this.version(1).stores({
      businesses: 'id, name, ownerName, phone, businessType, currency, createdAt, isActive',
      users: 'id, username, fullName, role, businessId, createdAt',
    });
  }
}

export const registryDb = new BusinessRegistryDB();

/**
 * Creates a new Dexie database instance for a specific business.
 * Naming convention: SmartPOS_Biz_<businessId>
 */
export function getBusinessDatabase(businessId: string) {
  const safeId = businessId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return new Dexie(`SmartPOS_Biz_${safeId}`);
}