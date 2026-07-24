# STUDIO FARMS CRM — HANDOFF & BUILD-OUT PLAN

**Last updated:** July 24, 2026
**Live app:** https://studiofarmscrm.netlify.app
**Repo:** `studiofarms/SFNYCRM` (branch `claude/new-session-ri7sdj`, also mirrored to `main`)

This document is for whoever (human or Claude session) picks this project up next.
Part 1 is what exists today and how it works. Part 2 is the roadmap to grow it into
a full CRM + inventory platform, integrating Drew's other tools: **invoice generator,
order portal, sales manager, cost-of-goods tracking, and Instagram tools**.

---

## PART 1 — CURRENT SYSTEM

### 1.1 Architecture (what runs where)

| Piece | What | Where |
|---|---|---|
| Frontend | Single-page app, all UI + logic in one file | `index.html` (~2 MB, vanilla JS, no build step) |
| Cloud sync | Supabase JS client, auth + fetch + realtime | `supabase-app.js` |
| Connection config | Supabase URL + anon key (safe for browser) | `supabase-config.js` |
| Database + auth | Postgres + Supabase Auth + Realtime | Supabase project `sgfqqhekkuatkpwmsrja` |
| Hosting | Static deploy, **auto-deploys on git push** | Netlify site `studiofarmscrm` (siteId `3dfdc374-5105-471f-8387-d3b254e9825c`) |
| Invoices (PDFs) | Distru-generated invoice PDFs | Google Drive (andrew@studiofarmsny.com) |

Deploy loop: edit `index.html` → commit → push → Netlify redeploys in ~1 min.
There is **no build step and no bundler**. Keep it that way until Part 2 says otherwise.

### 1.2 Database (Supabase / Postgres)

Tables (all in `public`, all with RLS "authenticated users full access"):

- **accounts** — 790+ dispensary/prospect records.
  Key columns: `id (int)`, `name`, `location`, `address`, `contact`, `email`, `phone`,
  `website`, `stage` (Prospecting / Sampled / First Order / Repeat / Merged),
  `tags text[]`, `sales_rep`, `dba`, `details jsonb`, `alt_contacts jsonb`,
  `activity jsonb`, `version`, `archived_at`, timestamps.
- **orders** — 58+ order/invoice records. **`id` is the invoice number** (text,
  e.g. `INV-0000033`). Key columns: `date`, `delivery`, `paydue`, `dispensary` (store
  name — see 1.4), `dba`, `license`, `name/email/phone/addr` (buyer), `oz`, `price`,
  `total`, `paymethod`, `terms`, `paystatus` (Pending/Paid/Overdue/Failed),
  `ordstatus`, `track` (manifest #), `carrier` (distro), `link` (**Google Drive PDF
  URL — renders as clickable invoice link in the UI**), `website`, `salesrep`,
  `discount` (**percent**, not dollars), `notes`, `paid_at` (date string), `version`,
  `archived_at`, timestamps.
- **reps** — sales rep names.
- **app_settings** — key/value store. Currently holds `commission_rate` (shared,
  adjustable in the Commission view).

Auth: Supabase `auth.users`. Logins are **name-based**: the login form accepts a
plain username and maps it to `<name>@studiofarms.local` internally (`sbLogin` in
`supabase-app.js`). Current users: andrew, admin, bob, mike, bubu, flaco, brian —
all `team_role=admin` (everyone sees everything; role separation exists in code but
is inert). Passwords live in the "USER ACCOUNTS" Google Doc (Drive doc id
`1L0_g5AzU7UgR0gDWu8rvRtALVpQtLg0pxTa8YuJlqvA`) — do not commit passwords here.

### 1.3 Data conventions (IMPORTANT — several bugs came from breaking these)

1. **Orders join to accounts by NAME, not FK.** `orders.account_id` is mostly null.
   The app auto-creates account cards from order dispensary names on load
   (`ensureCompaniesForOrders()`). Matching uses this normalization — lowercase
   FIRST, then strip non-alphanumerics:
   ```sql
   regexp_replace(lower(regexp_replace(name,'^\*','')),'[^a-z0-9]','','g')
   ```
   If you rename an account, rename its orders' `dispensary` too, or a duplicate
   account card reappears on next load.
2. **Order totals are PRE-TAX, always.** If an invoice has sales tax, store the
   product subtotal as `total` and note the tax + balance due in `notes`
   (see INV-0000033). Commission is calculated on pre-tax totals only.
3. **`discount` is a percent (0–100), never dollars.** The order form's manual
   discount input converts $-off to a percent before saving.
4. **`paystatus` is manual.** Never auto-derive Overdue and persist it
   (`checkOverdueOrders()` was made a no-op on purpose — leave it dead).
   Marking Paid stamps `paid_at`; unmarking clears it. "Collected" = sum of Paid.
5. **Every order should have `link`** = Google Drive invoice PDF URL. The orders
   table renders the invoice # as a hotlink when present.
6. **Commission**: rate lives in `app_settings` (`repCommissionRate()` in
   index.html). Reps are paid on **collected** (Paid) money; the UI shows both
   "commission on all orders" and "on collected".
7. Large SQL results via the Supabase MCP tool overflow; add
   `repeat('x',60000) as pad` to force results to a file, then slice the JSON.

### 1.4 Current business state (as of this writing)

- 58 orders, ~$160k gross. All 57+1 orders have clickable invoice links.
- Rep assignment (accounts AND their orders):
  **Bubu** — the ~26 NYC/BK/Queens accounts (28 Gramz, BK Exotics, Good Grades,
  Sky High, Ignyte ×2, Kushmart, Planet Nugg, The Plug, Silk Road, Twisted
  Vibration, Emerald UES, Indoor Treez, EN FLOR, Dankley, Jungle Kingdom ×2,
  Flower Power, Seaweed, Just A Little Higher, Flowery UWS + Bronx, At The
  Factory, Brooklyn Organic Buds, No Name, …).
  **Flaco** — Culture House BK, Dazed ×3 (Albany/Syracuse/Union Sq), Stash House,
  Sweet Life, The Emerald Dispensary.
  **Brian** — High Peaks Canna.
  **Andrew** — everything else (Capital District, Crush, Farmers Choice ×2,
  FlynnStoned ×2, Leafology, My Buds 420, Firehaus, Lucky Dog, Tru Quality,
  Catskill Mtn High…).
- Invoice sequence: INV-0000001…0000033 (0000015 was never issued — gap is
  intentional). Older 6-digit INV-xxxxxx ids are legacy Distru numbers.
- Known open items: The Flowery Bronx duplicate (account ids 970 vs 1019) not yet
  merged; a few accounts have no known email (BK Exotic, A Little Higher, Lucky
  Dog, Flynnstoned-Oswego, Sweet Life — WEPA-routed only).
- 247 "revelry" prospect accounts are tagged `revelry`.

### 1.5 Workflows that already exist in the app

- Order modal with paste-to-parse (Distru invoice text → fields), autocomplete
  dispensary picker, auto pay-due from terms, discount presets + manual %/$ input,
  invoice-link field.
- Reports: on-screen + print + CSV export (volume in oz, 2g cases, weekly
  breakdown, new/active accounts, payments received by date, by-rep, product mix,
  AR aging).
- Commission view with adjustable shared rate.
- Leads triage, map view, account cards with order history & stage auto-advance.
- Supabase realtime sync across devices/tabs.

---

## PART 2 — BUILD-OUT PLAN: FULL CRM + INVENTORY

Goal: integrate Drew's separately-built tools — **invoice generator, order portal,
sales manager, COGS tracking, Instagram tools** — into this stack without losing
the "one HTML file + Supabase" simplicity until scale forces otherwise.

### 2.0 Ground rules for whoever builds this

- **Do not rewrite the app in a framework as step one.** Migrate feature-by-feature.
  The single-file app is the system of record and it works. New modules can be
  separate pages (e.g. `/portal/index.html`) sharing `supabase-app.js` + config.
- **Schema changes go through Supabase migrations** (`supabase/schema.sql` is the
  bootstrap; use `apply_migration` or the dashboard SQL editor and keep
  `supabase/schema.sql` updated in the repo).
- **Respect the conventions in 1.3.** Especially name-matching and pre-tax totals.
- New tables get the same RLS pattern: authenticated full access (tighten later).

### 2.1 Phase 1 — Inventory management (foundation for everything else)

New tables:

```sql
create table public.products (
  id serial primary key,
  sku text unique,              -- e.g. 'BN-0001oz2g'
  name text not null,           -- 'Blue Nerdz'
  form text not null,           -- '1oz' | '2g' | ...
  units_per_case int,           -- 50 for 2g cases
  wholesale_price numeric,      -- $80/oz, $8.20/2g unit
  active boolean default true,
  created_at timestamptz default now()
);

create table public.batches (
  id serial primary key,
  product_id int references public.products,
  metrc_package text,           -- '1A4120300003B62000000598'
  qty_received numeric not null,      -- in sellable units
  unit_cost numeric,            -- COGS per unit (see 2.4)
  received_at date,
  source text,                  -- harvest/lot reference
  created_at timestamptz default now()
);

create table public.stock_moves (
  id serial primary key,
  batch_id int references public.batches,
  order_id text,                -- references orders.id when a sale
  qty numeric not null,         -- negative = out
  reason text not null,         -- 'sale' | 'sample' | 'adjustment' | 'return'
  moved_at timestamptz default now()
);
```

On-hand = sum of `stock_moves.qty` per batch. Selling an order inserts negative
moves (the invoice line items already carry Metrc package numbers — parse them
from `orders.notes` going forward, or better: add an `order_items` table, next).

**`order_items`** (do this in the same phase — stop cramming line items into
`orders.notes`):

```sql
create table public.order_items (
  id serial primary key,
  order_id text not null,       -- orders.id
  product_id int references public.products,
  batch_id int references public.batches,
  qty numeric not null,
  unit_price numeric not null,
  line_total numeric not null
);
```

Keep writing a human-readable summary into `orders.notes` for backward compat;
the reports read strains from notes today (`RPT_STRAINS` / `rptOzForStrain` in
index.html) — port those to read `order_items` once populated, with notes as
fallback for legacy orders.

UI: new "Inventory" tab in index.html — on-hand by product/batch, receive
inventory form, low-stock warnings, and auto-decrement on order save.

### 2.2 Phase 2 — Invoice generator (integrate Drew's existing tool)

Today invoices come from Distru and are PDFs in Drive. Target: generate our own
invoice from an order, matching the Distru layout (bill-to/ship-to, license
numbers, Metrc package per line, terms, balance due).

- Input: an `orders` row + its `order_items`.
- Output: print-ready HTML (window.print() → PDF) — no server needed. Number it
  from a sequence stored in `app_settings` (`next_invoice_number`), format
  `INV-0000NNN`, and honor the existing sequence (next free is 0000034).
- Save the generated file to Drive manually at first; paste the Drive URL into
  the order's `link` field (or auto-set `link` once a Drive-upload integration
  exists — see 2.6 email/Drive note).
- Drew's existing invoice-generator code: merge its layout/branding; the data
  layer must be this database, not its own copies. Licenses: Studio Farms
  processor `OCM-PROC-26-000331-P1`; WEPA distributor `OCM-DIST-24-000036-DX1`
  (ship-to on most invoices); each dispensary's OCM license is on `orders.license`.

### 2.3 Phase 3 — Order portal + sales manager

**Order portal** (buyer-facing): a separate page `/portal/` on the same Netlify
site. Buyers (dispensary contacts) get a magic-link or shared-code login (new
Supabase auth role `buyer`, RLS: can see only their own account + orders).
Features: view catalog (products with live stock from Phase 1), place an order
request, see their invoices (links) and balances. Order requests land in a
`order_requests` table and appear in the CRM Leads-style queue for a rep to
confirm → converts to a real order + inventory hold.

**Sales manager** (rep-facing): extend the existing Commission view into a rep
dashboard: my accounts, my open orders, my AR (who owes what, days overdue), my
commission (all vs collected), activity log. The role plumbing already exists
(`SF_ROLE` / `SF_REP` / `sfOwnsRep()` in index.html — currently inert because
everyone is admin). Flip individual users to `team_role=sales` +
`sales_rep=<Name>` in auth metadata to scope their view when Drew wants it.

### 2.4 Phase 4 — Cost of goods (COGS) tracking

- `batches.unit_cost` is the anchor: what a unit cost to produce/acquire
  (cultivation inputs, processing, packaging, lab testing amortized per batch).
- New table `batch_costs` (line-item costs per batch: labor, packaging, testing
  — New Age Laboratories invoices, materials) so `unit_cost` is computed, not
  typed. Vendor bills already accumulate in Drive (office@studiofarmsny.com
  uploads: New Age Labs, Rainflow, etc.) — parse the same way invoices were.
- Reports to add: gross margin per order (revenue − COGS of items sold, FIFO by
  batch), margin by product, margin by rep, margin by account. Commission stays
  revenue-based unless Drew says otherwise.

### 2.5 Phase 5 — Instagram tools

Drew has existing Instagram tooling to fold in. Constraints: Instagram's API
(Meta Graph) needs a server-side token — a Netlify Function is the natural home
(the repo has no functions yet; add `netlify/functions/`).

- Store per-account social handles: `accounts.details->>'instagram'` (jsonb
  already exists) — backfill from Distru export where present.
- Use cases to build, in order of value: (1) content/post scheduler for the
  brand account, (2) prospect research — surface accounts' IG activity next to
  their CRM card, (3) DM outreach templates (manual send; automated DMs violate
  Meta ToS — don't).
- Keep tokens in Netlify env vars, never in the repo.

### 2.6 Infrastructure notes for the build-out

- **Sandbox network is allowlisted** (github/npm only). Supabase/Netlify/Drive/
  Gmail are reachable ONLY via their MCP connectors — use them. WebFetch is
  blocked; WebSearch works.
- Netlify MCP `deploy-site` from the sandbox is blocked — deploy by git push.
- If the app outgrows one file: split views into modules loaded by index.html
  before reaching for a framework; Supabase client code is already isolated.
- Backups: Supabase has PITR on paid tier; at minimum, periodically export
  `accounts`/`orders` to CSV (the app's Backup button covers the browser side).
- The `data/seed-*.json` + `scripts/seed-supabase.mjs` are the original one-time
  seeds — historical, do not re-run against the live DB.

### 2.7 Suggested build order (dependency-sorted)

1. `products` + `batches` + `stock_moves` + `order_items` (2.1) — everything
   else hangs off this.
2. Inventory tab UI + auto-decrement on order save.
3. Invoice generator on top of `order_items` (2.2).
4. COGS (`batch_costs`, margin reports) (2.4) — needs batches populated.
5. Order portal (2.3) — needs products/stock to show a catalog.
6. Sales manager dashboard (2.3) — mostly UI over existing data.
7. Instagram tools (2.5) — independent, do anytime after a Netlify Function
   exists.

---

## Quick reference

| What | Value |
|---|---|
| Live site | https://studiofarmscrm.netlify.app |
| Supabase project | `sgfqqhekkuatkpwmsrja` (https://sgfqqhekkuatkpwmsrja.supabase.co) |
| Netlify siteId | `3dfdc374-5105-471f-8387-d3b254e9825c` |
| Repo / branch | `studiofarms/SFNYCRM` / `claude/new-session-ri7sdj` |
| Logins | name-based (andrew, admin, bob, mike, bubu, flaco, brian) — passwords in "USER ACCOUNTS" Google Doc |
| Commission rate | `app_settings.commission_rate` (adjustable in UI) |
| Next invoice # | INV-0000034 |
| Name-match SQL | `regexp_replace(lower(regexp_replace(name,'^\*','')),'[^a-z0-9]','','g')` |
| Cardinal rules | pre-tax totals · discount = percent · paystatus manual · rename orders with accounts · every order gets a Drive `link` |
