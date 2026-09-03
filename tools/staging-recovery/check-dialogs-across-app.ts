/**
 * The height cap and overflow were added to the shared DialogContent, so this
 * checks dialogs ACROSS the app, not just the Journal Entry one: each must
 * open, sit entirely on screen, and be scrollable when its content is taller.
 *
 * Also guards the specific risk of adding overflow to a dialog: a Select
 * dropdown opened inside one must still be reachable (Radix portals it out, so
 * it should be unaffected — this proves it).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect } from './edgeProbe';

const NL = String.fromCharCode(10);
const BASE_URL = process.env.REPRO_BASE_URL || 'https://adminless-fin.vercel.app';
const OUT = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/dialogs');

type Target = { name: string; route: string; open: RegExp };

const TARGETS: Target[] = [
  { name: 'journal-entry', route: '/journal-entries', open: /new journal entry|new entry/i },
  { name: 'invoice', route: '/invoices', open: /new invoice|create invoice/i },
  { name: 'bill', route: '/bills', open: /new bill|record bill|add bill/i },
  { name: 'customer', route: '/customers', open: /new customer|add customer/i },
  { name: 'vendor', route: '/vendors', open: /new supplier|add supplier|new vendor/i },
  { name: 'product', route: '/products', open: /new item|new product|add product/i },
  { name: 'account', route: '/chart-of-accounts', open: /new account|add account/i },
  { name: 'quote', route: '/quotes', open: /new quote|new quotation/i },
  { name: 'bank-account', route: '/banking', open: /new bank account|add bank account|add account/i },
];

async function probe(page: Page, t: Target, viewport: { width: number; height: number }) {
  await page.goto(`${BASE_URL}${t.route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(2200);

  const btn = page.getByRole('button', { name: t.open }).first();
  if (!(await btn.count())) return { name: t.name, opened: false, note: 'open control not found' };
  await btn.click();
  await page.waitForTimeout(1600);

  const dialog = page.locator('[role="dialog"]').first();
  if (!(await dialog.count())) return { name: t.name, opened: false, note: 'dialog did not open' };

  const box = await dialog.boundingBox();
  const css = await dialog.evaluate((el) => ({
    overflowY: getComputedStyle(el).overflowY,
    maxHeight: getComputedStyle(el).maxHeight,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  const onScreen = (box?.y ?? -1) >= 0 && (box?.y ?? 0) + (box?.height ?? 0) <= viewport.height;
  const needsScroll = css.scrollHeight > css.clientHeight;
  const canScroll = css.overflowY === 'auto' || css.overflowY === 'scroll';

  // A Select inside the dialog must still open and be clickable.
  let selectOk: boolean | null = null;
  const combo = dialog.locator('button[role="combobox"]').first();
  if (await combo.count()) {
    await combo.click().catch(() => undefined);
    await page.waitForTimeout(700);
    selectOk = (await page.locator('[role="option"]').count()) > 0;
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(300);
  }

  await page.screenshot({ path: path.join(OUT, `${t.name}.png`) });
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(500);

  return {
    name: t.name,
    opened: true,
    height: box?.height,
    y: box?.y,
    onScreen,
    overflowY: css.overflowY,
    needsScroll,
    canScroll,
    selectOpens: selectOk,
    ok: onScreen && (!needsScroll || canScroll) && (selectOk === null || selectOk),
  };
}

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const { supabase: api, company } = await connect('Spaceman');
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: company.id } });

  const viewport = { width: 1280, height: 720 };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });

  console.log(`=== DIALOGS ACROSS THE APP @ ${viewport.width}x${viewport.height} ===`);
  const rows: Array<Record<string, unknown>> = [];
  for (const t of TARGETS) {
    const r = await probe(page, t, viewport).catch((e) => ({ name: t.name, opened: false, note: String(e).slice(0, 90) }));
    rows.push(r);
    if ((r as { opened: boolean }).opened) {
      const x = r as ReturnType<typeof Object> & Record<string, unknown>;
      console.log(
        `  ${String(x.ok ? 'OK  ' : 'CHECK')} ${t.name.padEnd(14)} h=${String(x.height).padStart(5)} y=${String(x.y).padStart(4)} ` +
        `onScreen=${x.onScreen} overflow=${x.overflowY} needsScroll=${x.needsScroll} canScroll=${x.canScroll} select=${x.selectOpens}`
      );
    } else {
      console.log(`  SKIP ${t.name.padEnd(14)} ${(r as { note?: string }).note}`);
    }
  }

  const opened = rows.filter((r) => r.opened);
  const bad = opened.filter((r) => !r.ok);
  console.log(NL + `opened ${opened.length}/${TARGETS.length}; failing: ${bad.length}`);
  console.log(`console errors: ${errors.filter((e) => !/favicon|Failed to load resource/i.test(e)).length}`);

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ at: new Date().toISOString(), viewport, rows, errors }, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
