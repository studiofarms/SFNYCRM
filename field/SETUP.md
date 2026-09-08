# Studio Farms Field — setup

## What is already done

| Piece | Status |
| --- | --- |
| Supabase project `sfny-field` (`susmoduqktplzgzqrcti`, us-east-2) | created |
| `supabase/schema.sql` applied — 10 tables, RLS on all of them, 36 policies | done |
| Storage buckets `shift-photos` and `gallery` (private, signed URLs) | created |
| `CONFIG.SUPABASE_URL` / `CONFIG.SUPABASE_ANON` in `index.html` | filled in |
| Roster seeded with `andrew@studiofarmsny.com` as admin | done |
| Netlify site `sfny-field` → https://sfny-field.netlify.app | created, not yet deployed |

Project URL: `https://susmoduqktplzgzqrcti.supabase.co`
Dashboard: https://supabase.com/dashboard/project/susmoduqktplzgzqrcti

## What still needs you

These four can't be done from an agent session — they need the Netlify and
Google consoles.

### 1. Connect the repo to Netlify (one time, ~1 minute)

https://app.netlify.com/projects/sfny-field → **Project configuration → Build &
deploy → Link repository** → pick `studiofarms/sfnycrm`, then set:

- **Branch to deploy:** `claude/netlify-supabase-hosting-kzmvau` (switch to `main` once merged)
- **Base directory:** `field`
- **Build command:** *(leave empty)*
- **Publish directory:** `field`
- **Functions directory:** `field/netlify/functions`

After that every push to the branch deploys automatically. The `netlify.toml`
inside `field/` already declares publish and functions, so the UI fields just
need to agree with it.

### 2. Netlify environment variables

Project configuration → Environment variables:

- `ANTHROPIC_API_KEY` — from console.anthropic.com. Powers "Write the recap".
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — from step 3 below. Without
  these, Calendar sync dies after an hour and reps have to sign out and back in.

Redeploy after adding them — functions only pick up env vars on a new deploy.

### 3. Google sign-in + Calendar

1. Google Cloud Console → new project → APIs & Services → enable **Google Calendar API**.
2. OAuth consent screen → External → add scopes `.../auth/userinfo.email`,
   `.../auth/userinfo.profile`, `https://www.googleapis.com/auth/calendar.events`.
   Add each rep's email as a test user (or publish the app).
3. Credentials → Create OAuth client ID → Web application → authorized redirect URI:
   `https://susmoduqktplzgzqrcti.supabase.co/auth/v1/callback`
4. Supabase → Authentication → Providers → Google → enable, paste Client ID + Secret.
5. Supabase → Authentication → URL Configuration → add `https://sfny-field.netlify.app`
   to **Site URL** and **Redirect URLs**.

### 4. Add the rest of the roster

Only Andrew is on it. In the Supabase SQL editor, edit and run the
`insert into allowed_emails` block at the bottom of `supabase/schema.sql` with
each rep's real Google sign-in address. Anyone not in that table can sign in
but sees "Not on the roster".

## Why its own Supabase project

The CRM project (`sfny-crm`) already has `orders` and `products` tables with
completely different columns. Because `schema.sql` uses
`create table if not exists`, running it there would have silently skipped
those two and left the field app reading the CRM's tables — broken in a way
that wouldn't surface until someone logged an order.

## Test

- Sign in as yourself. "Not on the roster" means the address you signed in with
  isn't in `allowed_emails` — fix the spelling and re-run that block.
- Book a pop-up. It should show a "synced" pill and appear in Google Calendar
  within seconds.
- Week tab → "Write the recap". An error here means `ANTHROPIC_API_KEY` is
  missing or you haven't redeployed since setting it.

## Already ran an older schema.sql?
Just run the new one again. Every statement is `if not exists` / `add column if not exists`, so it only adds what's missing (shops, samples, gallery_photos, new columns, the gallery bucket).

## Seeding shops from the CRM
The `shops` table takes `name, address, town`. Export those three columns from the CRM as CSV and use Supabase → Table Editor → shops → Insert → Import from CSV. Names are unique (case-insensitive), so duplicates get rejected rather than doubled.

## Orders, price list, commission
- The `products` table is the price list reps see when logging an order. Fill it from Supabase → Table Editor (name, unit, price). Set `active = false` to retire a product without losing old orders. Reps can still type a product that isn't listed.
- Commission rate is per rep in `allowed_emails.commission_rate` (0.03 = 3%). It's stamped onto each order at the time it's logged, so changing a rate later doesn't rewrite history.
- Logging an order automatically moves that shop's pipeline entry to "Order placed", sets the shop's last-order date, and clears its "reorder soon" flag.
- Week tab → "Export orders CSV" / "Export hours CSV" give you a file per week for RevTrak and payroll.

## Things you'll want to change later
- Mileage rate: `CONFIG.MILEAGE_RATE` in `index.html`.
- Pipeline stages: the `STAGES` array in `index.html`.
- Recap voice: the prompt in `netlify/functions/recap.js`.
- Sample units: the `<select id="f-unit">` options in `sampleSheet()` (grams / pre-packs / pre-rolls).
- Default follow-up windows: 7 days after a sample drop, 3 days after a meeting with a next step but no date. Both in `index.html`.

## If Calendar stops syncing
Google tokens die after an hour; the `gcal-refresh` function renews them silently as long as the two Google env vars are set. If they're not set, reps just sign out and back in.
