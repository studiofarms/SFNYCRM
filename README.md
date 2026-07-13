# Studio Farms CRM

A single-page CRM application. The entire UI — markup, styles, and logic — lives
in [`index.html`](./index.html) with **no build step**. It is hosted for the team
on **Supabase** (Postgres + Auth + Realtime): everyone logs in with their own
email/password, all data lives in one shared cloud database, and changes show up
live on every open screen.

## Architecture

- **`index.html`** — the whole app. Boots from a local cache for a fast first
  paint, then the data layer is taken over by Supabase.
- **`supabase-config.js`** — your project URL + anon key (safe to ship; access
  is gated by row-level security).
- **`supabase-app.js`** — auth gate + cloud data layer + realtime sync. Loaded
  last; it replaces `load()/save()/persist()` with Supabase reads/writes,
  subscribes to realtime, and refreshes the UI live.
- **`supabase/schema.sql`** — the database tables, RLS policies, and realtime
  publication. Run once in the Supabase SQL editor.
- **`supabase/SETUP.md`** — step-by-step setup walkthrough.
- **`scripts/seed-supabase.mjs`** — one-time loader for the cleaned data in
  `data/` (`npm run seed:supabase`).

The legacy per-browser data migrations (`sfcrm8_mig_*`) are **disabled** in the
hosted model — the database is the single source of truth and the cleaned data
is seeded into it once instead.

## Setup

See [`supabase/SETUP.md`](./supabase/SETUP.md). In short: create a Supabase
project, run `supabase/schema.sql`, add users, paste your URL + anon key into
`supabase-config.js`, then `npm run seed:supabase` to load the data.

## Running locally

```bash
npm run dev      # serves the folder on http://localhost:5173
```

Any static file server works (e.g. `python3 -m http.server 5173`). The app needs
a configured `supabase-config.js` and network access to your Supabase project to
log in and load data.

## External dependencies (loaded from CDNs at runtime)

- [@supabase/supabase-js](https://github.com/supabase/supabase-js) v2 — auth, data, realtime
- [Leaflet](https://leafletjs.com/) 1.9.4 — map view
- [Google Fonts](https://fonts.google.com/) — Syne, DM Mono, DM Sans

## Deploying

The app is static, so any static host works. A `netlify.toml` is included with
`publish = "."` and no build command. Connect the repo to Netlify (or drag the
folder onto it) and share the URL with the team.

## Notes

- A `localStorage` cache (`sfcrm8`, `ot_v7`) is still used for a fast first
  paint, but Supabase is authoritative — it overwrites the cache on login and on
  every realtime update.
- Because the UI is in one file, edits are made directly in `index.html`.
