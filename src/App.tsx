import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Navbar } from './components/Navbar';
import { StockManagement } from './features/stock/StockManagement';
import { CreateReceipt } from './features/receipt/CreateReceipt';
import { SalesDashboard } from './features/dashboard/SalesDashboard';
import { OrderHistory } from './features/history/OrderHistory';
import { WhatsAppAssistant } from './features/whatsapp/WhatsAppAssistant';
import { RolesManagement } from './features/roles/RolesManagement';
import { Login } from './features/auth/Login';
import { useAppStore } from './store/useAppStore';
import type { PermissionKey } from './types';
import { AlertCircle, ShieldAlert } from 'lucide-react';

const TAB_PERMISSION_MAP: Record<string, PermissionKey> = {
  stock: 'view_stock',
  receipt: 'create_receipt',
  dashboard: 'view_dashboard',
  history: 'view_history',
  whatsapp: 'remote_whatsapp',
  roles: 'manage_roles',
};

function App() {
  const { t } = useTranslation();
  const {
    initRegistry,
    activeBusiness,
    currentUser,
    roles,
    isOnline,
    setIsOnline,
    syncWithCloud,
    canAccess,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState('stock');
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        await initRegistry();
      } catch (err) {
        console.error('Failed to initialize app', err);
      } finally {
        setIsInitializing(false);
      }
    }
    init();

    const handleOnline = () => {
      setIsOnline(true);
      void syncWithCloud();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const syncInterval = window.setInterval(() => {
      if (navigator.onLine) {
        void syncWithCloud();
      }
    }, 60000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(syncInterval);
    };
  }, [initRegistry, setIsOnline, syncWithCloud]);

  // Determine allowed tabs for current logged-in user
  const allowedTabs = useMemo(() => {
    if (!currentUser) return [];
    return Object.entries(TAB_PERMISSION_MAP)
      .filter(([, perm]) => canAccess(perm))
      .map(([tabId]) => tabId);
  }, [currentUser, roles, canAccess]);

  // Auto-redirect to first permitted tab if user logs in and current activeTab is restricted
  useEffect(() => {
    if (!currentUser || allowedTabs.length === 0) return;
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  }, [currentUser, allowedTabs, activeTab]);

  const handleEditReceipt = (id: string) => {
    if (!canAccess('edit_receipt') && !canAccess('create_receipt')) {
      alert('Your role does not have permission to edit receipts.');
      return;
    }
    setEditingReceiptId(id);
    setActiveTab('receipt');
  };

  const handleReceiptSaved = () => {
    setEditingReceiptId(null);
    if (canAccess('view_dashboard')) {
      setActiveTab('dashboard');
    } else if (allowedTabs.length > 0) {
      setActiveTab(allowedTabs[0]);
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600 font-bold animate-pulse">Smart POS is initializing...</p>
        </div>
      </div>
    );
  }

  if (!activeBusiness || !currentUser) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          const reqPerm = TAB_PERMISSION_MAP[tab];
          if (reqPerm && !canAccess(reqPerm)) return;
          setActiveTab(tab);
          if (tab !== 'receipt') setEditingReceiptId(null);
        }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {!isOnline && (
          <div className="mb-6 p-3 bg-amber-100 border border-amber-200 rounded-xl text-amber-800 text-xs font-bold flex items-center gap-2 lg:hidden">
            <AlertCircle className="w-4 h-4" />
            {t('offlineMode')} - All changes saved locally
          </div>
        )}

        {allowedTabs.length === 0 ? (
          <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center max-w-md mx-auto mt-10 space-y-3 shadow-xs">
            <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto" />
            <h2 className="text-lg font-bold text-slate-900">No Features Assigned</h2>
            <p className="text-xs text-slate-500">
              Your assigned role does not have access to any modules yet. Please contact your store administrator.
            </p>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            {activeTab === 'stock' && canAccess('view_stock') && <StockManagement />}
            {activeTab === 'receipt' && canAccess('create_receipt') && (
              <CreateReceipt
                editReceiptId={editingReceiptId}
                onReceiptSaved={handleReceiptSaved}
              />
            )}
            {activeTab === 'dashboard' && canAccess('view_dashboard') && (
              <SalesDashboard onEditReceipt={handleEditReceipt} />
            )}
            {activeTab === 'history' && canAccess('view_history') && (
              <OrderHistory onViewReceipt={handleEditReceipt} />
            )}
            {activeTab === 'whatsapp' && canAccess('remote_whatsapp') && <WhatsAppAssistant />}
            {activeTab === 'roles' && canAccess('manage_roles') && <RolesManagement />}
          </div>
        )}
      </main>

      <footer className="py-6 border-t border-slate-200 text-center">
        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">
          Smart POS & Inventory System • {new Date().getFullYear()} • Secure Offline Storage (IndexedDB)
        </p>
      </footer>
    </div>
  );
}

export default App;
