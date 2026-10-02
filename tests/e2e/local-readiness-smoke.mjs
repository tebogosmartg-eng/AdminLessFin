// Read-only routing check. External HTTP/WebSocket requests are blocked, so
// this cannot send telemetry or write to the configured Supabase project.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.LOCAL_SMOKE_URL || 'http://127.0.0.1:4174';
const origin = new URL(base);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Local target required');
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === origin.origin ? route.continue() : route.abort();
  });
  await context.routeWebSocket(/.*/, (socket) => socket.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of ['/', '/privacy', '/terms', '/security', '/auth']) {
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').waitFor({ state: 'visible', timeout: 15000 });
    assert(!(await page.locator('h1').textContent()).includes('Something went wrong'), path);
    console.log(`PASS ${path}`);
  }
  await page.goto(`${base}/invoices`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/auth', { timeout: 15000 });
  console.log('PASS unauthenticated protected-route redirect');
  await page.goto(`${base}/privacy`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Privacy Policy', exact: true }).waitFor({ state: 'visible' });
  const terms = page.getByRole('link', { name: 'Terms', exact: true });
  assert.equal(await terms.count(), 1);
  await terms.click();
  await page.waitForURL('**/terms');
  await page.getByRole('heading', { name: 'Terms of Service', exact: true }).waitFor({ state: 'visible' });
  console.log('PASS client-side legal navigation');
  await mkdir('tmp/readiness-smoke', { recursive: true });
  await page.screenshot({ path: 'tmp/readiness-smoke/terms.png', fullPage: true });
  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally {
  await browser.close();
}
