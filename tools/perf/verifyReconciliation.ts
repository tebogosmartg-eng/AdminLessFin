/**
 * Live verification for the sub-ledger reconciliation controls.
 *
 * Loads the Reconciliation Centre against the real tenant and asserts the
 * controls actually rendered with data — not a skeleton, not an error
 * boundary. Read-only: it navigates and observes, and writes nothing.
 */
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const BASE = process.env.PERF_BASE_URL || 'http://127.0.0.1:4173';

(async () => {
  const env = loadE2EEnv();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });

  await page.goto(BASE + '/auth', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });

  await page.goto(BASE + '/accounting/reconciliation', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12_000);

  const text = await page.locator('body').innerText();

  const controls = [
    'Bank ↔ General Ledger',
    'Accounts Receivable ↔ General Ledger',
    'Accounts Payable ↔ General Ledger',
    'VAT ↔ General Ledger',
    'Fixed Assets ↔ General Ledger',
    'Inventory ↔ General Ledger',
    'Payroll ↔ General Ledger',
    'Cash ↔ Cash Flow Statement',
  ];
  const identities = [
    'Trial Balance — debits equal credits',
    'Balance Sheet — assets equal liabilities plus equity',
    'Income Statement — income less expenses equals net income',
    'Equity — opening plus movements equals closing',
  ];

  console.log('URL:', page.url());
  console.log('\n--- reconciliation controls rendered ---');
  for (const c of controls) console.log(`  ${text.includes(c) ? 'OK  ' : 'MISS'} ${c}`);
  console.log('\n--- canonical identities rendered ---');
  for (const i of identities) console.log(`  ${text.includes(i) ? 'OK  ' : 'MISS'} ${i}`);

  console.log('\n--- states present ---');
  for (const s of ['Balanced', 'Variance', 'Not available', 'Holds']) {
    console.log(`  ${text.includes(s) ? 'yes' : 'no '} ${s}`);
  }

  const boundaryTripped = text.includes('Reconciliation controls unavailable');
  console.log('\nerror boundary tripped:', boundaryTripped);
  console.log('console errors:', consoleErrors.length);
  consoleErrors.slice(0, 5).forEach((e) => console.log('   ', e));

  const missing = [...controls, ...identities].filter((t) => !text.includes(t));
  const ok = missing.length === 0 && !boundaryTripped;
  console.log(`\nRESULT: ${ok ? 'PASS' : 'FAIL'}`);
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
