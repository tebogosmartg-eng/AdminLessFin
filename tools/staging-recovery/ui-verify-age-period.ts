/**
 * The reporting-period control on the age analysis pages, in a real browser.
 *
 * Checks the three things the change is actually about: it defaults to the
 * Current Financial Year like every other report, changing the preset moves the
 * as-at date, and the exports follow the period rather than ignoring it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { endOfMonth, format, parse, startOfDay, subMonths } from 'date-fns';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const NL = String.fromCharCode(10);
const BASE_URL = process.env.REPRO_BASE_URL || 'http://localhost:8081';
const OUT = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/age-period');
const endOfLastMonth = endOfMonth(subMonths(new Date(), 1));
const PRESETS = [
  'Current Financial Year', 'Previous Financial Year', 'Current Quarter', 'Previous Quarter',
  'Current Month', 'Previous Month', 'Year-to-Date', 'Month-to-Date',
];
let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  -- ' + detail : ''));
  if (ok) pass++; else fail++;
}

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const failed: Array<{ fn: string; status: number }> = [];
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => {
    if (r.url().includes('/functions/v1/') && r.status() >= 400) {
      failed.push({ fn: r.url().split('/functions/v1/')[1].split('?')[0], status: r.status() });
    }
  });

  await page.goto(BASE_URL + '/auth', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });

  for (const [side, route] of [
    ['creditors', '/creditors-age-analysis'],
    ['debtors', '/debtors-age-analysis'],
  ] as const) {
    console.log(NL + '======== ' + side.toUpperCase() + ' ========');
    await page.goto(BASE_URL + route, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT, side + '-default.png'), fullPage: true });

    const text = await page.locator('body').innerText();
    const trigger = page.getByLabel('Reporting period preset');
    check('the shared period picker is on the page', await trigger.count() > 0);
    check('defaults to Current Financial Year', /Current Financial Year/.test(await trigger.innerText()),
      (await trigger.innerText()).replace(/\s+/g, ' ').trim());

    // The financial year closes in the future, so the report is aged as at today
    // and says so.
    // Same formatter the page uses, so the comparison tests the page and not
    // two different renderings of the same day.
    const todayLabel = format(new Date(), 'd MMM yyyy');
    check('aged as at today, stated in the description', text.includes('aged as at ' + todayLabel),
      todayLabel);
    check('explains that the period runs past today', /Aged as at today; the period runs to/.test(text));
    check('no error boundary', !/something went wrong|unexpected error/i.test(text));

    // Previous Month, not Previous Financial Year. This company's calendar holds
    // three overlapping open years (FY2025, FY2026 and FY2027 all open), so its
    // "previous" financial year ends 31 Dec 2026 -- also in the future, and so
    // also capped. Previous Month is unambiguously in the past.
    console.log('  --- switch to Previous Month ---');
    await trigger.click();
    await page.getByRole('option', { name: 'Previous Month' }).click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT, side + '-previous-month.png'), fullPage: true });
    const prevText = await page.locator('body').innerText();
    const prevAsOf = (prevText.match(/aged as at ([0-9]+ [A-Za-z]+ [0-9]{4})/) ?? [])[1] ?? 'not found';
    console.log('    preset now reads : ' + (await trigger.innerText()).replace(/\s+/g, ' ').trim());
    check('the as-at date follows the period', prevAsOf === format(endOfLastMonth, 'd MMM yyyy'), prevAsOf);
    check('a past period is not capped, so the note is gone',
      !/Aged as at today; the period runs to/.test(prevText));

    // The invariant the cap exists for: no preset may date this report in the
    // future, whatever the company's financial calendar looks like.
    console.log('  --- no preset dates the report in the future ---');
    let futureDated: string | null = null;
    for (const preset of PRESETS) {
      await trigger.click();
      await page.getByRole('option', { name: preset }).click();
      await page.waitForTimeout(2500);
      const t = await page.locator('body').innerText();
      const shown = (t.match(/aged as at ([0-9]+ [A-Za-z]+ [0-9]{4})/) ?? [])[1];
      if (!shown) continue;
      const parsed = parse(shown, 'd MMM yyyy', new Date());
      console.log('    ' + preset.padEnd(26) + shown);
      if (parsed.getTime() > startOfDay(new Date()).getTime()) futureDated = preset + ' -> ' + shown;
    }
    check('no preset ages the report into the future', futureDated === null, futureDated ?? 'all on or before today');

    console.log('  --- the header is one Export menu, not four buttons ---');
    const loose = await page.getByRole('button', {
      name: /^(CSV|PDF for auditors|Control account CSV|Control account PDF)$/i,
    }).count();
    check('the four export buttons are no longer loose in the header', loose === 0, 'found ' + loose);
    check('a single Export control replaces them',
      await page.getByRole('button', { name: /Export|Preparing/i }).count() === 1);
    await page.getByRole('button', { name: /Export|Preparing/i }).first().click();
    await page.waitForTimeout(600);
    for (const item of ['CSV', 'PDF for auditors', 'Control account CSV', 'Control account PDF']) {
      check('menu offers ' + item,
        await page.getByRole('menuitem', { name: new RegExp('^' + item + '$', 'i') }).count() === 1);
    }
    // Captured with the menu open, which is the thing being checked.
    await page.screenshot({ path: path.join(OUT, side + '-export-menu.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    console.log('  --- exports follow the period ---');
    await trigger.click();
    await page.getByRole('option', { name: 'Current Financial Year' }).click();
    await page.waitForTimeout(4000);
    try {
      await page.getByRole('button', { name: /Export|Preparing/i }).first().click();
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 60000 }),
        page.getByRole('menuitem', { name: /Control account CSV/i }).first().click(),
      ]);
      const file = path.join(OUT, side + '-' + dl.suggestedFilename());
      await dl.saveAs(file);
      const csv = fs.readFileSync(file, 'utf8');
      check('control account CSV downloads', fs.statSync(file).size > 0, dl.suggestedFilename());
      check('it states the period it covers', /Period covered/.test(csv),
        (csv.match(/Period covered.*/) ?? [''])[0].slice(0, 80));
      check('it opens with a brought-forward balance', /Opening balance brought forward/.test(csv));
      check('it still ties', /Difference,+0(\r|\n|$)/.test(csv.replace(/\r/g, '')) || /Difference,,,,?0/.test(csv),
        (csv.match(/Difference.*/) ?? [''])[0].slice(0, 60));
    } catch (e) {
      check('control account CSV downloads', false, String(e).slice(0, 100));
    }
  }

  console.log(NL + 'failed edge calls: ' + JSON.stringify(failed));
  const real = errors.filter((e) => !/favicon|LaunchDarkly|DevTools|Download the React/i.test(e));
  console.log('console errors: ' + real.length);
  for (const e of real.slice(0, 6)) console.log('  ' + e.slice(0, 150));
  await browser.close();
  console.log(NL + 'PASS ' + pass + '  FAIL ' + fail);
  if (fail || failed.length) process.exit(1);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
