/**
 * The whole preparation cycle on the certification company, in the browser:
 * ledger → register → statements → an authored Directors' Report →
 * manager and partner review → approval → finalise → the exported PDF.
 *
 * Evidence lands in AFS_EVIDENCE_DIR (default: test-evidence/afs-full-cycle,
 * outside playwright's own artifacts directory, which it wipes every run).
 */
import { mkdir } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect, waitForRouteSettled } from './fixtures';

const COMPANY = 'ed2f2a92-a8f4-4496-a6fe-51d68bf9ba03';
const EV = process.env.AFS_EVIDENCE_DIR || 'test-evidence/afs-full-cycle';

async function switchTo(page: Page, companyId: string) {
  const trigger = page.getByTestId('company-switcher');
  await expect(trigger).toBeEnabled({ timeout: 30_000 });
  if ((await trigger.getAttribute('data-company-id')) === companyId) return;
  await trigger.click();
  await page.locator(`[data-testid="company-option"][data-company-id="${companyId}"]`).click();
  await expect(trigger).toHaveAttribute('data-company-id', companyId, { timeout: 45_000 });
  await expect(trigger).toHaveAttribute('data-switching', 'false', { timeout: 45_000 });
}

test.describe.configure({ mode: 'serial' });

test('accounting data reaches the finalised, approved PDF', async ({ page }) => {
  test.setTimeout(900_000);
  await mkdir(EV, { recursive: true });

  await page.goto('/');
  await waitForRouteSettled(page);
  await switchTo(page, COMPANY);

  // ── 1. The ledger really carries the new postings ───────────────────────
  await page.goto('/fixed-assets');
  await waitForRouteSettled(page);
  await expect(page.getByText('Delivery vehicle — Toyota Hilux 2.4 GD-6')).toBeVisible({
    timeout: 60_000,
  });
  await page.screenshot({ path: `${EV}/01-asset-register.png`, fullPage: true });

  // The engine is idempotent: everything is depreciated to the year end
  // already, so a run to today owes nothing and posts nothing.
  await page.getByTestId('run-depreciation').click();
  await expect(
    page.getByText(/Nothing owing|Depreciation posted/, { exact: false }).first(),
  ).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${EV}/02-depreciation-idempotent.png` });

  await page.goto('/journal-entries');
  await waitForRouteSettled(page);
  const journalSearch = page.getByPlaceholder(/search/i).first();
  if (await journalSearch.isVisible().catch(() => false)) {
    await journalSearch.fill('Depreciation on');
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${EV}/03-depreciation-journals.png`, fullPage: true });

  // ── 2. Update the statements from accounting, in the product ────────────
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  const update = page.getByTestId('afs-update');
  await expect(update).toBeVisible({ timeout: 120_000 });
  await expect(update).toBeEnabled({ timeout: 120_000 });
  await update.click();
  await expect(update).toBeEnabled({ timeout: 300_000 });

  // ── 3. The accountant edits the Directors' Report in the document ───────
  const nav = page.getByRole('navigation', { name: /document structure/i });
  await expect(nav).toBeVisible({ timeout: 180_000 });
  await nav.getByRole('button', { name: "Directors' Report" }).click();
  const authoredBadge = page.getByTestId('front-authored-badge');
  await expect(authoredBadge).toBeVisible({ timeout: 60_000 });
  if ((await authoredBadge.innerText()).includes('Generated')) {
    await page.getByRole('button', { name: 'Add paragraph' }).click();
    const headings = page.getByPlaceholder('Heading (optional)');
    await headings.last().fill('9. Special resolutions');
    const bodies = page.locator('textarea');
    await bodies
      .last()
      .fill(
        'No special resolutions were passed by the company during the year under review.',
      );
    await page.getByRole('button', { name: 'Save wording' }).click();
  }
  await expect(authoredBadge).toHaveText('Edited by the practice', { timeout: 60_000 });
  await expect(page.getByPlaceholder('Heading (optional)').last()).toHaveValue('9. Special resolutions', {
    timeout: 60_000,
  });
  await page.screenshot({ path: `${EV}/04-directors-report-editor.png`, fullPage: true });

  // ── 4. Manager and partner take it through review to approval ───────────
  await page.getByTestId('afs-mode-review').click();
  const stageBadge = page.getByTestId('afs-review-stage');
  await expect(stageBadge).toBeVisible({ timeout: 120_000 });
  await expect(stageBadge).not.toHaveText('Opening review…', { timeout: 120_000 });

  const actionsFor: Record<string, string[]> = {
    Draft: ['Mark checks complete'],
    'Ready for Manager Review': ['Assign me as manager', 'Start manager review'],
    'Manager Review in Progress': ['Manager approve'],
    'Manager Approved': ['Assign me as partner', 'Start partner review'],
    'Partner Review in Progress': ['Partner approve & sign'],
    'Partner Approved': ['Mark publication ready'],
  };
  for (let guard = 0; guard < 12; guard++) {
    const stage = (await stageBadge.innerText()).trim();
    if (stage === 'Ready for Publication') break;
    const actions = actionsFor[stage];
    expect(actions, `no action mapped for review stage "${stage}"`).toBeTruthy();
    for (const [i, action] of actions!.entries()) {
      const button = page.getByRole('button', { name: action, exact: false }).first();
      await expect(button).toBeEnabled({ timeout: 60_000 });
      await button.click();
      if (i < actions!.length - 1) {
        // An assignment answers with a toast, not a stage change.
        await expect(page.getByText(/assigned/i).first()).toBeVisible({ timeout: 60_000 });
      }
    }
    await expect(stageBadge).not.toHaveText(stage, { timeout: 90_000 });
  }
  await expect(stageBadge).toHaveText('Ready for Publication', { timeout: 60_000 });
  await expect(page.getByText(/partner signed/i).first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${EV}/05-review-approved.png`, fullPage: true });

  // ── 5. Finalise: the ladder agrees, the freeze is allowed only now ──────
  await page.getByTestId('afs-mode-finalise').click();
  const ladder = page.getByTestId('afs-status-ladder');
  await expect(ladder).toBeVisible({ timeout: 120_000 });
  await expect(ladder.getByText('Approved')).toBeVisible();

  const finalise = page.getByTestId('afs-finalise-action');
  await expect(finalise).toBeEnabled({ timeout: 120_000 });
  await finalise.click();
  await expect(page.getByTestId('afs-final-state')).toContainText('Final', { timeout: 120_000 });
  await page.screenshot({ path: `${EV}/06-finalised.png`, fullPage: true });

  // ── 6. The export is the finalised document ─────────────────────────────
  const downloadPromise = page.waitForEvent('download', { timeout: 300_000 });
  await page.getByRole('button', { name: /Generate PDF/i }).click();
  const download = await downloadPromise;
  await download.saveAs(`${EV}/cert-final.pdf`);

  // ── 7. Final means read-only, in the editor too ─────────────────────────
  await page.getByTestId('afs-mode-document').click();
  await expect(page.getByTestId('afs-locked-banner')).toBeVisible({ timeout: 120_000 });
  await nav.getByRole('button', { name: "Directors' Report" }).click();
  await expect(page.getByRole('button', { name: 'Save wording' })).toBeDisabled({
    timeout: 60_000,
  });
  await page.screenshot({ path: `${EV}/07-locked-editor.png`, fullPage: true });
});
