/**
 * Supplier credits through the real screens, in production.
 *
 * Runs in a certification tenant that has passed Accounting Setup (posting
 * pages are gated until it has). Records a supplier credit from the bills page
 * with the form pre-filled from the bill, takes the credit off, applies it
 * again through the apply dialog, downloads the PDF, and voids it -- then
 * proves through the API that the bill is back where it started. Every step is
 * a click a clerk would make.
 *
 *   npx tsx tools/staging-recovery/ui-verify-vendor-credits.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect, invoke } from './edgeProbe';

const COMPANY = 'CERT TX 1785230675937';
const BILL_NUMBER = 'CBILL-23263870';
const NL = String.fromCharCode(10);
const BASE_URL = process.env.REPRO_BASE_URL || 'https://adminless-fin.vercel.app';
const OUT = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/vendor-credits');
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

  const billRow = await api.from('bills').select('id, vendor_id').eq('company_id', co.id).eq('bill_number', BILL_NUMBER).single();
  const billId = billRow.data!.id as string;
  const vendorId = billRow.data!.vendor_id as string;

  /**
   * What the bills screen itself shows for this bill: the total off its own
   * journal less what the new allocation table says has been settled. Read this
   * way on purpose -- it exercises the `settled` figure the list now depends on.
   */
  const settlement = async () => {
    const r = await invoke(api, 'bills', { method: 'GET', company_id: co.id, filters: {} });
    const row = (r.body as Array<{
      id: string; status: string; settled?: number;
      journal_entry_items?: Array<{ type: string; amount: number }>;
    }>).find((b) => b.id === billId);
    if (!row) throw new Error(`${BILL_NUMBER} is missing from the bills list.`);
    const total = (row.journal_entry_items ?? [])
      .filter((i) => i.type === 'credit')
      .reduce((t, i) => t + Number(i.amount), 0);
    const settled = Number(row.settled ?? 0);
    return { outstanding: Math.round((total - settled) * 100) / 100, status: row.status };
  };
  const before = await settlement();
  console.log(`${BILL_NUMBER} before: ${before.status} ${before.outstanding}`);

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

  console.log(NL + '======== THE BILLS PAGE ========');
  await page.goto(BASE_URL + '/bills', { waitUntil: 'domcontentloaded' });
  await settle(page, 4000);
  const row = page.getByRole('row').filter({ hasText: BILL_NUMBER }).first();
  await row.waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.screenshot({ path: path.join(OUT, 'bills.png'), fullPage: false });
  const rowText = await row.innerText().catch(() => '');
  check('the bill is listed with what is still outstanding', rowText.includes(BILL_NUMBER) && /1\s?150/.test(rowText.replace(/\u00a0/g, ' ')), rowText.replace(/\s+/g, ' ').slice(0, 160));

  await row.getByRole('button').last().click();
  const issue = page.getByRole('menuitem', { name: /issue supplier credit/i });
  await issue.waitFor({ timeout: 15_000 }).catch(() => undefined);
  const offered = await issue.isVisible();
  check('the bill offers "Issue Supplier Credit"', offered);
  if (!offered) { await browser.close(); console.log(NL + 'PASS ' + pass + '  FAIL ' + fail); process.exit(1); }
  await issue.click();

  const dialog = page.getByRole('dialog');
  await dialog.getByText(/was for/i).waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  const dialogText = await dialog.innerText();
  check('the form opens already crediting the bill', dialogText.includes(BILL_NUMBER) && /was for/i.test(dialogText), dialogText.slice(0, 160).replace(/\s+/g, ' '));
  const firstDescription = await dialog.getByLabel('Description').first().inputValue();
  check('the bill lines are pre-filled', firstDescription.trim().length > 0, firstDescription);
  const number = await dialog.getByLabel('Number').inputValue().catch(() => '');
  console.log('  number offered: ' + number);
  const vatChosen = await dialog.getByLabel('VAT rate').first().innerText().catch(() => '');
  check('the VAT rate the bill carried is chosen for the credit', !/^None$/i.test(vatChosen.trim()) && vatChosen.trim().length > 0, vatChosen.replace(/\s+/g, ' '));

  await dialog.getByPlaceholder(/two units returned/i).fill('Goods returned to supplier (browser verification)');
  await page.screenshot({ path: path.join(OUT, 'form.png'), fullPage: false });
  await dialog.getByRole('button', { name: /record supplier credit/i }).click();
  await page.waitForURL(/\/vendor-credits\/[0-9a-f-]{36}$/, { timeout: 60_000 }).catch(() => undefined);
  await settle(page, 4000);
  const detailUrl = page.url();
  check('recording opens the new supplier credit', /\/vendor-credits\/[0-9a-f-]{36}$/.test(detailUrl), detailUrl);
  const creditId = detailUrl.split('/').pop()!;

  let text = await page.locator('body').innerText();
  check('the document renders', /SUPPLIER CREDIT/.test(text) && /Reason for credit/i.test(text) && !/something went wrong/i.test(text));
  check('it is applied in full against the bill', /Applied in full/.test(text) && text.includes(BILL_NUMBER));
  check('it says where the credit went', /Where this credit went/i.test(text));
  await page.screenshot({ path: path.join(OUT, 'detail-applied.png'), fullPage: true });

  // The form is pre-filled from the bill's own lines, so the credit is for the
  // whole bill: it is settled, not part settled.
  const afterIssue = await settlement();
  check('the bill is settled by the credit', afterIssue.outstanding === 0 && afterIssue.status === 'paid', `${afterIssue.status} ${afterIssue.outstanding}`);

  console.log(NL + '======== THE PDF ========');
  await page.getByRole('button', { name: /supplier credit pdf/i }).click();
  await page.waitForTimeout(500);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('menuitem', { name: /download/i }).click(),
  ]);
  const pdfPath = path.join(OUT, download.suggestedFilename());
  await download.saveAs(pdfPath);
  check('the download is named after the credit', /^SupplierCredit_VCN-\d{5}\.pdf$/.test(download.suggestedFilename()), download.suggestedFilename());
  check('the PDF has real content', fs.statSync(pdfPath).size > 8_000, fs.statSync(pdfPath).size + ' bytes');
  const { pdf } = await import('pdf-to-img');
  let n = 0;
  for await (const image of await pdf(pdfPath, { scale: 1.5 })) { n += 1; fs.writeFileSync(path.join(OUT, 'pdf-page-' + n + '.png'), image); }
  check('it rasterises', n >= 1, n + ' page(s)');
  await page.keyboard.press('Escape');

  console.log(NL + '======== TAKE IT OFF, APPLY AGAIN ========');
  await page.getByRole('button', { name: /take off/i }).first().click();
  await settle(page, 4000);
  text = await page.locator('body').innerText();
  check('taking it off leaves it held on account', /Not yet applied/.test(text), text.match(/(Not yet applied|Applied in full|Partly applied)/)?.[0]);
  const afterTakeOff = await settlement();
  check('the bill is owed again', afterTakeOff.outstanding === before.outstanding && afterTakeOff.status === before.status, `${afterTakeOff.status} ${afterTakeOff.outstanding}`);

  await page.getByRole('button', { name: /apply to bills/i }).first().click();
  const apply = page.getByRole('dialog');
  await apply.getByText(BILL_NUMBER).waitFor({ timeout: 30_000 });
  // Typed against this bill on purpose: "Apply oldest first" would spread the
  // credit over the supplier's older open bills, which is its job.
  const creditLeft = Number(
    (await invoke(api, 'vendor-credits', { method: 'GET_ALL', company_id: co.id })
      .then((r) => (r.body as Array<{ id: string; remaining: number }>).find((x) => x.id === creditId)))?.remaining ?? 0,
  );
  await apply.getByLabel('Amount to apply to ' + BILL_NUMBER).fill(String(creditLeft));
  await page.waitForTimeout(500);
  await apply.getByRole('button', { name: /^apply credit$/i }).click();
  await settle(page, 4000);
  text = await page.locator('body').innerText();
  check('the apply dialog sets it against the bill again', /Applied in full/.test(text));
  const afterApply = await settlement();
  check('the ledger agrees', afterApply.outstanding === before.outstanding - creditLeft, `${afterApply.status} ${afterApply.outstanding}`);
  const journalId = (await api.from('vendor_credits').select('journal_entry_id').eq('id', creditId).single()).data?.journal_entry_id;
  const strays = await api.from('bill_payment_allocations')
    .select('bill_id').eq('company_id', co.id).eq('journal_entry_id', journalId).neq('bill_id', billId);
  check('no other bill was touched by this credit', (strays.data ?? []).length === 0, JSON.stringify(strays.data));

  console.log(NL + '======== VOID ========');
  await page.getByRole('button', { name: /^void$/i }).click();
  const voidDialog = page.getByRole('dialog');
  const confirm = voidDialog.getByRole('button', { name: /void supplier credit/i });
  check('void cannot be confirmed without a reason', await confirm.isDisabled());
  await voidDialog.getByLabel('Reason').fill('Browser verification complete');
  await confirm.click();
  await settle(page, 4000);
  text = await page.locator('body').innerText();
  check('the page says voided, with the reversal', /Voided/.test(text) && /reversed by JE-/i.test(text));
  await page.screenshot({ path: path.join(OUT, 'detail-void.png'), fullPage: true });
  const afterVoid = await settlement();
  check('the bill is back where it started', afterVoid.outstanding === before.outstanding && afterVoid.status === before.status, `${afterVoid.status} ${afterVoid.outstanding}`);

  console.log(NL + '======== THE LIST ========');
  await page.goto(BASE_URL + '/vendor-credits', { waitUntil: 'domcontentloaded' });
  await settle(page, 4000);
  text = await page.locator('body').innerText();
  check('the list shows the supplier credits with totals and status', /VCN-\d{5}/.test(text) && /Void/.test(text) && /On account/i.test(text));
  await page.screenshot({ path: path.join(OUT, 'list.png'), fullPage: true });

  const listRow = await invoke(api, 'vendor-credits', { method: 'GET_ALL', company_id: co.id });
  const mine = (listRow.body as Array<{ id: string; status: string }>).find((r) => r.id === creditId);
  check('the supplier credit is on record, void', mine?.status === 'void', mine?.status);

  console.log(NL + 'failed edge calls: ' + JSON.stringify(failed));
  const real = errors.filter((e) => !/favicon|LaunchDarkly|DevTools|Download the React/i.test(e));
  console.log('console errors: ' + real.length);
  for (const e of real.slice(0, 6)) console.log('  ' + e.slice(0, 200));
  await browser.close();
  console.log(NL + 'PASS ' + pass + '  FAIL ' + fail);
  if (fail || failed.length) process.exit(1);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
