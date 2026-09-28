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
import { readFile } from 'node:fs/promises';
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
  const text = (await grid.innerText()).replace(/\u00a0/g, ' ');
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

  // A row of ledger figures is not deleted on one click. The structure the
  // preparer saves is what the note keeps, so removing an asset class removes
  // it for good and the total silently stops agreeing with the trial balance.
  const linkedRow = grid
    .locator('tbody tr')
    .filter({ has: page.locator('[data-origin="linked"]') })
    .first();
  await linkedRow.locator('td').first().click();
  const countBefore = await grid.locator('tbody tr').count();
  await grid.getByTestId('ss-delete-row').click();
  await expect(page.getByTestId('ss-notice')).toContainText(/comes from the ledger/i, {
    timeout: 15_000,
  });
  // Nothing was removed: it asked first.
  await expect(grid.locator('tbody tr')).toHaveCount(countBefore);

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

/**
 * The Editor is where the work happens; Live Preview only shows the result.
 *
 * Everything here is done the way an accountant would do it — clicking cells,
 * pressing Ctrl+C, dragging a column edge — against a note that arrived
 * populated from a real ledger.
 */
test('Editor: the spreadsheet behaves like a spreadsheet', async ({ page, context }) => {
  // The clipboard is the point of this test; Chromium will not hand it over
  // without being asked.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);

  await openDocument(page);
  await openNote(page, /Property, plant and equipment/i);

  // 1-2: the generated table and its toolbar are inside the Editor tab.
  const editorTab = page.getByRole('tab', { name: 'Editor' });
  await expect(editorTab).toHaveAttribute('data-state', 'active');
  const grid = page.getByTestId('afs-spreadsheet').first();
  await expect(grid).toBeVisible({ timeout: 45_000 });
  for (const control of ['ss-copy', 'ss-cut', 'ss-paste', 'ss-bold', 'ss-add-row', 'ss-add-column']) {
    await expect(grid.getByTestId(control)).toBeVisible();
  }

  // 3: click a cell.
  await grid.getByTestId('cell-0-0').click();
  await expect(grid.getByTestId('cell-0-0')).toHaveAttribute('data-selected', 'true');

  // 4: select several, by holding shift.
  await grid.getByTestId('cell-1-0').click({ modifiers: ['Shift'] });
  await expect(grid.getByTestId('cell-1-0')).toHaveAttribute('data-selected', 'true');
  await expect(grid.getByTestId('cell-0-0')).toHaveClass(/bg-primary\/10/);

  // 5: copy, and check what actually reached the system clipboard.
  const label = (await grid.getByTestId('cell-0-0').innerText()).trim();
  await page.keyboard.press('Control+KeyC');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain(label);
  expect(clipboard).toContain('\n'); // two rows, not one

  // 6-7: add a row — it lands under the selected one — and paste into it.
  const rowsBefore = await grid.locator('tbody tr').count();
  await grid.getByTestId('ss-add-row').click();
  await expect(grid.locator('tbody tr')).toHaveCount(rowsBefore + 1);
  await grid.getByTestId('cell-2-0').click();
  await page.keyboard.press('Control+KeyV');
  await expect(grid.getByTestId('cell-2-0')).toContainText(label, { timeout: 15_000 });

  await page.screenshot({ path: 'tests/e2e/artifacts/disc-7-clipboard.png', fullPage: true });

  // A paste must never quietly sever a figure from the ledger.
  const dismiss = page.getByTestId('ss-notice').getByRole('button', { name: 'Dismiss' });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  const linked = grid.locator('[data-origin="linked"]').first();
  await linked.click();
  const before = (await linked.innerText()).trim();
  await page.keyboard.press('Control+KeyV');
  await expect(page.getByTestId('ss-notice')).toContainText(/from the ledger/i, { timeout: 15_000 });
  expect((await linked.innerText()).trim()).toBe(before);
  await expect(linked).toHaveAttribute('data-origin', 'linked');

  // 8: add a column.
  const colsBefore = await grid.locator('thead th').count();
  await grid.getByTestId('ss-add-column').click();
  await expect(grid.locator('thead th')).toHaveCount(colsBefore + 1);

  // 9: resize a column by dragging its edge.
  const heading = grid.locator('thead th').first();
  const widthBefore = (await heading.boundingBox())!.width;
  const grip = grid.getByTestId('ss-col-grip-0');
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await heading.boundingBox())!.width, { timeout: 10_000 })
    .toBeGreaterThan(widthBefore + 30);

  // 10-12: format, then undo and redo it.
  await grid.getByTestId('cell-0-0').click();
  await grid.getByTestId('ss-bold').click();
  const text = grid.getByTestId('cell-0-0').locator('span').first();
  await expect(text).toHaveClass(/font-semibold/);
  await grid.getByTestId('ss-undo').click();
  await expect(text).not.toHaveClass(/font-semibold/);
  await grid.getByTestId('ss-redo').click();
  await expect(text).toHaveClass(/font-semibold/);

  // Keyboard navigation: the arrows and Tab move the selection.
  await grid.getByTestId('cell-0-0').click();
  await page.keyboard.press('ArrowDown');
  await expect(grid.getByTestId('cell-1-0')).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Tab');
  await expect(grid.getByTestId('cell-1-1')).toHaveAttribute('data-selected', 'true');

  await page.screenshot({ path: 'tests/e2e/artifacts/disc-8-editing.png', fullPage: true });
  await expectNoErrorBoundary(page);
});

/**
 * This test saves into a real company's note, so it takes its row out again.
 *
 * It did not at first, and two runs left two "Leasehold …" rows sitting in the
 * property note of a company with a real ledger. A test that leaves a trace in
 * the books it is testing stops being a test.
 */
async function removeAuthoredRows(page: Page, note: RegExp, rowText: RegExp) {
  await openDocument(page);
  await openNote(page, note);
  const grid = page.getByTestId('afs-spreadsheet').first();
  await expect(grid).toBeVisible({ timeout: 45_000 });

  let removed = 0;
  for (let i = 0; i < 12; i += 1) {
    const row = grid.locator('tbody tr').filter({ hasText: rowText }).first();
    if (!(await row.isVisible().catch(() => false))) break;
    await row.locator('td').first().click();
    await grid.getByTestId('ss-delete-row').click();
    removed += 1;
  }
  if (removed === 0) return;

  const save = page.getByTestId('afs-table-save').first();
  await save.click();
  await expect(save).toHaveText(/Saved/, { timeout: 45_000 });
  console.log(`[cleanup] removed ${removed} authored row(s) from ${note}`);
}

test('Editor: an edit survives a refresh and reaches the printed document', async ({ page }) => {
  await openDocument(page);
  await openNote(page, /Property, plant and equipment/i);
  const grid = page.getByTestId('afs-spreadsheet').first();
  await expect(grid).toBeVisible({ timeout: 45_000 });

  // 13: put something of the preparer's own into the table and save it.
  // Short enough that the PDF's table engine will not wrap it onto two lines.
  const marker = `Leasehold ${Date.now() % 100000}`;
  await grid.getByTestId('ss-add-row').click();
  const added = grid.locator('tbody tr').last().locator('td').first();
  await added.dblclick();
  await page.keyboard.type(marker);
  await page.keyboard.press('Enter');
  await expect(grid).toContainText(marker, { timeout: 15_000 });

  const save = page.getByTestId('afs-table-save').first();
  await save.click();
  await expect(save).toHaveText(/Saved/, { timeout: 45_000 });

  try {
    // 14-15: refresh, and it is still there.
    await page.reload();
    await waitForRouteSettled(page);
    await openDocument(page);
    await openNote(page, /Property, plant and equipment/i);
    await expect(page.getByTestId('afs-spreadsheet').first()).toContainText(marker, {
      timeout: 45_000,
    });

    // 16-17: Live Preview shows the document and offers nothing to edit with.
    await page.getByRole('tab', { name: /live preview/i }).click();
    const frame = page.locator('iframe[title="Financial statement preview"]');
    await expect(frame).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('ss-bold')).toHaveCount(0);
    await expect(page.getByTestId('ss-add-row')).toHaveCount(0);
    await expect(page.getByTestId('afs-table-save')).toHaveCount(0);

    // The preview is a PDF, so read the PDF rather than photograph the viewer.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: /generate pdf/i }).click(),
    ]);
    const bytes = await readFile((await download.path())!);
    const printed = bytes.toString('latin1');
    expect(printed.slice(0, 8)).toContain('%PDF-');
    console.log(
      `[evidence] preview PDF ${bytes.length} bytes — notes section: ${/Notes to the/i.test(printed)}; ` +
        `property note: ${/Property, plant/i.test(printed)}; ` +
        `asset class from the ledger: ${/Land and Buildings/i.test(printed)}; ` +
        `the row added in the Editor: ${printed.includes(marker)}`,
    );
    // The edited table is in the printed document, figures and all.
    expect(printed).toMatch(/Land and Buildings/i);
    expect(printed).toContain(marker);

    await page.screenshot({ path: 'tests/e2e/artifacts/disc-9-preview.png', fullPage: true });
    await expectNoErrorBoundary(page);
  } finally {
    // Whatever happened above, the company's note goes back as it was —
    // including any row left behind by an earlier run.
    await removeAuthoredRows(page, /Property, plant and equipment/i, /^Leasehold \d+/);
  }
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
    .poll(async () => (await after.innerText()).replace(/\u00a0/g, ' '), { timeout: 30_000 })
    .toContain('790 000,00');
  // 22: and the preparer's row is still there.
  if (hadAuthoredRow) await expect(after).toContainText(/Retention debtor/i);

  await page.screenshot({ path: 'tests/e2e/artifacts/disc-6-regenerated.png', fullPage: true });
  await expectNoErrorBoundary(page);
});

/**
 * Building the note itself: adding wording and tables, moving them, removing them.
 *
 * The note used here is one the disclosure engine generates, which is where all
 * of this was broken: its id is synthetic, so Add paragraph posted a value that
 * is not a uuid into a uuid column, and an added paragraph starts empty, which
 * the rebuild read as "this note has no wording of its own" and replaced.
 */
/**
 * Show anything this note is withholding.
 *
 * A withheld paragraph has no move buttons — that is correct, there is nothing
 * to move — so a run that ended with one still hidden left the next run unable
 * to reorder at all. This makes the starting point the same every time, and is
 * only what a preparer would do by clicking "Bring back".
 */
async function bringBackWithheld(page: Page) {
  for (let guard = 0; guard < 12; guard += 1) {
    const restore = page.getByTestId('afs-piece-restore').first();
    if (!(await restore.isVisible().catch(() => false))) return;
    await restore.click();
    await expect(restore).toBeHidden({ timeout: 15_000 });
  }
}

/** Put the paragraphs back in a known order, one "move up" at a time. */
async function restoreParagraphOrder(page: Page, wanted: string[]) {
  const paragraphs = page.getByTestId('afs-paragraph');
  const current = async () => {
    const out: string[] = [];
    for (let i = 0; i < (await paragraphs.count()); i += 1) {
      out.push(await paragraphs.nth(i).locator('textarea').inputValue());
    }
    return out;
  };

  for (let target = 0; target < wanted.length; target += 1) {
    for (let guard = 0; guard < 12; guard += 1) {
      const now = await current();
      const at = now.indexOf(wanted[target]);
      if (at < 0 || at <= target) break;
      await paragraphs.nth(at).getByTestId('afs-piece-up').click();
      await expect(paragraphs.nth(at - 1).locator('textarea')).toHaveValue(wanted[target], {
        timeout: 15_000,
      });
    }
  }

  // Say so if the note was not put back. A cleanup that quietly fails is how
  // this company ended up with its property note permanently rearranged.
  const finished = await current();
  const restored = wanted.every((text, i) => finished[i] === text || !finished.includes(text));
  if (!restored) {
    console.log(`[cleanup] WARNING: the paragraph order was not restored: ${JSON.stringify(finished.map((t) => t.slice(0, 24)))}`);
  }
}

test('Editor: paragraphs and tables can be added, moved and removed', async ({ page }) => {
  await openDocument(page);
  await openNote(page, /Property, plant and equipment/i);
  const paragraphs = page.getByTestId('afs-paragraph');
  await expect(paragraphs.first()).toBeVisible({ timeout: 45_000 });

  // Start from a note that is showing everything it has.
  await bringBackWithheld(page);

  const before = await paragraphs.count();
  const firstBefore = await paragraphs.first().locator('textarea').inputValue();
  const orderBefore: string[] = [];
  for (let i = 0; i < before; i += 1) {
    orderBefore.push(await paragraphs.nth(i).locator('textarea').inputValue());
  }

  try {
    // ── Add ────────────────────────────────────────────────────────────────
    await page.getByTestId('afs-add-paragraph').click();
    await expect(paragraphs).toHaveCount(before + 1, { timeout: 45_000 });

    // It is the preparer's, and it is at the end where they can find it.
    const added = paragraphs.last();
    await expect(added.getByTestId('afs-origin-authored')).toBeVisible();

    const wording = `Reviewed by the engagement partner ${Date.now() % 100000}`;
    await added.locator('textarea').fill(wording);
    await added.getByRole('button', { name: /save paragraph/i }).click();
    await expect(page.getByTestId('afs-paragraph').last().locator('textarea')).toHaveValue(wording, {
      timeout: 45_000,
    });

    // The framework's wording is still there beside it — the whole note was
    // once replaced the moment anything in it was written.
    await expect(paragraphs.first().locator('textarea')).toHaveValue(firstBefore);

    // ── Reorder ────────────────────────────────────────────────────────────
    const secondBefore = await paragraphs.nth(1).locator('textarea').inputValue();
    await paragraphs.first().getByTestId('afs-piece-down').click();
    await expect(paragraphs.first().locator('textarea')).toHaveValue(secondBefore, {
      timeout: 15_000,
    });
    await expect(paragraphs.nth(1).locator('textarea')).toHaveValue(firstBefore);

    // A reordering is part of the document, so it outlives the browser.
    await page.reload();
    await waitForRouteSettled(page);
    await openDocument(page);
    await openNote(page, /Property, plant and equipment/i);
    await expect(page.getByTestId('afs-paragraph').first().locator('textarea')).toHaveValue(
      secondBefore,
      { timeout: 45_000 },
    );
    // Put it back: the one that moved down now sits second.
    await expect(page.getByTestId('afs-paragraph').nth(1).locator('textarea')).toHaveValue(
      firstBefore,
    );
    await page.getByTestId('afs-paragraph').nth(1).getByTestId('afs-piece-up').click();
    await expect(page.getByTestId('afs-paragraph').first().locator('textarea')).toHaveValue(
      firstBefore,
      { timeout: 15_000 },
    );

    // The ends of the note are the ends: nothing moves off them.
    await expect(
      page.getByTestId('afs-paragraph').first().getByTestId('afs-piece-up'),
    ).toBeDisabled();
    await expect(
      page.getByTestId('afs-paragraph').last().getByTestId('afs-piece-down'),
    ).toBeDisabled();

    await page.screenshot({ path: 'tests/e2e/artifacts/disc-10-paragraphs.png', fullPage: true });

    // ── Remove the framework's own wording, and bring it back ──────────────
    const generated = page
      .getByTestId('afs-paragraph')
      .filter({ has: page.getByTestId('afs-origin-standard') })
      .first();
    await generated.getByTestId('afs-piece-remove').click();
    await expect(generated).toHaveAttribute('data-hidden', 'true', { timeout: 15_000 });
    await expect(generated).toContainText(/Not in this document/i);
    await generated.getByTestId('afs-piece-restore').click();
    await expect(generated).not.toHaveAttribute('data-hidden', 'true', { timeout: 15_000 });

    // ── A table of the preparer's own ──────────────────────────────────────
    const tables = page.getByTestId('afs-note-table');
    const tablesBefore = await tables.count();
    await page.getByTestId('afs-add-table').click();
    await expect(tables).toHaveCount(tablesBefore + 1, { timeout: 45_000 });
    // It opens in the spreadsheet, not the old plain editor.
    await expect(tables.last().getByTestId('afs-spreadsheet')).toBeVisible();

    await tables.last().getByTestId('afs-piece-delete').click();
    await page.getByTestId('afs-piece-delete-confirm').click();
    await expect(tables).toHaveCount(tablesBefore, { timeout: 45_000 });

    await page.screenshot({ path: 'tests/e2e/artifacts/disc-11-tables.png', fullPage: true });
  } finally {
    // ── Delete the paragraph this test added ───────────────────────────────
    await openDocument(page);
    await openNote(page, /Property, plant and equipment/i);
    for (let i = 0; i < 8; i += 1) {
      const mine = page
        .getByTestId('afs-paragraph')
        .filter({ hasText: /Reviewed by the engagement partner/ })
        .first();
      if (!(await mine.isVisible().catch(() => false))) break;
      await mine.getByTestId('afs-piece-delete').click();
      await page.getByTestId('afs-piece-delete-confirm').click();
      await expect(mine).toBeHidden({ timeout: 45_000 });
    }

    // ── And put the note back as it was found ──────────────────────────────
    await bringBackWithheld(page);
    // ── The order, too ──────────────
    //
    // A reordering is saved against the engagement, so a run that failed
    // halfway through left this company's property note permanently rearranged.
    // Restoring here rather than on the happy path is the difference between a
    // test that cleans up and a test that only cleans up when it passes.
    await restoreParagraphOrder(page, orderBefore);
  }

  await expectNoErrorBoundary(page);
});

/**
 * Every note, not just the one the other tests happen to use.
 *
 * This is the test that was missing. The suite exercised the property note —
 * which the disclosure engine generates, and which therefore takes a different
 * path from most of the document — and passed while adding a table to any other
 * note destroyed that note's wording and its existing table. A note had no row
 * of its own until something in it was saved, and the assembler, finding a row
 * with one table in it, discarded everything the framework supplied.
 *
 * So: walk the whole document, and prove that adding to a note only ever adds.
 */
test('every note has the same editor, and adding to one takes nothing away', async ({ page }) => {
  await openDocument(page);
  const nav = page.getByRole('navigation', { name: /document structure/i });
  const notes = nav.getByTestId('afs-tree-note');
  const total = await notes.count();
  expect(total).toBeGreaterThan(5);

  let richest = { index: 0, tables: 0, paragraphs: 0, title: '' };

  for (let i = 0; i < total; i += 1) {
    const row = notes.nth(i);
    const title = (await row.innerText()).replace(/\s+/g, ' ').slice(0, 44);
    await row.click();
    await expect(page.getByTestId('afs-add-table')).toBeVisible({ timeout: 45_000 });

    // One table editor, everywhere. The old grid had no formatting, no
    // clipboard and no keyboard, and which one you got depended on the note.
    await expect(
      page.getByTestId('afs-table-editor'),
      `${title} fell back to the old table editor`,
    ).toHaveCount(0);

    const tables = await page.getByTestId('afs-note-table').count();
    const paragraphs = await page.getByTestId('afs-paragraph').count();
    if (tables + paragraphs > richest.tables + richest.paragraphs) {
      richest = { index: i, tables, paragraphs, title };
    }

    // Where there is a table, it is a real one that can be worked in.
    const grid = page.getByTestId('afs-spreadsheet').first();
    if (await grid.isVisible().catch(() => false)) {
      const before = await grid.locator('tbody tr').count();
      await grid.getByTestId('ss-add-row').click();
      await expect(grid.locator('tbody tr'), `${title} could not add a row`).toHaveCount(
        before + 1,
        { timeout: 15_000 },
      );
      await grid.getByTestId('ss-undo').click();
      await expect(grid.locator('tbody tr')).toHaveCount(before, { timeout: 15_000 });
    }
  }

  // Now add a table to the note with the most to lose, and prove it lost none.
  expect(richest.tables + richest.paragraphs).toBeGreaterThan(1);
  await notes.nth(richest.index).click();
  await expect(page.getByTestId('afs-add-table')).toBeVisible({ timeout: 45_000 });

  try {
    await page.getByTestId('afs-add-table').click();
    await expect(page.getByTestId('afs-note-table')).toHaveCount(richest.tables + 1, {
      timeout: 60_000,
    });
    // The wording is still there. It used to be deleted outright.
    await expect(
      page.getByTestId('afs-paragraph'),
      `${richest.title} lost wording when a table was added`,
    ).toHaveCount(richest.paragraphs);
  } finally {
    const added = page
      .getByTestId('afs-note-table')
      .filter({ has: page.locator('input[value="New table"]') })
      .first();
    if (await added.isVisible().catch(() => false)) {
      await added.getByTestId('afs-piece-delete').click();
      await page.getByTestId('afs-piece-delete-confirm').click();
      await expect(page.getByTestId('afs-note-table')).toHaveCount(richest.tables, {
        timeout: 60_000,
      });
    }
  }

  await page.screenshot({ path: 'tests/e2e/artifacts/disc-12-every-note.png', fullPage: true });
  await expectNoErrorBoundary(page);
});

/**
 * Last, because the test above needs the row it removes.
 *
 * The receivables note is where "an edit survives a rebuild" is proved, so a
 * saved row has to exist while that runs. It does not have to outlive the run.
 */
test('the company is left as it was found', async ({ page }) => {
  await removeAuthoredRows(page, /Trade and other receivables/i, /^Retention debtor \d+/);
  await removeAuthoredRows(page, /Property, plant and equipment/i, /^Leasehold \d+/);
  await expectNoErrorBoundary(page);
});
