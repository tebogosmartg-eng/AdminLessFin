/**
 * The Financial Statements experience, in a browser, as a user meets it.
 *
 * Every assertion here is about what is on screen: the landing page, the
 * document, an actual statement with its figures, editing narrative, notes,
 * review, the printed PDF, refresh, and switching company.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { test, expect, waitForRouteSettled, expectNoErrorBoundary } from './fixtures';
import { loadE2EEnv } from './env';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type Company = { id: string; name: string };

let admin: SupabaseClient;
let originalActive: string | null = null;
let newCompanyId: string | null = null;
const NEW_COMPANY = `AFS UX ${Date.now()}`;
/** A company with real classified accounting data. */
const DATA_COMPANY = '063d0ae0-394a-4b22-b140-087d5979633b';

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

/** Wait out the automatic build that runs the first time statements are opened. */
async function waitForDocument(page: Page) {
  await expect(page.getByRole('navigation', { name: /document structure/i })).toBeVisible({
    timeout: 180_000,
  });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await signIn();
  const s = (await edge('user-session', { method: 'GET' })) as {
    companies: Company[];
    activeCompany: { id: string };
  };
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

test('1-2-3: an existing company with a financial year opens its statements', async ({ page }) => {
  await page.goto('/');
  await waitForRouteSettled(page);
  await switchTo(page, DATA_COMPANY);

  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);

  // 5: the old empty state is gone.
  await expect(page.getByText(/No engagements yet/i)).toHaveCount(0);
  // 6: no instruction to go to Settings when a year exists.
  await expect(page.getByRole('link', { name: /set up the financial year/i })).toHaveCount(0);
  // 3: the company and year are named.
  await expect(page.getByTestId('afs-context')).toBeVisible();

  // 4: it opens the statements, not a register of engagements.
  await expect(page).toHaveURL(/\/financial-statements-workspace\/[0-9a-f-]{36}/, {
    timeout: 90_000,
  });
  await waitForDocument(page);
  await page.screenshot({ path: 'tests/e2e/artifacts/after-2-document.png', fullPage: true });
  await expectNoErrorBoundary(page);
});

test('7-9: the user can open an actual statement and see figures from the ledger', async ({ page }) => {
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  await waitForDocument(page);

  await page.getByRole('button', { name: /Statement of Financial Position/i }).first().click();
  const table = page.locator('table').first();
  await expect(table).toBeVisible({ timeout: 30_000 });

  const text = await table.innerText();
  // Real classified lines, not five type-level buckets.
  expect(text).toMatch(/Trade and Other Receivables/i);
  expect(text).toMatch(/Total Assets/i);
  // Figures that came out of the accounting records.
  const fromLedger = (await edge('financial-statements', {
    method: 'GET_STATEMENTS',
    company_id: DATA_COMPANY,
    workspace_id: page.url().split('/').pop(),
  })) as { statements: Array<{ statement_type: string; lines: Array<{ line_code: string; amount: number | null }> }> };
  const sfp = fromLedger.statements.find((s) => s.statement_type === 'financial_position');
  const totalAssets = sfp?.lines.find((l) => l.line_code === 'sfp.total_assets')?.amount ?? 0;
  const shown = text.replace(/\s| /g, '');
  const formatted = Math.abs(totalAssets).toFixed(2).replace('.', ',');
  expect(shown).toContain(formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ''));

  await page.screenshot({ path: 'tests/e2e/artifacts/after-3-statement.png', fullPage: true });
  await expectNoErrorBoundary(page);
});

test('8: narrative text is editable and survives a reload', async ({ page }) => {
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  await waitForDocument(page);

  // Open the first accounting policy.
  await page.getByRole('button', { name: /Basis of preparation/i }).first().click();
  const editor = page.locator('textarea').first();
  await expect(editor).toBeVisible({ timeout: 30_000 });

  const marker = `Edited in the browser at ${new Date().toISOString()}.`;
  const existing = await editor.inputValue();
  await editor.fill(`${marker}\n\n${existing}`.slice(0, 4000));
  await page.getByRole('button', { name: /save policy/i }).first().click();
  // That it saved is proved by it still being there after the reload below.
  await page.waitForTimeout(2500);

  // 13: refresh preserves the work.
  await page.reload();
  await waitForRouteSettled(page);
  await waitForDocument(page);
  await page.getByRole('button', { name: /Basis of preparation/i }).first().click();
  await expect(page.locator('textarea').first()).toHaveValue(new RegExp(marker.slice(0, 30)), {
    timeout: 30_000,
  });
  await page.screenshot({ path: 'tests/e2e/artifacts/after-4-editing.png', fullPage: true });
});

test('10: notes and disclosures are editable from the document', async ({ page }) => {
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  await waitForDocument(page);

  const note = page.getByRole('button', { name: /Note \d+\./ }).first();
  await expect(note).toBeVisible({ timeout: 30_000 });
  await note.click();
  await expect(page.locator('textarea').first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'tests/e2e/artifacts/after-5-note.png', fullPage: true });
  await expectNoErrorBoundary(page);
});

test('11: review and validation are visible', async ({ page }) => {
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  await waitForDocument(page);

  await page.getByTestId('afs-mode-review').click();
  await expect(page.getByText(/validation/i).first()).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: 'tests/e2e/artifacts/after-6-review.png', fullPage: true });
  await expectNoErrorBoundary(page);
});

test('12: the printed document previews as a real PDF', async ({ page }) => {
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  await waitForDocument(page);

  await page.getByTestId('afs-mode-finalise').click();
  const frame = page.locator('iframe[title="Financial statement preview"]');
  await expect(frame).toBeVisible({ timeout: 60_000 });
  const src = await frame.getAttribute('src');
  expect(src).toMatch(/^blob:/);

  // Download it and read it: a screenshot of the embedded viewer proves nothing.
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: /generate pdf/i }).click(),
  ]);
  const path = await download.path();
  const bytes = await readFile(path!);
  const text = bytes.toString('latin1');
  expect(text.slice(0, 8)).toContain('%PDF-');
  expect(bytes.length).toBeGreaterThan(5_000);
  // The statements and the entity are actually in the file.
  expect(text).toContain('Statement of Financial Position');
  expect(text).toContain('Trade and Other Receivables');
  expect(text).toContain('Basis of preparation');
  // eslint-disable-next-line no-console
  console.log(`[evidence] PDF ${download.suggestedFilename()} — ${bytes.length} bytes`);

  await page.screenshot({ path: 'tests/e2e/artifacts/after-7-pdf.png', fullPage: true });
  await expectNoErrorBoundary(page);
});

test('1: a brand-new company reaches its statements without being sent elsewhere', async ({ page }) => {
  await page.goto('/create-company');
  await waitForRouteSettled(page);
  await page.getByPlaceholder('e.g., ACME Inc.').fill(NEW_COMPANY);
  await page.getByRole('button', { name: /create company/i }).click();
  await expect(page).toHaveURL(/\/accounting-setup/, { timeout: 60_000 });
  const switcher = page.getByTestId('company-switcher');
  await expect(switcher).toHaveAttribute('data-switching', 'false', { timeout: 45_000 });
  newCompanyId = await switcher.getAttribute('data-company-id');

  // Before a financial year exists there is one honest action, not a dead end.
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  await expect(page.getByText(/No engagements yet/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /set up the financial year/i })).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/artifacts/after-1a-newco-no-year.png', fullPage: true });

  // Give it a year the way the wizard does.
  await page.goto('/accounting-setup?step=financial_calendar');
  await waitForRouteSettled(page);
  await page.getByRole('button', { name: /save settings/i }).click();
  await expect
    .poll(
      async () =>
        ((await edge('accounting', {
          method: 'GET_FINANCIAL_YEARS',
          company_id: newCompanyId,
        })) as unknown[]).length,
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);

  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  await expect(page.getByTestId('afs-prepare')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'tests/e2e/artifacts/after-1b-newco-prepare.png', fullPage: true });

  await page.getByTestId('afs-prepare').click();
  await expect(page).toHaveURL(/\/financial-statements-workspace\/[0-9a-f-]{36}/, { timeout: 90_000 });
  await waitForDocument(page);
  await page.screenshot({ path: 'tests/e2e/artifacts/after-1c-newco-document.png', fullPage: true });
  await expectNoErrorBoundary(page);
});

test('14: switching company does not leak the other company document', async ({ page }) => {
  await page.goto('/financial-statements-workspace');
  await waitForRouteSettled(page);
  await waitForDocument(page);
  const newCoUrl = page.url();

  await switchTo(page, DATA_COMPANY);
  await waitForRouteSettled(page);
  expect(page.url()).not.toBe(newCoUrl);
  await waitForDocument(page);
  // The other company's document id is not on screen.
  const strayId = newCoUrl.split('/').pop()!;
  expect(await page.content()).not.toContain(strayId);
  await expectNoErrorBoundary(page);
});
