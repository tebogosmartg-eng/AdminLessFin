import { test, expect, waitForRouteSettled, expectNoErrorBoundary } from './fixtures';

/**
 * Form resilience certification.
 *
 * The rule under test: a user never loses a form because the application
 * re-rendered, the page reloaded, the connection dropped, or they clicked
 * somewhere by accident. Entered information is preserved until it is
 * intentionally discarded or successfully saved.
 *
 * These specs avoid the posting engine on purpose (this tenant's readiness
 * blocks several posting flows — a known, separately tracked condition), so
 * every proof here is about the FORM layer: guarded dismissal, drafts,
 * offline behaviour, and duplicate suppression on a path that does save.
 */

const DESCRIPTION = () => `Resilience proof ${Date.now()}`;

/** The same accounting-complete company spec 08 uses: invoices usable there. */
const READY_COMPANY = 'CERT TX 1785230675937';

async function ensureReadyCompany(page: import('@playwright/test').Page) {
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

async function openNewInvoice(page: import('@playwright/test').Page) {
  await page.goto('/');
  await waitForRouteSettled(page);
  await ensureReadyCompany(page);
  await page.goto('/invoices');
  await waitForRouteSettled(page);
  await page.getByRole('button', { name: /new invoice/i }).first().click();
  await expect(page.getByRole('dialog', { name: /new invoice/i })).toBeVisible({ timeout: 20_000 });
}

test.describe('Accidental dismissal never discards typing', () => {
  test('outside click, Escape and X all ask before discarding a dirty invoice', async ({ page }) => {
    await openNewInvoice(page);
    const marker = DESCRIPTION();
    await page.getByPlaceholder('Description').first().fill(marker);

    // 1. A stray click on the page behind the dialog.
    await page.mouse.click(8, 8);
    await expect(page.getByTestId('discard-confirm')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('discard-keep').click();
    await expect(page.getByTestId('discard-confirm')).toBeHidden();
    await expect(page.getByPlaceholder('Description').first()).toHaveValue(marker);

    // 2. Escape.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('discard-confirm')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('discard-keep').click();
    await expect(page.getByPlaceholder('Description').first()).toHaveValue(marker);

    // 3. The X — and this time the user really means it.
    await page.getByRole('dialog', { name: /new invoice/i }).getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('discard-confirm')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('discard-confirm-action').click();
    await expect(page.getByRole('dialog', { name: /new invoice/i })).toBeHidden({ timeout: 10_000 });

    // A deliberate discard means discarded: reopening starts clean.
    await page.getByRole('button', { name: /new invoice/i }).first().click();
    await expect(page.getByRole('dialog', { name: /new invoice/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder('Description').first()).toHaveValue('');
    await expectNoErrorBoundary(page);
  });

  test('a dirty form arms the leave-page warning', async ({ page }) => {
    await openNewInvoice(page);
    await page.getByPlaceholder('Description').first().fill(DESCRIPTION());
    const armed = await page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(armed, 'beforeunload should be prevented while the form is dirty').toBe(true);
  });
});

test.describe('Typed work survives a reload', () => {
  test('an unsaved invoice comes back as a restored draft', async ({ page }) => {
    await openNewInvoice(page);
    const marker = DESCRIPTION();
    await page.getByPlaceholder('Description').first().fill(marker);
    await page.getByRole('spinbutton').nth(1).fill('123.45');
    // The draft writes on a short debounce, and again on unload.
    await page.waitForTimeout(900);

    await page.reload();
    await waitForRouteSettled(page);
    await page.getByRole('button', { name: /new invoice/i }).first().click();
    await expect(page.getByRole('dialog', { name: /new invoice/i })).toBeVisible({ timeout: 20_000 });

    await expect(page.getByText(/restored your unsaved work/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder('Description').first()).toHaveValue(marker, { timeout: 10_000 });
    await expect(page.getByRole('spinbutton').nth(1)).toHaveValue('123.45');

    // Clean up: discard deliberately, so the next test starts clean.
    await page.keyboard.press('Escape');
    await page.getByTestId('discard-confirm-action').click();
    await expect(page.getByRole('dialog', { name: /new invoice/i })).toBeHidden({ timeout: 10_000 });
    await expectNoErrorBoundary(page);
  });
});

test.describe('Connection loss', () => {
  test('offline shows the banner, keeps typing, and the save completes on reconnect', async ({ page }) => {
    const name = `E2E Offline Customer ${Date.now()}`;
    await page.goto('/customers');
    await waitForRouteSettled(page);
    await page.getByRole('button', { name: /new customer/i }).first().click();
    await expect(page.getByText(/add new customer/i)).toBeVisible({ timeout: 20_000 });
    await page.getByPlaceholder('e.g., ACME Inc.').fill(name);

    await page.context().setOffline(true);
    try {
      await expect(page.getByTestId('offline-banner')).toBeVisible({ timeout: 10_000 });
      // Typing is untouched by going offline.
      await expect(page.getByPlaceholder('e.g., ACME Inc.')).toHaveValue(name);

      // Saving while offline neither fails nor loses the form: it waits.
      await page.getByRole('button', { name: /save customer/i }).click();
      await page.waitForTimeout(1_500);
      await expect(page.getByPlaceholder('e.g., ACME Inc.')).toHaveValue(name);
      await expect(page.getByText(/add new customer/i)).toBeVisible();
    } finally {
      await page.context().setOffline(false);
    }

    // Reconnected: the queued save completes on its own.
    await expect(page.getByTestId('offline-banner')).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(/add new customer/i)).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible({ timeout: 20_000 });
    await expectNoErrorBoundary(page);
  });
});

test.describe('Duplicate submissions', () => {
  test('double-clicking Save creates exactly one record', async ({ page }) => {
    const name = `E2E DoubleClick Customer ${Date.now()}`;
    await page.goto('/customers');
    await waitForRouteSettled(page);
    await page.getByRole('button', { name: /new customer/i }).first().click();
    await expect(page.getByText(/add new customer/i)).toBeVisible({ timeout: 20_000 });
    await page.getByPlaceholder('e.g., ACME Inc.').fill(name);

    await page.getByRole('button', { name: /save customer/i }).dblclick();
    await expect(page.getByText(/add new customer/i)).toBeHidden({ timeout: 30_000 });

    await page.reload();
    await waitForRouteSettled(page);
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(1, { timeout: 20_000 });
    await expectNoErrorBoundary(page);
  });
});
