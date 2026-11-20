// Google and Microsoft sign-in from the browser. Client ids are public.
// Client secrets stay out of this page. Google returns a token in the address.
// Microsoft uses a public-client code exchange (PKCE) and allows that from the browser.
// Tokens live in memory here and are saved to the person's Work Task Manager login.
import { loadJSON, removeKey, saveJSON } from '../../lib/storage';
import type { DraftInput, Email, EmailAccount, EmailPatch, MailSnapshot, Provider } from '../../types/mail';

const PENDING_KEY = 'oauth-pending';
const MS_SCOPE = 'openid email profile offline_access User.Read Mail.ReadWrite Mail.Send';

export type Token = { access: string; refresh?: string; expiresAt: number };
type Pending = { provider: Provider; state: string; clientId: string; verifier?: string };
export type Connected = { provider: Provider; email: string; name: string; token: Token };

export const colours: Record<Provider, string> = { gmail: '#d9480f', outlook: '#2f6feb' };

let clients = { google: '', microsoft: '' };
const live = new Map<string, Token>();
let onToken: (accountId: string, token: Token) => void = () => {};

export function redirectUri() {
  return location.origin + location.pathname;
}

export function setClients(google: string, microsoft: string) {
  clients = { google: google.trim(), microsoft: microsoft.trim() };
}

export function clientIds() {
  return clients;
}

function clientId(provider: Provider) {
  return provider === 'gmail' ? clients.google : clients.microsoft;
}

export function missingClientMessage(provider: Provider) {
  const who = provider === 'gmail' ? 'Google' : 'Microsoft';
  return `${who} sign-in isn't set up yet. Ask admin or IT to add it under Connected accounts.`;
}

/** Loads saved tokens and sets where refreshed tokens are saved. */
export function loadTokens(saved: [string, Token][], save: (accountId: string, token: Token) => void) {
  live.clear();
  for (const [id, token] of saved) if (token?.access) live.set(id, token);
  onToken = save;
}

export function rememberToken(accountId: string, token: Token) {
  live.set(accountId, token);
}

export function accountIdFor(provider: Provider, email: string) {
  return `live_${provider}_${email.toLowerCase()}`;
}

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of view) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = b64url(bytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(digest) };
}

export async function buildAuthUrl(provider: Provider): Promise<string | null> {
  const id = clientId(provider);
  if (!id) return null;
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const redirect = redirectUri();
  if (provider === 'gmail') {
    saveJSON(PENDING_KEY, { provider, state, clientId: id } satisfies Pending);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', id);
    url.searchParams.set('redirect_uri', redirect);
    url.searchParams.set('response_type', 'token');
    url.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/gmail.modify');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'select_account');
    url.searchParams.set('state', state);
    return url.toString();
  }
  const { verifier, challenge } = await pkce();
  saveJSON(PENDING_KEY, { provider, state, clientId: id, verifier } satisfies Pending);
  const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  url.searchParams.set('client_id', id);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', MS_SCOPE);
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function forgetToken(accountId: string) {
  live.delete(accountId);
}

function cleanAddress() {
  const path = location.pathname;
  try {
    history.replaceState(null, '', path);
  } catch {
    /* ignore */
  }
}

function paramsFromUrl() {
  const q = new URLSearchParams(location.search);
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  return {
    code: q.get('code') || '',
    error: q.get('error') || h.get('error') || '',
    errorDescription: q.get('error_description') || h.get('error_description') || '',
    state: q.get('state') || h.get('state') || '',
    access: h.get('access_token') || '',
    expiresIn: Number(h.get('expires_in') || q.get('expires_in') || 3600),
  };
}

async function microsoftToken(id: string, body: Record<string, string>) {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, ...body }),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error_description || 'Microsoft did not finish sign-in.');
  return json;
}

async function accessFor(account: EmailAccount): Promise<string> {
  const token = live.get(account.id);
  if (!token) throw new Error(`Sign in to ${account.providerEmail} again.`);
  if (token.expiresAt > Date.now() + 30_000) return token.access;
  if (account.provider === 'outlook' && token.refresh && clients.microsoft) {
    const json = await microsoftToken(clients.microsoft, { grant_type: 'refresh_token', refresh_token: token.refresh, scope: MS_SCOPE });
    const next = { access: json.access_token!, refresh: json.refresh_token || token.refresh, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 };
    live.set(account.id, next);
    onToken(account.id, next);
    return next.access;
  }
  account.syncStatus = 'error';
  account.syncError = `Sign in to ${account.provider === 'gmail' ? 'Google' : 'Microsoft'} again.`;
  throw new Error(account.syncError);
}

async function authed(url: string, account: EmailAccount, init?: RequestInit) {
  const access = await accessFor(account);
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${access}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    account.syncStatus = 'error';
    account.syncError = `Sign in to ${account.provider === 'gmail' ? 'Google' : 'Microsoft'} again.`;
    throw new Error(account.syncError);
  }
  return res;
}

function mailbox(name: string | undefined, email: string) {
  return { name: (name || email).trim(), email: email.trim() };
}

function parseAddress(raw: string) {
  const m = /^(.*?)\s*<([^>]+)>$/.exec(raw.trim());
  if (m) return mailbox(m[1].replace(/^"|"$/g, ''), m[2]);
  return mailbox(raw, raw);
}

function parseList(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => parseAddress(part.trim()))
    .filter((a) => a.email.includes('@'));
}

function decodeB64(data: string) {
  const pad = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: { name: string; value: string }[] };

function gmailBodies(part: GmailPart | undefined, out: { html: string; text: string }) {
  if (!part) return;
  const data = part.body?.data;
  if (data && part.mimeType === 'text/html') out.html = out.html || decodeB64(data);
  if (data && part.mimeType === 'text/plain') out.text = out.text || decodeB64(data);
  for (const child of part.parts || []) gmailBodies(child, out);
}

function header(part: GmailPart, name: string) {
  return (part.headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

async function gmailInbox(account: EmailAccount): Promise<Email[]> {
  const listRes = await authed('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=in:inbox', account);
  const list = (await listRes.json()) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!listRes.ok) throw new Error(list.error?.message || 'Gmail did not return the inbox.');
  const emails: Email[] = [];
  for (const item of list.messages || []) {
    const res = await authed(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`, account);
    const msg = (await res.json()) as {
      id: string;
      threadId: string;
      snippet?: string;
      internalDate?: string;
      labelIds?: string[];
      payload?: GmailPart;
    };
    if (!res.ok) continue;
    const bodies = { html: '', text: '' };
    gmailBodies(msg.payload, bodies);
    const from = parseAddress(header(msg.payload || {}, 'From'));
    const text = bodies.text || (bodies.html ? bodies.html.replace(/<[^>]+>/g, ' ') : msg.snippet || '');
    emails.push({
      id: `live_${msg.id}`,
      accountId: account.id,
      threadId: msg.threadId || msg.id,
      folderId: 'inbox',
      previousFolderId: null,
      from,
      to: parseList(header(msg.payload || {}, 'To')),
      cc: parseList(header(msg.payload || {}, 'Cc')),
      bcc: [],
      subject: header(msg.payload || {}, 'Subject') || '(no subject)',
      snippet: (msg.snippet || text).replace(/\s+/g, ' ').slice(0, 160),
      bodyHtml: bodies.html || null,
      bodyText: text,
      receivedAt: new Date(Number(msg.internalDate) || Date.now()).toISOString(),
      isRead: !(msg.labelIds || []).includes('UNREAD'),
      isStarred: (msg.labelIds || []).includes('STARRED'),
      isImportant: (msg.labelIds || []).includes('IMPORTANT'),
      hasAttachments: false,
      attachments: [],
      labelIds: [],
      inReplyToId: null,
    });
  }
  return emails;
}

type GraphMsg = {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  flag?: { flagStatus?: string };
  importance?: string;
  hasAttachments?: boolean;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  ccRecipients?: { emailAddress?: { name?: string; address?: string } }[];
};

function graphBox(person?: { name?: string; address?: string }) {
  const email = person?.address || '';
  return mailbox(person?.name, email);
}

async function outlookInbox(account: EmailAccount): Promise<Email[]> {
  const res = await authed(
    'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=20&$select=id,conversationId,subject,bodyPreview,receivedDateTime,isRead,flag,importance,hasAttachments,body,from,toRecipients,ccRecipients',
    account,
  );
  const json = (await res.json()) as { value?: GraphMsg[]; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message || 'Outlook did not return the inbox.');
  return (json.value || []).map((msg) => {
    const html = msg.body?.contentType === 'html' ? msg.body.content || '' : '';
    const text = msg.body?.contentType === 'text' ? msg.body.content || '' : msg.bodyPreview || '';
    return {
      id: `live_${msg.id}`,
      accountId: account.id,
      threadId: msg.conversationId || msg.id,
      folderId: 'inbox',
      previousFolderId: null,
      from: graphBox(msg.from?.emailAddress),
      to: (msg.toRecipients || []).map((r) => graphBox(r.emailAddress)).filter((a) => a.email),
      cc: (msg.ccRecipients || []).map((r) => graphBox(r.emailAddress)).filter((a) => a.email),
      bcc: [],
      subject: msg.subject || '(no subject)',
      snippet: (msg.bodyPreview || text).replace(/\s+/g, ' ').slice(0, 160),
      bodyHtml: html || null,
      bodyText: text || msg.bodyPreview || '',
      receivedAt: msg.receivedDateTime || new Date().toISOString(),
      isRead: !!msg.isRead,
      isStarred: msg.flag?.flagStatus === 'flagged',
      isImportant: msg.importance === 'high',
      hasAttachments: !!msg.hasAttachments,
      attachments: [],
      labelIds: [],
      inReplyToId: null,
    };
  });
}

export async function pullInbox(account: EmailAccount) {
  return account.provider === 'gmail' ? gmailInbox(account) : outlookInbox(account);
}

function providerId(email: Email) {
  return email.id.startsWith('live_') ? email.id.slice(5) : '';
}

export async function patchLive(account: EmailAccount, emails: Email[], patch: EmailPatch) {
  for (const email of emails) {
    const id = providerId(email);
    if (!id) continue;
    if (account.provider === 'gmail') {
      const add: string[] = [];
      const remove: string[] = [];
      if (patch.isRead === true) remove.push('UNREAD');
      if (patch.isRead === false) add.push('UNREAD');
      if (patch.isStarred === true) add.push('STARRED');
      if (patch.isStarred === false) remove.push('STARRED');
      if (!add.length && !remove.length) continue;
      await authed(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`, account, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
      });
    } else {
      const body: Record<string, unknown> = {};
      if (patch.isRead != null) body.isRead = patch.isRead;
      if (patch.isStarred != null) body.flag = { flagStatus: patch.isStarred ? 'flagged' : 'notFlagged' };
      if (!Object.keys(body).length) continue;
      await authed(`https://graph.microsoft.com/v1.0/me/messages/${id}`, account, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
  }
}

export async function sendLive(account: EmailAccount, input: DraftInput) {
  const text = input.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (account.provider === 'gmail') {
    const headers = [
      `From: ${account.displayName} <${account.providerEmail}>`,
      `To: ${input.to.map((p) => p.email).join(', ')}`,
      input.cc.length ? `Cc: ${input.cc.map((p) => p.email).join(', ')}` : '',
      `Subject: ${input.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
    ].filter(Boolean);
    const raw = b64url(new TextEncoder().encode([...headers, '', input.bodyHtml || `<p>${text}</p>`].join('\r\n')));
    const res = await authed('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', account, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) throw new Error('Gmail did not send that message.');
    return;
  }
  const res = await authed('https://graph.microsoft.com/v1.0/me/sendMail', account, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      saveToSentItems: true,
      message: {
        subject: input.subject,
        body: { contentType: 'HTML', content: input.bodyHtml || `<p>${text}</p>` },
        toRecipients: input.to.map((p) => ({ emailAddress: { address: p.email, name: p.name } })),
        ccRecipients: input.cc.map((p) => ({ emailAddress: { address: p.email, name: p.name } })),
        bccRecipients: input.bcc.map((p) => ({ emailAddress: { address: p.email, name: p.name } })),
      },
    }),
  });
  if (!res.ok) throw new Error('Outlook did not send that message.');
}

export function isLive(accountId: string) {
  return accountId.startsWith('live_');
}

export type RedirectResult = { connected?: Connected; error?: string };

/** In the sign-in popup: hands the result to the Mail page that opened it and closes. */
export function sendToOpener(result: RedirectResult) {
  let opener: Window | null = null;
  try {
    opener = window.opener && window.opener !== window && window.opener.location.origin === location.origin ? (window.opener as Window) : null;
  } catch {
    opener = null;
  }
  if (!opener) return false;
  opener.postMessage({ type: 'relay-oauth', ...result }, location.origin);
  window.close();
  return true;
}

/** Finishes a sign-in when this page is the provider's redirect. Returns null on a normal page load. */
export async function takeRedirect(): Promise<RedirectResult | null> {
  const found = paramsFromUrl();
  if (!found.access && !found.code && !found.error) return null;
  const pending = loadJSON<Pending>(PENDING_KEY);
  cleanAddress();
  removeKey(PENDING_KEY);
  if (!pending || !found.state || found.state !== pending.state) return { error: 'That sign-in had expired. Try again.' };
  if (found.error) return { error: found.errorDescription || 'Sign-in was cancelled.' };
  try {
    let access = found.access;
    let refresh = '';
    let expiresAt = Date.now() + found.expiresIn * 1000;
    if (pending.provider === 'outlook') {
      const json = await microsoftToken(pending.clientId, {
        grant_type: 'authorization_code',
        code: found.code,
        redirect_uri: redirectUri(),
        code_verifier: pending.verifier || '',
      });
      access = json.access_token!;
      refresh = json.refresh_token || '';
      expiresAt = Date.now() + (json.expires_in || 3600) * 1000;
    }
    const profile = pending.provider === 'gmail' ? await googleProfile(access) : await microsoftProfile(access);
    return { connected: { provider: pending.provider, email: profile.email, name: profile.name, token: { access, refresh: refresh || undefined, expiresAt } } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sign-in did not finish.' };
  }
}

async function googleProfile(access: string) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${access}` } });
  const json = (await res.json()) as { emailAddress?: string; error?: { message?: string } };
  if (!res.ok || !json.emailAddress) throw new Error(json.error?.message || 'Google did not share this account.');
  const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${access}` } });
  const user = (await info.json()) as { name?: string };
  return { email: json.emailAddress, name: user.name || json.emailAddress };
}

async function microsoftProfile(access: string) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', { headers: { Authorization: `Bearer ${access}` } });
  const json = (await res.json()) as { displayName?: string; mail?: string; userPrincipalName?: string; error?: { message?: string } };
  const email = json.mail || json.userPrincipalName || '';
  if (!res.ok || !email) throw new Error(json.error?.message || 'Microsoft did not share this account.');
  return { email, name: json.displayName || email };
}

export async function replaceInbox(db: MailSnapshot, account: EmailAccount) {
  const inbox = await pullInbox(account);
  db.emails = db.emails.filter((e) => !(e.accountId === account.id && e.folderId === 'inbox'));
  db.emails.push(...inbox);
  account.syncStatus = 'ok';
  account.syncError = null;
  account.lastSyncAt = new Date().toISOString();
  return inbox;
}
