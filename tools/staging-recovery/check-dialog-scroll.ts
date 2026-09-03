/**
 * The scrolling fix must hold on a SHORT viewport, which is where a centred
 * dialog previously hung off both edges with no way to reach the footer.
 */
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect } from './edgeProbe';

const NL = String.fromCharCode(10);
const BASE_URL = process.env.REPRO_BASE_URL || 'http://localhost:4173';

async function main() {
  const env = loadE2EEnv();
  const { supabase: api, company } = await connect('Spaceman');
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: company.id } });

  const browser = await chromium.launch();
  for (const vp of [{ width: 1280, height: 720 }, { width: 1366, height: 640 }]) {
    const page = await browser.newPage({ viewport: vp });
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
    const box = await dialog.boundingBox();
    const info = await dialog.evaluate((el) => ({
      overflowY: getComputedStyle(el).overflowY,
      maxHeight: getComputedStyle(el).maxHeight,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    const fitsOnScreen = (box?.y ?? -1) >= 0 && (box?.y ?? 0) + (box?.height ?? 0) <= vp.height;
    const clipped = info.scrollHeight > info.clientHeight;

    // Scroll to the bottom and confirm the footer is genuinely reachable.
    await dialog.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(400);
    const save = page.getByRole('button', { name: /save entry|update entry/i }).first();
    const sBox = await save.boundingBox().catch(() => null);
    const saveReachable = !!sBox && sBox.y >= 0 && sBox.y + sBox.height <= vp.height;

    console.log(NL + `viewport ${vp.width}x${vp.height}`);
    console.log(`  dialog ${box?.height}px at y=${box?.y}; entirely on screen: ${fitsOnScreen}`);
    console.log(`  overflow-y=${info.overflowY} max-height=${info.maxHeight}`);
    console.log(`  content taller than the box (so scrolling is needed): ${clipped}`);
    console.log(`  Save button reachable after scrolling to the bottom: ${saveReachable ? 'YES' : 'NO'}`);
    await page.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
