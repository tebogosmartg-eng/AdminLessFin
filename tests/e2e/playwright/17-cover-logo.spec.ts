/**
 * The entity's logo on the AFS cover: uploaded from the document's Cover
 * page, shown there, and switchable off for this set of statements.
 *
 * The logo used is drawn here — a plain mark for the demo entity — so the
 * test depends on no file and no real organisation's branding.
 */
import type { Page } from '@playwright/test';
import { test, expect, waitForRouteSettled, expectNoErrorBoundary } from './fixtures';

const COMPANY = 'ed2f2a92-a8f4-4496-a6fe-51d68bf9ba03';

async function switchTo(page: Page, companyId: string) {
  const trigger = page.getByTestId('company-switcher');
  await expect(trigger).toBeEnabled({ timeout: 30_000 });
  if ((await trigger.getAttribute('data-company-id')) === companyId) return;
  await trigger.click();
  await page.locator(`[data-testid="company-option"][data-company-id="${companyId}"]`).click();
  await expect(trigger).toHaveAttribute('data-company-id', companyId, { timeout: 45_000 });
  await expect(trigger).toHaveAttribute('data-switching', 'false', { timeout: 45_000 });
}

/** A PNG logo with a transparent background, drawn in the browser. */
async function drawLogo(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 720;
    c.height = 260;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0f5132';
    g.beginPath();
    g.moveTo(130, 20);
    g.lineTo(230, 130);
    g.lineTo(130, 240);
    g.lineTo(30, 130);
    g.closePath();
    g.fill();
    g.fillStyle = '#20c997';
    g.beginPath();
    g.arc(130, 130, 48, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0f5132';
    g.font = 'bold 92px Arial';
    g.fillText('PROTEA', 260, 140);
    g.fillStyle = '#20c997';
    g.font = '40px Arial';
    g.fillText('trading solutions', 262, 200);
    return c.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(base64, 'base64');
}

test('the company logo is uploaded on the cover and prints above the name', async ({ page }) => {
  test.setTimeout(400_000);
  await page.goto('/');
  await waitForRouteSettled(page);
  await switchTo(page, COMPANY);
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

  await nav.getByRole('button', { name: 'Cover', exact: true }).click();
  const control = page.getByTestId('afs-cover-logo');
  await expect(control).toBeVisible({ timeout: 60_000 });

  await page.getByTestId('afs-cover-logo-input').setInputFiles({
    name: 'protea-logo.png',
    mimeType: 'image/png',
    buffer: await drawLogo(page),
  });
  await expect(page.getByTestId('afs-cover-logo-image')).toBeVisible({ timeout: 60_000 });
  // Read and embedded: the switch is live and on.
  const sw = page.getByTestId('afs-cover-logo-switch');
  await expect(sw).toBeEnabled({ timeout: 120_000 });
  await expect(sw).toHaveAttribute('data-state', 'checked');
  await expect(control).toContainText('Printed centred above the company name');
  await page.screenshot({ path: 'tests/e2e/artifacts/logo-1-cover-editor.png', fullPage: true });

  // Off for this set, then back on.
  await sw.click();
  await expect(control).toContainText('Switched off by you', { timeout: 30_000 });
  await sw.click();
  await expect(control).toContainText('Printed centred above the company name', { timeout: 30_000 });
  await expectNoErrorBoundary(page);
});
