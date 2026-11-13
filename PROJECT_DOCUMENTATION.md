# Smart POS & Inventory System - Project Documentation

## Project Overview
**Path:** `/Users/mohitmehta/Downloads/POS/pos-app/`
**Description:** Smart POS offline-first web app with inventory management, sales receipts, dashboard, order history, WhatsApp integration, and role-based access control.

## Tech Stack
- **Framework:** Vite + React 19 + TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** Dexie.js (IndexedDB wrapper) - per-business isolated databases
- **State Management:** Zustand (with persistence)
- **Internationalization:** i18next (English + Hindi)
- **Icons:** lucide-react
- **Build:** Vite with PWA support (Workbox)
- **Linting:** oxlint

## Project Structure
```
pos-app/
├── src/
│   ├── main.tsx                 # App entry point
│   ├── App.tsx                  # Main app with tab routing
│   ├── App.css                  # Global styles
│   ├── index.css                # Tailwind imports
│   ├── components/
│   │   └── Navbar.tsx           # Top navigation with tabs, language toggle, sync status
│   ├── features/
│   │   ├── auth/
│   │   │   └── Login.tsx        # Business selection + user login
│   │   ├── dashboard/
│   │   │   └── SalesDashboard.tsx  # Active in-progress/paused receipts with KPIs
│   │   ├── history/
│   │   │   └── OrderHistory.tsx    # Complete sales history with search, filters, share
│   │   ├── receipt/
│   │   │   └── CreateReceipt.tsx   # Main receipt creation/editing (MAJOR FILE ~1650 lines)
│   │   ├── roles/
│   │   │   └── RolesManagement.tsx # User/role management
│   │   ├── stock/
│   │   │   └── StockManagement.tsx # Inventory management with categories
│   │   └── whatsapp/
│   │       └── WhatsAppAssistant.tsx # WhatsApp bot simulator
│   ├── services/
│   │   ├── receiptService.ts    # Receipt CRUD + stock adjustment on save
│   │   ├── stockService.ts      # Stock CRUD, restock, category management
│   │   └── whatsappBotService.ts # WhatsApp command parsing
│   ├── store/
│   │   └── useAppStore.ts       # Zustand store: auth, business, DB, permissions
│   ├── db/
│   │   ├── index.ts             # Dexie POSDatabase + seed data
│   │   └── businessRegistry.ts  # Business registry DB
│   ├── types/
│   │   └── index.ts             # All TypeScript interfaces
│   ├── utils/
│   │   └── pricing.ts           # Currency/quantity formatting, weighted avg calc
│   └── i18n/
│       └── index.ts             # i18next config (EN + HI)
├── public/                      # Static assets
├── dist/                        # Build output
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── .oxlintrc.json
```

## Key Features Implemented

### 1. Sales Receipt Management (`CreateReceipt.tsx` ~1650 lines)
**Major recent changes (CRITICAL FIXES):**

| Feature | Implementation |
|---------|----------------|
| **Stock deduction ONLY on save (auto-save or manual)** | Removed `StockService.adjustStockForReceipt` from `handleAddLineItem`, `handleRemoveLine`, `handleEditLine`. Stock now deducted/restored ONLY in `performAutoSave` and `handleStatusChange` → uses smart diff: restores previous synced snapshot, then deducts current lineItems. |
| **Auto-save with debounce** | 600ms debounce triggers when customer name + at least 1 item present. Auto-saves as draft, prevents "completed" status if balance due > 0. |
| **Smart stock adjustment on save** | `performAutoSave` tracks `lastStockSyncedItemsRef` - only adjusts stock when lineItems actually changed. For edits: restores previous snapshot, then deducts new items. |
| **Double-deduction prevention** | `ReceiptService.saveReceipt(receiptToSave, false)` with `deductInventory=false` since stock handled manually in `performAutoSave`. |
| **Return/Refund restrictions** | Returns only allowed for items present in receipt as regular sales. Max refundable = regular qty - already refunded. Validated in `handleToggleReturn` and `handleAddLineItem`. |
| **Auto-fill selling price** | When selecting item/variant, `lineUnitPrice` auto-fills with item's `sellingPrice`. |
| **Customer required to save** | Auto-save requires customer name. Manual save validates `custName`. |
| **Complete payment required for "Completed" status** | Cannot mark `completed` if `balanceDue > 0` (guarded in `handleStatusChange` and auto-save). |
| **Duplicate customer section removed** | Single customer info section at top of left column. |
| **"Save Customer Details" button removed** | Customer data saved with auto-save / "Done" button only. |
| **Low stock display** | Item selection panel always shows remaining qty. Line items table shows `⚠ Low Stock` badge only (no remaining qty in table per requirement). |
| **Share receipt** | Share button in header → modal with "Share All" / "Share by Date Range", copy to clipboard, WhatsApp share. |
| **Return/Refund restrictions** | Returns only allowed for items present in receipt as regular sales. Max refundable = regular qty - already refunded. |
| **Category-wise grouped display (sectioned view)** | Items grouped by category in collapsible sections with totals. |

### 2. Stock Management (`StockManagement.tsx` ~1100 lines)
| Feature | Implementation |
|---------|----------------|
| **Category support** | New `Category` type, Dexie `categories` table, seeded defaults (Clothing, Grocery, Electronics, Hardware, Pharmacy, Other). |
| **Category-wise display** | Items grouped by category in collapsible sections with totals (below main table). |
| **Add Category modal** | Dedicated modal with validation, saves to `categories` table. |
| **Category select in Add/Edit Item** | Dropdown populated from categories table (required field for new items). |
| **Edit Item** | Edit button per row → opens modal pre-filled with item data, calls `StockService.updateItem()`. |
| **Cost price password protection** | Column hidden by default; "Show Cost Prices" button → password modal (user password/PIN/admin123). Shows `••••••` when locked. |
| **Category filter** | Dropdown filter by category (All + dynamic categories from `categories` table). |
| **Cost price column** | Only renders when `canViewCostPrice && costUnlocked` (both role AND password). |

### 3. Order History (`OrderHistory.tsx` ~800 lines)
| Feature | Implementation |
|---------|----------------|
| **Date range filter** | From/To date pickers for partial history view. |
| **Share history** | "Share All" / "Share Selected Range" → preview modal → copy/clipboard + WhatsApp. |
| **ReceiptService.getReceiptsByDateRange()** | New service method for date-range queries. |

### 4. Database Schema (Dexie)
```typescript
// POSDatabase (per business: SmartPOS_Biz_<id>)
stockItems: 'id, serialNumber, name, shelfLocation, category, quantityLeft, threshold, updatedAt'
receipts: 'id, status, customerName, customerPhone, createdAt, updatedAt, grandTotal'
customers: 'id, name, phone, createdAt'
users: 'id, username, role'
syncMeta: 'id, key'
categories: 'id, name, createdAt'

// BusinessRegistryDB (SmartPOS_Registry)
businesses, users
```

### 5. Types (`src/types/index.ts`)
```typescript
interface StockItem {
  id, serialNumber?, name, hindiName?, category?, shelfLocation, unitType
  hasVariants, variants?, quantityLeft, threshold, sellingPrice
  averagePurchasePrice, purchaseHistory[], createdAt, updatedAt
}

interface Category { id, name, createdAt, updatedAt }

interface SalesReceipt {
  id, customer?, customerId?, customerName, customerPhone?, customerAddress?
  status: 'inProgress'|'completed'|'paused'|'cancelled'
  items: ReceiptItem[], subtotal, totalDiscount, taxAmount, grandTotal
  amountReceived, balanceDue, payments: PaymentEntry[]
  createdAt, updatedAt, completedAt?, notes?
}
```

### 6. Services
- **ReceiptService**: `generateReceiptId()`, `saveReceipt(receipt, deductInventory)`, `getAllReceipts()`, `getActiveDashboardReceipts()`, `getReceiptsByDateRange(from, to)`, `getCustomerOrders()`.
- **StockService**: `getAllItems()`, `searchItems()`, `getItemById()`, `createItem()`, `updateItem()`, `addRestockBatch()`, `adjustStockForReceipt()`, `deleteItem()`, `getAllCategories()`, `addCategory()`.
- **WhatsAppBotService**: Command parsing for stock queries, order history, sync.

### 7. State Management (Zustand - `useAppStore.ts`)
- `activeBusiness`, `currentUser`, `currentDb` (Dexie instance per business)
- `currency`, `isOnline`, `lastSyncTime`
- RBAC: `canAccess('edit_stock'|'delete_receipt'|'remote_whatsapp'|'view_cost_price')`
- Session persistence via localStorage (`smartpos_session_biz_id`, `smartpos_session_user_id`)

## Recent Critical Fixes (CreateReceipt.tsx)

### 1. Stock Deduction Moved to Save Time (Auto-save) 
**Before:** Stock deducted immediately on "Add to Receipt"
**After:** Stock only adjusted in `performAutoSave` (auto-save) with smart diff:
```typescript
// In performAutoSave:
const itemsChanged = JSON.stringify(lineItems) !== JSON.stringify(lastStockSyncedItemsRef.current);

if (itemsChanged) {
  if (lastStockSyncedItemsRef.current.length > 0) {
    // Restore previously synced stock
    await StockService.adjustStockForReceipt(
      lastStockSyncedItemsRef.current.map((it) => ({ ...it, isReturn: !it.isReturn }))
    );
  }
  // Deduct current line items
  await StockService.adjustStockForReceipt(lineItems);
  lastStockSyncedItemsRef.current = lineItems;

  // Refresh local stock counts so UI reflects updated availability
  const refreshedItems = await StockService.getAllItems();
  setItems(refreshedItems);
}
```

**Removed from:**
- `handleAddLineItem` (was line 404)
- `handleRemoveLine` (was line 418)
- `handleEditLine` (was line 320)

### 2. Auto-save with Debounce (Lines ~494-630)
- 600ms debounce when customer name + at least 1 item present
- Prevents "completed" status if balance due > 0
- Generates real receipt ID once for new drafts
- Tracks `lastStockSyncedItemsRef` to only adjust stock on actual changes
- Status indicator in header: "Saving...", "✓ Auto-saved", "⚠ Auto-save failed", or "Draft"

### 3. Return/Refund Logic (Lines ~203-233, 444-463)
```typescript
const regularQtyInReceipt = useMemo(() => 
  lineItems.filter(it => !it.isReturn && it.stockItemId === selectedStockItem.id ...).reduce(sum, 0)
, [selectedStockItem, selectedVariant, lineItems]);

const returnedQtyInReceipt = useMemo(() => ...); // excludes editingLineId
const maxReturnAllowed = useMemo(() => Math.max(0, regularQtyInReceipt - returnedQtyInReceipt), [...]);
```
- Returns only for items with regular sales in receipt
- Max refundable = regularQtyInReceipt - returnedQtyInReceipt
- Validation in `handleToggleReturn` and `handleAddLineItem`

### 4. Customer Validation (Lines ~498-500)
```typescript
const finalCustomerName = custName.trim() || receipt.customerName || '';
if (!finalCustomerName) return; // Auto-save won't trigger
```

### 5. Complete Status Guard (Lines ~503-508, 629-637)
```typescript
const effectiveStatus: SalesReceipt['status'] =
  receiptStatus === 'completed' && balanceDue > 0 ? 'inProgress' : receiptStatus;

// In handleStatusChange:
if (nextStatus === 'completed' && balanceDue > 0) {
  alert(`Cannot mark order as completed until payment is cleared. Amount due: ${formatCurrency(balanceDue, currency)}`);
  return;
}
```

### 6. Duplicate Customer Section Removed
- Single customer info section at top of left column (lines ~864-913)
- No standalone "Save Customer Details" button
- Customer data saved with auto-save / "Done" button

### 7. Low Stock Display
- Item selection panel: always shows remaining qty (`Avail: X pcs` / `⚠ Low Stock (Remaining: X pcs)`)
- Line items table: `⚠ Low Stock` badge only (no remaining qty in table per requirement)

### 8. Share Receipt (Lines ~640-737)
- Share button in header → modal with "Share All" / "Share by Date Range"
- From/To date pickers, preview, copy-to-clipboard, WhatsApp share
- Uses `ReceiptService.getAllReceipts()` and `getReceiptsByDateRange(from, to)`

## Build Commands
```bash
cd /Users/mohitmehta/Downloads/POS/pos-app
npm run dev       # Development server
npm run build     # TypeScript + Vite build (outputs to dist/)
npx tsc -b        # Type-check only
npx oxlint        # Lint
```

## Known Issues / Gotchas
1. **Brace matching:** Total opens/closes must match (watch for duplicate `}` after component at line ~1540).
2. **Import cleanup:** Duplicate imports can cause TS1003/TS1005 errors.
3. **Brace matching:** Total opens/closes must match (391/390 diff = error).
4. **Auto-save state refs:** Uses `useRef` for `isHydratedRef`, `persistedReceiptIdRef`, `lastStockSyncedItemsRef`, `isSavingRef` to avoid stale closures in debounced callbacks.

## Testing Checklist
- [ ] Create new receipt → add items → auto-save → stock deducted
- [ ] Add items, DON'T save → stock NOT deducted (wait 600ms after adding)
- [ ] Edit saved receipt → modify items → auto-save → stock adjusted correctly (restore old + deduct new)
- [ ] Return/refund validation works (max refundable = regular - already returned)
- [ ] Customer required for auto-save
- [ ] Completed status requires full payment (blocked if balance > 0)
- [ ] Share receipt (full + date range) works
- [ ] Category add/edit/filter works in Stock Management
- [ ] Cost price password protection works (Show Cost Prices → password → unlock)

## File Ownership
- **CreateReceipt.tsx** - Main receipt logic (most complex, ~1650 lines)
- **StockManagement.tsx** - Inventory + categories (~1100 lines)
- **OrderHistory.tsx** - History + sharing (~800 lines)
- **StockService.ts** - Stock operations (~200 lines)
- **ReceiptService.ts** - Receipt operations (~150 lines)
- **useAppStore.ts** - Global state (~250 lines)
- **types/index.ts** - All interfaces (~100 lines)