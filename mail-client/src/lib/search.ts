import type { Email } from '../types/mail';

/**
 * Gmail-style search: free text plus `from: to: subject: has:attachment is:unread is:read
 * is:starred is:important before: after: in: label: account: filename:`. A leading `-` negates a term.
 * Values with spaces can be quoted: `subject:"quarterly report"`.
 */
export const OPERATORS = ['from', 'to', 'subject', 'has', 'is', 'before', 'after', 'in', 'label', 'account', 'filename'] as const;
export type Operator = (typeof OPERATORS)[number];

export interface QueryTerm {
  op: Operator | 'text';
  value: string;
  negate: boolean;
}

export interface ParsedQuery {
  terms: QueryTerm[];
  /** The query names a folder with `in:`, so the current view shouldn't restrict it. */
  hasIn: boolean;
}

export interface MatchContext {
  labelName(id: string): string;
  accountText(id: string): string;
  folderName(id: string): string;
}

const TOKEN_RE = /(-?)(?:([a-z]+):)?("([^"]*)"|\S+)/gi;

export function parseQuery(q: string): ParsedQuery {
  const terms: QueryTerm[] = [];
  for (const m of q.matchAll(TOKEN_RE)) {
    const negate = m[1] === '-';
    const op = m[2]?.toLowerCase();
    const value = (m[4] ?? m[3]).trim();
    if (!value) continue;
    if (op && (OPERATORS as readonly string[]).includes(op)) terms.push({ op: op as Operator, value: value.toLowerCase(), negate });
    else terms.push({ op: 'text', value: (op ? `${op}:${value}` : value).toLowerCase(), negate });
  }
  return { terms, hasIn: terms.some((t) => t.op === 'in' && !t.negate) };
}

function parseDate(s: string): number | null {
  const norm = s.replace(/\//g, '-');
  const t = Date.parse(/^\d{4}-\d{1,2}-\d{1,2}$/.test(norm) ? `${norm}T00:00:00` : norm);
  return Number.isNaN(t) ? null : t;
}

const people = (list: { name: string; email: string }[]) => list.map((m) => `${m.name} ${m.email}`).join(' ').toLowerCase();

function termMatches(e: Email, t: QueryTerm, ctx: MatchContext): boolean {
  const v = t.value;
  switch (t.op) {
    case 'from':
      return people([e.from]).includes(v);
    case 'to':
      return people([...e.to, ...e.cc, ...e.bcc]).includes(v);
    case 'subject':
      return e.subject.toLowerCase().includes(v);
    case 'has':
      return v === 'attachment' || v === 'attachments' ? e.hasAttachments : false;
    case 'is':
      if (v === 'unread') return !e.isRead;
      if (v === 'read') return e.isRead;
      if (v === 'starred') return e.isStarred;
      if (v === 'important') return e.isImportant;
      return false;
    case 'before': {
      const d = parseDate(v);
      return d !== null && new Date(e.receivedAt).getTime() < d;
    }
    case 'after': {
      const d = parseDate(v);
      return d !== null && new Date(e.receivedAt).getTime() >= d;
    }
    case 'in':
      return v === 'anywhere' || e.folderId === v || ctx.folderName(e.folderId).toLowerCase() === v;
    case 'label':
      return e.labelIds.some((id) => ctx.labelName(id).toLowerCase().includes(v));
    case 'account':
      return ctx.accountText(e.accountId).toLowerCase().includes(v);
    case 'filename':
      return e.attachments.some((a) => a.filename.toLowerCase().includes(v));
    case 'text': {
      const hay = `${e.subject} ${people([e.from, ...e.to, ...e.cc])} ${e.bodyText} ${e.attachments.map((a) => a.filename).join(' ')}`.toLowerCase();
      return hay.includes(v);
    }
  }
}

export function matchQuery(e: Email, q: ParsedQuery, ctx: MatchContext): boolean {
  return q.terms.every((t) => termMatches(e, t, ctx) !== t.negate);
}

export interface AdvancedSearch {
  from: string;
  to: string;
  subject: string;
  words: string;
  hasAttachment: boolean;
  unread: boolean;
  after: string;
  before: string;
}

const quote = (s: string) => (/\s/.test(s.trim()) ? `"${s.trim()}"` : s.trim());

export function buildAdvancedQuery(a: AdvancedSearch): string {
  const parts: string[] = [];
  if (a.from.trim()) parts.push(`from:${quote(a.from)}`);
  if (a.to.trim()) parts.push(`to:${quote(a.to)}`);
  if (a.subject.trim()) parts.push(`subject:${quote(a.subject)}`);
  if (a.hasAttachment) parts.push('has:attachment');
  if (a.unread) parts.push('is:unread');
  if (a.after) parts.push(`after:${a.after}`);
  if (a.before) parts.push(`before:${a.before}`);
  if (a.words.trim()) parts.push(a.words.trim());
  return parts.join(' ');
}
