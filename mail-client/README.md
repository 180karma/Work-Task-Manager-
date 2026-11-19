# Relay Mail: universal email client

A web client that connects existing Gmail and Microsoft Outlook accounts and shows them in one Outlook-style interface. Users keep their providers. Relay only connects to them through official APIs and OAuth.

**Current state: Phase 1 is complete.** The full interface runs on a realistic demo mailbox stored in the browser. No provider is connected yet. Every place that will need a real backend calls one `MailService` interface, so Phases 2–5 replace the demo service without changing the UI.

| Phase | Scope | Status |
|---|---|---|
| 1 | Complete frontend on mock data | ✅ Done and tested (43 end-to-end checks) |
| 2 | Supabase auth, schema, RLS | Next |
| 3 | Google OAuth and Gmail API | — |
| 4 | Microsoft OAuth and Graph | — |
| 5 | Send/receive, attachments, background sync | — |
| 6 | Provider search, folders, contacts | — |
| 7 | Security review, hardening, optimisation | — |

---

## Run it

The app lives in `mail-client/` of this repository, separate from the WTM app at the root.

```bash
cd mail-client
npm install
cp .env.example .env.local      # VITE_DATA_SOURCE=mock
npm run dev                     # http://localhost:5173
```

Other scripts:

| Script | What it does |
|---|---|
| `npm run build` | Type-checks, then builds to `dist/` with Vite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build:single` | Bundles everything into one file, `dist-single/relay-mail.html` (used for the hosted preview) |
| `npm run test:e2e` | Builds the single file and runs the Playwright flow tests at desktop, tablet and phone sizes (`npx playwright install chromium` the first time) |

## What Phase 1 includes

**Layout**
- Three columns on desktop (≥1200 px): navy sidebar, message list, reading pane.
- Tablet (860–1199 px): the sidebar becomes an icon rail that expands as an overlay.
- Phone (<860 px): one pane at a time. Navigation is a drawer, the reading view has a back button, there's a floating New button, the composer opens as a full-screen sheet, and you can swipe a row right to mark it read or unread, or left to archive it.
- Light, dark and system themes; comfortable and compact density.

**Sidebar:** New message, All inboxes, Inbox, Starred, Important, Drafts, Sent, Archive, Spam, Trash, custom folders (create, rename, delete), labels (create with colour, delete), connected accounts with unread counts and sync-error markers, Connected accounts, Settings, theme toggle. Messages can be dragged onto folders.

**Message list**
- Conversations grouped by thread (can be turned off), with date groups.
- Each row shows the sender, a thread count, a draft marker, the subject, a 1–2 line preview, the date, unread state, attachment, star and important flags, and labels.
- An account ribbon and tag show which account each message belongs to.
- Hover actions: archive, delete, read/unread. Shift-click selects a range, and bulk actions work on the selection.
- Quick filters: All, Unread, Starred, Attachments, and per-account.
- Live search with Gmail-style operators (`from: to: subject: has:attachment is:unread is:starred before: after: in: label: account: filename:`), plus an advanced search form.

**Reading pane**
- Full conversations: older messages are collapsed, and unread ones open automatically.
- Expandable From/To/Cc/Date/Account details.
- HTML email is sanitised (DOMPurify) and rendered inside a Shadow DOM, so email CSS can't leak into the app.
- Remote images and tracking pixels are held back until you allow them.
- Attachment tiles with image previews.
- Reply, reply all, forward, archive, delete, mark unread, move, labels, spam/not spam, restore from Trash, and delete forever (after a confirmation).

**Compose**
- From picker (switching account also swaps the signature), To/Cc/Bcc chips with contact autocomplete and invalid-address flags.
- Rich text: bold, italic, underline, strikethrough, lists, quote, link dialog, clear formatting. Pasted content is sanitised.
- Attachments by picker or drag-and-drop. Limits: 25 MB per message, 20 files, and the executable types Gmail and Outlook block are refused.
- Autosaves 2 s after you stop typing. Save draft, Discard, close-to-save.
- Several windows at once (minimise or expand).
- Warns before sending without a subject, or when the text mentions an attachment that isn't there. Ctrl+Enter sends.

**Connected accounts:** Connect Gmail and Connect Microsoft Outlook (these say which phase wires them up), status (connected, syncing, needs attention), sync errors with Reconnect, last sync time, default sending account, per-account signature, the permissions Relay requests, Sync now, and Disconnect (after a confirmation).

**Settings:** theme, density, preview lines, conversation grouping, mark-read-on-open, remote images, a reserved "Smart features" switch (off, for the later AI work), the keyboard shortcut list, and restoring the demo mailbox.

**Keyboard:** `c` compose · `/` search · `j`/`k` next/previous · `r` `a` `f` reply/reply all/forward · `e` archive · `#` delete · `s` star · `u` unread · `Esc` close · `?` shortcuts.

**Demo-only behaviour (clearly labelled in the UI):** Sync now delivers a sample message. Sending to one of your own connected addresses lands in that account's inbox. The Freelance account is deliberately in an error state so you can see the sync-error UI. Attachments can't be downloaded yet, and the preview dialog says so.

## Files

```
index.html                     Vite entry, fonts, viewport
.env.example                   Every variable for every phase, browser vs server
scripts/build-single.mjs       esbuild → one self-contained HTML file
tests/phase1-e2e.mjs           Playwright flows (desktop, tablet, phone; light and dark)

src/
  main.tsx, App.tsx            Root, providers, responsive shell
  config/env.ts                Browser-safe config + attachment limits
  types/mail.ts                Domain types, mirroring the Phase 2 tables

  services/mail/
    MailService.ts             THE backend contract (load, update, move, label, drafts, send, sync, connect, folders, labels)
    MockMailService.ts         Phase 1 implementation: async, persists to localStorage, dedupes sync deliveries
    index.ts                   Picks the implementation from VITE_DATA_SOURCE

  data/mockData.ts             Seeded demo mailbox: 3 accounts, ~40 messages, threads, folders, labels, contacts (all fictional)
  data/mockImages.ts           Generated SVG "photos" for image attachments

  state/MailStore.tsx          Mail data + actions; optimistic updates, rollback-by-reload on failure, undo
  state/UIStore.tsx            View, scope, search, selection, prefs, compose windows
  state/selectors.ts           View filtering, thread grouping, unread counts
  state/toast.ts, confirm.ts   Toast bus; promise-based confirm dialogs

  lib/search.ts                Query parser/matcher (Gmail-style operators) + advanced search builder
  lib/sanitize.ts              DOMPurify configs for received mail and the composer; text↔HTML
  lib/validation.ts            Address parsing, attachment rules, link normalising
  lib/compose.ts               Reply / reply-all / forward / draft seeding, quoting, signatures
  lib/format.ts, id.ts, storage.ts

  hooks/                       useLayoutMode, useHotkeys, useCommands (context-aware actions), useOutsideClose

  components/
    layout/Sidebar.tsx         Navy navigation, drop targets, folder/label management
    mail/MailView.tsx          List + reading pane orchestration, shortcuts, phone navigation
    mail/MessageList.tsx       Header, search, filters, bulk bar, grouped rows, empty/loading states
    mail/MessageRow.tsx        Row, hover actions, drag, swipe
    mail/ReadingPane.tsx       Toolbar, conversation, per-message actions, notices
    mail/EmailBody.tsx         Sanitised Shadow DOM renderer, remote-image gate
    mail/Attachments.tsx       Tiles + preview
    compose/ComposeWindow.tsx  Composer + dock
    compose/RecipientField.tsx Chips + autocomplete
    compose/RichEditor.tsx     contentEditable editor (isolated so TipTap can replace it later)
    accounts/AccountsView.tsx  Account management
    settings/                  Settings + shortcuts
    ui/                        Menu, Dialog, Toasts, ConfirmHost, primitives

  styles/tokens.css            Colour/radius/shadow tokens, light + dark
  styles/app.css               Component styles
```

### Reconstructed files

Only the entry files, `App.tsx`, and the components under `layout/`, `mail/` (except `ReadingPane` and `SearchBar`), `compose/` and `accounts/` came from the original Phase 1 source. Everything else listed above was rebuilt from the contracts those components import: `config/`, `types/`, `services/`, `data/`, `state/`, `lib/`, `hooks/`, `mail/ReadingPane.tsx`, `mail/SearchBar.tsx`, `settings/`, `ui/`, both stylesheets, `.env.example`, and `tests/phase1-e2e.mjs` (a smoke suite of 18 checks, not the original 43). If the original files turn up, they can replace these one for one.

## Environment variables

Only `VITE_*` variables reach the browser. Secrets live in Supabase Edge Function secrets (`supabase secrets set ...`) and never in the frontend.

| Variable | Where | Phase | Purpose |
|---|---|---|---|
| `VITE_DATA_SOURCE` | browser | 1 | `mock` (demo mailbox) or `supabase` |
| `VITE_SUPABASE_URL` | browser | 2 | Project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | 2 | Public anon key (safe only because every table has RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | server | 2 | Edge Functions only |
| `TOKEN_ENCRYPTION_KEY` | server | 2 | AES-GCM key for refresh tokens at rest |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | server | 3 | Google OAuth client |
| `GOOGLE_PUBSUB_TOPIC` | server | 5 | Gmail `watch()` push notifications |
| `MICROSOFT_OAUTH_CLIENT_ID` / `_SECRET` / `_TENANT` / `_REDIRECT_URI` | server | 4 | Entra ID app registration |
| `GRAPH_WEBHOOK_CLIENT_STATE` | server | 5 | Verifies Graph change notifications |

## API configuration (prepared for Phases 3–5)

None of this is needed to run Phase 1. It's listed so the cloud consoles can be set up ahead of time.

**Google Cloud (Gmail)**
1. Create a project, enable the **Gmail API** and **Cloud Pub/Sub API**.
2. OAuth consent screen: External, add the scopes below, and add test users while unverified. `gmail.modify` is a *restricted* scope, so production use needs Google's security assessment.
3. Credentials → OAuth client (Web): redirect URI `https://<project-ref>.functions.supabase.co/oauth-google-callback`.
4. Scopes (minimum for the feature set): `openid email profile https://www.googleapis.com/auth/gmail.modify`. This covers read, labels, move, trash and send, but *not* permanent delete. Delete forever maps to Trash plus provider retention unless `https://mail.google.com/` is added later.
5. Pub/Sub topic `gmail-push`, granting publish rights to `gmail-api-push@system.gserviceaccount.com`. `watch()` must be renewed at least every 7 days.

**Microsoft Entra ID (Outlook / Graph)**
1. App registrations → New, supported accounts: *any organisational directory and personal Microsoft accounts* (`common`).
2. Redirect URI (Web): `https://<project-ref>.functions.supabase.co/oauth-microsoft-callback`; add a client secret.
3. Delegated permissions: `openid email profile offline_access User.Read Mail.ReadWrite Mail.Send`.
4. Sync: delta queries per folder (`/me/mailFolders/{id}/messages/delta`) plus change-notification subscriptions. Mail subscriptions expire after about 3 days, so a scheduled function must renew them.

## How the later phases plug in

- **Phase 2** adds `SupabaseMailService implements MailService` and switches on it with `VITE_DATA_SOURCE=supabase`. `types/mail.ts` already mirrors the tables in the brief (`email_accounts`, `emails`, `folders`, `labels`, `email_labels`, `attachments`, `contacts`, `email_sync_state`). A few UI fields are additions to plan into the schema: `email_accounts.label`, `colour`, `signature`, `is_default`, `sync_error`, and `emails.is_important`, `snippet`, `previous_folder_id`.
- **Phases 3–5:** the browser only ever calls Edge Functions. Those functions hold the encrypted refresh tokens, call Gmail and Graph, and write normalised rows that the UI reads through RLS. `beginConnect()` returns the provider's consent URL, with a signed `state` stored server-side for validation.
- **Later AI features** sit behind the reserved Settings switch and act on stored rows server-side. They're off by default and chosen per account.

## Known limits of Phase 1

- Data is per browser (localStorage). Clearing site data restores the demo mailbox.
- The editor uses `document.execCommand`, which is deprecated but universally supported. It's isolated in `RichEditor.tsx` so it can be replaced.
- The list isn't virtualised. That's fine for the demo; add virtualisation (e.g. `@tanstack/react-virtual`) once real mailboxes load in Phase 5.
- `npm run typecheck` needs `npm install` (React types). The Phase 1 build was verified with esbuild and the Playwright suite.
