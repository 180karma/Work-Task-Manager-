import { deliveryToEmail, seedSnapshot, SYNC_DELIVERIES } from '../../data/mockData';
import { uid } from '../../lib/id';
import { htmlToText } from '../../lib/sanitize';
import { loadJSON, saveJSON } from '../../lib/storage';
import type { DraftInput, Email, EmailAccount, EmailPatch, Folder, Label, MailSnapshot, OutgoingAttachment, Provider } from '../../types/mail';
import type { MailService } from './MailService';

const KEY = 'mailbox-v1';
const SYNC_KEY = 'sync-deliveries-v1';
const LATENCY_MS = 120;

const wait = (ms = LATENCY_MS) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Blob URLs and File objects don't survive a reload, so stored attachments keep metadata only. */
function storable(a: OutgoingAttachment) {
  const { file: _file, ...rest } = a;
  void _file;
  return rest.previewUrl?.startsWith('blob:') ? { ...rest, previewUrl: undefined } : rest;
}

/** Phase 1 backend: async, persisted to localStorage, deterministic demo behaviour. */
export class MockMailService implements MailService {
  readonly mode = 'mock' as const;
  private db: MailSnapshot;

  constructor() {
    this.db = loadJSON<MailSnapshot>(KEY) ?? seedSnapshot();
  }

  private commit() {
    saveJSON(KEY, this.db);
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
    await wait(350);
    return clone(this.db);
  }

  async reset(): Promise<MailSnapshot> {
    await wait();
    this.db = seedSnapshot();
    saveJSON(SYNC_KEY, {});
    this.commit();
    return clone(this.db);
  }

  async updateEmails(ids: string[], patch: EmailPatch) {
    await wait();
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
    if (a.syncStatus === 'error') throw new Error(`${a.label} needs to be reconnected before it can send.`);
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
    await wait();
    return {
      url: null,
      message: provider === 'gmail' ? 'Google sign-in is connected in Phase 3. The demo accounts show how it will look.' : 'Microsoft sign-in is connected in Phase 4. The demo accounts show how it will look.',
    };
  }

  async disconnect(accountId: string) {
    await wait();
    const wasDefault = this.account(accountId).isDefault;
    this.db.accounts = this.db.accounts.filter((a) => a.id !== accountId);
    this.db.emails = this.db.emails.filter((e) => e.accountId !== accountId);
    if (wasDefault && this.db.accounts[0]) this.db.accounts[0].isDefault = true;
    this.commit();
  }

  async updateAccount(accountId: string, patch: Partial<Pick<EmailAccount, 'signature' | 'isDefault' | 'label' | 'colour'>>) {
    await wait();
    const a = this.account(accountId);
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
