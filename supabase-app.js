// ============================================================================
// Studio Farms CRM — Supabase integration (auth gate + cloud data + realtime)
// ----------------------------------------------------------------------------
// This file is loaded LAST, after index.html's own <script> has defined the
// app's globals (accounts, rt_orders, reps) and functions (load/save/persist/
// render/...). It:
//
//   1. Gates the app behind Supabase email/password auth (reusing the existing
//      #pw-gate splash as the login screen — see checkPw() in index.html).
//   2. Replaces the localStorage data layer with Supabase: it loads accounts /
//      orders / reps from Postgres into the app's in-memory globals, and
//      overrides save()/persist() to push changes back to the cloud.
//   3. Subscribes to Realtime so every open browser refreshes live when anyone
//      changes the shared data.
//
// The anon key (in supabase-config.js) is safe in the browser: row-level
// security in schema.sql only grants access to logged-in users.
// ============================================================================
(function () {
  'use strict';

  var CFG = window.SUPABASE_CONFIG || {};
  var configMissing =
    !window.supabase ||
    !CFG.url || !CFG.anonKey ||
    /YOUR-PROJECT-ref/i.test(CFG.url) ||
    /YOUR-ANON-PUBLIC-KEY/i.test(CFG.anonKey);

  // ----- tiny DOM helpers ----------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function setErr(msg) { var e = $('pw-err'); if (e) e.textContent = msg || ''; }

  function hideGate() {
    var gate = $('pw-gate');
    if (!gate) return;
    gate.style.transition = 'opacity 0.5s';
    gate.style.opacity = '0';
    setTimeout(function () { gate.style.display = 'none'; }, 500);
  }
  function showGate() {
    var gate = $('pw-gate');
    if (!gate) return;
    gate.style.display = 'flex';
    gate.style.opacity = '1';
    var btn = $('pw-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Log in'; }
  }

  if (configMissing) {
    // Don't let the user bang on a login that can't work. Tell them what's up.
    window.sbLogin = function () {
      return Promise.reject(new Error(
        'Supabase is not configured yet. Fill in supabase-config.js (Project URL + anon key).'));
    };
    showGate();
    setErr('Setup needed: add your Supabase URL + anon key to supabase-config.js.');
    var btn = $('pw-btn'); if (btn) btn.disabled = true;
    console.error('[supabase] Not configured — set window.SUPABASE_CONFIG in supabase-config.js, ' +
                  'and make sure the @supabase/supabase-js script loaded.');
    return;
  }

  var sb = window.supabase.createClient(CFG.url, CFG.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  window.sbClient = sb;

  // ===========================================================================
  // Row <-> app-object mapping
  //   accounts: snake_case columns + jsonb; app uses camelCase (salesRep,
  //             altContacts) and a free-form `details` object.
  //   orders:   columns match the app's field names 1:1.
  //   reps:     plain list of names.
  // ===========================================================================
  var KNOWN_ACCT_KEYS = {
    id:1, name:1, location:1, address:1, contact:1, email:1, phone:1, website:1,
    stage:1, tags:1, salesRep:1, role:1, dba:1, details:1, altContacts:1, activity:1
  };

  function acctToRow(a) {
    // Preserve any unforeseen top-level fields so nothing is silently dropped.
    var details = (a.details && typeof a.details === 'object') ? Object.assign({}, a.details) : {};
    var extra = {}, hasExtra = false;
    for (var k in a) {
      if (a.hasOwnProperty(k) && !KNOWN_ACCT_KEYS[k]) { extra[k] = a[k]; hasExtra = true; }
    }
    if (hasExtra) details.__extra = extra; else delete details.__extra;
    return {
      id: a.id,
      name: a.name || '',
      location: a.location != null ? a.location : null,
      address: a.address != null ? a.address : null,
      contact: a.contact != null ? a.contact : null,
      email: a.email != null ? a.email : null,
      phone: a.phone != null ? a.phone : null,
      website: a.website != null ? a.website : null,
      stage: a.stage != null ? a.stage : null,
      tags: Array.isArray(a.tags) ? a.tags : [],
      sales_rep: a.salesRep != null ? a.salesRep : null,
      role: a.role != null ? a.role : null,
      dba: a.dba != null ? a.dba : null,
      details: details,
      alt_contacts: Array.isArray(a.altContacts) ? a.altContacts : [],
      activity: Array.isArray(a.activity) ? a.activity : []
    };
  }

  function acctFromRow(r) {
    var details = (r.details && typeof r.details === 'object') ? Object.assign({}, r.details) : {};
    var extra = details.__extra; delete details.__extra;
    var a = {
      id: r.id,
      name: r.name || '',
      location: r.location || '',
      address: r.address || '',
      contact: r.contact || '',
      email: r.email || '',
      phone: r.phone || '',
      website: r.website || '',
      stage: r.stage || '',
      tags: Array.isArray(r.tags) ? r.tags : [],
      details: details,
      altContacts: Array.isArray(r.alt_contacts) ? r.alt_contacts : [],
      activity: Array.isArray(r.activity) ? r.activity : []
    };
    if (r.sales_rep) a.salesRep = r.sales_rep;
    if (r.role) a.role = r.role;
    if (r.dba) a.dba = r.dba;
    if (extra && typeof extra === 'object') Object.assign(a, extra);
    return a;
  }

  function num(x) {
    if (x === '' || x == null) return null;
    var n = parseFloat(x);
    return isNaN(n) ? null : n;
  }
  var ORDER_KEYS = ['date','delivery','paydue','dispensary','dba','license','name',
    'email','phone','addr','paymethod','terms','paystatus','ordstatus','track',
    'carrier','link','website','salesrep','notes'];

  function orderToRow(o) {
    var row = {
      id: String(o.id),
      account_id: (typeof o.account_id === 'number') ? o.account_id : null,
      oz: num(o.oz), price: num(o.price), total: num(o.total), discount: num(o.discount)
    };
    for (var i = 0; i < ORDER_KEYS.length; i++) {
      var k = ORDER_KEYS[i];
      row[k] = (o[k] != null) ? o[k] : null;
    }
    return row;
  }

  function orderFromRow(r) {
    var o = {
      id: r.id,
      oz: Number(r.oz) || 0, price: Number(r.price) || 0,
      total: Number(r.total) || 0, discount: Number(r.discount) || 0
    };
    for (var i = 0; i < ORDER_KEYS.length; i++) {
      var k = ORDER_KEYS[i];
      o[k] = r[k] || '';
    }
    return o;
  }

  // ===========================================================================
  // In-memory + localStorage application of fetched data
  // ===========================================================================
  function replaceArray(arr, items) {
    if (!Array.isArray(arr)) return;
    arr.length = 0;
    Array.prototype.push.apply(arr, items);
  }

  function mirrorLocal() {
    // Keep the localStorage cache coherent so a reload paints real data fast.
    try { localStorage.setItem('sfcrm8', JSON.stringify(window.accounts || [])); } catch (e) {}
    try {
      localStorage.setItem('ot_v7', JSON.stringify({ orders: window.rt_orders || [], reps: window.reps || [] }));
    } catch (e) {}
  }

  function refreshViews() {
    ['render', 'renderTable', 'renderCompanies', 'rt_renderStats', 'rt_renderRevenue'].forEach(function (fn) {
      try { if (typeof window[fn] === 'function') window[fn](); } catch (e) { console.warn('[supabase] ' + fn + ' failed', e); }
    });
  }

  // ===========================================================================
  // Change-tracking snapshots (so save()/persist() push only what changed —
  // keeps writes small and Realtime quiet).
  // ===========================================================================
  var snapAccounts = {}; // id(string) -> JSON(row)
  var snapOrders = {};   // id(string) -> JSON(row)
  var snapReps = {};     // name -> true

  function snapshotAll() {
    snapAccounts = {};
    (window.accounts || []).forEach(function (a) { snapAccounts[String(a.id)] = JSON.stringify(acctToRow(a)); });
    snapOrders = {};
    (window.rt_orders || []).forEach(function (o) { if (o && o.id != null) snapOrders[String(o.id)] = JSON.stringify(orderToRow(o)); });
    snapReps = {};
    (window.reps || []).forEach(function (n) { snapReps[n] = true; });
  }

  // ===========================================================================
  // Loading from Supabase
  // ===========================================================================
  async function fetchAll() {
    var res = await Promise.all([
      sb.from('accounts').select('*').order('id', { ascending: true }),
      sb.from('orders').select('*'),
      sb.from('reps').select('*')
    ]);
    res.forEach(function (r) { if (r.error) throw r.error; });
    return { accounts: res[0].data || [], orders: res[1].data || [], reps: res[2].data || [] };
  }

  function applyData(data) {
    replaceArray(window.accounts, data.accounts.map(acctFromRow));
    replaceArray(window.rt_orders, data.orders.map(orderFromRow));
    replaceArray(window.reps, data.reps.map(function (r) { return r.name; }));
    mirrorLocal();
    snapshotAll();
    refreshViews();
  }

  // First-run provisioning: if the shared DB is empty, seed it once from the
  // canonical dataset bundled with the app (data/seed-*.json — the cleaned,
  // migration-applied export). Runs in the logged-in user's session, so RLS
  // permits the writes. Safe/idempotent: it only fires when accounts is empty.
  async function seedIfEmpty() {
    var base = new URL('.', window.location.href).href; // same-origin app root
    async function load(name) {
      var res = await fetch(base + 'data/' + name, { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch ' + name + ' -> ' + res.status);
      return res.json();
    }
    var accounts, orders, reps;
    try {
      var loaded = await Promise.all([load('seed-accounts.json'), load('seed-orders.json'), load('seed-reps.json')]);
      accounts = loaded[0]; orders = loaded[1]; reps = loaded[2];
    } catch (e) {
      console.error('[supabase] seed data not found, starting empty:', e);
      return;
    }
    async function chunkUpsert(table, rows) {
      for (var i = 0; i < rows.length; i += 200) {
        var r = await sb.from(table).upsert(rows.slice(i, i + 200));
        if (r.error) throw r.error;
      }
    }
    log('[supabase] empty database — seeding ' + accounts.length + ' accounts, ' +
      orders.length + ' orders, ' + reps.length + ' reps…');
    await chunkUpsert('accounts', accounts.map(acctToRow));
    await chunkUpsert('orders', orders.filter(function (o) { return o && o.id != null; }).map(orderToRow));
    await chunkUpsert('reps', reps.map(function (n) { return { name: n }; }));
    console.log('[supabase] seed complete.');
  }
  function log(m) { console.log(m); }

  // ===========================================================================
  // Pushing to Supabase (diff-based)
  // ===========================================================================
  var SUPPRESS_MS = 1800;            // ignore our own realtime echoes for this long
  var suppressRealtimeUntil = 0;
  function bumpSuppress() { suppressRealtimeUntil = Date.now() + SUPPRESS_MS; }

  function setSyncState(state) {
    // state: 'idle' | 'saving' | 'error'
    var el = $('sb-sync');
    if (!el) return;
    if (state === 'saving') { el.textContent = 'Syncing…'; el.style.display = 'block'; el.style.color = '#c8a96e'; }
    else if (state === 'error') { el.textContent = 'Sync failed — will retry'; el.style.display = 'block'; el.style.color = '#f08080'; }
    else { el.style.display = 'none'; }
  }

  async function pushAccounts() {
    var rows = (window.accounts || []).map(acctToRow);
    var upserts = [], curIds = {};
    rows.forEach(function (row) {
      var key = String(row.id);
      curIds[key] = true;
      var js = JSON.stringify(row);
      if (snapAccounts[key] !== js) upserts.push(row);
    });
    var deletes = [];
    for (var key in snapAccounts) { if (snapAccounts.hasOwnProperty(key) && !curIds[key]) deletes.push(Number(key)); }
    if (!upserts.length && !deletes.length) return;
    bumpSuppress();
    if (upserts.length) { var u = await sb.from('accounts').upsert(upserts); if (u.error) throw u.error; }
    if (deletes.length) { var d = await sb.from('accounts').delete().in('id', deletes); if (d.error) throw d.error; }
    bumpSuppress();
    // Refresh snapshot to current state.
    snapAccounts = {};
    rows.forEach(function (row) { snapAccounts[String(row.id)] = JSON.stringify(row); });
  }

  async function pushOrders() {
    var rows = (window.rt_orders || []).filter(function (o) { return o && o.id != null; }).map(orderToRow);
    var upserts = [], curIds = {};
    rows.forEach(function (row) {
      var key = String(row.id);
      curIds[key] = true;
      var js = JSON.stringify(row);
      if (snapOrders[key] !== js) upserts.push(row);
    });
    var deletes = [];
    for (var key in snapOrders) { if (snapOrders.hasOwnProperty(key) && !curIds[key]) deletes.push(key); }
    if (upserts.length || deletes.length) {
      bumpSuppress();
      if (upserts.length) { var u = await sb.from('orders').upsert(upserts); if (u.error) throw u.error; }
      if (deletes.length) { var d = await sb.from('orders').delete().in('id', deletes); if (d.error) throw d.error; }
      bumpSuppress();
      snapOrders = {};
      rows.forEach(function (row) { snapOrders[String(row.id)] = JSON.stringify(row); });
    }
    // reps ride along with persist()
    await pushReps();
  }

  async function pushReps() {
    var cur = {}, adds = [];
    (window.reps || []).forEach(function (n) { cur[n] = true; if (!snapReps[n]) adds.push({ name: n }); });
    var dels = [];
    for (var n in snapReps) { if (snapReps.hasOwnProperty(n) && !cur[n]) dels.push(n); }
    if (!adds.length && !dels.length) return;
    bumpSuppress();
    if (adds.length) { var u = await sb.from('reps').upsert(adds); if (u.error) throw u.error; }
    if (dels.length) { var d = await sb.from('reps').delete().in('name', dels); if (d.error) throw d.error; }
    bumpSuppress();
    snapReps = cur;
  }

  // Number of flushers with unsaved or in-flight local changes. While > 0 we
  // hold off applying remote refreshes so a concurrent realtime event can't
  // clobber edits that haven't reached the cloud yet.
  var pendingWrites = 0;

  // Debounced, retrying flushers ---------------------------------------------
  function makeFlusher(pushFn, label) {
    var timer = null, inFlight = false, pendingRetry = false, counted = false;
    function markBusy() { if (!counted) { counted = true; pendingWrites++; } }
    function clearBusy() { if (counted) { counted = false; pendingWrites--; } }
    function run() {
      timer = null;
      if (inFlight) { pendingRetry = true; return; }
      inFlight = true;
      setSyncState('saving');
      pushFn().then(function () {
        inFlight = false;
        setSyncState('idle');
        if (pendingRetry) { pendingRetry = false; schedule(); }
        else { clearBusy(); }
      }).catch(function (e) {
        inFlight = false;
        console.error('[supabase] ' + label + ' sync failed', e);
        setSyncState('error');
        setTimeout(schedule, 4000); // retry; stays "busy" until it succeeds
      });
    }
    function schedule() {
      markBusy();
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 600);
    }
    return schedule;
  }
  var scheduleAccountsPush = makeFlusher(pushAccounts, 'accounts');
  var scheduleOrdersPush = makeFlusher(pushOrders, 'orders+reps');

  // ===========================================================================
  // Realtime
  // ===========================================================================
  var refreshTimer = null;
  function scheduleRemoteRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      refreshTimer = null;
      if (pendingWrites > 0) { scheduleRemoteRefresh(); return; } // wait for local writes to flush
      fetchAll().then(applyData).catch(function (e) { console.error('[supabase] realtime refresh failed', e); });
    }, 450);
  }
  function onRemoteChange() {
    if (Date.now() < suppressRealtimeUntil) return; // our own write echoing back
    scheduleRemoteRefresh();
  }
  function subscribeRealtime() {
    sb.channel('sfcrm-shared')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, onRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reps' }, onRemoteChange)
      .subscribe();
  }

  // ===========================================================================
  // Logout control + sync-status pill
  // ===========================================================================
  function installChrome(email) {
    if ($('sb-userbar')) { var em = $('sb-user-email'); if (em) em.textContent = email || ''; return; }
    var bar = document.createElement('div');
    bar.id = 'sb-userbar';
    bar.style.cssText = 'position:fixed;top:8px;right:10px;z-index:9000;display:flex;' +
      'align-items:center;gap:10px;font-family:"DM Sans",sans-serif;font-size:12px;';
    bar.innerHTML =
      '<span id="sb-sync" style="display:none;font-size:11px;"></span>' +
      '<span id="sb-user-email" style="color:var(--text3,#8a8f9c);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>' +
      '<button id="sb-logout" style="background:var(--surface3,#1b1e27);color:var(--text2,#c8ccd6);' +
      'border:1px solid var(--border,#2a2e3a);border-radius:8px;padding:5px 10px;cursor:pointer;' +
      'font-family:inherit;font-size:12px;">Log out</button>';
    document.body.appendChild(bar);
    $('sb-user-email').textContent = email || '';
    $('sb-logout').addEventListener('click', function () {
      sb.auth.signOut().then(function () { location.reload(); }).catch(function () { location.reload(); });
    });
  }

  // ===========================================================================
  // Boot
  // ===========================================================================
  // Initial load can transiently fail right after login if the auth token's
  // "issued at" is a moment ahead of the data service's clock ("JWT issued at
  // future") — a brief server-side skew. Retry a few times before giving up so
  // a one-off blip doesn't surface as "Could not load data".
  async function fetchAllWithRetry(tries) {
    var lastErr;
    for (var i = 0; i < tries; i++) {
      try { return await fetchAll(); }
      catch (e) {
        lastErr = e;
        if (i < tries - 1) await new Promise(function (r) { setTimeout(r, 1200); });
      }
    }
    throw lastErr;
  }

  var started = false;
  async function start(session) {
    if (started) return;
    started = true;
    try {
      var data = await fetchAllWithRetry(4);
      if (!data.accounts.length && !data.orders.length) {
        await seedIfEmpty();
        data = await fetchAll();
      }
      applyData(data);
      // Match the original boot behaviour: auto-create company cards for any
      // orders whose dispensary has no account, then sync those once.
      try {
        if (typeof window.ensureCompaniesForOrders === 'function' && window.ensureCompaniesForOrders() > 0) {
          mirrorLocal();
          refreshViews();
          scheduleAccountsPush();
        }
      } catch (e) {}

      // Swap the data layer over to the cloud.
      var origSave = window.save, origPersist = window.persist;
      window.save = function () { try { if (origSave) origSave(); } catch (e) {} scheduleAccountsPush(); };
      window.persist = function () { try { if (origPersist) origPersist(); } catch (e) {} scheduleOrdersPush(); scheduleAccountsPush(); };

      subscribeRealtime();
      installChrome(session && session.user ? session.user.email : '');
      hideGate();
    } catch (e) {
      started = false;
      console.error('[supabase] initial load failed', e);
      showGate();
      setErr('Could not load data: ' + (e && e.message ? e.message : 'unknown error'));
    }
  }

  // Login entry point used by checkPw() in index.html.
  window.sbLogin = async function (email, password) {
    // Support "no email" username logins (e.g. "admin"): if the value has no
    // "@", map it to the internal studiofarms.local domain. Real email logins
    // (which contain "@") are unaffected. Emails are case-insensitive.
    var ident = (email || '').trim().toLowerCase();
    if (ident && ident.indexOf('@') === -1) ident = ident + '@studiofarms.local';
    var res = await sb.auth.signInWithPassword({ email: ident, password: password });
    if (res.error) {
      var m = res.error.message || 'Login failed.';
      if (/invalid login credentials/i.test(m)) m = 'Incorrect email or password.';
      throw new Error(m);
    }
    // onAuthStateChange handles start(); resolve so the button resets cleanly.
    return res.data;
  };

  sb.auth.onAuthStateChange(function (event, session) {
    if (session) { start(session); }
    else if (event === 'SIGNED_OUT') { /* reload() already triggered by logout */ }
  });

  // Decide initial state.
  sb.auth.getSession().then(function (res) {
    var session = res && res.data ? res.data.session : null;
    if (session) start(session);
    else showGate();
  }).catch(function (e) {
    console.error('[supabase] getSession failed', e);
    showGate();
    setErr('Auth error: ' + (e && e.message ? e.message : 'unknown'));
  });
})();
