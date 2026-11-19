import { config } from '../../config/env';
import type { MailService } from './MailService';
import { MockMailService } from './MockMailService';

export type { MailService } from './MailService';

function createMailService(): MailService {
  if (config.dataSource === 'supabase') {
    // SupabaseMailService arrives in Phase 2; until then the demo mailbox keeps the app usable.
    console.warn('VITE_DATA_SOURCE=supabase is not implemented yet (Phase 2). Using the demo mailbox.');
  }
  return new MockMailService();
}

export const mailService: MailService = createMailService();
