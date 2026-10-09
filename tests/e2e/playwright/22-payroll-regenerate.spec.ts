import path from 'node:path';
import fs from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import { test, expect, waitForRouteSettled, expectNoErrorBoundary } from './fixtures';
import { loadE2EEnv } from './env';

/**
 * A payroll run that has been generated and approved can still be corrected:
 * add an allowance as a period input, regenerate, and the approval is withdrawn
 * so the new figures must be approved again. CERT TX demo company only.
 */

const READY_COMPANY = 'CERT TX 1785230675937';
const SHOTS = path.join(process.cwd(), 'test-results', 'payroll-regenerate');

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function ensureReadyCompany(page: Page) {
  const trigger = page.getByTestId('company-switcher');
  await expect(trigger).toBeEnabled({ timeout: 30_000 });
  const label = (await trigger.innerText().catch(() => '')) ?? '';
  if (label.includes(READY_COMPANY)) return;
  await trigger.click();
  const item = page.locator('[data-testid="company-option"]').filter({ hasText: READY_COMPANY }).first();
  await expect(item).toBeVisible({ timeout: 20_000 });
  await item.click();
  await expect(trigger).toHaveAttribute('data-switching', 'false', { timeout: 45_000 });
}

async function call<T>(sb: SupabaseClient, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke('payroll', { body });
  if (error) throw new Error(`${body.method}: ${error.message}`);
  if (data && typeof data === 'object' && 'error' in data) throw new Error(`${body.method}: ${String((data as { error: unknown }).error)}`);
  return data as T;
}

/** Reads "R 123 000,00" (en-ZA) or "R123,000.00". */
const money = (text: string) => {
  const t = text.replace(/[^0-9,.-]/g, '');
  return /,\d{2}$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(/,/g, ''));
};

test('an approved run can take a late allowance: regenerate withdraws approval', async ({ page }) => {
  // Arrange through the API: a generated, approved draft run.
  const env = loadE2EEnv();
  const sb = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
  const auth = await sb.auth.signInWithPassword({ email: env.email, password: env.password });
  expect(auth.error).toBeNull();
  const { data: company } = await sb.from('companies').select('id').eq('name', READY_COMPANY).single();
  const companyId = company!.id as string;

  const month = new Date();
  month.setMonth(month.getMonth() + 2);
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const run = await call<{ id: string }>(sb, {
    method: 'CREATE_RUN', company_id: companyId,
    runData: { pay_period_start: iso(start), pay_period_end: iso(end), pay_date: iso(end) },
    additional_run: true,
  });
  await call(sb, { method: 'GENERATE_PAYSLIPS', company_id: companyId, runId: run.id });
  await call(sb, { method: 'APPROVE_RUN', company_id: companyId, runId: run.id });
  const detail = await call<{ payslips: Array<{ employee_id: string; total_earnings: number; employees: { first_name: string; last_name: string } }> }>(
    sb, { method: 'GET_RUN_DETAIL', company_id: companyId, runId: run.id });
  // A run input replaces a standing package amount for the same component, so pick an
  // employee without a standing travel allowance: then the R3 000 adds to gross.
  const { data: withTravel } = await sb.from('employee_pay_components')
    .select('employee_id').eq('company_id', companyId).eq('component_code', 'travel_allowance').eq('active', true);
  const packaged = new Set((withTravel ?? []).map((r) => r.employee_id as string));
  const target = detail.payslips.find((p) => !packaged.has(p.employee_id))!;
  expect(target).toBeTruthy();
  const name = `${target.employees.first_name} ${target.employees.last_name}`;
  const grossBefore = detail.payslips.reduce((s, p) => s + Number(p.total_earnings), 0);

  // Act through the UI.
  await page.goto('/');
  await waitForRouteSettled(page);
  await ensureReadyCompany(page);
  await page.goto(`/payroll-runs/${run.id}`);
  await waitForRouteSettled(page);
  await expectNoErrorBoundary(page);
  await expect(page.getByText('Step 4: Process Payroll & Post Journal')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('regenerate-payslips')).toBeVisible();

  // Add a travel allowance for this run.
  const inputs = page.locator('div.rounded-lg, div[class*="card"]').filter({ hasText: 'Period inputs' }).first();
  await inputs.getByRole('combobox').first().click();
  await page.getByRole('option', { name }).first().click();
  await inputs.getByRole('spinbutton').first().fill('3000');
  await inputs.getByRole('button', { name: 'Save for this run' }).click();
  await expect(page.getByText('Period input saved. Regenerate payslips to apply it.')).toBeVisible({ timeout: 20_000 });
  await shot(page, '01-approved-with-late-input');

  // Regenerate: confirm that approval will be withdrawn.
  await page.getByTestId('regenerate-payslips').click();
  await expect(page.getByRole('alertdialog')).toContainText('approval is withdrawn');
  await shot(page, '02-confirm');
  await page.getByTestId('confirm-regenerate').click();
  await expect(page.getByText(/Payslips regenerated\. The approval was withdrawn/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Approve Payroll Run' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Step 4: Process Payroll & Post Journal')).toHaveCount(0);

  const grossText = await page.getByText(/^Gross: /).first().innerText();
  expect(money(grossText)).toBeCloseTo(grossBefore + 3000, 2);
  await shot(page, '03-regenerated-needs-approval');

  const after = await call<{ run: { approved_at: string | null } }>(sb, { method: 'GET_RUN_DETAIL', company_id: companyId, runId: run.id });
  expect(after.run.approved_at).toBeNull();

  // The test run was never processed: discard it through the UI so nothing is left behind.
  await page.getByTestId('discard-run').click();
  await expect(page.getByRole('alertdialog')).toContainText('Nothing has been posted');
  await page.getByTestId('confirm-discard').click();
  await expect(page).toHaveURL(/\/payroll-runs$/, { timeout: 30_000 });
  const { data: left } = await sb.from('payroll_runs').select('id').eq('id', run.id);
  expect(left ?? []).toHaveLength(0);
});

test('a weekly run is chosen in the new-run dialog with a one-week period', async ({ page }) => {
  await page.goto('/');
  await waitForRouteSettled(page);
  await ensureReadyCompany(page);
  await page.goto('/payroll-runs');
  await waitForRouteSettled(page);
  await expectNoErrorBoundary(page);
  await page.getByRole('button', { name: /new payroll run/i }).first().click();
  await expect(page.getByRole('heading', { name: /start new payroll run/i })).toBeVisible();
  await page.getByLabel('Period Start Date').fill('2027-02-01');
  await page.getByRole('combobox', { name: 'Pay frequency' }).click();
  await page.getByRole('option', { name: 'Weekly' }).click();
  await expect(page.getByLabel('Period End Date')).toHaveValue('2027-02-07');
  await expect(page.getByLabel('Pay Date')).toHaveValue('2027-02-07');
  await page.getByRole('combobox', { name: 'Pay frequency' }).click();
  await page.getByRole('option', { name: 'Fortnightly' }).click();
  await expect(page.getByLabel('Period End Date')).toHaveValue('2027-02-14');
  await shot(page, '04-weekly-run-dialog');
  await page.getByRole('button', { name: 'Cancel' }).click();
});

test('the person who prepared a run cannot approve it unless the owner allows self-approval', async ({ page }) => {
  const env = loadE2EEnv();
  const sb = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
  const auth = await sb.auth.signInWithPassword({ email: env.email, password: env.password });
  expect(auth.error).toBeNull();
  const { data: company } = await sb.from('companies').select('id').eq('name', READY_COMPANY).single();
  const companyId = company!.id as string;
  const original = await call<{ allow_self_approval: boolean; self_approval_reason: string | null }>(sb, { method: 'GET_PAYROLL_CONTROLS', company_id: companyId });

  const month = new Date();
  month.setMonth(month.getMonth() + 3);
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const run = await call<{ id: string }>(sb, {
    method: 'CREATE_RUN', company_id: companyId, additional_run: true,
    runData: { pay_period_start: iso(start), pay_period_end: iso(end), pay_date: iso(end) },
  });
  try {
    await call(sb, { method: 'UPDATE_PAYROLL_CONTROLS', company_id: companyId, allow_self_approval: false });
    await call(sb, { method: 'GENERATE_PAYSLIPS', company_id: companyId, runId: run.id });

    await page.goto('/');
    await waitForRouteSettled(page);
    await ensureReadyCompany(page);
    await page.goto(`/payroll-runs/${run.id}`);
    await waitForRouteSettled(page);
    await expectNoErrorBoundary(page);
    await expect(page.getByTestId('self-approval-blocked')).toContainText('another owner or admin must approve', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Approve Payroll Run' })).toBeDisabled();
    await shot(page, '05-self-approval-blocked');

    // The owner allows self-approval (with a reason) in Settings → Payroll.
    await page.goto('/settings');
    await waitForRouteSettled(page);
    await page.getByRole('tab', { name: /payroll/i }).click();
    const card = page.getByTestId('payroll-approval-controls');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole('switch').click();
    await card.getByLabel('Reason').fill('CERT TX: single test user runs payroll');
    await card.getByRole('button', { name: 'Save Approval Setting' }).click();
    await expect(page.getByText(/Self-approval allowed/)).toBeVisible({ timeout: 30_000 });
    await shot(page, '06-self-approval-allowed');

    await page.goto(`/payroll-runs/${run.id}`);
    await waitForRouteSettled(page);
    await expect(page.getByText('Approving it will be recorded as a self-approval')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Approve Payroll Run' })).toBeEnabled();
  } finally {
    await call(sb, { method: 'DISCARD_RUN', company_id: companyId, runId: run.id }).catch(() => undefined);
    await call(sb, {
      method: 'UPDATE_PAYROLL_CONTROLS', company_id: companyId,
      allow_self_approval: original.allow_self_approval, reason: original.self_approval_reason ?? undefined,
    });
  }
});

test('fixing an employee\'s SARS details clears the run warning without regenerating', async ({ page }) => {
  const env = loadE2EEnv();
  const sb = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
  const auth = await sb.auth.signInWithPassword({ email: env.email, password: env.password });
  expect(auth.error).toBeNull();
  const { data: company } = await sb.from('companies').select('id').eq('name', READY_COMPANY).single();
  const companyId = company!.id as string;

  const stamp = Date.now().toString().slice(-6);
  const month = new Date();
  month.setMonth(month.getMonth() + 4);
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const last = `SarsFix${stamp}`;
  const { data: created, error: createError } = await sb.functions.invoke('employees', { body: {
    method: 'POST', company_id: companyId, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(),
    employeeData: {
      first_name: 'Warn', last_name: last, employment_type: 'permanent', start_date: iso(start), end_date: iso(end),
      salary_amount: 18_000, salary_period: 'monthly', tax_number: '0001339050', id_number: '8601015800086',
    },
  } });
  expect(createError).toBeNull();
  const employeeId = (created as { id: string }).id;
  const run = await call<{ id: string }>(sb, {
    method: 'CREATE_RUN', company_id: companyId, additional_run: true,
    runData: { pay_period_start: iso(start), pay_period_end: iso(end), pay_date: iso(end) },
  });
  try {
    await call(sb, { method: 'GENERATE_PAYSLIPS', company_id: companyId, runId: run.id });

    await page.goto('/');
    await waitForRouteSettled(page);
    await ensureReadyCompany(page);
    await page.goto(`/payroll-runs/${run.id}`);
    await waitForRouteSettled(page);
    const warnings = page.getByTestId('run-generation-warnings');
    await warnings.locator('summary').click();
    await expect(warnings).toContainText(`Warn ${last}'s residential address is incomplete`, { timeout: 30_000 });

    // Fix the employee in the app (in-app navigation, so the run page's cached data is reused).
    await page.getByRole('link', { name: 'Employees' }).first().click();
    await waitForRouteSettled(page);
    const row = page.getByRole('row').filter({ hasText: last });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole('button').last().click();
    await page.getByRole('menuitem', { name: /^edit$/i }).click();
    await page.getByLabel('Street Number').fill('5');
    await page.getByLabel('Street or Farm Name').fill('Long Street');
    await page.getByLabel('City or Town').fill('Cape Town');
    await page.getByLabel('Postal Code', { exact: true }).fill('8001');
    await page.getByRole('button', { name: /save employee/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 20_000 });

    await page.goBack();
    await waitForRouteSettled(page);
    await expect(page.getByText('Step 3: Approve Payroll')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`Warn ${last}'s residential address is incomplete`)).toHaveCount(0, { timeout: 30_000 });
    await shot(page, '07-warning-cleared-after-fix');
  } finally {
    await call(sb, { method: 'DISCARD_RUN', company_id: companyId, runId: run.id }).catch(() => undefined);
    await sb.functions.invoke('employees', { body: { method: 'DELETE', company_id: companyId, employeeId, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID() } });
  }
});

test('employer details for SARS are checked with the SARS rules as you type', async ({ page }) => {
  await page.goto('/');
  await waitForRouteSettled(page);
  await ensureReadyCompany(page);
  await page.goto('/settings');
  await waitForRouteSettled(page);
  await page.getByRole('tab', { name: /payroll/i }).click();
  const card = page.getByTestId('employer-profile');
  await expect(card).toBeVisible({ timeout: 30_000 });
  const paye = card.getByLabel('PAYE Reference Number');
  const original = await paye.inputValue();
  await paye.fill('7230767892');
  await expect(card.getByText(/Not a valid PAYE reference/)).toBeVisible();
  await paye.fill('7230767891');
  await expect(card.getByText(/Not a valid PAYE reference/)).toHaveCount(0);
  await card.getByLabel('Postal Code').fill('0000');
  await expect(card.getByText('Postal code must be 4 digits and not 0000.')).toBeVisible();
  await shot(page, '08-employer-profile-validation');
  // Nothing is saved: reload discards the edits.
  await page.reload();
  await waitForRouteSettled(page);
  await page.getByRole('tab', { name: /payroll/i }).click();
  await expect(page.getByTestId('employer-profile').getByLabel('PAYE Reference Number')).toHaveValue(original, { timeout: 30_000 });
});
