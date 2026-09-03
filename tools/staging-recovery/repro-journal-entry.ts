/**
 * Reproduces the two reported Journal Entry defects against production.
 *
 *   1. Scrolling — is the dialog taller than the viewport, and is the Save
 *      button actually reachable?
 *   2. Not saving — does clicking Save do anything, and is any error shown?
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
  const { supabase: api, company } = await connect(process.argv[2] || 'Spaceman');
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: company.id } });

  const before = await api.from('journal_entries').select('id', { count: 'exact', head: true }).eq('company_id', company.id);
  console.log(`journals before: ${before.count}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  const failed: Array<{ fn: string; status: number }> = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => {
    if (r.url().includes('/functions/v1/') && r.status() >= 400) {
      failed.push({ fn: r.url().split('/functions/v1/')[1].split('?')[0], status: r.status() });
    }
  });

  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });

  await page.goto(`${BASE_URL}/journal-entries`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(2500);

  const newBtn = page.getByRole('button', { name: /new journal entry|new entry|add entry/i }).first();
  console.log(`"New Journal Entry" button present: ${await newBtn.count() > 0}`);
  await newBtn.click();
  await page.waitForTimeout(1500);

  const dialog = page.locator('[role="dialog"]').first();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  console.log(NL + '=== 1. SCROLLING ===');
  console.log(`  viewport height : ${viewport.height}`);
  console.log(`  dialog height   : ${box?.height}`);
  console.log(`  dialog top      : ${box?.y}`);
  console.log(`  dialog bottom   : ${(box?.y ?? 0) + (box?.height ?? 0)}`);
  const overflows = ((box?.y ?? 0) + (box?.height ?? 0)) > viewport.height || (box?.y ?? 0) < 0;
  console.log(`  extends beyond the viewport: ${overflows ? 'YES' : 'no'}`);
  const scrollInfo = await dialog.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { overflowY: cs.overflowY, maxHeight: cs.maxHeight, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  });
  console.log(`  computed overflow-y: ${scrollInfo.overflowY}, max-height: ${scrollInfo.maxHeight}`);
  console.log(`  scrollHeight ${scrollInfo.scrollHeight} vs clientHeight ${scrollInfo.clientHeight} -> ` +
    `${scrollInfo.scrollHeight > scrollInfo.clientHeight ? 'content is clipped' : 'fits'}`);
  const canScroll = scrollInfo.overflowY === 'auto' || scrollInfo.overflowY === 'scroll';
  console.log(`  dialog can scroll: ${canScroll ? 'YES' : 'NO'}`);

  const saveBtn = page.getByRole('button', { name: /save entry|update entry/i }).first();
  const saveBox = await saveBtn.boundingBox().catch(() => null);
  console.log(`  Save button box: ${JSON.stringify(saveBox)}`);
  const saveVisible = !!saveBox && saveBox.y >= 0 && saveBox.y + saveBox.height <= viewport.height;
  console.log(`  Save button within the viewport: ${saveVisible ? 'YES' : 'NO'}`);
  await page.screenshot({ path: path.join(OUT, 'dialog-open.png') });

  // ---- 2. Saving ----------------------------------------------------------
  console.log(NL + '=== 2. SAVING ===');
  console.log('  a) submit the form exactly as it opens (blank lines)');
  await saveBtn.click({ force: true }).catch((e) => console.log('     click failed: ' + String(e).slice(0, 80)));
  await page.waitForTimeout(2500);
  let dialogStillOpen = await dialog.count() > 0 && await dialog.isVisible().catch(() => false);
  let bodyText = await page.locator('body').innerText();
  const anyError = bodyText.split(NL).map((l) => l.trim())
    .filter((l) => /required|must equal|invalid|error|positive/i.test(l) && l.length < 120);
  console.log(`     dialog still open: ${dialogStillOpen}`);
  console.log(`     messages shown to the user: ${anyError.length ? JSON.stringify(anyError.slice(0, 6)) : 'NONE — silent no-op'}`);
  await page.screenshot({ path: path.join(OUT, 'after-blank-save.png') });

  console.log(NL + '  b) fill a valid balanced entry and save');
  const selects = dialog.locator('button[role="combobox"]');
  const n = await selects.count();
  console.log(`     comboboxes in dialog: ${n}`);
  // Layout: date, vendor, customer, then per line [account, type].
  const pickAccount = async (comboIndex: number, optionIndex: number) => {
    await selects.nth(comboIndex).click();
    await page.waitForTimeout(600);
    const opts = page.locator('[role="option"]');
    await opts.nth(optionIndex).click();
    await page.waitForTimeout(400);
  };
  try {
    await pickAccount(2, 1); // line 1 account
    await pickAccount(4, 2); // line 2 account
    const amounts = dialog.locator('input[type="number"]');
    await amounts.nth(0).fill('150');
    await amounts.nth(1).fill('150');
    // line 2 must be a credit
    await selects.nth(5).click();
    await page.waitForTimeout(500);
    await page.getByRole('option', { name: /^credit$/i }).first().click();
    await page.waitForTimeout(400);
    const desc = dialog.locator('textarea').first();
    if (await desc.count()) await desc.fill(`Repro entry ${Date.now()}`);
  } catch (e) {
    console.log('     could not fill the form: ' + String(e).slice(0, 200));
  }
  await page.screenshot({ path: path.join(OUT, 'filled.png') });
  await saveBtn.click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(6000);
  dialogStillOpen = await dialog.count() > 0 && await dialog.isVisible().catch(() => false);
  bodyText = await page.locator('body').innerText();
  const msgs = bodyText.split(NL).map((l) => l.trim())
    .filter((l) => /required|must equal|invalid|error|saved|success|positive/i.test(l) && l.length < 140);
  console.log(`     dialog still open after save: ${dialogStillOpen}`);
  console.log(`     messages: ${msgs.length ? JSON.stringify(msgs.slice(0, 6)) : 'NONE'}`);
  await page.screenshot({ path: path.join(OUT, 'after-valid-save.png') });

  const after = await api.from('journal_entries').select('id', { count: 'exact', head: true }).eq('company_id', company.id);
  console.log(NL + `journals after: ${after.count} (delta ${(after.count ?? 0) - (before.count ?? 0)})`);
  console.log(`console errors: ${errors.length}`);
  for (const e of errors.slice(0, 5)) console.log('   ' + e.slice(0, 160));
  console.log(`failed edge calls: ${JSON.stringify(failed)}`);

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
