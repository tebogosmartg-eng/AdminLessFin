import { test, expect, expectNoErrorBoundary, waitForRouteSettled } from './fixtures';

/**
 * UX stability certification.
 *
 * A passing CRUD test does not prove a human can type. These specs assert:
 * 1. After the shell is ready, SPA navigation never replaces it with a
 *    viewport-sized boot loader (the "page appearing/disappearing" failure).
 * 2. Accounting readiness may block Journal Entries, but the blocked state is
 *    stable (no loader oscillation).
 * 3. Typing into a dialog is not wiped by re-renders.
 */

const SHELL = /sign out/i;

async function waitForShell(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: SHELL })).toBeVisible({ timeout: 45_000 });
  await waitForRouteSettled(page);
}

async function assertShellNeverDisappears(
  page: import('@playwright/test').Page,
  durationMs: number,
): Promise<number> {
  const started = Date.now();
  let missing = 0;
  while (Date.now() - started < durationMs) {
    const visible = await page.getByRole('button', { name: SHELL }).isVisible().catch(() => false);
    if (!visible) missing += 1;
    await page.waitForTimeout(150);
  }
  return missing;
}

test.describe('UX stability — shell and gated modules', () => {
  test('SPA navigation keeps the application shell painted', async ({ page, diagnostics }) => {
    await waitForShell(page);

    const destinations: { group: RegExp; click: RegExp; url: RegExp }[] = [
      { group: /^Accounting$/i, click: /journal entries/i, url: /journal-entries/ },
      { group: /^Sales$/i, click: /^Customers$/i, url: /customers/ },
      { group: /^Accounting$/i, click: /chart of accounts/i, url: /chart-of-accounts/ },
    ];

    for (const dest of destinations) {
      const link = page.getByRole('link', { name: dest.click }).first();
      if (!(await link.isVisible().catch(() => false))) {
        const group = page.getByRole('button', { name: dest.group }).first();
        if (await group.isVisible().catch(() => false)) await group.click();
      }
      await expect(link).toBeVisible({ timeout: 10_000 });
      await link.click();
      await expect(page).toHaveURL(dest.url, { timeout: 20_000 });
      const missing = await assertShellNeverDisappears(page, 1_800);
      expect(missing, `shell vanished while on ${dest.url}`).toBe(0);
      await expect(page.locator('.flex.h-screen.w-screen.items-center.justify-center')).toHaveCount(0);
      await expectNoErrorBoundary(page);
    }

    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
  });

  test('Journal Entries is either stably blocked or a usable form — never a boot loop', async ({ page }) => {
    await waitForShell(page);
    await page.goto('/journal-entries');
    await expect(page.getByRole('button', { name: SHELL })).toBeVisible({ timeout: 45_000 });

    const blocked = page.getByText(/complete accounting setup/i);
    const register = page.getByRole('heading', { name: /journal entries/i });
    await expect(blocked.or(register)).toBeVisible({ timeout: 30_000 });

    const missing = await assertShellNeverDisappears(page, 2_500);
    expect(missing).toBe(0);

    if (await blocked.isVisible().catch(() => false)) {
      await expect(page.getByRole('link', { name: /continue accounting setup/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /new journal entry/i })).toHaveCount(0);
      // Blocked copy must not be replaced by a full-screen loader.
      await expect(page.locator('.flex.h-screen.w-screen.items-center.justify-center')).toHaveCount(0);
      return;
    }

    await page.getByRole('button', { name: /new journal entry/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const description = dialog.locator('textarea, input').filter({ hasText: '' }).first();
    // Prefer a labelled description field when present.
    const descField = dialog.getByLabel(/description/i).or(dialog.locator('textarea').first());
    await descField.first().click();
    await descField.first().fill('UX stability journal memo');
    await page.waitForTimeout(1_200);
    await expect(descField.first()).toHaveValue(/UX stability journal memo/);
    await expect(dialog).toBeVisible();
  });

  test('Customer form retains typed text across a dwell', async ({ page }) => {
    await waitForShell(page);
    await page.goto('/customers');
    await waitForRouteSettled(page);

    await page.getByRole('button', { name: /new customer/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const name = dialog.getByPlaceholder('e.g., ACME Inc.');
    await name.fill('UX-STABILITY-CUSTOMER');
    await page.waitForTimeout(1_500);
    await expect(name).toHaveValue('UX-STABILITY-CUSTOMER');
    await expect(dialog).toBeVisible();
  });
});
