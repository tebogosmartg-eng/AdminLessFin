/**
 * Edge Function latency benchmark.
 *
 * Calls each function repeatedly with a real authenticated session and reports
 * cold (first call) vs warm p50/p95. This separates two costs the browser
 * timeline cannot tell apart:
 *
 *   - Deno isolate cold start, which is a deploy/traffic characteristic
 *   - server-side work (SQL + serialisation), which is a query characteristic
 *
 * Getting that split right matters: a 14 s call that is a one-off cold start
 * needs a completely different fix from a 14 s call that is slow SQL, and
 * optimising the wrong one wastes effort.
 *
 * Read-only: every request below is a GET-style method. Nothing is written.
 *
 * Usage: npx tsx tools/perf/edgeBench.ts [--runs 6] [--out <file>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

type Case = { fn: string; body: Record<string, unknown> };

const runsIdx = process.argv.indexOf('--runs');
const RUNS = runsIdx !== -1 ? Number(process.argv[runsIdx + 1]) : 6;

async function main() {
  const env = loadE2EEnv();
  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);

  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: env.email,
    password: env.password,
  });
  if (authError) throw authError;

  const companyId =
    env.companyId ??
    (await (async () => {
      const { data } = await supabase.functions.invoke('user-session', { body: {} });
      const id =
        data?.activeCompanyId ??
        data?.active_company_id ??
        data?.companies?.[0]?.id ??
        data?.data?.companies?.[0]?.id;
      if (!id) throw new Error('Could not resolve a company id for the benchmark.');
      return id as string;
    })());

  console.log(`[edge] user=${auth.user?.email} company=${companyId} runs=${RUNS}\n`);

  const today = new Date();
  const yearStart = `${today.getFullYear()}-01-01`;
  const todayIso = today.toISOString().slice(0, 10);

  // Bodies are copied from the real call sites in src/lib/queries.ts rather
  // than guessed — a wrong `method` returns a fast 4xx and would understate
  // latency while looking like a successful measurement.
  const cases: Case[] = [
    { fn: 'user-session', body: {} },
    { fn: 'dashboard-data', body: { company_id: companyId, date_from: yearStart, date_to: todayIso } },
    { fn: 'chart-of-accounts', body: { method: 'GET', company_id: companyId } },
    { fn: 'customers', body: { method: 'GET', company_id: companyId } },
    { fn: 'vendors', body: { method: 'GET', company_id: companyId } },
    { fn: 'bills', body: { method: 'GET', company_id: companyId, filters: {} } },
    { fn: 'products', body: { method: 'GET', company_id: companyId } },
    { fn: 'employees', body: { method: 'GET', company_id: companyId } },
    { fn: 'expense-claims', body: { method: 'GET_ALL', company_id: companyId } },
    { fn: 'projects', body: { method: 'GET', company_id: companyId } },
    { fn: 'tax-rates', body: { method: 'GET', company_id: companyId } },
    { fn: 'banking', body: { method: 'GET_TRANSACTIONS', company_id: companyId } },
    { fn: 'fixed-assets', body: { method: 'GET_ALL', company_id: companyId } },
  ];

  const results: {
    fn: string;
    cold: number;
    warmP50: number;
    warmP95: number;
    warmMin: number;
    bytes: number;
    ok: boolean;
    note?: string;
  }[] = [];

  for (const c of cases) {
    const timings: number[] = [];
    let bytes = 0;
    let ok = true;
    let note: string | undefined;

    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      const { data, error } = await supabase.functions.invoke(c.fn, { body: c.body });
      const dt = performance.now() - t0;
      timings.push(dt);
      if (error) {
        ok = false;
        note = error.message;
      } else if (i === 0) {
        bytes = JSON.stringify(data ?? null).length;
      }
    }

    const cold = timings[0];
    const warm = timings.slice(1).sort((a, b) => a - b);
    const p = (q: number) => (warm.length ? warm[Math.min(warm.length - 1, Math.floor(warm.length * q))] : NaN);

    const row = {
      fn: c.fn,
      cold: Math.round(cold),
      warmP50: Math.round(p(0.5)),
      warmP95: Math.round(p(0.95)),
      warmMin: Math.round(warm[0] ?? NaN),
      bytes,
      ok,
      note,
    };
    results.push(row);
    console.log(
      `  ${c.fn.padEnd(22)} cold ${String(row.cold).padStart(6)}ms  p50 ${String(row.warmP50).padStart(5)}ms  ` +
        `p95 ${String(row.warmP95).padStart(5)}ms  payload ${(row.bytes / 1024).toFixed(1).padStart(8)} kB` +
        (ok ? '' : `  [ERROR ${note}]`),
    );
  }

  const outIdx = process.argv.indexOf('--out');
  const outFile = outIdx !== -1 ? process.argv[outIdx + 1] : 'tests/perf/results/edge-before.json';
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), runs: RUNS, results }, null, 2));
  console.log(`\n[edge] wrote ${outFile}`);

  // 'local' is essential: the default scope is global and revokes every refresh
  // token for this user, which will silently kill a browser benchmark running
  // concurrently as the same E2E account and make its later routes look broken.
  await supabase.auth.signOut({ scope: 'local' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
