import { config } from '../config/env';
import type { Mailbox, OutgoingAttachment } from '../types/mail';
import { formatBytes } from './format';

const EMAIL_RE = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]{2,}$/;

export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

/** Parses `Name <a@b.com>`, `"Name" <a@b.com>` or `a@b.com`. */
export function parseMailbox(raw: string): Mailbox | null {
  const text = raw.trim();
  const angle = /^(.*)<([^>]+)>\s*$/.exec(text);
  if (angle) {
    const email = angle[2].trim();
    if (!isValidEmail(email)) return null;
    const name = angle[1].trim().replace(/^"(.*)"$/, '$1').trim();
    return { name: name || email, email };
  }
  return isValidEmail(text) ? { name: text, email: text } : null;
}

/** Splits a pasted address list on commas, semicolons and newlines, ignoring separators inside quotes. */
export function splitAddresses(raw: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of raw) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && (ch === ',' || ch === ';' || ch === '\n')) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** Returns a user-facing problem, or null if the file can be attached. */
export function validateAttachment(file: File, existing: OutgoingAttachment[]): string | null {
  if (existing.length >= config.maxAttachments) return `You can attach up to ${config.maxAttachments} files.`;
  const ext = fileExtension(file.name);
  if ((config.blockedExtensions as readonly string[]).includes(ext)) return `${file.name} can't be attached: Gmail and Outlook block .${ext} files.`;
  if (file.size === 0) return `${file.name} is empty.`;
  const total = existing.reduce((s, a) => s + a.fileSize, 0) + file.size;
  if (total > config.maxAttachmentBytes) return `${file.name} would take this message over ${formatBytes(config.maxAttachmentBytes)}.`;
  return null;
}

/** Normalises user input for a link. Returns null for anything that isn't a web or email address. */
export function normaliseLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (isValidEmail(s)) return `mailto:${s}`;
  if (/^mailto:/i.test(s)) return isValidEmail(s.slice(7)) ? s : null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.href;
  } catch {
    return null;
  }
}
