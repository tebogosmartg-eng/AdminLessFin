/**
 * Credit notes through the real screens, in production.
 *
 * Runs in a certification tenant that has passed Accounting Setup (posting
 * pages are gated until it has; the API-level verify-credit-notes.ts uses a
 * tenant that has not, which is why they differ). Issues a
 * credit note from the invoice page with the form pre-filled from the invoice,
 * takes the credit off the invoice, applies it again through the apply dialog,
 * downloads the PDF, and voids it -- then proves through the API that the
 * invoice is back where it started. Every step is a click a clerk would make.
 *
 *   npx tsx tools/staging-recovery/ui-verify-credit-notes.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect, invoke } from './edgeProbe';

const COMPANY = 'CERT TX 1785230675937';
const INVOICE_NUMBER = 'INV-00005';
const NL = String.fromCharCode(10);
const BASE_URL = process.env.REPRO_BASE_URL || 'https://adminless-fin.vercel.app';
const OUT = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/credit-notes');
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

  const inv = await api.from('invoices').select('id').eq('company_id', co.id).eq('invoice_number', INVOICE_NUMBER).single();
  const invoiceId = inv.data!.id as string;
  const settlement = async () =>
    (await invoke(api, 'payments', { method: 'GET_INVOICE_SETTLEMENT', company_id: co.id, invoice_id: invoiceId }))
      .body as { status: string; outstanding: number };
  const before = await settlement();
  console.log(`${INVOICE_NUMBER} before: ${before.status} ${before.outstanding}`);

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

  console.log(NL + '======== ISSUE FROM THE INVOICE ========');
  await page.goto(BASE_URL + '/invoices/' + invoiceId, { waitUntil: 'domcontentloaded' });
  await settle(page, 4000);
  const issueButton = page.getByRole('button', { name: /issue credit note/i });
  await issueButton.waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.screenshot({ path: path.join(OUT, 'invoice.png'), fullPage: false });
  const offered = await issueButton.isVisible();
  check('the invoice offers "Issue Credit Note"', offered, offered ? '' : (await page.locator('body').innerText()).slice(0, 300).replace(/s+/g, ' '));
  if (!offered) { await browser.close(); console.log(NL + 'PASS ' + pass + '  FAIL ' + fail); process.exit(1); }
  await issueButton.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText(/was for/i).waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  const dialogText = await dialog.innerText();
  check('the form opens already crediting the invoice', dialogText.includes(INVOICE_NUMBER) && /was for/i.test(dialogText), dialogText.slice(0, 160).replace(/\s+/g, ' '));
  const firstDescription = await dialog.getByLabel('Description').first().inputValue();
  check('the invoice lines are pre-filled', firstDescription.trim().length > 0, firstDescription);
  const number = await dialog.getByLabel('Number').inputValue().catch(() => '');
  console.log('  number offered: ' + number);

  await dialog.getByPlaceholder(/two units returned/i).fill('Order returned in full (browser verification)');
  await page.screenshot({ path: path.join(OUT, 'form.png'), fullPage: false });
  await dialog.getByRole('button', { name: /issue credit note/i }).click();
  await page.waitForURL(/\/credit-notes\/[0-9a-f-]{36}$/, { timeout: 60_000 }).catch(() => undefined);
  await settle(page, 4000);
  const detailUrl = page.url();
  check('issuing opens the new credit note', /\/credit-notes\/[0-9a-f-]{36}$/.test(detailUrl), detailUrl);
  const creditNoteId = detailUrl.split('/').pop()!;

  let text = await page.locator('body').innerText();
  check('the document renders', /CREDIT NOTE/.test(text) && /Reason for credit/i.test(text) && !/something went wrong/i.test(text));
  check('it is applied in full against the invoice', /Applied in full/.test(text) && text.includes(INVOICE_NUMBER));
  check('it says where the credit went', /Where this credit went/i.test(text));
  await page.screenshot({ path: path.join(OUT, 'detail-applied.png'), fullPage: true });

  const afterIssue = await settlement();
  check('the invoice is settled by the credit', afterIssue.outstanding === 0 && afterIssue.status === 'paid', `${afterIssue.status} ${afterIssue.outstanding}`);

  console.log(NL + '======== THE PDF ========');
  await page.getByRole('button', { name: /credit note pdf/i }).click();
  await page.waitForTimeout(500);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('menuitem', { name: /download/i }).click(),
  ]);
  const pdfPath = path.join(OUT, download.suggestedFilename());
  await download.saveAs(pdfPath);
  check('the download is named after the credit note', /^CreditNote_CN-\d{5}\.pdf$/.test(download.suggestedFilename()), download.suggestedFilename());
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
  check('the invoice is owed again', afterTakeOff.outstanding === before.outstanding && afterTakeOff.status === before.status, `${afterTakeOff.status} ${afterTakeOff.outstanding}`);

  await page.getByRole('button', { name: /apply to invoices/i }).first().click();
  const apply = page.getByRole('dialog');
  await apply.getByText(INVOICE_NUMBER).waitFor({ timeout: 30_000 });
  await apply.getByRole('button', { name: /apply oldest first/i }).click();
  await page.waitForTimeout(500);
  await apply.getByRole('button', { name: /^apply credit$/i }).click();
  await settle(page, 4000);
  text = await page.locator('body').innerText();
  check('the apply dialog settles the invoice again', /Applied in full/.test(text));
  const afterApply = await settlement();
  check('the ledger agrees', afterApply.outstanding === 0, `${afterApply.status} ${afterApply.outstanding}`);

  console.log(NL + '======== VOID ========');
  await page.getByRole('button', { name: /^void$/i }).click();
  const voidDialog = page.getByRole('dialog');
  const confirm = voidDialog.getByRole('button', { name: /void credit note/i });
  check('void cannot be confirmed without a reason', await confirm.isDisabled());
  await voidDialog.getByLabel('Reason').fill('Browser verification complete');
  await confirm.click();
  await settle(page, 4000);
  text = await page.locator('body').innerText();
  check('the page says voided, with the reversal', /Voided/.test(text) && /reversed by JE-/i.test(text));
  await page.screenshot({ path: path.join(OUT, 'detail-void.png'), fullPage: true });
  const afterVoid = await settlement();
  check('the invoice is back where it started', afterVoid.outstanding === before.outstanding && afterVoid.status === before.status, `${afterVoid.status} ${afterVoid.outstanding}`);

  console.log(NL + '======== THE LIST AND THE INVOICE ========');
  await page.goto(BASE_URL + '/credit-notes', { waitUntil: 'domcontentloaded' });
  await settle(page, 4000);
  text = await page.locator('body').innerText();
  check('the list shows the credit notes with totals and status', /CN-\d{5}/.test(text) && /Void/.test(text) && /On account/i.test(text));
  await page.screenshot({ path: path.join(OUT, 'list.png'), fullPage: true });

  const listRow = await invoke(api, 'credit-notes', { method: 'GET_ALL', company_id: co.id });
  const mine = (listRow.body as Array<{ id: string; status: string }>).find((r) => r.id === creditNoteId);
  check('the credit note is on record, void', mine?.status === 'void', mine?.status);

  console.log(NL + 'failed edge calls: ' + JSON.stringify(failed));
  const real = errors.filter((e) => !/favicon|LaunchDarkly|DevTools|Download the React/i.test(e));
  console.log('console errors: ' + real.length);
  for (const e of real.slice(0, 6)) console.log('  ' + e.slice(0, 200));
  await browser.close();
  console.log(NL + 'PASS ' + pass + '  FAIL ' + fail);
  if (fail || failed.length) process.exit(1);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
