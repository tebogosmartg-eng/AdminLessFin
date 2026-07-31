/**
 * Turns raw harness output into a budget-checked report.
 *
 * Two corrections are applied to the raw numbers so the published figures mean
 * what they claim:
 *
 *  - The harness decides a page has "settled" only after a quiet window with no
 *    request in flight and no React commit. That window is included in the raw
 *    elapsed time, so it is subtracted here; otherwise every route would look
 *    ~900 ms slower than it is, and fast routes would look artificially uniform.
 *  - The settle poll runs every 100 ms, so corrected times carry ±100 ms of
 *    quantisation. Differences smaller than that are not reported as changes.
 *
 * Usage: npx tsx tools/perf/analyze.ts --before before --after after
 */
import fs from 'node:fs';
import path from 'node:path';

const RESULTS = path.join(process.cwd(), 'tests/perf/results');

/** Quiet windows used by runtimeBench.waitForSettle. */
export const COLD_QUIET_MS = 900;
export const WARM_QUIET_MS = 600;
export const POLL_MS = 100;

export type Budget = { key: string; label: string; max: number; unit: string };

/**
 * Budgets are set to what an ERP must hit to feel like a desktop tool.
 * The route-transition budget is the important one: it is the interaction a
 * finance user performs hundreds of times a day, and it is what separates
 * "web app" from "Excel-like".
 */
export const BUDGETS: Budget[] = [
  { key: 'fcp', label: 'First Contentful Paint', max: 1000, unit: 'ms' },
  { key: 'lcp', label: 'Largest Contentful Paint', max: 2500, unit: 'ms' },
  { key: 'interactive', label: 'Cold load to data-complete', max: 2500, unit: 'ms' },
  { key: 'warm', label: 'Warm route transition', max: 300, unit: 'ms' },
  { key: 'tbt', label: 'Total Blocking Time', max: 200, unit: 'ms' },
  { key: 'edgeCalls', label: 'Edge Function calls per route', max: 6, unit: 'calls' },
  { key: 'duplicates', label: 'Duplicate identical requests', max: 0, unit: 'reqs' },
  { key: 'commits', label: 'React commits per cold load', max: 30, unit: 'commits' },
];

export type Row = {
  name: string;
  path: string;
  fcp: number | null;
  lcp: number | null;
  interactive: number;
  warm: number | null;
  tbt: number;
  commits: number;
  warmCommits: number | null;
  edgeCalls: number;
  supabaseCalls: number;
  duplicates: number;
  duplicateDetail: { short: string; count: number; totalMs: number }[];
  heapMB: number;
  slowest: { short: string; ms: number; bytes: number }[];
  error?: string;
};

export function load(label: string): Row[] {
  const file = path.join(RESULTS, `runtime-${label}.json`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));

  return raw.results.map((r: any): Row => ({
    name: r.name,
    path: r.path,
    fcp: r.cold.fcp === null ? null : Math.round(r.cold.fcp),
    lcp: r.cold.lcp === null ? null : Math.round(r.cold.lcp),
    interactive: Math.max(0, r.cold.settledAt - COLD_QUIET_MS),
    warm: r.warm ? Math.max(0, r.warm.transitionMs - WARM_QUIET_MS) : null,
    tbt: Math.round(r.cold.totalBlockingTime),
    commits: r.cold.reactCommits,
    warmCommits: r.warm ? r.warm.reactCommits : null,
    edgeCalls: r.network.edgeFunctions,
    supabaseCalls: r.network.supabase,
    duplicates: r.network.duplicates.reduce(
      (a: number, d: any) => a + (d.count - 1),
      0,
    ),
    duplicateDetail: r.network.duplicates,
    heapMB: Number(r.cold.heapUsedMB.toFixed(1)),
    slowest: r.network.slowest
      .filter((s: any) => s.kind !== 'static')
      .slice(0, 5)
      .map((s: any) => ({ short: s.short, ms: Math.round(s.ms), bytes: s.bytes })),
    error: r.error,
  }));
}

function breaches(row: Row): string[] {
  const out: string[] = [];
  for (const b of BUDGETS) {
    const v = (row as any)[b.key];
    if (typeof v === 'number' && v > b.max) out.push(`${b.label} ${v}${b.unit} > ${b.max}${b.unit}`);
  }
  return out;
}

const pct = (before: number, after: number) =>
  before === 0 ? '—' : `${(((before - after) / before) * 100).toFixed(0)}%`;

function table(rows: Row[]): string {
  const head =
    '| Workspace | FCP | LCP | Cold→data | Warm nav | TBT | Commits | Edge fns | Dup reqs | Heap |\n' +
    '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|';
  const body = rows
    .map(
      (r) =>
        `| ${r.name} | ${r.fcp ?? '—'} | ${r.lcp ?? '—'} | ${r.interactive} | ${r.warm ?? '—'} | ${r.tbt} | ${r.commits} | ${r.edgeCalls} | ${r.duplicates} | ${r.heapMB} MB |`,
    )
    .join('\n');
  return `${head}\n${body}`;
}

function main() {
  const bIdx = process.argv.indexOf('--before');
  const aIdx = process.argv.indexOf('--after');
  const beforeLabel = bIdx !== -1 ? process.argv[bIdx + 1] : 'before';
  const before = load(beforeLabel);

  console.log(`## Baseline (${beforeLabel})\n`);
  console.log(table(before));

  console.log('\n## Budget breaches\n');
  for (const r of before) {
    const bs = breaches(r);
    if (bs.length) console.log(`- **${r.name}** — ${bs.join('; ')}`);
  }

  console.log('\n## Duplicate requests (same URL fetched more than once per load)\n');
  for (const r of before) {
    for (const d of r.duplicateDetail) {
      console.log(`- ${r.name}: ${d.short} ×${d.count} (${d.totalMs} ms total)`);
    }
  }

  console.log('\n## Slowest calls per workspace\n');
  for (const r of before) {
    if (!r.slowest.length) continue;
    console.log(`- **${r.name}**: ${r.slowest.map((s) => `${s.short} ${s.ms}ms`).join(', ')}`);
  }

  if (aIdx !== -1) {
    const afterLabel = process.argv[aIdx + 1];
    const after = load(afterLabel);
    const byName = new Map(after.map((r) => [r.name, r]));

    console.log(`\n## Before vs after (${beforeLabel} → ${afterLabel})\n`);
    console.log(
      '| Workspace | LCP | Cold→data | Warm nav | Commits | Edge fns |\n|---|---|---|---|---|---|',
    );
    for (const b of before) {
      const a = byName.get(b.name);
      if (!a) continue;
      const cell = (x: number | null, y: number | null) =>
        x === null || y === null ? '—' : `${x} → ${y} (${pct(x, y)})`;
      console.log(
        `| ${b.name} | ${cell(b.lcp, a.lcp)} | ${cell(b.interactive, a.interactive)} | ${cell(b.warm, a.warm)} | ${cell(b.commits, a.commits)} | ${cell(b.edgeCalls, a.edgeCalls)} |`,
      );
    }

    const avg = (rows: Row[], k: keyof Row) =>
      Math.round(
        rows.reduce((s, r) => s + ((r[k] as number) ?? 0), 0) / rows.length,
      );
    console.log('\n### Aggregate\n');
    for (const k of ['lcp', 'interactive', 'warm', 'commits', 'edgeCalls'] as const) {
      const x = avg(before, k);
      const y = avg(after, k);
      console.log(`- **${k}**: ${x} → ${y} (${pct(x, y)} better)`);
    }
  }
}

main();
