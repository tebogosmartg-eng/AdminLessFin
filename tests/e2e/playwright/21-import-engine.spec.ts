import path from 'node:path';
import fs from 'node:fs';
import writeXlsxFile from 'write-excel-file/node';
import { createClient } from '@supabase/supabase-js';
import { test, expect, waitForRouteSettled, expectNoErrorBoundary } from './fixtures';
import { loadE2EEnv } from './env';
import type { Page } from '@playwright/test';

/**
 * Central Import Engine — the real workflow, end to end, through the UI:
 * choose a type → upload (CSV and Excel) → match columns → review → import →
 * results and ledger reconciliation → history. Writes to the
 * accounting-complete demo company the other write specs pin, with unique
 * names per run. Screenshots land in test-results/import-engine/.
 */

const READY_COMPANY = 'CERT TX 1785230675937';
const STAMP = Date.now().toString().slice(-7);
const SHOTS = path.join(process.cwd(), 'test-results', 'import-engine');
const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

const CUSTOMER_A = `Import QA ${STAMP} Alpha`;
const CUSTOMER_B = `Import QA ${STAMP} Beta`;
const INVOICE = `IMP-${STAMP}`;

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

async function openImport(page: Page) {
  await page.goto('/');
  await waitForRouteSettled(page);
  await ensureReadyCompany(page);
  await page.goto('/import');
  await waitForRouteSettled(page);
  await expectNoErrorBoundary(page);
  await expect(page.getByRole('heading', { name: 'Import data' })).toBeVisible({ timeout: 30_000 });
}

function csv(rows: string[][]): Buffer {
  return Buffer.from(rows.map(r => r.map(c => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n'), 'utf8');
}

async function upload(page: Page, name: string, buffer: Buffer, mimeType: string) {
  await page.getByTestId('import-file-input').setInputFiles({ name, mimeType, buffer });
  await expect(page.getByTestId('import-mapping')).toBeVisible({ timeout: 30_000 });
}

async function checkAndReview(page: Page) {
  await page.getByTestId('import-check').click();
  await expect(page.getByTestId('import-review-summary')).toBeVisible({ timeout: 90_000 });
}

async function commitAndWait(page: Page) {
  await page.getByTestId('import-commit').click();
  await expect(page.getByTestId('import-result-summary')).toBeVisible({ timeout: 120_000 });
}

async function chooseOption(page: Page, triggerId: string, option: string | RegExp) {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole('option', { name: option }).first().click();
}

test.describe('Import engine — real workflow', () => {
  test('1. customers: auto-mapped CSV, a duplicate is skipped, history records it', async ({ page, diagnostics }) => {
    await openImport(page);
    await expect(page.getByTestId('import-type-customers')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('import-history')).toBeVisible({ timeout: 30_000 });
    await shot(page, '01-landing');
    await page.getByTestId('import-type-customers').click();
    await expect(page.getByRole('heading', { name: 'Import customers' })).toBeVisible();

    await upload(page, `customers-${STAMP}.csv`, csv([
      ['Customer Name', 'Email Address', 'Phone', 'VAT Number', 'Terms'],
      [CUSTOMER_A, `alpha${STAMP}@example.co.za`, '011 555 0100', '4123456789', '30'],
      [CUSTOMER_B, '', '', '', '14'],
      [CUSTOMER_A, '', '', '', ''],
      ['Bad Email Co ' + STAMP, 'not-an-email', '', '', ''],
    ]), 'text/csv');

    // Intelligent matching picked every column.
    await expect(page.getByTestId('map-name')).toContainText('Customer Name');
    await expect(page.getByTestId('map-email')).toContainText('Email Address');
    await expect(page.getByTestId('map-tax_id')).toContainText('VAT Number');
    await expect(page.getByTestId('map-payment_terms')).toContainText('Terms');
    await shot(page, '02-customers-mapping');

    await checkAndReview(page);
    const summary = page.getByTestId('import-review-summary');
    await expect(summary).toContainText('4 rows checked');
    await expect(summary).toContainText("2 can't be imported");
    const rows = page.getByTestId('import-review-rows');
    await expect(rows).toContainText('also appears on row 2');
    await expect(rows).toContainText('is not a valid email address');
    await shot(page, '03-customers-review');

    // Import blocked until the user chooses to leave the bad rows out.
    await expect(page.getByTestId('import-commit')).toBeDisabled();
    await page.getByLabel(/Import the 2 good rows/).check();
    await expect(page.getByTestId('import-commit')).toBeEnabled();
    await commitAndWait(page);
    await expect(page.getByTestId('import-result-summary')).toContainText('2 imported');
    await expect(page.getByTestId('import-result-summary')).toContainText('2 skipped');
    await shot(page, '04-customers-result');

    await page.getByRole('button', { name: 'Done' }).click();
    // This run's own row: what, when, by whom, and the outcome.
    const historyRow = page.getByTestId('import-history').getByRole('row').filter({ hasText: `customers-${STAMP}.csv` });
    await expect(historyRow).toHaveCount(1, { timeout: 30_000 });
    await expect(historyRow).toContainText('Imported');
    await expect(historyRow).toContainText('2 imported, 2 skipped');
    await expect(historyRow).toContainText('EFS Certification Board');
    await shot(page, '05-history');
    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
  });

  test('2. invoices: Xero-style Excel file with VAT posts through the engine and reconciles', async ({ page, diagnostics }) => {
    await openImport(page);
    await page.getByTestId('import-type-invoices').click();

    // A real Excel date cell (not text), as accounting exports produce.
    const xlDate = { value: new Date(`${TODAY}T00:00:00Z`), format: 'dd/mm/yyyy' };
    const buffer = await writeXlsxFile([
      ['*InvoiceNumber', '*ContactName', '*InvoiceDate', '*DueDate', 'Description', '*Quantity', '*UnitAmount', '*AccountCode', '*TaxType'],
      [INVOICE, CUSTOMER_A, xlDate, xlDate, 'Consulting', 10, 950, 'Sales Revenue', '15'],
      [INVOICE, CUSTOMER_A, xlDate, xlDate, 'Travel recovery', 1, 1200, 'Sales Revenue', '15%'],
    ]).toBuffer();
    await upload(page, `invoices-${STAMP}.xlsx`, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await expect(page.getByTestId('map-invoice_number')).toContainText('*InvoiceNumber');
    await expect(page.getByTestId('map-customer')).toContainText('*ContactName');
    await expect(page.getByTestId('map-unit_price')).toContainText('*UnitAmount');
    await expect(page.getByTestId('map-tax_rate')).toContainText('*TaxType');
    await shot(page, '06-invoices-mapping');

    await checkAndReview(page);
    await expect(page.getByTestId('import-review-summary')).toContainText('2 ready');
    await shot(page, '07-invoices-review');
    await commitAndWait(page);
    await expect(page.getByTestId('import-result-summary')).toContainText('2 imported');
    const recon = page.getByTestId('import-reconciliation');
    await expect(recon).toContainText('Ledger check passed', { timeout: 30_000 });
    await expect(recon).toContainText('1 journal posted for R');
    await shot(page, '08-invoices-result');

    // The invoice exists in the real invoices list.
    await page.getByRole('link', { name: 'Go to invoices' }).click();
    await waitForRouteSettled(page);
    await expect(page.getByText(INVOICE).first()).toBeVisible({ timeout: 30_000 });
    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
  });

  test('3. customer payment allocated to the imported invoice', async ({ page, diagnostics }) => {
    await openImport(page);
    await page.getByTestId('import-type-customer_payments').click();
    await upload(page, `receipts-${STAMP}.csv`, csv([
      ['Date', 'Customer', 'Amount', 'Bank Account', 'Invoice No', 'Reference'],
      [TODAY, CUSTOMER_A, '12305.00', 'CERT Bank Account', INVOICE, `EFT ${STAMP}`],
      [TODAY, CUSTOMER_B, '500', 'Sales Revenue', '', ''],
    ]), 'text/csv');
    await checkAndReview(page);
    const rows = page.getByTestId('import-review-rows');
    await expect(rows).toContainText('the money account must be a bank or cash (Asset) account');
    await page.getByLabel(/Import the 1 good rows/).check();
    await shot(page, '09-payments-review');
    await commitAndWait(page);
    await expect(page.getByTestId('import-result-summary')).toContainText('1 imported');
    await expect(page.getByTestId('import-reconciliation')).toContainText('Ledger check passed', { timeout: 30_000 });
    await shot(page, '10-payments-result');
    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
  });

  test('4. journals: an unbalanced journal is refused whole, the good one posts, problem rows download', async ({ page, diagnostics }) => {
    await openImport(page);
    await page.getByTestId('import-type-journal_entries').click();
    await upload(page, `journals-${STAMP}.csv`, csv([
      ['Reference', 'Date', 'Description', 'Account', 'Debit', 'Credit'],
      [`J-${STAMP}-1`, TODAY, `Import QA accrual ${STAMP}`, 'CERT Operating Expenses', '1250.00', ''],
      [`J-${STAMP}-1`, TODAY, `Import QA accrual ${STAMP}`, 'CERT Payroll Liabilities', '', '1250.00'],
      [`J-${STAMP}-2`, TODAY, `Import QA broken ${STAMP}`, 'CERT Operating Expenses', '100', ''],
      [`J-${STAMP}-2`, TODAY, `Import QA broken ${STAMP}`, 'CERT Payroll Liabilities', '', '90'],
    ]), 'text/csv');
    await checkAndReview(page);
    await expect(page.getByTestId('import-review-rows')).toContainText('This journal does not balance');
    await shot(page, '11-journals-review');

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('button', { name: 'Download problem rows' }).click(),
    ]);
    const report = fs.readFileSync(await download.path(), 'utf8');
    expect(report).toContain('does not balance');
    expect(report).toContain(`J-${STAMP}-2`);

    await page.getByLabel(/Import the 2 good rows/).check();
    await commitAndWait(page);
    await expect(page.getByTestId('import-result-summary')).toContainText('2 imported');
    const recon = page.getByTestId('import-reconciliation');
    await expect(recon).toContainText('every account matches your file', { timeout: 30_000 });
    await shot(page, '12-journals-result');
    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
  });

  test('5. bank statement: money in/out columns; re-importing the same file adds nothing', async ({ page, diagnostics }) => {
    const statement = csv([
      ['Statement for CERT Cheque Account'],
      [],
      ['Transaction Date', 'Details', 'Money In', 'Money Out', 'Reference'],
      [TODAY, `Deposit ${STAMP}`, '5000.00', '', `R${STAMP}1`],
      [TODAY, `Bank fees ${STAMP}`, '', '45.50', ''],
    ]);
    for (const attempt of [1, 2]) {
      await openImport(page);
      await page.getByTestId('import-type-bank_transactions').click();
      await chooseOption(page, 'import-bank-account', 'CERT Cheque Account');
      await upload(page, `statement-${STAMP}.csv`, statement, 'text/csv');
      await expect(page.getByTestId('map-money_in')).toContainText('Money In');
      await expect(page.getByTestId('map-money_out')).toContainText('Money Out');
      await checkAndReview(page);
      if (attempt === 1) {
        await shot(page, '13-bank-review');
        await commitAndWait(page);
        await expect(page.getByTestId('import-result-summary')).toContainText('2 imported');
        await shot(page, '14-bank-result');
      } else {
        await expect(page.getByText(/This exact file was already imported/)).toBeVisible();
        await expect(page.getByTestId('import-review-rows')).toContainText('imported before');
        await shot(page, '15-bank-reimport');
        await commitAndWait(page);
        await expect(page.getByTestId('import-result-summary')).toContainText('0 imported');
        await expect(page.getByTestId('import-result-summary')).toContainText('2 skipped');
      }
    }
    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
  });

  test('6. opening balances: the posting engine refuses system-controlled accounts before anything is written', async ({ page, diagnostics }) => {
    await openImport(page);
    await page.getByTestId('import-type-opening_balances').click();
    await expect(page.getByRole('button', { name: 'Browse' })).toBeDisabled();
    await page.locator('#import-as-at').fill('2025-12-31');
    await upload(page, `opening-${STAMP}.csv`, csv([
      ['Account', 'Debit', 'Credit'],
      ['CERT Operating Expenses', '1000', ''],
      ['Retained Earnings', '', '1000'],
      ['Accounts Receivable', '500', ''],
    ]), 'text/csv');
    await checkAndReview(page);
    const rows = page.getByTestId('import-review-rows');
    await expect(rows).toContainText('Import the missing unpaid invoices first');
    await expect(rows).toContainText('The accounting engine will not accept this');
    await expect(page.getByText('This file can\'t be imported yet')).toBeVisible();
    await expect(page.getByTestId('import-commit')).toBeDisabled();
    await shot(page, '16-opening-refused');
    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
  });

  test('7. switching from Sage: checklist → take-on of the old trial balance → every account matches', async ({ page, diagnostics }) => {
    // The "old system" trial balance is built from this company's real ledger
    // as at today, with two balances moved the way a real take-on would.
    const env = loadE2EEnv();
    const sb = createClient(env.supabaseUrl, env.supabaseAnonKey);
    const auth = await sb.auth.signInWithPassword({ email: env.email, password: env.password });
    if (auth.error) throw auth.error;
    const { data: company, error: companyError } = await sb.from('companies').select('id').eq('name', READY_COMPANY).single();
    if (companyError) throw companyError;
    const { data: balances, error: balanceError } = await sb.rpc('get_balances_as_of_date', { p_end_date: TODAY, p_company_id: company.id });
    if (balanceError) throw balanceError;
    const lines = (balances as Array<{ account_number: number; name: string; type: string; balance: number }>).map(b => ({
      number: String(b.account_number),
      name: b.name,
      net: Math.round(((b.type === 'Asset' || b.type === 'Expense') ? Number(b.balance) : -Number(b.balance)) * 100) / 100,
    }));
    const target = lines.map(l =>
      l.name === 'CERT Operating Expenses' ? { ...l, net: l.net + 100 }
        : l.name === 'Service Revenue' ? { ...l, net: l.net - 100 }
          : l).filter(l => Math.abs(l.net) >= 0.005);
    expect(target.some(l => l.name === 'CERT Operating Expenses')).toBe(true);
    const tbFile = (rowsIn: typeof target) => csv([
      ['Account Number', 'Account Description', 'Debit', 'Credit'],
      ...rowsIn.map(l => [l.number, l.name, l.net > 0 ? l.net.toFixed(2) : '', l.net < 0 ? (-l.net).toFixed(2) : '']),
    ]);

    await openImport(page);
    await page.getByTestId('switch-entry').click();
    await expect(page.getByRole('heading', { name: /^Switch to/ })).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('switch-source-sage_cloud').click();
    await page.locator('#switch-date').fill(TOMORROW);
    await expect(page.getByTestId('switch-step-customers')).toContainText('Done');
    await expect(page.getByTestId('switch-step-invoices')).toContainText('Done');
    await expect(page.getByTestId('switch-step-opening')).toContainText('From Sage Business Cloud');
    await shot(page, '17-switch-checklist');

    await page.getByTestId('switch-step-opening').getByRole('link', { name: /Import/ }).click();
    await expect(page.getByRole('heading', { name: 'Import opening balances' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#import-as-at')).toHaveValue(TODAY);
    await upload(page, `sage-tb-${STAMP}.csv`, tbFile(target), 'text/csv');
    await checkAndReview(page);
    await expect(page.getByTestId('import-review-summary')).not.toContainText("can't be imported");
    await expect(page.getByTestId('import-review-rows')).toContainText('Already carried by what you imported earlier');
    await shot(page, '18-takeon-review');
    await commitAndWait(page);
    await expect(page.getByTestId('import-result-summary')).toContainText('2 imported');
    await expect(page.getByTestId('import-reconciliation'))
      .toContainText('every account in your file now holds exactly the balance your old system shows', { timeout: 30_000 });
    await shot(page, '19-takeon-result');

    await page.getByRole('button', { name: 'Back to the checklist' }).click();
    await expect(page.getByRole('heading', { name: /^Switch to/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('switch-step-opening')).toContainText('Done');

    // The final proof: the old system's trial balance against the books here.
    await page.getByTestId('compare-file-input').setInputFiles({ name: `sage-tb-${STAMP}.csv`, mimeType: 'text/csv', buffer: tbFile(target) });
    await page.getByTestId('compare-run').click();
    await expect(page.getByTestId('compare-result')).toContainText('Every account matches your old system', { timeout: 60_000 });
    await shot(page, '20-compare-all-match');

    // And it catches a difference: the trial balance before the two adjustments.
    await page.getByTestId('compare-file-input').setInputFiles({
      name: `sage-tb-old-${STAMP}.csv`, mimeType: 'text/csv', buffer: tbFile(lines.filter(l => Math.abs(l.net) >= 0.005)),
    });
    await page.getByTestId('compare-run').click();
    await expect(page.getByTestId('compare-result')).toContainText('2 differ', { timeout: 60_000 });
    await shot(page, '21-compare-differences');
    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
  });
});
