import { expect, test, expectNoErrorBoundary, waitForRouteSettled } from './fixtures';
import fs from 'node:fs';
import path from 'node:path';

/**
 * P0 repro: user fills all VISIBLE required fields and clicks Save without
 * opening Advanced Accounting. On tenants whose A/R account is named "AR"
 * (not "...Receivable..."), auto-select fails and zod blocks submit while the
 * A/R FormMessage is hidden inside the collapsed Advanced section.
 */
test.describe('P0 Invoice silent A/R validation', () => {
  const stamp = Date.now();
  const invNum = `SILENT${String(stamp).slice(-6)}`;

  test('CREATE without Advanced: invoice must persist (A/R auto-select)', async ({ page, diagnostics }) => {
    const invoicePosts: { status: number; body: string }[] = [];
    page.on('response', async (res) => {
      if (!res.url().includes('/functions/v1/invoices')) return;
      const body = await res.text().catch(() => '');
      invoicePosts.push({ status: res.status(), body: body.slice(0, 800) });
    });

    await page.goto('/invoices');
    await waitForRouteSettled(page);
    await expectNoErrorBoundary(page);

    await page.getByRole('button', { name: /new invoice/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('combobox', { name: /customer/i }).click();
    await page.getByRole('option').first().click();
    await page.getByLabel('Invoice Date').fill('2026-07-29');
    await page.getByLabel('Due Date').fill('2026-08-28');
    await page.getByPlaceholder('Description').first().fill('P0 silent AR line');
    await page.getByRole('spinbutton').nth(1).fill('100');
    await page.getByRole('combobox').filter({ hasText: /^Account$/ }).first().click();
    await page.getByRole('option').first().click();
    await page.getByLabel('Invoice #').fill(invNum);

    // Critical: do NOT open Advanced Accounting
    await expect(page.getByRole('button', { name: /show advanced accounting/i })).toBeVisible();

    await page.getByRole('button', { name: /save invoice/i }).click();

    let dialogHidden = false;
    let rowVisible = false;
    let persistAfterReload = false;
    let failure: string | null = null;
    try {
      // Scope to the named form dialog: the account picker is a Radix Popover
      // combobox that also exposes role="dialog" and lingers (data-state closed),
      // so an unscoped getByRole('dialog') matches two elements and aborts on
      // strict mode before the real assertion evaluates. Assert the "New Invoice"
      // form dialog itself closed — the true signal that the invoice persisted.
      await expect(page.getByRole('dialog', { name: /new invoice/i })).toBeHidden({ timeout: 25_000 });
      dialogHidden = true;
      await expect(page.getByRole('row').filter({ hasText: invNum })).toBeVisible({ timeout: 20_000 });
      rowVisible = true;
      await page.reload();
      await waitForRouteSettled(page);
      await expect(page.getByRole('row').filter({ hasText: invNum })).toBeVisible({ timeout: 20_000 });
      persistAfterReload = true;
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const createResponses = invoicePosts.filter((p) => {
        try {
          return p.status === 200 && !!JSON.parse(p.body)?.id;
        } catch {
          return false;
        }
      });
      const evidence = {
        timestamp: new Date().toISOString(),
        invNum,
        dialogHidden,
        rowVisible,
        persistAfterReload,
        arErrorVisible: (await page.getByText(/accounts receivable account is required/i).count()) > 0,
        createHttp200WithId: createResponses.length > 0,
        invoicePosts,
        failedRequests: diagnostics.failedRequests,
        pageErrors: diagnostics.pageErrors,
        failure,
        verdict: persistAfterReload && createResponses.length > 0 ? 'PASS' : 'FAIL',
      };
      fs.mkdirSync('docs/rc1/evidence', { recursive: true });
      fs.writeFileSync(
        path.join('docs/rc1/evidence', 'invoice-silent-ar-playwright.json'),
        JSON.stringify(evidence, null, 2),
      );
    }
  });
});
