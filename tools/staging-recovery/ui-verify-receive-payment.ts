/**
 * Receive Payment in a real browser.
 *
 * Creates an invoice through the API so the amounts are known, then drives the
 * dialog the way a clerk would and checks the books afterwards: an allocation
 * row exists, the invoice status followed it, and the outstanding balance came
 * down by exactly what was applied.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
const BASE_URL = process.env.REPRO_BASE_URL || 'http://localhost:8083';
const OUT = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/receive-payment');
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  -- ' + detail : ''));
  if (ok) pass++; else fail++;
}

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = Date.now();

  const { supabase: api, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });

  const coa = await api.from('chart_of_accounts')
    .select('id, account_number, name, type, account_role, is_active').eq('company_id', co.id);
  const rows = coa.data ?? [];
  const ar = rows.find((a) => a.account_role === 'trade_receivable')!;
  const income = rows.find((a) => a.type === 'Income' && a.is_active !== false)!;
  const cust = await api.from('customers').select('id, name').eq('company_id', co.id)
    .ilike('name', 'Meat and Veg').maybeSingle();
  if (!cust.data) throw new Error('Expected customer not found.');

  const invNumber = 'UIPAY-' + stamp;
  const created = await invoke(api, 'invoices', {
    method: 'CREATE_WITH_TIMESHEETS', company_id: co.id,
    invoiceData: {
      customer_id: cust.data.id, invoice_date: '2026-09-04', due_date: '2026-09-04',
      invoice_number: invNumber, accounts_receivable_id: ar.id,
      description: 'UI receive payment test ' + stamp,
      p_items: [{ description: 'UI test line', quantity: 1, unit_price: 120, income_account_id: income.id }],
    },
    timesheetIds: [],
  });
  if (!created.ok) throw new Error('Invoice create failed: ' + tech(created));
  const invRow = await api.from('invoices').select('id, status')
    .eq('company_id', co.id).eq('invoice_number', invNumber).maybeSingle();
  const invoiceId = invRow.data!.id as string;
  console.log('created ' + invNumber + ' for 120.00 (' + cust.data.name + ')');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
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

  console.log(NL + '======== THE LIST ========');
  await page.goto(BASE_URL + '/receive-payments', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'list.png'), fullPage: true });
  const listText = await page.locator('body').innerText();
  check('the customer who owes is listed', listText.includes(cust.data.name));
  check('no error boundary', !/something went wrong|unexpected error/i.test(listText));

  console.log(NL + '======== THE DIALOG ========');
  const row = page.locator('table tbody tr').filter({ hasText: cust.data.name }).first();
  await row.getByRole('button', { name: /receive payment/i }).click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, 'dialog.png'), fullPage: true });
  const dialog = page.getByRole('dialog');
  const dialogText = await dialog.innerText();

  check('it lists the open invoices to apply to', /Apply to invoices/i.test(dialogText));
  check('the new invoice is offered', dialogText.includes(invNumber), invNumber);
  check('it shows what is applied and what is left on account',
    /Applied .* of /i.test(dialogText) && /left on account/i.test(dialogText));
  check('the old free-text A\\/R picker is gone',
    !/Credit Accounts Receivable/i.test(dialogText));

  console.log(NL + '======== OVER-ALLOCATION IS BLOCKED IN THE SCREEN ========');
  await dialog.getByRole('button', { name: /leave on account/i }).click();
  await page.waitForTimeout(400);
  const invoiceBox = dialog.getByLabel('Amount to apply to ' + invNumber);
  await dialog.locator('input[type="number"]').first().fill('120');
  await invoiceBox.fill('500');
  await page.waitForTimeout(600);
  const blockedText = await dialog.innerText();
  check('it says the allocation exceeds the amount received',
    /come to more than the amount received|than it has outstanding/i.test(blockedText),
    (blockedText.match(/(come to more[^\n]*|than it has outstanding[^\n]*)/) ?? [''])[0].slice(0, 80));
  const saveDisabled = await dialog.getByRole('button', { name: /receive payment/i }).isDisabled();
  check('and Save is disabled while it is wrong', saveDisabled);

  console.log(NL + '======== A CLEAN PART PAYMENT ========');
  await invoiceBox.fill('50');
  await dialog.locator('input[type="number"]').first().fill('50');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'allocated.png'), fullPage: true });
  await dialog.getByRole('button', { name: /receive payment/i }).click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(OUT, 'after-save.png'), fullPage: true });

  const after = await api.from('invoices').select('status').eq('id', invoiceId).maybeSingle();
  check('the invoice is now partially paid', String(after.data?.status) === 'partially_paid',
    String(after.data?.status));

  const alloc = await api.from('invoice_payment_allocations')
    .select('amount, journal_entry_id').eq('invoice_id', invoiceId);
  const allocTotal = (alloc.data ?? []).reduce((t, a) => t + c(a.amount), 0);
  check('an allocation of 50 was recorded', allocTotal === 5000, String(allocTotal / 100));

  const openAfter = await invoke(api, 'payments', {
    method: 'GET_CUSTOMER_OPEN_INVOICES', company_id: co.id, customerId: cust.data.id,
  });
  const mine = ((openAfter.body as Array<{ id: string; outstanding: number }>) ?? [])
    .find((x) => x.id === invoiceId);
  check('70 is left outstanding on it', c(mine?.outstanding) === 7000, String(mine?.outstanding));

  console.log(NL + '======== THE AGE ANALYSIS FOLLOWED IT ========');
  const age = await invoke(api, 'customers', { method: 'GET_AGE_ANALYSIS', company_id: co.id, as_of: '2026-09-04' });
  if (age.ok) {
    const body = age.body as {
      parties: Array<{ party_name: string; total: number }>;
      reconciliation: { variance: number; reconciles: boolean };
    };
    const party = body.parties.find((p) => p.party_name === cust.data!.name);
    check('the debtors analysis reconciles', body.reconciliation.reconciles,
      'variance ' + body.reconciliation.variance);
    console.log('    ' + cust.data.name + ' aged total is now ' + party?.total);
  } else {
    check('the debtors analysis reconciles', false, tech(age));
  }

  console.log(NL + '======== THE PER-INVOICE DIALOG SHOWS WHAT IS LEFT ========');
  await page.goto(BASE_URL + '/invoices/' + invoiceId, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(3000);
  const detailText = await page.locator('body').innerText();
  check('the invoice detail page renders', !/something went wrong|unexpected error/i.test(detailText));
  // The button reads "Receive Balance" once part of the invoice is paid.
  await page.getByRole('button', { name: /receive (payment|balance)/i }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'invoice-dialog.png'), fullPage: true });
  const payDialog = await page.getByRole('dialog').innerText();
  check('it states what has already been received and what is outstanding',
    /already received/i.test(payDialog) && /outstanding/i.test(payDialog),
    payDialog.split(NL).slice(0, 3).join(' | ').slice(0, 120));
  const amountBox = page.getByRole('dialog').locator('input[type="number"]').first();
  check('the amount defaults to what is left, not the invoice total',
    Math.round(Number(await amountBox.inputValue()) * 100) === 7000,
    await amountBox.inputValue());
  await page.keyboard.press('Escape');

  console.log(NL + 'failed edge calls: ' + JSON.stringify(failed));
  const real = errors.filter((e) => !/favicon|LaunchDarkly|DevTools|Download the React/i.test(e));
  console.log('console errors: ' + real.length);
  for (const e of real.slice(0, 6)) console.log('  ' + e.slice(0, 160));
  await browser.close();

  console.log(NL + 'PASS ' + pass + '  FAIL ' + fail);
  console.log('test invoice: ' + invNumber);
  if (fail || failed.length) process.exit(1);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
