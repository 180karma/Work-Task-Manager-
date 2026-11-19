// Seeded demo mailbox. Every person, company and address here is fictional.
import type { Attachment, Contact, Email, EmailAccount, Folder, Label, Mailbox, MailSnapshot } from '../types/mail';
import { mockImages } from './mockImages';

const ME_WORK: Mailbox = { name: 'Alex Morgan', email: 'alex@northwind-studio.example' };
const ME_HOME: Mailbox = { name: 'Alex Morgan', email: 'alex.morgan@outlook.example' };
const ME_FREE: Mailbox = { name: 'Alex Morgan Design', email: 'alexmorgan.design@gmail.example' };

const P = {
  priya: { name: 'Priya Raman', email: 'priya@northwind-studio.example' },
  tom: { name: 'Tom Okafor', email: 'tom.okafor@northwind-studio.example' },
  lena: { name: 'Lena Fischer', email: 'lena@brightpath.example' },
  marco: { name: 'Marco Bianchi', email: 'marco@harbourlight.example' },
  sam: { name: 'Sam Patel', email: 'sam.patel@outlook.example' },
  mum: { name: 'Mum', email: 'jane.morgan@outlook.example' },
  airline: { name: 'SkyWays', email: 'bookings@skyways.example' },
  bank: { name: 'Fernhill Bank', email: 'no-reply@fernhill-bank.example' },
  cloud: { name: 'Stackhouse', email: 'billing@stackhouse.example' },
  news: { name: 'Design Weekly', email: 'hello@designweekly.example' },
  spam: { name: 'Prize Centre', email: 'winner@claim-now.example' },
  gym: { name: 'Peak Fitness', email: 'members@peakfitness.example' },
} satisfies Record<string, Mailbox>;

export const seedAccounts = (now: number): EmailAccount[] => [
  {
    id: 'acc_work',
    provider: 'gmail',
    providerEmail: ME_WORK.email,
    displayName: ME_WORK.name,
    label: 'Work',
    colour: '#2f6feb',
    signature: 'Alex Morgan\nProduct Designer, Northwind Studio',
    isDefault: true,
    syncStatus: 'ok',
    syncError: null,
    lastSyncAt: new Date(now - 4 * 60_000).toISOString(),
    connectedAt: new Date(now - 220 * 86_400_000).toISOString(),
  },
  {
    id: 'acc_home',
    provider: 'outlook',
    providerEmail: ME_HOME.email,
    displayName: ME_HOME.name,
    label: 'Personal',
    colour: '#1d9a6c',
    signature: 'Alex',
    isDefault: false,
    syncStatus: 'ok',
    syncError: null,
    lastSyncAt: new Date(now - 11 * 60_000).toISOString(),
    connectedAt: new Date(now - 90 * 86_400_000).toISOString(),
  },
  {
    id: 'acc_free',
    provider: 'gmail',
    providerEmail: ME_FREE.email,
    displayName: ME_FREE.name,
    label: 'Freelance',
    colour: '#d9480f',
    signature: 'Alex Morgan Design\nalexmorgan.design',
    isDefault: false,
    syncStatus: 'error',
    syncError: 'Google stopped accepting Relay’s sign-in for this account (the access was revoked or the password changed). Reconnect to resume syncing.',
    lastSyncAt: new Date(now - 2 * 86_400_000).toISOString(),
    connectedAt: new Date(now - 40 * 86_400_000).toISOString(),
  },
];

export const seedFolders: Folder[] = [
  { id: 'f_clients', name: 'Clients' },
  { id: 'f_receipts', name: 'Receipts' },
];

export const seedLabels: Label[] = [
  { id: 'l_urgent', name: 'Urgent', colour: '#c2255c' },
  { id: 'l_follow', name: 'Follow up', colour: '#e8a317' },
  { id: 'l_travel', name: 'Travel', colour: '#0c8599' },
];

export const seedContacts: Contact[] = [
  { id: 'c1', ...P.priya, company: 'Northwind Studio' },
  { id: 'c2', ...P.tom, company: 'Northwind Studio' },
  { id: 'c3', ...P.lena, company: 'Brightpath' },
  { id: 'c4', ...P.marco, company: 'Harbourlight' },
  { id: 'c5', ...P.sam, company: null },
  { id: 'c6', ...P.mum, company: null },
  { id: 'c7', name: 'Nora Lindqvist', email: 'nora@brightpath.example', company: 'Brightpath' },
  { id: 'c8', name: 'Diego Alvarez', email: 'diego@northwind-studio.example', company: 'Northwind Studio' },
];

interface Seed {
  id: string;
  acc: 'acc_work' | 'acc_home' | 'acc_free';
  thread?: string;
  folder?: string;
  from: Mailbox;
  to?: Mailbox[];
  cc?: Mailbox[];
  subject: string;
  text?: string;
  html?: string;
  ago: number; // minutes
  read?: boolean;
  starred?: boolean;
  important?: boolean;
  labels?: string[];
  atts?: Omit<Attachment, 'id'>[];
  replyTo?: string;
}

const H = 60;
const D = 24 * H;

const SEEDS: Seed[] = [
  // Work: a thread with a reply from me
  { id: 'm1', acc: 'acc_work', thread: 't_launch', from: P.priya, to: [ME_WORK], cc: [P.tom], subject: 'Launch checklist for Thursday', ago: 3 * H, read: true, important: true, labels: ['l_urgent'],
    text: 'Hi Alex,\n\nHere is the checklist for Thursday’s launch. Could you confirm the onboarding screens are final by Wednesday noon?\n\n1. Final copy review\n2. App store screenshots\n3. Release notes\n\nThanks,\nPriya' },
  { id: 'm2', acc: 'acc_work', thread: 't_launch', folder: 'sent', from: ME_WORK, to: [P.priya], cc: [P.tom], subject: 'Re: Launch checklist for Thursday', ago: 2 * H, read: true, replyTo: 'm1',
    text: 'Hi Priya,\n\nYes, onboarding will be final by Wednesday 11:00. Screenshots are attached to the design ticket.\n\nAlex' },
  { id: 'm3', acc: 'acc_work', thread: 't_launch', from: P.tom, to: [ME_WORK, P.priya], subject: 'Re: Launch checklist for Thursday', ago: 25, labels: ['l_urgent'],
    text: 'Great. I’ve attached the release notes draft. Shout if anything is missing.\n\nTom', atts: [{ filename: 'release-notes-v2.4.pdf', mimeType: 'application/pdf', fileSize: 184_220 }] },

  { id: 'm4', acc: 'acc_work', from: P.lena, to: [ME_WORK], subject: 'Brightpath dashboard: feedback round 2', ago: 70, starred: true, labels: ['l_follow'],
    html: '<p>Hi Alex,</p><p>Thanks for the new dashboard direction. The team loved the <strong>compact cards</strong>. A few notes:</p><ul><li>Can the date filter remember the last choice?</li><li>The export button is hard to find on tablet.</li></ul><p>I’ve attached a screenshot of where people got stuck.</p><p>Best,<br>Lena</p><p><img src="https://tracker.brightpath.example/open.gif" width="1" height="1" alt=""></p>',
    atts: [{ filename: 'dashboard-stuck.png', mimeType: 'image/png', fileSize: 412_000, previewUrl: mockImages.chart }] },
  { id: 'm5', acc: 'acc_work', from: P.news, to: [ME_WORK], subject: 'This week: type that scales, and colour in dark mode', ago: 5 * H,
    html: '<div style="font-family:Georgia,serif"><h2 style="color:#1f2a44">Design Weekly</h2><p><img src="https://cdn.designweekly.example/hero.jpg" alt="Hero image" width="560"></p><p>Fluid type scales without breakpoints, plus five dark-mode palettes that pass contrast checks.</p><p><a href="https://designweekly.example/issue/212">Read the issue</a></p></div>' },
  { id: 'm6', acc: 'acc_work', from: P.cloud, to: [ME_WORK], subject: 'Your Stackhouse invoice for this month', ago: 1 * D + 2 * H, read: true, folder: 'f_receipts',
    text: 'Hello,\n\nYour invoice INV-20931 for $48.00 is attached.\n\nStackhouse Billing', atts: [{ filename: 'INV-20931.pdf', mimeType: 'application/pdf', fileSize: 62_400 }] },
  { id: 'm7', acc: 'acc_work', from: P.marco, to: [ME_WORK], subject: 'Harbourlight rebrand: kickoff notes', ago: 1 * D + 5 * H, read: true, folder: 'f_clients', labels: ['l_follow'],
    text: 'Alex,\n\nGreat meeting today. Summary:\n- Logo exploration: 3 routes\n- Timeline: 6 weeks\n- Budget approved\n\nPhotos from the site visit attached.\n\nMarco',
    atts: [{ filename: 'harbour-site.jpg', mimeType: 'image/jpeg', fileSize: 1_240_000, previewUrl: mockImages.mountains }, { filename: 'brief.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileSize: 88_000 }] },
  { id: 'm8', acc: 'acc_work', from: P.tom, to: [ME_WORK], subject: 'Team lunch on Friday?', ago: 2 * D, read: true, text: 'Thinking the noodle place at 12:30. In?\n\nTom' },
  { id: 'm9', acc: 'acc_work', thread: 't_hire', from: P.priya, to: [ME_WORK], subject: 'Interview panel for the junior designer role', ago: 3 * D, read: true,
    text: 'Could you join the panel next Tuesday 2–4pm? Portfolio links are in the hiring doc.\n\nPriya' },
  { id: 'm10', acc: 'acc_work', thread: 't_hire', folder: 'sent', from: ME_WORK, to: [P.priya], subject: 'Re: Interview panel for the junior designer role', ago: 3 * D - 40, read: true, replyTo: 'm9', text: 'Count me in.\n\nAlex' },
  { id: 'm11', acc: 'acc_work', folder: 'archive', from: { name: 'Diego Alvarez', email: 'diego@northwind-studio.example' }, to: [ME_WORK], subject: 'Icon set v3 exported', ago: 9 * D, read: true,
    text: 'All 240 icons exported as SVG and PNG. Shared in the drive.\n\nDiego' },
  { id: 'm12', acc: 'acc_work', folder: 'drafts', from: ME_WORK, to: [P.lena], subject: 'Re: Brightpath dashboard: feedback round 2', ago: 40, read: true,
    text: 'Hi Lena,\n\nThanks for these. On the export button: ' },
  { id: 'm13', acc: 'acc_work', folder: 'trash', from: { name: 'Calendar', email: 'calendar@northwind-studio.example' }, to: [ME_WORK], subject: 'Cancelled: Design sync', ago: 4 * D, read: true,
    text: 'This event has been cancelled.', atts: [{ filename: 'invite.ics', mimeType: 'text/calendar', fileSize: 2_100 }] },
  { id: 'm14', acc: 'acc_work', folder: 'spam', from: P.spam, to: [ME_WORK], subject: 'You have WON a $1,000 gift card!!!', ago: 6 * H,
    html: '<p>Click <a href="https://claim-now.example/x">here</a> to claim your prize now!</p><img src="https://claim-now.example/pixel.png" width="1" height="1">' },

  // Personal (Outlook)
  { id: 'm20', acc: 'acc_home', thread: 't_trip', from: P.airline, to: [ME_HOME], subject: 'Your booking is confirmed: Lisbon, 14 Dec', ago: 50, important: true, labels: ['l_travel'],
    html: '<table style="width:100%;border-collapse:collapse"><tr><td style="padding:12px;background:#0c8599;color:#fff;font-size:18px">SkyWays</td></tr><tr><td style="padding:12px">Booking reference <strong>QX7P2L</strong><br>London → Lisbon, 14 Dec, 07:35<br>Lisbon → London, 21 Dec, 18:10</td></tr></table>',
    atts: [{ filename: 'e-ticket-QX7P2L.pdf', mimeType: 'application/pdf', fileSize: 96_000 }] },
  { id: 'm21', acc: 'acc_home', thread: 't_trip', from: P.sam, to: [ME_HOME], subject: 'Re: Lisbon!', ago: 4 * H, labels: ['l_travel'], text: 'So jealous. You have to try the custard tarts in Belém. Send photos!\n\nSam' },
  { id: 'm22', acc: 'acc_home', from: P.mum, to: [ME_HOME], subject: 'Sunday lunch', ago: 1 * D + 1 * H, starred: true,
    text: 'Hi love,\n\nAre you still coming on Sunday? Dad is making the roast. Bring the photos from the garden.\n\nMum x', atts: [{ filename: 'garden.jpg', mimeType: 'image/jpeg', fileSize: 860_000, previewUrl: mockImages.mountains }] },
  { id: 'm23', acc: 'acc_home', from: P.bank, to: [ME_HOME], subject: 'Your statement is ready', ago: 2 * D + 3 * H, read: true, text: 'Your monthly statement is now available in online banking. We will never ask for your password by email.' },
  { id: 'm24', acc: 'acc_home', from: P.gym, to: [ME_HOME], subject: 'New spin classes from January', ago: 6 * D, read: true, text: 'Book early: morning spin classes start 6 January.' },
  { id: 'm25', acc: 'acc_home', folder: 'sent', from: ME_HOME, to: [P.sam], subject: 'Lisbon!', ago: 5 * H, read: true, thread: 't_trip', text: 'Booked flights for Lisbon in December!' },
  { id: 'm26', acc: 'acc_home', folder: 'archive', from: P.sam, to: [ME_HOME], subject: 'Board games night', ago: 15 * D, read: true, text: 'Thanks for hosting! Same time next month?' },

  // Freelance (in error state)
  { id: 'm30', acc: 'acc_free', from: { name: 'Nora Lindqvist', email: 'nora@brightpath.example' }, to: [ME_FREE], subject: 'Logo files for the pop-up shop', ago: 2 * D + 6 * H,
    text: 'Hi Alex,\n\nCould you send the logo in SVG and a white version for the window decal?\n\nNora' },
  { id: 'm31', acc: 'acc_free', from: P.cloud, to: [ME_FREE], subject: 'Payment received, thank you', ago: 5 * D, read: true, folder: 'f_receipts', text: 'We received your payment of $12.00.' },
  { id: 'm32', acc: 'acc_free', from: P.marco, to: [ME_FREE], subject: 'Studio photos', ago: 8 * D, read: true, atts: [{ filename: 'studio.jpg', mimeType: 'image/jpeg', fileSize: 2_400_000, previewUrl: mockImages.office }],
    text: 'Photos from the shoot, as promised.' },
];

function snippetOf(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function seedEmails(now: number): Email[] {
  return SEEDS.map((s) => {
    const bodyText = s.text ?? stripHtml(s.html ?? '');
    const attachments: Attachment[] = (s.atts ?? []).map((a, i) => ({ ...a, id: `${s.id}_a${i}` }));
    return {
      id: s.id,
      accountId: s.acc,
      threadId: s.thread ?? `t_${s.id}`,
      folderId: s.folder ?? 'inbox',
      previousFolderId: s.folder === 'trash' || s.folder === 'spam' ? 'inbox' : null,
      from: s.from,
      to: s.to ?? [],
      cc: s.cc ?? [],
      bcc: [],
      subject: s.subject,
      snippet: snippetOf(bodyText),
      bodyHtml: s.html ?? null,
      bodyText,
      receivedAt: new Date(now - s.ago * 60_000).toISOString(),
      isRead: s.read ?? false,
      isStarred: s.starred ?? false,
      isImportant: s.important ?? false,
      hasAttachments: attachments.length > 0,
      attachments,
      labelIds: s.labels ?? [],
      inReplyToId: s.replyTo ?? null,
    };
  });
}

export function seedSnapshot(now = Date.now()): MailSnapshot {
  return {
    accounts: seedAccounts(now),
    emails: seedEmails(now),
    folders: seedFolders.map((f) => ({ ...f })),
    labels: seedLabels.map((l) => ({ ...l })),
    contacts: seedContacts.map((c) => ({ ...c })),
  };
}

/** Messages "Sync now" delivers in the demo, one per sync, per account. */
export const SYNC_DELIVERIES: Record<string, Omit<Seed, 'id' | 'acc' | 'ago'>[]> = {
  acc_work: [
    { from: P.priya, to: [ME_WORK], subject: 'Quick one: can you review the hero banner?', text: 'Two options in the design file. Which do you prefer?\n\nPriya' },
    { from: P.tom, to: [ME_WORK], subject: 'Standup moved to 10:15', text: 'Heads up, standup is 15 minutes later tomorrow.' },
  ],
  acc_home: [
    { from: P.sam, to: [ME_HOME], subject: 'Photos from Saturday', text: 'Here are the photos from Saturday. That sunset!', atts: [{ filename: 'sunset.jpg', mimeType: 'image/jpeg', fileSize: 940_000, previewUrl: mockImages.mountains }] },
  ],
};

export function deliveryToEmail(accountId: string, seed: Omit<Seed, 'id' | 'acc' | 'ago'>, id: string, now = Date.now()): Email {
  const bodyText = seed.text ?? stripHtml(seed.html ?? '');
  const attachments = (seed.atts ?? []).map((a, i) => ({ ...a, id: `${id}_a${i}` }));
  return {
    id,
    accountId,
    threadId: `t_${id}`,
    folderId: 'inbox',
    previousFolderId: null,
    from: seed.from,
    to: seed.to ?? [],
    cc: seed.cc ?? [],
    bcc: [],
    subject: seed.subject,
    snippet: snippetOf(bodyText),
    bodyHtml: seed.html ?? null,
    bodyText,
    receivedAt: new Date(now).toISOString(),
    isRead: false,
    isStarred: false,
    isImportant: false,
    hasAttachments: attachments.length > 0,
    attachments,
    labelIds: [],
    inReplyToId: null,
  };
}
