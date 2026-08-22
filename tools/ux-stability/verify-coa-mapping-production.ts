/**
 * Production verification for existing-CoA mapping UX.
 * Read-mostly: does not generate a chart, post journals, or create customers.
 *
 *   npx tsx tools/ux-stability/verify-coa-mapping-production.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { analyseControlAccountMappings } from '../../src/governance/domains/accountingReadiness/controlAccountMapping';

const BASE_URL = process.env.UX_BASE_URL || 'https://adminless-fin.vercel.app';
const OUT = path.join(process.cwd(), 'tests/e2e/artifacts/coa-mapping-production-verification.json');

async function main() {
  const env = loadE2EEnv();
  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);
  const signIn = await supabase.auth.signInWithPassword({
    email: env.email,
    password: env.password,
  });
  if (signIn.error || !signIn.data.session) {
    throw new Error(`Auth failed: ${signIn.error?.message || 'no session'}`);
  }

  const session = await supabase.functions.invoke('user-session', { body: { method: 'GET' } });
  const companyId =
    session.data?.activeCompany?.id || env.companyId || session.data?.companies?.[0]?.id;
  if (!companyId) throw new Error('No active company on E2E session.');

  const [readiness, accounts] = await Promise.all([
    supabase.functions.invoke('accounting-setup', {
      body: { method: 'GET_STATUS', company_id: companyId },
    }),
    supabase.functions.invoke('chart-of-accounts', {
      body: { method: 'GET', company_id: companyId },
    }),
  ]);

  const accountRows = Array.isArray(accounts.data) ? accounts.data : [];
  const analysis = analyseControlAccountMappings({
    accounts: accountRows,
    flags: {
      inventoryEnabled: !!readiness.data?.inventory_enabled,
      fixedAssetsEnabled: !!readiness.data?.fixed_assets_enabled,
      payrollEnabled: !!readiness.data?.payroll_enabled,
    },
  });

  const mapProbe = await supabase.functions.invoke('chart-of-accounts', {
    body: {
      method: 'MAP_ROLE',
      company_id: companyId,
      accountId: '00000000-0000-4000-8000-000000000000',
      account_role: 'trade_receivable',
    },
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL(/\/(dashboard|$|accounting)/i, { timeout: 45_000 }).catch(() => undefined);
  await page.waitForTimeout(2500);

  await page.goto(`${BASE_URL}/accounting-setup?step=chart_of_accounts`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(4000);
  const setupText = ((await page.locator('body').innerText()) || '').replace(/\s+/g, ' ');
  const setup = {
    detected: /Chart of Accounts detected/i.test(setupText),
    generateStandard: /Generate Standard/i.test(setupText),
    controlFail: /Control accounts:\s*FAIL/i.test(setupText),
    mappingCopy: /AdminLess Fin has analysed it/i.test(setupText),
    mappingRequired: /mapping required|mappings required|Needs attention|Not mapped/i.test(setupText),
    existingChart: /Existing chart/i.test(setupText),
    title: await page.title(),
    snippet: setupText.slice(0, 1200),
  };

  await page.goto(`${BASE_URL}/journal-entries`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(3500);
  const journalText = ((await page.locator('body').innerText()) || '').replace(/\s+/g, ' ');
  const journal = {
    blocked: /Posting is temporarily unavailable|Complete Accounting Setup/i.test(journalText),
    completeSetupLink: /Complete Accounting Setup/i.test(journalText),
    formVisible: /New Journal|Save Journal|Post Journal/i.test(journalText),
    snippet: journalText.slice(0, 800),
  };

  await browser.close();

  const report = {
    ok: true,
    at: new Date().toISOString(),
    url: BASE_URL,
    companyId,
    companyName: session.data?.activeCompany?.name,
    api: {
      readinessError: readiness.error?.message || null,
      accountsError: accounts.error?.message || null,
      accountCount: accountRows.length,
      accountingReady: readiness.data?.accounting_ready ?? null,
      currentStep: readiness.data?.current_step ?? null,
      chartOfAccountsExists: readiness.data?.validation?.chartOfAccountsExists ?? null,
      mappingsComplete: readiness.data?.validation?.mappingsComplete ?? null,
      missingControlAccounts: readiness.data?.validation?.missingControlAccounts ?? [],
      accountCountFromEngine: readiness.data?.validation?.accountCount ?? null,
    },
    analysis: {
      accountCount: analysis.accountCount,
      requiredCount: analysis.requiredCount,
      mappedCount: analysis.mappedCount,
      autoCount: analysis.autoCount,
      ambiguousCount: analysis.ambiguousCount,
      missingCount: analysis.missingCount,
      rows: analysis.rows.map((row) => ({
        role: row.role,
        status: row.status,
        mapped: row.mappedAccount?.name ?? null,
      })),
    },
    edge: {
      mapRole: {
        error: mapProbe.error?.message || null,
        data: mapProbe.data ?? null,
        deployed: !/unsupported method/i.test(
          `${mapProbe.error?.message || ''} ${JSON.stringify(mapProbe.data || {})}`,
        ),
      },
    },
    browser: { setup, journal, pageErrors },
  };

  const go =
    setup.detected &&
    !setup.generateStandard &&
    !setup.controlFail &&
    setup.mappingCopy &&
    pageErrors.length === 0 &&
    (!readiness.data?.accounting_ready ? journal.blocked && journal.completeSetupLink : journal.formVisible);

  report.ok = go;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ go, out: OUT, setup, journalBlocked: journal.blocked, accountCount: accountRows.length, missing: report.api.missingControlAccounts, mapRole: report.edge.mapRole }, null, 2));
  if (!go) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
