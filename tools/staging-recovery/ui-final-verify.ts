/** Phase 15 — the repaired screens, in the real production browser. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect } from './edgeProbe';

const BASE_URL = 'https://adminless-fin.vercel.app';
const OUT = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/ui-final');

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const { supabase: api, company } = await connect(process.argv[2] || 'Spaceman');
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: company.id } });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
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

  const routes: Array<[string, string, RegExp]> = [
    ['general-ledger', '/general-ledger', /ledger/i],
    ['account-activity', '/accounting/account-activity', /activity|account/i],
    ['audit-trail', '/accounting/audit-trail', /audit/i],
    ['live-financial-statements', '/financial-statements', /income statement|financial/i],
    ['bills', '/bills', /bill/i],
    ['reconciliation', '/reconciliation', /reconcil/i],
  ];
  const results: Array<Record<string, unknown>> = [];
  for (const [name, route, expect] of routes) {
    const before = failed.length;
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(2500);
    const text = await page.locator('body').innerText();
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
    results.push({
      route,
      renders_expected_content: expect.test(text),
      error_boundary: /something went wrong|unexpected error/i.test(text),
      posting_blocked_banner: /Posting is temporarily unavailable/i.test(text),
      failed_calls: failed.slice(before),
    });
    console.log(`${route.padEnd(34)} content=${expect.test(text)} boundary=${/something went wrong/i.test(text)} blocked=${/Posting is temporarily unavailable/i.test(text)} failedCalls=${failed.length - before}`);
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ company: company.name, results, console_errors: errors.slice(0, 20) }, null, 2));
  console.log(`\nconsole errors: ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 5).join('\n'));
}
main().catch((e) => { console.error(e); process.exit(1); });
