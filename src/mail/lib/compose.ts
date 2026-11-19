import type { DraftInput, Email, EmailAccount, Mailbox } from '../types/mail';
import { formatFullDate } from './format';
import { escapeHtml, sanitiseComposerHtml, textToHtml } from './sanitize';

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward' | 'draft';

/** The signature block. `data-signature` lets the editor swap it when the From account changes. */
export function signatureHtml(signature: string): string {
  if (!signature.trim()) return '';
  return `<div data-signature="">-- <br>${escapeHtml(signature.trim()).replace(/\n/g, '<br>')}</div>`;
}

function prefixed(prefix: 'Re' | 'Fwd', subject: string): string {
  const re = prefix === 'Re' ? /^re:/i : /^(fwd?|fw):/i;
  return re.test(subject.trim()) ? subject.trim() : `${prefix}: ${subject.trim()}`.trim();
}

function quotedBody(source: Email): string {
  return source.bodyHtml ? sanitiseComposerHtml(source.bodyHtml) : textToHtml(source.bodyText);
}

function mailboxLine(list: Mailbox[]): string {
  return list.map((m) => (m.name && m.name !== m.email ? `${m.name} &lt;${escapeHtml(m.email)}&gt;` : escapeHtml(m.email))).join(', ');
}

function dedupe(list: Mailbox[], exclude: Set<string>): Mailbox[] {
  const seen = new Set(exclude);
  return list.filter((m) => {
    const k = m.email.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Seeds a composer for a new message, reply, reply all, forward, or an existing draft. */
export function seedDraft(mode: ComposeMode, source: Email | undefined, accounts: EmailAccount[]): DraftInput {
  const fallback = accounts.find((a) => a.isDefault && a.syncStatus !== 'error') ?? accounts.find((a) => a.syncStatus !== 'error') ?? accounts[0];
  const account = (source && accounts.find((a) => a.id === source.accountId)) ?? fallback;
  const accountId = account?.id ?? '';
  const sig = signatureHtml(account?.signature ?? '');
  const empty: DraftInput = { accountId, to: [], cc: [], bcc: [], subject: '', bodyHtml: `<p><br></p>${sig}`, attachments: [], inReplyToId: null, threadId: null };

  if (!source || mode === 'new') return empty;

  if (mode === 'draft') {
    return {
      id: source.id,
      accountId: source.accountId,
      to: source.to,
      cc: source.cc,
      bcc: source.bcc,
      subject: source.subject,
      bodyHtml: source.bodyHtml ?? textToHtml(source.bodyText),
      attachments: source.attachments,
      inReplyToId: source.inReplyToId,
      threadId: source.threadId,
    };
  }

  const me = new Set(accounts.map((a) => a.providerEmail.toLowerCase()));
  const fromMe = me.has(source.from.email.toLowerCase());

  if (mode === 'forward') {
    const header =
      `<p>---------- Forwarded message ----------<br>From: ${mailboxLine([source.from])}<br>Date: ${escapeHtml(formatFullDate(source.receivedAt))}<br>` +
      `Subject: ${escapeHtml(source.subject)}<br>To: ${mailboxLine(source.to)}</p>`;
    return {
      ...empty,
      subject: prefixed('Fwd', source.subject),
      bodyHtml: `<p><br></p>${sig}<blockquote>${header}${quotedBody(source)}</blockquote>`,
      attachments: source.attachments.map((a) => ({ ...a })),
      threadId: source.threadId,
    };
  }

  const to = fromMe ? source.to : [source.from];
  const cc = mode === 'replyAll' ? dedupe([...(fromMe ? [] : source.to), ...source.cc], new Set([...me, ...to.map((m) => m.email.toLowerCase())])) : [];
  const quote = `<blockquote><p>On ${escapeHtml(formatFullDate(source.receivedAt))}, ${mailboxLine([source.from])} wrote:</p>${quotedBody(source)}</blockquote>`;
  return {
    ...empty,
    to: mode === 'replyAll' ? dedupe(to, me) : to,
    cc,
    subject: prefixed('Re', source.subject),
    bodyHtml: `<p><br></p>${sig}${quote}`,
    inReplyToId: source.id,
    threadId: source.threadId,
  };
}
