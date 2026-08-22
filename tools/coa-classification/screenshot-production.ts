/**
 * Phase 15 — visual verification against the real Vercel production app.
 * Logs in as the E2E user, captures Chart of Accounts (classification column)
 * and Trial Balance (hierarchy), reloads to confirm the hierarchy persists.
 *
 *   npx tsx tools/coa-classification/screenshot-production.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const BASE_URL = 'https://adminless-fin.vercel.app';
// NOT tests/e2e/artifacts — Playwright clears that directory on every run.
const OUT_DIR = path.join(process.cwd(), 'tests/e2e/evidence/coa-classification-production');

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  // Same sign-in the certification global-setup performs.
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });

  const shots: Record<string, string> = {};

  await page.goto(`${BASE_URL}/chart-of-accounts`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  shots.chartOfAccounts = path.join(OUT_DIR, 'chart-of-accounts.png');
  await page.screenshot({ path: shots.chartOfAccounts, fullPage: true });
  const coaHasClassificationColumn = await page
    .getByRole('columnheader', { name: /classification/i })
    .isVisible()
    .catch(() => false);

  await page.goto(`${BASE_URL}/trial-balance`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  shots.trialBalance = path.join(OUT_DIR, 'trial-balance.png');
  await page.screenshot({ path: shots.trialBalance, fullPage: true });

  const tbText = (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ');
  const findings = {
    coa_has_classification_column: coaHasClassificationColumn,
    tb_shows_duplicated_non_current: /Non-current\s+Non-current/i.test(tbText),
    tb_mentions_current_liabilities: /Current Liabilities/i.test(tbText),
    tb_mentions_classification_required: /Classification Required/i.test(tbText),
  };

  // Reload — the hierarchy must be identical, not a render-order accident.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  const tbTextAfterReload = (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ');
  shots.trialBalanceReloaded = path.join(OUT_DIR, 'trial-balance-reloaded.png');
  await page.screenshot({ path: shots.trialBalanceReloaded, fullPage: true });

  const stableAcrossReload =
    /Current Liabilities/i.test(tbTextAfterReload) === findings.tb_mentions_current_liabilities &&
    !/Non-current\s+Non-current/i.test(tbTextAfterReload);

  await browser.close();

  const report = { base_url: BASE_URL, ...findings, stable_across_reload: stableAcrossReload, shots };
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
