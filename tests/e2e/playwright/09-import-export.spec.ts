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
  test('Import page renders and "Download Template" triggers a download', async ({ page, diagnostics }) => {
    await page.goto('/import');
    await waitForRouteSettled(page);
    await expectNoErrorBoundary(page);

    await expect(page.getByRole('heading', { name: /import data/i })).toBeVisible({ timeout: 20_000 });
    // The CSV upload control is present and ready to accept a file.
    await expect(page.locator('input[type="file"]')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      page.getByRole('button', { name: /download template/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);

    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
  });
});
