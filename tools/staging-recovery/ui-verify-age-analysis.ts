/**
 * The Creditors Age Analysis page in the real browser: it renders, its totals
 * match the API, the reconciliation is on screen, and both exports produce a
 * file. Also confirms the previously-empty Reports card now has rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect, invoke } from './edgeProbe';

const NL = String.fromCharCode(10);
const BASE_URL = process.env.REPRO_BASE_URL || 'https://adminless-fin.vercel.app';
const OUT = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/age-analysis');

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const { supabase: api, company } = await connect('Spaceman');
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: company.id } });

  const asOf = new Date().toISOString().slice(0, 10);
  const apiRes = await invoke(api, 'vendors', { method: 'GET_AGE_ANALYSIS', company_id: company.id, as_of: asOf });
  const expected = apiRes.body as {
    suppliers: Array<{ vendor_name: string }>;
    totals: { total: number; ap_control_balance: number };
    reconciliation: { general_ledger_ap_balance: number; variance: number; reconciles: boolean };
  };
  console.log(`API: ${expected.suppliers.length} suppliers, aged ${expected.totals.total}, GL ${expected.reconciliation.general_ledger_ap_balance}, variance ${expected.reconciliation.variance}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  const failed: Array<{ fn: string; status: number }> = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => {
    if (r.url().includes('/functions/v1/') && r.status() >= 400) {
      failed.push({ fn: r.url().split('/functions/v1/')[1].split('?')[0], status: r.status() });
    }
  });

  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });

  console.log(NL + '=== NAVIGATE FROM THE SIDEBAR ===');
  await page.goto(`${BASE_URL}/creditors-age-analysis`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(3000);
  const text = await page.locator('body').innerText();
  await page.screenshot({ path: path.join(OUT, 'page.png'), fullPage: true });

  console.log(`  heading rendered      : ${/Creditors Age Analysis/i.test(text)}`);
  console.log(`  error boundary        : ${/something went wrong|unexpected error/i.test(text)}`);
  console.log(`  reconciliation on page: ${/Reconciliation to the general ledger/i.test(text)}`);
  console.log(`  states it reconciles  : ${/reconciles to the creditors control account/i.test(text)}`);

  for (const s of expected.suppliers) {
    console.log(`  supplier listed "${s.vendor_name}": ${text.includes(s.vendor_name)}`);
  }
  const money = (n: number) => new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2 }).format(n);
  console.log(`  GL balance ${money(expected.reconciliation.general_ledger_ap_balance)} shown: ` +
    `${text.replace(/ /g, ' ').includes(money(expected.reconciliation.general_ledger_ap_balance))}`);

  console.log(NL + '=== EXPORTS ===');
  for (const [label, name] of [['CSV', /^CSV$/i], ['PDF', /PDF for auditors/i]] as const) {
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 20000 }),
        page.getByRole('button', { name }).first().click(),
      ]);
      const file = path.join(OUT, download.suggestedFilename());
      await download.saveAs(file);
      console.log(`  ${label}: ${download.suggestedFilename()} (${fs.statSync(file).size} bytes)`);
    } catch (e) {
      console.log(`  ${label}: FAILED — ${String(e).slice(0, 100)}`);
    }
  }

  console.log(NL + '=== REPORTS CARD (was always empty) ===');
  await page.goto(`${BASE_URL}/reports`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(3500);
  const rtext = await page.locator('body').innerText();
  await page.screenshot({ path: path.join(OUT, 'reports.png'), fullPage: true });
  console.log(`  card present          : ${/Aged Payables Summary/i.test(rtext)}`);
  console.log(`  still says "no payables": ${/No outstanding payables found/i.test(rtext)}`);
  for (const s of expected.suppliers) {
    console.log(`  supplier "${s.vendor_name}" on card: ${rtext.includes(s.vendor_name)}`);
  }

  console.log(NL + `console errors: ${errors.filter((e) => !/favicon|Failed to load resource/i.test(e)).length}`);
  console.log(`failed edge calls: ${JSON.stringify(failed)}`);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
