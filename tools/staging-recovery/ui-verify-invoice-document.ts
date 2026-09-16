/**
 * The invoice document in a real browser, and the PDF it produces.
 *
 * A layout defect is not something a unit test finds, so this drives the real
 * page, downloads the real PDF through the real button, and rasterises every
 * page to PNG. Running it in the browser rather than in node is deliberate:
 * the logo is fetched and embedded with browser APIs, so a node run would
 * silently exercise the no-logo fallback and prove nothing about the masthead.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
const BASE_URL = process.env.REPRO_BASE_URL || 'http://localhost:8083';
const OUT = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/invoice-document');
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  -- ' + detail : ''));
  if (ok) pass++; else fail++;
}

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT, { recursive: true });

  const { supabase: api, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });

  const wanted = process.argv[2];
  let query = api.from('invoices').select('id, invoice_number, status').eq('company_id', co.id);
  query = wanted
    ? query.eq('invoice_number', wanted)
    : query.ilike('invoice_number', 'DOC-%').order('created_at', { ascending: false }).limit(1);
  const target = ((await query).data ?? [])[0];
  if (!target) throw new Error('No invoice to render.');
  console.log('rendering ' + target.invoice_number + ' (' + target.status + ')');

  const docRes = await invoke(api, 'invoices', {
    method: 'GET_DOCUMENT', company_id: co.id, invoiceId: target.id,
  });
  if (!docRes.ok) throw new Error('GET_DOCUMENT failed: ' + tech(docRes));

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
  // Repeated automated requests trip Vercel's bot mitigation, which serves a
  // JavaScript checkpoint in place of the app. It clears itself in a real
  // browser engine, so wait it out rather than reading it as a site failure.
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

  console.log(NL + '======== THE DOCUMENT ON SCREEN ========');
  await page.goto(BASE_URL + '/invoices/' + target.id, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, 'detail.png'), fullPage: true });
  await page.locator('article').first().screenshot({ path: path.join(OUT, 'document.png') });

  const text = await page.locator('body').innerText();
  check('the page renders', !/something went wrong|unexpected error/i.test(text));
  check('it carries the banking panel', /banking details/i.test(text));
  check('it names what was sold', /Design of the Q3 brand refresh/i.test(text) || !/DOC-/.test(target.invoice_number));
  check('it states the balance due', /balance due|paid in full/i.test(text));
  check('the logo is on the page', (await page.locator('article header img').count()) > 0);

  const logoBox = await page.locator('article header img').first().boundingBox().catch(() => null);
  check('the logo is a document-sized mark, not an icon',
    !!logoBox && logoBox.height >= 36, logoBox ? Math.round(logoBox.width) + 'x' + Math.round(logoBox.height) : 'none');

  console.log(NL + '======== THE PDF ========');
  await page.getByRole('button', { name: /invoice pdf/i }).click();
  await page.waitForTimeout(500);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('menuitem', { name: /download/i }).click(),
  ]);
  const pdfPath = path.join(OUT, download.suggestedFilename());
  await download.saveAs(pdfPath);
  check('the download is named after the invoice',
    download.suggestedFilename() === 'Invoice_' + target.invoice_number + '.pdf',
    download.suggestedFilename());

  const size = fs.statSync(pdfPath).size;
  check('the PDF has real content', size > 8_000, size + ' bytes');

  const { pdf } = await import('pdf-to-img');
  const pages = await pdf(pdfPath, { scale: 2 });
  let n = 0;
  for await (const image of pages) {
    n += 1;
    fs.writeFileSync(path.join(OUT, 'page-' + n + '.png'), image);
  }
  check('it rasterises', n >= 1, n + ' page(s)');
  check('a one-line invoice fits on one page', n === 1, String(n));

  await page.keyboard.press('Escape');
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
