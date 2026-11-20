# WTM · Work Task Manager — setup

WTM is one HTML file plus a Supabase project. Setup takes about ten minutes.

## What's in the box

| File | What it is |
|---|---|
| `index.html` | The app. Works on phones and desktops. Host the folder anywhere, or open it locally. |
| `css/` | Styles, one file per area of the screen. |
| `js/app.js` | The application. |
| `js/config.js` | Public project URL and anon key. Generated from `.env`. |
| `.env` | API keys. Copy from `.env.example`. Not committed. |
| `supabase/schema.sql` | Tables, permissions, the log book and every server function. Run once. |
| `supabase/seed.sql` | Optional starter departments, rooms, keywords and projects. |
| `supabase/functions/wtm-admin/index.ts` | Edge Function that creates logins and resets passwords. |

## 1. Create the database

1. Create a Supabase project (or use an existing one).
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it.
3. Optional: run `supabase/seed.sql` for starter departments (Maintenance, Front desk, House Keeping, IT), rooms and keywords. You can change all of them in the app.

The script is safe to run again after an update.

## 2. Lock down sign-ups

In **Authentication** settings, turn off **Allow new users to sign up**. Logins are created inside WTM by IT and admin only.

## 3. Create the first login (becomes IT)

In **Authentication → Users**, choose **Add user → Create new user**. Enter your email and a password, and tick **Auto confirm**.

The first account in the project automatically becomes **IT**. If accounts already existed when you ran the schema, the oldest one is made IT.

## 4. Deploy the login function

With the [Supabase CLI](https://supabase.com/docs/guides/cli), from the folder that contains `supabase/`:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy wtm-admin
supabase functions deploy wtm-calendar --no-verify-jwt
```

The function uses the project's service-role key on the server. That key never reaches the browser.

## 5. Connect the app

Copy `.env.example` to `.env` and paste your **Project URL** and **anon public key**. Both are in **Project Settings → API**.

```
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_ANON_KEY=eyJ…
```

`SUPABASE_SERVICE_ROLE_KEY` is only for running the login function on your own machine. Leave it empty unless you need that. It never goes into the browser.

From this folder, write the public keys into the app:

```bash
node scripts/sync-config.mjs
```

Open `index.html`. It goes straight to sign-in.

The anon key is designed to be public. Row-level security and the server functions decide what each person can see and do.

## 6. Set up your organisation

Sign in as IT, then:

- **People → Departments**: add departments.
- **People → Add person**: create logins. Each person gets a temporary password, shown once, and must choose their own the first time they sign in. Give each person one or more departments.
- **People → Groups**: anyone can make a group, such as Night shift, for people who work together across departments.
- **Settings → Auto-tagging**: add rooms and keywords. For example, “leak” → #plumbing.

## Invoices

**Invoices** shows the Invoice Scraper inside WTM. The scraper lives in `invoice-scraper/` (the page, its database script, and the `gemini-extract` and `staff-admin` functions). It keeps its own Supabase project and its own username sign-in, so people sign in to it once inside WTM. WTM roles don't apply there. **Open in a new tab** opens the scraper on its own.

The address comes from `INVOICE_SCRAPER_URL` in `.env`. Leave it out to use `invoice-scraper/invoice_scraper.html`. Run `node scripts/sync-config.mjs` after changing it.

The scraper's own setup is in `invoice-scraper/README.md`. Run `invoice-scraper/supabase-schema.sql` on the kitchen Supabase project, then deploy that folder's functions there. The kitchen anon key is already in the page.

## Mail

**Mail** shows Relay Mail, the Gmail and Outlook client. Phase 1 is the full interface on a demo mailbox stored in this browser. Source and the built page both live in `mail-client/`. WTM opens `mail-client/relay-mail.html`.

After changing the mail client, rebuild that page:

```bash
cd mail-client
npm install
npm run build:single
```

That writes `mail-client/relay-mail.html`, which the Mail section loads. **Open in a new tab** opens it on its own. Press **E** to open Mail. It does not use WTM sign-in.

## Calendar

Jobs, events, bookings and public holidays each have their own colour. The department menu limits jobs and daily tasks to one department.

**Sync** downloads a calendar file, or copies a link that Google Calendar, Outlook and Apple Calendar can subscribe to. The link follows the department chosen on screen and only includes tasks that person is allowed to see.

The link needs two extra steps, once:

1. Run `supabase/schema.sql` again so the `calendar_feeds` table and feed functions exist.
2. Deploy the feed, with JWT checks off, because those calendars fetch the link with no sign-in:

```bash
supabase functions deploy wtm-calendar --no-verify-jwt
```

## Roles

| | Staff | Supervisor | Admin | IT |
|---|---|---|---|---|
| Tasks assigned to them, their departments and groups | ✓ | ✓ | ✓ | ✓ |
| Tasks of everyone in their departments, and those people's log entries | | ✓ | ✓ | ✓ |
| Every task and the whole log book | | | ✓ | ✓ |
| Delete tasks other people created | | ✓ | ✓ | ✓ |
| Projects, rooms, keywords | | ✓ | ✓ | ✓ |
| Departments; read any department's messages | | | ✓ | ✓ |
| Create logins, reset passwords, turn logins off — staff and supervisors | | | ✓ | ✓ |
| The same for admin and IT logins | | | | ✓ |

Direct messages and group messages are private to the people in them.

## How the log book stays complete

The browser never writes to tables directly. Every action goes through a database function that checks permissions and writes the log entry in the same transaction:

- task created, edited, assigned, completed, deleted or restored
- notes and messages
- logins, departments, groups, projects, rooms and keywords

Nobody can edit or delete log entries, IT included. Entry numbers come from the database, so gaps in your view are entries you don't have access to.

## Quick add

Type a task in plain words, for example *Fix the leak in Room 12 with Sam*. WTM picks out:

- people's names
- departments
- projects
- rooms, both from your list and patterns such as Room 12, Rm 4B, Ward 3 or Level 2
- your keywords

Auto-tags are marked **auto** and can be removed with ×. Tapping **Assign** on a detected name assigns that person.

The buttons under the box add an assignee, date, priority, room, tag or project without typing.

You can also type shortcuts:

- `@sam`: assign to a person, department or group
- `!1`–`!4`: priority
- `^fri`, `^tom` or `^2026-11-02`: due date
- `#tag`: tag

## Troubleshooting

- **“The database is missing WTM's functions”**: run `schema.sql` in the project you connected to.
- **“The wtm-admin function isn't deployed yet”**: do step 4.
- **Status says “Checking” instead of “Live”**: realtime isn't reaching the browser. WTM still checks for changes every 15 seconds. The schema adds the right tables to the `supabase_realtime` publication.
- **Someone forgot their password**: IT or an admin opens them in People and chooses **Reset password**.
