// Mail setup is saved to the signed-in Work Task Manager login.
// Inside WTM, Mail uses WTM's own Supabase client. Opened on its own,
// it loads WTM's public config and shares the same saved session.
import type { EmailAccount, Provider } from '../../types/mail';
import type { Token } from './oauth';

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
export type WtmClient = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
  auth: { getSession(): Promise<{ data: { session: unknown } }> };
};

declare global {
  interface Window {
    WTM?: { sb?: WtmClient };
    WTM_CONFIG?: { url?: string; anonKey?: string };
    supabase?: { createClient(url: string, key: string, options: Record<string, unknown>): WtmClient };
  }
}

export type RemoteAccount = {
  id: string;
  provider: Provider;
  provider_email: string;
  display_name: string;
  label: string;
  colour: string;
  signature: string;
  is_default: boolean;
  token: Partial<Token>;
  connected_at: string;
};

export type MailSetup = {
  allowed: boolean;
  user_id: string | null;
  can_configure?: boolean;
  google_client_id?: string;
  microsoft_client_id?: string;
  accounts?: RemoteAccount[];
};

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';

function loadScript(src: string) {
  return new Promise<boolean>((resolve) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function fromParent(): WtmClient | null {
  try {
    if (window.parent !== window && window.parent.location.origin === location.origin) return window.parent.WTM?.sb ?? null;
  } catch {
    /* a different site embedded Mail */
  }
  return null;
}

/** Null when Mail runs without Work Task Manager (the local demo). */
export async function wtmClient(): Promise<WtmClient | null> {
  const parent = fromParent();
  if (parent) return parent;
  if (!(await loadScript(new URL('../js/config.js', location.href).href))) return null;
  const cfg = window.WTM_CONFIG;
  if (!cfg?.url || !cfg.anonKey) return null;
  if (!window.supabase && !(await loadScript(SUPABASE_JS))) throw new Error("The Supabase library didn't load. Check your internet connection.");
  return window.supabase!.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'wtm.auth' } });
}

async function rpc<T>(client: WtmClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message)) throw new Error('The database is missing the Mail functions. Run supabase/schema.sql in Supabase.');
    throw new Error(error.message || 'Work Task Manager did not respond.');
  }
  return data as T;
}

export async function signedIn(client: WtmClient) {
  const { data } = await client.auth.getSession();
  return !!data.session;
}

export const fetchSetup = (client: WtmClient) => rpc<MailSetup>(client, 'wtm_mail_setup');

export function saveAccount(client: WtmClient, a: EmailAccount, token?: Token) {
  const p: Record<string, unknown> = {
    id: a.id,
    provider: a.provider,
    provider_email: a.providerEmail,
    display_name: a.displayName,
    label: a.label,
    colour: a.colour,
    signature: a.signature,
    is_default: a.isDefault,
  };
  if (token) p.token = token;
  return rpc<void>(client, 'wtm_save_mail_account', { p });
}

export const saveToken = (client: WtmClient, a: EmailAccount, token: Token) =>
  rpc<void>(client, 'wtm_save_mail_account', { p: { id: a.id, provider: a.provider, provider_email: a.providerEmail, token } });

export const deleteAccount = (client: WtmClient, id: string) => rpc<void>(client, 'wtm_delete_mail_account', { p_id: id });

export const saveSignInApps = (client: WtmClient, google: string, microsoft: string) =>
  rpc<void>(client, 'wtm_save_mail_settings', { p: { google_client_id: google.trim(), microsoft_client_id: microsoft.trim() } });
