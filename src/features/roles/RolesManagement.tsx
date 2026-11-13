import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store/useAppStore';
import type { AppUser, PermissionKey, RoleDefinition } from '../../types';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  UserCheck,
  Trash2,
  Lock,
  ShieldAlert,
  Plus,
  KeyRound,
  CheckSquare,
  Square,
  Edit3,
  X,
  Eye,
  EyeOff,
  Save,
  Share2,
  MessageCircle,
  Copy,
  Check,
  Phone,
} from 'lucide-react';

interface PermissionMeta {
  key: PermissionKey;
  label: string;
  description: string;
  group: 'Sales & Billing' | 'Inventory & Costs' | 'Admin & Remote';
}

const PERMISSION_CATALOG: PermissionMeta[] = [
  {
    key: 'view_dashboard',
    label: 'View Sales Dashboard',
    description: 'See open bills, receivable totals, and pending balances',
    group: 'Sales & Billing',
  },
  {
    key: 'create_receipt',
    label: 'Create New Receipts',
    description: 'Create bills, add line items, and record customer payments',
    group: 'Sales & Billing',
  },
  {
    key: 'edit_receipt',
    label: 'Edit Open Receipts',
    description: 'Modify items, discounts, or payments on existing orders',
    group: 'Sales & Billing',
  },
  {
    key: 'delete_receipt',
    label: 'Delete / Cancel Receipts',
    description: 'Permanently delete or cancel saved receipts',
    group: 'Sales & Billing',
  },
  {
    key: 'view_history',
    label: 'Order History & Exports',
    description: 'Search past orders, print invoices, share on WhatsApp, export CSV/PDF',
    group: 'Sales & Billing',
  },
  {
    key: 'view_stock',
    label: 'View Stock & Shelves',
    description: 'Browse product catalog, shelf locations, and available quantities',
    group: 'Inventory & Costs',
  },
  {
    key: 'edit_stock',
    label: 'Add / Edit / Restock Items',
    description: 'Create items, manage categories, edit variants, and add restock batches',
    group: 'Inventory & Costs',
  },
  {
    key: 'view_cost_price',
    label: 'View Purchase / Cost Prices',
    description: 'Unlock weighted average purchase cost and batch audit history',
    group: 'Inventory & Costs',
  },
  {
    key: 'remote_whatsapp',
    label: 'WhatsApp Assistant & Cloud Sync',
    description: 'Use the remote WhatsApp command bot and trigger cloud backups',
    group: 'Admin & Remote',
  },
  {
    key: 'manage_roles',
    label: 'Manage Roles & Staff Credentials',
    description: 'Create roles, change permissions, and issue/reset staff logins',
    group: 'Admin & Remote',
  },
];

export const RolesManagement: React.FC = () => {
  const { t } = useTranslation();
  const {
    users,
    roles,
    activeBusiness,
    loadUsers,
    loadRoles,
    currentUser,
    canAccess,
    createRoleDefinition,
    updateRolePermissions,
    deleteRoleDefinition,
    createStaffUser,
    updateStaffUser,
    deleteUserRole,
  } = useAppStore();

  const [activeSubTab, setActiveSubTab] = useState<'staff' | 'roles'>('staff');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('cashier');

  // Create Staff Credentials State
  const [staffFullName, setStaffFullName] = useState('');
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffPin, setStaffPin] = useState('');
  const [staffRole, setStaffRole] = useState('cashier');
  const [showNewPass, setShowNewPass] = useState(false);

  // Edit Staff / Admin Modal State
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editActive, setEditActive] = useState(true);

  // Share Credentials Modal State
  const [sharingUser, setSharingUser] = useState<AppUser | null>(null);
  const [shareRecipientPhone, setShareRecipientPhone] = useState('');
  const [revealPasswordInPreview, setRevealPasswordInPreview] = useState(true);
  const [credCopied, setCredCopied] = useState(false);

  // Create New Custom Role Modal State
  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRolePerms, setNewRolePerms] = useState<PermissionKey[]>([
    'view_stock',
    'create_receipt',
  ]);

  // Editing Role Permissions Draft State
  const [draftPermissions, setDraftPermissions] = useState<PermissionKey[]>([]);
  const [draftRoleName, setDraftRoleName] = useState('');
  const [draftRoleDesc, setDraftRoleDesc] = useState('');
  const [roleSavedBanner, setRoleSavedBanner] = useState(false);

  const canManage = currentUser?.role === 'admin' || canAccess('manage_roles');

  useEffect(() => {
    void loadUsers();
    void loadRoles();
  }, [loadUsers, loadRoles]);

  useEffect(() => {
    if (roles.length > 0 && !roles.some((r) => r.id === selectedRoleId)) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  const activeRoleObj: RoleDefinition | undefined = roles.find((r) => r.id === selectedRoleId);

  useEffect(() => {
    if (activeRoleObj) {
      setDraftPermissions([...activeRoleObj.permissions]);
      setDraftRoleName(activeRoleObj.name);
      setDraftRoleDesc(activeRoleObj.description || '');
      setRoleSavedBanner(false);
    }
  }, [activeRoleObj]);

  const getRoleName = (roleId: string) => {
    return roles.find((r) => r.id === roleId)?.name || roleId;
  };

  // Resolve display phone for user (falls back to activeBusiness.phone for primary admin if not set yet)
  const getUserPhone = (user: AppUser) => {
    if (user.phone) return user.phone;
    if (user.id === 'usr-admin' && activeBusiness?.phone) return activeBusiness.phone;
    return '';
  };

  const getUserEmail = (user: AppUser) => {
    if (user.email) return user.email;
    if (user.id === 'usr-admin' && activeBusiness?.email) return activeBusiness.email;
    return '';
  };

  // ------------------------------------------------------------------
  // Share Credentials Helpers
  // ------------------------------------------------------------------
  const openShareCredentialsModal = (user: AppUser) => {
    setSharingUser(user);
    setShareRecipientPhone(getUserPhone(user));
    setRevealPasswordInPreview(true);
    setCredCopied(false);
  };

  const buildCredentialsShareMessage = (user: AppUser, showSecrets: boolean) => {
    const bizName = activeBusiness?.name || 'Smart POS';
    const roleLabel = getRoleName(user.role);
    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const passText = user.password
      ? showSecrets
        ? user.password
        : '••••••••'
      : 'Not set';
    const pinText = user.pinCode
      ? showSecrets
        ? user.pinCode
        : '••••'
      : 'Not set';

    return (
      `🔐 *${bizName} — Staff Login Credentials*

` +
      `👤 *Staff Name:* ${user.fullName}
` +
      `🛡️ *Role:* ${roleLabel}
` +
      `🏢 *Business:* ${bizName}
` +
      `────────────────────
` +
      `🆔 *Username:* \`${user.username}\`
` +
      `🔑 *Password:* \`${passText}\`
` +
      `🔢 *Quick PIN:* \`${pinText}\`
` +
      `────────────────────
` +
      (appUrl ? `🌐 *POS Link:* ${appUrl}
` : '') +
      `⚠️ _Please keep these login details private._`
    );
  };

  const handleCopyCredentials = async () => {
    if (!sharingUser) return;
    const msg = buildCredentialsShareMessage(sharingUser, true);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(msg);
      } else {
        const ta = document.createElement('textarea');
        ta.value = msg;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCredCopied(true);
      setTimeout(() => setCredCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy credentials', err);
      alert('Unable to copy credentials to clipboard.');
    }
  };

  const handleSendCredentialsWhatsApp = () => {
    if (!sharingUser) return;
    const msg = buildCredentialsShareMessage(sharingUser, true);
    const digits = shareRecipientPhone.replace(/\D/g, '');
    const waPhone =
      digits.length === 10
        ? `91${digits}`
        : digits.length === 12 && digits.startsWith('91')
        ? digits
        : digits;
    const baseUrl = waPhone ? `https://wa.me/${waPhone}` : 'https://wa.me/';
    window.open(`${baseUrl}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  // ------------------------------------------------------------------
  // Staff Credential Handlers
  // ------------------------------------------------------------------
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      const created = await createStaffUser({
        fullName: staffFullName,
        username: staffUsername,
        phone: staffPhone,
        email: staffEmail,
        password: staffPassword,
        pinCode: staffPin,
        role: staffRole,
      });
      setStaffFullName('');
      setStaffUsername('');
      setStaffPhone('');
      setStaffEmail('');
      setStaffPassword('');
      setStaffPin('');
      setStaffRole(roles.find((r) => r.id !== 'admin')?.id || 'cashier');

      if (created) {
        openShareCredentialsModal(created);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to create staff credentials.');
    }
  };

  const openEditStaffModal = (user: AppUser) => {
    setEditingUser(user);
    setEditFullName(user.fullName);
    setEditUsername(user.username);
    setEditPhone(getUserPhone(user));
    setEditEmail(getUserEmail(user));
    setEditPassword('');
    setEditPin(user.pinCode || '');
    setEditRole(user.role);
    setEditActive(user.isActive !== false);
  };

  const handleSaveStaffEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !canManage) return;
    try {
      await updateStaffUser(editingUser.id, {
        fullName: editFullName,
        username: editUsername,
        phone: editPhone,
        email: editEmail,
        ...(editPassword.trim() ? { password: editPassword } : {}),
        pinCode: editPin,
        role: editRole,
        isActive: editActive,
      });
      setEditingUser(null);
    } catch (err: any) {
      alert(err?.message || 'Failed to update staff account.');
    }
  };

  const handleDeleteUser = async (userId: string, fullName: string) => {
    if (!canManage) return;
    if (!window.confirm(`Remove staff member "${fullName}" and revoke their login credentials?`)) {
      return;
    }
    try {
      await deleteUserRole(userId);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete staff user.');
    }
  };

  // ------------------------------------------------------------------
  // Role & Permission Matrix Handlers
  // ------------------------------------------------------------------
  const toggleDraftPermission = (perm: PermissionKey) => {
    if (selectedRoleId === 'admin') return;
    setRoleSavedBanner(false);
    setDraftPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleSaveRolePermissions = async () => {
    if (!activeRoleObj || !canManage) return;
    try {
      await updateRolePermissions(
        activeRoleObj.id,
        draftPermissions,
        draftRoleName,
        draftRoleDesc
      );
      setRoleSavedBanner(true);
      setTimeout(() => setRoleSavedBanner(false), 2500);
    } catch (err: any) {
      alert(err?.message || 'Failed to save role permissions.');
    }
  };

  const handleCreateCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      const created = await createRoleDefinition(newRoleName, newRoleDesc, newRolePerms);
      setShowCreateRoleModal(false);
      setNewRoleName('');
      setNewRoleDesc('');
      setNewRolePerms(['view_stock', 'create_receipt']);
      if (created) {
        setSelectedRoleId(created.id);
        setStaffRole(created.id);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to create role.');
    }
  };

  const handleDeleteCustomRole = async (role: RoleDefinition) => {
    if (!canManage || role.isSystem || role.id === 'admin') return;
    if (!window.confirm(`Delete custom role "${role.name}"?`)) return;
    try {
      await deleteRoleDefinition(role.id);
      setSelectedRoleId('admin');
    } catch (err: any) {
      alert(err?.message || 'Failed to delete role.');
    }
  };

  const getRoleBadgeStyle = (roleId: string) => {
    if (roleId === 'admin') return 'bg-rose-100 text-rose-700 border-rose-200';
    if (roleId === 'manager') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (roleId === 'cashier') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    return 'bg-amber-100 text-amber-800 border-amber-200';
  };

  const getRoleIcon = (roleId: string) => {
    if (roleId === 'admin') return <ShieldCheck className="w-4 h-4 text-rose-600" />;
    if (roleId === 'manager') return <Shield className="w-4 h-4 text-indigo-600" />;
    return <UserCheck className="w-4 h-4 text-emerald-600" />;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header & Sub-Navigation */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            {t('roles.title', 'Roles & Staff Credentials')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Create custom roles, control feature permissions, and share or reset staff & admin credentials
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('staff')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeSubTab === 'staff'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            Staff & Admin ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('roles')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeSubTab === 'roles'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Roles & Feature Permissions ({roles.length})
          </button>
        </div>
      </div>

      {!canManage && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-3 text-rose-800 text-xs">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <strong>Restricted Access:</strong> Only administrators can create roles, modify feature permissions, or issue staff credentials.
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 1: STAFF & ADMIN CREDENTIALS + ROLE ASSIGNMENT                  */}
      {/* =================================================================== */}
      {activeSubTab === 'staff' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Create Staff Credentials Form */}
          {canManage && (
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b pb-2 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-indigo-600" /> Issue New Staff / Admin Login
                </h2>

                <form onSubmit={handleCreateStaff} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={staffFullName}
                      onChange={(e) => {
                        setStaffFullName(e.target.value);
                        if (!staffUsername) {
                          setStaffUsername(
                            e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
                          );
                        }
                      }}
                      placeholder="e.g. Rajesh Verma"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Login Username *
                      </label>
                      <input
                        type="text"
                        required
                        value={staffUsername}
                        onChange={(e) => setStaffUsername(e.target.value)}
                        placeholder="e.g. rajesh_pos"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Mobile Number
                      </label>
                      <input
                        type="tel"
                        value={staffPhone}
                        onChange={(e) => setStaffPhone(e.target.value)}
                        placeholder="e.g. 9876543210"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email ID (Optional)
                    </label>
                    <input
                      type="email"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      placeholder="e.g. staff@store.com"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Password *
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPass ? 'text' : 'password'}
                          required
                          value={staffPassword}
                          onChange={(e) => setStaffPassword(e.target.value)}
                          placeholder="Password"
                          className="w-full px-3 py-2 pr-8 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPass(!showNewPass)}
                          className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                        >
                          {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Quick PIN (Optional)
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={staffPin}
                        onChange={(e) => setStaffPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="e.g. 4545"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Assign Role *
                      </label>
                      <button
                        type="button"
                        onClick={() => setActiveSubTab('roles')}
                        className="text-[11px] font-semibold text-indigo-600 hover:underline"
                      >
                        + Configure Roles
                      </button>
                    </div>
                    <select
                      aria-label="Assign Role"
                      value={staffRole}
                      onChange={(e) => setStaffRole(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium bg-white"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.permissions.length} permissions)
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5"
                  >
                    <UserPlus className="w-4 h-4" /> Create & Share Credentials
                  </button>
                </form>
              </div>

              <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 space-y-1.5">
                <h3 className="text-[11px] font-bold text-indigo-900 uppercase flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-indigo-600" /> Admin & Staff Recovery
                </h3>
                <p className="text-[11px] text-indigo-800 leading-relaxed">
                  Keep your <strong>Administrator Email ID</strong> updated here. If an admin forgets their password, the Login screen will send their credentials only to that registered email inbox.
                </p>
              </div>
            </div>
          )}

          {/* Registered Staff & Admin Accounts Table */}
          <div className={`${canManage ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden`}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                Accounts & Credentials ({users.length})
              </h2>
              <span className="text-[11px] text-slate-400">
                Click Edit to update phone, password, or PIN
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Username</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Assigned Role</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    {canManage && <th className="py-3 px-4 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => {
                    const isSuspended = user.isActive === false;
                    const displayPhone = getUserPhone(user);
                    return (
                      <tr key={user.id} className={`hover:bg-slate-50 transition ${isSuspended ? 'opacity-60 bg-slate-50' : ''}`}>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                user.role === 'admin'
                                  ? 'bg-rose-100 text-rose-700'
                                  : user.role === 'manager'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {user.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                {user.fullName}
                                {user.id === currentUser?.id && (
                                  <span className="text-[10px] bg-indigo-600 text-white px-1.5 rounded-full font-normal">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Added {new Date(user.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                          {user.username}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {displayPhone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {displayPhone}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${getRoleBadgeStyle(
                              user.role
                            )}`}
                          >
                            {getRoleIcon(user.role)}
                            {getRoleName(user.role)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              isSuspended
                                ? 'bg-slate-200 text-slate-600'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isSuspended ? 'Disabled' : 'Active'}
                          </span>
                        </td>

                        {canManage && (
                          <td className="py-3.5 px-4 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openShareCredentialsModal(user)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold transition whitespace-nowrap"
                                title="Share username/password/PIN on WhatsApp"
                              >
                                <Share2 className="w-3 h-3" /> Share
                              </button>

                              <button
                                type="button"
                                onClick={() => openEditStaffModal(user)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold transition whitespace-nowrap"
                                title="Edit phone, credentials, or role"
                              >
                                <Edit3 className="w-3 h-3" /> Edit
                              </button>

                              {user.id !== 'usr-admin' && user.id !== currentUser?.id && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteUser(user.id, user.fullName)}
                                  aria-label="Delete User"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                  title="Delete User"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: CUSTOM ROLES & FEATURE PERMISSIONS MATRIX                    */}
      {/* =================================================================== */}
      {activeSubTab === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Role Selector List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b pb-2.5 border-slate-100">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Business Roles
                </h2>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setShowCreateRoleModal(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> New Role
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {roles.map((r) => {
                  const isSelected = r.id === selectedRoleId;
                  const memberCount = users.filter((u) => u.role === r.id).length;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRoleId(r.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                        isSelected
                          ? 'bg-indigo-50/80 border-indigo-500 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-sm text-slate-900">
                          {getRoleIcon(r.id)}
                          <span>{r.name}</span>
                          {r.isSystem && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-rose-100 text-rose-700 rounded font-semibold">
                              System
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {r.permissions.length} / {PERMISSION_CATALOG.length} features • {memberCount} staff
                        </div>
                      </div>

                      {canManage && !r.isSystem && r.id !== 'admin' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteCustomRole(r);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Delete role"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Feature Permissions Matrix */}
          <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            {activeRoleObj ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4 border-slate-100">
                  <div className="space-y-1 flex-1">
                    {activeRoleObj.id === 'admin' || !canManage ? (
                      <>
                        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                          {activeRoleObj.name}
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                            Full Access Locked
                          </span>
                        </h3>
                        <p className="text-xs text-slate-500">
                          {activeRoleObj.description || 'System administrator has access to every feature.'}
                        </p>
                      </>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Role Title
                          </label>
                          <input
                            type="text"
                            value={draftRoleName}
                            onChange={(e) => setDraftRoleName(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            value={draftRoleDesc}
                            onChange={(e) => setDraftRoleDesc(e.target.value)}
                            placeholder="Short role summary..."
                            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {canManage && activeRoleObj.id !== 'admin' && (
                    <button
                      type="button"
                      onClick={() => void handleSaveRolePermissions()}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition shrink-0"
                    >
                      <Save className="w-4 h-4" />
                      {roleSavedBanner ? '✓ Permissions Saved' : 'Save Permissions'}
                    </button>
                  )}
                </div>

                {/* Grouped Checkboxes */}
                {(['Sales & Billing', 'Inventory & Costs', 'Admin & Remote'] as const).map(
                  (groupName) => {
                    const groupPerms = PERMISSION_CATALOG.filter((p) => p.group === groupName);
                    return (
                      <div key={groupName} className="space-y-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          {groupName}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {groupPerms.map((perm) => {
                            const checked =
                              activeRoleObj.id === 'admin' ||
                              draftPermissions.includes(perm.key);
                            const disabled = activeRoleObj.id === 'admin' || !canManage;

                            return (
                              <button
                                key={perm.key}
                                type="button"
                                disabled={disabled}
                                onClick={() => toggleDraftPermission(perm.key)}
                                className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${
                                  checked
                                    ? 'bg-indigo-50/60 border-indigo-200'
                                    : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/70'
                                } ${disabled ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                              >
                                <div className="mt-0.5 text-indigo-600 shrink-0">
                                  {checked ? (
                                    <CheckSquare className="w-4 h-4" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-400" />
                                  )}
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-slate-900">
                                    {perm.label}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                    {perm.description}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                )}
              </>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                Select a role on the left to configure its permissions.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: SHARE STAFF / ADMIN CREDENTIALS                              */}
      {/* =================================================================== */}
      {sharingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div>
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-emerald-600" />
                  Share Login Credentials
                </h3>
                <p className="text-xs text-slate-500">
                  Send login details to <strong>{sharingUser.fullName}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSharingUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Recipient WhatsApp Number
                </label>
                <input
                  type="tel"
                  value={shareRecipientPhone}
                  onChange={(e) => setShareRecipientPhone(e.target.value)}
                  placeholder="e.g. 9876543210 (or leave blank to pick)"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                type="button"
                onClick={() => setRevealPasswordInPreview((v) => !v)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 shrink-0"
              >
                {revealPasswordInPreview ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" /> Mask Preview
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" /> Show Password
                  </>
                )}
              </button>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Message Preview
              </p>
              <pre className="whitespace-pre-wrap text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3.5 font-mono">
                {buildCredentialsShareMessage(sharingUser, revealPasswordInPreview)}
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleCopyCredentials()}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5"
              >
                {credCopied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> Copy Credentials
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleSendCredentialsWhatsApp}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-xs"
              >
                <MessageCircle className="w-4 h-4" /> Send on WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setSharingUser(null)}
                className="sm:w-24 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: CREATE NEW CUSTOM ROLE                                       */}
      {/* =================================================================== */}
      {showCreateRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCreateCustomRole}
            className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                Create Custom Role
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateRoleModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Role Name *
                </label>
                <input
                  type="text"
                  required
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Warehouse Keeper"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  placeholder="e.g. Stock entry only, no billing"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Select Allowed Features for This Role
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1">
                {PERMISSION_CATALOG.map((perm) => {
                  const checked = newRolePerms.includes(perm.key);
                  return (
                    <button
                      key={perm.key}
                      type="button"
                      onClick={() =>
                        setNewRolePerms((prev) =>
                          prev.includes(perm.key)
                            ? prev.filter((p) => p !== perm.key)
                            : [...prev, perm.key]
                        )
                      }
                      className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition ${
                        checked
                          ? 'bg-indigo-50 border-indigo-300'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {checked ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="text-xs font-bold text-slate-900">{perm.label}</div>
                        <div className="text-[10px] text-slate-500">{perm.group}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateRoleModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs"
              >
                Create Role
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: EDIT STAFF / ADMIN CREDENTIALS, PHONE & ASSIGNED ROLE        */}
      {/* =================================================================== */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveStaffEdit}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4"
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-indigo-600" />
                Edit Account & Credentials
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Login Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email ID {editingUser.role === 'admin' ? '(Used for Admin Credential Recovery)' : '(Optional)'}
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="e.g. owner@anchalfurniture.com"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Leave blank to keep"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Quick PIN
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={editPin}
                    onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 1234"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Role
                </label>
                <select
                  value={editRole}
                  disabled={editingUser.id === 'usr-admin'}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-slate-100"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {editingUser.id !== 'usr-admin' && (
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                  />
                  Account Active (Uncheck to suspend login without deleting)
                </label>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white shadow-xs"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
