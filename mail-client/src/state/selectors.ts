import { matchQuery, type MatchContext, type ParsedQuery } from '../lib/search';
import type { Email } from '../types/mail';

export type SystemView = 'inbox' | 'starred' | 'important' | 'drafts' | 'sent' | 'archive' | 'spam' | 'trash';
export type FolderView = SystemView | `folder:${string}` | `label:${string}`;
export type QuickFilter = 'all' | 'unread' | 'starred' | 'attachments';
/** 'all' or an account id. */
export type Scope = string;

export const SYSTEM_VIEW_NAMES: Record<string, string> = {
  inbox: 'Inbox',
  starred: 'Starred',
  important: 'Important',
  drafts: 'Drafts',
  sent: 'Sent',
  archive: 'Archive',
  spam: 'Spam',
  trash: 'Trash',
};

/** One row in the message list: a conversation, or a single message when grouping is off. */
export interface ListItem {
  key: string;
  latest: Email;
  ids: string[];
  count: number;
  unread: boolean;
  starred: boolean;
  important: boolean;
  hasAttachments: boolean;
  hasDraft: boolean;
  participants: string[];
}

const HIDDEN = new Set(['trash', 'spam']);

export function threadKey(e: Email): string {
  return `${e.accountId}:${e.threadId}`;
}

export function inView(e: Email, view: FolderView): boolean {
  switch (view) {
    case 'starred':
      return e.isStarred && !HIDDEN.has(e.folderId);
    case 'important':
      return e.isImportant && !HIDDEN.has(e.folderId);
    case 'inbox':
    case 'drafts':
    case 'sent':
    case 'archive':
    case 'spam':
    case 'trash':
      return e.folderId === view;
    default:
      if (view.startsWith('folder:')) return e.folderId === view.slice(7);
      if (view.startsWith('label:')) return e.labelIds.includes(view.slice(6)) && !HIDDEN.has(e.folderId);
      return false;
  }
}

function passesFilter(e: Email, filter: QuickFilter): boolean {
  if (filter === 'unread') return !e.isRead;
  if (filter === 'starred') return e.isStarred;
  if (filter === 'attachments') return e.hasAttachments;
  return true;
}

export interface BuildOptions {
  view: FolderView;
  scope: Scope;
  filter: QuickFilter;
  query: ParsedQuery | null;
  conversations: boolean;
  myAddresses: Set<string>;
  matchCtx: MatchContext;
}

export function buildItems(emails: Email[], o: BuildOptions): ListItem[] {
  const matched = emails.filter((e) => {
    if (o.scope !== 'all' && e.accountId !== o.scope) return false;
    if (o.query) {
      // Like Gmail, search covers all mail except Spam and Trash unless `in:` says otherwise.
      if (!o.query.hasIn && HIDDEN.has(e.folderId)) return false;
      if (!matchQuery(e, o.query, o.matchCtx)) return false;
    } else if (!inView(e, o.view)) return false;
    return passesFilter(e, o.filter);
  });

  const groups = new Map<string, Email[]>();
  for (const e of matched) {
    const k = o.conversations ? threadKey(e) : e.id;
    const g = groups.get(k);
    if (g) g.push(e);
    else groups.set(k, [e]);
  }

  const items: ListItem[] = [];
  for (const [key, members] of groups) {
    members.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    const chronological = [...members].reverse();
    const names: string[] = [];
    for (const m of chronological) {
      const name = m.from.name || m.from.email;
      const n = o.myAddresses.has(m.from.email.toLowerCase()) ? 'me' : members.length > 1 ? name.split(' ')[0] : name;
      if (!names.includes(n)) names.push(n);
    }
    const latest = members[0];
    // In Sent and Drafts, show who it went to.
    const participants =
      (o.view === 'sent' || o.view === 'drafts') && !o.query && o.myAddresses.has(latest.from.email.toLowerCase())
        ? [`To: ${latest.to.map((t) => t.name || t.email).join(', ') || '(no recipients)'}`]
        : names;
    items.push({
      key,
      latest,
      ids: members.map((m) => m.id),
      count: members.length,
      unread: members.some((m) => !m.isRead),
      starred: members.some((m) => m.isStarred),
      important: members.some((m) => m.isImportant),
      hasAttachments: members.some((m) => m.hasAttachments),
      hasDraft: members.some((m) => m.folderId === 'drafts'),
      participants,
    });
  }
  return items.sort((a, b) => b.latest.receivedAt.localeCompare(a.latest.receivedAt));
}

export interface UnreadCounts {
  allInboxes: number;
  inbox: number;
  drafts: number;
  spam: number;
  folders: Record<string, number>;
  accounts: Record<string, number>;
}

export function countUnread(emails: Email[], scope: Scope): UnreadCounts {
  const c: UnreadCounts = { allInboxes: 0, inbox: 0, drafts: 0, spam: 0, folders: {}, accounts: {} };
  for (const e of emails) {
    const inScope = scope === 'all' || e.accountId === scope;
    if (e.folderId === 'inbox' && !e.isRead) {
      c.allInboxes++;
      c.accounts[e.accountId] = (c.accounts[e.accountId] ?? 0) + 1;
    }
    if (!inScope) continue;
    if (e.folderId === 'drafts') c.drafts++;
    else if (!e.isRead) {
      if (e.folderId === 'inbox') c.inbox++;
      else if (e.folderId === 'spam') c.spam++;
      else c.folders[e.folderId] = (c.folders[e.folderId] ?? 0) + 1;
    }
  }
  return c;
}

/** All messages in a conversation, oldest first, for the reading pane. */
export function conversationOf(emails: Email[], item: ListItem, conversations: boolean): Email[] {
  if (!conversations) return emails.filter((e) => item.ids.includes(e.id));
  const key = threadKey(item.latest);
  const showHidden = HIDDEN.has(item.latest.folderId);
  return emails
    .filter((e) => threadKey(e) === key && (showHidden || !HIDDEN.has(e.folderId) || item.ids.includes(e.id)))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}
