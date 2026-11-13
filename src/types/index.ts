// Core TypeScript Definitions for POS & Inventory

export type UnitType = 'count' | 'weight' | 'both';

export interface PurchaseHistoryEntry {
  id: string;
  date: string; // ISO date string
  quantity: number;
  purchasePrice: number; // Price per unit for this batch
  supplier?: string;
  notes?: string;
}

export interface ItemVariant {
  id: string;
  color?: string;
  size?: string;
  weightGrams?: number;
  barcode?: string;
  quantityLeft: number;
  sellingPrice: number;
  purchasePrice: number; // Individual cost price for this variant
  threshold: number;     // Individual low stock threshold for this variant
  shelfLocation?: string; // Individual shelf number for this variant
}

export interface StockItem {
  id: string; // SKU or user ID
  serialNumber?: string;
  name: string;
  hindiName?: string;
  category?: string;
  shelfLocation: string; // Base shelf location
  unitType: UnitType; // count, weight, both

  // Aggregate stock if no variants, or base properties
  hasVariants: boolean;
  variants?: ItemVariant[];

  // For non-variant items:
  quantityLeft: number;
  threshold: number;
  sellingPrice: number;
  averagePurchasePrice: number;

  // Purchase history audit log for weighted average calculations
  purchaseHistory: PurchaseHistoryEntry[];

  // Metadata
  createdAt: string;
  updatedAt: string;
}

export type ReceiptStatus = 'inProgress' | 'completed' | 'paused' | 'cancelled';

export interface ReceiptItem {
  id: string; // line item unique id
  stockItemId: string;
  stockItemName: string;
  variantId?: string;
  variantDescription?: string; // e.g. "Red / XL" or "500g"
  color?: string;
  size?: string;
  weight?: number; // in kg or grams
  quantity: number; // count or weight amount
  unitPrice: number;
  discountAmount: number; // Line item discount in INR
  discountPercentage?: number;
  totalPrice: number; // (quantity * unitPrice) - discount
  isReturn: boolean; // If true, adds back to inventory & deducts from total bill
  returnReason?: string;
  addedAt: string; // date when this item was added to the receipt
}

export interface PaymentEntry {
  id: string;
  date: string;
  amount: number;
  method: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'credit' | 'check';
  transactionRef?: string;
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  gstNumber?: string;
  createdAt: string;
  notes?: string;
}

export interface SalesReceipt {
  id: string; // receipt # e.g. REC-2026-0001
  customer?: Customer;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;

  status: ReceiptStatus;
  items: ReceiptItem[];

  // Financials
  subtotal: number;
  totalDiscount: number; // Global overall discount
  taxAmount: number;
  grandTotal: number;
  amountReceived: number;
  balanceDue: number;

  payments: PaymentEntry[];

  // Audit dates
  createdAt: string; // Start date of receipt
  updatedAt: string;
  completedAt?: string;

  // Notes
  notes?: string;
}

export type PermissionKey =
  | 'view_dashboard'
  | 'create_receipt'
  | 'edit_receipt'
  | 'delete_receipt'
  | 'view_history'
  | 'view_stock'
  | 'edit_stock'
  | 'view_cost_price'
  | 'remote_whatsapp'
  | 'manage_roles';

export interface RoleDefinition {
  id: string; // e.g., 'admin', 'manager', 'cashier', or custom 'role-...'
  name: string; // Display name e.g., 'Billing Counter'
  description?: string;
  permissions: PermissionKey[];
  isSystem?: boolean; // true for 'admin' so it cannot be deleted
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'admin' | 'manager' | 'cashier' | string;

export interface Category {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppUser {
  id: string;
  username: string;
  fullName: string;
  phone?: string; // Mobile number for staff/admin
  email?: string; // Email address for admin recovery / notifications
  role: UserRole;
  pinCode?: string; // 4-6 digit fast pin
  password?: string; // login password
  isActive?: boolean;
  createdAt: string;
}

export interface Business {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
  email?: string;
  businessType: 'retail' | 'grocery' | 'pharmacy' | 'restaurant' | 'other';
  currency: string; // primary currency, default INR
  address?: string;
  createdAt: string;
  isActive: boolean;
}

export interface LoginSession {
  id: string;
  businessId: string;
  username: string;
  lastLoginAt: string;
}

export interface SyncMetadata {
  id: string;
  key: string;
  lastSyncedAt: string;
  syncedRecordsCount: number;
  status: 'idle' | 'syncing' | 'error' | 'success';
}