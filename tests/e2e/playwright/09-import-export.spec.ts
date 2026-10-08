import { test, expect, expectNoErrorBoundary, waitForRouteSettled } from './fixtures';

/**
 * Runtime certification for the Import and Export workflows. Exports generate a
 * client-side CSV via a real browser download; Imports expose a template
 * download plus a CSV upload/validate flow. We assert the real download events
 * fire and the import UI is interactive (up to a submit-ready state — a full
 * upload posts to the live tenant and is out of scope here, mirroring the
 * invite test's submit-ready boundary).
 */

test.describe('Exports — CSV download', () => {
  test('Customers: "Export CSV" triggers a real file download', async ({ page, diagnostics }) => {
    await page.goto('/customers');
    await waitForRouteSettled(page);
    await expectNoErrorBoundary(page);

    const exportBtn = page.getByRole('button', { name: /export csv/i });
    await expect(exportBtn).toBeEnabled({ timeout: 20_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      exportBtn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/customers.*\.csv/i);

    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
  });
});

test.describe('Imports — data import UI', () => {
  test('Import page lists every import type and a template downloads from the upload step', async ({ page, diagnostics }) => {
    await page.goto('/import');
    await waitForRouteSettled(page);
    await expectNoErrorBoundary(page);

    await expect(page.getByRole('heading', { name: /import data/i })).toBeVisible({ timeout: 20_000 });
    for (const type of ['customers', 'vendors', 'products', 'chart_of_accounts', 'invoices', 'bills',
      'customer_payments', 'supplier_payments', 'bank_transactions', 'journal_entries', 'opening_balances']) {
      await expect(page.getByTestId(`import-type-${type}`)).toBeVisible({ timeout: 20_000 });
    }

    await page.getByTestId('import-type-customers').click();
    await expect(page.getByTestId('import-file-input')).toBeAttached();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      page.getByRole('button', { name: /download a template/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/customers-import-template\.csv$/i);

    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
  });
});
