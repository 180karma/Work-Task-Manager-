// Calls Gemini for the invoice scraper with the key held in Supabase secrets, so the key never reaches a browser.
// Only signed-in users on the kitchen staff list may call it. Deployed with verify_jwt off: the token is checked
// here against Supabase Auth, which also works with the newer asymmetric JWT signing keys.
//
// POST { op: "models" }                        -> Gemini's model list
// POST { op: "generate", model, body }         -> generateContent for Gemini 3.8 Flash only
// Gemini's own status and JSON are passed back unchanged. Errors raised here carry error.proxy = true.

const GEM_API = 'https://generativelanguage.googleapis.com/v1beta/';
const GEM_MODEL = 'gemini-3.8-flash';
const MAX_BODY = 30 * 1024 * 1024;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
const fail = (status: number, code: string, message: string) => json(status, { error: { proxy: true, code, status, message } });

function scrub(text: string, key: string): string {
  if (key && key.length >= 8) text = text.split(key).join('••••');
  return text.replace(/AIza[0-9A-Za-z_\-]{20,}/g, '••••');
}

async function signedInUser(req: Request): Promise<{ id: string; email: string; token: string; apikey: string } | null> {
  const auth = req.headers.get('authorization') || '';
  const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1] || '';
  if (!token || /^sb_/.test(token)) return null;
  const url = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  const apikey = Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || '';
  if (!url || !apikey) return null;
  const r = await fetch(url + '/auth/v1/user', { headers: { apikey, Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && typeof u.id === 'string' && u.id ? { id: u.id, email: String(u.email || '').toLowerCase(), token, apikey } : null;
}

// the staff table's row-level security lets each person read only their own row
async function onStaffList(user: { email: string; token: string; apikey: string }): Promise<boolean> {
  const url = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  const r = await fetch(url + '/rest/v1/staff?select=role&email=eq.' + encodeURIComponent(user.email), {
    headers: { apikey: user.apikey, Authorization: 'Bearer ' + user.token },
  });
  if (!r.ok) return false;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

function allowed(email: string): boolean {
  const list = (Deno.env.get('GEMINI_ALLOWED_EMAILS') || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  return !list.length || list.includes(email);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'method', 'Use POST.');

  const key = (Deno.env.get('GEMINI_API_KEY') || '').trim();
  if (!key) return fail(503, 'not_configured', 'GEMINI_API_KEY is not set in the Supabase project secrets.');

  const user = await signedInUser(req).catch(() => null);
  if (!user) return fail(401, 'unauthorized', 'Sign in to scan with Gemini.');
  if (!allowed(user.email) || !(await onStaffList(user).catch(() => false))) return fail(403, 'not_allowed', 'This account is not on the kitchen staff list.');

  if (+(req.headers.get('content-length') || 0) > MAX_BODY) return fail(413, 'too_big', 'The pages are too large to send.');
  let msg: { op?: string; model?: string; body?: Record<string, unknown> };
  try { msg = await req.json(); } catch { return fail(400, 'bad_request', 'The request is not JSON.'); }

  let path: string, init: RequestInit;
  if (msg.op === 'models') {
    path = 'models?pageSize=1000';
    init = { method: 'GET' };
  } else if (msg.op === 'generate') {
    const asked = String(msg.model || '');
    if (asked !== GEM_MODEL) return fail(400, 'bad_model', 'Scans use gemini-3.8-flash only.');
    const b = msg.body && typeof msg.body === 'object' ? msg.body : null;
    if (!b || !Array.isArray(b.contents)) return fail(400, 'bad_request', 'Nothing to scan.');
    const body = { contents: b.contents, generationConfig: b.generationConfig, store: false };
    path = 'models/' + GEM_MODEL + ':generateContent';
    init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  } else {
    return fail(400, 'bad_op', 'Unknown operation.');
  }

  let r: Response;
  try {
    r = await fetch(GEM_API + path, { ...init, headers: { ...(init.headers || {}), 'x-goog-api-key': key } });
  } catch {
    return fail(502, 'upstream', 'Gemini could not be reached from Supabase.');
  }
  const text = scrub(await r.text(), key);
  return new Response(text, { status: r.status, headers: { ...cors, 'Content-Type': r.headers.get('content-type') || 'application/json' } });
});
