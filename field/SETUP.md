# Studio Farms Field — setup

Do these in order. About 30 minutes the first time.

## 1. Supabase project
1. supabase.com → New project (any region; US East is closest to the Hudson Valley).
2. SQL Editor → paste all of `supabase/schema.sql` → Run.
3. Still in SQL Editor: edit the `insert into allowed_emails` block at the bottom with the team's real Gmail addresses (the ones they'll sign in with), run just that block again. You're the `is_admin = true` one.
4. Project Settings → API → copy the **Project URL** and the **anon public** key into `CONFIG` at the top of `index.html`.

## 2. Google sign-in + Calendar
1. Google Cloud Console → new project → APIs & Services → Enable **Google Calendar API**.
2. OAuth consent screen → External → add scopes `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `https://www.googleapis.com/auth/calendar.events`. Add each rep's email as a test user (or publish the app later).
3. Credentials → Create OAuth client ID → Web application.
   - Authorized redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback` (Supabase shows you this exact string under Authentication → Providers → Google).
4. Supabase → Authentication → Providers → Google → enable, paste Client ID + Client Secret.
5. Supabase → Authentication → URL Configuration → add your Netlify site URL to **Redirect URLs** (e.g. `https://sf-field.netlify.app`).

## 3. Netlify
1. Zip this whole folder (index.html, netlify.toml, netlify/) and drag it onto Netlify → Sites. Or connect a repo.
2. Site configuration → Environment variables, add:
   - `ANTHROPIC_API_KEY` — from console.anthropic.com (this powers "Write the recap")
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — same ones from step 2.3 (keeps Calendar connected past the first hour)
3. Redeploy after adding env vars.

## 4. Test
- Sign in as yourself. If you land on "Not on the roster", the email you signed in with isn't in `allowed_emails` — fix the spelling and re-run that block.
- Book a pop-up. It should show a "synced" pill and appear in your Google Calendar within seconds.
- Week tab → "Write the recap". If it errors, check `ANTHROPIC_API_KEY` is set and you redeployed.

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
