/**
 * A paragraph the preparer adds to a note can be moved anywhere in it —
 * above, between or below the note's tables — and stays where it was put.
 * The paragraph is deleted again at the end.
 */
import type { Page } from '@playwright/test';
import { test, expect, waitForRouteSettled, expectNoErrorBoundary } from './fixtures';

const COMPANY = 'ed2f2a92-a8f4-4496-a6fe-51d68bf9ba03';
const WORDING = 'Commentary on the movement in property, plant and equipment.';

async function switchTo(page: Page, companyId: string) {
  const trigger = page.getByTestId('company-switcher');
  await expect(trigger).toBeEnabled({ timeout: 30_000 });
  if ((await trigger.getAttribute('data-company-id')) === companyId) return;
  await trigger.click();
  await page.locator(`[data-testid="company-option"][data-company-id="${companyId}"]`).click();
  await expect(trigger).toHaveAttribute('data-company-id', companyId, { timeout: 45_000 });
  await expect(trigger).toHaveAttribute('data-switching', 'false', { timeout: 45_000 });
}

async function openPpe(page: Page) {
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  const nav = page.getByRole('navigation', { name: /document structure/i });
  await expect(nav).toBeVisible({ timeout: 180_000 });
  if (await page.getByTestId('afs-locked-banner').isVisible().catch(() => false)) {
    await page.getByTestId('afs-mode-finalise').click();
    await page.getByTestId('afs-reopen').click();
    await page.getByTestId('afs-mode-document').click();
    await expect(page.getByTestId('afs-locked-banner')).toBeHidden({ timeout: 120_000 });
  }
  await nav.getByTestId('afs-tree-note').filter({ hasText: /Property, plant and equipment/i }).first().click();
  await expect(page.getByTestId('afs-note-pieces')).toBeVisible({ timeout: 60_000 });
}

/** The kinds of the note's pieces, top to bottom, with 'mine' for the added paragraph. */
async function sequence(page: Page): Promise<string[]> {
  return page.getByTestId('afs-note-pieces').evaluate((root, wording) => {
    const out: string[] = [];
    root.querySelectorAll('[data-testid="afs-paragraph"], [data-testid="afs-section"], [data-testid="afs-spreadsheet"], table').forEach((el) => {
      const t = el.getAttribute('data-testid');
      if (t === 'afs-paragraph') {
        const v = (el.querySelector('textarea') as HTMLTextAreaElement | null)?.value || '';
        out.push(v === wording ? 'mine' : 'paragraph');
      } else if (t === 'afs-section') out.push('section');
      else if (t === 'afs-spreadsheet') out.push('table');
    });
    return out;
  }, WORDING);
}

test('a paragraph added to the PPE note can be moved below its tables', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  await waitForRouteSettled(page);
  await switchTo(page, COMPANY);
  await openPpe(page);

  // A textarea's wording is its value, not its text: find paragraphs by it.
  const indexOfValue = (value: string, last = false) =>
    page.getByTestId('afs-paragraph').evaluateAll(
      (els, [v, fromEnd]) => {
        const values = els.map((el) => (el.querySelector('textarea') as HTMLTextAreaElement | null)?.value ?? null);
        return fromEnd ? values.lastIndexOf(v as string) : values.indexOf(v as string);
      },
      [value, last] as const,
    );
  const mineIndex = () => indexOfValue(WORDING);
  const mine = async () => page.getByTestId('afs-paragraph').nth(await mineIndex());

  // Leftovers from an interrupted earlier run are the preparer's own rows: delete them.
  for (let i = 0; i < 5 && (await mineIndex()) >= 0; i++) {
    const before = await page.getByTestId('afs-paragraph').count();
    await (await mine()).getByTestId('afs-piece-delete').click();
    await page.getByTestId('afs-piece-delete-confirm').click();
    await expect(page.getByTestId('afs-paragraph')).toHaveCount(before - 1, { timeout: 60_000 });
  }

  const count = await page.getByTestId('afs-paragraph').count();
  await page.getByTestId('afs-add-paragraph').click();
  await expect(page.getByTestId('afs-paragraph')).toHaveCount(count + 1, { timeout: 60_000 });
  // A new paragraph lands at the end of the note, empty.
  const fresh = page.getByTestId('afs-paragraph').nth(await indexOfValue('', true));
  await fresh.locator('textarea').fill(WORDING);
  await fresh.getByRole('button', { name: /Save paragraph/ }).click();
  await expect(page.getByText('Paragraph saved').first()).toBeVisible({ timeout: 60_000 });

  let seq = await sequence(page);
  expect(seq[seq.length - 1]).toBe('mine');

  // Up, past the tables, to the top …
  while ((await sequence(page)).indexOf('mine') > 0) {
    const before = (await sequence(page)).indexOf('mine');
    await (await mine()).getByTestId('afs-piece-up').click();
    await expect.poll(async () => (await sequence(page)).indexOf('mine'), { timeout: 30_000 }).toBe(before - 1);
  }
  await expect((await mine()).getByTestId('afs-piece-up')).toBeDisabled();
  await page.screenshot({ path: 'tests/e2e/artifacts/order-1-top.png', fullPage: true });

  // … and back down, below every table.
  while (true) {
    seq = await sequence(page);
    const at = seq.indexOf('mine');
    if (at === seq.length - 1) break;
    await (await mine()).getByTestId('afs-piece-down').click();
    await expect.poll(async () => (await sequence(page)).indexOf('mine'), { timeout: 30_000 }).toBe(at + 1);
  }
  seq = await sequence(page);
  expect(seq.lastIndexOf('table')).toBeLessThan(seq.indexOf('mine'));
  await expect((await mine()).getByTestId('afs-piece-down')).toBeDisabled();

  // It stays there after a reload — once the change has reached the server.
  await expect(page.getByTestId('afs-save-state')).toHaveAttribute('data-saving', 'false', { timeout: 60_000 });
  await page.reload();
  await openPpe(page);
  await expect.poll(async () => {
    const s = await sequence(page);
    return s.indexOf('mine') === s.length - 1 && s.includes('table') ? 'last' : JSON.stringify(s);
  }, { timeout: 60_000 }).toBe('last');
  await page.screenshot({ path: 'tests/e2e/artifacts/order-2-below-tables.png', fullPage: true });

  // Tidy up: the paragraph is the preparer's own row, so it is deleted.
  await (await mine()).getByTestId('afs-piece-delete').click();
  await page.getByTestId('afs-piece-delete-confirm').click();
  await expect.poll(mineIndex, { timeout: 60_000 }).toBe(-1);
  await expectNoErrorBoundary(page);
});
