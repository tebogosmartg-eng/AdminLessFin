import { test, expect, waitForRouteSettled, expectNoErrorBoundary } from './fixtures';

/**
 * Compliance & Governance — the admin journey end to end (ADR-0004).
 *
 * Runs only against a build with VITE_COMPLIANCE_MODULE=true (and the
 * backend deployed); otherwise /compliance redirects home and the suite
 * skips itself. Uses the accounting-complete company the other specs pin.
 */

const READY_COMPANY = 'CERT TX 1785230675937';

// A minimal valid PDF, so the private upload path is exercised for real.
const PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

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

async function openCompliance(page: import('@playwright/test').Page) {
  await page.goto('/');
  await waitForRouteSettled(page);
  await ensureReadyCompany(page);
  await page.goto('/compliance');
  await page.waitForURL(/\/(compliance|$)/, { timeout: 30_000 });
  await waitForRouteSettled(page);
  if (!/\/compliance/.test(new URL(page.url()).pathname)) {
    test.skip(true, 'Compliance module is not enabled in this build (VITE_COMPLIANCE_MODULE).');
  }
}

async function answerQuestionnaire(page: import('@playwright/test').Page) {
  await expect(page.getByRole('heading', { name: 'Compliance profile' })).toBeVisible({ timeout: 30_000 });

  // The header company switcher is also a combobox, so stay inside the page body.
  const main = page.getByRole('main');

  // Step 1 — the business.
  await main.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /Private company/ }).click();
  await main.locator('input[type="date"]').fill('2019-03-15');
  await main.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'General business' }).click();
  await main.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/step=activities/);

  // Step 2 — activities: none of the special ones; personal information yes.
  const groups = main.getByRole('radiogroup');
  const count = await groups.count();
  for (let i = 0; i < count - 1; i++) await groups.nth(i).getByRole('radio').nth(1).click();
  await groups.nth(count - 1).getByRole('radio').first().click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/step=registrations/);

  // Step 3 — only what the records do not already answer.
  const registered = page.getByLabel('Not registered for VAT');
  if (await registered.count()) await registered.click();
  const premises = page.getByText('Does the business operate from its own premises');
  if (await premises.count()) {
    await main.getByRole('radiogroup').first().getByRole('radio').first().click();
  }
  const employs = page.getByText('Does the business employ anyone?');
  if (await employs.count()) {
    await main.getByRole('radiogroup').last().getByRole('radio').nth(1).click();
  }
  await page.getByRole('button', { name: /Save and see my obligations/ }).click();
  await expect(page).toHaveURL(/\/compliance$/, { timeout: 45_000 });
}

test.describe.configure({ mode: 'serial' });

test.describe('Compliance & Governance', () => {
  test('profile → obligations with server-computed dates', async ({ page, diagnostics }) => {
    await openCompliance(page);
    // /compliance redirects to the questionnaire only after the overview loads.
    const home = page.getByRole('heading', { name: 'Compliance & Governance', exact: true });
    const questionnaire = page.getByRole('heading', { name: 'Compliance profile', exact: true });
    await expect(home.or(questionnaire)).toBeVisible({ timeout: 30_000 });
    if (await questionnaire.isVisible()) {
      await answerQuestionnaire(page);
    } else {
      // Already profiled: saving the answers again must be harmless.
      await page.getByRole('link', { name: /Edit profile/ }).click();
      await answerQuestionnaire(page);
    }
    await expect(page.getByRole('heading', { name: 'Compliance & Governance' })).toBeVisible();
    await page.getByRole('tab', { name: 'All' }).click();
    await expect(page.getByRole('button', { name: /CIPC annual return/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/awaiting professional review/i)).toBeVisible();
    await expect(page.getByText(/Compliant\b/)).toHaveCount(0);
    await expectNoErrorBoundary(page);
    expect(diagnostics.failedRequests).toEqual([]);
  });

  test('guidance, proof required, private upload, completion opens the next period', async ({ page, diagnostics }) => {
    await openCompliance(page);
    await page.getByRole('tab', { name: 'All' }).click();
    await page.getByRole('button', { name: /CIPC annual return/ }).click();
    await expect(page.getByRole('heading', { name: 'CIPC annual return' })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Guidance' }).click();
    await expect(page.getByRole('heading', { name: 'What is this?' })).toBeVisible();
    await expect(page.getByText(/not legal or tax advice/i).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'What is this?' })).toBeHidden();
    await expect(page.getByTestId('compliance-period').first()).toBeVisible({ timeout: 20_000 });

    // Earlier runs leave periods completed, and only one upcoming period is
    // ever shown, so reopen everything and work on the oldest period.
    const reopenButtons = page.getByRole('button', { name: 'Reopen', exact: true });
    for (let n = await reopenButtons.count(); n > 0; n = await reopenButtons.count()) {
      await reopenButtons.last().click();
      const re = page.getByRole('dialog', { name: /Reopen this period/ });
      await re.getByLabel(/Reason/).fill('E2E: reset');
      await re.getByRole('button', { name: 'Reopen' }).click();
      await expect(re).toBeHidden({ timeout: 30_000 });
      await expect(reopenButtons).toHaveCount(n - 1, { timeout: 30_000 });
    }

    const openPeriod = page
      .getByTestId('compliance-period')
      .filter({ has: page.getByRole('button', { name: 'Mark completed' }) })
      .last();
    await expect(openPeriod).toBeVisible();
    const periodTitle = (await openPeriod.getByTestId('compliance-period-title').innerText()).trim();

    const removeButtons = openPeriod.getByRole('button', { name: /^Remove / });
    for (let n = await removeButtons.count(); n > 0; n = await removeButtons.count()) {
      await removeButtons.first().click();
      const rm = page.getByRole('dialog', { name: /Remove this proof/ });
      await rm.getByLabel(/Reason/).fill('E2E: reset');
      await rm.getByRole('button', { name: 'Remove' }).click();
      await expect(rm).toBeHidden({ timeout: 30_000 });
      await expect(removeButtons).toHaveCount(n - 1, { timeout: 30_000 });
    }
    const completedBefore = await page.locator('[data-testid="compliance-period"][data-status="completed"]').count();

    // The rule requires proof: completing without it is refused by the server.
    await openPeriod.getByRole('button', { name: 'Mark completed' }).click();
    const refused = page.getByRole('dialog', { name: /Mark this period completed/ });
    await refused.getByRole('button', { name: 'Mark completed' }).click();
    await expect(refused.getByRole('alert')).toContainText(/proof/i, { timeout: 20_000 });
    await refused.getByRole('button', { name: 'Cancel' }).click();

    await openPeriod.getByRole('button', { name: 'Upload' }).click();
    const up = page.getByRole('dialog', { name: 'Upload proof' });
    await up.locator('input[type="file"]').setInputFiles({ name: 'cipc-confirmation.pdf', mimeType: 'application/pdf', buffer: PDF });
    await up.getByRole('button', { name: 'Upload' }).click();
    await expect(up).toBeHidden({ timeout: 45_000 });
    await expect(openPeriod.getByRole('button', { name: 'Remove cipc-confirmation' })).toBeVisible({ timeout: 20_000 });

    await openPeriod.getByRole('button', { name: 'Mark completed' }).click();
    const dlg = page.getByRole('dialog', { name: /Mark this period completed/ });
    await dlg.getByLabel(/Note/).fill('E2E: filed');
    await dlg.getByRole('button', { name: 'Mark completed' }).click();
    await expect(dlg).toBeHidden({ timeout: 30_000 });

    // The period is kept as completed, the history records it, and the next
    // period is open.
    await expect(page.locator('[data-testid="compliance-period"][data-status="completed"]')).toHaveCount(completedBefore + 1, { timeout: 30_000 });
    await expect(
      page.locator('[data-testid="compliance-period"][data-status="completed"]').filter({ hasText: periodTitle }),
    ).toHaveCount(1);
    await expect(page.getByText('Marked completed').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark completed' }).first()).toBeVisible();
    await expectNoErrorBoundary(page);
    expect(diagnostics.failedRequests).toEqual([]);
  });

  test('not applicable needs a reason and can be undone', async ({ page }) => {
    await openCompliance(page);
    await page.getByRole('tab', { name: 'All' }).click();
    await page.getByRole('button', { name: /B-BBEE certificate/ }).click();
    await expect(page.getByRole('heading', { name: /B-BBEE certificate/ })).toBeVisible({ timeout: 20_000 });

    const trackAgain = page.getByRole('button', { name: /Track it again|It applies/ });
    if (await trackAgain.count()) await trackAgain.first().click();

    await page.getByRole('button', { name: 'Mark not applicable' }).click();
    const dlg = page.getByRole('dialog', { name: /Mark as not applicable/ });
    await dlg.getByRole('button', { name: 'Mark not applicable' }).click();
    await expect(dlg.getByRole('alert')).toContainText(/required/i);
    await dlg.getByLabel(/Why it does not apply/).fill('We do not tender and no customer has asked for one.');
    await dlg.getByRole('button', { name: 'Mark not applicable' }).click();
    await expect(page.getByText('Marked not applicable').first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Track it again' }).click();
    await expect(page.getByRole('button', { name: 'Mark not applicable' })).toBeVisible({ timeout: 30_000 });
  });

  test('the Operations Calendar shows compliance deadlines to an owner', async ({ page }) => {
    await openCompliance(page);
    await page.goto('/calendar');
    await waitForRouteSettled(page);
    await expect(page.getByRole('button', { name: /Compliance deadline/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Compliance deadlines could not be loaded/)).toHaveCount(0);
  });
});
