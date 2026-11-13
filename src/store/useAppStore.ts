import { create } from 'zustand';
import {
  getPOSDatabase,
  seedBusinessDataIfNeeded,
  POSDatabase,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_DEFINITIONS,
} from '../db';
import { registryDb } from '../db/businessRegistry';
import { CloudSyncService } from '../services/cloudSyncService';
import type { AppUser, Business, RoleDefinition, PermissionKey } from '../types';

export interface CreateStaffInput {
  fullName: string;
  username: string;
  phone?: string;
  email?: string;
  password: string;
  pinCode?: string;
  role: string;
}

export interface UpdateStaffInput {
  fullName?: string;
  username?: string;
  phone?: string;
  email?: string;
  password?: string;
  pinCode?: string;
  role?: string;
  isActive?: boolean;
}

interface AuthState {
  // Current active business & user session
  activeBusiness: Business | null;
  currentUser: AppUser | null;
  users: AppUser[];
  roles: RoleDefinition[];
  businesses: Business[];
  currentDb: POSDatabase | null;

  // General state
  currency: string;
  isOnline: boolean;
  lastSyncTime: string;

  // Actions
  initRegistry: () => Promise<void>;
  registerBusiness: (
    name: string,
    ownerName: string,
    phone: string,
    businessType: Business['businessType'],
    currency?: string,
    adminUsername?: string,
    adminPassword?: string,
    adminEmail?: string
  ) => Promise<Business>;

  login: (businessId: string, username: string, pinOrPassword?: string) => Promise<boolean>;
  logout: () => void;

  // Secure Admin Credential Recovery via Registered Admin Email
  emailAdminCredentials: (
    businessId: string,
    usernameOrEmailHint?: string
  ) => Promise<{ ok: boolean; maskedEmail?: string; method?: 'emailjs' | 'mailto'; error?: string }>;

  loadUsers: () => Promise<void>;
  loadRoles: () => Promise<void>;
  setCurrentUser: (user: AppUser) => void;
  setCurrency: (curr: string) => void;
  setIsOnline: (online: boolean) => void;
  updateLastSyncTime: (time: string) => void;
  syncWithCloud: () => Promise<{ ok: boolean; message: string }>;

  // Custom Role Management (Admin)
  createRoleDefinition: (name: string, description: string, permissions: PermissionKey[]) => Promise<RoleDefinition | null>;
  updateRolePermissions: (roleId: string, permissions: PermissionKey[], name?: string, description?: string) => Promise<void>;
  deleteRoleDefinition: (roleId: string) => Promise<void>;

  // Staff Credentials Management (Admin)
  addUserRole: (fullName: string, role: string, password?: string) => Promise<void>;
  createStaffUser: (input: CreateStaffInput) => Promise<AppUser | null>;
  updateStaffUser: (userId: string, updates: UpdateStaffInput) => Promise<void>;
  deleteUserRole: (userId: string) => Promise<void>;

  canAccess: (permission: PermissionKey) => boolean;
}

const SESSION_BIZ_KEY = 'smartpos_session_biz_id';
const SESSION_USER_KEY = 'smartpos_session_user_id';

const maskEmailAddress = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
};

export const useAppStore = create<AuthState>((set, get) => ({
  activeBusiness: null,
  currentUser: null,
  users: [],
  roles: [],
  businesses: [],
  currentDb: null,

  currency: 'INR',
  isOnline: navigator.onLine,
  lastSyncTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),

  initRegistry: async () => {
    let allBiz = await CloudSyncService.pullBusinessesFromCloud();

    if (allBiz.length === 0) {
      const defaultBiz: Business = {
        id: 'biz-default',
        name: 'Demo Mart & Store',
        ownerName: 'Mohit Mehta',
        phone: '9876543210',
        businessType: 'retail',
        currency: 'INR',
        createdAt: new Date().toISOString(),
        isActive: true,
      };
      await registryDb.businesses.add(defaultBiz);
      allBiz = [defaultBiz];
    }

    set({ businesses: allBiz });

    const savedBizId = localStorage.getItem(SESSION_BIZ_KEY);
    const savedUserId = localStorage.getItem(SESSION_USER_KEY);

    if (savedBizId && savedUserId) {
      const biz = allBiz.find((b: Business) => b.id === savedBizId);
      if (biz) {
        const dbInstance = getPOSDatabase(biz.id);
        await seedBusinessDataIfNeeded(dbInstance);
        const [userList, roleList] = await Promise.all([
          dbInstance.users.toArray(),
          dbInstance.roles.toArray(),
        ]);
        const user = userList.find((u) => u.id === savedUserId && u.isActive !== false);

        if (user) {
          set({
            activeBusiness: biz,
            currentDb: dbInstance,
            users: userList,
            roles: roleList.length > 0 ? roleList : DEFAULT_ROLE_DEFINITIONS,
            currentUser: user,
            currency: biz.currency || 'INR',
          });
          void get().syncWithCloud();
        } else {
          localStorage.removeItem(SESSION_BIZ_KEY);
          localStorage.removeItem(SESSION_USER_KEY);
        }
      }
    }
  },

  registerBusiness: async (
    name,
    ownerName,
    phone,
    businessType,
    currency = 'INR',
    adminUsername = 'admin',
    adminPassword = 'admin123',
    adminEmail = ''
  ) => {
    const cleanEmail = adminEmail.trim().toLowerCase();
    const newBiz: Business = {
      id: `biz-${Date.now()}`,
      name,
      ownerName,
      phone,
      email: cleanEmail || undefined,
      businessType,
      currency,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    await registryDb.businesses.add(newBiz);

    const dbInstance = getPOSDatabase(newBiz.id);
    await seedBusinessDataIfNeeded(dbInstance);

    const adminUser = await dbInstance.users.get('usr-admin');
    if (adminUser) {
      await dbInstance.users.update('usr-admin', {
        username: adminUsername.trim().toLowerCase().replace(/\s+/g, '_') || 'admin',
        fullName: ownerName.trim() || adminUser.fullName,
        phone: phone.trim() || undefined,
        email: cleanEmail || undefined,
        password: adminPassword,
      });
    }

    await CloudSyncService.syncBusiness(newBiz, dbInstance);

    const updatedBusinesses = await registryDb.businesses.toArray();
    set({ businesses: updatedBusinesses });

    return newBiz;
  },

  login: async (businessId, username, pinOrPassword) => {
    const biz = get().businesses.find((b) => b.id === businessId);
    if (!biz) return false;

    const dbInstance = getPOSDatabase(businessId);
    await seedBusinessDataIfNeeded(dbInstance);
    // Pull latest cloud users & roles before checking credentials so newly created staff can log in on any device
    await CloudSyncService.syncBusiness(biz, dbInstance);
    const [userList, roleList] = await Promise.all([
      dbInstance.users.toArray(),
      dbInstance.roles.toArray(),
    ]);

    const normalizedInput = username.trim().toLowerCase();
    const user = userList.find(
      (u) =>
        u.username.toLowerCase() === normalizedInput ||
        u.fullName.toLowerCase() === normalizedInput
    );

    if (!user || user.isActive === false) return false;

    const cred = (pinOrPassword || '').trim();
    if (!cred) return false;

    const isMatch =
      (Boolean(user.password) && user.password === cred) ||
      (Boolean(user.pinCode) && user.pinCode === cred);
    if (!isMatch) return false;

    localStorage.setItem(SESSION_BIZ_KEY, biz.id);
    localStorage.setItem(SESSION_USER_KEY, user.id);

    set({
      activeBusiness: biz,
      currentDb: dbInstance,
      users: userList,
      roles: roleList.length > 0 ? roleList : DEFAULT_ROLE_DEFINITIONS,
      currentUser: user,
      currency: biz.currency || 'INR',
    });

    return true;
  },

  emailAdminCredentials: async (businessId, usernameOrEmailHint) => {
    const biz = get().businesses.find((b) => b.id === businessId);
    if (!biz) {
      return { ok: false, error: 'Selected business not found.' };
    }

    const dbInstance = getPOSDatabase(businessId);
    await seedBusinessDataIfNeeded(dbInstance);
    const userList = await dbInstance.users.toArray();
    const adminUsers = userList.filter((u) => u.role === 'admin' && u.isActive !== false);

    if (adminUsers.length === 0) {
      return { ok: false, error: 'No active administrator account found for this business.' };
    }

    const hint = (usernameOrEmailHint || '').trim().toLowerCase();
    const matchedAdmin =
      (hint &&
        adminUsers.find(
          (u) =>
            u.username.toLowerCase() === hint ||
            (u.email && u.email.toLowerCase() === hint)
        )) ||
      adminUsers.find((u) => u.id === 'usr-admin') ||
      adminUsers[0];

    const targetEmail = (matchedAdmin.email || biz.email || '').trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      return {
        ok: false,
        error:
          'No admin email ID is registered for this business yet. Once logged in, add an Admin Email under Users & Roles → Edit.',
      };
    }

    const env = ((import.meta as any)?.env || {}) as Record<string, string | undefined>;
    const serviceId = env.VITE_EMAILJS_SERVICE_ID;
    const templateId = env.VITE_EMAILJS_TEMPLATE_ID;
    const publicKey = env.VITE_EMAILJS_PUBLIC_KEY;

    // 1. Automated EmailJS REST delivery (sends directly to registered admin email in background)
    if (serviceId && templateId && publicKey) {
      try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: serviceId,
            template_id: templateId,
            user_id: publicKey,
            template_params: {
              to_email: targetEmail,
              admin_name: matchedAdmin.fullName,
              business_name: biz.name,
              username: matchedAdmin.username,
              password: matchedAdmin.password || 'Not set',
              pin_code: matchedAdmin.pinCode || 'Not set',
              login_url: typeof window !== 'undefined' ? window.location.origin : '',
            },
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || 'EmailJS API error');
        }

        return {
          ok: true,
          maskedEmail: maskEmailAddress(targetEmail),
          method: 'emailjs',
        };
      } catch (err) {
        console.error('EmailJS delivery failed, falling back to mailto:', err);
      }
    }

    // 2. Fallback: Open default mail client pre-addressed strictly to the registered admin email
    const subject = `${biz.name} — Admin Login Credentials Recovery`;
    const body =
      `Hello ${matchedAdmin.fullName},

` +
      `Here are your registered administrator login credentials for ${biz.name} on Smart POS:

` +
      `• Username: ${matchedAdmin.username}
` +
      `• Password: ${matchedAdmin.password || 'Not set'}
` +
      `• Quick PIN: ${matchedAdmin.pinCode || 'Not set'}
` +
      (typeof window !== 'undefined' ? `• POS Link: ${window.location.origin}
` : '') +
      `
Please keep this email secure.`;

    if (typeof window !== 'undefined') {
      window.location.href = `mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(body)}`;
    }

    return {
      ok: true,
      maskedEmail: maskEmailAddress(targetEmail),
      method: 'mailto',
    };
  },

  logout: () => {
    localStorage.removeItem(SESSION_BIZ_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
    set({
      activeBusiness: null,
      currentUser: null,
      currentDb: null,
      users: [],
      roles: [],
    });
  },

  loadUsers: async () => {
    const dbInstance = get().currentDb;
    if (!dbInstance) return;
    const allUsers = await dbInstance.users.toArray();
    set({ users: allUsers });
  },

  loadRoles: async () => {
    const dbInstance = get().currentDb;
    if (!dbInstance) return;
    let allRoles = await dbInstance.roles.toArray();
    if (allRoles.length === 0) {
      await dbInstance.roles.bulkAdd(DEFAULT_ROLE_DEFINITIONS);
      allRoles = await dbInstance.roles.toArray();
    }
    set({ roles: allRoles });
  },

  setCurrentUser: (user: AppUser) => {
    set({ currentUser: user });
    if (get().activeBusiness) {
      localStorage.setItem(SESSION_USER_KEY, user.id);
    }
  },

  setCurrency: (currency: string) => {
    set({ currency });
  },

  setIsOnline: (isOnline: boolean) => {
    set({ isOnline });
  },

  updateLastSyncTime: (lastSyncTime: string) => {
    set({ lastSyncTime });
  },

  syncWithCloud: async () => {
    const biz = get().activeBusiness;
    const dbInstance = get().currentDb;
    if (!biz || !dbInstance) {
      return { ok: false, message: 'No active business session.' };
    }
    const res = await CloudSyncService.syncBusiness(biz, dbInstance);
    if (res.ok) {
      const [freshUsers, freshRoles] = await Promise.all([
        dbInstance.users.toArray(),
        dbInstance.roles.toArray(),
      ]);
      set({
        lastSyncTime: res.syncedAt,
        users: freshUsers,
        roles: freshRoles.length > 0 ? freshRoles : get().roles,
      });
    }
    return { ok: res.ok, message: res.message };
  },

  createRoleDefinition: async (name, description, permissions) => {
    const dbInstance = get().currentDb;
    if (!dbInstance) return null;

    const cleanName = name.trim();
    if (!cleanName) throw new Error('Role name is required.');

    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const id = `role-${slug || Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const now = new Date().toISOString();

    const newRole: RoleDefinition = {
      id,
      name: cleanName,
      description: description.trim() || undefined,
      permissions: Array.from(new Set(permissions)),
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    };

    await dbInstance.roles.add(newRole);
    const updated = await dbInstance.roles.toArray();
    set({ roles: updated });
    return newRole;
  },

  updateRolePermissions: async (roleId, permissions, name, description) => {
    const dbInstance = get().currentDb;
    if (!dbInstance) return;

    const existing = await dbInstance.roles.get(roleId);
    if (!existing) return;

    const nextPermissions =
      roleId === 'admin' ? [...ALL_PERMISSIONS] : Array.from(new Set(permissions));

    await dbInstance.roles.update(roleId, {
      ...(name !== undefined && name.trim() ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description.trim() } : {}),
      permissions: nextPermissions,
      updatedAt: new Date().toISOString(),
    });

    const updated = await dbInstance.roles.toArray();
    set({ roles: updated });
  },

  deleteRoleDefinition: async (roleId) => {
    const dbInstance = get().currentDb;
    if (!dbInstance) return;

    if (roleId === 'admin') {
      throw new Error('The Administrator role cannot be deleted.');
    }

    const assignedUsers = get().users.filter((u) => u.role === roleId);
    if (assignedUsers.length > 0) {
      throw new Error(
        `Cannot delete role because ${assignedUsers.length} staff user(s) are assigned to it. Reassign them first.`
      );
    }

    await dbInstance.roles.delete(roleId);
    const updated = await dbInstance.roles.toArray();
    set({ roles: updated });
  },

  addUserRole: async (fullName: string, role: string, password = '123') => {
    await get().createStaffUser({
      fullName,
      username: fullName.toLowerCase().replace(/\s+/g, '_'),
      password,
      pinCode: '',
      role,
    });
  },

  createStaffUser: async (input) => {
    const dbInstance = get().currentDb;
    if (!dbInstance) return null;

    const cleanUsername = input.username.trim().toLowerCase().replace(/\s+/g, '_');
    const cleanName = input.fullName.trim();
    const cleanPhone = (input.phone || '').trim();
    const cleanEmail = (input.email || '').trim().toLowerCase();
    const cleanPass = input.password.trim();
    const cleanPin = (input.pinCode || '').trim();

    if (!cleanName || !cleanUsername || !cleanPass) {
      throw new Error('Full Name, Username, and Password are required.');
    }

    const existingUsers = await dbInstance.users.toArray();
    if (existingUsers.some((u) => u.username.toLowerCase() === cleanUsername)) {
      throw new Error(`Username "${cleanUsername}" is already taken in this business.`);
    }

    const newUser: AppUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      username: cleanUsername,
      fullName: cleanName,
      phone: cleanPhone || undefined,
      email: cleanEmail || undefined,
      role: input.role,
      password: cleanPass,
      pinCode: cleanPin || undefined,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    await dbInstance.users.add(newUser);
    const updated = await dbInstance.users.toArray();
    set({ users: updated });
    return newUser;
  },

  updateStaffUser: async (userId, updates) => {
    const dbInstance = get().currentDb;
    if (!dbInstance) return;

    const existing = await dbInstance.users.get(userId);
    if (!existing) return;

    const patch: Partial<AppUser> = {};
    if (updates.fullName !== undefined && updates.fullName.trim()) {
      patch.fullName = updates.fullName.trim();
    }
    if (updates.username !== undefined && updates.username.trim()) {
      const cleanUsername = updates.username.trim().toLowerCase().replace(/\s+/g, '_');
      const allUsers = await dbInstance.users.toArray();
      if (allUsers.some((u) => u.id !== userId && u.username.toLowerCase() === cleanUsername)) {
        throw new Error(`Username "${cleanUsername}" is already in use.`);
      }
      patch.username = cleanUsername;
    }
    if (updates.phone !== undefined) {
      patch.phone = updates.phone.trim() || undefined;
    }
    if (updates.email !== undefined) {
      patch.email = updates.email.trim().toLowerCase() || undefined;
    }
    if (updates.password !== undefined && updates.password.trim()) {
      patch.password = updates.password.trim();
    }
    if (updates.pinCode !== undefined) {
      patch.pinCode = updates.pinCode.trim() || undefined;
    }
    if (updates.role !== undefined && userId !== 'usr-admin') {
      patch.role = updates.role;
    }
    if (updates.isActive !== undefined && userId !== 'usr-admin') {
      patch.isActive = updates.isActive;
    }

    await dbInstance.users.update(userId, patch);

    // Keep Business Owner phone & email in sync if primary admin is updated
    const activeBiz = get().activeBusiness;
    if (userId === 'usr-admin' && activeBiz) {
      const bizPatch: Partial<Business> = {};
      if (updates.phone !== undefined && updates.phone.trim()) {
        bizPatch.phone = updates.phone.trim();
      }
      if (updates.email !== undefined) {
        bizPatch.email = updates.email.trim().toLowerCase() || undefined;
      }
      if (Object.keys(bizPatch).length > 0) {
        await registryDb.businesses.update(activeBiz.id, bizPatch);
        const updatedBusinesses = await registryDb.businesses.toArray();
        set({
          activeBusiness: { ...activeBiz, ...bizPatch },
          businesses: updatedBusinesses,
        });
      }
    }

    const updated = await dbInstance.users.toArray();
    const current = get().currentUser;
    set({
      users: updated,
      ...(current && current.id === userId
        ? { currentUser: updated.find((u) => u.id === userId) || current }
        : {}),
    });
  },

  deleteUserRole: async (userId: string) => {
    const dbInstance = get().currentDb;
    if (!dbInstance) return;
    if (userId === 'usr-admin' || userId === get().currentUser?.id) {
      throw new Error('Cannot delete the primary administrator or your active user account.');
    }
    await dbInstance.users.delete(userId);
    const updated = await dbInstance.users.toArray();
    set({ users: updated });
  },

  canAccess: (permission: PermissionKey) => {
    const user = get().currentUser;
    if (!user || user.isActive === false) return false;

    if (user.role === 'admin') return true;

    const roles = get().roles;
    const matchedRole = roles.find((r) => r.id === user.role);
    if (matchedRole) {
      return matchedRole.permissions.includes(permission);
    }

    const fallbackRole = DEFAULT_ROLE_DEFINITIONS.find((r) => r.id === user.role);
    if (fallbackRole) {
      return fallbackRole.permissions.includes(permission);
    }

    return false;
  },
}));
