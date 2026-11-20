// Pushes GEMINI_API_KEY from .env into the hosted Supabase project secrets.
// Needs SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens) in the env or .env.
// usage: node scripts/push-gemini-secret.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_REF = 'xvdxdaujllhiircrstcu';

const file = {};
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    file[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const pick = name => String(process.env[name] || file[name] || '').trim();

const token = pick('SUPABASE_ACCESS_TOKEN');
const gemini = pick('GEMINI_API_KEY');
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN. Create one at https://supabase.com/dashboard/account/tokens and add it to .env');
  process.exit(1);
}
if (!gemini) {
  console.error('Missing GEMINI_API_KEY in .env');
  process.exit(1);
}

const secrets = [{ name: 'GEMINI_API_KEY', value: gemini }];
const allowed = pick('GEMINI_ALLOWED_EMAILS');
if (allowed) secrets.push({ name: 'GEMINI_ALLOWED_EMAILS', value: allowed });

const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`, {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(secrets),
});
if (!r.ok) {
  console.error('Failed to set secrets:', r.status, await r.text());
  process.exit(1);
}
console.log('Set GEMINI_API_KEY' + (allowed ? ' and GEMINI_ALLOWED_EMAILS' : '') + ' on project ' + PROJECT_REF);
