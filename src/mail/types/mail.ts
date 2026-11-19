// Domain types. They mirror the Phase 2 tables (email_accounts, emails, folders,
// labels, email_labels, attachments, contacts) plus the UI-only fields listed in the README.

export type Provider = 'gmail' | 'outlook';
export type SyncStatus = 'ok' | 'syncing' | 'error';

/** System folders every account has. Custom folders use their own ids. */
export type SystemFolderId = 'inbox' | 'drafts' | 'sent' | 'archive' | 'spam' | 'trash';

export interface Mailbox {
  name: string;
  email: string;
}

export interface EmailAccount {
  id: string;
  provider: Provider;
  providerEmail: string;
  displayName: string;
  label: string;
  colour: string;
  signature: string;
  isDefault: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncAt: string | null;
  connectedAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  previewUrl?: string;
}

/** An attachment on a message being written. `file` is absent for forwarded attachments. */
export interface OutgoingAttachment extends Attachment {
  file?: File;
}

export interface Email {
  id: string;
  accountId: string;
  threadId: string;
  folderId: string;
  previousFolderId: string | null;
  from: Mailbox;
  to: Mailbox[];
  cc: Mailbox[];
  bcc: Mailbox[];
  subject: string;
  snippet: string;
  bodyHtml: string | null;
  bodyText: string;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  hasAttachments: boolean;
  attachments: Attachment[];
  labelIds: string[];
  inReplyToId: string | null;
}

export interface Folder {
  id: string;
  name: string;
}

export interface Label {
  id: string;
  name: string;
  colour: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  company: string | null;
}

export interface DraftInput {
  id?: string;
  accountId: string;
  to: Mailbox[];
  cc: Mailbox[];
  bcc: Mailbox[];
  subject: string;
  bodyHtml: string;
  attachments: OutgoingAttachment[];
  inReplyToId?: string | null;
  threadId?: string | null;
}

export interface MailSnapshot {
  accounts: EmailAccount[];
  emails: Email[];
  folders: Folder[];
  labels: Label[];
  contacts: Contact[];
}

export type EmailPatch = Partial<Pick<Email, 'isRead' | 'isStarred' | 'isImportant' | 'labelIds'>>;
