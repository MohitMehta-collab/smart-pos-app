import { useAppStore } from '../store/useAppStore';
import type { StockItem } from '../types';
import { formatCurrency, formatQuantity } from '../utils/pricing';

const getDb = () => {
  const db = useAppStore.getState().currentDb;
  if (!db) throw new Error('Database not initialized. Please login.');
  return db;
};

export interface BotResponse {
  reply: string;
  success: boolean;
  timestamp: string;
  authorized: boolean;
}

/**
 * Parses English and Hindi WhatsApp messages and executes stock/order queries.
 *
 * Supported Command Patterns (English & Hindi):
 * 1. Full Stock:
 *    - "stock", "all stock", "full stock", "list stock"
 *    - "स्टॉक", "सारा स्टॉक", "पूरा स्टॉक", "स्टॉक लिस्ट"
 *
 * 2. Specific Item Stock:
 *    - "item ITEM-101", "stock shirt", "check rice"
 *    - "सामान ITEM-101", "शर्ट स्टॉक", "चावल कितना है"
 *
 * 3. Customer Order History:
 *    - "orders 9876543210", "history John", "customer 9876543210"
 *    - "ऑर्डर 9876543210", "ग्राहक का बिल", "इतिहास 9876543210"
 *
 * 4. Sync Status:
 *    - "sync status", "last sync", "सिंक स्थिति", "अंतिम सिंक"
 */
export const WhatsAppBotService = {
  /**
   * Process incoming WhatsApp text query with role-based check
   */
  async handleIncomingMessage(
    senderPhone: string,
    messageText: string,
    senderRole: 'admin' | 'manager' | 'cashier' | 'unauthorized' = 'admin'
  ): Promise<BotResponse> {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // 1. Role-based Access Constraint
    if (senderRole !== 'admin' && senderRole !== 'manager') {
      return {
        reply: `🚫 *Access Denied / अनुमति नहीं है*\nYour phone number (${senderPhone}) is not registered with Admin or Manager remote access privileges.\nकृपया व्यवस्थापक (Admin) से संपर्क करें।`,
        success: false,
        timestamp,
        authorized: false,
      };
    }

    const text = messageText.trim().toLowerCase();

    // 2. Help / नमस्ते
    if (
      text === 'help' ||
      text === 'मदद' ||
      text === 'hi' ||
      text === 'hello' ||
      text === 'नमस्ते'
    ) {
      const helpMsg =
        `🤖 *Smart POS WhatsApp Assistant*\n\n` +
        `You can ask me questions in English or हिंदी:\n\n` +
        `📦 *Stock Queries:*\n` +
        `• "full stock" or "पूरा स्टॉक"\n` +
        `• "item <name/id>" or "सामान <नाम/आईडी>"\n\n` +
        `📜 *Customer History:*\n` +
        `• "orders <phone/name>" or "ऑर्डर <फोन/नाम>"\n\n` +
        `🔄 *Sync Status:*\n` +
        `• "sync status" or "सिंक"`;
      return { reply: helpMsg, success: true, timestamp, authorized: !!senderRole };
    }

    // 3. Last Sync Status
    if (
      text.includes('sync') ||
      text.includes('सिंक') ||
      text.includes('last update')
    ) {
      const syncMeta = await getDb().syncMeta.get('cloud_sync');
      const lastSync = syncMeta?.lastSyncedAt
        ? new Date(syncMeta.lastSyncedAt).toLocaleString('en-IN')
        : 'Never';
      return {
        reply:
          `🔄 *POS Cloud Sync Status*\n` +
          `• Last Sync: *${lastSync}*\n` +
          `• State: *${syncMeta?.status || 'idle'}*\n` +
          `• Offline mode: Active in local browser IndexedDB`,
        success: true,
        timestamp,
        authorized: !!senderRole,
      };
    }

    // 4. Full Stock List
    if (
      text === 'stock' ||
      text === 'full stock' ||
      text === 'all stock' ||
      text === 'पूरा स्टॉक' ||
      text === 'सारा स्टॉक' ||
      text === 'स्टॉक'
    ) {
      const items = await getDb().stockItems.toArray();
      if (items.length === 0) {
        return {
          reply: `📦 Inventory is currently empty. / स्टॉक खाली है।`,
          success: true,
          timestamp,
          authorized: !!senderRole,
        };
      }

      let reply = `📦 *Current Stock Summary (${items.length} items)*\n`;
      reply += `_As of ${timestamp}_\n\n`;

      items.forEach((item: StockItem, index: number) => {
        const isLow = item.quantityLeft <= item.threshold;
        const alertIcon = isLow ? '⚠️ [LOW] ' : '✅ ';
        reply += `${index + 1}. ${alertIcon}*${item.name}* (${item.id})\n`;
        reply += `   • Shelf: ${item.shelfLocation}\n`;
        reply += `   • Qty: *${formatQuantity(item.quantityLeft, item.unitType)}*\n`;
        reply += `   • Sell Price: ${formatCurrency(item.sellingPrice)}\n`;
        if (senderRole === 'admin') {
          reply += `   • Avg Cost: ${formatCurrency(item.averagePurchasePrice)}\n`;
        }
        reply += `\n`;
      });

      return { reply, success: true, timestamp, authorized: !!senderRole };
    }

    // 5. Specific Item Stock Query (e.g. "item shirt" or "सामान 101" or "rice")
    const itemMatch =
      text.startsWith('item ') ||
      text.startsWith('सामान ') ||
      text.startsWith('stock ') ||
      text.startsWith('चेक ');

    if (itemMatch || text.includes('कितना') || text.includes('how much')) {
      const cleanTerm = text
        .replace(/^(item|सामान|stock|चेक|कितना|how much)\s*/i, '')
        .trim();

      const items = await getDb().stockItems
        .filter(
          (i: StockItem) =>
            i.id.toLowerCase().includes(cleanTerm) ||
            i.name.toLowerCase().includes(cleanTerm) ||
            !!(
              i.hindiName && i.hindiName.toLowerCase().includes(cleanTerm)
            ) ||
            !!(i.serialNumber && i.serialNumber.toLowerCase().includes(cleanTerm))
        )
        .toArray();

      if (items.length === 0) {
        return {
          reply: `🔍 No item found matching "*${cleanTerm}*".\nकोई सामान नहीं मिला।`,
          success: false,
          timestamp,
          authorized: !!senderRole,
        };
      }

      let reply = `🔍 *Found ${items.length} matching item(s):*\n\n`;
      items.forEach((item: StockItem) => {
        const isLow = item.quantityLeft <= item.threshold;
        reply += `📌 *${item.name}* (${item.id})\n`;
        if (item.hindiName) reply += `   (हिंदी: ${item.hindiName})\n`;
        reply += `   • Shelf: *${item.shelfLocation}*\n`;
        reply += `   • Available: *${formatQuantity(item.quantityLeft, item.unitType)}* ${
          isLow ? '⚠️ *(कम स्टॉक - Low Stock!)*' : ''
        }\n`;
        reply += `   • Selling Price: *${formatCurrency(item.sellingPrice)}*\n`;
        if (senderRole === 'admin') {
          reply += `   • Avg Purchase Cost: *${formatCurrency(item.averagePurchasePrice)}*\n`;
        }

        if (item.hasVariants && item.variants && item.variants.length > 0) {
          reply += `   • Variants Breakdown:\n`;
          item.variants.forEach((v: any) => {
            reply += `     - [${v.color || ''} ${v.size || ''}]: ${v.quantityLeft} left @ ${formatCurrency(v.sellingPrice)}\n`;
          });
        }
        reply += `\n`;
      });

      return { reply, success: true, timestamp, authorized: !!senderRole };
    }

    // 6. Customer Order History (e.g. "orders 9876543210" or "ऑर्डर राहुल")
    const orderMatch =
      text.startsWith('order ') ||
      text.startsWith('orders ') ||
      text.startsWith('ऑर्डर ') ||
      text.startsWith('history ') ||
      text.startsWith('इतिहास ');

    if (orderMatch) {
      const cleanCustomer = text
        .replace(/^(order|orders|ऑर्डर|history|इतिहास|customer)\s*/i, '')
        .trim();

      const allReceipts = await getDb().receipts.toArray();
      const matched = allReceipts
        .filter(
          (r: any) =>
            (r.customerPhone && r.customerPhone.includes(cleanCustomer)) ||
            (r.customerName && r.customerName.toLowerCase().includes(cleanCustomer))
        )
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (matched.length === 0) {
        return {
          reply: `📜 No sales orders found for customer "*${cleanCustomer}*".\nइस ग्राहक का कोई ऑर्डर नहीं मिला।`,
          success: false,
          timestamp,
          authorized: !!senderRole,
        };
      }

      let reply = `📜 *Order History for "${cleanCustomer}" (${matched.length} orders)*\n\n`;
      matched.slice(0, 5).forEach((rec: any, idx: number) => {
        const orderDate = new Date(rec.createdAt).toLocaleDateString('en-IN');
        reply += `${idx + 1}. *Receipt #${rec.id}* [${rec.status.toUpperCase()}]\n`;
        reply += `   • Date: ${orderDate}\n`;
        reply += `   • Customer: ${rec.customerName} (${rec.customerPhone || 'N/A'})\n`;
        reply += `   • Total: *${formatCurrency(rec.grandTotal)}*\n`;
        reply += `   • Paid: ${formatCurrency(rec.amountReceived)} | Due: *${formatCurrency(rec.balanceDue)}*\n`;
        reply += `   • Items (${rec.items.length}): ${rec.items.map((i: any) => i.stockItemName).slice(0, 3).join(', ')}${
          rec.items.length > 3 ? '...' : ''
        }\n\n`;
      });

      return { reply, success: true, timestamp, authorized: !!senderRole };
    }

    // Fallback unrecognized command
    return {
      reply:
        `❓ Command not recognized: "${messageText}"\n\n` +
        `Send *help* or *मदद* to see supported commands like:\n` +
        `• "full stock" / "पूरा स्टॉक"\n` +
        `• "item <name>" / "सामान <नाम>"\n` +
        `• "orders <phone>" / "ऑर्डर <फोन नंबर>"`,
      success: false,
      timestamp,
      authorized: !!senderRole,
    };
  },
};
