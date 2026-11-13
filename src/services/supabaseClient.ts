/**
 * Lightweight Supabase PostgREST Client
 * Supports both legacy JWT `anon` keys (eyJ...) and Supabase's newer `sb_publishable_...` keys.
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) from .env
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
  const envKey =
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    '';

  const url = (envUrl || localStorage.getItem('smartpos_supabase_url') || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\/$/, '');

  const anonKey = (envKey || localStorage.getItem('smartpos_supabase_anon_key') || '')
    .trim()
    .replace(/^["']|["']$/g, '');

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function saveRuntimeSupabaseConfig(url: string, anonKey: string) {
  localStorage.setItem('smartpos_supabase_url', url.trim().replace(/\/$/, ''));
  localStorage.setItem('smartpos_supabase_anon_key', anonKey.trim());
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseConfig());
}

function buildHeaders(cfg: SupabaseConfig, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: cfg.anonKey,
    'Content-Type': 'application/json',
    ...extra,
  };

  // Legacy anon keys are JWTs (start with "eyJ") and accept Authorization: Bearer.
  // Newer sb_publishable_... keys are NOT JWTs and must only be sent in the `apikey` header.
  if (cfg.anonKey.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${cfg.anonKey}`;
  }

  return headers;
}

export async function sbSelect<T = any>(
  table: string,
  queryParams: Record<string, string> = {}
): Promise<T[]> {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error('Supabase is not configured.');

  const qs = new URLSearchParams({ select: '*', ...queryParams }).toString();
  const res = await fetch(`${cfg.url}/rest/v1/${table}?${qs}`, {
    method: 'GET',
    headers: buildHeaders(cfg),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase SELECT ${table} failed (${res.status}): ${errText}`);
  }
  return (await res.json()) as T[];
}

export async function sbUpsert<T extends Record<string, any>>(
  table: string,
  rows: T[],
  onConflict: string
): Promise<void> {
  if (!rows || rows.length === 0) return;
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error('Supabase is not configured.');

  const qs = new URLSearchParams({ on_conflict: onConflict }).toString();
  const res = await fetch(`${cfg.url}/rest/v1/${table}?${qs}`, {
    method: 'POST',
    headers: buildHeaders(cfg, {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase UPSERT ${table} failed (${res.status}): ${errText}`);
  }
}

export async function sbDeleteByCompositeKey(
  table: string,
  businessId: string,
  id: string
): Promise<void> {
  const cfg = getSupabaseConfig();
  if (!cfg) return;

  const qs = new URLSearchParams({
    business_id: `eq.${businessId}`,
    id: `eq.${id}`,
  }).toString();

  const res = await fetch(`${cfg.url}/rest/v1/${table}?${qs}`, {
    method: 'DELETE',
    headers: buildHeaders(cfg),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase DELETE ${table} failed (${res.status}): ${errText}`);
  }
}
