# Drew's guide to the CRM

This is your project. The guide below is the thing you come back to
when you forget how something works. There are **only two things you
do** that aren't "use the CRM normally":

1. **Updating the look or behavior** — same loop you've always used:
   open `index.html`, give it to Claude with what you want changed,
   drop the project folder into Netlify.
2. **Operational stuff** — passwords, the Resend email key, watching
   deploys. All in the Netlify dashboard.

Everything else — adding dispensaries, marking orders paid, working
leads — happens inside the CRM itself. No code, no files.

---

## The project folder

You have a folder on your computer called `sfny-crm` (or whatever you
named it). It contains everything Netlify needs to run the site:
`index.html`, the server functions, the database setup, the docs you're
reading right now.

**Keep this folder somewhere stable.** Desktop, Dropbox, iCloud Drive —
anywhere you'll find it again. Don't delete it. If you ever lose it,
ping Michael and he'll send you a fresh copy.

**You only ever edit one file in there: `index.html`.** Everything else
in the folder runs the back end. Don't open them, don't move them,
don't worry about them. If you find yourself opening anything in
`netlify/` or `db/`, close it — you don't need it.

---

## Updating the look or behavior

This is the same loop you used before, with one extra step at the end.

1. **Open `index.html`** in the folder. Open it in any text editor —
   even TextEdit on Mac is fine.
2. **Select all (Cmd+A), copy (Cmd+C).** You're going to paste it into
   Claude.
3. **Go to claude.ai.** Start a new chat. Paste the HTML. Describe
   what you want changed:
   - *"Make the Leads tab badge red instead of blue."*
   - *"Add a Notes field to the order form that saves with the order."*
   - *"The map markers should be larger when an account is in 'Repeat'
     stage."*
4. **Claude responds with the updated HTML.** Copy what it gives you.
5. **Paste it back into `index.html`**, overwriting what was there.
   Save the file.
6. **Drop the folder onto Netlify.** Go to
   https://app.netlify.com/projects/sfny-crm/deploys and drag the
   whole `sfny-crm` folder into the **"Need to update your site?
   Drag and drop your site output folder here"** zone at the bottom.
   You'll see a new deploy start. It takes about a minute.
7. **Refresh the CRM** in your browser. Your change is live.

That's the whole loop. You never need a terminal, you never need git,
you never need to know what TypeScript is.

### How to tell if your change deployed

There's a small **Deploys** link in the bottom-right corner of every
page. After a fresh drag-drop, click it — Netlify's Deploys page
opens, and your new deploy will be at the top with a green ✓ when
it's finished. That's your confirmation it shipped. (You can also
just refresh the CRM and look at whatever you changed — if it looks
different, it shipped.)

### If something breaks after a deploy

Netlify keeps every past deploy. To roll back:

1. Go to https://app.netlify.com/projects/sfny-crm/deploys
2. Find a green ✓ deploy from before things broke.
3. Click it, then click **"Publish deploy"**.
4. Site reverts to that version within a minute.

You can do this as many times as you need. The bad deploy stays in
history so you can study what happened, but it's not live anymore.

### What NOT to ask Claude to change

If you ever find yourself asking Claude to:
- Change something in `netlify/functions/` or `db/`
- Add a new "endpoint" or "API route"
- Change how data is stored

…stop and text Michael instead (use the **Send a request** link in
the CRM footer). Those are the things that need a developer touch.
Almost everything you'll want to change is in `index.html`.

---

## Daily work (inside the CRM)

You never need to edit code for any of this. It all happens in the
app.

| Want to… | Where |
|----------|-------|
| Add a new dispensary | **+ New Account** (top toolbar). The address field auto-completes — pick a result so the map gets the right pin. |
| Add a new order/invoice | Open the account, use the order modal. Fill in the invoice number, totals, terms, due date. |
| Add a sales rep | Sales Rep modal (👥). Type a name, hit Add. |
| Triage a new lead | **📥 Leads** tab. Promote turns a lead into a real account; Spam hides it. |
| Backup everything | **💾 Backup** button. Downloads a JSON snapshot to your computer. |
| Restore a backup | **📂 Restore** button. Uploads a JSON snapshot back to the server. Use carefully — it can wipe newer data. |

A few things to know about how it works now (different from the old
version):

- **Your data lives on a server**, not in your browser. Switch devices
  freely — laptop, phone, whatever. Everything stays in sync within
  ~15 seconds.
- **Two tabs open at once is safe.** The old version would silently
  lose edits if you had two tabs open. That bug is gone.
- **Deleting is soft.** When you delete an account or order, it
  archives instead of really destroying the data. If you misclick,
  ping Michael — he can un-archive things.

---

## Operations (Netlify dashboard)

Almost everything in this section is one-time setup or rare
maintenance. Dashboard:
**https://app.netlify.com/projects/sfny-crm**

### Environment variables

Found under **Site configuration → Environment variables**. The ones
that matter:

| Variable | What it does | Default if unset |
|----------|--------------|------------------|
| `SHARED_PASSWORD` | The password people use to log into the CRM (currently `sfny420`). | `sfny420` |
| `RESEND_API_KEY` | Lets the Net-30 reminder cron actually send emails. | Unset → cron runs in DRY-RUN |
| `RESEND_FROM` | The "From:" address on reminder emails. | `Studio Farms <onboarding@resend.dev>` |

To rotate the password: edit `SHARED_PASSWORD`, save, redeploy (or
wait for the next deploy). Anyone with an active session stays logged
in until their 30-day cookie expires.

To turn reminder emails on for real: sign up for [Resend](https://resend.com)
(free tier covers our volume), create an API key, paste it into
`RESEND_API_KEY`, redeploy. The next daily cron run starts sending.

### Watching the Net-30 cron

Under **Functions → check-reminders** in the dashboard. Each daily
run logs a summary line like:

```
[reminders] summary {"today":"...","dryRun":false,"candidates":42,"attempted":3,"sent":3,"skipped":39,"errors":[]}
```

If `dryRun: true`, `RESEND_API_KEY` isn't set yet. If `errors` has
anything in it, send Michael the line.

### Watching deploys

Under **Deploys**. The latest deploy's status (🟢 published / 🔴
failed) is at the top. After a drag-drop, you'll see a fresh deploy
appear. Click into it to see logs if anything went wrong.

---

## When something is harder than a `index.html` edit

There's a **Send a request** link in the bottom-right corner of the
CRM. Click it. It opens a pre-filled email to Michael with the page
you were on as context. Tell him what you want; he ships it.

Things that need this:
- New top-level fields on accounts or orders (rare — most additions
  can live in the `notes` field or the JSONB blob)
- New endpoints / new behaviors on the server
- The Net-30 cron needs to change
- Anything that touches the database structure

You don't have to know what counts as "harder" — if Claude tells you
the change needs server-side work or a migration, that's your cue to
email Michael.

---

## "Something looks weird"

In order of escalation:

1. **Reload the page.** Sometimes the browser shows a stale view.
2. **Hit 💾 Backup.** Insurance policy before you do anything else.
3. **Try a different browser or incognito.** Rules out a local issue.
4. **Roll back to a known-good deploy** via the Netlify Deploys page
   (see "If something breaks after a deploy" above).
5. **Send a request** describing what happened. There are server
   logs Michael can look at.

For data emergencies (data appears wrong or missing), **don't restore
an old backup yet** — ask Michael first. Restoring is destructive;
better to figure out the live state before stomping on it.

---

## Quick URL reference

| What | Where |
|------|-------|
| The CRM itself | https://sfny-crm.netlify.app |
| Netlify dashboard | https://app.netlify.com/projects/sfny-crm |
| Netlify deploys (drag-drop here) | https://app.netlify.com/projects/sfny-crm/deploys |
| Resend (when set up) | https://resend.com |
| Claude (for editing the HTML) | https://claude.ai |

---

## One-time cutover checklist

If you're reading this before we've moved you onto this stack (the
URL above still points to the old version), here's what we need:

- [ ] Hit **💾 Backup** on your existing site one last time. That
      file is the canonical snapshot from the old localStorage world.
- [ ] Send the backup file to Michael.
- [ ] He imports it into the new database and renames the Netlify
      project so `sfny-crm.netlify.app` serves this stack.
- [ ] You log in at https://sfny-crm.netlify.app like you always
      have. Same URL, same password, all your data.
- [ ] He sends you the project folder. Put it somewhere you'll
      find it (Desktop, Dropbox).

After cutover, this is your only CRM. The old static-HTML version
goes away.
