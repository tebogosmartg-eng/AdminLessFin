/**
 * Live Edge + mapping proof. Mutates only by creating the missing VAT control
 * if it is genuinely absent — the customer "Create recommended account" path.
 *
 *   npx tsx tools/ux-stability/prove-coa-edge-production.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import {
  analyseControlAccountMappings,
  buildRecommendedAccount,
} from '../../src/governance/domains/accountingReadiness/controlAccountMapping';

const OUT = path.join(process.cwd(), 'tests/e2e/artifacts/coa-edge-production-proof.json');
const BASE_URL = 'https://adminless-fin.vercel.app';
const FAKE_ID = '00000000-0000-4000-8000-000000000000';

async function invokeMessage(error: unknown, data: unknown): Promise<string> {
  const parts: string[] = [];
  const err = error as { message?: string; context?: unknown } | null;
  if (err?.message) parts.push(err.message);
  const context = err?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body && typeof body === 'object') {
        parts.push(String((body as { technicalMessage?: string }).technicalMessage || ''));
        parts.push(String((body as { businessMessage?: string }).businessMessage || ''));
        parts.push(String((body as { error?: string }).error || ''));
        parts.push(JSON.stringify(body));
      }
    } catch {
      parts.push(await context.clone().text().catch(() => ''));
    }
  } else if (context && typeof context === 'object') {
    parts.push(JSON.stringify(context));
  }
  if (data != null) parts.push(JSON.stringify(data));
  return parts.join(' ');
}

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
  if (!companyId) throw new Error('No company.');

  const beforeAccounts = await supabase.functions.invoke('chart-of-accounts', {
    body: { method: 'GET', company_id: companyId },
  });
  if (beforeAccounts.error) throw new Error(`GET accounts failed: ${beforeAccounts.error.message}`);
  const accountsBefore = Array.isArray(beforeAccounts.data) ? beforeAccounts.data : [];

  const beforeStatus = await supabase.functions.invoke('accounting-setup', {
    body: { method: 'GET_STATUS', company_id: companyId },
  });
  if (beforeStatus.error) throw new Error(`GET_STATUS failed: ${beforeStatus.error.message}`);

  const mapUnknown = await supabase.functions.invoke('chart-of-accounts', {
    body: {
      method: 'MAP_ROLE',
      company_id: companyId,
      accountId: FAKE_ID,
      account_role: 'vat_control',
    },
  });
  const mapUnknownText = await invokeMessage(mapUnknown.error, mapUnknown.data);
  const mapRoleLive =
    /account not found/i.test(mapUnknownText) && !/unsupported method/i.test(mapUnknownText);

  const generateExisting = await supabase.functions.invoke('chart-of-accounts', {
    body: {
      method: 'GENERATE',
      company_id: companyId,
      templateKey: 'standard-ifrs-sme-za',
    },
  });
  const generateText = await invokeMessage(generateExisting.error, generateExisting.data);
  const generateRefused = /already has a Chart of Accounts/i.test(generateText);
  const generateDidNotWipe = !generateExisting.data?.generated;

  const existingMapped = accountsBefore.find(
    (a: { account_role?: string | null; system_account?: boolean }) =>
      a.account_role === 'trade_receivable' && !a.system_account,
  );
  let mapRolePersist: {
    attempted: boolean;
    accountId: string | null;
    persisted: boolean;
    text: string;
  } = { attempted: false, accountId: null, persisted: false, text: '' };
  if (existingMapped?.id) {
    const mapped = await supabase.functions.invoke('chart-of-accounts', {
      body: {
        method: 'MAP_ROLE',
        company_id: companyId,
        accountId: existingMapped.id,
        account_role: 'trade_receivable',
      },
    });
    const mappedText = await invokeMessage(mapped.error, mapped.data);
    const persisted =
      !mapped.error &&
      (mapped.data?.account_role === 'trade_receivable' || mapped.data?.id === existingMapped.id);
    mapRolePersist = {
      attempted: true,
      accountId: existingMapped.id,
      persisted,
      text: mappedText.slice(0, 400),
    };
  }

  const analysisBefore = analyseControlAccountMappings({
    accounts: accountsBefore,
    flags: {
      inventoryEnabled: !!beforeStatus.data?.inventory_enabled,
      fixedAssetsEnabled: !!beforeStatus.data?.fixed_assets_enabled,
      payrollEnabled: !!beforeStatus.data?.payroll_enabled,
    },
    bankAccountsSkipped: !!beforeStatus.data?.bank_accounts_skipped,
  });

  let createdVat: Record<string, unknown> | null = null;
  const vatMissing = analysisBefore.rows.find((row) => row.role === 'vat_control')?.status === 'missing';
  if (vatMissing) {
    const spec = buildRecommendedAccount('vat_control', accountsBefore);
    const created = await supabase.functions.invoke('chart-of-accounts', {
      body: { method: 'POST', company_id: companyId, accountData: spec },
    });
    if (created.error) {
      throw new Error(`Create VAT failed: ${await invokeMessage(created.error, created.data)}`);
    }
    createdVat = created.data as Record<string, unknown>;
  }

  const afterAccounts = await supabase.functions.invoke('chart-of-accounts', {
    body: { method: 'GET', company_id: companyId },
  });
  const accountsAfter = Array.isArray(afterAccounts.data) ? afterAccounts.data : [];
  const afterStatus = await supabase.functions.invoke('accounting-setup', {
    body: { method: 'EVALUATE', company_id: companyId },
  });

  const analysisAfter = analyseControlAccountMappings({
    accounts: accountsAfter,
    flags: {
      inventoryEnabled: !!afterStatus.data?.inventory_enabled,
      fixedAssetsEnabled: !!afterStatus.data?.fixed_assets_enabled,
      payrollEnabled: !!afterStatus.data?.payroll_enabled,
    },
    bankAccountsSkipped: !!afterStatus.data?.bank_accounts_skipped,
  });

  const vatAfter = accountsAfter.find(
    (a: { account_role?: string | null; tax_treatment?: string | null; name?: string }) =>
      a.account_role === 'vat_control' ||
      a.tax_treatment === 'vat_control' ||
      /vat control/i.test(a.name || ''),
  );

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForTimeout(3000);
  await page.goto(`${BASE_URL}/accounting-setup?step=chart_of_accounts`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForTimeout(4000);
  const setupText = ((await page.locator('body').innerText()) || '').replace(/\s+/g, ' ');
  await browser.close();

  const afterAccountsCount = accountsAfter.length;
  const duplicateWipe = afterAccountsCount < accountsBefore.length;
  const missingAfter = afterStatus.data?.validation?.missingControlAccounts ?? [];

  const proof = {
    at: new Date().toISOString(),
    companyId,
    companyName: session.data?.activeCompany?.name,
    accountsBefore: accountsBefore.length,
    accountsAfter: afterAccountsCount,
    mapRoleLive,
    mapUnknownText: mapUnknownText.slice(0, 400),
    mapRolePersist,
    generateRefused,
    generateDidNotWipe,
    generateText: generateText.slice(0, 400),
    duplicateWipe,
    vatMissingBefore: vatMissing,
    createdVat: createdVat
      ? {
          id: createdVat.id,
          name: createdVat.name,
          account_role: createdVat.account_role,
          account_number: createdVat.account_number,
        }
      : null,
    vatPersisted: Boolean(vatAfter),
    vatAccount: vatAfter
      ? {
          id: vatAfter.id,
          name: vatAfter.name,
          account_role: vatAfter.account_role,
          tax_treatment: vatAfter.tax_treatment,
        }
      : null,
    engine: {
      accountCount: afterStatus.data?.validation?.accountCount ?? null,
      mappingsComplete: afterStatus.data?.validation?.mappingsComplete ?? null,
      chartOfAccountsExists: afterStatus.data?.validation?.chartOfAccountsExists ?? null,
      missingControlAccounts: missingAfter,
      accountingReady: afterStatus.data?.accounting_ready ?? null,
    },
    analysisAfter: analysisAfter.rows.map((row) => ({
      role: row.role,
      status: row.status,
      mapped: row.mappedAccount?.name ?? null,
    })),
    browser: {
      detected: /Chart of Accounts detected/i.test(setupText),
      generateStandard: /Generate Standard/i.test(setupText),
      controlFail: /Control accounts:\s*FAIL/i.test(setupText),
      vatMapped:
        /VAT Control\s*→/i.test(setupText) && !/VAT Control\s*→\s*Not mapped/i.test(setupText),
      advancedPastCoa: /Tax Step 3 of 6/i.test(setupText) || /Tax configured/i.test(setupText),
      pageErrors,
      snippet: setupText.slice(0, 1400),
    },
  };

  const go =
    mapRoleLive &&
    mapRolePersist.persisted &&
    generateRefused &&
    generateDidNotWipe &&
    !duplicateWipe &&
    proof.vatPersisted &&
    proof.engine.chartOfAccountsExists === true &&
    proof.engine.mappingsComplete === true &&
    proof.engine.accountCount === afterAccountsCount &&
    !missingAfter.includes('vat_control') &&
    proof.browser.detected &&
    !proof.browser.generateStandard &&
    !proof.browser.controlFail &&
    (proof.browser.vatMapped || proof.browser.advancedPastCoa) &&
    pageErrors.length === 0;

  const report = { go, ...proof };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!go) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
