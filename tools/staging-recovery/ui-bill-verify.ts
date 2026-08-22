/**
 * Verifies the Bill workflow fixes through the production browser:
 *
 *   A. an incomplete bill now REPORTS why instead of silently doing nothing
 *   B. a complete bill records, posts a journal, and moves AP
 *   C. the line-item account survives being selected (no flicker/reset)
 *
 * Real transactions. The bill it creates is voided at the end and the AP
 * balance is checked back to its opening value.
 *
 *   npx tsx tools/staging-recovery/ui-bill-verify.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect, invoke } from './edgeProbe';

const BASE_URL = process.env.SR_BASE_URL || 'https://adminless-fin.vercel.app';
const OUT_DIR = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/ui-bill-verify');

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Ledger-side client, to read AP before and after.
  const TARGET = process.argv[2] || 'Spaceman';
  const { supabase: api, company } = await connect(TARGET);
  const company_id = company.id;
  // The browser follows the server-side active company, so set it here rather
  // than driving the switcher widget.
  await api.functions.invoke('settings', {
    body: { method: 'SWITCH_COMPANY', target_company_id: company_id },
  });
  const coa = await invoke(api, 'chart-of-accounts', { method: 'GET', company_id });
  const accounts = (coa.body as Array<Record<string, unknown>>) ?? [];
  const ap = accounts.find((a) => a.account_role === 'trade_payable') ?? accounts.find((a) => a.type === 'Liability');
  const apId = String(ap?.id);
  const apBalance = async () => {
    const r = await api.rpc('get_balances_as_of_date', { p_end_date: '2099-12-31', p_company_id: company_id });
    return Number((r.data as Array<{ id: string; balance: number }>)?.find((a) => a.id === apId)?.balance ?? 0);
  };
  const openingAp = await apBalance();

  const browser = await chromium.launch();
  const page: Page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const network: Array<{ fn: string; status: number }> = [];
  page.on('response', (r) => {
    if (r.url().includes('/functions/v1/')) {
      network.push({ fn: r.url().split('/functions/v1/')[1].split('?')[0], status: r.status() });
    }
  });
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

  await page.goto(`${BASE_URL}/bills`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');

  const steps: Array<Record<string, unknown>> = [];

  // ── A. incomplete submit must explain itself ─────────────────────────────
  await page.getByRole('button', { name: /record.*bill/i }).first().click();
  await page.waitForTimeout(2500);
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('combobox').first().click();
  await page.getByRole('option').first().click();
  await page.waitForTimeout(600);
  const netBefore = network.length;
  await dlg.getByRole('button', { name: /^record bill$/i }).click();
  await page.waitForTimeout(2500);
  const bodyA = await page.locator('body').innerText();
  steps.push({
    step: 'A incomplete submit reports why',
    shows_line_message: /incomplete|required/i.test(bodyA),
    dialog_still_open: await dlg.isVisible().catch(() => false),
    sent_request: network.slice(netBefore).some((n) => n.fn === 'bills'),
    screenshot: await shot('A-incomplete-submit'),
  });

  // ── C. line account selection survives ───────────────────────────────────
  const combos = dlg.getByRole('combobox');
  const total = await combos.count();
  // Order: vendor, [item], [tax], [account], [project] per line.
  const accountCombo = combos.nth(total - 2);
  await accountCombo.click();
  await page.waitForTimeout(500);
  const optionCount = await page.getByRole('option').count();
  const chosen = await page.getByRole('option').first().innerText();
  await page.getByRole('option').first().click();
  await page.waitForTimeout(3000); // give any render loop time to overwrite it
  const afterIdle = await accountCombo.innerText();
  steps.push({
    step: 'C account selection stable (finding 6)',
    option_count: optionCount,
    chosen,
    value_after_3s_idle: afterIdle,
    value_retained: afterIdle.trim() === chosen.trim(),
    screenshot: await shot('C-account-stable'),
  });

  // ── B. complete the bill and record it ───────────────────────────────────
  const billNumber = `SR-UI-${Date.now()}`;
  await dlg.locator('input[placeholder="Vendor Inv #"]').fill(billNumber);
  await dlg.locator('input[placeholder="Description"]').first().fill('Staging recovery UI verification');
  const costInputs = dlg.locator('input[type="number"]');
  await costInputs.nth(1).fill('321.55');
  await page.waitForTimeout(500);
  const netBefore2 = network.length;
  await dlg.getByRole('button', { name: /^record bill$/i }).click();
  await page.waitForTimeout(7000);
  const bodyB = await page.locator('body').innerText();
  const billsCalls = network.slice(netBefore2).filter((n) => n.fn === 'bills');
  steps.push({
    step: 'B complete bill records',
    bills_calls: billsCalls,
    dialog_closed: !(await dlg.isVisible().catch(() => false)),
    success_toast: /recorded successfully/i.test(bodyB),
    opaque_edge_message: /Edge Function returned a non-2xx/i.test(bodyB),
    screenshot: await shot('B-recorded'),
  });

  await browser.close();

  // ── Ledger verification ──────────────────────────────────────────────────
  const afterAp = await apBalance();
  const bills = await invoke(api, 'bills', { method: 'GET', company_id });
  const created = (bills.body as Array<Record<string, unknown>>)?.find((b) => b.bill_number === billNumber);
  steps.push({
    step: 'ledger: AP moved and journal exists',
    ap_before: openingAp,
    ap_after: afterAp,
    delta: Number((afterAp - openingAp).toFixed(2)),
    expected_delta: 321.55,
    journal_entry_id: created?.journal_entry_id ?? null,
    bill_status: created?.status ?? null,
  });

  // Clean up: void it and confirm AP returns to opening.
  if (created?.id) {
    await invoke(api, 'bills', { method: 'VOID', company_id, billId: created.id });
    const restored = await apBalance();
    steps.push({
      step: 'cleanup: void restores AP',
      ap_after_void: restored,
      restored_to_opening: Math.abs(restored - openingAp) < 0.01,
    });
  }

  const report = { base_url: BASE_URL, company: company.name, steps, console_errors: consoleErrors.slice(0, 20) };
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(steps.map(({ screenshot, ...r }) => r), null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
