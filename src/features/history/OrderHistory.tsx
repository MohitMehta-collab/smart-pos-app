import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SalesReceipt, ReceiptItem, PaymentEntry } from '../../types';
import { formatCurrency } from '../../utils/pricing';
import { useAppStore, scheduleCloudSync } from '../../store/useAppStore';
import {
  Search,
  Calendar,
  Share2,
  Printer,
  Edit3,
  Trash2,
  Eye,
  X,
  FileText,
  CheckCircle2,
  Clock,
  PauseCircle,
  XCircle,
  CreditCard,
} from 'lucide-react';

interface OrderHistoryProps {
  onViewReceipt?: (id: string) => void;
}

export interface GroupedReceiptItems {
  dateLabel: string;
  isoDateKey: string;
  items: ReceiptItem[];
  daySubtotal: number;
}

const PAYMENT_METHOD_LABELS: Record<PaymentEntry['method'], string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  credit: 'Credit',
  check: 'Cheque',
};

export function formatPaymentMethod(method: PaymentEntry['method']): string {
  return PAYMENT_METHOD_LABELS[method] || String(method).toUpperCase();
}

export function groupReceiptItemsByDate(
  items: ReceiptItem[],
  fallbackDate?: string
): GroupedReceiptItems[] {
  const groupsMap = new Map<string, ReceiptItem[]>();

  items.forEach((item) => {
    const rawDate = item.addedAt || fallbackDate || new Date().toISOString();
    const parsed = new Date(rawDate);
    const validDate = isNaN(parsed.getTime()) ? new Date() : parsed;

    const year = validDate.getFullYear();
    const month = String(validDate.getMonth() + 1).padStart(2, '0');
    const day = String(validDate.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    if (!groupsMap.has(dateKey)) {
      groupsMap.set(dateKey, []);
    }
    groupsMap.get(dateKey)!.push(item);
  });

  return Array.from(groupsMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([isoDateKey, groupItems]) => {
      const displayDate = new Date(`${isoDateKey}T00:00:00`).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      const daySubtotal = groupItems.reduce(
        (sum, i) => sum + (i.isReturn ? -Math.abs(i.totalPrice) : i.totalPrice),
        0
      );

      return {
        dateLabel: displayDate,
        isoDateKey,
        items: groupItems,
        daySubtotal,
      };
    });
}

export function formatReceiptShareText(
  receipt: SalesReceipt,
  businessName: string,
  currency = 'INR'
): string {
  const grouped = groupReceiptItemsByDate(receipt.items, receipt.createdAt);

  const lines: string[] = [
    `*${businessName}*`,
    `Receipt: *${receipt.id}*`,
    `Customer: ${receipt.customerName}${receipt.customerPhone ? ` (${receipt.customerPhone})` : ''}`,
    `Created: ${new Date(receipt.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })}`,
    `--------------------------------`,
  ];

  grouped.forEach((group) => {
    lines.push(`\n📅 *Date Added: ${group.dateLabel}*`);
    group.items.forEach((item, idx) => {
      const variantTag =
        item.variantDescription ||
        [item.color, item.size].filter(Boolean).join(' / ');
      const nameWithVariant = variantTag
        ? `${item.stockItemName} (${variantTag})`
        : item.stockItemName;
      const returnBadge = item.isReturn ? ' [RETURN]' : '';
      const sign = item.isReturn ? '-' : '';

      lines.push(
        `${idx + 1}. ${nameWithVariant}${returnBadge}\n   ${item.quantity} x ${formatCurrency(
          item.unitPrice,
          currency
        )}${
          item.discountAmount > 0
            ? ` (-${formatCurrency(item.discountAmount, currency)} disc)`
            : ''
        } = *${sign}${formatCurrency(Math.abs(item.totalPrice), currency)}*`
      );
    });
    if (grouped.length > 1) {
      lines.push(
        `   _Subtotal (${group.dateLabel}): ${formatCurrency(group.daySubtotal, currency)}_`
      );
    }
  });

  lines.push(
    `\n--------------------------------`,
    `Subtotal: ${formatCurrency(receipt.subtotal, currency)}`
  );

  if (receipt.totalDiscount > 0) {
    lines.push(`Discount: -${formatCurrency(receipt.totalDiscount, currency)}`);
  }
  if (receipt.taxAmount > 0) {
    lines.push(`Tax: +${formatCurrency(receipt.taxAmount, currency)}`);
  }

  lines.push(`*Grand Total: ${formatCurrency(receipt.grandTotal, currency)}*`);

  // Payment / Deposit History Breakdown (Date, Amount, Mode)
  if (receipt.payments && receipt.payments.length > 0) {
    lines.push(`\n💳 *Payment / Deposit History:*`);
    const sortedPayments = [...receipt.payments].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    sortedPayments.forEach((p, idx) => {
      const pDate = new Date(p.date);
      const formattedDate = isNaN(pDate.getTime())
        ? p.date
        : pDate.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });
      const modeLabel = formatPaymentMethod(p.method);
      const refText = p.transactionRef ? ` [Ref: ${p.transactionRef}]` : '';
      const noteText = p.notes ? ` (${p.notes})` : '';
      lines.push(
        `${idx + 1}. ${formattedDate}: *${formatCurrency(p.amount, currency)}* via *${modeLabel}*${refText}${noteText}`
      );
    });
  }

  lines.push(
    `\nTotal Received: ${formatCurrency(receipt.amountReceived, currency)}`,
    `*Balance Due: ${formatCurrency(receipt.balanceDue, currency)}*`
  );

  return lines.join('\n');
}

export const OrderHistory: React.FC<OrderHistoryProps> = ({ onViewReceipt }) => {
  const { t } = useTranslation();
  const { currentDb, activeBusiness, currency, canAccess } = useAppStore();
  const [receipts, setReceipts] = useState<SalesReceipt[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedReceipt, setSelectedReceipt] = useState<SalesReceipt | null>(null);

  const canEditReceipt = canAccess('edit_receipt') || canAccess('create_receipt');
  const canDeleteReceipt = canAccess('delete_receipt');

  const loadReceipts = async () => {
    if (!currentDb) return;
    try {
      const all = await currentDb.receipts.toArray();
      const sorted = all.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setReceipts(sorted);
    } catch (err) {
      console.error('Failed to load receipts', err);
    }
  };

  useEffect(() => {
    void loadReceipts();
  }, [currentDb]);

  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const matchesHeader =
        r.id.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        (r.customerPhone && r.customerPhone.toLowerCase().includes(q));
      const matchesItems = r.items.some(
        (i) =>
          i.stockItemName.toLowerCase().includes(q) ||
          i.stockItemId.toLowerCase().includes(q) ||
          (i.variantDescription && i.variantDescription.toLowerCase().includes(q))
      );
      return matchesHeader || matchesItems;
    });
  }, [receipts, searchQuery, statusFilter]);

  const handleShareWhatsApp = (receipt: SalesReceipt) => {
    const bizName = activeBusiness?.name || 'Smart POS';
    const text = formatReceiptShareText(receipt, bizName, currency);
    const phone = (receipt.customerPhone || '').replace(/\D/g, '');
    const waUrl = phone
      ? `https://wa.me/${phone.length === 10 ? `91${phone}` : phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async (receipt: SalesReceipt) => {
    if (!currentDb) return;
    if (!window.confirm(`Delete receipt ${receipt.id}? This cannot be undone.`)) return;
    try {
      await currentDb.receipts.delete(receipt.id);
      if (selectedReceipt?.id === receipt.id) setSelectedReceipt(null);
      await loadReceipts();
      scheduleCloudSync();
    } catch (err) {
      console.error('Failed to delete receipt', err);
      alert('Failed to delete receipt.');
    }
  };

  const renderStatusBadge = (status: SalesReceipt['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case 'inProgress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            <Clock className="w-3 h-3" /> In Progress
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <PauseCircle className="w-3 h-3" /> Paused
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
            <XCircle className="w-3 h-3" /> Cancelled
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-600" />
            {t('history.title', 'Order & Receipt History')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            View, print, edit, or share receipts with item dates and deposit logs
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by receipt #, customer, phone, or item..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="inProgress">In Progress</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4 text-center">Items</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Grand Total</th>
                <th className="py-3 px-4 text-right">Balance Due</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No receipts found matching your search.
                  </td>
                </tr>
              ) : (
                filteredReceipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-mono text-xs font-bold text-indigo-700">
                      {r.id}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {new Date(r.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{r.customerName}</div>
                      {r.customerPhone && (
                        <div className="text-xs text-slate-500">{r.customerPhone}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center font-semibold text-slate-700">
                      {r.items.length}
                    </td>
                    <td className="py-3.5 px-4 text-center">{renderStatusBadge(r.status)}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                      {formatCurrency(r.grandTotal, currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span
                        className={`font-bold ${
                          r.balanceDue > 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                      >
                        {formatCurrency(r.balanceDue, currency)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedReceipt(r)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                          title="View Details grouped by date"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleShareWhatsApp(r)}
                          className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
                          title="Share on WhatsApp with item & payment dates"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        {canEditReceipt && onViewReceipt && (
                          <button
                            onClick={() => onViewReceipt(r.id)}
                            className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
                            title="Edit Receipt"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {canDeleteReceipt && (
                          <button
                            onClick={() => handleDelete(r)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Delete Receipt"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Details Modal with Date-Grouped Items & Deposit History */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div>
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  Receipt {selectedReceipt.id}
                  {renderStatusBadge(selectedReceipt.status)}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Customer: <strong>{selectedReceipt.customerName}</strong>
                  {selectedReceipt.customerPhone ? ` (${selectedReceipt.customerPhone})` : ''}
                </p>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grouped Items by Date */}
            <div className="space-y-4">
              {groupReceiptItemsByDate(selectedReceipt.items, selectedReceipt.createdAt).map(
                (group) => (
                  <div
                    key={group.isoDateKey}
                    className="border border-slate-200 rounded-xl overflow-hidden"
                  >
                    <div className="bg-indigo-50/80 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                        Added on: {group.dateLabel}
                      </span>
                      <span className="text-xs font-semibold text-indigo-700">
                        Day Subtotal: {formatCurrency(group.daySubtotal, currency)}
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 text-xs flex items-center justify-between hover:bg-slate-50"
                        >
                          <div>
                            <div className="font-bold text-slate-800">
                              {item.stockItemName}
                              {(item.variantDescription || item.color || item.size) && (
                                <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                                  ({item.variantDescription || [item.color, item.size].filter(Boolean).join(' / ')})
                                </span>
                              )}
                              {item.isReturn && (
                                <span className="ml-2 px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-bold">
                                  RETURN
                                </span>
                              )}
                            </div>
                            <div className="text-slate-500 mt-0.5">
                              {item.quantity} × {formatCurrency(item.unitPrice, currency)}
                              {item.discountAmount > 0 &&
                                ` (-${formatCurrency(item.discountAmount, currency)} discount)`}
                            </div>
                          </div>
                          <div className="font-bold text-slate-900">
                            {item.isReturn ? '-' : ''}
                            {formatCurrency(Math.abs(item.totalPrice), currency)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Payment / Deposit History Section */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-emerald-50/80 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                  Payment / Deposit History
                </span>
                <span className="text-xs font-semibold text-emerald-700">
                  Total Paid: {formatCurrency(selectedReceipt.amountReceived, currency)}
                </span>
              </div>
              {selectedReceipt.payments && selectedReceipt.payments.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {[...selectedReceipt.payments]
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map((p, idx) => {
                      const pDate = new Date(p.date);
                      const dateStr = isNaN(pDate.getTime())
                        ? p.date
                        : pDate.toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          });
                      return (
                        <div
                          key={p.id || idx}
                          className="p-3 text-xs flex items-center justify-between hover:bg-slate-50"
                        >
                          <div className="space-y-0.5">
                            <div className="font-semibold text-slate-800 flex items-center gap-2">
                              <span>{dateStr}</span>
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px] uppercase">
                                {formatPaymentMethod(p.method)}
                              </span>
                            </div>
                            {(p.transactionRef || p.notes) && (
                              <div className="text-[11px] text-slate-500">
                                {p.transactionRef ? `Ref: ${p.transactionRef}` : ''}
                                {p.transactionRef && p.notes ? ' • ' : ''}
                                {p.notes ? p.notes : ''}
                              </div>
                            )}
                          </div>
                          <div className="font-bold text-emerald-700">
                            +{formatCurrency(p.amount, currency)}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="p-3 text-xs text-slate-400 text-center">
                  No individual deposit entries recorded yet.
                </div>
              )}
            </div>

            {/* Totals Summary */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-semibold">{formatCurrency(selectedReceipt.subtotal, currency)}</span>
              </div>
              {selectedReceipt.totalDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount:</span>
                  <span className="font-semibold">
                    -{formatCurrency(selectedReceipt.totalDiscount, currency)}
                  </span>
                </div>
              )}
              {selectedReceipt.taxAmount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax:</span>
                  <span className="font-semibold">+{formatCurrency(selectedReceipt.taxAmount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-slate-900 pt-1.5 border-t border-slate-200">
                <span>Grand Total:</span>
                <span>{formatCurrency(selectedReceipt.grandTotal, currency)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Amount Received:</span>
                <span>{formatCurrency(selectedReceipt.amountReceived, currency)}</span>
              </div>
              <div className="flex justify-between text-rose-600 font-bold">
                <span>Balance Due:</span>
                <span>{formatCurrency(selectedReceipt.balanceDue, currency)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleShareWhatsApp(selectedReceipt)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition"
              >
                <Share2 className="w-4 h-4" /> Share on WhatsApp (With Dates & Payments)
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
              >
                <Printer className="w-4 h-4" /> Print
              </button>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
