import { useAppStore, scheduleCloudSync } from '../store/useAppStore';
import type { SalesReceipt, PaymentEntry, UserRole } from '../types';
import { formatCurrency, formatQuantity } from '../utils/pricing';
import { groupReceiptItemsByDate, formatPaymentMethod } from '../features/history/OrderHistory';

export interface BotResponse {
  reply: string;
  timestamp: string;
  actionPerformed?: boolean;
}

const getDb = () => {
  const db = useAppStore.getState().currentDb;
  if (!db) throw new Error('Database not initialized. Please login.');
  return db;
};

export const WhatsAppBotService = {
  async handleIncomingMessage(
    _sender: string,
    rawMessage: string,
    userRole: UserRole = 'admin'
  ): Promise<BotResponse> {
    const db = getDb();
    const state = useAppStore.getState();
    const currency = state.currency || 'INR';
    const bizName = state.activeBusiness?.name || 'Smart POS';
    const canViewCost = state.canAccess('view_cost_price') || userRole === 'admin';
    const canEditReceipt =
      state.canAccess('edit_receipt') || state.canAccess('create_receipt') || userRole === 'admin';

    const msg = rawMessage.trim();
    const lower = msg.toLowerCase();
    const timestamp = new Date().toLocaleString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    });

    // 1. HELP / मदद
    if (lower === 'help' || lower === 'मदद' || lower === 'menu' || lower === 'commands') {
      return {
        timestamp,
        reply: [
          `🤖 *${bizName} — Assistant Commands*`,
          `────────────────────`,
          `📦 *Inventory & Variants*`,
          `• *"full stock"* — List all items & variant stock`,
          `• *"low"* or *"low stock"* — Restock alert list for suppliers`,
          `• *"stock <query>"* or *"सामान <नाम>"* — Search by name, SKU, variant serial, color/size, or shelf`,
          `• *"shelf <no>"* — View all items/variants kept on a shelf`,
          ``,
          `🧾 *Orders, Dues & Reports*`,
          `• *"dues"* or *"udhaar"* — List all customers with pending balance`,
          `• *"today"* or *"summary"* — Today's sales & collection report`,
          `• *"orders <phone/name/REC#>"* — Customer bill & deposit history`,
          ``,
          `⚡ *Quick Actions*`,
          `• *"pay <REC-ID> <amount> <mode>"* — Record customer payment (e.g. _pay REC-2026-0001 5000 upi_)`,
        ].join('\n'),
      };
    }

    // 2. FULL STOCK
    if (lower === 'full stock' || lower === 'all stock' || lower === 'पूरा स्टॉक') {
      const items = await db.stockItems.toArray();
      if (items.length === 0) {
        return { timestamp, reply: '📦 Inventory is currently empty.' };
      }

      const lines = items.map((it, idx) => {
        const lowBadge = it.quantityLeft <= it.threshold ? ' ⚠️[LOW]' : '';
        const baseLine = [
          `${idx + 1}. *${it.name}* (${it.id})${lowBadge}`,
          `   📍 Shelf: ${it.shelfLocation} | Qty: *${formatQuantity(it.quantityLeft, it.unitType)}* | Price: ${formatCurrency(it.sellingPrice, currency)}${canViewCost ? ` | Avg Cost: ${formatCurrency(it.averagePurchasePrice, currency)}` : ''}`,
        ].join('\n');

        if (it.hasVariants && it.variants && it.variants.length > 0) {
          const vLines = it.variants
            .map(
              (v) =>
                `   ↳ [${v.barcode || v.id}] ${v.color || ''} ${v.size || ''}: *${v.quantityLeft}* left @ ${formatCurrency(v.sellingPrice, currency)} (Shelf: ${v.shelfLocation || it.shelfLocation})`
            )
            .join('\n');
          return `${baseLine}\n${vLines}`;
        }
        return baseLine;
      });

      return {
        timestamp,
        reply: [
          `📦 *${bizName} — Full Stock (${items.length} items)*`,
          `────────────────────`,
          lines.join('\n\n'),
        ].join('\n'),
      };
    }

    // 3. LOW STOCK ALERT / SUPPLIER PO LIST
    if (
      lower === 'low' ||
      lower === 'low stock' ||
      lower === 'restock' ||
      lower === 'कम स्टॉक'
    ) {
      const items = await db.stockItems.toArray();
      const lowBlocks: string[] = [];

      items.forEach((it) => {
        const lowVariants =
          it.hasVariants && it.variants
            ? it.variants.filter((v) => v.quantityLeft <= v.threshold)
            : [];
        const isMainLow = it.quantityLeft <= it.threshold;

        if (!isMainLow && lowVariants.length === 0) return;

        const latestSupplier =
          it.purchaseHistory && it.purchaseHistory.length > 0
            ? it.purchaseHistory[0].supplier || 'General Supplier'
            : 'General Supplier';

        if (it.hasVariants && lowVariants.length > 0) {
          const vDetails = lowVariants
            .map(
              (v) =>
                `   • ${v.color || ''} ${v.size || ''} (Serial: ${v.barcode || 'N/A'}) — *${v.quantityLeft}* left (Alert ≤ ${v.threshold}) | Shelf: ${v.shelfLocation || it.shelfLocation}`
            )
            .join('\n');
          lowBlocks.push(
            `⚠️ *${it.name}* (${it.id}) — Supplier: _${latestSupplier}_\n${vDetails}`
          );
        } else {
          lowBlocks.push(
            `⚠️ *${it.name}* (${it.id}) — *${formatQuantity(it.quantityLeft, it.unitType)}* left (Alert ≤ ${it.threshold})\n   📍 Shelf: ${it.shelfLocation} | Supplier: _${latestSupplier}_`
          );
        }
      });

      if (lowBlocks.length === 0) {
        return {
          timestamp,
          reply: '✅ All items and variants are well-stocked above their alert thresholds!',
        };
      }

      return {
        timestamp,
        reply: [
          `🚨 *${bizName} — Low Stock / Restock Order List (${lowBlocks.length})*`,
          `────────────────────`,
          lowBlocks.join('\n\n'),
        ].join('\n'),
      };
    }

    // 4. PENDING DUES / UDHAAR LIST
    if (
      lower === 'dues' ||
      lower === 'due' ||
      lower === 'udhaar' ||
      lower === 'pending' ||
      lower === 'उधार'
    ) {
      const receipts = await db.receipts.toArray();
      const dueReceipts = receipts
        .filter((r) => r.status !== 'cancelled' && r.balanceDue > 0)
        .sort((a, b) => b.balanceDue - a.balanceDue);

      if (dueReceipts.length === 0) {
        return {
          timestamp,
          reply: '🎉 Zero pending dues! All customer bills are settled.',
        };
      }

      const totalDue = dueReceipts.reduce((s, r) => s + r.balanceDue, 0);
      const lines = dueReceipts.map((r, i) => {
        const dStr = new Date(r.createdAt).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
        });
        return [
          `${i + 1}. *${r.customerName}* ${r.customerPhone ? `(${r.customerPhone})` : ''}`,
          `   🧾 ${r.id} (${dStr}) | Total: ${formatCurrency(r.grandTotal, currency)} | Paid: ${formatCurrency(r.amountReceived, currency)}`,
          `   🔴 *Balance Due: ${formatCurrency(r.balanceDue, currency)}*`,
        ].join('\n');
      });

      return {
        timestamp,
        reply: [
          `🧾 *${bizName} — Pending Customer Dues (${dueReceipts.length})*`,
          `💰 *Total Collectible: ${formatCurrency(totalDue, currency)}*`,
          `────────────────────`,
          lines.join('\n\n'),
        ].join('\n'),
      };
    }

    // 5. TODAY'S SUMMARY / DAILY CLOSING REPORT
    if (
      lower === 'today' ||
      lower === 'summary' ||
      lower === 'daily report' ||
      lower === 'आज का हिसाब'
    ) {
      const receipts = await db.receipts.toArray();
      const todayKey = new Date().toISOString().slice(0, 10);

      const activeReceipts = receipts.filter((r) => r.status !== 'cancelled');
      const createdToday = activeReceipts.filter(
        (r) => (r.createdAt || '').slice(0, 10) === todayKey
      );

      let todaySalesTotal = 0;
      createdToday.forEach((r) => {
        todaySalesTotal += r.grandTotal;
      });

      const methodTotals: Record<string, number> = {};
      let todayCollectedTotal = 0;

      activeReceipts.forEach((r) => {
        (r.payments || []).forEach((p) => {
          if ((p.date || '').slice(0, 10) === todayKey) {
            todayCollectedTotal += p.amount;
            const m = formatPaymentMethod(p.method);
            methodTotals[m] = (methodTotals[m] || 0) + p.amount;
          }
        });
      });

      const modeBreakdown =
        Object.keys(methodTotals).length > 0
          ? Object.entries(methodTotals)
              .map(([m, amt]) => `   • ${m}: *${formatCurrency(amt, currency)}*`)
              .join('\n')
          : '   • _No payments logged today_';

      const overallPendingDue = activeReceipts.reduce((s, r) => s + r.balanceDue, 0);

      return {
        timestamp,
        reply: [
          `📊 *${bizName} — Daily Summary (${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })})*`,
          `────────────────────`,
          `🛍️ *New Orders Today:* ${createdToday.length}`,
          `📈 *Today's Billed Sales:* ${formatCurrency(todaySalesTotal, currency)}`,
          `💵 *Today's Collections:* ${formatCurrency(todayCollectedTotal, currency)}`,
          modeBreakdown,
          `────────────────────`,
          `🔴 *Total Store Balance Due:* ${formatCurrency(overallPendingDue, currency)}`,
        ].join('\n'),
      };
    }

    // 6. QUICK PAYMENT COMMAND: "pay REC-2026-0001 5000 upi [ref]"
    if (lower.startsWith('pay ')) {
      if (!canEditReceipt) {
        return {
          timestamp,
          reply: '⛔ Your role does not have permission to record payments.',
        };
      }

      const parts = msg.split(/\s+/);
      if (parts.length < 3) {
        return {
          timestamp,
          reply:
            '⚠️ Usage: *pay <Receipt-ID> <Amount> [cash|upi|card|bank_transfer|check] [Ref]*\nExample: `pay REC-2026-0001 5000 upi`',
        };
      }

      const recIdInput = parts[1].toUpperCase();
      const amount = parseFloat(parts[2]);
      const rawMethod = (parts[3] || 'cash').toLowerCase();
      const refNote = parts.slice(4).join(' ').trim();

      if (isNaN(amount) || amount <= 0) {
        return { timestamp, reply: '⚠️ Please enter a valid positive payment amount.' };
      }

      const validMethods: PaymentEntry['method'][] = [
        'cash',
        'upi',
        'card',
        'bank_transfer',
        'credit',
        'check',
      ];
      const method: PaymentEntry['method'] = validMethods.includes(rawMethod as any)
        ? (rawMethod as PaymentEntry['method'])
        : 'cash';

      const allReceipts = await db.receipts.toArray();
      const target = allReceipts.find((r) => r.id.toUpperCase() === recIdInput);

      if (!target) {
        return {
          timestamp,
          reply: `❌ Receipt *${recIdInput}* not found.`,
        };
      }

      const now = new Date().toISOString();
      const newPayment: PaymentEntry = {
        id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: now,
        amount,
        method,
        transactionRef: refNote || undefined,
      };

      const updatedPayments = [...(target.payments || []), newPayment];
      const updatedReceived = updatedPayments.reduce((s, p) => s + p.amount, 0);
      const updatedDue = Math.max(0, Number((target.grandTotal - updatedReceived).toFixed(2)));
      const nextStatus: SalesReceipt['status'] =
        updatedDue === 0 && target.status === 'inProgress' ? 'completed' : target.status;

      await db.receipts.update(target.id, {
        payments: updatedPayments,
        amountReceived: updatedReceived,
        balanceDue: updatedDue,
        status: nextStatus,
        updatedAt: now,
        ...(nextStatus === 'completed' && !target.completedAt ? { completedAt: now } : {}),
      });

      scheduleCloudSync();

      return {
        timestamp,
        actionPerformed: true,
        reply: [
          `✅ *Payment Recorded Successfully!*`,
          `────────────────────`,
          `🧾 Receipt: *${target.id}* (${target.customerName})`,
          `💵 Deposited: *${formatCurrency(amount, currency)}* via *${formatPaymentMethod(method)}*`,
          `💰 Total Paid: ${formatCurrency(updatedReceived, currency)} / ${formatCurrency(target.grandTotal, currency)}`,
          `📌 Remaining Due: *${formatCurrency(updatedDue, currency)}* (${nextStatus.toUpperCase()})`,
        ].join('\n'),
      };
    }

    // 7. CUSTOMER ORDERS / RECEIPT LOOKUP: "orders <query>" or "bill <query>"
    if (
      lower.startsWith('orders ') ||
      lower.startsWith('order ') ||
      lower.startsWith('bill ') ||
      lower.startsWith('receipt ')
    ) {
      const q = msg.replace(/^(orders?|bill|receipt)\s+/i, '').trim().toLowerCase();
      const receipts = await db.receipts.toArray();
      const matched = receipts.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          (r.customerPhone && r.customerPhone.toLowerCase().includes(q))
      );

      if (matched.length === 0) {
        return {
          timestamp,
          reply: `🔍 No receipts found matching *"${q}"*.`,
        };
      }

      const blocks = matched.slice(0, 5).map((r) => {
        const grouped = groupReceiptItemsByDate(r.items, r.createdAt);
        const dateLines = grouped
          .map(
            (g) =>
              `   📅 *${g.dateLabel}:* ` +
              g.items.map((it) => `${it.stockItemName} (x${it.quantity})`).join(', ')
          )
          .join('\n');

        const paymentLines =
          r.payments && r.payments.length > 0
            ? r.payments
                .map(
                  (p) =>
                    `   💳 ${new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}: ${formatCurrency(p.amount, currency)} (${formatPaymentMethod(p.method)})`
                )
                .join('\n')
            : '   💳 _No deposits recorded_';

        return [
          `🧾 *${r.id}* — *${r.customerName}* ${r.customerPhone ? `(${r.customerPhone})` : ''}`,
          `   📌 Status: ${r.status.toUpperCase()}`,
          dateLines,
          paymentLines,
          `   💰 Total: *${formatCurrency(r.grandTotal, currency)}* | Paid: ${formatCurrency(r.amountReceived, currency)} | *Due: ${formatCurrency(r.balanceDue, currency)}*`,
        ].join('\n');
      });

      return {
        timestamp,
        reply: [
          `📋 *Matched Receipts (${matched.length})*`,
          `────────────────────`,
          blocks.join('\n\n'),
        ].join('\n'),
      };
    }

    // 8. STOCK / VARIANT / SHELF SEARCH ("stock <q>", "shelf <q>", "सामान <q>", or direct query)
    const cleanQuery = msg
      .replace(/^(stock|item|search|shelf|सामान|स्टॉक)\s+/i, '')
      .trim()
      .toLowerCase();

    const allItems = await db.stockItems.toArray();
    const matchedItems = allItems.filter((item) => {
      const mainMatch =
        item.id.toLowerCase().includes(cleanQuery) ||
        item.name.toLowerCase().includes(cleanQuery) ||
        (item.hindiName && item.hindiName.toLowerCase().includes(cleanQuery)) ||
        (item.serialNumber && item.serialNumber.toLowerCase().includes(cleanQuery)) ||
        item.shelfLocation.toLowerCase().includes(cleanQuery) ||
        (item.category && item.category.toLowerCase().includes(cleanQuery));

      const variantMatch =
        item.hasVariants && item.variants
          ? item.variants.some(
              (v) =>
                v.id.toLowerCase().includes(cleanQuery) ||
                (v.color && v.color.toLowerCase().includes(cleanQuery)) ||
                (v.size && v.size.toLowerCase().includes(cleanQuery)) ||
                (v.barcode && v.barcode.toLowerCase().includes(cleanQuery)) ||
                (v.shelfLocation && v.shelfLocation.toLowerCase().includes(cleanQuery))
            )
          : false;

      return mainMatch || variantMatch;
    });

    if (matchedItems.length > 0) {
      const results = matchedItems.slice(0, 8).map((it) => {
        const head = [
          `📦 *${it.name}* ${it.hindiName ? `(${it.hindiName})` : ''}`,
          `   🆔 SKU: ${it.id} | Serial: ${it.serialNumber || '—'} | 📍 Base Shelf: *${it.shelfLocation}*`,
          `   📊 Total Stock: *${formatQuantity(it.quantityLeft, it.unitType)}* | Base Price: *${formatCurrency(it.sellingPrice, currency)}*${canViewCost ? ` | Avg Cost: ${formatCurrency(it.averagePurchasePrice, currency)}` : ''}`,
        ].join('\n');

        if (it.hasVariants && it.variants && it.variants.length > 0) {
          const vRows = it.variants
            .map((v) => {
              const vLow = v.quantityLeft <= v.threshold ? ' ⚠️[LOW]' : '';
              return [
                `   ↳ *${v.color || ''} ${v.size || ''}* [Serial: ${v.barcode || 'N/A'}]`,
                `      Qty: *${v.quantityLeft}*${vLow} | Price: *${formatCurrency(v.sellingPrice, currency)}*${canViewCost ? ` | Cost: ${formatCurrency(v.purchasePrice, currency)}` : ''} | 📍 Shelf: *${v.shelfLocation || it.shelfLocation}*`,
              ].join('\n');
            })
            .join('\n');
          return `${head}\n${vRows}`;
        }
        return head;
      });

      return {
        timestamp,
        reply: [
          `🔎 *Stock & Variant Matches (${matchedItems.length})*`,
          `────────────────────`,
          results.join('\n\n'),
        ].join('\n'),
      };
    }

    return {
      timestamp,
      reply: [
        `🤔 No stock item, variant serial, or command found for *"${msg}"*.`,
        `Type *"help"* or click one of the quick chips below to view available commands.`,
      ].join('\n'),
    };
  },
};
