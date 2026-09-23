/**
 * Annual Financial Statements for a genuinely new company, end to end.
 *
 * A company is created here in the browser, its financial calendar is set up
 * through the onboarding wizard, and Financial Statements is then opened from
 * a standing start — the exact path a new user takes.
 *
 * What is proved:
 *   - a new company + a valid financial year offers ONE clear first-use action
 *     that names the year, instead of pointing somewhere else;
 *   - that action lands the user inside the engagement;
 *   - the engagement persists across a reload and a direct URL;
 *   - running the action again returns the same engagement — no duplicate,
 *     also when the two calls race;
 *   - switching company, and switching financial year, never shows another
 *     year's or another company's engagement;
 *   - signing out and back in keeps it.
 *
 * The user's original active company is restored at the end.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { test, expect, waitForRouteSettled, expectNoErrorBoundary } from './fixtures';
import { loadE2EEnv } from './env';
import type { Page } from '@playwright/test';

type Company = { id: string; name: string };
type Year = { id: string; year_code: string; start_date: string; end_date: string; status: string; is_current?: boolean };
type Workspace = { id: string; efs_reporting_periods?: { financial_year_id?: string | null } };

let admin: SupabaseClient;
let originalActive: string | null = null;
let newCompanyId: string | null = null;
const NEW_COMPANY_NAME = `AFS NEW ${Date.now()}`;
let otherCompany: Company | null = null;

async function edge(fn: string, body: Record<string, unknown>) {
  const { data, error } = await admin.functions.invoke(fn, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const text = ctx ? await ctx.text().catch(() => '') : '';
    throw new Error(`${fn} ${String(body.method ?? '')}: ${error.message} ${text}`);
  }
  return data;
}

async function signInNode() {
  const env = loadE2EEnv();
  admin = createClient(env.supabaseUrl, env.supabaseAnonKey);
  const auth = await admin.auth.signInWithPassword({ email: env.email, password: env.password });
  if (auth.error) throw auth.error;
}

async function yearsOf(companyId: string): Promise<Year[]> {
  return (await edge('accounting', { method: 'GET_FINANCIAL_YEARS', company_id: companyId })) as Year[];
}

async function workspacesOf(companyId: string): Promise<Workspace[]> {
  return (await edge('financial-statements', { method: 'LIST_WORKSPACES', company_id: companyId })) as Workspace[];
}

async function switchTo(page: Page, companyId: string) {
  const trigger = page.getByTestId('company-switcher');
  await expect(trigger).toBeEnabled({ timeout: 30_000 });
  if ((await trigger.getAttribute('data-company-id')) === companyId) return;
  await trigger.click();
  await page.locator(`[data-testid="company-option"][data-company-id="${companyId}"]`).click();
  await expect(trigger).toHaveAttribute('data-company-id', companyId, { timeout: 45_000 });
  await expect(trigger).toHaveAttribute('data-switching', 'false', { timeout: 45_000 });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await signInNode();
  const session = (await edge('user-session', { method: 'GET' })) as {
    companies: Company[];
    activeCompany: { id: string };
  };
  originalActive = session.activeCompany?.id ?? null;
  otherCompany = session.companies.find((c) => c.id !== originalActive) ?? null;
  expect(originalActive).toBeTruthy();
});

test.afterAll(async () => {
  // The sign-out test revokes every session of this user, so sign in again
  // before putting the original active company back. Other specs run in
  // whichever company is left active.
  await signInNode();
  if (!originalActive) return;
  await edge('settings', {
    method: 'SWITCH_COMPANY',
    company_id: originalActive,
    target_company_id: originalActive,
  });
  const after = (await edge('user-session', { method: 'GET' })) as { activeCompany?: { id: string } };
  expect(after.activeCompany?.id).toBe(originalActive);
});

test('a new company starts with no financial year and no engagement', async ({ page, diagnostics }) => {
  await page.goto('/create-company');
  await waitForRouteSettled(page);
  await page.getByPlaceholder('e.g., ACME Inc.').fill(NEW_COMPANY_NAME);
  await page.getByRole('button', { name: /create company/i }).click();

  // Company creation switches into the new company and moves to the wizard.
  await expect(page).toHaveURL(/\/accounting-setup/, { timeout: 60_000 });
  const switcher = page.getByTestId('company-switcher');
  await expect(switcher).toHaveAttribute('data-switching', 'false', { timeout: 45_000 });
  newCompanyId = await switcher.getAttribute('data-company-id');
  expect(newCompanyId).toBeTruthy();

  // The onboarding trigger creates the chart of accounts but no financial year.
  expect(await yearsOf(newCompanyId!)).toEqual([]);
  expect(await workspacesOf(newCompanyId!)).toEqual([]);

  // The header says so rather than inventing one.
  await expect(page.getByTestId('active-financial-year')).toHaveText(/No financial year/);
  await expectNoErrorBoundary(page);
  expect(diagnostics.pageErrors).toEqual([]);
});

test('Financial Statements sends a company with no year to the one place years are made', async ({ page }) => {
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  await expect(page.getByRole('link', { name: /set up the financial year/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('afs-prepare')).toHaveCount(0);
  await expectNoErrorBoundary(page);
});

test('setting the year end in the wizard creates the financial year', async ({ page }) => {
  await page.goto('/accounting-setup?step=financial_calendar');
  await waitForRouteSettled(page);
  await page.getByRole('button', { name: /save settings/i }).click();

  await expect
    .poll(async () => (await yearsOf(newCompanyId!)).length, { timeout: 60_000 })
    .toBeGreaterThan(0);
  const years = await yearsOf(newCompanyId!);
  expect(years.some((y) => y.is_current)).toBe(true);
  // Still no engagement — creating a year must not silently create one.
  expect(await workspacesOf(newCompanyId!)).toEqual([]);
});

test('a valid year offers one first-use action that names it, and lands in the engagement', async ({
  page,
  diagnostics,
}) => {
  const years = await yearsOf(newCompanyId!);
  const current = years.find((y) => y.is_current)!;

  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);

  // The year on screen is the year the header is in.
  await expect(page.getByTestId('financial-context-switcher')).toHaveAttribute(
    'data-year-id',
    current.id,
    { timeout: 30_000 },
  );
  const setUp = page.getByTestId('afs-prepare');
  await expect(setUp).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(current.year_code, { exact: false }).first()).toBeVisible();
  // The old dead end is gone.
  await expect(page.getByText(/Open Financial Statements from the current Financial Year/i)).toHaveCount(0);

  await setUp.click();
  await expect(page).toHaveURL(/\/financial-statements-workspace\/[0-9a-f-]{36}/, { timeout: 90_000 });
  await waitForRouteSettled(page);

  const workspaces = await workspacesOf(newCompanyId!);
  expect(workspaces.length).toBe(1);
  expect(workspaces[0].efs_reporting_periods?.financial_year_id).toBe(current.id);
  await expectNoErrorBoundary(page);
  expect(diagnostics.pageErrors).toEqual([]);
});

test('the engagement survives a reload and a direct URL, and the home now opens it', async ({ page }) => {
  const [ws] = await workspacesOf(newCompanyId!);
  await page.goto(`/financial-statements-workspace/${ws.id}`);
  await waitForRouteSettled(page);
  await expectNoErrorBoundary(page);
  await page.reload();
  await waitForRouteSettled(page);
  await expectNoErrorBoundary(page);

  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  // Prepared already: the landing opens the statements rather than asking again.
  await expect(page).toHaveURL(new RegExp(`/financial-statements-workspace/${ws.id}`), {
    timeout: 60_000,
  });
});

test('running set-up again returns the same engagement, even when two calls race', async () => {
  const years = await yearsOf(newCompanyId!);
  const current = years.find((y) => y.is_current)!;
  const [before] = await workspacesOf(newCompanyId!);

  const again = (await edge('financial-statements', {
    method: 'ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR',
    company_id: newCompanyId,
    financial_year_id: current.id,
  })) as { workspace: { id: string }; created: boolean };
  expect(again.created).toBe(false);
  expect(again.workspace.id).toBe(before.id);

  // Two at once must not produce two.
  await Promise.all([
    edge('financial-statements', {
      method: 'ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR',
      company_id: newCompanyId,
      financial_year_id: current.id,
    }),
    edge('financial-statements', {
      method: 'ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR',
      company_id: newCompanyId,
      financial_year_id: current.id,
    }),
  ]);
  const after = await workspacesOf(newCompanyId!);
  expect(after.length).toBe(1);
  expect(after[0].id).toBe(before.id);
});

test('another financial year is offered its own engagement, never the first one', async ({ page }) => {
  // Add a second year for this company, then look at Financial Statements in it.
  await page.goto('/settings?tab=accounting');
  await waitForRouteSettled(page);
  const addYear = page.getByRole('combobox').filter({ hasText: /choose the year to add/i }).first();
  await expect(addYear).toBeVisible({ timeout: 30_000 });
  await addYear.click();
  const option = page.getByRole('option').first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  const addedLabel = (await option.innerText()).trim();
  await option.click();

  await expect.poll(async () => (await yearsOf(newCompanyId!)).length, { timeout: 60_000 }).toBeGreaterThan(1);
  const years = await yearsOf(newCompanyId!);
  const current = years.find((y) => y.is_current)!;
  const other = years.find((y) => y.id !== current.id)!;
  expect(addedLabel).toBeTruthy();

  // Move the header into the other year.
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  await page.getByTestId('financial-context-switcher').click();
  await page.locator(`[data-testid="financial-year-option"][data-year-id="${other.id}"]`).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('financial-context-switcher')).toHaveAttribute('data-year-id', other.id);

  // That year has no statements, so it is offered its own — the first year's
  // are never presented as this year's.
  await expect(page.getByTestId('afs-prepare')).toBeVisible({ timeout: 30_000 });

  // Back in the current year, its own statements open again.
  await page.getByTestId('financial-context-switcher').click();
  await page.locator(`[data-testid="financial-year-option"][data-year-id="${current.id}"]`).click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/financial-statements-workspace\/[0-9a-f-]{36}/, { timeout: 60_000 });
});

test('switching company never shows the other company engagement', async ({ page, diagnostics }) => {
  test.skip(!otherCompany, 'needs a second company');
  const [mine] = await workspacesOf(newCompanyId!);

  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  await switchTo(page, otherCompany!.id);
  await waitForRouteSettled(page);

  // Under the other company, this company's statements are neither open nor
  // named anywhere on the page.
  await expect
    .poll(async () => page.url().includes(mine.id), { timeout: 30_000 })
    .toBe(false);
  expect(await page.content()).not.toContain(mine.id);

  await switchTo(page, newCompanyId!);
  await waitForRouteSettled(page);
  // Back in its own company, its own statements open.
  await expect
    .poll(async () => page.url().includes(mine.id), { timeout: 60_000 })
    .toBe(true);
  await expectNoErrorBoundary(page);
  expect(diagnostics.pageErrors).toEqual([]);
});

test('signing out and back in keeps the engagement', async ({ page }) => {
  const env = loadE2EEnv();
  const [ws] = await workspacesOf(newCompanyId!);

  await page.goto('/');
  await waitForRouteSettled(page);
  await page.getByRole('button', { name: /sign out/i }).first().click();
  await page.waitForFunction(
    () => !Object.keys(window.localStorage).some((k) => k.includes('auth-token')),
    null,
    { timeout: 30_000 },
  );

  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 60_000 });

  await page.goto(`/financial-statements-workspace/${ws.id}`);
  await waitForRouteSettled(page);
  await expectNoErrorBoundary(page);
});
