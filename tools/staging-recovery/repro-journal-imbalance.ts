/**
 * Does an UNBALANCED journal entry tell the user anything?
 *
 * Fills a complete, valid-looking entry whose debits and credits differ, then
 * presses Save and records every message the page shows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect } from './edgeProbe';

const NL = String.fromCharCode(10);
const BASE_URL = process.env.REPRO_BASE_URL || 'https://adminless-fin.vercel.app';
const OUT = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/journal-entry');

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const { supabase: api, company } = await connect('Spaceman');
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: company.id } });
  const before = await api.from('journal_entries').select('id', { count: 'exact', head: true }).eq('company_id', company.id);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });
  await page.goto(`${BASE_URL}/journal-entries`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /new journal entry|new entry/i }).first().click();
  await page.waitForTimeout(1500);

  const dialog = page.locator('[role="dialog"]').first();
  const selects = dialog.locator('button[role="combobox"]');
  const pick = async (i: number, optionIndex: number) => {
    await selects.nth(i).click();
    await page.waitForTimeout(600);
    await page.locator('[role="option"]').nth(optionIndex).click();
    await page.waitForTimeout(400);
  };

  // Two real accounts, one debit and one credit, but DIFFERENT amounts.
  await pick(2, 1);
  await pick(4, 2);
  await selects.nth(5).click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: /^credit$/i }).first().click();
  await page.waitForTimeout(400);
  const amounts = dialog.locator('input[type="number"]');
  await amounts.nth(0).fill('150');
  await amounts.nth(1).fill('100');
  const desc = dialog.locator('textarea').first();
  if (await desc.count()) await desc.fill(`Imbalance probe ${Date.now()}`);

  const totals = (await dialog.innerText()).split(NL).filter((l) => /total (debits|credits)/i.test(l));
  console.log('=== BEFORE SAVE ===');
  console.log('  ' + totals.join(' | '));
  await page.screenshot({ path: path.join(OUT, 'imbalance-filled.png') });

  const bodyBefore = await page.locator('body').innerText();
  const balanceLineBefore = bodyBefore.split(NL).map((l) => l.trim())
    .find((l) => /does not balance|must equal/i.test(l));
  console.log(`  balance warning shown BEFORE pressing Save: ${balanceLineBefore ? `YES -> "${balanceLineBefore}"` : 'no'}`);

  await page.getByRole('button', { name: /save entry/i }).first().click({ force: true });

  // Detect the toast by its DOM node: sonner renders [data-sonner-toast]. The
  // toast text is deliberately the same sentence as the inline warning, so a
  // text diff cannot tell them apart.
  let toastText = '';
  for (let i = 0; i < 40; i++) {
    const t = page.locator('[data-sonner-toast]');
    if (await t.count()) { toastText = (await t.first().innerText()).replace(/\s+/g, ' ').trim(); break; }
    await page.waitForTimeout(250);
  }
  console.log(`  toast raised on Save: ${toastText ? `YES -> "${toastText}"` : 'NO'}`);

  // Watch for anything new appearing for up to 15s.
  let appeared: string[] = [];
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(300);
    const now = await page.locator('body').innerText();
    const beforeLines = new Set(bodyBefore.split(NL).map((l) => l.trim()));
    appeared = now.split(NL).map((l) => l.trim()).filter((l) => l && !beforeLines.has(l));
    if (appeared.length) break;
  }

  const stillOpen = await dialog.isVisible().catch(() => false);
  console.log(NL + '=== AFTER PRESSING SAVE ===');
  console.log(`  dialog still open: ${stillOpen}`);
  console.log(`  new text on the page: ${appeared.length ? JSON.stringify(appeared.slice(0, 8)) : 'NOTHING — silent'}`);

  const bodyAfter = await page.locator('body').innerText();
  const balanceLineAfter = bodyAfter.split(NL).map((l) => l.trim())
    .find((l) => /does not balance|must equal/i.test(l));
  console.log(`  balance warning present AFTER Save : ${balanceLineAfter ? `YES -> "${balanceLineAfter}"` : 'NO'}`);
  const toastLine = appeared.find((l) => /balanc|debit|credit/i.test(l));
  console.log(`  new message appeared on Save       : ${toastLine ? `YES -> "${toastLine}"` : 'no (inline warning was already visible)'}`);
  await page.screenshot({ path: path.join(OUT, 'imbalance-after-save.png') });

  const after = await api.from('journal_entries').select('id', { count: 'exact', head: true }).eq('company_id', company.id);
  console.log(NL + `journals ${before.count} -> ${after.count} (must not change)`);
  console.log(`console errors: ${errors.length}`);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
