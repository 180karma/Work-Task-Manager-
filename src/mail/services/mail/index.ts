import { config } from '../../config/env';
import type { MailService } from './MailService';
import { MockMailService } from './MockMailService';

export type { MailService } from './MailService';

function createMailService(): MailService {
  if (config.dataSource === 'supabase') {
    // SupabaseMailService arrives in Phase 2 and will use WTM's client (config.getSupabase()).
    console.warn('VITE_DATA_SOURCE=supabase is not implemented yet (Phase 2). Using the demo mailbox.');
  }
  return new MockMailService();
}

let current: MailService | null = null;

/** Created lazily so it reads storage for the user WTM mounted Mail for. */
export function getMailService(): MailService {
  return (current ??= createMailService());
}

export function resetMailService(): void {
  current = null;
}
