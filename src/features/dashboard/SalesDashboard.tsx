import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SalesReceipt } from '../../types';
import { formatCurrency } from '../../utils/pricing';
import { useAppStore } from '../../store/useAppStore';
import {
  groupReceiptItemsByDate,
  formatReceiptShareText,
  formatPaymentMethod,
} from '../history/OrderHistory';
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  AlertCircle,
  Share2,
  Edit3,
  Calendar,
  Eye,
  X,
  CreditCard,
  Clock,
  PauseCircle,
} from 'lucide-react';

interface SalesDashboardProps {
  onEditReceipt?: (id: string) => void;
}

export const SalesDashboard: React.FC<SalesDashboardProps> = ({ onEditReceipt }) => {
  const { t } = useTranslation();
  const { currentDb, activeBusiness, currency, canAccess } = useAppStore();
  const [receipts, setReceipts] = useState<SalesReceipt[]>([]);
  const [previewReceipt, setPreviewReceipt] = useState<SalesReceipt | null>(null);

  const canEditReceipt = canAccess('edit_receipt') || canAccess('create_receipt');

  useEffect(() => {
    async function load() {
      if (!currentDb) return;
      try {
        const all = await currentDb.receipts.toArray();
        const sorted = all.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setReceipts(sorted);
      } catch (err) {
        console.error('Failed to load dashboard receipts', err);
      }
    }
    void load();
  }, [currentDb]);

  // Only show ongoing / in-progress receipts on the Sales Dashboard (completed & cancelled belong in Order History)
  const inProgressReceipts = useMemo(() => {
    return receipts.filter((r) => r.status === 'inProgress' || r.status === 'paused');
  }, [receipts]);

  const metrics = useMemo(() => {
    const active = receipts.filter((r) => r.status !== 'cancelled');
    const totalSales = active.reduce((sum, r) => sum + r.grandTotal, 0);
    const totalReceived = active.reduce((sum, r) => sum + r.amountReceived, 0);
    const totalDue = inProgressReceipts.reduce((sum, r) => sum + r.balanceDue, 0);
    return {
      activeInProgressCount: inProgressReceipts.length,
      totalSales,
      totalReceived,
      totalDue,
    };
  }, [receipts, inProgressReceipts]);

  const handleShareWhatsApp = (receipt: SalesReceipt) => {
    const bizName = activeBusiness?.name || 'Smart POS';
    const text = formatReceiptShareText(receipt, bizName, currency);
    const phone = (receipt.customerPhone || '').replace(/\D/g, '');
    const waUrl = phone
      ? `https://wa.me/${phone.length === 10 ? `91${phone}` : phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const renderStatusBadge = (status: SalesReceipt['status']) => {
    if (status === 'paused') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
          <PauseCircle className="w-3 h-3" /> Paused
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
        <Clock className="w-3 h-3" /> In Progress
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-indigo-600" />
          {t('dashboard.title', 'Sales Dashboard')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Active in-progress orders and real-time revenue overview (completed receipts move to Order History)
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase">
            <span>Total Revenue</span>
            <DollarSign className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {formatCurrency(metrics.totalSales, currency)}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase">
            <span>Amount Received</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-2">
            {formatCurrency(metrics.totalReceived, currency)}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase">
            <span>Pending Balance Due</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-600 mt-2">
            {formatCurrency(metrics.totalDue, currency)}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase">
            <span>In-Progress Orders</span>
            <ShoppingBag className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {metrics.activeInProgressCount}
          </div>
        </div>
      </div>

      {/* Active In-Progress Receipts List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              In-Progress Receipts ({inProgressReceipts.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Completed orders are archived in Order History
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Dates Added</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Due</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inProgressReceipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No in-progress receipts right now. Completed receipts can be viewed in Order History.
                  </td>
                </tr>
              ) : (
                inProgressReceipts.map((r) => {
                  const dateGroups = groupReceiptItemsByDate(r.items, r.createdAt);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-mono text-xs font-bold text-indigo-700">
                        {r.id}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{r.customerName}</div>
                        {r.customerPhone && (
                          <div className="text-xs text-slate-500">{r.customerPhone}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">{renderStatusBadge(r.status)}</td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {dateGroups.map((g) => (
                            <span
                              key={g.isoDateKey}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100"
                            >
                              <Calendar className="w-2.5 h-2.5" />
                              {g.dateLabel} ({g.items.length})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {formatCurrency(r.grandTotal, currency)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-rose-600">
                        {formatCurrency(r.balanceDue, currency)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setPreviewReceipt(r)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                            title="Preview Receipt by Date"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleShareWhatsApp(r)}
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
                            title="Share Receipt with Item & Payment Dates"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                          {canEditReceipt && onEditReceipt && (
                            <button
                              onClick={() => onEditReceipt(r.id)}
                              className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
                              title="Edit Receipt"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Modal */}
      {previewReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div>
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  Receipt {previewReceipt.id}
                  {renderStatusBadge(previewReceipt.status)}
                </h3>
                <p className="text-xs text-slate-500">{previewReceipt.customerName}</p>
              </div>
              <button
                onClick={() => setPreviewReceipt(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {groupReceiptItemsByDate(previewReceipt.items, previewReceipt.createdAt).map((g) => (
                <div key={g.isoDateKey} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-indigo-50 px-3.5 py-2 border-b border-slate-200 flex justify-between text-xs font-bold text-indigo-900">
                    <span>Added on: {g.dateLabel}</span>
                    <span>{formatCurrency(g.daySubtotal, currency)}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {g.items.map((item) => (
                      <div key={item.id} className="p-2.5 text-xs flex justify-between">
                        <span>
                          <strong>{item.stockItemName}</strong> × {item.quantity}
                        </span>
                        <span className="font-bold">
                          {formatCurrency(item.totalPrice, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Payment / Deposit History in Preview Modal */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-emerald-50 px-3.5 py-2 border-b border-slate-200 flex justify-between text-xs font-bold text-emerald-900">
                <span className="flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                  Payment / Deposit History
                </span>
                <span>Total Paid: {formatCurrency(previewReceipt.amountReceived, currency)}</span>
              </div>
              {previewReceipt.payments && previewReceipt.payments.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {[...previewReceipt.payments]
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
                        <div key={p.id || idx} className="p-2.5 text-xs flex justify-between items-center">
                          <div>
                            <span className="font-semibold text-slate-800">{dateStr}</span>
                            <span className="ml-2 px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold uppercase">
                              {formatPaymentMethod(p.method)}
                            </span>
                            {p.transactionRef && (
                              <span className="ml-1.5 text-[11px] text-slate-500">
                                (Ref: {p.transactionRef})
                              </span>
                            )}
                          </div>
                          <span className="font-bold text-emerald-700">
                            +{formatCurrency(p.amount, currency)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="p-2.5 text-xs text-slate-400 text-center">
                  No deposits recorded yet.
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleShareWhatsApp(previewReceipt)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-4 h-4" /> Share on WhatsApp (With Dates & Payments)
              </button>
              <button
                onClick={() => setPreviewReceipt(null)}
                className="py-2.5 px-4 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
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
