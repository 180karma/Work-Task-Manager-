// Browser checks for WTM with the Mail section, at desktop, tablet (dark) and phone sizes.
// WTM runs against a fake Supabase client, so no project or network is needed.
// Usage: npm run test:e2e   (first time: npx playwright install chromium)
// Set SCREENSHOT_DIR to also save screenshots of the Mail section.
import { chromium, firefox, webkit } from 'playwright';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.env.SCREENSHOT_DIR;
if (shots) mkdirSync(shots, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

const WTM_SUPABASE_JS = readFileSync(join(root, 'index.html'), 'utf8').match(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+/)[0];

// Stands in for the supabase-js UMD build: one signed-in admin and an empty workspace.
const FAKE_SUPABASE = `
(() => {
  const me = { id: 'u1', username: 'joe', full_name: 'Joe Tester', role: 'admin', active: true };
  const ok = (data) => Promise.resolve({ data, error: null });
  const snapshot = () => ({ me, profiles: [me], departments: [], tasks: [], log: [], messages: [], notices: [], orders: [], daily: [], calendar: [], server_time: new Date().toISOString() });
  const channel = { on() { return channel; }, subscribe(cb) { if (cb) setTimeout(() => cb('SUBSCRIBED')); return channel; } };
  window.supabase = { createClient: () => ({
    auth: {
      getSession: () => ok({ session: { user: { id: me.id } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => ok(null),
      updateUser: () => ok(null),
    },
    rpc: (fn) => ok(fn === 'wtm_bootstrap' ? snapshot() : fn === 'wtm_sync' ? { ...snapshot(), visible_ids: [] } : null),
    channel: () => channel,
    removeChannel() {},
    storage: { from: () => ({ createSignedUrl: () => ok(null), upload: () => ok(null), remove: () => ok(null) }) },
    functions: { invoke: () => ok(null) },
  }) };
})();`;

const ALL_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, scheme: 'light' },
  { name: 'tablet', width: 1024, height: 768, scheme: 'dark' },
  { name: 'phone', width: 390, height: 844, scheme: 'light' },
];
const VIEWPORTS = ALL_VIEWPORTS.filter((v) => !process.env.VIEWPORT || v.name === process.env.VIEWPORT);
const WTM_VIEWS = ['tasks', 'daily', 'calendar', 'handover', 'messages', 'board', 'orders', 'invoices', 'log', 'people', 'settings'];

let failures = 0;
const check = async (label, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${label}\n    ${String(err).split('\n')[0]}`);
  }
};
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const engines = { chromium, firefox, webkit };
const browser = await engines[process.env.BROWSER || 'chromium'].launch();
for (const vp of VIEWPORTS) {
  console.log(`${vp.name} (${vp.width}×${vp.height}, ${vp.scheme})`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: vp.scheme, hasTouch: vp.name === 'phone' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Every outside request is blocked, which browsers log as load, CORS or integrity errors.
  const BLOCKED = /Failed to load resource|CORS request did not succeed|integrity attribute/;
  page.on('console', (m) => m.type() === 'error' && !BLOCKED.test(m.text()) && errors.push(m.text()));
  await page.route(/^https?:/, (r) => {
    const url = r.request().url();
    if (url.startsWith(base)) {
      if (url.includes('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: 'window.WTM_CONFIG = { url: "https://example.supabase.co", anonKey: "anon", invoicesUrl: "about:blank" };' });
      return r.continue();
    }
    if (url === WTM_SUPABASE_JS) return r.fulfill({ contentType: 'text/javascript', body: FAKE_SUPABASE });
    return r.abort();
  });
  const view = () => page.evaluate(() => location.hash.slice(1));
  const goto = async (v) => {
    await page.evaluate((x) => (location.hash = x), v);
    await page.locator(`#view-${v}`).waitFor({ state: 'visible', timeout: 3000 });
  };

  const M = page.locator('#mailHost');
  await page.goto(base + '#tasks');

  await check('WTM signs in and every section opens', async () => {
    await page.locator('#app').waitFor({ state: 'visible', timeout: 5000 });
    for (const v of WTM_VIEWS) await goto(v);
    expect(errors.length === 0, errors.join(' | '));
  });

  await check('Mail is in the WTM navigation and opens on E', async () => {
    await goto('tasks');
    if (vp.name === 'phone') {
      await page.locator('#navToggle').click();
      await page.locator('#navScroll button[data-view="mail"]').click();
    } else {
      expect(await page.locator('#navScroll button[data-view="mail"]').isVisible(), 'no Mail button in the navigation');
      await page.locator('body').press('e');
    }
    await page.locator('#view-mail').waitFor({ state: 'visible' });
    await M.locator('.row').first().waitFor({ timeout: 8000 });
    expect((await M.locator('.row').count()) >= 5, 'expected at least 5 conversations');
    expect((await M.locator('.list-head h1').textContent()) === 'All inboxes', 'title should be All inboxes');
  });

  const layout = await M.locator('.relay-root .app').getAttribute('class').catch(() => '');
  const narrow = /layout-narrow/.test(layout || '');

  await check('Mail picks up WTM colours and fonts', async () => {
    const [accent, font] = await M.locator('.compose-btn, .fab').first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.backgroundColor + cs.backgroundImage, getComputedStyle(el.closest('.relay-root')).fontFamily];
    });
    const wtmAccent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase());
    expect(/public sans/i.test(font), `font is ${font}`);
    const hex = (s) => s.replace(/rgba?\((\d+), (\d+), (\d+).*?\)/g, (_, r, g, b) => '#' + [r, g, b].map((n) => (+n).toString(16).padStart(2, '0')).join(''));
    expect(hex(accent).toLowerCase().includes(wtmAccent) || /gradient/.test(accent), `compose button ${accent} doesn't use WTM's accent ${wtmAccent}`);
  });

  await check('opening a conversation shows the reading pane', async () => {
    await M.locator('.row__main', { hasText: 'Launch checklist' }).first().click();
    await M.locator('.reading-subject').waitFor();
    expect((await M.locator('.reading-subject').textContent()).includes('Launch checklist'), 'wrong subject');
    expect((await M.locator('.conversation > li').count()) === 3, 'thread should have 3 messages');
  });

  if (shots) await page.screenshot({ path: resolve(shots, `mail-${vp.name}.png`) });
  if (narrow) await M.getByRole('button', { name: 'Back to list' }).click();

  await check('typing in Mail does not trigger WTM shortcuts', async () => {
    await M.locator('.search__input').fill('has:attachment from:marco');
    await M.locator('.list-head h1', { hasText: 'Search results' }).waitFor();
    await page.waitForTimeout(300);
    const n = await M.locator('.row').count();
    expect(n === 2, `expected 2 results, got ${n}`);
    expect((await view()) === 'mail', `WTM switched to ${await view()}`);
    await M.getByRole('button', { name: 'Clear search' }).first().click();
  });

  await check('Mail menus work inside WTM', async () => {
    await M.getByRole('button', { name: 'Filter by account' }).click();
    await M.getByRole('menuitemcheckbox', { name: /northwind/i }).click();
    await M.locator('.menu').waitFor({ state: 'detached' });
    expect((await M.locator('.filter-chip__label').first().textContent()) !== 'All accounts', 'account filter was not applied');
    await M.getByRole('button', { name: 'Filter by account' }).click();
    await M.getByRole('menuitemcheckbox', { name: 'All accounts' }).click();
  });

  await check('Mail shortcuts work and WTM letters stay in Mail', async () => {
    await M.locator('.list-head h1').click();
    await page.keyboard.press('c');
    await M.locator('.compose').waitFor({ timeout: 3000 });
    expect((await view()) === 'mail', 'pressing c left Mail (WTM opens Calendar on c)');
    await M.locator('.compose').getByRole('button', { name: 'Close and save draft' }).first().click();
    await M.locator('.compose').waitFor({ state: 'detached' });
    await page.keyboard.press('t');
    expect((await view()) === 'mail', 'pressing t left Mail');
  });

  await check('compose and send to an own address delivers to that inbox', async () => {
    if (narrow) await M.locator('.fab').click();
    else await M.locator('.compose-btn').click();
    const compose = M.locator('.compose');
    await compose.waitFor();
    await compose.locator('.recipients__input').first().fill('alex.morgan@outlook.example');
    await compose.locator('.recipients__input').first().press('Enter');
    await compose.locator('.compose-field__input').fill(`Smoke test ${vp.name}`);
    await compose.locator('.editor__surface').click();
    await page.keyboard.type('Hello from WTM.');
    expect((await view()) === 'mail', 'typing in the editor switched WTM section');
    await compose.getByRole('button', { name: /^Send/ }).click();
    await compose.waitFor({ state: 'detached', timeout: 5000 });
    await M.locator('.row__subject', { hasText: `Smoke test ${vp.name}` }).first().waitFor({ timeout: 5000 });
  });

  await check('mail settings and accounts screens render', async () => {
    if (narrow) await M.getByRole('button', { name: 'Open navigation' }).click();
    else if (/layout-medium/.test(layout || '')) await M.getByRole('button', { name: 'Expand navigation' }).click();
    await M.locator('.drawer .sidebar').waitFor({ timeout: 1000 }).catch(() => {});
    const nav = (await M.locator('.drawer .sidebar').count()) ? M.locator('.drawer .sidebar') : M.locator('.app > .sidebar');
    await nav.getByRole('button', { name: 'Connected accounts' }).click();
    await M.locator('#accounts-title').waitFor();
    expect((await M.locator('.account-card').count()) === 3, 'expected 3 accounts');
  });

  await check('Mail keeps its state when switching WTM sections', async () => {
    await goto('board');
    await page.locator('body').press('t');
    await page.locator('#view-tasks').waitFor({ state: 'visible' });
    await goto('mail');
    await M.locator('#accounts-title').waitFor({ timeout: 2000 });
  });

  await check('no console errors', async () => expect(errors.length === 0, errors.join(' | ')));
  await ctx.close();
}
await browser.close();
server.close();

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
