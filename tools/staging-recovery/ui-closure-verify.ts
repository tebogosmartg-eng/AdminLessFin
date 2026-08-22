/**
 * Production browser closure test — https://adminless-fin.vercel.app
 *
 *  A. Login stability: no auth flicker, no page reset, no request loop.
 *  B. Route sweep of every repaired screen: renders, no error boundary,
 *     no failed edge call.
 *  C. Error UX proof: DELIBERATELY trigger a real backend failure through the
 *     real UI and assert the customer is shown the server's own diagnosis
 *     rather than "Edge Function returned a non-2xx status code".
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import { connect, invoke } from './edgeProbe';

const NL = String.fromCharCode(10);
const BASE_URL = 'https://adminless-fin.vercel.app';
const OUT = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery/ui-closure');
const OPAQUE = /Edge Function returned a non-2xx status code/i;

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const { supabase: api, company } = await connect(process.argv[2] || 'Spaceman');
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: company.id } });

  // A quotation to drive the deliberate failure through the real UI.
  const cust = await api.from('customers').select('id').eq('company_id', company.id).limit(1).maybeSingle();
  const stamp = Date.now();
  const made = await invoke(api, 'quotes', {
    method: 'POST', company_id: company.id,
    quoteData: {
      customer_id: cust.data?.id, quote_number: `UIERR-${stamp}`, quote_date: '2026-08-22',
      expiry_date: '2026-09-22', status: 'draft', description: 'Error UX proof',
      terms: 'Valid 30 days.',
      items: [{ description: 'Error UX line', quantity: 1, unit_price: 100 }],
    },
  });
  const quoteId = (made.body as { id?: string })?.id;
  console.log(`error-UX quotation: ${quoteId}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
  const errors: string[] = [];
  const failed: Array<{ fn: string; status: number }> = [];
  const calls: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => {
    if (r.url().includes('/functions/v1/')) {
      const fn = r.url().split('/functions/v1/')[1].split('?')[0];
      calls.push(fn);
      if (r.status() >= 400) failed.push({ fn, status: r.status() });
    }
  });

  // ---- A. Login stability --------------------------------------------------
  console.log(NL + '=== A. LOGIN STABILITY ===');
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });
  const landed = new URL(page.url()).pathname;
  await page.waitForTimeout(4000);
  const stillThere = new URL(page.url()).pathname;
  const afterLogin = await page.locator('body').innerText();
  console.log(`  landed on ${landed}; 4s later ${stillThere} -> ${landed === stillThere ? 'no page reset' : 'RESET'}`);
  console.log(`  auth screen returned: ${/sign in to your account/i.test(afterLogin) ? 'YES (flicker)' : 'no'}`);

  // Hard refresh must not bounce back to /auth.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const afterReload = new URL(page.url()).pathname;
  console.log(`  hard refresh -> ${afterReload} ${afterReload.startsWith('/auth') ? 'BOUNCED TO AUTH' : 'session survived'}`);

  // ---- B. Route sweep ------------------------------------------------------
  console.log(NL + '=== B. ROUTE SWEEP ===');
  const routes: Array<[string, string, RegExp]> = [
    ['chart-of-accounts', '/chart-of-accounts', /account/i],
    ['quotes', '/quotes', /quote/i],
    ['invoices', '/invoices', /invoice/i],
    ['bills', '/bills', /bill/i],
    ['vendors', '/vendors', /supplier|vendor/i],
    ['banking', '/banking', /bank/i],
    ['reconciliation', '/reconciliation', /reconcil/i],
    // "Account Activity" in the sidebar IS /general-ledger; there is no
    // /accounting/account-activity route (it 404s), and the page is titled
    // "Account Activity Workspace", not "Ledger".
    ['general-ledger-account-activity', '/general-ledger', /Account Activity Workspace/i],
    ['trial-balance', '/trial-balance', /trial balance|debit/i],
    ['audit-trail', '/accounting/audit-trail', /audit/i],
    ['live-financial-statements', '/financial-statements', /income statement|financial/i],
  ];
  const sweep: Array<Record<string, unknown>> = [];
  for (const [name, route, expect] of routes) {
    const beforeFailed = failed.length;
    const beforeCalls = calls.length;
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(2500);
    const text = await page.locator('body').innerText();
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

    // A request loop shows as the same function called many times on one view.
    const made2 = calls.slice(beforeCalls);
    const counts = made2.reduce<Record<string, number>>((a, f) => ({ ...a, [f]: (a[f] ?? 0) + 1 }), {});
    const looping = Object.entries(counts).filter(([, n]) => n >= 6);

    const row = {
      route,
      renders: expect.test(text),
      error_boundary: /something went wrong|unexpected error/i.test(text),
      opaque_message_on_screen: OPAQUE.test(text),
      failed_calls: failed.slice(beforeFailed),
      edge_calls: made2.length,
      looping,
    };
    sweep.push(row);
    console.log(
      `  ${route.padEnd(34)} renders=${row.renders} boundary=${row.error_boundary} ` +
      `opaque=${row.opaque_message_on_screen} failed=${row.failed_calls.length} calls=${made2.length}` +
      (looping.length ? ` LOOP=${JSON.stringify(looping)}` : '')
    );
  }

  // ---- C. Error UX proof ---------------------------------------------------
  console.log(NL + '=== C. DELIBERATE BACKEND FAILURE THROUGH THE REAL UI ===');
  let toastText = '';
  if (quoteId) {
    await page.goto(`${BASE_URL}/quotes/${quoteId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const sendBtn = page.getByRole('button', { name: /send/i }).first();
    if (await sendBtn.count()) {
      await sendBtn.click();
      await page.waitForTimeout(1800);

      // A real recipient, so the send reaches the provider boundary and fails
      // there rather than on a missing field.
      const toField = page.locator('input[type="email"], input#to, input[name="to"]').first();
      if (await toField.count()) { await toField.fill('closure@example.com'); }

      await page.getByRole('button', { name: /^send/i }).last().click();

      // Poll for the toast rather than sleeping past it. Matching line by line
      // avoids escaping newlines inside the pattern.
      const wanted = /Function Error:|not configured|RESEND_API_KEY|non-2xx/i;
      for (let i = 0; i < 50; i++) {
        const body = await page.locator('body').innerText();
        const hit = body.split(NL).map((l) => l.trim()).find((l) => wanted.test(l));
        if (hit) { toastText = hit; break; }
        await page.waitForTimeout(300);
      }
      if (!toastText) toastText = '(no message captured)';
      await page.screenshot({ path: path.join(OUT, 'error-ux-quote-email.png'), fullPage: true });
    } else {
      toastText = '(send control not found)';
    }
  }
  console.log(`  message shown to the user: "${toastText}"`);
  const opaqueShown = OPAQUE.test(toastText);
  const realShown = /not configured|RESEND_API_KEY/i.test(toastText);
  console.log(`  opaque transport string shown: ${opaqueShown ? 'YES — STILL BROKEN' : 'no'}`);
  console.log(`  server diagnosis shown:        ${realShown ? 'YES' : 'no'}`);

  await browser.close();
  if (quoteId) {
    await api.from('quote_items').delete().eq('quote_id', quoteId);
    await api.from('quotes').delete().eq('id', quoteId);
  }

  const nonAuthErrors = errors.filter((e) => !/favicon|manifest|Failed to load resource/i.test(e));
  console.log(NL + '=== SUMMARY ===');
  console.log(`  console errors: ${nonAuthErrors.length}`);
  for (const e of nonAuthErrors.slice(0, 8)) console.log(`     ${e.slice(0, 160)}`);
  console.log(`  failed edge calls: ${failed.length} ${JSON.stringify(failed.slice(0, 8))}`);
  console.log(`  error boundaries: ${sweep.filter((r) => r.error_boundary).length}`);
  console.log(`  routes showing the opaque message: ${sweep.filter((r) => r.opaque_message_on_screen).length}`);

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
    at: new Date().toISOString(), company: company.name,
    login: { landed, stillThere, afterReload },
    sweep, errorUx: { toastText, opaqueShown, realShown },
    consoleErrors: nonAuthErrors, failedCalls: failed,
  }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
