# Hosting the CRM for a team — Supabase setup

This turns the browser-only CRM into a **shared, multi-user app**: everyone
logs in with their own account, all data lives in one cloud database, and
changes show up on everyone's screen in real time.

You do these steps once. They take ~15 minutes and need no coding.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> and sign up (free tier is fine for a team).
2. Click **New project**. Give it a name (e.g. `sfny-crm`), set a database
   password (save it somewhere), pick a region near you, and create it.
3. Wait ~2 minutes for it to finish provisioning.

## 2. Create the database tables

1. In the project, open **SQL Editor** (left sidebar) → **New query**.
2. Open the file [`schema.sql`](./schema.sql) in this folder, copy its entire
   contents, paste into the editor, and click **Run**.
3. You should see "Success". This created the `accounts`, `orders`, and `reps`
   tables, locked them down so only logged-in users can touch them, and turned
   on live updates.

## 3. Create the user logins

1. Open **Authentication** (left sidebar) → **Users** → **Add user** →
   **Create new user**.
2. Enter an email + password for each team member. Tick **Auto Confirm User**
   so they can log in immediately. Repeat for everyone.
   - You can change passwords or remove people here at any time.
3. (Optional) Under **Authentication → Sign In / Providers**, turn **off**
   "Allow new users to sign up" if you only want people you add by hand.

## 4. Connect the app

1. Open **Project Settings** (gear icon) → **Data API**: copy the **Project
   URL**.
2. Project Settings → **API Keys**: copy the **anon / public** key (NOT the
   secret/service_role one).
3. Open [`../supabase-config.js`](../supabase-config.js) and paste both values
   in, replacing the placeholders. Save.

## 5. Load the existing data (one time)

Your live data lives in your browser. Export it: open your current CRM and click
**💾 Backup** — it downloads a `sfny_crm_backup_<date>.json` file containing all
your accounts and orders. Then load it into Supabase with the bundled seeder.

You need the **service_role** secret key for this (Project Settings → API Keys →
`service_role`) — it bypasses row-level security so it can write the initial
data. Keep it secret; never commit it.

```bash
SUPABASE_URL="https://YOUR-ref.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..." \
SEED_BACKUP="./sfny_crm_backup_2026-06-24.json" \
npm run seed:supabase
```

It upserts on the primary key, so it's safe to re-run. To wipe the tables and
reload from scratch, prefix the command with `SEED_WIPE=1`. (If you omit
`SEED_BACKUP`, it falls back to the possibly-stale snapshot in `data/`.)

## 6. Deploy

Once the config is filled in and data is loaded, the repo root is a static
site — connect it to Netlify (or any static host) and share the URL with the
team. Everyone visits the link, logs in, and works off the same live data.

---

### What's left to finish

- [ ] The **Project URL** and **anon key** (step 4) pasted into
      `supabase-config.js`.
- [ ] The user logins created (step 3).
- [ ] The data seeded (step 5).
