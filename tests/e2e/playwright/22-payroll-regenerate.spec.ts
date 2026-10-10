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

test('EMP201: prepare a month and download the filed return', async ({ page }) => {
  // Relies on tests/e2e/run-payroll-emp201-live.ts having filed January 2027 for CERT TX.
  await page.goto('/');
  await waitForRouteSettled(page);
  await ensureReadyCompany(page);
  await page.goto('/statutory-returns');
  await waitForRouteSettled(page);
  await expectNoErrorBoundary(page);
  const panel = page.getByTestId('emp201-panel');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByLabel('Month').fill('2027-01');
  await panel.getByRole('button', { name: 'Prepare EMP201' }).click();
  await expect(panel.getByTestId('emp201-totals')).toContainText('Total payable', { timeout: 60_000 });
  await expect(panel.getByText(/Already filed/)).toBeVisible();
  const history = panel.getByTestId('emp201-history');
  await expect(history).toContainText('202701');
  const row = history.getByRole('row').filter({ hasText: 'Submitted to SARS' }).first();
  const download = page.waitForEvent('download');
  await row.getByRole('button', { name: /CSV/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^EMP201_202701_v\d+\.csv$/);
  const pdf = page.waitForEvent('download');
  await row.getByRole('button', { name: /PDF/ }).click();
  expect((await pdf).suggestedFilename()).toMatch(/^EMP201_202701_v\d+\.pdf$/);
  await shot(page, '09-emp201');
});

test('statutory returns: filing calendar, EMP501 certificates and the e@syFile file', async ({ page }) => {
  // Relies on tests/e2e/run-payroll-statutory-workspace-live.ts having filed the 2026 interim EMP501 for CERT TX.
  await page.goto('/');
  await waitForRouteSettled(page);
  await ensureReadyCompany(page);
  await page.goto('/statutory-returns');
  await waitForRouteSettled(page);
  await expectNoErrorBoundary(page);
  await page.getByRole('combobox', { name: 'Tax year' }).click();
  await page.getByRole('option', { name: 'March 2025 – February 2026' }).click();
  const june = page.getByTestId('statutory-month-2025-06');
  await expect(june).toContainText('Paid', { timeout: 30_000 });
  await expect(june).toContainText('7 Jul 2025');
  await expect(page.getByTestId('statutory-emp501-interim')).toContainText(/To submit|Awaiting approval|Submitted/);

  await page.getByRole('tab', { name: /EMP501/ }).click();
  const panel = page.getByTestId('emp501-panel');
  await panel.getByRole('combobox', { name: 'Reconciliation' }).click();
  await page.getByRole('option', { name: /Interim/ }).click();
  await expect(panel.getByTestId('emp501-history')).toContainText('202508', { timeout: 30_000 });
  await expect(panel.getByTestId('tax-certificates')).toContainText('IT3(a)', { timeout: 30_000 });
  const row = panel.getByTestId('emp501-history').getByRole('row').filter({ hasNotText: 'Replaced' }).filter({ hasText: '202508' }).first();
  const easyFile = page.waitForEvent('download');
  await row.getByRole('button', { name: /e@syFile \(test\)/ }).click();
  expect((await easyFile).suggestedFilename()).toMatch(/^EMP501_\d{10}_202508_Interim_TEST\.csv$/);
  const pdf = page.waitForEvent('download');
  await panel.getByRole('button', { name: /All certificates/ }).click();
  expect((await pdf).suggestedFilename()).toMatch(/^Certificates_202508_v\d+\.pdf$/);

  await panel.getByRole('button', { name: 'Reconcile' }).click();
  await expect(panel.getByTestId('emp501-reconciliation')).toContainText('2025-06', { timeout: 60_000 });
  await shot(page, '10-emp501');
});

test('leave: BCEA balances, an employee register and recording leave', async ({ page }) => {
  // Relies on tests/e2e/run-payroll-leave-live.ts having created "Keeper Leave …" for CERT TX.
  await page.goto('/');
  await waitForRouteSettled(page);
  await ensureReadyCompany(page);
  await page.goto('/leave');
  await waitForRouteSettled(page);
  await expectNoErrorBoundary(page);
  await page.getByLabel('Balances as at').fill('2025-10-31');
  await page.getByLabel('Search employees').fill('Keeper Leave');
  const table = page.getByTestId('leave-balances');
  await expect(table).toContainText('Keeper Leave', { timeout: 30_000 });
  await table.getByRole('button', { name: /Leave for Keeper Leave/ }).first().click();
  const sheet = page.getByTestId('employee-leave');
  await expect(sheet.getByTestId('leave-balance-sick')).toContainText('days', { timeout: 30_000 });
  await expect(sheet.getByTestId('leave-balance-annual')).toContainText('days');
  await expect(sheet).toContainText('Leave taken');
  await expect(sheet).toContainText('Two days granted for long service');
  await sheet.getByRole('button', { name: 'Record leave' }).click();
  const dialog = page.getByTestId('record-leave-dialog');
  await dialog.getByRole('combobox', { name: 'Leave type' }).click();
  await page.getByRole('option', { name: 'Family responsibility leave' }).click();
  await dialog.getByLabel('First day').fill('2025-12-13');
  await dialog.getByLabel('Last day').fill('2025-12-14');
  await expect(dialog).toContainText('0 working days');
  await dialog.getByTestId('save-leave').click();
  await expect(page.getByText(/no working days/)).toBeVisible({ timeout: 20_000 });
  await shot(page, '11-leave');
  // Close the dialog, then the employee drawer.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.getByRole('tab', { name: 'Leave types' }).click();
  await expect(page.getByText('BCEA s22: 6 weeks per 36 months')).toBeVisible();
});

test('hourly and casual workers: employee tabs and the run timesheet (days or hours × rate)', async ({ page }) => {
  // Relies on tests/e2e/run-payroll-time-live.ts having created weekly "Time …" employees for
  // December 2026 and recorded the week of 21 December on the attendance register.
  const env = loadE2EEnv();
  const sb = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: env.email, password: env.password });
  const { data: company } = await sb.from('companies').select('id').eq('name', READY_COMPANY).single();
  const companyId = company!.id as string;
  const run = await call<{ id: string }>(sb, {
    method: 'CREATE_RUN', company_id: companyId, additional_run: true,
    runData: { pay_period_start: '2026-12-21', pay_period_end: '2026-12-27', pay_date: '2026-12-27', pay_frequency: 'weekly' },
  });
  try {
    await page.goto('/');
    await waitForRouteSettled(page);
    await ensureReadyCompany(page);
    await page.goto('/employees');
    await waitForRouteSettled(page);
    await page.getByRole('tab', { name: /Hourly & daily/ }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Hourly Time' }).first()).toContainText('/ hour', { timeout: 30_000 });
    await page.getByRole('tab', { name: /Casual/ }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Daily Time' }).first()).toContainText('Tax 25%');

    await page.goto(`/payroll-runs/${run.id}`);
    await waitForRouteSettled(page);
    const panel = page.getByTestId('timesheet-panel');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByRole('columnheader', { name: 'Days / hours' })).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByText(/Overtime|Sunday|Public holiday/)).toHaveCount(0);

    // Fill from attendance: the latest daily test worker has 3.5 days that week (R250 a day).
    await panel.getByTestId('fill-from-attendance').click();
    await expect(page.getByText(/Filled from attendance/)).toBeVisible({ timeout: 60_000 });
    const dailyRow = panel.getByRole('row').filter({ has: page.locator('input[aria-label^="Days worked by Daily Time"][value="3.5"]') }).first();
    const dailyInput = dailyRow.locator('input[aria-label^="Days worked by Daily Time"]');
    await expect(dailyInput).toBeVisible({ timeout: 30_000 });
    await expect(dailyRow).toContainText(/875[,.]00/);
    // The same run's hourly worker (R50 an hour): the total is its hours × R50.
    const suffix = (await dailyInput.getAttribute('aria-label'))!.replace('Days worked by Daily Time ', '');
    const hoursInput = panel.getByLabel(`Hours worked by Hourly Time ${suffix}`);
    const hourlyRow = panel.getByRole('row').filter({ has: page.getByLabel(`Hours worked by Hourly Time ${suffix}`) });
    const hours = Number(await hoursInput.inputValue());
    expect(hours).toBeGreaterThan(0);
    await expect(hourlyRow).toContainText(new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2 }).format(hours * 50).replace(/\s/g, '').slice(-6));

    // Typing a figure shows the total at once; saving updates the payslips.
    await hourlyRow.getByLabel(/^Hours worked by Hourly Time/).fill('24');
    await expect(hourlyRow).toContainText(/1[\s ]?200[,.]00/);
    await panel.getByTestId('save-timesheet').click();
    await expect(page.getByText(/Timesheet saved and payslips updated/)).toBeVisible({ timeout: 60_000 });
    // The payslip list shows the new pay without pressing "Regenerate".
    const payslipRow = page.getByRole('row').filter({ hasText: `Hourly Time ${suffix}` }).filter({ hasText: 'Certification' });
    await expect(payslipRow).toContainText(/1[\s ]?200[,.]00/, { timeout: 30_000 });
    await shot(page, '12-timesheet');
  } finally {
    await call(sb, { method: 'DISCARD_RUN', company_id: companyId, runId: run.id }).catch(() => undefined);
  }
});

test('attendance: ticked days for daily-paid, hours for hourly-paid; payroll rules', async ({ page }) => {
  // Relies on tests/e2e/run-payroll-time-live.ts having recorded the week of 21 December 2026.
  await page.goto('/');
  await waitForRouteSettled(page);
  await ensureReadyCompany(page);
  await page.goto('/attendance');
  await waitForRouteSettled(page);
  await expectNoErrorBoundary(page);
  await page.getByLabel('Week of').fill('2026-12-21');
  const grid = page.getByTestId('attendance-grid');
  await expect(grid).toContainText('Public holiday', { timeout: 30_000 });
  // Christmas Day: 6 hours for the hourly worker; a half day and a Saturday for the daily worker.
  await expect(grid.locator('input[aria-label^="Hourly Time"][aria-label$="hours on 2026-12-25"][value="6"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(grid.getByRole('button', { name: /^Daily Time \w+ on 2026-12-22: half day$/ }).first()).toBeVisible();
  await expect(grid.getByRole('button', { name: /^Daily Time \w+ on 2026-12-26: full day$/ }).first()).toBeVisible();
  const dailyRow = grid.getByRole('row').filter({ has: page.getByRole('button', { name: /^Daily Time \w+ on 2026-12-22: half day$/ }) }).first();
  await expect(dailyRow).toContainText('3.5 days');
  await expect(dailyRow).toContainText(/875[,.]00/);
  // A click cycles a day: not worked → full day → half day → not worked.
  const wednesday = dailyRow.getByRole('button', { name: /on 2026-12-23: not worked$/ });
  await wednesday.click();
  await expect(dailyRow.getByRole('button', { name: /on 2026-12-23: full day$/ })).toBeVisible();
  await expect(dailyRow).toContainText('4.5 days');
  await expect(page.getByTestId('save-attendance')).toContainText('(1)');
  await dailyRow.getByRole('button', { name: /on 2026-12-23: full day$/ }).click();
  await dailyRow.getByRole('button', { name: /on 2026-12-23: half day$/ }).click();
  await expect(page.getByTestId('save-attendance')).toBeDisabled();
  await shot(page, '13-attendance');

  await page.goto('/settings');
  await waitForRouteSettled(page);
  await page.getByRole('tab', { name: /payroll/i }).click();
  const rules = page.getByTestId('pay-rules');
  await expect(rules).toBeVisible({ timeout: 30_000 });
  await expect(rules).toContainText('days × daily rate');
  await expect(rules.getByLabel('Overtime')).toHaveCount(0);
});

test('bank payment files, UIF declaration and COIDA return of earnings', async ({ page }) => {
  // Relies on tests/e2e/run-payroll-phase5-live.ts (bank profiles) and the finalised June 2025 fortnightly run.
  const env = loadE2EEnv();
  const sb = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: env.email, password: env.password });
  const { data: company } = await sb.from('companies').select('id').eq('name', READY_COMPANY).single();
  const runs = await call<Array<{ id: string; status: string; pay_period_start: string; output_metadata: { reversed_at?: string; processed_at?: string } | null }>>(sb, { method: 'GET_RUNS', company_id: company!.id });
  const run = runs.find((r) => r.pay_period_start === '2025-06-02' && r.status === 'finalized'
    && !(r.output_metadata?.reversed_at && (!r.output_metadata.processed_at || r.output_metadata.processed_at <= r.output_metadata.reversed_at)));
  expect(run, 'finalised June 2025 fortnightly run').toBeTruthy();

  await page.goto('/');
  await waitForRouteSettled(page);
  await ensureReadyCompany(page);
  await page.goto('/settings');
  await waitForRouteSettled(page);
  await page.getByRole('tab', { name: /payroll/i }).click();
  await expect(page.getByTestId('bank-profiles')).toContainText('CERT TX ACB', { timeout: 30_000 });

  await page.goto(`/payroll-runs/${run!.id}`);
  await waitForRouteSettled(page);
  await expectNoErrorBoundary(page);
  const card = page.getByTestId('bank-payment-file');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole('combobox', { name: 'Bank profile' }).click();
  await page.getByRole('option', { name: 'CERT TX FNB CSV' }).first().click();
  await card.getByLabel('Payment date').fill('2025-06-13');
  const bankFile = page.waitForEvent('download');
  await card.getByTestId('download-bank-payment-file').click();
  expect((await bankFile).suggestedFilename()).toMatch(/\.csv$/i);
  await expect(card.getByTestId('bank-file-result')).toContainText(/payments? ·/, { timeout: 30_000 });
  await shot(page, '14-bank-file');

  await page.goto('/statutory-returns');
  await waitForRouteSettled(page);
  await page.getByRole('tab', { name: 'UIF declaration' }).click();
  const uif = page.getByTestId('uif-declaration-panel');
  await uif.getByLabel('Month').fill('2025-06');
  await uif.getByRole('button', { name: 'Prepare declaration' }).click();
  await expect(uif.getByTestId('uif-lines')).toBeVisible({ timeout: 60_000 });
  // CERT TX has no UIF reference with the Department (the harness restores the profile): the file
  // waits for it, the register does not. The E03 file itself is checked by run-payroll-phase5-live.ts.
  await expect(uif.getByText(/Add the UIF reference number/)).toBeVisible();
  await expect(uif.getByRole('button', { name: 'Test file' })).toBeDisabled();
  const register = page.waitForEvent('download');
  await uif.getByRole('button', { name: /Register/ }).click();
  expect((await register).suggestedFilename()).toBe('UIF_register_2025-06.csv');
  await shot(page, '15-uif-declaration');

  await page.getByRole('tab', { name: 'COIDA return of earnings' }).click();
  const coida = page.getByTestId('coida-panel');
  await coida.getByRole('combobox', { name: 'Assessment year' }).click();
  await page.getByRole('option', { name: 'March 2025 – February 2026' }).click();
  await coida.getByRole('button', { name: 'Prepare return of earnings' }).click();
  await expect(coida.getByTestId('coida-summary')).toContainText('633', { timeout: 60_000 });
  const report = page.waitForEvent('download');
  await coida.getByRole('button', { name: /Payroll report/ }).click();
  expect((await report).suggestedFilename()).toMatch(/\.pdf$/i);
  await shot(page, '16-coida');
});

test('payroll accounts: each journal line has its account, classified for the statements', async ({ page }) => {
  await page.goto('/');
  await waitForRouteSettled(page);
  await ensureReadyCompany(page);
  await page.goto('/settings');
  await waitForRouteSettled(page);
  await page.getByRole('tab', { name: /payroll/i }).click();
  const card = page.getByTestId('payroll-accounts');
  await expect(card).toBeVisible({ timeout: 30_000 });
  for (const role of ['salary_expense', 'paye_control', 'uif_control', 'sdl_control', 'bank']) {
    await expect(card.getByTestId(`payroll-account-${role}`)).toBeVisible();
  }
  await expect(card).toContainText('PAYE payable');
  await expect(card.getByTestId('save-payroll-accounts')).toBeDisabled();
  await shot(page, '17-payroll-accounts');
});
