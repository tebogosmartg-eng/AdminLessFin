/**
 * Global company + financial year context, end to end, against the live
 * project as the staging user (14 companies; one with three open years; two
 * with none).
 *
 * What is proved here, in a real browser:
 *   - the header always names the company, the financial year (code + dates)
 *     and the period on screen;
 *   - the company switcher lists exactly the companies the server says the
 *     user belongs to;
 *   - after a switch, no request is made for the previous company, a record
 *     page of the previous company is left for its list, and the server's
 *     active company matches the screen — also after rapid switching;
 *   - other tabs follow a switch;
 *   - a past year: every accounting request stays inside that year, and a
 *     notice says it is not the current year; choosing a period narrows every
 *     screen to it;
 *   - a locked period is shown as refusing postings;
 *   - refresh keeps the choice, a new tab / direct URL starts at the current
 *     year, and signing out forgets it;
 *   - a company with no financial year says so.
 *
 * The user's original active company is restored at the end.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { test, expect, waitForRouteSettled, expectNoErrorBoundary } from './fixtures';
import { loadE2EEnv } from './env';
import type { Page } from '@playwright/test';

type Company = { id: string; name: string; user_role?: string };
type Year = { id: string; year_code: string; start_date: string; end_date: string; status: string; is_current?: boolean };

let admin: SupabaseClient;
let companies: Company[] = [];
const yearsByCompany = new Map<string, Year[]>();
let originalActive: string | null = null;
let MULTI: Company; // most financial years
let OTHERS: Company[] = []; // companies with at least one year
let NO_YEAR: Company | undefined;

async function edge(fn: string, body: Record<string, unknown>) {
  const { data, error } = await admin.functions.invoke(fn, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const text = ctx ? await ctx.text().catch(() => '') : '';
    throw new Error(`${fn} ${String(body.method ?? '')}: ${error.message} ${text}`);
  }
  return data;
}

async function serverActiveCompany(): Promise<string | null> {
  const s = await edge('user-session', { method: 'GET' });
  return (s as { activeCompany?: { id: string } })?.activeCompany?.id ?? null;
}

type EdgeCall = { fn: string; method?: string; companyId?: string; body: Record<string, unknown> | null; at: number };

function captureEdge(page: Page): EdgeCall[] {
  const calls: EdgeCall[] = [];
  page.on('request', (req) => {
    const m = req.url().match(/\/functions\/v1\/([^/?]+)/);
    if (!m || req.method() !== 'POST') return;
    let body: Record<string, unknown> | null = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    calls.push({ fn: m[1], method: body?.method as string | undefined, companyId: body?.company_id as string | undefined, body, at: Date.now() });
  });
  return calls;
}

/** Every reporting date a request carries (top level and inside filters). */
function reportingDates(call: EdgeCall): string[] {
  const out: string[] = [];
  const pick = (o: Record<string, unknown> | null | undefined) => {
    if (!o) return;
    for (const k of ['start_date', 'end_date', 'date_from', 'date_to']) {
      const v = o[k];
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out.push(v);
    }
  };
  pick(call.body);
  pick(call.body?.filters as Record<string, unknown> | undefined);
  return out;
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

async function openYearSwitcher(page: Page) {
  const trigger = page.getByTestId('financial-context-switcher');
  await expect(trigger).toBeEnabled({ timeout: 30_000 });
  await trigger.click();
}

async function selectYear(page: Page, yearId: string) {
  await openYearSwitcher(page);
  await page.locator(`[data-testid="financial-year-option"][data-year-id="${yearId}"]`).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('financial-context-switcher')).toHaveAttribute('data-year-id', yearId);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const env = loadE2EEnv();
  admin = createClient(env.supabaseUrl, env.supabaseAnonKey);
  const auth = await admin.auth.signInWithPassword({ email: env.email, password: env.password });
  if (auth.error) throw auth.error;
  const session = await edge('user-session', { method: 'GET' }) as { companies: Company[]; activeCompany: { id: string } };
  companies = session.companies;
  originalActive = session.activeCompany?.id ?? null;
  for (const c of companies) {
    yearsByCompany.set(c.id, (await edge('accounting', { method: 'GET_FINANCIAL_YEARS', company_id: c.id })) as Year[]);
  }
  const withYears = companies.filter((c) => (yearsByCompany.get(c.id) ?? []).length > 0);
  MULTI = [...withYears].sort((a, b) => (yearsByCompany.get(b.id)!.length - yearsByCompany.get(a.id)!.length))[0];
  OTHERS = withYears.filter((c) => c.id !== MULTI.id);
  NO_YEAR = companies.find((c) => (yearsByCompany.get(c.id) ?? []).length === 0);
  expect(companies.length).toBeGreaterThan(3);
  expect(yearsByCompany.get(MULTI.id)!.length).toBeGreaterThan(1);
});

test.afterAll(async () => {
  if (!originalActive) return;
  // The sign-out test revokes every session of the user, this one included,
  // so sign in again before putting the original active company back. Other
  // specs run in whichever company is active.
  const env = loadE2EEnv();
  admin = createClient(env.supabaseUrl, env.supabaseAnonKey);
  const auth = await admin.auth.signInWithPassword({ email: env.email, password: env.password });
  if (auth.error) throw auth.error;
  await edge('settings', { method: 'SWITCH_COMPANY', company_id: originalActive, target_company_id: originalActive });
  expect(await serverActiveCompany()).toBe(originalActive);
});

test('the header always names the company, the financial year and the period', async ({ page, diagnostics }) => {
  await page.goto('/');
  await waitForRouteSettled(page);
  const company = page.getByTestId('company-switcher');
  const year = page.getByTestId('financial-context-switcher');
  await expect(company).toBeVisible();
  await expect(year).toBeVisible();
  await expect(company).toHaveAttribute('data-company-id', (await serverActiveCompany())!);
  await expect(page.getByTestId('active-financial-year')).toHaveText(/(FY\d{4} · \d{2} \w{3} \d{4} – \d{2} \w{3} \d{4})|(No financial year)/);
  await expect(page.getByTestId('active-reporting-range')).not.toHaveText('');
  await expectNoErrorBoundary(page);
  expect(diagnostics.pageErrors).toEqual([]);
});

test('the company switcher lists exactly the companies the user belongs to', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('company-switcher').click();
  const options = page.locator('[data-testid="company-option"]');
  await expect(options.first()).toBeVisible();
  const ids = await options.evaluateAll((els) => els.map((e) => e.getAttribute('data-company-id')));
  expect(new Set(ids)).toEqual(new Set(companies.map((c) => c.id)));
  expect(ids.length).toBe(companies.length);
  // More than five companies: the list is searchable.
  await expect(page.getByRole('combobox', { name: /search companies/i }).or(page.getByPlaceholder(/search companies/i))).toBeVisible();
  await page.keyboard.press('Escape');
});

test('switching company: nothing is requested for the previous company, and the server agrees', async ({ page, diagnostics }) => {
  const [A, B] = [MULTI, OTHERS[0]];
  await page.goto('/trial-balance');
  await switchTo(page, A.id);
  await waitForRouteSettled(page);

  const calls = captureEdge(page);
  await switchTo(page, B.id);
  const shownAt = Date.now();
  await waitForRouteSettled(page);
  for (const path of ['/general-ledger', '/financial-statements', '/reports', '/journal-entries', '/']) {
    await page.goto(path);
    await waitForRouteSettled(page);
  }
  await expect(page.getByTestId('company-switcher')).toHaveAttribute('data-company-id', B.id);

  const afterSwitch = calls.filter((c) => c.at >= shownAt && c.companyId);
  expect(afterSwitch.length).toBeGreaterThan(0);
  const stale = afterSwitch.filter((c) => c.companyId !== B.id);
  expect(stale.map((c) => `${c.fn}:${c.method ?? ''}:${c.companyId}`)).toEqual([]);

  // The year shown is the new company's current year.
  const current = yearsByCompany.get(B.id)!.find((y) => y.is_current)!;
  await expect(page.getByTestId('financial-context-switcher')).toHaveAttribute('data-year-id', current.id);
  expect(await serverActiveCompany()).toBe(B.id);
  expect(diagnostics.pageErrors).toEqual([]);
});

test('a record page of the previous company is left for its list', async ({ page }) => {
  // Find a company with an invoice.
  let owner: Company | undefined;
  let invoice: { id: string; invoice_number?: string } | undefined;
  for (const c of companies) {
    const list = await edge('invoices', { method: 'GET_ALL', company_id: c.id }).catch(() => null) as unknown;
    const rows = Array.isArray(list) ? list : ((list as { data?: unknown[] })?.data ?? []);
    if (rows.length) { owner = c; invoice = rows[0] as { id: string; invoice_number?: string }; break; }
  }
  test.skip(!owner || !invoice, 'no invoice in any of the user\'s companies');
  const other = companies.find((c) => c.id !== owner!.id && (yearsByCompany.get(c.id) ?? []).length > 0)!;

  await page.goto('/');
  await switchTo(page, owner!.id);
  await page.goto(`/invoices/${invoice!.id}`);
  await waitForRouteSettled(page);
  const calls = captureEdge(page);
  await switchTo(page, other.id);
  const shownAt = Date.now();
  await expect(page).toHaveURL(/\/invoices\/?$/);
  await waitForRouteSettled(page);
  if (invoice!.invoice_number) {
    await expect(page.getByText(invoice!.invoice_number, { exact: true })).toHaveCount(0);
  }
  // The old record was never requested under the new company, and nothing at
  // all was asked of the old company once the new one was on screen.
  const underNew = calls.filter((c) => c.companyId === other.id && JSON.stringify(c.body ?? {}).includes(invoice!.id));
  expect(underNew.map((c) => `${c.fn}:${c.method}`)).toEqual([]);
  const staleAfter = calls.filter((c) => c.at >= shownAt && c.companyId === owner!.id);
  expect(staleAfter.map((c) => `${c.fn}:${c.method}`)).toEqual([]);
});

test('rapid switching ends on the last company chosen, on screen and on the server', async ({ page }) => {
  const [B, C, D] = [OTHERS[1], OTHERS[2], OTHERS[3] ?? MULTI];
  await page.goto('/reports');
  for (const target of [B, C, D]) {
    // No waiting for the page between switches — only for the switcher itself.
    const trigger = page.getByTestId('company-switcher');
    await expect(trigger).toBeEnabled({ timeout: 45_000 });
    await trigger.click();
    await page.locator(`[data-testid="company-option"][data-company-id="${target.id}"]`).click();
  }
  const trigger = page.getByTestId('company-switcher');
  await expect(trigger).toHaveAttribute('data-company-id', D.id, { timeout: 45_000 });
  await expect(trigger).toHaveAttribute('data-switching', 'false', { timeout: 45_000 });
  await waitForRouteSettled(page);
  expect(await serverActiveCompany()).toBe(D.id);
});

test('another tab of the same user follows a switch', async ({ page, context }) => {
  await page.goto('/');
  await switchTo(page, OTHERS[0].id);
  const second = await context.newPage();
  await second.goto('/trial-balance');
  await expect(second.getByTestId('company-switcher')).toHaveAttribute('data-company-id', OTHERS[0].id, { timeout: 30_000 });
  await switchTo(page, OTHERS[1].id);
  await expect(second.getByTestId('company-switcher')).toHaveAttribute('data-company-id', OTHERS[1].id, { timeout: 45_000 });
  await second.close();
});

test('a past year: every accounting request stays inside it, and the screen says so', async ({ page, diagnostics }) => {
  const years = yearsByCompany.get(MULTI.id)!;
  const past = years.find((y) => !y.is_current)!;
  await page.goto('/');
  await switchTo(page, MULTI.id);
  await selectYear(page, past.id);
  await expect(page.getByTestId('context-notice')).toContainText(past.year_code);
  await expect(page.getByTestId('financial-context-switcher')).toHaveAttribute('data-current-year', 'false');

  const calls = captureEdge(page);
  for (const path of ['/trial-balance', '/financial-statements', '/reports', '/journal-entries', '/tax-report']) {
    await page.goto(path);
    await waitForRouteSettled(page);
    await expect(page.getByTestId('financial-context-switcher')).toHaveAttribute('data-year-id', past.id);
  }
  const dated = calls.filter((c) => reportingDates(c).length > 0);
  expect(dated.length).toBeGreaterThan(0);
  const outside = dated.filter((c) => reportingDates(c).some((d) => d < past.start_date || d > past.end_date));
  expect(outside.map((c) => `${c.fn}:${c.method ?? ''}:${reportingDates(c).join(',')}`)).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
});

test('choosing an accounting period narrows every screen to it', async ({ page }) => {
  const current = yearsByCompany.get(MULTI.id)!.find((y) => y.is_current)!;
  await page.goto('/');
  await switchTo(page, MULTI.id);
  await selectYear(page, current.id);
  await openYearSwitcher(page);
  const firstPeriod = page.locator('[data-testid="accounting-period-option"]').first();
  const start = (await firstPeriod.getAttribute('data-period-start'))!;
  await firstPeriod.click();
  await page.keyboard.press('Escape');
  const end = new Date(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0);
  const endIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

  const calls = captureEdge(page);
  // A full reload: the remembered period must be restored before anything is
  // fetched, so the first (and only) trial balance request is for the period.
  const tbRequest = page.waitForRequest((req) => {
    if (!/\/functions\/v1\/accounting/.test(req.url())) return false;
    try { return /TRIAL_BALANCE/.test((req.postDataJSON() as { method?: string })?.method ?? ''); } catch { return false; }
  }, { timeout: 45_000 });
  await page.goto('/trial-balance');
  const tb = (await tbRequest).postDataJSON() as { start_date?: string; end_date?: string };
  expect(tb.start_date).toBe(start);
  expect(tb.end_date).toBe(endIso);
  await waitForRouteSettled(page);
  await expect(page.getByTestId('active-reporting-range')).toContainText(/\w+ \d{4}/);
  const tbCalls = calls.filter((c) => c.fn === 'accounting' && /TRIAL_BALANCE/.test(c.method ?? ''));
  expect(tbCalls.filter((c) => c.body?.start_date !== start).map((c) => `${c.body?.start_date}..${c.body?.end_date}`)).toEqual([]);
});

test('a locked period is shown as refusing postings', async ({ page }) => {
  // No live period is locked, and one is not locked in production for a test:
  // the periods response is altered in the browser only. The database refusing
  // postings in a locked period is proved by the migration rehearsal.
  let lockedStart = '';
  await page.route('**/functions/v1/accounting', async (route) => {
    const body = route.request().postDataJSON() as { method?: string } | null;
    if (body?.method !== 'GET_FINANCIAL_PERIODS') return route.continue();
    const response = await route.fetch();
    const rows = (await response.json()) as Array<{ status: string; start_date: string; financial_year_id: string }>;
    const current = yearsByCompany.get(MULTI.id)!.find((y) => y.is_current)!;
    const target = rows.find((r) => r.financial_year_id === current.id);
    if (target) { target.status = 'locked'; lockedStart = target.start_date; }
    await route.fulfill({ response, json: rows });
  });
  await page.goto('/');
  await switchTo(page, MULTI.id);
  await page.reload();
  await openYearSwitcher(page);
  const locked = page.locator('[data-testid="accounting-period-option"][data-period-status="locked"]').first();
  await expect(locked).toBeVisible();
  expect(await locked.getAttribute('data-period-start')).toBe(lockedStart);
  await expect(locked).toContainText('Locked');
  await locked.click();
  await expect(page.getByTestId('locked-period-notice')).toContainText(/postings dated in it are refused/i);
  await page.keyboard.press('Escape');
});

test('refresh keeps the chosen year; a new tab and direct URLs start at the current year', async ({ page, context }) => {
  const years = yearsByCompany.get(MULTI.id)!;
  const past = years.find((y) => !y.is_current)!;
  const current = years.find((y) => y.is_current)!;
  await page.goto('/');
  await switchTo(page, MULTI.id);
  await selectYear(page, past.id);
  await page.reload();
  await expect(page.getByTestId('company-switcher')).toHaveAttribute('data-company-id', MULTI.id);
  await expect(page.getByTestId('financial-context-switcher')).toHaveAttribute('data-year-id', past.id, { timeout: 30_000 });

  const fresh = await context.newPage();
  await fresh.goto('/general-ledger');
  await expect(fresh.getByTestId('company-switcher')).toHaveAttribute('data-company-id', MULTI.id, { timeout: 30_000 });
  await expect(fresh.getByTestId('financial-context-switcher')).toHaveAttribute('data-year-id', current.id, { timeout: 30_000 });
  await fresh.close();
});

test('a company with no financial year says so instead of pretending', async ({ page }) => {
  test.skip(!NO_YEAR, 'every company has a financial year');
  await page.goto('/');
  await switchTo(page, NO_YEAR!.id);
  await expect(page.getByTestId('context-notice')).toContainText(/no financial year/i);
  await expect(page.getByTestId('active-financial-year')).toContainText(/No financial year/);
});

test('signing out forgets the chosen year; signing back in starts at the current year', async ({ page }) => {
  const env = loadE2EEnv();
  const years = yearsByCompany.get(MULTI.id)!;
  const past = years.find((y) => !y.is_current)!;
  const current = years.find((y) => y.is_current)!;
  await page.goto('/');
  await switchTo(page, MULTI.id);
  await selectYear(page, past.id);

  const signOut = page.getByRole('button', { name: /sign out/i }).first();
  if (await signOut.isVisible()) {
    await signOut.click();
  } else {
    await page.getByRole('button', { name: /user avatar|open user menu/i }).first().click().catch(() => undefined);
    await page.getByRole('menuitem', { name: /log out/i }).click();
  }
  await page.waitForURL(/\/auth/, { timeout: 30_000 });
  const leftover = await page.evaluate(() => Object.keys(window.sessionStorage).filter((k) => k.startsWith('adminless.context')));
  expect(leftover).toEqual([]);

  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 60_000 });
  await expect(page.getByTestId('company-switcher')).toHaveAttribute('data-company-id', MULTI.id, { timeout: 30_000 });
  await expect(page.getByTestId('financial-context-switcher')).toHaveAttribute('data-year-id', current.id, { timeout: 30_000 });
});
