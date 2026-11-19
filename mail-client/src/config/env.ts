// Browser-safe configuration. Only VITE_* variables reach the browser; secrets never belong here.

export type DataSource = 'mock' | 'supabase';

const env = import.meta.env as Record<string, string | undefined>;

const dataSource: DataSource = env.VITE_DATA_SOURCE === 'supabase' ? 'supabase' : 'mock';

export const config = {
  dataSource,
  supabaseUrl: env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY ?? '',
  autosaveDelayMs: 2000,
  /** Gmail and Outlook both cap a message at roughly 25 MB. */
  maxAttachmentBytes: 25 * 1024 * 1024,
  maxAttachments: 20,
  /** Executable types Gmail and Outlook refuse to send. */
  blockedExtensions: [
    'ade', 'adp', 'apk', 'appx', 'bat', 'cab', 'chm', 'cmd', 'com', 'cpl', 'dll', 'dmg', 'exe', 'hta', 'ins', 'isp',
    'iso', 'jar', 'js', 'jse', 'lib', 'lnk', 'mde', 'msc', 'msi', 'msp', 'mst', 'nsh', 'pif', 'ps1', 'scr', 'sct',
    'shb', 'sys', 'vb', 'vbe', 'vbs', 'vxd', 'wsc', 'wsf', 'wsh',
  ],
} as const;
