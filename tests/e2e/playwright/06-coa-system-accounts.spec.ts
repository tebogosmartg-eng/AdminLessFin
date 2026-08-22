import { test, expect } from './fixtures';
import { loadE2EEnv } from './env';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Chart of Accounts — system-account protection (API + UI).
 * Certifies Claude's DB trigger + edge defense-in-depth against a live tenant
 * that already has a generator-seeded Retained Earnings system account.
 */
const env = loadE2EEnv();
const CERT_COA_COMPANY = '0a2ff5bb-3796-4467-b227-a6dd4306bcdb';

let accessToken = '';
let systemAccount: {
  id: string;
  name: string;
  type: string;
  account_role: string | null;
  control_account: boolean;
  account_code: string | null;
  is_active: boolean;
};

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: env.supabaseAnonKey, 'Content-Type': 'application/json' },
    data: { email: env.email, password: env.password },
  });
  expect(login.status()).toBe(200);
  accessToken = (await login.json()).access_token;

  const switchRes = await request.post(`${env.supabaseUrl}/functions/v1/user-session`, {
    headers: {
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: {
      method: 'SWITCH_COMPANY',
      company_id: CERT_COA_COMPANY,
      target_company_id: CERT_COA_COMPANY,
    },
  });
  expect(switchRes.status(), await switchRes.text()).toBeLessThan(400);

  const sys = await request.get(
    `${env.supabaseUrl}/rest/v1/chart_of_accounts?select=id,name,type,account_role,control_account,account_code,is_active,system_account&company_id=eq.${CERT_COA_COMPANY}&system_account=eq.true&limit=1`,
    {
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  const rows = await sys.json();
  expect(Array.isArray(rows) && rows.length > 0, 'CERT COA company must have a system account').toBe(true);
  systemAccount = rows[0];
});

async function coa(
  request: import('@playwright/test').APIRequestContext,
  body: Record<string, unknown>,
) {
  return request.post(`${env.supabaseUrl}/functions/v1/chart-of-accounts`, {
    headers: {
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: { company_id: CERT_COA_COMPANY, ...body },
  });
}

test.describe('System accounts — API protection', () => {
  test('cannot be deleted', async ({ request }) => {
    const res = await coa(request, { method: 'DELETE', accountId: systemAccount.id });
    const body = await res.json();
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(String(body.technicalMessage || body.message || '')).toMatch(/cannot be deleted/i);
  });

  test('cannot change type', async ({ request }) => {
    const res = await coa(request, {
      method: 'PUT',
      accountId: systemAccount.id,
      accountData: { type: 'Liability' },
    });
    const body = await res.json();
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(String(body.technicalMessage || body.message || '')).toMatch(/type cannot be changed/i);
  });

  test('cannot change role', async ({ request }) => {
    const res = await coa(request, {
      method: 'PUT',
      accountId: systemAccount.id,
      accountData: { account_role: 'suspense' },
    });
    const body = await res.json();
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(String(body.technicalMessage || body.message || '')).toMatch(/account.?role cannot be changed|role cannot be changed/i);
  });

  test('cannot change control flag', async ({ request }) => {
    const res = await coa(request, {
      method: 'PUT',
      accountId: systemAccount.id,
      accountData: { control_account: !systemAccount.control_account },
    });
    const body = await res.json();
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(String(body.technicalMessage || body.message || '')).toMatch(/control/i);
  });

  test('may be renamed and restored', async ({ request }) => {
    const renamed = `${systemAccount.name} [PW-CERT]`;
    const res = await coa(request, {
      method: 'PUT',
      accountId: systemAccount.id,
      accountData: { name: renamed },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).name).toBe(renamed);

    const restore = await coa(request, {
      method: 'PUT',
      accountId: systemAccount.id,
      accountData: { name: systemAccount.name },
    });
    expect(restore.status()).toBe(200);
  });

  test('may change code and restore', async ({ request }) => {
    const nextCode = `${systemAccount.account_code || '3020'}Z`;
    const res = await coa(request, {
      method: 'PUT',
      accountId: systemAccount.id,
      accountData: { account_code: nextCode },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).account_code).toBe(nextCode);

    const restore = await coa(request, {
      method: 'PUT',
      accountId: systemAccount.id,
      accountData: { account_code: systemAccount.account_code },
    });
    expect(restore.status()).toBe(200);
  });

  test('may be deactivated and reactivated', async ({ request }) => {
    const off = await coa(request, {
      method: 'PUT',
      accountId: systemAccount.id,
      accountData: { is_active: false },
    });
    expect(off.status()).toBe(200);
    expect((await off.json()).is_active).toBe(false);

    const on = await coa(request, {
      method: 'PUT',
      accountId: systemAccount.id,
      accountData: { is_active: true },
    });
    expect(on.status()).toBe(200);
    expect((await on.json()).is_active).toBe(true);
  });
});

test.describe('System accounts — UI protection', () => {
  test('Delete is disabled and type is locked for Retained Earnings', async ({ page }) => {
    await page.goto('/chart-of-accounts');
    await page.waitForLoadState('networkidle');

    // Switch tenant through the real Company Switcher (server active_company_id).
    const switcher = page.getByRole('button').filter({ hasText: /PTY|CERT|Company|Spaceman|My's/i }).first();
    await expect(switcher).toBeVisible({ timeout: 20_000 });
    await switcher.click();
    const certItem = page.getByRole('menuitem', { name: /CERT COA 1785230945189/i });
    await expect(certItem).toBeVisible({ timeout: 10_000 });
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/functions/v1/settings') && r.request().method() === 'POST',
        { timeout: 20_000 },
      ).catch(() => null),
      certItem.click(),
    ]);
    // Allow AuthContext.refreshProfile to settle before navigating.
    await page.waitForTimeout(2000);
    await page.goto('/chart-of-accounts');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder(/search by name or number/i).fill('Retained Earnings');
    const row = page.getByRole('row').filter({ hasText: /Retained Earnings/i }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });

    await row.getByRole('button').last().click();
    await expect(page.getByRole('menuitem', { name: /system account/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^delete$/i })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await row.getByRole('button').last().click();
    await page.getByRole('menuitem', { name: /^edit$/i }).click();
    await expect(page.getByRole('heading', { name: /edit account/i })).toBeVisible();
    // The dialog now carries Account Type, Classification, and (where the
    // classification has statement lines) Statement line. Account Type is the
    // first select and is the one a system account locks: its classification
    // stays editable because classification is presentation metadata the
    // customer owns, while type / role / control flags are immutable.
    const dialogSelects = page.locator('[role="dialog"] button[role="combobox"]');
    await expect(dialogSelects.first()).toBeDisabled();
    await expect(page.getByText(/system account type is locked/i)).toBeVisible();
    await expect(dialogSelects.nth(1)).toBeEnabled();

    const evidence = {
      companyId: CERT_COA_COMPANY,
      systemAccountId: systemAccount.id,
      ui: {
        deleteHidden: true,
        typeLocked: true,
      },
      at: new Date().toISOString(),
    };
    fs.mkdirSync(path.join('docs/coa-certification/evidence'), { recursive: true });
    fs.writeFileSync(
      path.join('docs/coa-certification/evidence/system-account-ui.json'),
      JSON.stringify(evidence, null, 2),
    );
  });
});
