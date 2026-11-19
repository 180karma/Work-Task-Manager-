// Browser-safe configuration. Secrets never belong here.
// The Supabase project and client come from WTM at mount time, so Mail shares WTM's project and sign-in.

export type DataSource = 'mock' | 'supabase';

const env = import.meta.env as Record<string, string | undefined>;

export const config = {
  /** Set at build time with VITE_DATA_SOURCE. Only `mock` exists until Phase 2. */
  dataSource: (env.VITE_DATA_SOURCE === 'supabase' ? 'supabase' : 'mock') as DataSource,
  supabaseUrl: '',
  supabaseAnonKey: '',
  getSupabase: (() => null) as () => unknown,
  autosaveDelayMs: 2000,
  /** Gmail and Outlook both cap a message at roughly 25 MB. */
  maxAttachmentBytes: 25 * 1024 * 1024,
  maxAttachments: 20,
  /** Executable types Gmail and Outlook refuse to send. */
  blockedExtensions: [
    'ade', 'adp', 'apk', 'appx', 'bat', 'cab', 'chm', 'cmd', 'com', 'cpl', 'dll', 'dmg', 'exe', 'hta', 'ins', 'isp',
    'iso', 'jar', 'js', 'jse', 'lib', 'lnk', 'mde', 'msc', 'msi', 'msp', 'mst', 'nsh', 'pif', 'ps1', 'scr', 'sct',
    'shb', 'sys', 'vb', 'vbe', 'vbs', 'vxd', 'wsc', 'wsf', 'wsh',
  ] as readonly string[],
};

export function configure(opts: { supabaseUrl?: string; supabaseAnonKey?: string; getSupabase?: () => unknown }): void {
  config.supabaseUrl = opts.supabaseUrl ?? '';
  config.supabaseAnonKey = opts.supabaseAnonKey ?? '';
  config.getSupabase = opts.getSupabase ?? (() => null);
}
