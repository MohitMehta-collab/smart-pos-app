import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { WhatsAppBotService } from '../../services/whatsappBotService';
import type { BotResponse } from '../../services/whatsappBotService';
import { CloudSyncService } from '../../services/cloudSyncService';
import {
  getSupabaseConfig,
  saveRuntimeSupabaseConfig,
  isSupabaseConfigured,
} from '../../services/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import type { SalesReceipt } from '../../types';
import { formatCurrency } from '../../utils/pricing';
import { formatReceiptShareText } from '../history/OrderHistory';
import {
  MessageSquare,
  Send,
  ShieldCheck,
  Zap,
  Bot,
  RefreshCw,
  Info,
  Cloud,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Database,
  Share2,
  Copy,
  Check,
  BellRing,
  Sparkles,
} from 'lucide-react';

const QUICK_CHIPS = [
  { label: '📦 Full Stock', cmd: 'full stock' },
  { label: '⚠️ Low Stock PO', cmd: 'low stock' },
  { label: '💰 Today Summary', cmd: 'today' },
  { label: '🧾 Pending Dues', cmd: 'dues' },
  { label: '❓ Help / मदद', cmd: 'help' },
];

export const WhatsAppAssistant: React.FC = () => {
  const { t } = useTranslation();
  const {
    currentUser,
    activeBusiness,
    currentDb,
    currency,
    lastSyncTime,
    syncWithCloud,
  } = useAppStore();
  const [inputMessage, setInputMessage] = useState('');
  const [chatLog, setChatLog] = useState<{ role: 'user' | 'bot'; text: string; time: string }[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncBanner, setSyncBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Pending customer dues state for 1-Click Payment Reminder panel
  const [dueReceipts, setDueReceipts] = useState<SalesReceipt[]>([]);

  // Runtime Supabase Config state
  const existingCfg = getSupabaseConfig();
  const [sbUrl, setSbUrl] = useState(existingCfg?.url || '');
  const [sbKey, setSbKey] = useState(existingCfg?.anonKey || '');
  const [showDbConfig, setShowDbConfig] = useState(!isSupabaseConfigured());
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const loadDueReceipts = useCallback(async () => {
    if (!currentDb) return;
    try {
      const all = await currentDb.receipts.toArray();
      const pending = all
        .filter((r) => r.status !== 'cancelled' && r.balanceDue > 0)
        .sort((a, b) => b.balanceDue - a.balanceDue);
      setDueReceipts(pending);
    } catch (err) {
      console.error('Failed to load due receipts', err);
    }
  }, [currentDb]);

  useEffect(() => {
    void loadDueReceipts();
  }, [loadDueReceipts]);

  useEffect(() => {
    if (chatLog.length === 0) {
      setChatLog([
        {
          role: 'bot',
          text: [
            '🤖 *Smart POS Remote Assistant*',
            'Send *"help"* or click any quick-action chip below to check variant stock, generate supplier restock lists, view today\'s collection summary, or log customer payments.',
          ].join('\n'),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  }, [chatLog.length]);

  // Auto-scroll chat to bottom whenever a new message arrives
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  const executeBotCommand = async (commandText: string) => {
    const userMsg = commandText.trim();
    if (!userMsg) return;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatLog((prev) => [...prev, { role: 'user', text: userMsg, time: now }]);
    setInputMessage('');

    try {
      const response: BotResponse = await WhatsAppBotService.handleIncomingMessage(
        'REMOTE-BROWSER',
        userMsg,
        (currentUser?.role as any) || 'admin'
      );

      setChatLog((prev) => [
        ...prev,
        { role: 'bot', text: response.reply, time: response.timestamp.split(', ')[1] || now },
      ]);

      if (response.actionPerformed) {
        await loadDueReceipts();
      }
    } catch {
      setChatLog((prev) => [
        ...prev,
        { role: 'bot', text: '❌ Error processing command.', time: now },
      ]);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim()) return;
    await executeBotCommand(inputMessage);
  };

  const handleCopyBotReply = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1800);
    } catch {
      // Fallback
    }
  };

  const handleShareBotReplyWhatsApp = (text: string) => {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSendPaymentReminder = (receipt: SalesReceipt) => {
    const bizName = activeBusiness?.name || 'Smart POS';
    const baseBill = formatReceiptShareText(receipt, bizName, currency);
    const reminderHeader = [
      `🔔 *Gentle Payment Reminder from ${bizName}*`,
      `Hello *${receipt.customerName}*, your order *${receipt.id}* has a pending balance of *${formatCurrency(receipt.balanceDue, currency)}*. Here are your complete itemized & deposit details:`,
      ``,
      ``,
    ].join('\n');
    const fullText = `${reminderHeader}${baseBill}`;
    const phone = (receipt.customerPhone || '').replace(/\D/g, '');
    const waUrl = phone
      ? `https://wa.me/${phone.length === 10 ? `91${phone}` : phone}?text=${encodeURIComponent(fullText)}`
      : `https://wa.me/?text=${encodeURIComponent(fullText)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const triggerSync = async () => {
    setIsSyncing(true);
    setSyncBanner(null);
    try {
      const res = await syncWithCloud();
      setSyncBanner({ ok: res.ok, text: res.message });
      await loadDueReceipts();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSupabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sbUrl.trim() || !sbKey.trim()) return;
    saveRuntimeSupabaseConfig(sbUrl, sbKey);
    setShowDbConfig(false);
    await triggerSync();
  };

  const handleDownloadBackup = async () => {
    if (!activeBusiness || !currentDb) return;
    await CloudSyncService.exportFullBackupJSON(activeBusiness, currentDb);
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeBusiness || !currentDb) return;
    try {
      const res = await CloudSyncService.restoreFullBackupJSON(file, activeBusiness, currentDb);
      setSyncBanner({
        ok: true,
        text: `Restored ${res.restoredRecords} records from backup file.`,
      });
      await loadDueReceipts();
    } catch (err: any) {
      setSyncBanner({
        ok: false,
        text: err?.message || 'Failed to restore backup JSON.',
      });
    } finally {
      if (restoreInputRef.current) restoreInputRef.current.value = '';
    }
  };

  const configured = isSupabaseConfigured();
  const totalDueSum = dueReceipts.reduce((sum, r) => sum + r.balanceDue, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-emerald-600" />
            {t('whatsapp.title')} & Cloud Database Sync
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Event-driven Supabase sync, 1-click WhatsApp payment reminders & smart store bot
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void handleDownloadBackup()}
            className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
            Download Backup (.json)
          </button>

          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
            Restore Backup
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handleRestoreBackup(e)}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => void triggerSync()}
            disabled={isSyncing}
            className={`inline-flex items-center px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
              isSyncing
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : t('whatsapp.syncNowBtn')}
          </button>
        </div>
      </div>

      {syncBanner && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
            syncBanner.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {syncBanner.ok ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          )}
          <span>{syncBanner.text}</span>
        </div>
      )}

      {/* Supabase Cloud PostgreSQL Connection Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                Supabase PostgreSQL Cloud Sync
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                    configured
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {configured ? 'Connected' : 'Setup Needed'}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Prevents data loss from browser cache clears & syncs live across multiple devices
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDbConfig((v) => !v)}
            className="text-xs font-semibold text-indigo-600 hover:underline"
          >
            {showDbConfig ? 'Hide Keys' : 'Configure Supabase Keys'}
          </button>
        </div>

        {showDbConfig && (
          <form
            onSubmit={(e) => void handleSaveSupabaseConfig(e)}
            className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-100"
          >
            <div className="md:col-span-5">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Supabase Project URL
              </label>
              <input
                type="url"
                required
                value={sbUrl}
                onChange={(e) => setSbUrl(e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="md:col-span-5">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Supabase Anon Public Key
              </label>
              <input
                type="password"
                required
                value={sbKey}
                onChange={(e) => setSbKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="md:col-span-2 flex items-end">
              <button
                type="submit"
                className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
              >
                <Cloud className="w-3.5 h-3.5" /> Connect & Sync
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Status, Clickable Commands, & 1-Click Payment Reminders */}
        <div className="lg:col-span-5 space-y-4">
          {/* Bot & Event-Driven Sync Status */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b pb-2">
              Bot & Sync Status
            </h2>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Bot Engine:</span>
                <span className="flex items-center gap-1.5 font-bold text-emerald-600">
                  <Zap className="w-3 h-3 fill-emerald-600" /> Active (Variant-Aware)
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Cloud Database:</span>
                <span className={`font-bold ${configured ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {configured ? 'PostgreSQL Ready' : 'Local Only'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Last Cloud Sync:</span>
                <span className="font-bold text-slate-700">{lastSyncTime}</span>
              </div>
            </div>

            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-[11px] text-indigo-800 leading-relaxed">
              <Info className="w-3.5 h-3.5 mb-1 text-indigo-600 inline mr-1" />
              <strong>Smart Debounced Sync:</strong> Changes auto-upload <strong>12 seconds</strong> after your last edit (and flush immediately if you switch tabs or close the window).
            </div>
          </div>

          {/* 1-Click Customer Payment Reminders ("Udhaar / Balance Due") */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <BellRing className="w-3.5 h-3.5 text-rose-600" />
                Pending Customer Dues ({dueReceipts.length})
              </h2>
              <span className="text-xs font-black text-rose-600">
                {formatCurrency(totalDueSum, currency)}
              </span>
            </div>

            {dueReceipts.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                🎉 All customer bills are settled! No pending dues.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
                {dueReceipts.map((r) => (
                  <div
                    key={r.id}
                    className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {r.customerName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        <span className="font-mono text-indigo-600 font-semibold">{r.id}</span>
                        {' • '}Due:{' '}
                        <strong className="text-rose-600">
                          {formatCurrency(r.balanceDue, currency)}
                        </strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSendPaymentReminder(r)}
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs transition"
                      title="Send itemized WhatsApp payment reminder"
                    >
                      <Share2 className="w-3 h-3" /> Remind
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Interactive Sample Commands (Click to Run) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
              <span>Interactive Commands</span>
              <span className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Click to run
              </span>
            </h2>
            <div className="space-y-1.5">
              {[
                { cmd: 'full stock', desc: 'Complete inventory & variants' },
                { cmd: 'low stock', desc: 'Restock order list for suppliers' },
                { cmd: 'today', desc: "Today's sales & UPI/Cash summary" },
                { cmd: 'dues', desc: 'All pending customer balances' },
                { cmd: 'pay REC-2026-0001 500 upi', desc: 'Log quick deposit on a bill' },
              ].map((item) => (
                <button
                  key={item.cmd}
                  type="button"
                  onClick={() => void executeBotCommand(item.cmd)}
                  className="w-full p-2 bg-slate-50 hover:bg-indigo-50/70 rounded-lg border border-slate-100 hover:border-indigo-200 text-[11px] flex items-center justify-between transition text-left"
                >
                  <code className="text-indigo-600 font-bold">"{item.cmd}"</code>
                  <span className="text-slate-500">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Simulator Chat Window */}
        <div className="lg:col-span-7 bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[640px] border-8 border-slate-800">
          <div className="bg-slate-800 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">Smart POS Bot</div>
                <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{' '}
                  online • Variant & Payment Ready
                </div>
              </div>
            </div>
            <ShieldCheck className="w-5 h-5 text-slate-500" />
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0b141a]">
            {chatLog.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] p-3.5 rounded-2xl text-xs whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-emerald-700 text-white rounded-tr-none'
                      : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                  }`}
                >
                  {msg.text}

                  <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center justify-between gap-3">
                    {msg.role === 'bot' ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleShareBotReplyWhatsApp(msg.text)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition"
                          title="Forward this report to WhatsApp"
                        >
                          <Share2 className="w-3 h-3" /> Forward to WhatsApp
                        </button>
                        <span className="text-slate-600">•</span>
                        <button
                          type="button"
                          onClick={() => void handleCopyBotReply(msg.text, idx)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-300 hover:text-white transition"
                          title="Copy reply text"
                        >
                          {copiedIdx === idx ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <span />
                    )}
                    <span
                      className={`text-[9px] ${
                        msg.role === 'user' ? 'text-emerald-200' : 'text-slate-400'
                      }`}
                    >
                      {msg.time}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Quick-Action Chip Bar */}
          <div className="bg-slate-800/95 px-3 pt-2.5 pb-1 flex items-center gap-1.5 overflow-x-auto border-t border-slate-700/80">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip.cmd}
                type="button"
                onClick={() => void executeBotCommand(chip.cmd)}
                className="shrink-0 px-2.5 py-1 rounded-full bg-slate-700 hover:bg-emerald-600 text-slate-100 hover:text-white text-[11px] font-semibold transition"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form onSubmit={(e) => void handleSendMessage(e)} className="bg-slate-800 p-3 flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask stock, serial, shelf, or type 'pay REC-2026-0001 500 upi'..."
              className="flex-1 bg-slate-700 border-none rounded-xl px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <button
              type="submit"
              className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white hover:bg-emerald-700 transition shrink-0"
              title="Send command"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
