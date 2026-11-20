import { deliveryToEmail, seedSnapshot, SYNC_DELIVERIES } from '../../data/mockData';
import { uid } from '../../lib/id';
import { htmlToText } from '../../lib/sanitize';
import { loadJSON, removeKey, saveJSON } from '../../lib/storage';
import type { DraftInput, Email, EmailAccount, EmailPatch, Folder, Label, MailSnapshot, OutgoingAttachment, Provider } from '../../types/mail';
import type { MailAccess, MailService } from './MailService';
import {
  accountIdFor,
  buildAuthUrl,
  colours,
  forgetToken,
  isLive,
  missingClientMessage,
  patchLive,
  rememberToken,
  replaceInbox,
  sendLive,
  sendToOpener,
  setClients,
  takeRedirect,
  loadTokens,
  type RedirectResult,
  type Token,
} from './oauth';
import { deleteAccount, fetchSetup, saveAccount, saveSignInApps as saveApps, saveToken, signedIn, wtmClient, type RemoteAccount, type WtmClient } from './wtm';

const KEY = 'mailbox-v1';
const SYNC_KEY = 'sync-deliveries-v1';
const LATENCY_MS = 120;

const DEMO: MailAccess = { mode: 'demo', message: '', canConfigure: false, googleClientId: '', microsoftClientId: '' };
const locked = (message: string): MailAccess => ({ ...DEMO, mode: 'locked', message });

const wait = (ms = LATENCY_MS) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Blob URLs and File objects don't survive a reload, so stored attachments keep metadata only. */
function storable(a: OutgoingAttachment) {
  const { file: _file, ...rest } = a;
  void _file;
  return rest.previewUrl?.startsWith('blob:') ? { ...rest, previewUrl: undefined } : rest;
}

/**
 * Messages and folders are cached in this browser, one cache per WTM login.
 * Connected Gmail and Outlook mailboxes, and their sign-in tokens, are saved
 * to the WTM login through wtm.ts. Sample accounts stay local.
 */
export class MockMailService implements MailService {
  readonly mode = 'mock' as const;
  private db: MailSnapshot;
  private key = KEY;
  private info: MailAccess = DEMO;
  private client: WtmClient | null = null;
  private remote: RemoteAccount[] = [];
  private attached: Promise<void> | null = null;

  constructor() {
    removeKey('oauth-tokens');
    removeKey('oauth-clients');
    this.db = loadJSON<MailSnapshot>(KEY) ?? seedSnapshot();
  }

  private commit() {
    saveJSON(this.key, this.db);
  }

  access() {
    return this.info;
  }

  /** Finds the WTM login and loads its mail setup, once per page. */
  private attach() {
    this.attached ??= (async () => {
      const client = await wtmClient();
      if (!client) return;
      if (!(await signedIn(client))) {
        this.info = locked('Sign in to Work Task Manager, then open Mail from there.');
        return;
      }
      const setup = await fetchSetup(client);
      if (!setup.allowed) {
        this.info = locked('Mail is for department heads and IT. Ask admin or IT to unlock it for you.');
        return;
      }
      this.client = client;
      this.applySetup(setup.google_client_id ?? '', setup.microsoft_client_id ?? '', !!setup.can_configure, setup.accounts ?? []);
      this.key = `${KEY}:${setup.user_id}`;
      this.db = loadJSON<MailSnapshot>(this.key) ?? seedSnapshot();
      this.mergeRemote();
      this.commit();
    })().catch((err) => {
      this.attached = null;
      throw err;
    });
    return this.attached;
  }

  private applySetup(google: string, microsoft: string, canConfigure: boolean, accounts: RemoteAccount[]) {
    this.info = { mode: 'live', message: '', canConfigure, googleClientId: google, microsoftClientId: microsoft };
    this.remote = accounts;
    setClients(google, microsoft);
    loadTokens(
      accounts.filter((a) => a.token?.access).map((a) => [a.id, a.token as Token]),
      (id, token) => {
        const a = this.db.accounts.find((x) => x.id === id);
        if (a && this.client) void saveToken(this.client, a, token).catch(() => {});
      },
    );
  }

  /** The saved mailboxes win: add new ones, refresh details, drop ones removed elsewhere. */
  private mergeRemote() {
    const ids = new Set(this.remote.map((r) => r.id));
    const gone = new Set(this.db.accounts.filter((a) => isLive(a.id) && !ids.has(a.id)).map((a) => a.id));
    this.db.accounts = this.db.accounts.filter((a) => !gone.has(a.id));
    this.db.emails = this.db.emails.filter((e) => !gone.has(e.accountId));
    for (const r of this.remote) {
      const existing = this.db.accounts.find((a) => a.id === r.id);
      const details = {
        provider: r.provider,
        providerEmail: r.provider_email,
        displayName: r.display_name || r.provider_email,
        label: r.label || r.display_name || r.provider_email,
        colour: r.colour || colours[r.provider],
        signature: r.signature,
        isDefault: r.is_default,
        connectedAt: r.connected_at,
      };
      if (existing) Object.assign(existing, details);
      else this.db.accounts.push({ id: r.id, ...details, syncStatus: r.token?.access ? 'ok' : 'error', syncError: r.token?.access ? null : 'Sign in again.', lastSyncAt: null });
    }
    if (this.remote.some((r) => r.is_default)) for (const a of this.db.accounts) if (!isLive(a.id)) a.isDefault = false;
    if (!this.db.accounts.some((a) => a.isDefault) && this.db.accounts[0]) this.db.accounts[0].isDefault = true;
  }

  private async saveRemote(a: EmailAccount, token?: Token) {
    if (!this.client || !isLive(a.id)) return;
    await saveAccount(this.client, a, token);
  }

  private account(id: string): EmailAccount {
    const a = this.db.accounts.find((x) => x.id === id);
    if (!a) throw new Error('That account is no longer connected.');
    return a;
  }

  private each(ids: string[], fn: (e: Email) => void) {
    const set = new Set(ids);
    for (const e of this.db.emails) if (set.has(e.id)) fn(e);
  }

  async load(): Promise<MailSnapshot> {
    const redirect = await takeRedirect();
    if (redirect && sendToOpener(redirect)) return clone(this.db);
    await this.attach();
    if (redirect) await this.finishConnect(redirect);
    else await wait(350);
    return clone(this.db);
  }

  async reset(): Promise<MailSnapshot> {
    await wait();
    this.db = seedSnapshot();
    if (this.client) {
      const setup = await fetchSetup(this.client);
      if (setup.allowed) this.applySetup(setup.google_client_id ?? '', setup.microsoft_client_id ?? '', !!setup.can_configure, setup.accounts ?? []);
      this.mergeRemote();
    }
    saveJSON(SYNC_KEY, {});
    this.commit();
    return clone(this.db);
  }

  async updateEmails(ids: string[], patch: EmailPatch) {
    await wait();
    const live = this.db.emails.filter((e) => ids.includes(e.id) && isLive(e.accountId));
    const byAccount = new Map<string, Email[]>();
    for (const email of live) {
      const list = byAccount.get(email.accountId) ?? [];
      list.push(email);
      byAccount.set(email.accountId, list);
    }
    for (const [accountId, emails] of byAccount) await patchLive(this.account(accountId), emails, patch);
    this.each(ids, (e) => Object.assign(e, patch));
    this.commit();
  }

  async moveEmails(ids: string[], folderId: string) {
    await wait();
    if (!['inbox', 'archive', 'spam', 'trash', 'sent', 'drafts'].includes(folderId) && !this.db.folders.some((f) => f.id === folderId)) throw new Error('That folder no longer exists.');
    this.each(ids, (e) => {
      if (e.folderId === folderId) return;
      e.previousFolderId = e.folderId;
      e.folderId = folderId;
    });
    this.commit();
  }

  async setLabel(ids: string[], labelId: string, on: boolean) {
    await wait();
    this.each(ids, (e) => {
      const has = e.labelIds.includes(labelId);
      if (on && !has) e.labelIds = [...e.labelIds, labelId];
      if (!on && has) e.labelIds = e.labelIds.filter((l) => l !== labelId);
    });
    this.commit();
  }

  async deleteForever(ids: string[]) {
    await wait();
    const set = new Set(ids);
    this.db.emails = this.db.emails.filter((e) => !set.has(e.id));
    this.commit();
  }

  private toEmail(input: DraftInput, folderId: string, id: string): Email {
    const a = this.account(input.accountId);
    const text = htmlToText(input.bodyHtml);
    const attachments = input.attachments.map(storable);
    return {
      id,
      accountId: a.id,
      threadId: input.threadId ?? `t_${id}`,
      folderId,
      previousFolderId: null,
      from: { name: a.displayName, email: a.providerEmail },
      to: input.to.map(({ name, email }) => ({ name, email })),
      cc: input.cc.map(({ name, email }) => ({ name, email })),
      bcc: input.bcc.map(({ name, email }) => ({ name, email })),
      subject: input.subject,
      snippet: text.replace(/\s+/g, ' ').slice(0, 160),
      bodyHtml: input.bodyHtml,
      bodyText: text,
      receivedAt: new Date().toISOString(),
      isRead: true,
      isStarred: false,
      isImportant: false,
      hasAttachments: attachments.length > 0,
      attachments,
      labelIds: [],
      inReplyToId: input.inReplyToId ?? null,
    };
  }

  async saveDraft(input: DraftInput): Promise<Email> {
    await wait();
    const id = input.id ?? uid('draft');
    const draft = this.toEmail(input, 'drafts', id);
    const i = this.db.emails.findIndex((e) => e.id === id);
    if (i === -1) this.db.emails.push(draft);
    else this.db.emails[i] = draft;
    this.commit();
    return clone(draft);
  }

  async discardDraft(id: string) {
    await wait();
    this.db.emails = this.db.emails.filter((e) => !(e.id === id && e.folderId === 'drafts'));
    this.commit();
  }

  async send(input: DraftInput): Promise<Email> {
    await wait(600);
    const a = this.account(input.accountId);
    if (isLive(a.id)) await sendLive(a, input);
    else if (a.syncStatus === 'error') throw new Error(`${a.label} needs to be reconnected before it can send.`);
    if (input.id) this.db.emails = this.db.emails.filter((e) => e.id !== input.id);
    const sent = this.toEmail(input, 'sent', uid('msg'));
    this.db.emails.push(sent);

    // Demo: mail sent to one of your own connected addresses arrives in that inbox.
    const recipients = new Set([...input.to, ...input.cc, ...input.bcc].map((r) => r.email.toLowerCase()));
    for (const own of this.db.accounts) {
      if (!recipients.has(own.providerEmail.toLowerCase())) continue;
      this.db.emails.push({ ...clone(sent), id: uid('msg'), accountId: own.id, threadId: `${sent.threadId}_${own.id}`, folderId: 'inbox', isRead: false });
    }
    this.commit();
    return clone(sent);
  }

  async syncAccount(accountId: string) {
    await wait(900);
    const a = this.account(accountId);
    if (isLive(a.id)) {
      try {
        const delivered = await replaceInbox(this.db, a);
        this.commit();
        return { account: clone(a), delivered: clone(delivered) };
      } catch (err) {
        a.syncStatus = 'error';
        a.syncError = err instanceof Error ? err.message : 'This account did not sync.';
        this.commit();
        throw err;
      }
    }
    if (a.syncStatus === 'error') throw new Error(a.syncError ?? `${a.label} can't sync right now.`);
    const counts = loadJSON<Record<string, number>>(SYNC_KEY) ?? {};
    const queue = SYNC_DELIVERIES[accountId] ?? [];
    const n = counts[accountId] ?? 0;
    const delivered: Email[] = [];
    if (n < queue.length) {
      const email = deliveryToEmail(accountId, queue[n], `sync_${accountId}_${n}`);
      // Dedupe in case the same delivery was already stored by an earlier tab.
      if (!this.db.emails.some((e) => e.id === email.id)) {
        this.db.emails.push(email);
        delivered.push(email);
      }
      counts[accountId] = n + 1;
      saveJSON(SYNC_KEY, counts);
    }
    a.lastSyncAt = new Date().toISOString();
    this.commit();
    return { account: clone(a), delivered: clone(delivered) };
  }

  async beginConnect(provider: Provider) {
    await this.attach();
    if (this.info.mode === 'demo') return { url: null, message: 'Open Mail from Work Task Manager to connect a real mailbox.' };
    if (this.info.mode === 'locked') return { url: null, message: this.info.message };
    const url = await buildAuthUrl(provider);
    return { url, message: url ? '' : missingClientMessage(provider) };
  }

  async finishConnect(result: RedirectResult) {
    await this.attach();
    if (result.error || !result.connected) throw new Error(result.error || 'Sign-in did not finish.');
    if (this.info.mode !== 'live' || !this.client) throw new Error(this.info.message || 'Open Mail from Work Task Manager to connect a mailbox.');
    const c = result.connected;
    const id = accountIdFor(c.provider, c.email);
    let account = this.db.accounts.find((a) => a.id === id);
    if (!account) {
      account = {
        id,
        provider: c.provider,
        providerEmail: c.email,
        displayName: c.name || c.email,
        label: c.name || c.email,
        colour: colours[c.provider],
        signature: '',
        isDefault: !this.db.accounts.some((a) => isLive(a.id)),
        syncStatus: 'ok',
        syncError: null,
        lastSyncAt: null,
        connectedAt: new Date().toISOString(),
      };
      if (account.isDefault) for (const a of this.db.accounts) a.isDefault = false;
      this.db.accounts.push(account);
    }
    account.syncStatus = 'ok';
    account.syncError = null;
    rememberToken(id, c.token);
    await saveAccount(this.client, account, c.token);
    try {
      await replaceInbox(this.db, account);
    } catch (err) {
      account.syncStatus = 'error';
      account.syncError = err instanceof Error ? err.message : 'This account did not sync.';
    }
    this.commit();
    return c.email;
  }

  async saveSignInApps(google: string, microsoft: string) {
    await this.attach();
    if (!this.client || !this.info.canConfigure) throw new Error('Only admin and IT set up mail sign-in.');
    await saveApps(this.client, google, microsoft);
    this.info = { ...this.info, googleClientId: google.trim(), microsoftClientId: microsoft.trim() };
    setClients(google, microsoft);
  }

  async disconnect(accountId: string) {
    await wait();
    if (this.client && isLive(accountId)) await deleteAccount(this.client, accountId);
    forgetToken(accountId);
    const wasDefault = this.account(accountId).isDefault;
    this.db.accounts = this.db.accounts.filter((a) => a.id !== accountId);
    this.db.emails = this.db.emails.filter((e) => e.accountId !== accountId);
    if (wasDefault && this.db.accounts[0]) this.db.accounts[0].isDefault = true;
    this.commit();
  }

  async updateAccount(accountId: string, patch: Partial<Pick<EmailAccount, 'signature' | 'isDefault' | 'label' | 'colour'>>) {
    await wait();
    const a = this.account(accountId);
    await this.saveRemote({ ...a, ...patch });
    if (patch.isDefault) for (const x of this.db.accounts) x.isDefault = false;
    Object.assign(a, patch);
    this.commit();
    return clone(this.db.accounts);
  }

  private checkName(name: string, list: { id: string; name: string }[], kind: 'folder' | 'label', exceptId?: string) {
    const n = name.trim();
    if (!n) throw new Error(`Enter a ${kind} name.`);
    if (n.length > 40) throw new Error(`${kind === 'folder' ? 'Folder' : 'Label'} names can be up to 40 characters.`);
    const taken = list.some((x) => x.id !== exceptId && x.name.toLowerCase() === n.toLowerCase());
    if (taken) throw new Error(`There's already a ${kind} called ${n}.`);
    return n;
  }

  async createFolder(name: string): Promise<Folder> {
    await wait();
    const reserved = ['inbox', 'drafts', 'sent', 'archive', 'spam', 'trash', 'starred', 'important'];
    if (reserved.includes(name.trim().toLowerCase())) throw new Error(`${name.trim()} is a built-in folder.`);
    const folder = { id: uid('f'), name: this.checkName(name, this.db.folders, 'folder') };
    this.db.folders.push(folder);
    this.commit();
    return clone(folder);
  }

  async renameFolder(id: string, name: string): Promise<Folder> {
    await wait();
    const f = this.db.folders.find((x) => x.id === id);
    if (!f) throw new Error('That folder no longer exists.');
    f.name = this.checkName(name, this.db.folders, 'folder', id);
    this.commit();
    return clone(f);
  }

  async deleteFolder(id: string) {
    await wait();
    this.db.folders = this.db.folders.filter((f) => f.id !== id);
    for (const e of this.db.emails) {
      if (e.folderId === id) {
        e.folderId = 'archive';
        e.previousFolderId = null;
      }
      if (e.previousFolderId === id) e.previousFolderId = null;
    }
    this.commit();
  }

  async createLabel(name: string, colour: string): Promise<Label> {
    await wait();
    const label = { id: uid('l'), name: this.checkName(name, this.db.labels, 'label'), colour };
    this.db.labels.push(label);
    this.commit();
    return clone(label);
  }

  async deleteLabel(id: string) {
    await wait();
    this.db.labels = this.db.labels.filter((l) => l.id !== id);
    for (const e of this.db.emails) e.labelIds = e.labelIds.filter((l) => l !== id);
    this.commit();
  }
}
