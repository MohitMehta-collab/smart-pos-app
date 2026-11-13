import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import type { PermissionKey } from '../types';
import {
  Boxes,
  Receipt,
  LayoutDashboard,
  History,
  MessageSquare,
  Users,
  Wifi,
  WifiOff,
  Globe,
  RefreshCw,
  LogOut,
  Building2,
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { t, i18n } = useTranslation();
  const { isOnline, lastSyncTime, currentUser, roles, logout, activeBusiness, canAccess } =
    useAppStore();

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'en' ? 'hi' : 'en';
    i18n.changeLanguage(nextLang);
  };

  const navItems = useMemo(() => {
    const allNav: {
      id: string;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      permission: PermissionKey;
    }[] = [
      { id: 'stock', label: t('nav.stock'), icon: Boxes, permission: 'view_stock' },
      { id: 'receipt', label: t('nav.createReceipt'), icon: Receipt, permission: 'create_receipt' },
      { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, permission: 'view_dashboard' },
      { id: 'history', label: t('nav.orderHistory'), icon: History, permission: 'view_history' },
      { id: 'whatsapp', label: t('nav.whatsapp'), icon: MessageSquare, permission: 'remote_whatsapp' },
      { id: 'roles', label: t('nav.usersRoles'), icon: Users, permission: 'manage_roles' },
    ];

    return allNav.filter((item) => canAccess(item.permission));
  }, [t, canAccess, currentUser, roles]);

  const roleDisplayName = useMemo(() => {
    if (!currentUser) return '';
    const found = roles.find((r) => r.id === currentUser.role);
    return found ? found.name : currentUser.role;
  }, [currentUser, roles]);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Utility Row: Brand + Status + User */}
        <div className="flex items-center justify-between h-14 gap-3">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-800 flex items-center justify-center text-white shadow-sm font-bold text-lg shrink-0">
              ₹
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 tracking-tight text-base sm:text-lg whitespace-nowrap">
                  Smart<span className="text-indigo-600">POS</span>
                </span>
                <span className="hidden sm:inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100 whitespace-nowrap">
                  Offline-First
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden md:block truncate max-w-[220px]">
                {t('appName')}
              </p>
            </div>
          </div>

          {/* Right Status Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Sync & Connectivity indicator */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-[11px] text-slate-600 border border-slate-200 whitespace-nowrap">
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">{t('onlineMode')}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-amber-700 font-semibold">{t('offlineMode')}</span>
                </>
              )}
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 inline-flex items-center gap-1">
                <RefreshCw className="w-3 h-3 text-slate-400" />
                {lastSyncTime}
              </span>
            </div>

            {/* Language Switcher (EN / HI) */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition whitespace-nowrap shrink-0"
              title="Change Language / भाषा बदलें"
            >
              <Globe className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>{i18n.language === 'en' ? 'हिन्दी' : 'English'}</span>
            </button>

            {/* Current User Info, Role Badge & Logout */}
            <div className="flex items-center gap-2 border-l border-slate-200 pl-2.5 sm:pl-3 shrink-0">
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800 truncate max-w-[110px]">
                    {currentUser?.fullName || 'Guest'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-bold uppercase whitespace-nowrap">
                    {roleDisplayName}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 inline-flex items-center gap-1 truncate max-w-[160px]">
                  <Building2 className="w-3 h-3 shrink-0" />
                  <span className="truncate">{activeBusiness?.name || 'Business'}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={logout}
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Navigation Bar: Clean single-line pills that wrap gracefully without horizontal scrolling */}
        <nav
          aria-label="Primary Navigation"
          className="flex flex-wrap items-center gap-1.5 py-2 border-t border-slate-100"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50/70'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
