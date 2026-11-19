import type { DraftInput, Email, EmailAccount, EmailPatch, Folder, Label, MailSnapshot, Provider } from '../../types/mail';

/**
 * The backend contract. The UI only talks to this interface, so Phase 2+
 * (Supabase + Edge Functions) replaces MockMailService without UI changes.
 * Every method is async and may reject; callers roll back on failure.
 */
export interface MailService {
  readonly mode: 'mock' | 'supabase';

  load(): Promise<MailSnapshot>;

  updateEmails(ids: string[], patch: EmailPatch): Promise<void>;
  /** Moves messages and records where they came from (for Restore / Not spam). */
  moveEmails(ids: string[], folderId: string): Promise<void>;
  setLabel(ids: string[], labelId: string, on: boolean): Promise<void>;
  deleteForever(ids: string[]): Promise<void>;

  saveDraft(input: DraftInput): Promise<Email>;
  discardDraft(id: string): Promise<void>;
  /** Sends and returns the stored Sent copy. */
  send(input: DraftInput): Promise<Email>;

  /** Fetches new mail for one account. Returns newly delivered messages and the updated account. */
  syncAccount(accountId: string): Promise<{ account: EmailAccount; delivered: Email[] }>;
  /** Starts OAuth. Returns the provider consent URL, or null with a message when not available. */
  beginConnect(provider: Provider): Promise<{ url: string | null; message: string }>;
  disconnect(accountId: string): Promise<void>;
  updateAccount(accountId: string, patch: Partial<Pick<EmailAccount, 'signature' | 'isDefault' | 'label' | 'colour'>>): Promise<EmailAccount[]>;

  createFolder(name: string): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<Folder>;
  /** Deletes a folder; its messages move to Archive. */
  deleteFolder(id: string): Promise<void>;
  createLabel(name: string, colour: string): Promise<Label>;
  deleteLabel(id: string): Promise<void>;

  /** Demo only: restore the seeded mailbox. */
  reset?(): Promise<MailSnapshot>;
}
