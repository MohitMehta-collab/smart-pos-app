import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { Business } from '../../types';
import {
  Store,
  LogIn,
  UserPlus,
  User,
  Lock,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  WifiOff,
  Cloud,
  Sparkles,
  HelpCircle,
  ArrowRight,
  KeyRound,
  X,
} from 'lucide-react';

export const Login: React.FC = () => {
  const {
    businesses,
    login,
    registerBusiness,
    emailAdminCredentials,
  } = useAppStore();

  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login State
  const [selectedBizId, setSelectedBizId] = useState<string>('');
  const [username, setUsername] = useState('admin');
  const [passwordOrPin, setPasswordOrPin] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Registration State
  const [bizName, setBizName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [bizType, setBizType] = useState<Business['businessType']>('retail');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);
  const [regError, setRegError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Credential Recovery Modal / State
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryHint, setRecoveryHint] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (businesses.length > 0 && !selectedBizId) {
      setSelectedBizId(businesses[0].id);
    }
  }, [businesses, selectedBizId]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!selectedBizId) {
      setLoginError('Please select a business to continue.');
      return;
    }
    if (!username.trim() || !passwordOrPin.trim()) {
      setLoginError('Please enter both username and password/PIN.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const ok = await login(selectedBizId, username, passwordOrPin);
      if (!ok) {
        setLoginError('Invalid username, password/PIN, or inactive account.');
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Login failed. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    if (!bizName.trim() || !ownerName.trim() || !phone.trim()) {
      setRegError('Business Name, Owner Name, and Phone are required.');
      return;
    }
    if (!adminEmail.trim() || !adminEmail.includes('@')) {
      setRegError('Please provide a valid Admin Email ID for credential recovery.');
      return;
    }
    if (!adminUser.trim() || !adminPass.trim()) {
      setRegError('Admin Username and Password are required.');
      return;
    }

    setIsRegistering(true);
    try {
      const created = await registerBusiness(
        bizName.trim(),
        ownerName.trim(),
        phone.trim(),
        bizType,
        'INR',
        adminUser.trim(),
        adminPass.trim(),
        adminEmail.trim()
      );
      setSelectedBizId(created.id);
      await login(created.id, adminUser.trim(), adminPass.trim());
    } catch (err: any) {
      setRegError(err?.message || 'Failed to register business.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleCredentialRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBizId) {
      setRecoveryResult({ ok: false, message: 'Please select a business first.' });
      return;
    }
    setRecoveryLoading(true);
    setRecoveryResult(null);
    try {
      const res = await emailAdminCredentials(selectedBizId, recoveryHint);
      if (res.ok) {
        setRecoveryResult({
          ok: true,
          message:
            res.method === 'emailjs'
              ? `Credentials sent to registered email (${res.maskedEmail}).`
              : `Opened your mail client addressed to ${res.maskedEmail}.`,
        });
      } else {
        setRecoveryResult({
          ok: false,
          message: res.error || 'Could not recover credentials.',
        });
      }
    } catch (err: any) {
      setRecoveryResult({
        ok: false,
        message: err?.message || 'Recovery failed.',
      });
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-6 lg:p-10 relative overflow-hidden">
      {/* Subtle Ambient Background Glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-600/20 blur-3xl" />

      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden grid grid-cols-1 lg:grid-cols-12 relative z-10">
        {/* Left Branding & Value Prop Panel */}
        <div className="lg:col-span-5 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 text-white p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden">
          <div className="pointer-events-none absolute -right-16 -bottom-16 w-64 h-64 rounded-full bg-white/5 blur-2xl" />

          <div>
            <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/15">
              <div className="w-9 h-9 rounded-xl bg-white text-indigo-600 flex items-center justify-center shadow-sm">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <span className="font-black text-base tracking-tight block leading-none">
                  Smart POS
                </span>
                <span className="text-[10px] text-indigo-200 font-semibold uppercase tracking-widest">
                  Enterprise Suite
                </span>
              </div>
            </div>

            <h1 className="mt-8 text-2xl sm:text-3xl font-black tracking-tight leading-tight">
               Fast, Offline-First Billing & Inventory Control.
            </h1>
            <p className="mt-3 text-xs sm:text-sm text-indigo-100/90 leading-relaxed">
              Manage multiple store locations, track variant-level stock and weighted costs, and share itemized WhatsApp invoices effortlessly.
            </p>

            <div className="mt-8 space-y-3.5">
              <div className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-2xl p-3.5">
                <WifiOff className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-bold text-white">100% Offline-Ready</h3>
                  <p className="text-[11px] text-indigo-100/80 mt-0.5">
                    Works seamlessly without internet using local IndexedDB storage.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-2xl p-3.5">
                <Cloud className="w-5 h-5 text-sky-300 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-bold text-white">Smart Cloud Sync</h3>
                  <p className="text-[11px] text-indigo-100/80 mt-0.5">
                    Automatically backs up receipts, stock batches, and staff roles across devices.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-2xl p-3.5">
                <ShieldCheck className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-bold text-white">Role-Based Access Control</h3>
                  <p className="text-[11px] text-indigo-100/80 mt-0.5">
                    Protect cost prices and sensitive reports with granular staff permissions.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-8 mt-8 border-t border-white/15 flex items-center justify-between text-[11px] text-indigo-200">
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Multi-Business Workspace
            </span>
            <span>v2.5 Pro</span>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center bg-white">
          {/* Segmented Mode Switcher */}
          <div className="bg-slate-100 p-1.5 rounded-2xl grid grid-cols-2 gap-1.5 mb-7 border border-slate-200/70">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setLoginError('');
              }}
              className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                mode === 'login'
                  ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LogIn className="w-4 h-4" />
              Login to Store
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setRegError('');
              }}
              className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                mode === 'register'
                  ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Register Business
            </button>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  Welcome back
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select your registered store workspace and sign in with your staff credentials.
                </p>
              </div>

              {loginError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{loginError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Select Business Workspace
                </label>
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500 focus-within:bg-white transition">
                  <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                  <select
                    aria-label="Select Business Workspace"
                    value={selectedBizId}
                    onChange={(e) => setSelectedBizId(e.target.value)}
                    className="w-full bg-transparent border-0 p-0 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-0 cursor-pointer"
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.ownerName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. admin or cashier_1"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Password or Quick PIN
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryResult(null);
                      setShowRecoveryModal(true);
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    Forgot credentials?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showLoginPass ? 'text' : 'password'}
                    required
                    value={passwordOrPin}
                    onChange={(e) => setPasswordOrPin(e.target.value)}
                    placeholder="Enter password or 4-6 digit PIN"
                    className="w-full pl-10 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPass(!showLoginPass)}
                    className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600"
                    title={showLoginPass ? 'Hide password' : 'Show password'}
                  >
                    {showLoginPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm shadow-md shadow-indigo-100 flex items-center justify-center gap-2 transition disabled:opacity-50 mt-2"
              >
                <LogIn className="w-4 h-4" />
                {isLoggingIn ? 'Signing in...' : 'Login to Business'}
                <ArrowRight className="w-4 h-4 ml-0.5" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  Create a New Business Workspace
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Set up your store profile and primary administrator account in seconds.
                </p>
              </div>

              {regError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{regError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Business / Store Name *
                  </label>
                  <div className="relative">
                    <Store className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={bizName}
                      onChange={(e) => setBizName(e.target.value)}
                      placeholder="e.g. Apex Retail Mart"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Owner Full Name *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="e.g. Rajesh Sharma"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phone Number *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Business Category
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500 focus-within:bg-white transition">
                    <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
                    <select
                      aria-label="Business Category"
                      value={bizType}
                      onChange={(e) => setBizType(e.target.value as Business['businessType'])}
                      className="w-full bg-transparent border-0 p-0 text-sm font-medium text-slate-800 focus:outline-none focus:ring-0 cursor-pointer"
                    >
                      <option value="retail">Retail & General Store</option>
                      <option value="grocery">Grocery & Supermarket</option>
                      <option value="pharmacy">Pharmacy & Medical</option>
                      <option value="restaurant">Restaurant & Cafe</option>
                      <option value="other">Hardware, Interior & Other</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Admin Email ID (For Credential Recovery) *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="e.g. admin@yourbusiness.com"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Admin Username *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={adminUser}
                      onChange={(e) => setAdminUser(e.target.value)}
                      placeholder="e.g. store_admin"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Admin Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type={showRegPass ? 'text' : 'password'}
                      required
                      value={adminPass}
                      onChange={(e) => setAdminPass(e.target.value)}
                      placeholder="Create strong password"
                      className="w-full pl-9 pr-9 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPass(!showRegPass)}
                      className="absolute right-2.5 top-2 p-0.5 text-slate-400 hover:text-slate-600"
                    >
                      {showRegPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isRegistering}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm shadow-md shadow-indigo-100 flex items-center justify-center gap-2 transition disabled:opacity-50 mt-2"
              >
                <UserPlus className="w-4 h-4" />
                {isRegistering ? 'Creating Workspace...' : 'Create Business & Login'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Credential Recovery Modal */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Admin Credential Recovery
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Send login details to the registered administrator email
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRecoveryModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCredentialRecovery} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Admin Username or Email Hint (Optional)
                </label>
                <input
                  type="text"
                  value={recoveryHint}
                  onChange={(e) => setRecoveryHint(e.target.value)}
                  placeholder="e.g. store_admin or admin@yourbusiness.com"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {recoveryResult && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2 ${
                    recoveryResult.ok
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {recoveryResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span>{recoveryResult.message}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRecoveryModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {recoveryLoading ? 'Sending...' : 'Recover Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
