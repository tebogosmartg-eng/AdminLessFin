/**
 * The disclosures AdminLess prepares, and the accountant then edits.
 *
 * Every assertion is about a populated table on screen: figures drawn from the
 * ledger, comparatives beside them, and an editor that behaves like a
 * spreadsheet. The company used here has a real posted ledger across two years,
 * so nothing in this file is a fixture.
 *
 * Run on its own — spec 12 signs out and revokes the shared session.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { test, expect, waitForRouteSettled, expectNoErrorBoundary } from './fixtures';
import { loadE2EEnv } from './env';
import type { Page } from '@playwright/test';

/** A company with two years of posted entries: assets, borrowings, trading. */
const DEMO_COMPANY = 'ed2f2a92-a8f4-4496-a6fe-51d68bf9ba03';

let admin: SupabaseClient;
let originalActive: string | null = null;

async function edge(fn: string, body: Record<string, unknown>) {
  const { data, error } = await admin.functions.invoke(fn, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    throw new Error(`${fn}: ${error.message} ${ctx ? await ctx.text().catch(() => '') : ''}`);
  }
  return data;
}

async function signIn() {
  const env = loadE2EEnv();
  admin = createClient(env.supabaseUrl, env.supabaseAnonKey);
  const auth = await admin.auth.signInWithPassword({ email: env.email, password: env.password });
  if (auth.error) throw auth.error;
}

async function switchTo(page: Page, companyId: string) {
  const trigger = page.getByTestId('company-switcher');
  await expect(trigger).toBeEnabled({ timeout: 30_000 });
  if ((await trigger.getAttribute('data-company-id')) === companyId) return;
  await trigger.click();
  await page.locator(`[data-testid="company-option"][data-company-id="${companyId}"]`).click();
  await expect(trigger).toHaveAttribute('data-company-id', companyId, { timeout: 45_000 });
  await expect(trigger).toHaveAttribute('data-switching', 'false', { timeout: 45_000 });
}

async function openDocument(page: Page) {
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  await expect(page.getByRole('navigation', { name: /document structure/i })).toBeVisible({
    timeout: 180_000,
  });
}

/** Open a note from the navigator by the words in its title. */
async function openNote(page: Page, title: RegExp) {
  const row = page
    .getByRole('navigation', { name: /document structure/i })
    .getByTestId('afs-tree-note')
    .filter({ hasText: title })
    .first();
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.click();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await signIn();
  const s = (await edge('user-session', { method: 'GET' })) as { activeCompany: { id: string } };
  originalActive = s.activeCompany?.id ?? null;
});

test.afterAll(async () => {
  await signIn();
  if (originalActive) {
    await edge('settings', {
      method: 'SWITCH_COMPANY',
      company_id: originalActive,
      target_company_id: originalActive,
    });
  }
});

test('1-8: the property note arrives populated from the ledger, with comparatives', async ({
  page,
}) => {
  await page.goto('/');
  await waitForRouteSettled(page);
  await switchTo(page, DEMO_COMPANY);
  await openDocument(page);

  await openNote(page, /Property, plant and equipment/i);
  const grid = page.getByTestId('afs-spreadsheet').first();
  await expect(grid).toBeVisible({ timeout: 45_000 });

  // Intl separates thousands with a non-breaking space; compare like for like.
  const text = (await grid.innerText()).replace(/ /g, ' ');
  // Asset classes, not a blank shell.
  expect(text).toMatch(/Land and Buildings/i);
  expect(text).toMatch(/Motor Vehicles/i);
  expect(text).toMatch(/Computer Equipment/i);
  expect(text).toMatch(/Accumulated depreciation/i);
  expect(text).toMatch(/Carrying amount/i);

  // The figures, and last year beside them.
  expect(text).toContain('1 200 000,00');
  expect(text).toContain('2 540 000,00');
  expect(text).toContain('2 015 000,00');

  // Against the ledger itself, not just against the screen.
  const facts = await edge('financial-statements', {
    method: 'GET_STATEMENTS',
    company_id: DEMO_COMPANY,
    workspace_id: page.url().split('/').pop(),
  });
  const sfp = (facts as { statements: Array<{ statement_type: string; lines: Array<{ line_code: string; amount: number | null }> }> })
    .statements.find((s) => s.statement_type === 'financial_position');
  const ppe = sfp?.lines.find((l) => l.line_code === 'sfp.ppe')?.amount ?? 0;
  expect(Math.round(ppe)).toBe(2_540_000);

  // Cells say where they came from.
  await expect(grid.locator('[data-origin="linked"]').first()).toBeVisible();
  await expect(grid.locator('[data-origin="calculated"]').first()).toBeVisible();

  await page.screenshot({ path: 'tests/e2e/artifacts/disc-1-ppe-populated.png', fullPage: true });
  await expectNoErrorBoundary(page);
});

test('9-12: a cell can be formatted, and rows and columns added and removed', async ({ page }) => {
  await openDocument(page);
  await openNote(page, /Property, plant and equipment/i);
  const grid = page.getByTestId('afs-spreadsheet').first();
  await expect(grid).toBeVisible({ timeout: 45_000 });

  const rowsBefore = await grid.locator('tbody tr').count();
  const colsBefore = await grid.locator('thead th').count();

  // 9: format a cell.
  await grid.getByTestId('cell-0-0').click();
  await grid.getByTestId('ss-bold').click();
  await expect(grid.getByTestId('cell-0-0').locator('span').first()).toHaveClass(/font-semibold/);

  // 10: add a row.
  await grid.getByTestId('ss-add-row').click();
  await expect(grid.locator('tbody tr')).toHaveCount(rowsBefore + 1);

  // 12: add a column.
  await grid.getByTestId('ss-add-column').click();
  await expect(grid.locator('thead th')).toHaveCount(colsBefore + 1);

  await page.screenshot({ path: 'tests/e2e/artifacts/disc-2-editing.png', fullPage: true });

  // 11: delete the row again, and undo the rest.
  await grid.getByTestId('cell-1-0').click();
  await grid.getByTestId('ss-delete-row').click();
  await expect(grid.locator('tbody tr')).toHaveCount(rowsBefore);

  await expectNoErrorBoundary(page);
});

test('16-17: a linked figure names the accounts behind it', async ({ page }) => {
  await openDocument(page);
  await openNote(page, /Property, plant and equipment/i);
  const grid = page.getByTestId('afs-spreadsheet').first();
  await expect(grid).toBeVisible({ timeout: 45_000 });

  await grid.locator('[data-origin="linked"]').first().click();
  await grid.getByTestId('ss-view-source').click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toContainText(/Land and Buildings/i);
  await expect(dialog).toContainText(/Total/i);
  await page.screenshot({ path: 'tests/e2e/artifacts/disc-3-view-source.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expectNoErrorBoundary(page);
});

test('13, 18-19: an edit to a generated table survives a refresh', async ({ page }) => {
  await openDocument(page);
  await openNote(page, /Trade and other receivables/i);
  const grid = page.getByTestId('afs-spreadsheet').first();
  await expect(grid).toBeVisible({ timeout: 45_000 });

  // Add a row and put the preparer's own wording in it.
  const marker = `Retention debtor ${Date.now() % 100000}`;
  await grid.getByTestId('ss-add-row').click();
  const added = grid.locator('tbody tr').last().locator('td').first();
  await added.dblclick();
  await page.keyboard.type(marker);
  await page.keyboard.press('Enter');

  // The row must be in the grid before saving, or the click races the edit.
  await expect(grid).toContainText(marker, { timeout: 15_000 });
  const saveButton = page.getByTestId('afs-table-save').first();
  await saveButton.click();
  await expect(saveButton).toHaveText(/Saved/, { timeout: 45_000 });

  await page.reload();
  await waitForRouteSettled(page);
  await openDocument(page);
  await openNote(page, /Trade and other receivables/i);
  await expect(page.getByTestId('afs-spreadsheet').first()).toContainText(marker, {
    timeout: 45_000,
  });
  await page.screenshot({ path: 'tests/e2e/artifacts/disc-4-persisted.png', fullPage: true });
  await expectNoErrorBoundary(page);
});

test('14-15: other disclosures are populated too', async ({ page }) => {
  await openDocument(page);

  for (const [title, expected] of [
    // A generated disclosure keeps the framework's title where the framework
    // already names that note.
    [/^Note \d+\. Borrowings$/, /Long-term Loans/i],
    [/Cash and cash equivalents/i, /Bank - Current Account/i],
    [/Share capital and equity/i, /Issued Capital/i],
  ] as Array<[RegExp, RegExp]>) {
    await openNote(page, title);
    const grid = page.getByTestId('afs-spreadsheet').first();
    await expect(grid).toBeVisible({ timeout: 45_000 });
    await expect(grid).toContainText(expected, { timeout: 15_000 });
    // Populated, not an empty shell.
    await expect(grid.locator('[data-origin="linked"]').first()).toBeVisible();
  }

  await page.screenshot({ path: 'tests/e2e/artifacts/disc-5-other-notes.png', fullPage: true });
  await expectNoErrorBoundary(page);
});

test('20-22: rebuilding from accounting refreshes figures and keeps authored rows', async ({
  page,
}) => {
  await openDocument(page);
  await openNote(page, /Trade and other receivables/i);
  const grid = page.getByTestId('afs-spreadsheet').first();
  await expect(grid).toBeVisible({ timeout: 45_000 });
  const authored = await grid.innerText();
  const hadAuthoredRow = /Retention debtor/i.test(authored);

  // 21: rebuild the statements from the accounting records.
  await page.getByTestId('afs-update').click();
  await expect(page.getByTestId('afs-update')).toBeEnabled({ timeout: 180_000 });
  await page.waitForTimeout(3000);

  await openNote(page, /Trade and other receivables/i);
  const after = page.getByTestId('afs-spreadsheet').first();
  await expect(after).toBeVisible({ timeout: 45_000 });

  // The linked figures are still the ledger's.
  await expect
    .poll(async () => (await after.innerText()).replace(/ /g, ' '), { timeout: 30_000 })
    .toContain('790 000,00');
  // 22: and the preparer's row is still there.
  if (hadAuthoredRow) await expect(after).toContainText(/Retention debtor/i);

  await page.screenshot({ path: 'tests/e2e/artifacts/disc-6-regenerated.png', fullPage: true });
  await expectNoErrorBoundary(page);
});
