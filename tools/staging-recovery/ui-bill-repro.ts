/**
 * Findings 5-9 — reproduce the Bill workflow through the ACTUAL browser UI on
 * production, capturing console, network, status codes, request payloads and
 * response bodies. This is the layer the staging findings came from; the edge
 * API already passes every payload shape when called directly.
 *
 *   npx tsx tools/staging-recovery/ui-bill-repro.ts [companyName]
 *
 * Writes tests/e2e/evidence/staging-recovery/ui-bill-repro.json + screenshots
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page, type Request } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const BASE_URL = process.env.SR_BASE_URL || 'https://adminless-fin.vercel.app';
const OUT_DIR = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/ui-bill');
const TARGET = process.argv[2] || 'Spaceman';

type Net = {
  method: string;
  url: string;
  fn: string;
  status: number | null;
  requestBody: unknown;
  responseBody: unknown;
};

function fnName(url: string) {
  const m = url.match(/\/functions\/v1\/([^?]+)/);
  return m ? m[1] : '';
}

async function capture(page: Page) {
  const console_: string[] = [];
  const pageErrors: string[] = [];
  const network: Net[] = [];

  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console_.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/functions/v1/')) return;
    const req: Request = res.request();
    let requestBody: unknown = null;
    try { requestBody = JSON.parse(req.postData() || 'null'); } catch { requestBody = req.postData(); }
    let responseBody: unknown = null;
    try { responseBody = await res.json(); } catch { responseBody = await res.text().catch(() => null); }
    network.push({
      method: req.method(),
      url,
      fn: fnName(url),
      status: res.status(),
      requestBody,
      responseBody,
    });
  });

  return { console_, pageErrors, network };
}

async function switchCompany(page: Page, name: string) {
  const switcher = page.locator('header button, [data-testid="company-switcher"]').first();
  await switcher.click({ timeout: 15_000 }).catch(() => undefined);
  const item = page.getByRole('menuitem', { name: new RegExp(name, 'i') }).first();
  if (await item.isVisible({ timeout: 5000 }).catch(() => false)) {
    await item.click();
    await page.waitForTimeout(3000);
  }
}

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const cap = await capture(page);
  const steps: Array<Record<string, unknown>> = [];
  const shot = async (n: string) => {
    const p = path.join(OUT_DIR, `${n}.png`);
    await page.screenshot({ path: p, fullPage: true });
    return p;
  };

  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });

  await switchCompany(page, TARGET);

  // ── Bills list ───────────────────────────────────────────────────────────
  await page.goto(`${BASE_URL}/bills`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const listText = await page.locator('body').innerText();
  steps.push({
    step: 'bills list',
    url: page.url(),
    blocked_by_readiness: /Posting is temporarily unavailable/i.test(listText),
    has_record_button: await page.getByRole('button', { name: /record.*bill|new bill|add bill/i }).first().isVisible().catch(() => false),
    screenshot: await shot('01-bills-list'),
  });

  // ── Open the Record Bill dialog ──────────────────────────────────────────
  const recordBtn = page.getByRole('button', { name: /record.*bill|new bill|add bill/i }).first();
  if (await recordBtn.isVisible().catch(() => false)) {
    await recordBtn.click();
    await page.waitForTimeout(2500);
    const dialogVisible = await page.getByRole('dialog').isVisible().catch(() => false);
    steps.push({ step: 'open dialog', dialogVisible, screenshot: await shot('02-dialog') });

    if (dialogVisible) {
      const dlg = page.getByRole('dialog');
      const dialogText = await dlg.innerText();

      // Count how many times the account combobox re-renders while idle —
      // the "flicker" finding.
      const comboboxes = dlg.getByRole('combobox');
      const comboCount = await comboboxes.count();
      const before = await dlg.innerHTML();
      await page.waitForTimeout(4000);
      const after = await dlg.innerHTML();

      steps.push({
        step: 'idle stability (finding 6)',
        comboboxCount: comboCount,
        dialog_html_changed_while_idle: before !== after,
        warns_missing_trade_payable: /Trade Payables control account/i.test(dialogText),
        screenshot: await shot('03-idle'),
      });

      // Fill it the way a customer would.
      const netBefore = cap.network.length;
      try {
        await dlg.getByRole('combobox').first().click();
        await page.getByRole('option').first().click();
        await page.waitForTimeout(800);

        const desc = dlg.locator('input[name*="description"], textarea').first();
        if (await desc.isVisible().catch(() => false)) await desc.fill('Staging recovery UI bill');

        // Line item account selector — the one reported as flickering.
        const accountCombos = dlg.getByRole('combobox');
        const n = await accountCombos.count();
        const lineCombo = accountCombos.nth(Math.min(2, n - 1));
        await lineCombo.click();
        await page.waitForTimeout(600);
        const optCount = await page.getByRole('option').count();
        await page.getByRole('option').first().click();
        await page.waitForTimeout(1200);
        const stillSelected = await lineCombo.innerText();

        steps.push({
          step: 'account selection (finding 6)',
          option_count: optCount,
          value_after_select: stillSelected,
          value_lost: /select|choose|^$/i.test(stillSelected.trim()),
          screenshot: await shot('04-account-selected'),
        });
      } catch (e) {
        steps.push({ step: 'fill form', error: String(e), screenshot: await shot('04-fill-error') });
      }

      // Submit
      const save = dlg.getByRole('button', { name: /save|record|create/i }).last();
      if (await save.isVisible().catch(() => false)) {
        await save.click();
        await page.waitForTimeout(6000);
        const afterText = await page.locator('body').innerText();
        steps.push({
          step: 'submit',
          dialog_still_open: await page.getByRole('dialog').isVisible().catch(() => false),
          toast_error: /Error:/.test(afterText),
          edge_function_message: /Edge Function returned a non-2xx status code/i.test(afterText),
          visible_validation: /required/i.test(afterText),
          new_network: cap.network.slice(netBefore).map((x) => ({ fn: x.fn, status: x.status })),
          screenshot: await shot('05-after-submit'),
        });
      }
    }
  }

  const billsCalls = cap.network.filter((n) => n.fn === 'bills');
  const failedCalls = cap.network.filter((n) => (n.status ?? 200) >= 400);

  const report = {
    base_url: BASE_URL,
    company: TARGET,
    steps,
    console_errors: cap.console_.slice(0, 40),
    page_errors: cap.pageErrors,
    bills_calls: billsCalls.map((c) => ({
      status: c.status,
      method: (c.requestBody as { method?: string })?.method,
      responseBody: c.responseBody,
    })),
    failed_calls: failedCalls.map((c) => ({ fn: c.fn, status: c.status, response: c.responseBody })),
    // Every distinct edge call, to see repeated queries behind the flicker.
    call_counts: Object.entries(
      cap.network.reduce<Record<string, number>>((acc, n) => {
        const k = `${n.fn}.${(n.requestBody as { method?: string })?.method ?? ''}`;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]),
  };

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ steps: report.steps, failed_calls: report.failed_calls, call_counts: report.call_counts.slice(0, 12), console_errors: report.console_errors.slice(0, 8) }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
