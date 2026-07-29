import { expect, test, expectNoErrorBoundary, waitForRouteSettled, type PageDiagnostics } from './fixtures';
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Runtime certification of the SmartSelect Create-on-the-Fly standard, exercised
 * through the real invoice UI (the flagship). Proves the full contract on the
 * Customer field — the canonical creatable dropdown, which has no admin gate:
 *
 *   search → "No matching results found." empty state → Create "<typed>" →
 *   name pre-filled → save → modal auto-closes → new record auto-selected →
 *   focus returns to the field → invoice data entered earlier is preserved.
 *
 * The invoice module is gated until a company completes Enterprise Accounting
 * Setup, and the E2E user owns several companies, so we first switch to one whose
 * Invoices page is actually enabled.
 */

async function invoiceReady(page: Page): Promise<boolean> {
  // Wait for whichever resolves first: the New Invoice button (ready) or the
  // "Accounting foundation required" gate (not ready). A short button-only poll
  // races the readiness query and false-negatives on ready companies.
  const button = page.getByRole('button', { name: /new invoice/i }).first();
  const gate = page.getByRole('heading', { name: /accounting foundation required/i });
  await Promise.race([
    button.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined),
    gate.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined),
  ]);
  return button.isVisible().catch(() => false);
}

async function listCompanies(page: Page): Promise<string[]> {
  const trigger = page.getByRole('banner').locator('button:has(svg.lucide-building)').first();
  await trigger.click();
  await page.getByRole('menu').waitFor({ timeout: 10_000 });
  const items = await page.getByRole('menuitem').allInnerTexts();
  await page.keyboard.press('Escape');
  return items.map((t) => t.trim()).filter((t) => t && !/create new company/i.test(t));
}

async function switchTo(page: Page, name: string): Promise<void> {
  const trigger = page.getByRole('banner').locator('button:has(svg.lucide-building)').first();
  await trigger.click();
  await page.getByRole('menuitem', { name, exact: true }).first().click();
  await page.waitForTimeout(600); // let AuthContext apply the new active company
}

/** Ensures an invoice-ready company is active; returns its name, or '' if none. */
async function ensureInvoicingCompany(page: Page, tried: { name: string; ready: boolean }[]): Promise<string> {
  await page.goto('/invoices');
  await waitForRouteSettled(page);
  if (await invoiceReady(page)) return '(already active)';

  const companies = await listCompanies(page);
  for (const name of companies) {
    await switchTo(page, name);
    await page.goto('/invoices');
    await waitForRouteSettled(page);
    const ready = await invoiceReady(page);
    tried.push({ name, ready });
    if (ready) return name;
  }
  return '';
}

test.describe('SmartSelect — Create-on-the-Fly (invoice flagship)', () => {
  const stamp = Date.now();
  const newCustomer = `SSCustomer ${String(stamp).slice(-8)}`;
  const invMarker = `SS-${String(stamp).slice(-6)}`;

  test('create a customer mid-invoice without leaving the form', async ({ page, diagnostics }) => {
    const customerPosts: { status: number; hasId: boolean }[] = [];
    page.on('response', async (res) => {
      if (!res.url().includes('/functions/v1/customers')) return;
      if (res.request().method() === 'OPTIONS') return;
      let hasId = false;
      try {
        hasId = !!JSON.parse(await res.text())?.id;
      } catch {
        /* non-JSON / list response */
      }
      customerPosts.push({ status: res.status(), hasId });
    });

    const evidence: Record<string, unknown> = { timestamp: new Date().toISOString(), newCustomer, invMarker };

    try {
      const tried: { name: string; ready: boolean }[] = [];
      const company = await ensureInvoicingCompany(page, tried);
      evidence.invoicingCompany = company;
      evidence.companiesTried = tried;
      test.skip(company === '', 'No accounting-complete company available on this tenant to enable Invoices.');
      await expectNoErrorBoundary(page);

      await page.getByRole('button', { name: /new invoice/i }).first().click();
      await expect(page.getByRole('heading', { name: /new invoice/i })).toBeVisible();

      // Enter data BEFORE creating the customer — it must survive the create flow.
      // (Invoice # is auto-populated asynchronously by the form, so a line-item
      // Description — which the app never overwrites — is the honest marker.)
      const lineDescription = `COTF line ${invMarker}`;
      await page.getByPlaceholder('Description').first().fill(lineDescription);

      // 1. Open the Customer SmartSelect and search for something that can't exist.
      const customerTrigger = page.getByRole('combobox', { name: /select customer/i });
      await customerTrigger.click();
      await page.getByPlaceholder(/search customer/i).fill(newCustomer);

      // 2. Standard empty state + Create affordance carrying the typed value.
      await expect(page.getByText(/no matching results found/i)).toBeVisible();
      const createButton = page.getByRole('button', { name: new RegExp(`create "${newCustomer}"`, 'i') });
      await expect(createButton).toBeVisible();
      evidence.emptyStateShown = true;
      await createButton.click();

      // 3. Compact create modal opens with the typed value pre-filled.
      await expect(page.getByRole('heading', { name: /new customer/i })).toBeVisible();
      const nameInput = page.getByLabel(/customer name/i);
      await expect(nameInput).toHaveValue(newCustomer);
      evidence.prefilled = true;

      // 4. Save → modal closes, record is created.
      await page.getByRole('button', { name: /create customer/i }).click();
      await expect(page.getByRole('heading', { name: /new customer/i })).toBeHidden({ timeout: 20_000 });
      evidence.modalClosed = true;

      // 5. New record is auto-selected in the originating field.
      const selectedTrigger = page.getByRole('combobox', { name: new RegExp(newCustomer, 'i') });
      await expect(selectedTrigger).toBeVisible({ timeout: 15_000 });
      evidence.autoSelected = true;

      // 6. Focus returns to the field just completed.
      await expect(selectedTrigger).toBeFocused();
      evidence.focusReturned = true;

      // 7. Workflow preserved: invoice still open, earlier input intact.
      await expect(page.getByRole('heading', { name: /new invoice/i })).toBeVisible();
      await expect(page.getByPlaceholder('Description').first()).toHaveValue(lineDescription);
      evidence.workflowPreserved = true;

      const created = customerPosts.filter((p) => p.status === 200 && p.hasId);
      evidence.customerCreateHttp200WithId = created.length > 0;
      expect(created.length).toBeGreaterThan(0);

      evidence.verdict = 'PASS';
    } catch (err) {
      evidence.verdict = 'FAIL';
      evidence.failure = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      writeEvidence(evidence, diagnostics);
    }
  });
});

function writeEvidence(evidence: Record<string, unknown>, diagnostics: PageDiagnostics): void {
  evidence.failedRequests = diagnostics.failedRequests;
  evidence.pageErrors = diagnostics.pageErrors;
  evidence.consoleErrors = diagnostics.consoleErrors;
  fs.mkdirSync('docs/ux/evidence', { recursive: true });
  fs.writeFileSync(
    path.join('docs/ux/evidence', 'smartselect-cotf-playwright.json'),
    JSON.stringify(evidence, null, 2),
  );
}
