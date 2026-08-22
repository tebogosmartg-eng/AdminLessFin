/**
 * Production UX stability probe.
 *
 * Drives https://adminless-fin.vercel.app (or UX_BASE_URL) with a real login
 * and records evidence of flickering: navigation loops, full-screen loaders,
 * duplicate Edge Function calls, console errors, and form-focus loss.
 *
 * Read-only except login. Does not post journals, invoices, or bills.
 *
 *   npx tsx tools/ux-stability/probe-production.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const BASE_URL = process.env.UX_BASE_URL || 'https://adminless-fin.vercel.app';
const OUT_DIR = path.join(process.cwd(), 'tests/e2e/artifacts');

const ROUTES = [
  { name: 'Dashboard', path: '/' },
  { name: 'AccountingDashboard', path: '/accounting' },
  { name: 'AccountingSetup', path: '/accounting-setup' },
  { name: 'ChartOfAccounts', path: '/chart-of-accounts' },
  { name: 'JournalEntries', path: '/journal-entries' },
  { name: 'Invoices', path: '/invoices' },
  { name: 'Bills', path: '/bills' },
  { name: 'Customers', path: '/customers' },
  { name: 'Vendors', path: '/vendors' },
  { name: 'Products', path: '/products' },
];

type NetHit = {
  method: string;
  url: string;
  fn: string;
  status: number;
  ms: number;
};

type RouteReport = {
  name: string;
  requestedPath: string;
  finalPath: string;
  urlsVisited: string[];
  loaderAppearances: number;
  createCompanyRedirects: number;
  consoleErrors: string[];
  pageErrors: string[];
  net: Record<string, number>;
  userSessionCalls: number;
  accountingSetupCalls: number;
  tokenRefreshCalls: number;
  form?: {
    opened: boolean;
    typed: string;
    remaining: string;
    focusLost: boolean;
    dialogStayedOpen: boolean;
    blockedBySetup: boolean;
    blockedCopy?: string;
  };
  error?: string;
};

function edgeName(url: string): string {
  const m = url.match(/\/functions\/v1\/([^/?]+)/);
  if (m) return m[1];
  if (url.includes('/auth/v1/token')) return 'auth-token';
  if (url.includes('/auth/v1/')) return 'auth';
  return 'other';
}

function attach(page: Page, hits: NetHit[]) {
  page.on('response', async (res) => {
    const url = res.url();
    if (!/supabase|functions\/v1|auth\/v1/.test(url)) return;
    const req = res.request();
    const timing = req.timing();
    hits.push({
      method: req.method(),
      url,
      fn: edgeName(url),
      status: res.status(),
      ms: Math.round((timing.responseEnd || 0) - (timing.requestStart || 0)),
    });
  });
}

async function countLoaderFlashes(page: Page, dwellMs: number): Promise<{
  loaderAppearances: number;
  urlsVisited: string[];
}> {
  const urlsVisited: string[] = [];
  let loaderAppearances = 0;
  let loaderVisible = false;
  const started = Date.now();

  while (Date.now() - started < dwellMs) {
    const url = new URL(page.url()).pathname;
    if (urlsVisited[urlsVisited.length - 1] !== url) urlsVisited.push(url);

    const visible = await page
      .locator('.flex.h-screen.w-screen.items-center.justify-center')
      .first()
      .isVisible()
      .catch(() => false);
    if (visible && !loaderVisible) loaderAppearances += 1;
    loaderVisible = visible;
    await page.waitForTimeout(200);
  }
  return { loaderAppearances, urlsVisited };
}

async function tryTypeInDialog(
  page: Page,
  openButton: RegExp,
  field: { placeholder?: string; label?: string },
  value: string,
): Promise<RouteReport['form']> {
  const setupBlock = page.getByText(/complete accounting setup first/i);
  if (await setupBlock.isVisible().catch(() => false)) {
    const copy = (await page.locator('main').innerText().catch(() => '')).slice(0, 800);
    return {
      opened: false,
      typed: '',
      remaining: '',
      focusLost: false,
      dialogStayedOpen: false,
      blockedBySetup: true,
      blockedCopy: copy,
    };
  }

  const btn = page.getByRole('button', { name: openButton }).first();
  if (!(await btn.isVisible().catch(() => false))) {
    return {
      opened: false,
      typed: '',
      remaining: '',
      focusLost: false,
      dialogStayedOpen: false,
      blockedBySetup: false,
    };
  }

  await btn.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });

  const input = field.placeholder
    ? dialog.getByPlaceholder(field.placeholder).first()
    : dialog.getByLabel(field.label || '').first();
  await input.click();
  await input.fill(value);
  await page.waitForTimeout(1500);
  const remaining = await input.inputValue().catch(() => '');
  const focused = await input.evaluate((el) => document.activeElement === el).catch(() => false);
  const dialogStayedOpen = await dialog.isVisible().catch(() => false);

  await page.keyboard.press('Escape').catch(() => undefined);
  await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);

  return {
    opened: true,
    typed: value,
    remaining,
    focusLost: remaining === value ? !focused : true,
    dialogStayedOpen,
    blockedBySetup: false,
  };
}

async function login(context: BrowserContext, email: string, password: string) {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 90_000 });
  await page.waitForTimeout(2_000);
  await page.close();
}

async function probeRoute(context: BrowserContext, route: (typeof ROUTES)[number]): Promise<RouteReport> {
  const page = await context.newPage();
  const hits: NetHit[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  attach(page, hits);
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  try {
    await page.goto(BASE_URL + route.path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const dwell = await countLoaderFlashes(page, 4_500);

    let form: RouteReport['form'];
    if (route.name === 'Customers') {
      form = await tryTypeInDialog(page, /new customer/i, { placeholder: 'e.g., ACME Inc.' }, 'UX-STABILITY-PROBE');
    } else if (route.name === 'Vendors') {
      form = await tryTypeInDialog(page, /new (vendor|supplier)/i, { placeholder: 'e.g., Office Supplies Co.' }, 'UX-STABILITY-PROBE');
    } else if (route.name === 'Products') {
      form = await tryTypeInDialog(page, /new product/i, { placeholder: /name/i }, 'UX-STABILITY-PROBE');
    } else if (route.name === 'JournalEntries') {
      form = await tryTypeInDialog(page, /new journal entry/i, { label: /description/i }, 'UX-STABILITY-PROBE');
    } else if (route.name === 'Invoices') {
      form = await tryTypeInDialog(page, /new invoice/i, { label: /description/i }, 'UX-STABILITY-PROBE');
    } else if (route.name === 'Bills') {
      form = await tryTypeInDialog(page, /new bill/i, { label: /description/i }, 'UX-STABILITY-PROBE');
    }

    const net: Record<string, number> = {};
    for (const h of hits) net[h.fn] = (net[h.fn] || 0) + 1;

    return {
      name: route.name,
      requestedPath: route.path,
      finalPath: new URL(page.url()).pathname,
      urlsVisited: dwell.urlsVisited,
      loaderAppearances: dwell.loaderAppearances,
      createCompanyRedirects: dwell.urlsVisited.filter((u) => u === '/create-company').length,
      consoleErrors: consoleErrors.slice(0, 20),
      pageErrors: pageErrors.slice(0, 10),
      net,
      userSessionCalls: net['user-session'] || 0,
      accountingSetupCalls: net['accounting-setup'] || 0,
      tokenRefreshCalls: net['auth-token'] || 0,
      form,
    };
  } catch (error) {
    return {
      name: route.name,
      requestedPath: route.path,
      finalPath: page.url(),
      urlsVisited: [],
      loaderAppearances: 0,
      createCompanyRedirects: 0,
      consoleErrors,
      pageErrors,
      net: {},
      userSessionCalls: 0,
      accountingSetupCalls: 0,
      tokenRefreshCalls: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function main() {
  const env = loadE2EEnv();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
  });

  console.log(`[ux-probe] target ${BASE_URL}`);
  console.log('[ux-probe] signing in…');
  await login(context, env.email, env.password);
  console.log('[ux-probe] signed in');

  const results: RouteReport[] = [];
  for (const route of ROUTES) {
    process.stdout.write(`[ux-probe] ${route.name.padEnd(22)} `);
    const r = await probeRoute(context, route);
    results.push(r);
    const loop = r.urlsVisited.length > 2 ? ` NAVLOOP=${r.urlsVisited.join('→')}` : '';
    const form = r.form
      ? r.form.blockedBySetup
        ? ' BLOCKED-SETUP'
        : r.form.opened
          ? ` type=${r.form.remaining === r.form.typed ? 'KEPT' : 'LOST'} focusLost=${r.form.focusLost}`
          : ' no-form'
      : '';
    console.log(
      `final=${r.finalPath} loaders=${r.loaderAppearances} user-session=${r.userSessionCalls} setup=${r.accountingSetupCalls} token=${r.tokenRefreshCalls}${loop}${form}${r.error ? ' ERROR ' + r.error : ''}`,
    );
  }

  const outFile = path.join(OUT_DIR, 'ux-stability-production.json');
  fs.writeFileSync(
    outFile,
    JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE_URL, results }, null, 2),
    'utf8',
  );
  console.log(`[ux-probe] wrote ${outFile}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
