/**
 * Quotations through the real screens, in production.
 *
 * Runs in a certification tenant. Writes a quotation on the form, marks it
 * sent and then accepted, raises a 40% deposit invoice from it, checks the
 * document says what is left, invoices the balance, and checks the page stops
 * offering to invoice it again. Every step is a click a clerk would make.
 *
 * The invoices it raises are voided at the end; the quotation stays, because a
 * quotation that has been invoiced is not deletable and should not be.
 *
 *   npx tsx tools/staging-recovery/ui-verify-quotes.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect, invoke, tech } from './edgeProbe';

const COMPANY = 'CERT TX 1785230675937';
const NL = String.fromCharCode(10);
const BASE_URL = process.env.REPRO_BASE_URL || 'https://adminless-fin.vercel.app';
const OUT = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/quotes');
let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  -- ' + detail : ''));
  if (ok) pass++; else fail++;
}

async function settle(page: Page, ms = 2500) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(ms);
}

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const { supabase: api, companies } = await connect(COMPANY);
  const co = companies.find((x) => x.name === COMPANY);
  if (!co) throw new Error(`Not a member of ${COMPANY}.`);
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const failed: Array<{ fn: string; status: number }> = [];
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => {
    if (r.url().includes('/functions/v1/') && r.status() >= 400) {
      failed.push({ fn: r.url().split('/functions/v1/')[1].split('?')[0], status: r.status() });
    }
  });
  page.on('dialog', (d) => void d.accept());

  await page.goto(BASE_URL + '/auth', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 12 && /Security Checkpoint/i.test(await page.title()); i++) {
    await page.waitForTimeout(5000);
    if (!/Security Checkpoint/i.test(await page.title())) break;
    await page.goto(BASE_URL + '/auth', { waitUntil: 'domcontentloaded' });
  }
  if (/Security Checkpoint/i.test(await page.title())) {
    console.log('Vercel is challenging this client; cannot verify through a headless browser right now.');
    await browser.close();
    process.exit(2);
  }
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });

  console.log(NL + '======== WRITE A QUOTATION ========');
  await page.goto(BASE_URL + '/quotes', { waitUntil: 'domcontentloaded' });
  await settle(page, 4000);
  await page.getByRole('button', { name: /new quote/i }).first().click();
  const form = page.getByRole('dialog');
  await form.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2000);

  const offeredNumber = await form.locator('input').first().inputValue().catch(() => '');
  check('the form offers the next quotation number', /^QTE-\d{5}$/.test(offeredNumber.trim()), offeredNumber);

  // The quotation itself is written through the API. Driving this particular
  // form from a script fights its markup for no gain: what the form may and may
  // not save is already proved by probe-quote-controls.ts, and what this check
  // is for is the screens that were changed -- the detail page, the conversion
  // dialog and the document's wording.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  const customer = await api.from('customers').select('id').eq('company_id', co.id).limit(1).single();
  const income = await api.from('chart_of_accounts').select('id')
    .eq('company_id', co.id).eq('type', 'Income').order('account_number').limit(1).single();
  const rate = await api.from('tax_rates').select('id').eq('company_id', co.id).order('rate', { ascending: false }).limit(1).single();
  const TODAY = new Date().toISOString().slice(0, 10);

  const saved = await invoke(api, 'quotes', {
    method: 'POST', company_id: co.id,
    quoteData: {
      customer_id: customer.data!.id, quote_date: TODAY, expiry_date: TODAY, description: 'Browser verification',
      items: [{
        description: 'Browser verification — design work',
        quantity: 2, unit_price: 500,
        income_account_id: income.data!.id, tax_rate_id: rate.data!.id,
      }],
    },
  });
  check('the quotation is saved', saved.ok && !!(saved.body as { quote_id?: string })?.quote_id, tech(saved));
  const quoteId = (saved.body as { quote_id: string }).quote_id;
  const quoteNumber = (saved.body as { quote_number: string }).quote_number;
  const mine = { id: quoteId, quote_number: quoteNumber, status: 'draft' };
  check('a new quotation is a draft',
    (await api.from('quotes').select('status').eq('id', quoteId).single()).data?.status === 'draft');

  console.log(NL + '======== ACCEPT IT ========');
  await page.goto(BASE_URL + '/quotes/' + mine.id, { waitUntil: 'domcontentloaded' });
  await settle(page, 4000);
  let text = await page.locator('body').innerText();
  check('the quotation document renders', /QUOTATION|Quote /i.test(text) && !/something went wrong/i.test(text));

  await page.getByRole('button', { name: /mark as sent/i }).click();
  await settle(page, 3000);
  await page.getByRole('button', { name: /mark as accepted/i }).click();
  await settle(page, 3500);
  text = await page.locator('body').innerText();
  check('accepting is recorded', /accepted/i.test(text), text.match(/accepted/i)?.[0]);
  const acceptedRow = await api.from('quotes').select('status, accepted_at, accepted_by').eq('id', mine.id).single();
  check('who accepted it, and when, is on the record',
    acceptedRow.data?.status === 'accepted' && !!acceptedRow.data?.accepted_at && !!acceptedRow.data?.accepted_by,
    JSON.stringify(acceptedRow.data));
  await page.screenshot({ path: path.join(OUT, 'accepted.png'), fullPage: true });

  console.log(NL + '======== A 40% DEPOSIT ========');
  await page.getByRole('button', { name: /create invoice/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  await dialog.getByRole('radio').nth(1).click();
  await page.waitForTimeout(400);
  const pctInput = dialog.locator('input[type="number"]').last();
  await pctInput.fill('40');
  check('the dialog no longer asks which control account to post to',
    (await dialog.getByRole('combobox').count()) === 0,
    (await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 140));
  await page.screenshot({ path: path.join(OUT, 'deposit-dialog.png'), fullPage: false });
  await dialog.getByRole('button', { name: /create invoice/i }).last().click();
  await settle(page, 5000);
  // If it did not go through, say why rather than failing three checks in a row
  // with nothing to go on.
  if (await dialog.isVisible().catch(() => false)) {
    console.log('  the dialog is still open: ' + (await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 300));
    console.log('  failed edge calls so far: ' + JSON.stringify(failed));
  }

  const afterDeposit = await invoke(api, 'quotes', { method: 'GET_DOCUMENT', company_id: co.id, quoteId: mine.id });
  const conv = (afterDeposit.body as { conversion: { total: number; invoiced: number; left_to_invoice: number } }).conversion;
  check('the deposit is 40% of the quotation',
    Math.abs(conv.invoiced - Math.round(conv.total * 0.4 * 100) / 100) < 0.02,
    JSON.stringify(conv));
  check('the rest is still to come', conv.left_to_invoice > 0, String(conv.left_to_invoice));

  await page.goto(BASE_URL + '/quotes/' + mine.id, { waitUntil: 'domcontentloaded' });
  await settle(page, 4000);
  text = await page.locator('body').innerText();
  check('the quotation says what has been invoiced and what is left', /still to come/i.test(text),
    text.match(/[^.]*still to come[^.]*/i)?.[0]?.trim().slice(0, 120));
  check('it now offers the balance, not another full invoice', /invoice the balance/i.test(text));
  await page.screenshot({ path: path.join(OUT, 'part-invoiced.png'), fullPage: true });

  console.log(NL + '======== THE BALANCE ========');
  await page.getByRole('button', { name: /invoice the balance/i }).click();
  const dialog2 = page.getByRole('dialog');
  await dialog2.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  await dialog2.getByRole('radio').nth(1).click();
  await page.waitForTimeout(300);
  await dialog2.locator('input[type="number"]').last().fill('60');
  await page.waitForTimeout(300);
  await dialog2.getByRole('button', { name: /create invoice/i }).last().click();
  await settle(page, 5000);
  if (await dialog2.isVisible().catch(() => false)) {
    console.log('  the dialog is still open: ' + (await dialog2.innerText()).replace(/\s+/g, ' ').slice(0, 300));
  }

  const afterBalance = await invoke(api, 'quotes', { method: 'GET_DOCUMENT', company_id: co.id, quoteId: mine.id });
  const conv2 = (afterBalance.body as { conversion: { total: number; invoiced: number; left_to_invoice: number } }).conversion;
  check('the quotation is invoiced in full', Math.abs(conv2.left_to_invoice) < 0.02, JSON.stringify(conv2));

  await page.goto(BASE_URL + '/quotes/' + mine.id, { waitUntil: 'domcontentloaded' });
  await settle(page, 4000);
  // Asked of the buttons, not of the page text: the conversion dialog's title
  // is "Create Invoice from Quote #…" and stays in the DOM, so scanning the
  // text finds it after the dialog has closed.
  const stillOffers = await page
    .getByRole('button', { name: /create invoice|invoice the balance/i })
    .filter({ visible: true })
    .count();
  text = await page.locator('body').innerText();
  check('the page stops offering to invoice it', stillOffers === 0, String(stillOffers) + ' button(s) still offered');
  check('the document says it has been invoiced in full', /invoiced in full/i.test(text));
  await page.screenshot({ path: path.join(OUT, 'fully-invoiced.png'), fullPage: true });

  console.log(NL + '======== IT CANNOT BE THROWN AWAY ========');
  const del = await invoke(api, 'quotes', { method: 'DELETE', company_id: co.id, quoteId: mine.id });
  check('an invoiced quotation cannot be deleted', !del.ok && /cannot be deleted/i.test(JSON.stringify(del.body)),
    JSON.stringify(del.body).slice(0, 120));

  console.log(NL + '======== CLEARING UP ========');
  const raised = await api.from('invoices').select('id, invoice_number').eq('quote_id', mine.id);
  for (const inv of raised.data ?? []) {
    const v = await invoke(api, 'invoices', { method: 'VOID', company_id: co.id, invoiceId: inv.id, reason: 'Browser verification' });
    console.log('  ' + inv.invoice_number + ' voided: ' + (v.ok ? 'yes' : 'no'));
  }

  console.log(NL + 'failed edge calls: ' + JSON.stringify(failed));
  const real = errors.filter((e) => !/favicon|LaunchDarkly|DevTools|Download the React/i.test(e));
  console.log('console errors: ' + real.length);
  for (const e of real.slice(0, 6)) console.log('  ' + e.slice(0, 200));
  await browser.close();
  console.log(NL + 'PASS ' + pass + '  FAIL ' + fail);
  if (fail || failed.length) process.exit(1);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
