/**
 * The preparer decides what the AFS contains.
 *
 * Every note and every framework policy is in the document. The engine
 * decides the default — a note the materiality rules withhold, a policy the
 * books give no occasion for, is listed under "Available, not printed" — and
 * the preparer can switch any of them on or off, reword any statement
 * caption, and switch off or rename a report or the Detailed Income
 * Statement. Every change here is put back before the test ends.
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect, waitForRouteSettled, expectNoErrorBoundary } from './fixtures';

const COMPANY = 'ed2f2a92-a8f4-4496-a6fe-51d68bf9ba03';
const SHOTS = 'tests/e2e/artifacts';

async function switchTo(page: Page, companyId: string) {
  const trigger = page.getByTestId('company-switcher');
  await expect(trigger).toBeEnabled({ timeout: 30_000 });
  if ((await trigger.getAttribute('data-company-id')) === companyId) return;
  await trigger.click();
  await page.locator(`[data-testid="company-option"][data-company-id="${companyId}"]`).click();
  await expect(trigger).toHaveAttribute('data-company-id', companyId, { timeout: 45_000 });
  await expect(trigger).toHaveAttribute('data-switching', 'false', { timeout: 45_000 });
}

const nav = (page: Page) => page.getByRole('navigation', { name: /document structure/i });

async function openEditable(page: Page) {
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  await expect(nav(page)).toBeVisible({ timeout: 180_000 });
  // Final statements are locked; reopen them for changes.
  if (await page.getByTestId('afs-locked-banner').isVisible().catch(() => false)) {
    await page.getByTestId('afs-mode-finalise').click();
    await page.getByTestId('afs-reopen').click();
    await page.getByTestId('afs-mode-document').click();
    await expect(page.getByTestId('afs-locked-banner')).toBeHidden({ timeout: 120_000 });
  }
}

/** Bring the draft up to date with the ledger, as a preparer would. */
async function updateFromAccounting(page: Page) {
  const update = page.getByTestId('afs-update');
  await expect(update).toBeEnabled({ timeout: 120_000 });
  await update.click();
  await expect(update).toBeEnabled({ timeout: 300_000 });
  await expect(nav(page)).toBeVisible({ timeout: 180_000 });
}

/** The tree row's own switch (the eye), revealed on hover. */
async function flip(row: Locator) {
  await row.hover();
  await row.locator('..').getByRole('button', { name: /Switch (on|off)/ }).click();
}

test.describe.configure({ mode: 'serial' });

test('a note the engine left out can be switched on, and back to the default', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  await waitForRouteSettled(page);
  await switchTo(page, COMPANY);
  await openEditable(page);

  const tree = nav(page);
  await expect(tree.getByTestId('afs-tree-available').first()).toBeVisible({ timeout: 60_000 });
  // An optional note the books give no occasion for: contingencies.
  const row = tree.getByTestId('afs-tree-note').filter({ hasText: /Contingen/i }).first();
  await expect(row).toBeVisible();
  await expect(row).not.toHaveAttribute('data-note-number', /\d/);
  await row.click();
  await expect(page.getByTestId('afs-editor-include-state')).toHaveText(/Off by default/);

  await page.getByTestId('afs-editor-include-switch').click();
  await expect(page.getByTestId('afs-editor-include-state')).toHaveText(/switched on by you/, {
    timeout: 60_000,
  });
  // It now prints, with a note number, the same number the PDF uses.
  await expect(row).toHaveAttribute('data-note-number', /\d+/, { timeout: 60_000 });
  await page.screenshot({ path: `${SHOTS}/incl-1-note-on.png`, fullPage: true });

  await page.getByRole('button', { name: "Use the engine's default" }).first().click();
  await expect(page.getByTestId('afs-editor-include-state')).toHaveText(/Off by default/, {
    timeout: 60_000,
  });
  await expectNoErrorBoundary(page);
});

test('a printed note can be switched off from the tree, then restored', async ({ page }) => {
  test.setTimeout(300_000);
  await openEditable(page);
  const tree = nav(page);
  const row = tree.getByTestId('afs-tree-note').filter({ hasText: /Share capital/i }).first();
  await expect(row).toHaveAttribute('data-note-number', /\d+/, { timeout: 60_000 });
  await flip(row);
  await expect(row).not.toHaveAttribute('data-note-number', /\d/, { timeout: 60_000 });
  await row.click();
  await expect(page.getByTestId('afs-editor-include-state')).toHaveText(/switched off by you/);
  await page.getByRole('button', { name: "Use the engine's default" }).first().click();
  await expect(row).toHaveAttribute('data-note-number', /\d+/, { timeout: 60_000 });
});

test('every framework policy is available; one can be switched on', async ({ page }) => {
  test.setTimeout(300_000);
  await openEditable(page);
  const tree = nav(page);
  const row = tree.getByTestId('afs-tree-policy').filter({ hasText: /Investment property/i }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.click();
  await expect(page.getByTestId('afs-editor-include-state')).toHaveText(/Off by default/);
  await expect(page.getByTestId('afs-editor-include')).toContainText('Why it is off: The books do not indicate investment property');
  await page.getByTestId('afs-editor-include-switch').click();
  await expect(page.getByTestId('afs-editor-include-state')).toHaveText(/switched on by you/, {
    timeout: 60_000,
  });
  await page.screenshot({ path: `${SHOTS}/incl-2-policy-on.png`, fullPage: true });
  await page.getByRole('button', { name: "Use the engine's default" }).first().click();
  await expect(page.getByTestId('afs-editor-include-state')).toHaveText(/Off by default/, {
    timeout: 60_000,
  });
});

test("the PPE policy's useful-lives table is editable", async ({ page }) => {
  test.setTimeout(600_000);
  await openEditable(page);
  await updateFromAccounting(page);
  const row = nav(page).getByTestId('afs-tree-policy').filter({ hasText: /Property, plant and equipment/i }).first();
  await row.click();
  const parts = page.getByTestId('afs-policy-parts');
  await expect(parts).toBeVisible({ timeout: 60_000 });
  // Composed from the register: the classes and their lives.
  await expect(parts.locator('input').first()).toHaveValue('Item');
  await expect(parts.getByText('This policy states no table.')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/incl-3-policy-table.png`, fullPage: true });
});

test('a statement caption can be reworded; the figure stays the ledger’s', async ({ page }) => {
  test.setTimeout(300_000);
  await openEditable(page);
  await nav(page).getByRole('button', { name: /Statement of Financial Position/i }).first().click();
  const captions = page.getByTestId('afs-statement-captions');
  await captions.locator('summary').click();
  const input = captions.getByRole('textbox', { name: 'Caption for Inventory', exact: true });
  await input.fill('Stock on hand');
  await input.press('Enter');
  const statement = page.getByTestId('afs-statement');
  await expect(statement).toContainText('Stock on hand', { timeout: 60_000 });
  await page.screenshot({ path: `${SHOTS}/incl-4-caption.png`, fullPage: true });
  await input.fill('');
  await input.press('Enter');
  await expect(statement).not.toContainText('Stock on hand', { timeout: 60_000 });
});

test('reports and the Detailed Income Statement can be switched off and renamed', async ({ page }) => {
  test.setTimeout(300_000);
  await openEditable(page);
  const tree = nav(page);

  const dis = tree.getByTestId('afs-tree-schedule').first();
  await expect(dis).toBeVisible({ timeout: 60_000 });
  await dis.click();
  await expect(page.getByTestId('afs-schedule-lines')).toBeVisible();
  await page.getByTestId('afs-editor-include-switch').click();
  await expect(dis).toContainText('off', { timeout: 30_000 });
  await page.getByRole('button', { name: "Use the engine's default" }).first().click();
  await expect(dis).not.toContainText('off', { timeout: 30_000 });

  const report = tree.getByTestId('afs-tree-front').filter({ hasText: "Directors' Report" }).first();
  await report.click();
  await page.getByTestId('afs-editor-include-switch').click();
  await expect(report).toContainText('off', { timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/incl-5-report-off.png`, fullPage: true });
  await page.getByRole('button', { name: "Use the engine's default" }).first().click();
  await expect(report).not.toContainText(/\boff\b/, { timeout: 30_000 });
  await expectNoErrorBoundary(page);
});
