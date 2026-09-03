/**
 * The reported symptom, in the browser that reported it: open Customers, click
 * a customer, and confirm the detail page renders instead of "Customer not
 * found." with two 500s in the console.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const NL = String.fromCharCode(10);
const BASE_URL = process.env.REPRO_BASE_URL || 'https://adminless-fin.vercel.app';
const OUT = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/customer-detail');

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  const failed: Array<{ fn: string; status: number }> = [];
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', (r) => {
    if (r.url().includes('/functions/v1/') && r.status() >= 400) {
      failed.push({ fn: r.url().split('/functions/v1/')[1].split('?')[0], status: r.status() });
    }
  });

  await page.goto(BASE_URL + '/auth', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });

  console.log('=== CUSTOMERS LIST ===');
  await page.goto(BASE_URL + '/customers', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'list.png'), fullPage: true });
  const rows = page.locator('table tbody tr');
  const count = await rows.count();
  console.log('  customer rows: ' + count);

  console.log(NL + '=== OPEN EACH CUSTOMER ===');
  for (let i = 0; i < count; i++) {
    await page.goto(BASE_URL + '/customers', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(1500);
    const row = page.locator('table tbody tr').nth(i);
    const name = (await row.innerText()).split('\n')[0].trim();
    await row.click();
    await page.waitForTimeout(3500);
    const text = await page.locator('body').innerText();
    const notFound = /Customer not found/i.test(text);
    const boundary = /something went wrong|unexpected error/i.test(text);
    const hasStatement = /Statement|Opening Balance|Transactions/i.test(text);
    console.log('  ' + (notFound || boundary ? 'FAIL ' : 'ok   ') + name +
      '  notFound=' + notFound + ' boundary=' + boundary + ' statement=' + hasStatement +
      ' url=' + new URL(page.url()).pathname);
    await page.screenshot({ path: path.join(OUT, 'detail-' + i + '.png'), fullPage: true });
  }

  console.log(NL + '=== CALENDAR ===');
  await page.goto(BASE_URL + '/calendar', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'calendar.png'), fullPage: true });
  const ctext = await page.locator('body').innerText();
  console.log('  error boundary: ' + /something went wrong|unexpected error/i.test(ctext));

  console.log(NL + '=== NETWORK ===');
  console.log('  failed edge calls: ' + JSON.stringify(failed));
  const real = consoleErrors.filter((e) => !/favicon|LaunchDarkly|DevTools/i.test(e));
  console.log('  console errors: ' + real.length);
  for (const e of real.slice(0, 8)) console.log('    ' + e.slice(0, 160));
  await browser.close();
  if (failed.length) process.exit(1);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
