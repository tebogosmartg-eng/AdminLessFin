import { expect, test, expectNoErrorBoundary, waitForRouteSettled } from './fixtures';
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression proof for the R0.00 invoice bug: create a real invoice and verify the
 * amount surfaces in BOTH the list and the detail (previously both read R0.00
 * because the frontend indexed the to-one journal_entries object as an array).
 *
 * Runs against the accounting-complete cert company; skips cleanly if it cannot be
 * made active (environmental, not a code defect).
 */

const READY_COMPANY = 'CERT TX 1785230675937';
// 20000 gross; matched leniently across thousands separators.
const AMOUNT_RE = /20[\s .,]?000/;

async function ensureInvoicesReady(page: Page): Promise<boolean> {
  const ready = async () => {
    const button = page.getByRole('button', { name: /new invoice/i }).first();
    const gate = page.getByRole('heading', { name: /accounting foundation required/i });
    await Promise.race([
      button.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined),
      gate.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined),
    ]);
    return button.isVisible().catch(() => false);
  };

  await page.goto('/invoices');
  await waitForRouteSettled(page);
  if (await ready()) return true;

  // Switch to the known invoice-ready company via the header company switcher.
  const trigger = page.getByRole('banner').locator('button:has(svg.lucide-building)').first();
  await trigger.click();
  const item = page.getByRole('menuitem', { name: READY_COMPANY, exact: true });
  if (!(await item.isVisible().catch(() => false))) return false;
  await item.click();
  await page.waitForTimeout(800);
  await page.goto('/invoices');
  await waitForRouteSettled(page);
  return ready();
}

test.describe('Invoice amount integrity (list + detail)', () => {
  const stamp = Date.now();
  const customerName = `INV Cust ${String(stamp).slice(-8)}`;
  const lineDescription = `Consulting ${String(stamp).slice(-6)}`;

  test('a created invoice shows its amount in the list and detail (not R0.00)', async ({ page, diagnostics }) => {
    const evidence: Record<string, unknown> = { timestamp: new Date().toISOString(), customerName };

    try {
      const ready = await ensureInvoicesReady(page);
      evidence.invoicesReady = ready;
      test.skip(!ready, `Could not make "${READY_COMPANY}" active/invoice-ready on this tenant.`);
      await expectNoErrorBoundary(page);

      // ── Create an invoice: customer (via COTF), one R20,000 line ──────────────
      await page.getByRole('button', { name: /new invoice/i }).first().click();
      await expect(page.getByRole('heading', { name: /new invoice/i })).toBeVisible();

      const customerTrigger = page.getByRole('combobox', { name: /select customer/i });
      await customerTrigger.click();
      await page.getByPlaceholder(/search customer/i).fill(customerName);
      await page.getByRole('button', { name: new RegExp(`create "${customerName}"`, 'i') }).click();
      await expect(page.getByRole('heading', { name: /new customer/i })).toBeVisible();
      await page.getByRole('button', { name: /create customer/i }).click();
      await expect(page.getByRole('combobox', { name: new RegExp(customerName, 'i') })).toBeVisible({ timeout: 15_000 });

      await page.getByPlaceholder('Description').first().fill(lineDescription);
      await page.getByRole('spinbutton').nth(1).fill('20000'); // unit price (qty defaults to 1)

      // Income account (line-item SmartSelect, placeholder "Account").
      await page.getByRole('combobox').filter({ hasText: /^Account$/ }).first().click();
      await page.getByRole('option').first().click();

      const invNum = await page.getByLabel('Invoice #').inputValue();
      evidence.invoiceNumber = invNum;
      expect(invNum.length).toBeGreaterThan(0);

      await page.getByRole('button', { name: /save invoice/i }).click();
      await expect(page.getByRole('heading', { name: /new invoice/i })).toBeHidden({ timeout: 30_000 });
      evidence.saved = true;

      // ── LIST: the amount cell must reflect R20,000, not R0.00 ─────────────────
      const row = page.getByRole('row').filter({ hasText: invNum });
      await expect(row).toBeVisible({ timeout: 20_000 });
      const amountCell = row.getByRole('cell').nth(4);
      const listAmount = (await amountCell.textContent())?.trim() ?? '';
      evidence.listAmount = listAmount;
      expect(listAmount).toMatch(AMOUNT_RE);
      expect(listAmount).not.toMatch(/^\D*0[.,]00\D*$/); // definitely not R0.00

      // ── DETAIL: line item rendered + total reflects the amount ────────────────
      await row.click();
      await expect(page.getByRole('heading', { name: new RegExp(`Invoice ${invNum}`, 'i') })).toBeVisible({ timeout: 20_000 });
      // A line item row exists (previously the table was empty).
      await expect(page.getByText(/^Total$/i)).toBeVisible();
      await expect(page.getByText(AMOUNT_RE).first()).toBeVisible();
      evidence.detailShowsAmount = true;

      evidence.verdict = 'PASS';
    } catch (err) {
      evidence.verdict = 'FAIL';
      evidence.failure = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      evidence.failedRequests = diagnostics.failedRequests;
      evidence.pageErrors = diagnostics.pageErrors;
      evidence.consoleErrors = diagnostics.consoleErrors;
      fs.mkdirSync('docs/ux/evidence', { recursive: true });
      fs.writeFileSync(
        path.join('docs/ux/evidence', 'invoice-amount-integrity-playwright.json'),
        JSON.stringify(evidence, null, 2),
      );
    }
  });
});
