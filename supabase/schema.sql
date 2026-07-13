-- ============================================================================
-- Studio Farms CRM — Supabase schema
-- ----------------------------------------------------------------------------
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query
-- -> paste this whole file -> Run.
--
-- It creates the shared data tables (accounts, orders, reps), turns on
-- row-level security so ONLY logged-in users can read/write, and enables
-- Realtime so every open browser sees changes live.
--
-- Auth model: this is a single shared workspace. Any authenticated user has
-- full access to all CRM data (it's a small trusted sales team collaborating
-- on one dataset). Logging in is the gate; there is no per-user row ownership.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- updated_at helper: bump updated_at on every UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- accounts (dispensaries). IDs are preserved from the legacy data
-- (1..N with gaps), so they are client-assigned integers, not a serial.
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id           integer primary key,
  name         text not null,
  location     text,
  address      text,
  contact      text,
  email        text,
  phone        text,
  website      text,
  stage        text,                       -- Prospecting | Sampled | First Order | Repeat | Churned
  tags         text[] not null default '{}',
  sales_rep    text,
  role         text,                       -- contact's role/title (optional)
  dba          text,                       -- "doing business as" name (optional)
  details      jsonb not null default '{}'::jsonb,
  alt_contacts jsonb not null default '[]'::jsonb,
  activity     jsonb not null default '[]'::jsonb,
  version      integer not null default 1,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_accounts_updated_at on public.accounts;
create trigger trg_accounts_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- orders / invoices. IDs are strings like "INV-748047" from the legacy data.
-- Customer fields are denormalized so historical invoices stay immutable
-- snapshots even if the linked account changes later.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id          text primary key,
  account_id  integer references public.accounts(id) on delete set null,
  date        text,                        -- YYYY-MM-DD (legacy stores as strings)
  delivery    text,
  paydue      text,
  dispensary  text,
  dba         text,
  license     text,
  name        text,
  email       text,
  phone       text,
  addr        text,
  oz          numeric,
  price       numeric,
  total       numeric,
  paymethod   text,
  terms       text,                        -- COD | Net 30
  paystatus   text,                        -- Pending | Paid
  ordstatus   text,                        -- Pending | Processing | Delivered
  track       text,
  carrier     text,
  link        text,
  website     text,
  salesrep    text,
  discount    numeric,
  notes       text,
  version     integer not null default 1,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create index if not exists idx_orders_account_id on public.orders(account_id);

-- ---------------------------------------------------------------------------
-- reps. Just names in the legacy data.
-- ---------------------------------------------------------------------------
create table if not exists public.reps (
  name       text primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-level security: logged-in users get full shared access; anonymous
-- users get nothing.
-- ---------------------------------------------------------------------------
alter table public.accounts enable row level security;
alter table public.orders   enable row level security;
alter table public.reps     enable row level security;

drop policy if exists "authenticated full access" on public.accounts;
create policy "authenticated full access" on public.accounts
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.orders;
create policy "authenticated full access" on public.orders
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.reps;
create policy "authenticated full access" on public.reps
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Realtime: broadcast row changes so open browsers update live.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.accounts;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.reps;

-- Done. Next: create users under Authentication -> Users, then fill in
-- supabase-config.js with your project URL + anon key.
