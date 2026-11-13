-- ============================================================================
-- SMART POS — SUPABASE (POSTGRESQL) MULTI-BUSINESS CLOUD SCHEMA
-- Run this SQL once in your Supabase Project -> SQL Editor
-- ============================================================================

-- 1. Businesses Registry
create table if not exists public.businesses (
  id text primary key,
  name text not null,
  owner_name text not null,
  phone text not null,
  email text,
  business_type text not null default 'retail',
  currency text not null default 'INR',
  address text,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

-- 2. Custom Roles & Feature Permissions (Per Business)
create table if not exists public.roles (
  id text not null,
  business_id text not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  permissions jsonb not null default '[]'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, id)
);

-- 3. Staff & Admin Users (Per Business)
create table if not exists public.app_users (
  id text not null,
  business_id text not null references public.businesses(id) on delete cascade,
  username text not null,
  full_name text not null,
  phone text,
  email text,
  role text not null,
  pin_code text,
  password text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, id)
);

-- 4. Product Categories
create table if not exists public.categories (
  id text not null,
  business_id text not null references public.businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, id)
);

-- 5. Inventory Stock Items (with JSONB variants & purchase_history)
create table if not exists public.stock_items (
  id text not null,
  business_id text not null references public.businesses(id) on delete cascade,
  serial_number text,
  name text not null,
  hindi_name text,
  category text,
  shelf_location text not null,
  unit_type text not null default 'count',
  has_variants boolean not null default false,
  variants jsonb default '[]'::jsonb,
  quantity_left numeric not null default 0,
  threshold numeric not null default 0,
  selling_price numeric not null default 0,
  average_purchase_price numeric not null default 0,
  purchase_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, id)
);

-- 6. Sales Receipts & Line Items
create table if not exists public.receipts (
  id text not null,
  business_id text not null references public.businesses(id) on delete cascade,
  customer_id text,
  customer_name text not null,
  customer_phone text,
  customer_address text,
  status text not null default 'inProgress',
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  total_discount numeric not null default 0,
  tax_amount numeric not null default 0,
  grand_total numeric not null default 0,
  amount_received numeric not null default 0,
  balance_due numeric not null default 0,
  payments jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (business_id, id)
);

-- 7. Customers Directory
create table if not exists public.customers (
  id text not null,
  business_id text not null references public.businesses(id) on delete cascade,
  name text not null,
  phone text not null,
  address text,
  gst_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, id)
);

-- Helpful Indexes for Fast Incremental Sync
create index if not exists idx_stock_items_biz_updated on public.stock_items(business_id, updated_at);
create index if not exists idx_receipts_biz_updated on public.receipts(business_id, updated_at);
create index if not exists idx_roles_biz_updated on public.roles(business_id, updated_at);
create index if not exists idx_users_biz_updated on public.app_users(business_id, updated_at);

-- Enable Row Level Security (RLS) with open anon policies for client-key sync
-- (You can tighten policies later if you migrate to Supabase Auth JWTs)
alter table public.businesses enable row level security;
alter table public.roles enable row level security;
alter table public.app_users enable row level security;
alter table public.categories enable row level security;
alter table public.stock_items enable row level security;
alter table public.receipts enable row level security;
alter table public.customers enable row level security;

drop policy if exists "Allow anon all businesses" on public.businesses;
create policy "Allow anon all businesses" on public.businesses for all using (true) with check (true);

drop policy if exists "Allow anon all roles" on public.roles;
create policy "Allow anon all roles" on public.roles for all using (true) with check (true);

drop policy if exists "Allow anon all users" on public.app_users;
create policy "Allow anon all users" on public.app_users for all using (true) with check (true);

drop policy if exists "Allow anon all categories" on public.categories;
create policy "Allow anon all categories" on public.categories for all using (true) with check (true);

drop policy if exists "Allow anon all stock_items" on public.stock_items;
create policy "Allow anon all stock_items" on public.stock_items for all using (true) with check (true);

drop policy if exists "Allow anon all receipts" on public.receipts;
create policy "Allow anon all receipts" on public.receipts for all using (true) with check (true);

drop policy if exists "Allow anon all customers" on public.customers;
create policy "Allow anon all customers" on public.customers for all using (true) with check (true);
