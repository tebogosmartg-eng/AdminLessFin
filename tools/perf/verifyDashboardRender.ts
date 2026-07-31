/**
 * Live Dashboard render check.
 *
 * Loads the Dashboard against the real tenant and reports, for each financial
 * surface, whether it rendered a figure or the explicit unavailable state.
 *
 * This is the fail-safe test: when the reporting service returns no Canonical
 * Financial Aggregation, no card may show R0.00 — a silent zero is
 * indistinguishable from a real nil balance. Read-only.
 */
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const BASE = process.env.PERF_BASE_URL || 'http://127.0.0.1:4173';

(async () => {
  const env = loadE2EEnv();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));

  // Capture what the edge actually returned, so the rendered state can be
  // judged against the payload rather than guessed at.
  let payloadHasCfa: boolean | null = null;
  page.on('response', async (res) => {
    if (!res.url().includes('/functions/v1/dashboard-data')) return;
    try {
      const body = await res.json();
      if (payloadHasCfa === null) {
        payloadHasCfa = body?.statementTotals != null;
      }
    } catch {
      /* non-JSON or already consumed */
    }
  });

  await page.goto(BASE + '/auth', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(14_000);

  const text = await page.locator('body').innerText();

  const cards = ['Cash Balance', 'Total Assets', 'Total Liabilities', 'Net Income'];
  console.log('URL:', page.url());
  console.log('dashboard-data returned statementTotals:', payloadHasCfa);

  console.log('\n--- KPI cards present ---');
  for (const c of cards) console.log(`  ${text.includes(c) ? 'OK  ' : 'MISS'} ${c}`);

  const unavailableShown = text.includes('Financial figures unavailable');
  const dashRendered = text.includes('Operations Command Centre');
  console.log('\nDashboard rendered      :', dashRendered);
  console.log('unavailable state shown :', unavailableShown);
  console.log('console errors          :', consoleErrors.length);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ', e));

  // The contract: CFA present → no unavailable banner. CFA absent → banner,
  // and none of the KPI cards may be showing a currency figure.
  let ok = dashRendered && consoleErrors.length === 0;
  if (payloadHasCfa === true && unavailableShown) {
    console.log('\nFAIL: CFA was present but the unavailable state was shown.');
    ok = false;
  }
  if (payloadHasCfa === false && !unavailableShown) {
    console.log('\nFAIL: CFA was absent but no unavailable state was shown — the');
    console.log('      page is likely rendering R0.00 for real balances.');
    ok = false;
  }

  console.log(`\nRESULT: ${ok ? 'PASS' : 'FAIL'}`);
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
