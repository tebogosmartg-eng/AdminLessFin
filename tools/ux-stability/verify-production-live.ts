/**
 * Live production verification for AdminLess Fin.
 * Target: https://adminless-fin.vercel.app + zaulhnpohrgqqodvzhxp
 *
 *   npx tsx tools/ux-stability/verify-production-live.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const BASE_URL = process.env.UX_BASE_URL || 'https://adminless-fin.vercel.app';
const OUT = path.join(process.cwd(), 'tests/e2e/artifacts/production-live-verification.json');
const STAMP = Date.now();
const CUSTOMER = `PROD-UX-CUST ${STAMP}`;
const JOURNAL = `PROD-UX-JE ${STAMP}`;
const INVOICE = `PXI${String(STAMP).slice(-6)}`;

type NetHit = { method: string; url: string; fn: string; status: number };

function edgeName(url: string): string {
  const m = url.match(/\/functions\/v1\/([^/?]+)/);
  if (m) return m[1];
  if (url.includes('/auth/v1/token')) return 'auth-token';
  if (url.includes('/auth/v1/')) return 'auth';
  if (url.includes('/rest/v1/')) return 'rest';
  return 'other';
}

function attach(page: Page, hits: NetHit[], consoles: string[], pageErrors: string[]) {
  page.on('response', (res) => {
    const url = res.url();
    if (!/supabase|functions\/v1|auth\/v1/.test(url)) return;
    hits.push({
      method: res.request().method(),
      url,
      fn: edgeName(url),
      status: res.status(),
    });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoles.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
}

function summarizeNet(hits: NetHit[]) {
  const byFn: Record<string, { count: number; statuses: number[] }> = {};
  for (const h of hits) {
    byFn[h.fn] ??= { count: 0, statuses: [] };
    byFn[h.fn].count += 1;
    byFn[h.fn].statuses.push(h.status);
  }
  return {
    byFn,
    status5xx: hits.filter((h) => h.status >= 500),
    status403: hits.filter((h) => h.status === 403),
    status401: hits.filter((h) => h.status === 401),
  };
}

async function apiVerification() {
  const env = loadE2EEnv();
  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);
  const signIn = await supabase.auth.signInWithPassword({
    email: env.email,
    password: env.password,
  });
  if (signIn.error || !signIn.data.session) {
    return {
      ok: false,
      auth: { ok: false, error: signIn.error?.message || 'no session' },
    };
  }

  const session1 = await supabase.functions.invoke('user-session', { body: { method: 'GET' } });
  const companyId =
    session1.data?.activeCompany?.id || env.companyId || session1.data?.companies?.[0]?.id;
  const t0 = Date.now();
  const status1 = await supabase.functions.invoke('accounting-setup', {
    body: { method: 'GET_STATUS', company_id: companyId },
  });
  const ms1 = Date.now() - t0;
  const t1 = Date.now();
  const status2 = await supabase.functions.invoke('accounting-setup', {
    body: { method: 'GET_STATUS', company_id: companyId },
  });
  const ms2 = Date.now() - t1;

  const row = (status1.data || {}) as Record<string, unknown>;
  return {
    ok: !session1.error && !status1.error && !status2.error,
    supabaseUrl: env.supabaseUrl,
    auth: { ok: true, userId: signIn.data.user?.id },
    company: {
      ok: Boolean(companyId),
      id: companyId,
      name: session1.data?.activeCompany?.name,
      userSessionError: session1.error?.message || null,
    },
    getStatus: {
      first: {
        error: status1.error?.message || null,
        httpHint: (status1.error as { context?: { status?: number } } | null)?.context?.status,
        accountingReady: row.accounting_ready,
        status: row.status,
        currentStep: row.current_step,
        chartOfAccountsComplete: row.chart_of_accounts_complete,
        missingControlAccounts: (row.validation as { missingControlAccounts?: string[] } | undefined)
          ?.missingControlAccounts,
        ms: ms1,
      },
      second: {
        error: status2.error?.message || null,
        accountingReady: (status2.data as { accounting_ready?: boolean } | null)?.accounting_ready,
        ms: ms2,
      },
    },
  };
}

async function sidebarVisible(page: Page) {
  return page.getByRole('button', { name: /sign out/i }).isVisible().catch(() => false);
}

async function fullscreenLoaderCount(page: Page) {
  return page.locator('.flex.h-screen.w-screen.items-center.justify-center').count();
}

async function openNav(page: Page, group: RegExp, link: RegExp) {
  const l = page.getByRole('link', { name: link }).first();
  if (!(await l.isVisible().catch(() => false))) {
    const g = page.getByRole('button', { name: group }).first();
    if (await g.isVisible().catch(() => false)) await g.click();
  }
  await l.click();
}

async function browserVerification() {
  const env = loadE2EEnv();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
  });
  const hits: NetHit[] = [];
  const consoles: string[] = [];
  const pageErrors: string[] = [];
  const pages: Record<string, unknown> = {};
  const report: Record<string, unknown> = { pages };

  const page = await context.newPage();
  attach(page, hits, consoles, pageErrors);

  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('input[type="email"]').first().fill(env.email);
  await page.locator('input[type="password"]').first().fill(env.password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 90_000 });
  await page.waitForTimeout(2000);
  pages.login = {
    ok: await sidebarVisible(page),
    path: new URL(page.url()).pathname,
    fullscreenLoaders: await fullscreenLoaderCount(page),
  };

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  pages.hardRefresh = {
    ok: await sidebarVisible(page),
    path: new URL(page.url()).pathname,
    fullscreenLoaders: await fullscreenLoaderCount(page),
  };

  const nav: { key: string; group: RegExp; click: RegExp; url: RegExp }[] = [
    { key: 'dashboard', group: /^Dashboard$/i, click: /^Dashboard$/i, url: /\/$|\/dashboard/ },
    { key: 'accountingSetup', group: /^Accounting$/i, click: /accounting setup/i, url: /accounting-setup/ },
    { key: 'chartOfAccounts', group: /^Accounting$/i, click: /chart of accounts/i, url: /chart-of-accounts/ },
    { key: 'journalEntries', group: /^Accounting$/i, click: /journal entries/i, url: /journal-entries/ },
    { key: 'invoices', group: /^Sales$/i, click: /^Invoices$/i, url: /invoices/ },
    { key: 'customers', group: /^Sales$/i, click: /^Customers$/i, url: /customers/ },
    { key: 'products', group: /^Sales$/i, click: /^Products$/i, url: /products/ },
  ];

  for (const step of nav) {
    const beforeHits = hits.length;
    try {
      if (step.key === 'dashboard') {
        await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
      } else {
        await openNav(page, step.group, step.click);
      }
      await page.waitForTimeout(2200);
      const pathName = new URL(page.url()).pathname;
      pages[step.key] = {
        ok: await sidebarVisible(page) && (await fullscreenLoaderCount(page)) === 0,
        path: pathName,
        urlMatch: step.url.test(pathName),
        fullscreenLoaders: await fullscreenLoaderCount(page),
        generateCoaPrompt: await page.getByText(/generate chart of accounts/i).isVisible().catch(() => false),
        blockedSetup: await page.getByText(/complete accounting setup/i).isVisible().catch(() => false),
        netDelta: summarizeNet(hits.slice(beforeHits)).byFn,
      };
    } catch (error) {
      pages[step.key] = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // Journal
  await page.goto(`${BASE_URL}/journal-entries`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const journalBlocked = await page.getByText(/complete accounting setup/i).isVisible().catch(() => false);
  const journal: Record<string, unknown> = { blocked: journalBlocked, sidebar: await sidebarVisible(page) };
  if (journalBlocked) {
    journal.continueLink = await page.getByRole('link', { name: /continue accounting setup/i }).isVisible().catch(() => false);
    journal.newButtonCount = await page.getByRole('button', { name: /new journal entry/i }).count();
    journal.missingCopy = (await page.locator('main').innerText().catch(() => '')).slice(0, 1200);
  } else {
    await page.getByRole('button', { name: /new journal entry/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 15_000 });
    const desc = dialog.getByPlaceholder('e.g., Paid monthly office rent');
    await desc.fill(JOURNAL);
    await page.waitForTimeout(1200);
    journal.typedKept = (await desc.inputValue()) === JOURNAL;
    journal.dialogOpen = await dialog.isVisible();
    try {
      await page.getByRole('combobox').filter({ hasText: /select account/i }).first().click();
      await page.getByRole('option').first().click();
      await page.getByRole('combobox').filter({ hasText: /select account/i }).first().click();
      await page.getByRole('option').nth(1).click();
      await page.getByPlaceholder('Amount').nth(0).fill('100');
      await page.getByPlaceholder('Amount').nth(1).fill('100');
      await page.getByRole('button', { name: /save entry/i }).click();
      await dialog.waitFor({ state: 'hidden', timeout: 25_000 });
      journal.saved = true;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      journal.persisted = await page.getByRole('row').filter({ hasText: JOURNAL }).isVisible().catch(() => false);
    } catch (error) {
      journal.saved = false;
      journal.saveError = error instanceof Error ? error.message : String(error);
    }
  }
  report.journal = journal;

  // Invoice
  await page.goto(`${BASE_URL}/invoices`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const invoiceBlocked = await page.getByText(/complete accounting setup/i).isVisible().catch(() => false);
  const invoice: Record<string, unknown> = { blocked: invoiceBlocked, sidebar: await sidebarVisible(page) };
  if (invoiceBlocked) {
    invoice.continueLink = await page.getByRole('link', { name: /continue accounting setup/i }).isVisible().catch(() => false);
  } else {
    try {
      await page.getByRole('button', { name: /new invoice/i }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible', timeout: 15_000 });
      const line = dialog.getByPlaceholder('Description').first();
      await line.fill('PROD-UX-LINE');
      await page.waitForTimeout(1200);
      invoice.typedKept = (await line.inputValue()) === 'PROD-UX-LINE';
      invoice.dialogOpen = await dialog.isVisible();
      await page.getByRole('combobox', { name: /customer/i }).click();
      await page.getByRole('option').first().click();
      await page.getByLabel('Invoice Date').fill('2026-08-22');
      await page.getByLabel('Due Date').fill('2026-09-22');
      await page.getByRole('spinbutton').nth(1).fill('50');
      await page.getByRole('combobox').filter({ hasText: /^Account$/ }).first().click();
      await page.getByRole('option').first().click();
      const advanced = page.getByRole('button', { name: /show advanced accounting/i });
      if (await advanced.isVisible().catch(() => false)) {
        await advanced.click();
        await page.getByRole('combobox', { name: /a\/r account/i }).click();
        await page.getByRole('option').first().click();
      }
      await page.getByLabel('Invoice #').fill(INVOICE);
      await page.getByRole('button', { name: /save invoice/i }).click();
      await page.getByRole('dialog', { name: /new invoice/i }).waitFor({ state: 'hidden', timeout: 25_000 });
      invoice.saved = true;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      invoice.persisted = await page.getByRole('row').filter({ hasText: INVOICE }).isVisible().catch(() => false);
    } catch (error) {
      invoice.saved = false;
      invoice.saveError = error instanceof Error ? error.message : String(error);
    }
  }
  report.invoice = invoice;

  // Customer
  await page.goto(`${BASE_URL}/customers`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const customer: Record<string, unknown> = { sidebar: await sidebarVisible(page) };
  try {
    await page.getByRole('button', { name: /new customer/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 15_000 });
    const name = dialog.getByPlaceholder('e.g., ACME Inc.');
    await name.fill(CUSTOMER);
    await page.waitForTimeout(1500);
    customer.typedKept = (await name.inputValue()) === CUSTOMER;
    customer.dialogOpen = await dialog.isVisible();
    await dialog.getByPlaceholder('e.g., contact@acme.com').fill(`prod.ux.${STAMP}@example.com`);
    await page.getByRole('button', { name: /save customer/i }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 20_000 });
    customer.saved = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    customer.persisted = await page.getByRole('cell', { name: CUSTOMER, exact: true }).isVisible().catch(() => false);
  } catch (error) {
    customer.saved = false;
    customer.saveError = error instanceof Error ? error.message : String(error);
  }
  report.customer = customer;

  const appConsoles = consoles.filter(
    (t) => !/grammarly|download the react devtools|favicon|Failed to load resource: the server responded with a status of 40[013]/i.test(t),
  );

  await browser.close();
  report.network = summarizeNet(hits);
  report.console = { rawCount: consoles.length, appErrors: appConsoles.slice(0, 30), pageErrors: pageErrors.slice(0, 20) };
  return report;
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  console.log(`[prod-verify] API against live Supabase…`);
  const api = await apiVerification();
  console.log(`[prod-verify] API ok=${api.ok} ready=${api.getStatus?.first?.accountingReady} status=${api.getStatus?.first?.status}`);
  console.log(`[prod-verify] Browser against ${BASE_URL}…`);
  const browser = await browserVerification();
  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    commitExpected: '64015f898fa4562278ffb469560923fc359a05bd',
    api,
    browser,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[prod-verify] wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
