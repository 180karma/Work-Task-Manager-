// Smoke flows against relay-mail.html at desktop, tablet and phone sizes.
// Usage: npm run test:e2e   (first time: npx playwright install chromium)
// Set SCREENSHOT_DIR to also save one screenshot per viewport.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(resolve(root, 'relay-mail.html')).href;
const shots = process.env.SCREENSHOT_DIR;
if (shots) mkdirSync(shots, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, scheme: 'light' },
  { name: 'tablet', width: 1024, height: 768, scheme: 'dark' },
  { name: 'phone', width: 390, height: 844, scheme: 'light' },
];

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

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  console.log(`${vp.name} (${vp.width}×${vp.height}, ${vp.scheme})`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: vp.scheme, hasTouch: vp.name === 'phone' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  // Offline run: fonts and remote email images are blocked, which only logs resource errors.
  await page.route(/^https?:/, (r) => r.abort());
  await page.goto(url);

  await check('mailbox loads with conversations', async () => {
    await page.locator('.row').first().waitFor({ timeout: 5000 });
    expect((await page.locator('.row').count()) >= 5, 'expected at least 5 rows');
    expect((await page.locator('.list-head h1').textContent()) === 'All inboxes', 'title should be All inboxes');
  });

  await check('opening a conversation shows the reading pane', async () => {
    await page.locator('.row__main', { hasText: 'Launch checklist' }).first().click();
    await page.locator('.reading-subject').waitFor();
    expect((await page.locator('.reading-subject').textContent()).includes('Launch checklist'), 'wrong subject');
    expect((await page.locator('.conversation > li').count()) === 3, 'thread should have 3 messages');
  });

  if (shots && vp.name !== 'phone') await page.screenshot({ path: resolve(shots, `${vp.name}.png`) });
  if (vp.name === 'phone') await page.getByRole('button', { name: 'Back to list' }).click();

  await check('search with operators filters the list', async () => {
    await page.locator('.search__input').fill('has:attachment from:marco');
    await page.waitForFunction(() => document.querySelector('.list-head h1')?.textContent === 'Search results');
    await page.waitForTimeout(300);
    const n = await page.locator('.row').count();
    expect(n === 2, `expected 2 results (Work and Freelance), got ${n}`);
    await page.getByRole('button', { name: 'Clear search' }).first().click();
  });

  await check('compose and send to an own address delivers to that inbox', async () => {
    await page.keyboard.press('Escape');
    if (vp.name === 'phone') await page.locator('.fab').click();
    else await page.locator('.compose-btn').click();
    const compose = page.locator('.compose');
    await compose.waitFor();
    await compose.locator('.recipients__input').first().fill('alex.morgan@outlook.example');
    await compose.locator('.recipients__input').first().press('Enter');
    await compose.locator('.compose-field__input').fill(`Smoke test ${vp.name}`);
    await compose.locator('.editor__surface').click();
    await page.keyboard.type('Hello from the smoke test.');
    await compose.getByRole('button', { name: /^Send/ }).click();
    await compose.waitFor({ state: 'detached', timeout: 5000 });
    await page.locator('.row__subject', { hasText: `Smoke test ${vp.name}` }).first().waitFor({ timeout: 5000 });
  });

  await check('settings and accounts screens render', async () => {
    if (vp.name === 'phone') await page.getByRole('button', { name: 'Open navigation' }).click();
    else if (vp.name === 'tablet') await page.getByRole('button', { name: 'Expand navigation' }).click();
    const nav = vp.name === 'desktop' ? page.locator('.sidebar') : page.locator('.drawer .sidebar');
    await nav.getByRole('button', { name: 'Connected accounts' }).click();
    await page.locator('#accounts-title').waitFor();
    expect((await page.locator('.account-card').count()) === 3, 'expected 3 accounts');
    if (shots && vp.name === 'phone') await page.screenshot({ path: resolve(shots, `${vp.name}.png`) });
  });

  await check('no console errors', async () => expect(errors.length === 0, errors.join(' | ')));
  await ctx.close();
}
await browser.close();

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
