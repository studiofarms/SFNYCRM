#!/usr/bin/env node
// ============================================================================
// One-time Supabase seeder for the Studio Farms CRM.
// ----------------------------------------------------------------------------
// Loads the cleaned, exported data (data/seed-accounts.json, seed-orders.json,
// seed-reps.json) into your Supabase Postgres tables. Run this ONCE, after
// you've created the project and run supabase/schema.sql.
//
// It upserts on the primary key, so it is safe to re-run (existing rows are
// updated, not duplicated). It uses the SERVICE ROLE key (bypasses RLS) — that
// key is a SECRET: never commit it or put it in the browser. Pass it via env.
//
// Data source (in priority order):
//   1. SEED_BACKUP=<file> — a backup JSON exported from the app's "Backup"
//      button. This is the CANONICAL, fully-migrated dataset as it exists in
//      your browser right now (it wraps the `sfcrm8` and `ot_v7` localStorage
//      values). Prefer this.
//   2. The cleaned files in data/ (seed-accounts.json / seed-orders.json /
//      seed-reps.json). NOTE: these may be older than your live data — the
//      script warns when it falls back to them.
//
// Usage:
//   SUPABASE_URL="https://YOUR-ref.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..." \
//   SEED_BACKUP="./sfny_crm_backup_2026-06-24.json" \
//   node scripts/seed-supabase.mjs
//
// Optional: SEED_WIPE=1 deletes existing rows in the three tables first
// (orders, then accounts, then reps) for a clean reload.
// ============================================================================
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!URL_ || !KEY) {
  console.error('Missing env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Find them in: Supabase Dashboard -> Project Settings -> Data API (URL) ' +
    'and API Keys -> service_role (secret).');
  process.exit(1);
}

const REST = URL_.replace(/\/$/, '') + '/rest/v1';
const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

const headers = {
  'apikey': KEY,
  'Authorization': 'Bearer ' + KEY,
  'Content-Type': 'application/json',
};

async function readJson(name) {
  return JSON.parse(await readFile(join(DATA, name), 'utf8'));
}

// Load { accounts, orders, reps } from either a backup export or the data/ files.
async function loadSource() {
  const backupPath = process.env.SEED_BACKUP;
  if (backupPath) {
    console.log(`Source: backup file ${backupPath}`);
    const backup = JSON.parse(await readFile(backupPath, 'utf8'));
    // The backup wraps the raw localStorage values as JSON strings.
    const accounts = backup.sfcrm8 ? JSON.parse(backup.sfcrm8) : [];
    const ot = backup.ot_v7 ? JSON.parse(backup.ot_v7) : {};
    const orders = Array.isArray(ot.orders) ? ot.orders : [];
    const reps = Array.isArray(ot.reps) ? ot.reps : [];
    if (!Array.isArray(accounts)) throw new Error('backup.sfcrm8 did not parse to an array');
    return { accounts, orders, reps };
  }
  console.warn('Source: data/*.json (no SEED_BACKUP set). These may be older than ' +
    'your live data — export a fresh backup from the app and pass SEED_BACKUP=<file> ' +
    'for the canonical dataset.');
  const [accounts, orders, reps] = await Promise.all([
    readJson('seed-accounts.json'),
    readJson('seed-orders.json'),
    readJson('seed-reps.json'),
  ]);
  return { accounts, orders, reps };
}

// ----- mappings (mirror supabase-app.js) -----------------------------------
const KNOWN_ACCT = new Set(['id','name','location','address','contact','email','phone',
  'website','stage','tags','salesRep','role','dba','details','altContacts','activity']);

function acctToRow(a) {
  const details = (a.details && typeof a.details === 'object') ? { ...a.details } : {};
  const extra = {}; let hasExtra = false;
  for (const k of Object.keys(a)) { if (!KNOWN_ACCT.has(k)) { extra[k] = a[k]; hasExtra = true; } }
  if (hasExtra) details.__extra = extra;
  return {
    id: a.id,
    name: a.name || '',
    location: a.location ?? null,
    address: a.address ?? null,
    contact: a.contact ?? null,
    email: a.email ?? null,
    phone: a.phone ?? null,
    website: a.website ?? null,
    stage: a.stage ?? null,
    tags: Array.isArray(a.tags) ? a.tags : [],
    sales_rep: a.salesRep ?? null,
    role: a.role ?? null,
    dba: a.dba ?? null,
    details,
    alt_contacts: Array.isArray(a.altContacts) ? a.altContacts : [],
    activity: Array.isArray(a.activity) ? a.activity : [],
  };
}

const num = (x) => (x === '' || x == null || isNaN(parseFloat(x))) ? null : parseFloat(x);
const ORDER_KEYS = ['date','delivery','paydue','dispensary','dba','license','name','email',
  'phone','addr','paymethod','terms','paystatus','ordstatus','track','carrier','link',
  'website','salesrep','notes'];

function orderToRow(o) {
  const row = {
    id: String(o.id),
    account_id: typeof o.account_id === 'number' ? o.account_id : null,
    oz: num(o.oz), price: num(o.price), total: num(o.total), discount: num(o.discount),
  };
  for (const k of ORDER_KEYS) row[k] = o[k] ?? null;
  return row;
}

// ----- REST helpers ---------------------------------------------------------
async function upsert(table, rows) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const res = await fetch(`${REST}/${table}`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      throw new Error(`upsert ${table} [${i}..${i + batch.length}] failed: ${res.status} ${await res.text()}`);
    }
    process.stdout.write(`  ${table}: ${Math.min(i + batch.length, rows.length)}/${rows.length}\r`);
  }
  process.stdout.write('\n');
}

async function wipe(table) {
  // Delete everything. PostgREST needs a filter; `id=not.is.null` matches all.
  const col = table === 'reps' ? 'name' : 'id';
  const res = await fetch(`${REST}/${table}?${col}=not.is.null`, {
    method: 'DELETE',
    headers: { ...headers, 'Prefer': 'return=minimal' },
  });
  if (!res.ok) throw new Error(`wipe ${table} failed: ${res.status} ${await res.text()}`);
  console.log(`  wiped ${table}`);
}

async function main() {
  const { accounts, orders, reps } = await loadSource();

  console.log(`Loaded: ${accounts.length} accounts, ${orders.length} orders, ${reps.length} reps`);
  console.log(`Target: ${REST}`);

  if (process.env.SEED_WIPE === '1') {
    console.log('SEED_WIPE=1 — clearing existing rows first…');
    await wipe('orders');     // FK -> accounts, delete children first
    await wipe('accounts');
    await wipe('reps');
  }

  console.log('Seeding accounts…');
  await upsert('accounts', accounts.map(acctToRow));
  console.log('Seeding orders…');
  await upsert('orders', orders.map(orderToRow));
  console.log('Seeding reps…');
  await upsert('reps', reps.map((name) => ({ name })));

  console.log('Done. ✅');
}

main().catch((e) => { console.error('\nSeed failed:', e.message); process.exit(1); });
