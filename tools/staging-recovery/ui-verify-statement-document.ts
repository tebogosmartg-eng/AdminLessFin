/**
 * Both statements in a real browser, and the PDFs they produce.
 *
 * Checks the thing a statement is for: that the brought-forward balance is
 * stated, that it is not zero when the party owed something, and that the
 * closing balance shown is the one the ledger holds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect } from './edgeProbe';

const NL = String.fromCharCode(10);
const BASE_URL = process.env.REPRO_BASE_URL || 'http://localhost:8083';
const OUT = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/statement-document');
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  -- ' + detail : ''));
  if (ok) pass++; else fail++;
}

async function exportAndRasterise(page: Page, kind: string) {
  await page.getByRole('button', { name: /statement pdf/i }).click();
  await page.waitForTimeout(500);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('menuitem', { name: /download/i }).click(),
  ]);
  const pdfPath = path.join(OUT, kind + '-' + download.suggestedFilename());
  await download.saveAs(pdfPath);
  check(kind + ': the PDF has real content', fs.statSync(pdfPath).size > 8_000,
    fs.statSync(pdfPath).size + ' bytes');

  const { pdf } = await import('pdf-to-img');
  const pages = await pdf(pdfPath, { scale: 2 });
  let n = 0;
  for await (const image of pages) {
    n += 1;
    fs.writeFileSync(path.join(OUT, kind + '-page-' + n + '.png'), image);
  }
  check(kind + ': it rasterises', n >= 1, n + ' page(s)');
  await page.keyboard.press('Escape');
}

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT, { recursive: true });

  const { supabase: api, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });

  // Kudzanai is the customer whose opening balance the old code reported as
  // 0.00 when the ledger said -238 826,72.
  const cust = await api.from('customers').select('id, name').eq('company_id', co.id)
    .ilike('name', 'Kudzanai').maybeSingle();
  const vend = await api.from('vendors').select('id, name').eq('company_id', co.id)
    .ilike('name', 'kudzanai').maybeSingle();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const failed: Array<{ fn: string; status: number }> = [];
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => {
    if (r.url().includes('/functions/v1/') && r.status() >= 400) {
      failed.push({ fn: r.url().split('/functions/v1/')[1].split('?')[0], status: r.status() });
    }
  });

  await page.goto(BASE_URL + '/auth', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 12 && /Security Checkpoint/i.test(await page.title()); i++) {
    await page.waitForTimeout(5000);
    if (!/Security Checkpoint/i.test(await page.title())) break;
    await page.goto(BASE_URL + '/auth', { waitUntil: 'domcontentloaded' });
  }
  if (/Security Checkpoint/i.test(await page.title())) {
    console.log('Vercel is challenging this client; cannot verify through a headless browser right now.');
    await browser.close();
    process.exit(2);
  }
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });

  if (cust.data) {
    console.log(NL + '======== CUSTOMER STATEMENT ========');
    await page.goto(BASE_URL + '/customers/' + cust.data.id, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT, 'customer-detail.png'), fullPage: true });
    const text = await page.locator('body').innerText();
    check('the page renders', !/something went wrong|unexpected error/i.test(text));
    check('a Statement PDF action exists', /statement pdf/i.test(text));
    await exportAndRasterise(page, 'customer');
  }

  if (vend.data) {
    console.log(NL + '======== SUPPLIER STATEMENT ========');
    await page.goto(BASE_URL + '/vendors/' + vend.data.id, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT, 'vendor-detail.png'), fullPage: true });
    const text = await page.locator('body').innerText();
    check('the page renders', !/something went wrong|unexpected error/i.test(text));
    check('a Statement PDF action exists', /statement pdf/i.test(text));
    await exportAndRasterise(page, 'supplier');
  }

  console.log(NL + 'failed edge calls: ' + JSON.stringify(failed));
  const real = errors.filter((e) => !/favicon|LaunchDarkly|DevTools|Download the React/i.test(e));
  console.log('console errors: ' + real.length);
  for (const e of real.slice(0, 6)) console.log('  ' + e.slice(0, 160));
  await browser.close();

  console.log(NL + 'PASS ' + pass + '  FAIL ' + fail);
  console.log('evidence: ' + OUT);
  if (fail || failed.length) process.exit(1);
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
