/**
 * Attributes duplicate Edge Function calls to the code that issues them.
 *
 * The benchmark can show that /functions/v1/chart-of-accounts is fetched twice
 * with an identical body, but not who asked. This walks the routes that showed
 * duplicates, captures a stack trace per call, and prints the distinct call
 * sites for each repeated request — which is what turns "there is a duplicate"
 * into an actionable file reference.
 *
 * Requires a build with sourcemaps disabled or not; frames are reported as the
 * minified chunk + position, which is still enough to distinguish two callers.
 *
 * Usage: npx tsx tools/perf/attributeDupes.ts
 */
import { chromium } from '@playwright/test';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const BASE = process.env.PERF_BASE_URL || 'http://127.0.0.1:4173';
const TARGETS = ['/', '/bills', '/banking', '/payroll'];

const INSTRUMENT = `
(() => {
  const S = { calls: [] };
  window.__PERFCALLS__ = S;
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.includes('/functions/v1/')) {
        const entry = {
          fn: url.slice(url.indexOf('/functions/v1/') + 14),
          body: typeof init?.body === 'string' ? init.body.slice(0, 200) : '',
          stack: (new Error().stack || ''),
          start: performance.now(),
          end: -1,
        };
        S.calls.push(entry);
        return origFetch.apply(this, arguments).then(
          (r) => { entry.end = performance.now(); return r; },
          (e) => { entry.end = performance.now(); throw e; },
        );
      }
    } catch {}
    return origFetch.apply(this, arguments);
  };
})();
`;

(async () => {
  const env = loadE2EEnv();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(INSTRUMENT);

  const login = await context.newPage();
  await login.goto(BASE + '/auth', { waitUntil: 'domcontentloaded' });
  await login.locator('input[type="email"]').first().fill(env.email);
  await login.locator('input[type="password"]').first().fill(env.password);
  await login.getByRole('button', { name: /sign in/i }).first().click();
  await login.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 60_000 });
  await login.close();

  for (const target of TARGETS) {
    const page = await context.newPage();

    // `supabase.functions.invoke` awaits before it calls fetch, so the
    // synchronous stack at fetch time contains only Supabase's own frames and
    // the real caller is lost. Asking V8 to retain async frames restores the
    // application frame that scheduled the call, which is the whole point.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Debugger.enable');
    await cdp.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });

    await page.goto(BASE + target, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);

    const calls = await page.evaluate(() => (window as any).__PERFCALLS__?.calls ?? []);
    type Call = { fn: string; body: string; stack: string; start: number; end: number };
    const groups = new Map<string, { fn: string; body: string; stacks: string[]; calls: Call[] }>();
    for (const c of calls as Call[]) {
      const key = `${c.fn}|${c.body}`;
      if (!groups.has(key)) groups.set(key, { fn: c.fn, body: c.body, stacks: [], calls: [] });
      groups.get(key)!.stacks.push(c.stack);
      groups.get(key)!.calls.push(c);
    }

    console.log(`\n########## ${target} — ${calls.length} edge calls`);
    for (const g of groups.values()) {
      if (g.stacks.length < 2) continue;
      console.log(`\n  DUPLICATE x${g.stacks.length}: ${g.fn}  body=${g.body}`);

      // Whether the two calls overlap in time decides which fix can work:
      // overlapping duplicates can be merged in flight; sequential ones can
      // only be removed by making the callers share a cache entry.
      const ordered = [...g.calls].sort((a, b) => a.start - b.start);
      ordered.forEach((c, i) =>
        console.log(`      call ${i + 1}: start ${Math.round(c.start)}ms  end ${Math.round(c.end)}ms`),
      );
      const overlap = ordered[1].start < ordered[0].end;
      console.log(
        `      >>> ${overlap ? 'CONCURRENT (in-flight merge possible)' : 'SEQUENTIAL — gap ' + Math.round(ordered[1].start - ordered[0].end) + 'ms (in-flight merge CANNOT help)'}`,
      );

      g.stacks.forEach((s, i) => {
        // Keep the frames that point at app chunks; drop the fetch shim and
        // Supabase client internals which are identical for both callers.
        const frames = s
          .split('\n')
          .slice(1)
          .filter((f) => f.includes('/assets/') && !f.includes('vendor-supabase'))
          .slice(0, 6)
          .map((f) => '        ' + f.trim());
        console.log(`    [caller ${i + 1}]`);
        console.log(frames.join('\n') || '        (no app frames)');
      });
    }
    await page.close();
  }

  await browser.close();
})();
