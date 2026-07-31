/**
 * Runtime performance harness.
 *
 * Drives the real production bundle (`vite preview`) against the live Supabase
 * project with a genuine authenticated session, and records — per workspace —
 * what a user actually experiences:
 *
 *   cold load   : FCP, LCP, DOMContentLoaded, load, TTI proxy (long-task quiet)
 *   warm route  : SPA transition time (click -> content settled)
 *   React       : commit count + commit timeline, via the DevTools global hook
 *   network     : every request, split into Supabase REST / Edge Function /
 *                 static asset, with duration, transfer size and duplicate
 *                 detection (same URL fetched more than once per route)
 *   main thread : long tasks and Total Blocking Time
 *   memory      : JS heap after settle
 *
 * Everything is read-only: the harness navigates and observes, it never
 * submits a form or writes a record, so it cannot perturb the tenant's books.
 *
 * Usage:
 *   npx tsx tools/perf/runtimeBench.ts --label before [--routes /,/invoices]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page, type BrowserContext } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const ROOT = process.cwd();
const BASE_URL = process.env.PERF_BASE_URL || 'http://127.0.0.1:4173';
const RESULTS_DIR = path.join(ROOT, 'tests/perf/results');

/** Workspaces measured. Chosen to cover every major module family. */
export const ROUTES: { name: string; path: string }[] = [
  { name: 'Dashboard', path: '/' },
  { name: 'Customers', path: '/customers' },
  { name: 'Vendors', path: '/vendors' },
  { name: 'Invoices', path: '/invoices' },
  { name: 'Bills', path: '/bills' },
  { name: 'Products', path: '/products' },
  { name: 'ChartOfAccounts', path: '/chart-of-accounts' },
  { name: 'JournalEntries', path: '/journal-entries' },
  { name: 'GeneralLedger', path: '/general-ledger' },
  { name: 'TrialBalance', path: '/trial-balance' },
  { name: 'FinancialStatements', path: '/financial-statements' },
  { name: 'Banking', path: '/banking' },
  { name: 'BankTransactions', path: '/banking/transactions' },
  { name: 'FixedAssets', path: '/fixed-assets' },
  { name: 'PayrollWorkspace', path: '/payroll' },
  { name: 'Employees', path: '/employees' },
  { name: 'PayrollReports', path: '/payroll-reports' },
  { name: 'Reports', path: '/reports' },
  { name: 'Projects', path: '/projects' },
  { name: 'Settings', path: '/settings' },
];

type NetRecord = {
  url: string;
  short: string;
  method: string;
  kind: 'supabase-rest' | 'supabase-rpc' | 'edge-function' | 'auth' | 'static' | 'other';
  status: number;
  ms: number;
  bytes: number;
  fromCache: boolean;
  /**
   * Request body, truncated. Essential for this app: every Edge Function call
   * POSTs to the same `/functions/v1/<name>` URL, so a URL-only key would
   * label two *different* operations as a duplicate. Identity for dedupe is
   * (url + body), never url alone.
   */
  body: string;
};

export type RouteMeasurement = {
  name: string;
  path: string;
  cold: {
    fcp: number | null;
    lcp: number | null;
    domContentLoaded: number;
    load: number;
    settledAt: number;
    longTasks: number;
    totalBlockingTime: number;
    heapUsedMB: number;
    reactCommits: number;
  };
  warm: { transitionMs: number; reactCommits: number; requests: number } | null;
  network: {
    total: number;
    supabase: number;
    edgeFunctions: number;
    static: number;
    bytesTotal: number;
    slowest: NetRecord[];
    duplicates: { short: string; count: number; totalMs: number }[];
  };
  error?: string;
};

/**
 * Installed before any app code runs. Two jobs:
 *  1. Provide a minimal `__REACT_DEVTOOLS_GLOBAL_HOOK__` so React (production
 *     build included) reports every commit — this gives true commit counts
 *     without touching application source.
 *  2. Observe paint, LCP and long tasks from the very first frame.
 */
const INSTRUMENT = `
(() => {
  const S = { commits: 0, commitTimes: [], longTasks: [], lcp: null };
  window.__PERF__ = S;

  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map(),
      supportsFiber: true,
      inject(renderer) { const id = this.renderers.size + 1; this.renderers.set(id, renderer); return id; },
      onCommitFiberRoot() { S.commits++; S.commitTimes.push(performance.now()); },
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
      checkDCE() {},
      isDisabled: false,
    };
  }

  // NOTE: deliberately no fetch/stack instrumentation here. Capturing a stack
  // trace per request costs real main-thread time and measurably inflates FCP
  // and Total Blocking Time — corrupting the very metrics this harness exists
  // to report. Call attribution lives in the separate
  // tools/perf/attributeDupes.ts diagnostic, which is never run as part of a
  // timing benchmark.

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) S.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) S.longTasks.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}

  S.reset = () => { S.commits = 0; S.commitTimes = []; S.longTasks = []; };
})();
`;

function classify(url: string, supabaseUrl: string): NetRecord['kind'] {
  if (url.startsWith(supabaseUrl)) {
    if (url.includes('/functions/v1/')) return 'edge-function';
    if (url.includes('/rest/v1/rpc/')) return 'supabase-rpc';
    if (url.includes('/rest/v1/')) return 'supabase-rest';
    if (url.includes('/auth/v1/')) return 'auth';
    return 'other';
  }
  if (/\.(js|css|png|svg|woff2?|json|ico|webmanifest)(\?|$)/.test(url)) return 'static';
  return 'other';
}

function shortUrl(url: string, supabaseUrl: string): string {
  if (url.startsWith(supabaseUrl)) return url.slice(supabaseUrl.length);
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

type NetTracker = {
  records: NetRecord[];
  inflight(): number;
  /** Resolves once every observed request has finished being recorded. */
  drain(): Promise<void>;
  reset(): void;
};

/**
 * Collects network records for the lifetime of a page.
 *
 * The in-flight count is tracked in Node rather than in the page, because the
 * app's own fetches go through the Supabase client and there is no in-page hook
 * to count them without modifying application code — which this exercise
 * forbids. Records are appended by an async handler (Playwright only exposes
 * body size asynchronously), so `drain()` exists to make sure a route's summary
 * is not computed while pushes are still pending.
 */
function attachNetwork(page: Page, supabaseUrl: string): NetTracker {
  const records: NetRecord[] = [];
  let started = 0;
  let done = 0;
  const pending = new Set<Promise<void>>();

  page.on('request', () => {
    started += 1;
  });

  const settle = (fn: () => Promise<void>) => {
    const p = fn().finally(() => {
      done += 1;
      pending.delete(p);
    });
    pending.add(p);
  };

  page.on('requestfailed', () => settle(async () => undefined));

  page.on('requestfinished', (request) =>
    settle(async () => {
      try {
        const timing = request.timing();
        const response = await request.response();
        if (!response) return;
        const sizes = await request.sizes().catch(() => ({ responseBodySize: 0 }));
        const url = request.url();
        records.push({
          url,
          short: shortUrl(url, supabaseUrl),
          method: request.method(),
          kind: classify(url, supabaseUrl),
          status: response.status(),
          ms: Math.max(0, timing.responseEnd - timing.requestStart),
          bytes: sizes.responseBodySize ?? 0,
          fromCache: response.status() === 304,
          body: (request.postData() ?? '').slice(0, 400),
        });
      } catch {
        /* request torn down with the page — ignore */
      }
    }),
  );

  return {
    records,
    inflight: () => started - done,
    drain: async () => {
      while (pending.size) await Promise.allSettled([...pending]);
    },
    reset: () => {
      records.length = 0;
      started = 0;
      done = 0;
    },
  };
}

/**
 * Waits until the page stops changing: no request in flight and no React commit
 * for `quietMs`. This is a far better "ready" signal than `networkidle` for an
 * app that streams data into an already-painted shell — networkidle would fire
 * while the workspace still shows skeletons, and pure commit-quiet would fire
 * before the first row of data has even been requested.
 */
async function waitForSettle(
  page: Page,
  net: NetTracker,
  quietMs = 900,
  timeoutMs = 45_000,
): Promise<number> {
  const start = Date.now();
  let lastCommit = -1;
  let quietSince = Date.now();

  while (Date.now() - start < timeoutMs) {
    const commits = await page.evaluate(() => window.__PERF__?.commits ?? 0).catch(() => -1);
    const busy = net.inflight() > 0;

    if (commits !== lastCommit || busy) {
      lastCommit = commits;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= quietMs) {
      break;
    }
    await page.waitForTimeout(100);
  }
  await net.drain();
  return Date.now() - start;
}

async function readPaint(page: Page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const S = (window as any).__PERF__ || {};
    // The observer is the primary LCP source; the buffered entry list is a
    // fallback for the case where the observer callback has not been flushed
    // to the task queue yet at the moment we read.
    if (S.lcp === null || S.lcp === undefined) {
      const entries = performance.getEntriesByType('largest-contentful-paint');
      if (entries.length) S.lcp = entries[entries.length - 1].startTime;
    }
    const longTasks: { start: number; dur: number }[] = S.longTasks || [];
    return {
      fcp: fcp ? fcp.startTime : null,
      lcp: S.lcp ?? null,
      domContentLoaded: nav ? nav.domContentLoadedEventEnd : 0,
      load: nav ? nav.loadEventEnd : 0,
      longTasks: longTasks.length,
      // TBT = time long tasks spend beyond the 50 ms responsiveness threshold.
      totalBlockingTime: longTasks.reduce((a, t) => a + Math.max(0, t.dur - 50), 0),
      reactCommits: S.commits ?? 0,
      heapUsedMB: (performance as any).memory
        ? (performance as any).memory.usedJSHeapSize / 1024 / 1024
        : 0,
    };
  });
}

function summariseNetwork(records: NetRecord[]): RouteMeasurement['network'] {
  // Identity = method + path + body. Two calls to /functions/v1/accounting with
  // different bodies are different operations and must not be counted as a
  // redundant fetch; two with the same body are genuinely duplicated work.
  const counts = new Map<string, { count: number; totalMs: number }>();
  for (const r of records) {
    if (r.kind === 'static' || r.kind === 'other') continue;
    const key = `${r.method} ${r.short} ${r.body}`;
    const cur = counts.get(key) ?? { count: 0, totalMs: 0 };
    cur.count += 1;
    cur.totalMs += r.ms;
    counts.set(key, cur);
  }

  return {
    total: records.length,
    supabase: records.filter((r) => r.kind === 'supabase-rest' || r.kind === 'supabase-rpc').length,
    edgeFunctions: records.filter((r) => r.kind === 'edge-function').length,
    static: records.filter((r) => r.kind === 'static').length,
    bytesTotal: records.reduce((a, r) => a + r.bytes, 0),
    slowest: [...records].sort((a, b) => b.ms - a.ms).slice(0, 8),
    duplicates: [...counts.entries()]
      .filter(([, v]) => v.count > 1)
      .map(([short, v]) => ({ short, count: v.count, totalMs: Math.round(v.totalMs) }))
      .sort((a, b) => b.count - a.count),
  };
}

async function login(context: BrowserContext, email: string, password: string) {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 60_000 });
  await page.close();
}

async function measureRoute(
  context: BrowserContext,
  supabaseUrl: string,
  route: { name: string; path: string },
): Promise<RouteMeasurement> {
  const page = await context.newPage();
  const net = attachNetwork(page, supabaseUrl);

  try {
    // --- COLD: full document load of this route, cache disabled so the
    // measurement reflects a first-time visitor rather than a warm CDN.
    const client = await context.newCDPSession(page);
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });

    await page.goto(BASE_URL + route.path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const settledAt = await waitForSettle(page, net);
    const cold = await readPaint(page);

    const coldNetwork = summariseNetwork(net.records);

    // --- WARM: an in-app route transition, which is the interaction users
    // perform hundreds of times a day and the one that must feel instant.
    // Measured by leaving to a neutral route first, letting that settle, then
    // navigating back — so the timing covers a genuine remount rather than a
    // no-op on the route we are already on.
    await client.send('Network.setCacheDisabled', { cacheDisabled: false });

    await page.evaluate(() => {
      window.history.pushState({}, '', '/calendar');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitForSettle(page, net, 600, 20_000);

    net.reset();
    await page.evaluate(() => window.__PERF__?.reset());

    const t0 = Date.now();
    await page.evaluate((p) => {
      window.history.pushState({}, '', p);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, route.path);
    await waitForSettle(page, net, 600, 20_000);
    const transitionMs = Date.now() - t0;
    const warmCommits = await page.evaluate(() => window.__PERF__?.commits ?? 0);
    const warmRequests = net.records.length;

    return {
      name: route.name,
      path: route.path,
      cold: { ...cold, settledAt },
      warm: { transitionMs, reactCommits: warmCommits, requests: warmRequests },
      network: coldNetwork,
    };
  } catch (error) {
    return {
      name: route.name,
      path: route.path,
      cold: {
        fcp: null, lcp: null, domContentLoaded: 0, load: 0, settledAt: 0,
        longTasks: 0, totalBlockingTime: 0, heapUsedMB: 0, reactCommits: 0,
      },
      warm: null,
      network: summariseNetwork(net.records),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function main() {
  const env = loadE2EEnv();
  const labelIdx = process.argv.indexOf('--label');
  const label = labelIdx !== -1 ? process.argv[labelIdx + 1] : 'run';
  // Selection is by route NAME, not path: Git Bash/MSYS rewrites any argument
  // that looks like a POSIX path ("/,/invoices" becomes a C:\ path), which
  // silently drops routes from the run.
  const routesIdx = process.argv.indexOf('--routes');
  const selected =
    routesIdx !== -1
      ? ROUTES.filter((r) => process.argv[routesIdx + 1].split(',').includes(r.name))
      : ROUTES;
  if (!selected.length) throw new Error('No routes matched --routes selection.');

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
    });
    const context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 1440, height: 900 },
    });
    await context.addInitScript(INSTRUMENT);

    console.log('[perf] signing in…');
    await login(context, env.email, env.password);

    const results: RouteMeasurement[] = [];
    for (const route of selected) {
      process.stdout.write(`[perf] ${route.name.padEnd(22)} `);
      const m = await measureRoute(context, env.supabaseUrl, route);
      results.push(m);
      if (m.error) {
        console.log(`ERROR: ${m.error.split('\n')[0]}`);
      } else {
        console.log(
          `FCP ${fmt(m.cold.fcp)}  LCP ${fmt(m.cold.lcp)}  settle ${m.cold.settledAt}ms  ` +
            `TBT ${Math.round(m.cold.totalBlockingTime)}ms  commits ${m.cold.reactCommits}  ` +
            `sb ${m.network.supabase}  ef ${m.network.edgeFunctions}  warm ${m.warm?.transitionMs}ms`,
        );
      }
    }

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const outFile = path.join(RESULTS_DIR, `runtime-${label}.json`);
    fs.writeFileSync(
      outFile,
      JSON.stringify({ label, generatedAt: new Date().toISOString(), baseUrl: BASE_URL, results }, null, 2),
    );
    console.log(`\n[perf] wrote ${path.relative(ROOT, outFile)}`);
  } finally {
    await browser?.close();
  }
}

const fmt = (n: number | null) => (n === null ? '  n/a' : Math.round(n) + 'ms');

declare global {
  interface Window {
    __PERF__?: { commits: number; longTasks: { start: number; dur: number }[]; lcp: number | null; reset(): void };
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
