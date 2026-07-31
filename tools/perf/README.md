# Performance measurement toolkit

Instruments used to produce `docs/performance/`. Everything here **measures**;
none of it ships in the application bundle.

All runtime tools drive the real production build (`vite preview`) against the
live Supabase project using the `E2E_EMAIL` / `E2E_PASSWORD` session from `.env`.
They are strictly read-only: they navigate and observe, never submit a form or
write a record, so they cannot perturb the tenant's books.

## Prerequisites

```bash
npm run build
npx vite preview --port 4173 --strictPort   # leave running
```

## Tools

| Tool | Answers |
|---|---|
| `bundleReport.ts` | What ships, and what is downloaded *eagerly* on first load? Per-chunk raw/gzip/brotli, plus the entry's static-import closure — which is exactly what Vite turns into `<script>` + `<link modulepreload>`. |
| `traceImporters.ts` | Why is package X in the eager graph? Asks Rollup for the shortest static chain from the entry, following static edges only. |
| `eagerGraph.ts` | Which source files and npm packages are reachable from `src/main.tsx` without crossing a `lazy(() => import())` boundary? |
| `runtimeBench.ts` | Per-workspace FCP, LCP, cold-load-to-data, warm route transition, React commit counts, long tasks / TBT, JS heap, and every network request classified and timed. |
| `edgeBench.ts` | Cold vs warm p50/p95 latency per Edge Function, with real request bodies copied from `src/lib/queries.ts`. |
| `attributeDupes.ts` | Which code issues a repeated identical request. |
| `analyze.ts` | Turns raw harness JSON into budget-checked tables and before/after deltas. |

## Running

```bash
npx tsx tools/perf/bundleReport.ts --out tests/perf/results/bundle-after.json
npx tsx tools/perf/traceImporters.ts jspdf papaparse recharts
npx tsx tools/perf/runtimeBench.ts --label before
npx tsx tools/perf/runtimeBench.ts --label before --routes Dashboard,Invoices
npx tsx tools/perf/edgeBench.ts --runs 6
npx tsx tools/perf/analyze.ts --before before --after after
```

`--routes` selects by route **name**, not path: Git Bash rewrites any argument
that looks like a POSIX path, which silently drops routes from the run.

## Reading the numbers honestly

Three properties of this harness matter when interpreting its output.

**"Settled" is not `networkidle`.** A workspace is considered ready only when no
request is in flight *and* React has stopped committing for a quiet window.
`networkidle` would fire while the page still shows skeletons; commit-quiet alone
would fire before the first row was even requested.

**The quiet window is included in raw output and subtracted in `analyze.ts`**
(900 ms cold, 600 ms warm). Raw `settle`/`warm` figures printed by
`runtimeBench.ts` are therefore ~900/600 ms higher than the corrected figures
published in the reports. The settle poll runs every 100 ms, so corrected times
carry ±100 ms of quantisation — differences smaller than that are noise.

**Duplicate detection keys on method + path + body, never path alone.** Every
Edge Function call in this app POSTs to `/functions/v1/<name>`, so a URL-only key
reports two *different* operations as a duplicate. An earlier revision of this
harness did exactly that and produced a false "duplicate on every route" finding;
the body-aware key reduced it to five real duplicates.

**React commit counts come from the DevTools global hook**, installed before app
code runs. This yields true commit counts against the production build without
modifying application source. Commit *durations* are not available outside a
profiling build — main-thread cost is measured with long tasks / TBT instead.

## Caveat on absolute latency

Edge Function timings include internet round-trip from the machine running the
benchmark to the Supabase region. Treat them as a consistent basis for
before/after comparison and for ranking functions against each other, not as the
latency a user in the same region as the database would see.
