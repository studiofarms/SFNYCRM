-- Studio Farms Rep App — run this whole file in the Supabase SQL editor.

create extension if not exists pgcrypto;

-- Who is allowed in. Anyone not in this table can sign in with Google but sees nothing.
create table if not exists allowed_emails (
  email        text primary key,
  display_name text not null,
  is_admin     boolean not null default false,
  commission_rate numeric(5,4) not null default 0   -- 0.03 = 3%
);
alter table allowed_emails add column if not exists commission_rate numeric(5,4) not null default 0;

create table if not exists shifts (
  id             uuid primary key default gen_random_uuid(),
  rep_email      text not null,
  rep_name       text not null,
  event          text not null,
  location       text,
  clock_in       timestamptz not null,
  clock_out      timestamptz not null,
  hours          numeric(6,2) not null,
  travel_minutes integer not null default 0,
  miles          numeric(7,1) not null default 0,
  rate           numeric(5,2) not null default 0,
  mileage_pay    numeric(8,2) not null default 0,
  notes          text,
  photo_paths    text[] not null default '{}',
  photo_taken_at timestamptz[] not null default '{}',
  created_at     timestamptz not null default now()
);
-- If you already ran an earlier version of this file:
alter table shifts add column if not exists photo_taken_at timestamptz[] not null default '{}';

create table if not exists meetings (
  id         uuid primary key default gen_random_uuid(),
  rep_email  text not null,
  rep_name   text not null,
  shop       text not null,
  contact    text,
  meeting_at timestamptz not null,
  outcome    text,
  next_step      text,
  next_step_due  date,
  next_step_done boolean not null default false,
  notes          text,
  created_at     timestamptz not null default now()
);
alter table meetings add column if not exists next_step_due  date;
alter table meetings add column if not exists next_step_done boolean not null default false;

create table if not exists deals (
  id         uuid primary key default gen_random_uuid(),
  rep_email  text not null,
  rep_name   text not null,
  shop       text not null,
  stage      text not null default 'lead',
  value      numeric(10,2) not null default 0,
  notes      text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists popups (
  id            uuid primary key default gen_random_uuid(),
  rep_email     text not null,
  rep_name      text not null,
  shop          text not null,
  address       text,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  notes_before  text,
  notes_after   text,
  gcal_event_id text,
  created_at    timestamptz not null default now()
);

-- Shops are shared records: anyone on the team can create and edit them.
create table if not exists shops (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text,
  town          text,
  contacts      jsonb not null default '[]',
  notes         text,
  wants_samples boolean not null default false,
  wants_swag    boolean not null default false,
  reorder_soon  boolean not null default false,
  last_order    date,
  created_by    text,
  updated_by    text,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create unique index if not exists shops_name_idx on shops (lower(name));

-- Price list for order line items. Anyone on the team can read; admins edit.
create table if not exists products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,           -- e.g. "Blue Dream", "Gelato pre-rolls 5pk"
  unit       text not null default 'oz',
  price      numeric(10,2) not null default 0,
  active     boolean not null default true,
  sort       integer not null default 100
);

create table if not exists orders (
  id          uuid primary key default gen_random_uuid(),
  rep_email   text not null,
  rep_name    text not null,
  shop        text not null,
  shop_id     uuid references shops(id) on delete set null,
  order_date  date not null default current_date,
  invoice_no  text,
  items       jsonb not null default '[]',   -- [{product, unit, qty, price}]
  subtotal    numeric(10,2) not null default 0,
  commission_rate numeric(5,4) not null default 0,
  commission  numeric(10,2) not null default 0,
  status      text not null default 'placed',  -- placed | delivered | paid
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists orders_rep_idx  on orders (rep_email, order_date desc);
create index if not exists orders_shop_idx on orders (shop_id);

create table if not exists samples (
  id            uuid primary key default gen_random_uuid(),
  rep_email     text not null,
  rep_name      text not null,
  shop          text not null,
  strain        text not null,
  quantity      numeric(8,2) not null default 0,
  unit          text not null default 'g',
  left_at       date not null default current_date,
  notes         text,
  follow_up_due date,
  followed_up   boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists gallery_photos (
  id         uuid primary key default gen_random_uuid(),
  rep_email  text not null,
  rep_name   text not null,
  path       text not null,
  caption    text,
  shop       text,
  shop_id    uuid references shops(id) on delete set null,
  kind       text not null default 'other',   -- shelf | menu | other
  taken_at   timestamptz,
  created_at timestamptz not null default now()
);
alter table gallery_photos add column if not exists shop_id uuid references shops(id) on delete set null;
alter table gallery_photos add column if not exists kind text not null default 'other';
create index if not exists gallery_shop_idx on gallery_photos (shop_id);

create index if not exists samples_rep_idx on samples (rep_email, left_at desc);
create index if not exists samples_due_idx on samples (follow_up_due) where not followed_up;
create index if not exists meetings_due_idx on meetings (next_step_due) where not next_step_done;
create index if not exists gallery_idx on gallery_photos (created_at desc);
create index if not exists shifts_rep_idx   on shifts (rep_email, clock_in desc);
create index if not exists meetings_rep_idx on meetings (rep_email, meeting_at desc);
create index if not exists deals_rep_idx    on deals (rep_email, updated_at desc);
create index if not exists popups_when_idx  on popups (starts_at);

-- Helpers used by every policy.
create or replace function jwt_email() returns text
  language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function is_allowed() returns boolean
  language sql stable security definer as $$
    select exists (select 1 from allowed_emails where lower(email) = jwt_email())
  $$;

create or replace function is_admin() returns boolean
  language sql stable security definer as $$
    select exists (select 1 from allowed_emails where lower(email) = jwt_email() and is_admin)
  $$;

alter table allowed_emails enable row level security;
alter table shifts   enable row level security;
alter table meetings enable row level security;
alter table deals    enable row level security;
alter table popups   enable row level security;
alter table samples  enable row level security;
alter table shops    enable row level security;
alter table products enable row level security;
alter table orders   enable row level security;

drop policy if exists products_read on products;
create policy products_read on products for select to authenticated using (is_allowed());
drop policy if exists products_admin on products;
create policy products_admin on products for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists shops_read on shops;
create policy shops_read on shops for select to authenticated using (is_allowed());
drop policy if exists shops_insert on shops;
create policy shops_insert on shops for insert to authenticated with check (is_allowed());
drop policy if exists shops_update on shops;
create policy shops_update on shops for update to authenticated using (is_allowed());
drop policy if exists shops_delete on shops;
create policy shops_delete on shops for delete to authenticated using (is_admin());
alter table gallery_photos enable row level security;

-- allowed_emails: everyone allowed can read the roster (for name lookups); only admins change it.
drop policy if exists roster_read on allowed_emails;
create policy roster_read on allowed_emails for select to authenticated using (is_allowed());
drop policy if exists roster_admin on allowed_emails;
create policy roster_admin on allowed_emails for all to authenticated using (is_admin()) with check (is_admin());

-- Data tables: the whole team can read everything (small trusted crew);
-- you can only insert as yourself; you can edit your own rows, admins can edit anything.
do $$
declare t text;
begin
  foreach t in array array['shifts','meetings','deals','popups','samples','gallery_photos','orders'] loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('create policy %I_read on %I for select to authenticated using (is_allowed())', t, t);
    execute format('drop policy if exists %I_insert on %I', t, t);
    execute format('create policy %I_insert on %I for insert to authenticated with check (is_allowed() and lower(rep_email) = jwt_email())', t, t);
    execute format('drop policy if exists %I_update on %I', t, t);
    execute format('create policy %I_update on %I for update to authenticated using (is_allowed() and (lower(rep_email) = jwt_email() or is_admin()))', t, t);
    execute format('drop policy if exists %I_delete on %I', t, t);
    execute format('create policy %I_delete on %I for delete to authenticated using (is_allowed() and (lower(rep_email) = jwt_email() or is_admin()))', t, t);
  end loop;
end $$;

-- Photo bucket (private; the app uses signed URLs to display).
insert into storage.buckets (id, name, public)
  values ('shift-photos', 'shift-photos', false)
  on conflict (id) do nothing;

drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'shift-photos' and is_allowed());
drop policy if exists photos_write on storage.objects;
create policy photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'shift-photos' and is_allowed());

insert into storage.buckets (id, name, public)
  values ('gallery', 'gallery', false)
  on conflict (id) do nothing;

drop policy if exists gallery_read on storage.objects;
create policy gallery_read on storage.objects for select to authenticated
  using (bucket_id = 'gallery' and is_allowed());
drop policy if exists gallery_write on storage.objects;
create policy gallery_write on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and is_allowed());
drop policy if exists gallery_delete on storage.objects;
create policy gallery_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and is_allowed());

-- Seed the roster. Edit these, then re-run just this block any time.
-- Add each rep's real Google sign-in address here, then re-run just this block.
insert into allowed_emails (email, display_name, is_admin, commission_rate) values
  ('andrew@studiofarmsny.com', 'Andrew', true, 0)
  -- ('bubu@REAL-ADDRESS',  'Bubu',  false, 0.03),
  -- ('elia@REAL-ADDRESS',  'Elia',  false, 0),
  -- ('flaco@REAL-ADDRESS', 'Flaco', false, 0)
on conflict (email) do update set display_name = excluded.display_name, is_admin = excluded.is_admin, commission_rate = excluded.commission_rate;

-- Seed the price list. Replace with the real menu; reps can still type a product that isn't listed.
insert into products (name, unit, price, sort) values
  ('Example strain — flower', 'oz', 0, 10),
  ('Example pre-rolls 5pk',   'pk', 0, 20)
on conflict do nothing;
