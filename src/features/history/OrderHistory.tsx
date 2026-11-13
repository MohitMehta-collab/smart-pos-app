import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ReceiptService } from '../../services/receiptService';
import { useAppStore } from '../../store/useAppStore';
import type { SalesReceipt } from '../../types';
import { formatCurrency } from '../../utils/pricing';
import {
  History,
  Search,
  Eye,
  X,
  Printer,
  Share2,
  Copy,
  Check,
  MessageCircle,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';

interface OrderHistoryProps {
  onViewReceipt: (receiptId: string) => void;
}

// Parse YYYY-MM-DD in local timezone safely to avoid UTC midnight shift in IST (+05:30) or NaN crashes
const parseLocalDateBounds = (dateStr: string, endOfDay: boolean): number | null => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.getTime();
};

// Normalize Indian phone numbers to 91XXXXXXXXXX for wa.me links
const formatWhatsAppPhone = (phone?: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
};

export const OrderHistory: React.FC<OrderHistoryProps> = ({ onViewReceipt }) => {
  const { t, i18n } = useTranslation();
  const { currency, activeBusiness } = useAppStore();
  const [receipts, setReceipts] = useState<SalesReceipt[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modal states
  const [activeReceiptModal, setActiveReceiptModal] = useState<SalesReceipt | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [shareTargetPhone, setShareTargetPhone] = useState('');
  const [copied, setCopied] = useState(false);

  const locale = i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN';
  const bizName = activeBusiness?.name || 'ANCHAL FURNITURE';

  const loadData = useCallback(async () => {
    const data = await ReceiptService.getAllReceipts(searchQuery, statusFilter);
    setReceipts(data);
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter displayed receipts by selected local date range
  const filteredReceipts = useMemo(() => {
    const parsedFrom = fromDate ? parseLocalDateBounds(fromDate, false) : null;
    const parsedTo = toDate ? parseLocalDateBounds(toDate, true) : null;
    if (parsedFrom === null && parsedTo === null) return receipts;

    const from = parsedFrom ?? -Infinity;
    const to = parsedTo ?? Infinity;
    return receipts.filter((r) => {
      const created = new Date(r.createdAt).getTime();
      return !Number.isNaN(created) && created >= from && created <= to;
    });
  }, [receipts, fromDate, toDate]);

  // Build WhatsApp message for an individual receipt
  const buildSingleReceiptMessage = (rec: SalesReceipt) => {
    const dateStr = new Date(rec.createdAt).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const itemsText = rec.items
      .map(
        (it, idx) =>
          `${idx + 1}. ${it.stockItemName}${it.variantDescription ? ` (${it.variantDescription})` : ''} x ${it.quantity}${it.weight ? ` (${it.weight}kg)` : ''} = ${formatCurrency(it.totalPrice, currency)}${it.isReturn ? ' [RETURN]' : ''}`
      )
      .join('\n');

    return (
      `🧾 *${bizName}*\n` +
      `*${t('receipt.number', 'Receipt #')}:* ${rec.id}\n` +
      `*${t('receipt.date', 'Date')}:* ${dateStr}\n` +
      `*${t('customer.name', 'Customer')}:* ${rec.customerName || t('customer.walkIn', 'Walk-in Customer')}\n` +
      `--------------------------\n` +
      `${itemsText}\n` +
      `--------------------------\n` +
      `*${t('receipt.subtotal', 'Subtotal')}:* ${formatCurrency(rec.subtotal, currency)}\n` +
      (rec.totalDiscount > 0
        ? `*${t('receipt.discount', 'Discount')}:* -${formatCurrency(rec.totalDiscount, currency)}\n`
        : '') +
      (rec.taxAmount > 0
        ? `*${t('receipt.tax', 'GST / Tax')}:* +${formatCurrency(rec.taxAmount, currency)}\n`
        : '') +
      `*${t('receipt.grandTotal', 'Grand Total')}:* ${formatCurrency(rec.grandTotal, currency)}\n` +
      `*${t('receipt.amountPaid', 'Amount Paid')}:* ${formatCurrency(rec.amountReceived, currency)}\n` +
      `*${t('receipt.balanceDue', 'Balance Due')}:* ${formatCurrency(rec.balanceDue, currency)}\n` +
      `--------------------------\n` +
      `${t('receipt.thankYou', 'Thank you for shopping with us!')}`
    );
  };

  // Build WhatsApp summary message for multiple orders
  const buildBulkShareMessage = (list: SalesReceipt[]) => {
    const today = new Date().toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const header =
      `📋 *${bizName} - ${t('history.title', 'Sales Order History')}*\n` +
      `📅 ${t('history.generatedOn', 'Generated')}: ${today}\n` +
      `📊 ${t('history.totalOrders', 'Total Orders')}: ${list.length}\n\n`;

    const summary = list
      .map(
        (rec, idx) =>
          `${idx + 1}. *#${rec.id}* [${t(`status.${rec.status}`, rec.status).toUpperCase()}]\n` +
          `   • ${new Date(rec.createdAt).toLocaleDateString(locale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })} | ${rec.customerName} (${rec.customerPhone || 'N/A'})\n` +
          `   • ${t('receipt.grandTotal', 'Total')}: ${formatCurrency(rec.grandTotal, currency)} | ${t('receipt.paid', 'Paid')}: ${formatCurrency(rec.amountReceived, currency)} | ${t('receipt.due', 'Due')}: ${formatCurrency(rec.balanceDue, currency)}`
      )
      .join('\n\n');

    const grandTotal = list.reduce((sum, r) => sum + r.grandTotal, 0);
    const totalPaid = list.reduce((sum, r) => sum + r.amountReceived, 0);
    const totalDue = list.reduce((sum, r) => sum + r.balanceDue, 0);

    const footer =
      `\n\n💰 *${t('history.summary', 'Summary')}*\n` +
      `   • ${t('receipt.grandTotal', 'Grand Total')}: ${formatCurrency(grandTotal, currency)}\n` +
      `   • ${t('receipt.amountPaid', 'Amount Paid')}: ${formatCurrency(totalPaid, currency)}\n` +
      `   • ${t('receipt.balanceDue', 'Balance Due')}: ${formatCurrency(totalDue, currency)}`;

    return `${header}${summary}${footer}`;
  };

  const handleShareSingleWhatsApp = (rec: SalesReceipt, openPreview = false) => {
    const msg = buildSingleReceiptMessage(rec);
    const waPhone = formatWhatsAppPhone(rec.customerPhone || rec.customer?.phone);

    if (openPreview) {
      setShareMessage(msg);
      setShareTargetPhone(waPhone);
      setCopied(false);
      setShowShareModal(true);
      return;
    }

    const baseUrl = waPhone ? `https://wa.me/${waPhone}` : 'https://wa.me/';
    window.open(`${baseUrl}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  const handleBulkShare = (scope: 'full' | 'partial') => {
    const list = scope === 'full' ? receipts : filteredReceipts;
    if (list.length === 0) {
      alert(t('history.noOrdersToShare', 'No orders found to share for the selected criteria.'));
      return;
    }
    setShareMessage(buildBulkShareMessage(list));
    setShareTargetPhone('');
    setCopied(false);
    setShowShareModal(true);
  };

  // Export filtered receipts to UTF-8 BOM CSV (Excel-safe for Hindi & ₹)
  const handleExportCSV = () => {
    if (filteredReceipts.length === 0) {
      alert(t('history.noOrdersToExport', 'No orders available to export.'));
      return;
    }

    const escapeCsv = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const headers = [
      'Receipt ID',
      'Date & Time',
      'Customer Name',
      'Phone',
      'Items Count',
      'Items Summary',
      'Status',
      `Subtotal (${currency || 'INR'})`,
      `Discount (${currency || 'INR'})`,
      `Tax (${currency || 'INR'})`,
      `Grand Total (${currency || 'INR'})`,
      `Amount Paid (${currency || 'INR'})`,
      `Balance Due (${currency || 'INR'})`,
    ];

    const rows = filteredReceipts.map((rec) => [
      rec.id,
      new Date(rec.createdAt).toLocaleString('en-IN'),
      rec.customerName || 'Walk-in Customer',
      rec.customerPhone || '',
      rec.items.length,
      rec.items.map((i) => `${i.stockItemName} (x${i.quantity})`).join('; '),
      rec.status,
      rec.subtotal.toFixed(2),
      rec.totalDiscount.toFixed(2),
      (rec.taxAmount || 0).toFixed(2),
      rec.grandTotal.toFixed(2),
      rec.amountReceived.toFixed(2),
      rec.balanceDue.toFixed(2),
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `sales-orders-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export filtered receipts to Printable PDF Report
  const handleExportPDF = () => {
    if (filteredReceipts.length === 0) {
      alert(t('history.noOrdersToExport', 'No orders available to export.'));
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert(t('history.allowPopups', 'Please allow pop-ups to generate the PDF report.'));
      return;
    }

    const grandTotal = filteredReceipts.reduce((s, r) => s + r.grandTotal, 0);
    const totalPaid = filteredReceipts.reduce((s, r) => s + r.amountReceived, 0);
    const totalDue = filteredReceipts.reduce((s, r) => s + r.balanceDue, 0);

    const rowsHtml = filteredReceipts
      .map(
        (rec) => `
        <tr>
          <td><strong>${rec.id}</strong></td>
          <td>${new Date(rec.createdAt).toLocaleDateString(locale, {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}</td>
          <td>${rec.customerName || 'Walk-in'}</td>
          <td>${rec.customerPhone || '—'}</td>
          <td style="text-transform:uppercase;font-size:10px;">${rec.status}</td>
          <td style="text-align:right;">${formatCurrency(rec.grandTotal, currency)}</td>
          <td style="text-align:right;color:#059669;">${formatCurrency(rec.amountReceived, currency)}</td>
          <td style="text-align:right;color:#d97706;">${formatCurrency(rec.balanceDue, currency)}</td>
        </tr>`
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${bizName} - Sales Report</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; padding: 24px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
            h1 { margin: 0; font-size: 20px; }
            .meta { font-size: 12px; color: #64748b; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
            th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 6px; text-align: left; }
            th { background: #f8fafc; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; }
            .summary { margin-top: 20px; display: flex; justify-content: flex-end; gap: 24px; font-size: 13px; background: #f8fafc; padding: 12px; border-radius: 8px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>${bizName}</h1>
              <div class="meta">${t('history.title', 'Sales Order History')} (${filteredReceipts.length} ${t('history.orders', 'orders')})</div>
            </div>
            <div class="meta" style="text-align:right;">
              <div>${t('history.generatedOn', 'Generated')}: ${new Date().toLocaleString(locale)}</div>
              ${fromDate || toDate ? `<div>Range: ${fromDate || 'Start'} to ${toDate || 'Today'}</div>` : ''}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Status</th>
                <th style="text-align:right;">Total</th>
                <th style="text-align:right;">Paid</th>
                <th style="text-align:right;">Due</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div class="summary">
            <div><strong>${t('receipt.grandTotal', 'Grand Total')}:</strong> ${formatCurrency(grandTotal, currency)}</div>
            <div style="color:#059669;"><strong>${t('receipt.amountPaid', 'Paid')}:</strong> ${formatCurrency(totalPaid, currency)}</div>
            <div style="color:#d97706;"><strong>${t('receipt.balanceDue', 'Due')}:</strong> ${formatCurrency(totalDue, currency)}</div>
          </div>
          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleCopyToClipboard = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareMessage);
      } else {
        const ta = document.createElement('textarea');
        ta.value = shareMessage;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
      alert(t('history.copyFailed', 'Unable to copy to clipboard.'));
    }
  };

  const handleShareViaWhatsApp = () => {
    const baseUrl = shareTargetPhone ? `https://wa.me/${shareTargetPhone}` : 'https://wa.me/';
    window.open(`${baseUrl}?text=${encodeURIComponent(shareMessage)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      {/* Print-only CSS so Quick View Modal prints cleanly without background */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-receipt-modal, #printable-receipt-modal * { visibility: visible; }
          #printable-receipt-modal {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header + Export Actions */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-indigo-600" />
            {t('history.title', 'Order History')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('history.subtitle', 'Search, filter, print, and export past sales receipts')}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-semibold transition border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
            {t('history.exportCsv', 'Export CSV')}
          </button>
          <button
            onClick={handleExportPDF}
            className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-semibold transition border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
          >
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            {t('history.exportPdf', 'Export PDF')}
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div className="relative w-full lg:w-80">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('history.searchPlaceholder', 'Search by receipt #, name, phone...')}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase">
              {t('common.from', 'From')}
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase">
              {t('common.to', 'To')}
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
              className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 underline"
            >
              {t('common.clear', 'Clear')}
            </button>
          )}
          <select
            aria-label={t('history.filterByStatus', 'Filter receipts by status')}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">{t('status.all', 'All Statuses (सभी)')}</option>
            <option value="completed">{t('status.completed', 'Completed (पूर्ण)')}</option>
            <option value="inProgress">{t('status.inProgress', 'In Progress (प्रगति पर)')}</option>
            <option value="paused">{t('status.paused', 'Paused (रुका हुआ)')}</option>
          </select>
          <button
            onClick={() => handleBulkShare('full')}
            className="inline-flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
          >
            <Share2 className="w-3.5 h-3.5 mr-1.5" /> {t('history.shareFull', 'Share All')}
          </button>
          <button
            onClick={() => handleBulkShare('partial')}
            disabled={!fromDate && !toDate}
            className="inline-flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Share2 className="w-3.5 h-3.5 mr-1.5" /> {t('history.sharePartial', 'Share Filtered')}
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                <th className="py-3 px-4">{t('receipt.number', 'Receipt #')}</th>
                <th className="py-3 px-4">{t('receipt.dateTime', 'Date & Time')}</th>
                <th className="py-3 px-4">{t('customer.name', 'Customer')}</th>
                <th className="py-3 px-4">{t('customer.phone', 'Phone')}</th>
                <th className="py-3 px-4 text-center">{t('receipt.items', 'Items')}</th>
                <th className="py-3 px-4 text-center">{t('receipt.status', 'Status')}</th>
                <th className="py-3 px-4 text-right">{t('receipt.grandTotal', 'Grand Total')}</th>
                <th className="py-3 px-4 text-right">{t('receipt.paid', 'Paid')}</th>
                <th className="py-3 px-4 text-right">{t('receipt.due', 'Due')}</th>
                <th className="py-3 px-4 text-center">{t('common.action', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    {t('history.noOrdersFound', 'No orders found matching search criteria.')}
                  </td>
                </tr>
              ) : (
                filteredReceipts.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-600">
                      {rec.id}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {new Date(rec.createdAt).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {rec.customerName || t('customer.walkIn', 'Walk-in Customer')}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {rec.customerPhone || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center font-medium text-slate-600">
                      {t('history.itemCount', '{{count}} items', { count: rec.items.length })}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider ${
                          rec.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : rec.status === 'inProgress'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {t(`status.${rec.status}`, rec.status)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-slate-900">
                      {formatCurrency(rec.grandTotal, currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-600">
                      {formatCurrency(rec.amountReceived, currency)}
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-bold ${
                        rec.balanceDue > 0 ? 'text-amber-600' : 'text-slate-400'
                      }`}
                    >
                      {formatCurrency(rec.balanceDue, currency)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => setActiveReceiptModal(rec)}
                          title={t('common.view', 'View Receipt')}
                          className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1 text-slate-500" />
                          {t('common.view', 'View')}
                        </button>
                        <button
                          onClick={() => handleShareSingleWhatsApp(rec, false)}
                          title={t('history.shareWhatsAppReceipt', 'Send receipt on WhatsApp')}
                          className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold transition"
                        >
                          <MessageCircle className="w-3.5 h-3.5 mr-1" />
                          WA
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick View Receipt Modal */}
      {activeReceiptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div
            id="printable-receipt-modal"
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div>
                <h3 className="font-bold text-lg text-slate-900">
                  {t('receipt.number', 'Receipt #')} {activeReceiptModal.id}
                </h3>
                <p className="text-xs text-slate-500">
                  {new Date(activeReceiptModal.createdAt).toLocaleString(locale)}
                </p>
              </div>
              <button
                onClick={() => setActiveReceiptModal(null)}
                className="no-print text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer Details Box */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <div>
                <span className="text-slate-500">{t('customer.name', 'Customer')}:</span>{' '}
                <strong className="text-slate-800">{activeReceiptModal.customerName}</strong>
              </div>
              <div>
                <span className="text-slate-500">{t('customer.phone', 'Phone')}:</span>{' '}
                <strong className="text-slate-800">{activeReceiptModal.customerPhone || 'N/A'}</strong>
              </div>
              {activeReceiptModal.customerAddress && (
                <div>
                  <span className="text-slate-500">{t('customer.address', 'Address')}:</span>{' '}
                  <span className="text-slate-800">{activeReceiptModal.customerAddress}</span>
                </div>
              )}
            </div>

            {/* Items Listing */}
            <div className="divide-y divide-slate-100 text-xs border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 font-bold text-slate-600 grid grid-cols-4">
                <span className="col-span-2">{t('receipt.item', 'Item')}</span>
                <span className="text-center">{t('receipt.qty', 'Qty')}</span>
                <span className="text-right">{t('receipt.price', 'Price')}</span>
              </div>
              {activeReceiptModal.items.map((it) => (
                <div key={it.id} className="px-3 py-2 grid grid-cols-4 items-center">
                  <div className="col-span-2">
                    <span className="font-semibold text-slate-800">{it.stockItemName}</span>
                    {it.variantDescription && (
                      <span className="block text-[11px] text-slate-500">{it.variantDescription}</span>
                    )}
                    {it.isReturn && (
                      <span className="text-[10px] text-rose-600 font-bold block">
                        [{t('receipt.return', 'RETURN')}]
                      </span>
                    )}
                  </div>
                  <div className="text-center font-medium">
                    {it.quantity} {it.weight ? `(${it.weight}kg)` : ''}
                  </div>
                  <div className="text-right font-bold">{formatCurrency(it.totalPrice, currency)}</div>
                </div>
              ))}
            </div>

            {/* Financial Summary */}
            <div className="space-y-1.5 text-xs border-t pt-3 border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('receipt.subtotal', 'Subtotal')}:</span>
                <span className="font-semibold">{formatCurrency(activeReceiptModal.subtotal, currency)}</span>
              </div>
              {activeReceiptModal.totalDiscount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>{t('receipt.discount', 'Discount')}:</span>
                  <span>-{formatCurrency(activeReceiptModal.totalDiscount, currency)}</span>
                </div>
              )}
              {activeReceiptModal.taxAmount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>{t('receipt.tax', 'GST / Tax')}:</span>
                  <span>+{formatCurrency(activeReceiptModal.taxAmount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold text-slate-900 border-t pt-1">
                <span>{t('receipt.grandTotal', 'Grand Total')}:</span>
                <span>{formatCurrency(activeReceiptModal.grandTotal, currency)}</span>
              </div>
              <div className="flex justify-between text-emerald-600 font-bold">
                <span>{t('receipt.amountPaid', 'Amount Paid')}:</span>
                <span>{formatCurrency(activeReceiptModal.amountReceived, currency)}</span>
              </div>
              <div className="flex justify-between text-amber-600 font-bold">
                <span>{t('receipt.balanceDue', 'Balance Due')}:</span>
                <span>{formatCurrency(activeReceiptModal.balanceDue, currency)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="no-print flex flex-wrap gap-2 pt-2">
              <button
                onClick={() => {
                  onViewReceipt(activeReceiptModal.id);
                  setActiveReceiptModal(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
              >
                {t('history.openInEditor', 'Open in Editor')}
              </button>
              <button
                onClick={() => handleShareSingleWhatsApp(activeReceiptModal, true)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center"
              >
                <MessageCircle className="w-4 h-4 mr-1.5" />
                {t('history.shareWhatsApp', 'WhatsApp')}
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold inline-flex items-center"
              >
                <Printer className="w-4 h-4 mr-1.5" />
                {t('history.printBill', 'Print Bill')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Preview Modal (Works for both Individual & Bulk Share) */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Share2 className="w-5 h-5 text-indigo-600" />
                {t('history.shareHistory', 'Share via WhatsApp')}
              </h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {t('history.sharePreview', 'Message Preview')}
              </p>
              <pre className="whitespace-pre-wrap text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono">
                {shareMessage}
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={handleCopyToClipboard}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
              >
                {copied ? <Check className="w-4 h-4 mr-1.5 text-emerald-600" /> : <Copy className="w-4 h-4 mr-1.5" />}
                {copied ? t('history.shareCopied', 'Copied!') : t('history.shareCopy', 'Copy Text')}
              </button>
              <button
                onClick={handleShareViaWhatsApp}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center"
              >
                <MessageCircle className="w-4 h-4 mr-1.5" /> {t('history.shareWhatsApp', 'Send on WhatsApp')}
              </button>
              <button
                onClick={() => setShowShareModal(false)}
                className="sm:w-28 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
              >
                {t('common.close', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
