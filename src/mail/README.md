# Relay Mail: universal email client

The **Mail** section of WTM. A web client that connects existing Gmail and Microsoft Outlook accounts and shows them in one Outlook-style interface. Users keep their providers. Relay only connects to them through official APIs and OAuth.

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

## How it fits into WTM

WTM is plain HTML and JavaScript with no build step. Mail is the one React part, so it is built into a single script, `js/mail/relay-mail.js`, which is committed. WTM loads that script the first time someone opens Mail and calls `RelayMail.mount()` (see `src/mail/embed.tsx` and `renderMail()` in `js/app.js`). The signed-in WTM user and WTM's Supabase client are passed in, so Mail shares WTM's project and sign-in.

Mail renders inside a shadow root in `#mailHost`. That keeps WTM's CSS and Mail's CSS from affecting each other while still inheriting WTM's design tokens, so Mail follows WTM's colours, fonts and light/dark mode. Menus, dialogs, the composer and toasts render inside the same root. Anything that would normally look at `document` (outside clicks, focus, selection, the theme) goes through `host.tsx`.

## Run it

From the repository root:

```bash
npm install
npm run dev                     # http://localhost:5173 — WTM, with Mail served live from src/mail
```

| Script | What it does |
|---|---|
| `npm run build` | Type-checks, then rewrites `js/mail/relay-mail.js` (commit it, and bump its `?v=` in `js/app.js`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:e2e` | Builds, then runs `tests/e2e.mjs`: WTM against a fake Supabase, every WTM section, and the Mail flows at desktop, tablet and phone sizes (`npx playwright install chromium` the first time). `BROWSER=firefox` or `webkit` runs another engine; `VIEWPORT=phone` runs one size |

## What Phase 1 includes

**Layout**
The layout follows the width the Mail section has beside WTM's navigation, not the window:
- Three columns when Mail is at least 1100 px wide: sidebar, message list, reading pane.
- 860–1099 px: the sidebar becomes an icon rail that expands as an overlay.
- Under 860 px (tablets and phones): one pane at a time. Navigation is a drawer, the reading view has a back button, there's a floating New button, the composer opens as a full-screen sheet, and you can swipe a row right to mark it read or unread, or left to archive it.
- Light and dark follow WTM; comfortable and compact density.

**Sidebar:** New message, All inboxes, Inbox, Starred, Important, Drafts, Sent, Archive, Spam, Trash, custom folders (create, rename, delete), labels (create with colour, delete), connected accounts with unread counts and sync-error markers, Connected accounts, Mail settings. Messages can be dragged onto folders.

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

**Mail settings:** density, preview lines, conversation grouping, mark-read-on-open, remote images, a reserved "Smart features" switch (off, for the later AI work), the keyboard shortcut list, and restoring the demo mailbox.

**Keyboard** (while Mail is the open WTM section; WTM's own letter shortcuts pause): `c` compose · `/` search · `j`/`k` next/previous · `r` `a` `f` reply/reply all/forward · `e` archive · `#` delete · `s` star · `u` unread · `Esc` close · `?` shortcuts.

**Demo-only behaviour (clearly labelled in the UI):** Sync now delivers a sample message. Sending to one of your own connected addresses lands in that account's inbox. The Freelance account is deliberately in an error state so you can see the sync-error UI. Attachments can't be downloaded yet, and the preview dialog says so.

## Files

```
js/mail/relay-mail.js          Built bundle WTM loads (generated by `npm run build`, committed)
tests/e2e.mjs                  Playwright checks for WTM + Mail (desktop, tablet and phone; light and dark)

src/mail/
  embed.tsx                    mount()/unmount() for WTM: shadow root, styles, per-user storage
  host.tsx                     The mount point: portal target, active check, selection, real event origin
  App.tsx                      Providers and responsive shell
  config/env.ts                Browser-safe config (Supabase settings from WTM) + attachment limits
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
    layout/Sidebar.tsx         Mail navigation, drop targets, folder/label management
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

  styles/tokens.css            Relay's tokens mapped onto WTM's (css/base.css)
  styles/app.css               Component styles
```

### Reconstructed files

Only `App.tsx` and the components under `layout/`, `mail/` (except `ReadingPane` and `SearchBar`), `compose/` and `accounts/` came from the original Phase 1 source. Everything else listed above was rebuilt from the contracts those components import: `config/`, `types/`, `services/`, `data/`, `state/`, `lib/`, `hooks/`, `mail/ReadingPane.tsx`, `mail/SearchBar.tsx`, `settings/`, `ui/`, both stylesheets, and the browser tests (not the original 43 checks). `embed.tsx` and `host.tsx` were added to run Mail inside WTM. If the original files turn up, they can replace these one for one.

## Environment variables

Mail takes WTM's Supabase URL, anon key and client at mount time (from `js/config.js`), so it has no browser settings of its own. `VITE_DATA_SOURCE=supabase npm run build` will switch to the real backend once Phase 2 exists; until then it is `mock`. Secrets live in Supabase Edge Function secrets (`supabase secrets set ...`) and never in the frontend.

| Variable | Where | Phase | Purpose |
|---|---|---|---|
| `VITE_DATA_SOURCE` | build | 1 | `mock` (demo mailbox) or `supabase` |
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

- **Phase 2** adds `SupabaseMailService implements MailService`, using WTM's client (`config.getSupabase()`) and WTM's user, and switches on it with `VITE_DATA_SOURCE=supabase`. `types/mail.ts` already mirrors the tables in the brief (`email_accounts`, `emails`, `folders`, `labels`, `email_labels`, `attachments`, `contacts`, `email_sync_state`). A few UI fields are additions to plan into the schema: `email_accounts.label`, `colour`, `signature`, `is_default`, `sync_error`, and `emails.is_important`, `snippet`, `previous_folder_id`.
- **Phases 3–5:** the browser only ever calls Edge Functions. Those functions hold the encrypted refresh tokens, call Gmail and Graph, and write normalised rows that the UI reads through RLS. `beginConnect()` returns the provider's consent URL, with a signed `state` stored server-side for validation.
- **Later AI features** sit behind the reserved Settings switch and act on stored rows server-side. They're off by default and chosen per account.

## Known limits of Phase 1

- Data is per browser and per WTM login (localStorage, `relay-mail:<user id>:`). Clearing site data restores the demo mailbox.
- The editor uses `document.execCommand`, which is deprecated but universally supported. It's isolated in `RichEditor.tsx` so it can be replaced.
- The list isn't virtualised. That's fine for the demo; add virtualisation (e.g. `@tanstack/react-virtual`) once real mailboxes load in Phase 5.
- The composer's formatting buttons read the selection inside the shadow root (`ShadowRoot.getSelection()` where the browser has it). The browser tests pass in Chromium, Firefox and WebKit (`BROWSER=firefox npm run test:e2e`); they cover typing and sending, not the bold/italic highlight in the toolbar.
