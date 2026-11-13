import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  Building2,
  LogIn,
  UserPlus,
  Store,
  Lock,
  User,
  HelpCircle,
  PhoneCall,
  Mail,
  CheckCircle2,
} from 'lucide-react';

export const Login: React.FC = () => {
  const { businesses, login, registerBusiness, emailAdminCredentials } = useAppStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login state
  const [selectedBizId, setSelectedBizId] = useState(businesses[0]?.id || '');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showForgotHelp, setShowForgotHelp] = useState(false);

  // Admin Email Recovery state
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatusMsg, setEmailStatusMsg] = useState('');
  const [emailErrorMsg, setEmailErrorMsg] = useState('');

  // Register state
  const [bizName, setBizName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [bizType, setBizType] = useState<'retail' | 'grocery' | 'pharmacy' | 'restaurant' | 'other'>('retail');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [regError, setRegError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const isDev = Boolean((import.meta as any)?.env?.DEV);
  const activeBizId = selectedBizId || businesses[0]?.id || '';
  const selectedBiz = businesses.find((b) => b.id === activeBizId);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!activeBizId) {
      setLoginError('Please select or register a business first.');
      return;
    }
    const success = await login(activeBizId, username, password);
    if (!success) {
      setLoginError(
        'Invalid username or password/PIN. Staff can ask their admin to share credentials; admins can email credentials to their registered email ID.'
      );
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (
      !bizName.trim() ||
      !ownerName.trim() ||
      !phone.trim() ||
      !adminEmail.trim() ||
      !adminUsername.trim() ||
      !adminPass.trim()
    ) {
      setRegError('Please fill all required fields (including admin email, username, and password).');
      return;
    }
    setIsRegistering(true);
    try {
      const usernameToUse = adminUsername.trim();
      const passwordToUse = adminPass.trim();
      const newBiz = await registerBusiness(
        bizName.trim(),
        ownerName.trim(),
        phone.trim(),
        bizType,
        'INR',
        usernameToUse,
        passwordToUse,
        adminEmail.trim()
      );
      const success = await login(newBiz.id, usernameToUse, passwordToUse);
      if (!success) {
        setRegError('Business created but auto-login failed. Please login manually.');
      }
    } catch (err) {
      console.error(err);
      setRegError('Failed to register business. Please try again.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleRequestCredentialsWhatsApp = () => {
    if (!selectedBiz) return;
    const digits = (selectedBiz.phone || '').replace(/\D/g, '');
    const waPhone = digits.length === 10 ? `91${digits}` : digits;
    const msg =
      `Hi ${selectedBiz.ownerName || 'Admin'}, I forgot my login credentials for *${selectedBiz.name}* on Smart POS` +
      (username.trim() ? ` (Username: ${username.trim()})` : '') +
      `. Please share or reset my login details.`;
    const baseUrl = waPhone ? `https://wa.me/${waPhone}` : 'https://wa.me/';
    window.open(`${baseUrl}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  const handleEmailAdminCredentials = async () => {
    if (!activeBizId) return;
    setEmailStatusMsg('');
    setEmailErrorMsg('');
    setIsSendingEmail(true);
    try {
      const res = await emailAdminCredentials(activeBizId, username);
      if (!res.ok) {
        setEmailErrorMsg(res.error || 'Unable to send recovery email.');
        return;
      }
      if (res.method === 'emailjs') {
        setEmailStatusMsg(
          `Admin credentials have been emailed to ${res.maskedEmail}. Check your inbox (and spam folder).`
        );
      } else {
        setEmailStatusMsg(
          `Opened your mail client pre-addressed to ${res.maskedEmail} with the admin credentials.`
        );
      }
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-indigo-600 p-6 text-white text-center">
          <div className="w-14 h-14 mx-auto rounded-xl bg-white/20 flex items-center justify-center mb-3">
            <Store className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Smart POS</h1>
          <p className="text-indigo-100 text-sm mt-1">Multi-Business Login</p>
        </div>

        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 ${mode === 'login' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <LogIn className="w-4 h-4" /> Login
          </button>
          <button
            onClick={() => setMode('register')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 ${mode === 'register' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <UserPlus className="w-4 h-4" /> Register Business
          </button>
        </div>

        <div className="p-6">
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Business</label>
                <div className="relative">
                  <Building2 className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <select
                    value={activeBizId}
                    onChange={(e) => {
                      setSelectedBizId(e.target.value);
                      setEmailStatusMsg('');
                      setEmailErrorMsg('');
                    }}
                    className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.ownerName})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter your username"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">Password or PIN</label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotHelp((v) => !v);
                      setEmailStatusMsg('');
                      setEmailErrorMsg('');
                    }}
                    className="text-[11px] font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1"
                  >
                    <HelpCircle className="w-3 h-3" /> Forgot credentials?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter password or PIN"
                  />
                </div>
              </div>

              {showForgotHelp && selectedBiz && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 space-y-2.5">
                  <div>
                    <p className="font-bold text-amber-900">1. Staff Member?</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Ask your store admin (<strong>{selectedBiz.ownerName}</strong>) to share or reset your login from <strong>Users & Roles</strong>.
                    </p>
                    {selectedBiz.phone && (
                      <button
                        type="button"
                        onClick={handleRequestCredentialsWhatsApp}
                        className="mt-2 w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition"
                      >
                        <PhoneCall className="w-3.5 h-3.5" /> Request Login via WhatsApp
                      </button>
                    )}
                  </div>

                  <div className="border-t border-amber-200/80 pt-2.5 space-y-2">
                    <div>
                      <p className="font-bold text-amber-900">2. Business Owner / Admin?</p>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Send the admin login credentials directly to the registered admin email inbox.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isSendingEmail}
                      onClick={() => void handleEmailAdminCredentials()}
                      className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {isSendingEmail ? 'Sending Email...' : 'Email Credentials to Admin Email ID'}
                    </button>

                    {emailStatusMsg && (
                      <div className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{emailStatusMsg}</span>
                      </div>
                    )}

                    {emailErrorMsg && (
                      <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                        {emailErrorMsg}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {loginError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{loginError}</div>
              )}

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" /> Login to Business
              </button>

              {isDev && (
                <p className="text-[11px] text-slate-500 text-center">
                  Demo defaults: admin / admin123 (or 1234), manager / manager123, cashier / cashier123
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Business Name *</label>
                <input
                  type="text"
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. ANCHAL FURNITURE"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Owner Name *</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Business Type</label>
                  <select
                    value={bizType}
                    onChange={(e) => setBizType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="retail">Retail</option>
                    <option value="grocery">Grocery</option>
                    <option value="pharmacy">Pharmacy</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Email ID (For Credential Recovery) *</label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. owner@anchalfurniture.com"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Username *</label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. anchal_admin"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Password *</label>
                  <input
                    type="password"
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    placeholder="Create password"
                    required
                  />
                </div>
              </div>

              {regError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{regError}</div>
              )}

              <button
                type="submit"
                disabled={isRegistering}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> {isRegistering ? 'Creating...' : 'Create Business & Login'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
