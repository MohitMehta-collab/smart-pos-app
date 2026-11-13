import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ReceiptService } from '../../services/receiptService';
import { useAppStore } from '../../store/useAppStore';
import type { SalesReceipt } from '../../types';
import { formatCurrency } from '../../utils/pricing';
import {
  LayoutDashboard,
  Clock,
  TrendingUp,
  AlertCircle,
  Edit,
  RefreshCw,
} from 'lucide-react';

interface SalesDashboardProps {
  onEditReceipt: (receiptId: string) => void;
}

export const SalesDashboard: React.FC<SalesDashboardProps> = ({ onEditReceipt }) => {
  const { t, i18n } = useTranslation();
  const { currency } = useAppStore();
  const [activeReceipts, setActiveReceipts] = useState<SalesReceipt[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const locale = i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN';

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await ReceiptService.getActiveDashboardReceipts();
      setActiveReceipts(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalInProgressCount = activeReceipts.length;
  const totalReceivableValue = activeReceipts.reduce((sum, r) => sum + r.grandTotal, 0);
  const totalCollectedTillNow = activeReceipts.reduce((sum, r) => sum + r.amountReceived, 0);
  const totalPendingBalance = activeReceipts.reduce((sum, r) => sum + r.balanceDue, 0);

  return (
    <div className="space-y-6">
      {/* Dashboard Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-indigo-600" />
            {t('dashboard.title', 'Sales Dashboard')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('dashboard.subtitle', 'Live overview of open orders and pending balances')}
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-semibold transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('dashboard.refreshStatus', 'Refresh Live Status')}
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('dashboard.inProgressCount', 'In-Progress Orders')}
            </span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 mt-3">
            {totalInProgressCount}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {t('dashboard.pendingCompletion', 'Pending completion')}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('dashboard.totalReceivable', 'Total Receivable')}
            </span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-3">
            {formatCurrency(totalReceivableValue, currency)}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {t('dashboard.totalValueOpenBills', 'Total value of open bills')}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('dashboard.amountCollected', 'Amount Collected')}
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-3">
            {formatCurrency(totalCollectedTillNow, currency)}
          </div>
          <p className="text-xs text-emerald-700/70 mt-1">
            {t('dashboard.collectedAdvance', 'Collected advance / partial')}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('dashboard.dueBalance', 'Due Balance')}
            </span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 mt-3">
            {formatCurrency(totalPendingBalance, currency)}
          </div>
          <p className="text-xs text-amber-700/70 mt-1">
            {t('dashboard.remainingToCollect', 'Remaining to collect')}
          </p>
        </div>
      </div>

      {/* Active In-Progress Receipts Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            {t('dashboard.openReceipts', 'Open Receipts')} ({activeReceipts.length})
          </h2>
          <span className="text-xs text-slate-400">
            {t('dashboard.realTimeSynced', 'Offline-ready synced')}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                <th className="py-3 px-4">{t('receipt.number', 'Receipt #')}</th>
                <th className="py-3 px-4">{t('customer.name', 'Customer Name')}</th>
                <th className="py-3 px-4">{t('customer.phone', 'Phone Number')}</th>
                <th className="py-3 px-4">{t('receipt.startDate', 'Start Date')}</th>
                <th className="py-3 px-4 text-center">{t('receipt.status', 'Status')}</th>
                <th className="py-3 px-4 text-right">{t('receipt.totalAmount', 'Total Amount')}</th>
                <th className="py-3 px-4 text-right">{t('receipt.amountReceived', 'Amount Received')}</th>
                <th className="py-3 px-4 text-right">{t('receipt.balanceDue', 'Balance Due')}</th>
                <th className="py-3 px-4 text-center">{t('common.action', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeReceipts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    {t(
                      'dashboard.noActiveReceipts',
                      'No active in-progress or paused receipts. All orders completed!'
                    )}
                  </td>
                </tr>
              ) : (
                activeReceipts.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-600">
                      {rec.id}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {rec.customerName || rec.customer?.name || t('customer.walkIn', 'Walk-in Customer')}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-mono">
                      {rec.customerPhone || rec.customer?.phone || '—'}
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
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider ${
                          rec.status === 'inProgress'
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
                    <td className="py-3.5 px-4 text-right font-bold text-amber-600">
                      {formatCurrency(rec.balanceDue, currency)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => onEditReceipt(rec.id)}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs transition"
                      >
                        <Edit className="w-3.5 h-3.5 mr-1" />
                        {t('dashboard.editComplete', 'Edit / Complete')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
