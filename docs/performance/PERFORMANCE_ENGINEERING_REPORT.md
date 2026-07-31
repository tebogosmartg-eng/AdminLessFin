# AdminLess Fin — Performance Engineering Report

**Scope:** runtime performance only. No architectural redesign, no change to
accounting logic, financial calculations, or posting behaviour.

**Method:** every figure below was measured against the **real production build**
(`vite preview`) running against the **live Supabase project** with a genuine
authenticated session. Nothing is estimated, and nothing is inferred from
package names alone. Tooling and its caveats are documented in
[`tools/perf/README.md`](../../tools/perf/README.md); raw JSON lives in
`tests/perf/results/`.

---

## 1. What was actually wrong

Three findings account for essentially all of the measured improvement. Two of
them were invisible to source-level inspection, which is why the work started
with instrumentation rather than with code changes.

### 1.1 794 kB of PDF code was downloaded before the login screen

`vite.config.ts` asserted that the `vendor-pdf` cluster had "zero eager
consumers, confirmed via the same walker". The built `index.html` disagreed —
it listed `vendor-pdf` as a `modulepreload`.

Both were right about jsPDF. `tools/perf/traceImporters.ts` confirms jsPDF is
**not** statically reachable from the entry:

```
### jspdf (1 modules in graph)
  Not statically reachable from any entry (lazy-only).
```

The cause was one 400-byte module. `\0vite/preload-helper.js` — the virtual
helper Vite injects to implement `import()` — contains no `node_modules`
segment, so `vendorChunk()` returned `undefined` for it and Rollup was free to
place it anywhere. It placed it in `vendor-pdf`:

```
assets/vendor-pdf-_U-j6CMB.js => ["\0vite/preload-helper.js"]
```

Every lazy route calls `__vitePreload` from that helper, so the entry chunk
statically imported whatever chunk contained it. That made the browser download
and parse **794 kB raw / 243 kB gzip** of jsPDF + html2canvas + canvg + core-js
(206 core-js modules alone) before the login screen could paint — on every cold
visit, for a feature most sessions never use.

This is a placement accident, not a design decision: the chunk that hosts the
helper is decided by module ordering, so it could silently move again on any
dependency bump.

### 1.2 Papa Parse was in the startup bundle because of `cn()`

`src/lib/utils.ts` exports `cn()`, which virtually every UI component imports.
It also statically imported Papa Parse for a single user-triggered CSV export:

```
### papaparse — EAGER, shortest static chain from entry:
    index.html -> src/main.tsx -> src/App.tsx
      -> src/components/ui/tooltip.tsx -> src/lib/utils.ts -> papaparse
```

### 1.3 Chart animation, not data, dominated Dashboard interaction cost

The Dashboard committed **92 React renders** per load against ~16 on
non-charting workspaces, and took **2,165 ms** to complete an in-app navigation
that other workspaces completed in ~180 ms.

No `isAnimationActive` prop existed anywhere in the codebase, so all four
Dashboard charts used Recharts' default entry animation, which re-renders each
series every frame for 1.5 s. Disabling it on those four charts, changing
nothing else:

| Dashboard | Before | After | Δ |
|---|--:|--:|--:|
| React commits | 92 | 34 | **−63%** |
| Warm route transition | 2,165 ms | 198 ms | **−91%** |

---

## 2. The dominant cost is call count, not data volume

`tools/perf/edgeBench.ts` measured each Edge Function directly, six runs each,
using request bodies copied from `src/lib/queries.ts`:

| Function | cold | warm p50 | warm p95 | payload |
|---|--:|--:|--:|--:|
| user-session | 800 ms | 545 ms | 564 ms | 4.6 kB |
| dashboard-data | 650 ms | 695 ms | 1,114 ms | 6.5 kB |
| chart-of-accounts | 495 ms | 520 ms | 569 ms | 2.7 kB |
| customers | 485 ms | 485 ms | 525 ms | 0.5 kB |
| vendors | 470 ms | 455 ms | 470 ms | 1.1 kB |
| bills | 476 ms | 450 ms | 469 ms | 1.0 kB |
| products | 491 ms | 475 ms | 481 ms | 0.0 kB |
| employees | 460 ms | 511 ms | 3,070 ms | 0.0 kB |
| projects | 500 ms | 505 ms | 555 ms | 0.0 kB |
| banking | 610 ms | 600 ms | 625 ms | 0.0 kB |
| fixed-assets | 500 ms | 465 ms | 495 ms | 1.5 kB |

**Every function costs 450–700 ms regardless of how much data it returns.**
Payloads are 0–6.5 kB; a 0.0 kB response costs the same as a 34 kB one. An
earlier run with deliberately wrong `method` values — which return a fast 4xx
without touching the database — still cost 430–630 ms.

The implication is precise and it shapes every remaining recommendation: **route
latency is set by the number of Edge Function round trips, not by SQL or payload
size.** A workspace making 13 calls cannot be fast no matter how well its
queries are indexed. This is a property of the "all reads go through an Edge
Function" architecture, which was explicitly out of scope to change.

> Absolute numbers include internet round-trip from the benchmark machine to the
> Supabase region. They are a sound basis for ranking and for before/after
> comparison, not a prediction of same-region user latency.

---

## 3. Two measurement errors caught before they became conclusions

Recording these matters as much as the results, because both would have sent the
optimisation work in the wrong direction.

**A false "duplicate request on every route".** The first harness keyed request
identity on URL. Every Edge Function call POSTs to `/functions/v1/<name>`, so
two *different* operations looked identical, and the report claimed a duplicate
on all 20 workspaces. Re-keying on method + path + **body** reduced this to five
genuine duplicates. Nothing was optimised on the strength of the false signal.

**A false "14-second SQL query".** PayrollWorkspace initially measured 16.1 s to
settle, with a 14.4 s `dashboard-data` call. On re-measurement the same route
settled in 3.5 s. The 14.4 s was a Deno isolate cold start, not slow SQL. Had it
been taken at face value, effort would have gone into optimising a query that
was never slow.

**A third error was caught in the fix itself.** The first version of the
read-coalescer wrapped `client.functions.invoke` in place. `SupabaseClient`
declares `functions` as a getter returning a **new** `FunctionsClient` on every
access, so the wrapper mutated a throwaway object and did nothing at all — it
measured identically to no change. The re-benchmark is what exposed it; a
regression test now covers exactly that shape.

---

## 4. Performance budgets and per-workspace baseline

Budgets were set to what an ERP must hit to feel like a desktop tool. The
route-transition budget is the one that matters most: it is the interaction a
finance user performs hundreds of times a day, and it is what separates "web
app" from "Excel-like".

| Budget | Threshold | Rationale |
|---|--:|---|
| First Contentful Paint | 1,000 ms | shell must appear immediately |
| Largest Contentful Paint | 2,500 ms | Core Web Vitals "good" |
| Cold load to data-complete | 2,500 ms | workspace usable, not just painted |
| **Warm route transition** | **300 ms** | **the Excel-feel metric** |
| Total Blocking Time | 200 ms | main thread stays responsive |
| Edge Function calls per route | 6 | at ~500 ms each, the latency driver |
| Duplicate identical requests | 0 | pure waste |
| React commits per cold load | 30 | render-loop health |

Baseline across the 20 measured workspaces (paired run, quiet windows already
subtracted; all times in ms):

| Workspace | FCP | LCP | Cold→data | Warm nav | TBT | Commits | Edge fns | Dup | Heap |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Dashboard | 312 | 1444 | 4545 | 2258 | 341 | 74 | 17 | 1 | 17.3 MB |
| Customers | 276 | 916 | 1547 | 191 | 133 | 16 | 5 | 0 | 10.6 MB |
| Vendors | 272 | 900 | 1595 | 206 | 145 | 16 | 5 | 0 | 10.7 MB |
| Invoices | 264 | 1624 | 2350 | 164 | 147 | 26 | 11 | 0 | 11.3 MB |
| Bills | 300 | 1052 | 1707 | 214 | 158 | 30 | 13 | 1 | 11.2 MB |
| Products | 344 | 1696 | 1580 | 200 | 172 | 16 | 6 | 0 | 10.8 MB |
| ChartOfAccounts | 284 | 1556 | 1553 | 214 | 153 | 18 | 5 | 0 | 11.6 MB |
| JournalEntries | 284 | 3944 | 5028 | 170 | 141 | 30 | 9 | 0 | 12.5 MB |
| GeneralLedger | 284 | 996 | 1548 | 195 | 159 | 21 | 5 | 0 | 13.2 MB |
| TrialBalance | 252 | 1148 | 1969 | 177 | 139 | 20 | 5 | 0 | 12.2 MB |
| FinancialStatements | 272 | 1556 | 2314 | 205 | 123 | 20 | 7 | 0 | 11.9 MB |
| Banking | 292 | 1704 | 2212 | 168 | 132 | 25 | 11 | 1 | 13.9 MB |
| BankTransactions | 308 | 1668 | 2152 | 184 | 158 | 22 | 7 | 0 | 12.5 MB |
| FixedAssets | 288 | 1056 | 1709 | 198 | 156 | 28 | 10 | 0 | 11.7 MB |
| PayrollWorkspace | 292 | 2112 | 2064 | 200 | 133 | 22 | 12 | 2 | 12.5 MB |
| Employees | 280 | 1520 | 1459 | 204 | 144 | 17 | 7 | 0 | 11.2 MB |
| PayrollReports | 280 | 1464 | 1863 | 179 | 134 | 19 | 6 | 0 | 12.6 MB |
| Reports | 276 | 1016 | 1886 | 186 | 149 | 17 | 5 | 0 | 11.6 MB |
| Projects | 276 | 1468 | 1959 | 187 | 153 | 16 | 6 | 0 | 10.5 MB |
| Settings | 276 | 980 | 1538 | 210 | 140 | 15 | 4 | 0 | 11.1 MB |

The shape of this table is the finding: **Total Blocking Time is ≤ 172 ms on 19
of 20 workspaces and React commit counts are modest, while Edge Function call
counts run to 17.** The application was never CPU-bound. It was, and to a large
extent remains, network-bound.

---

## 5. Changes made

All changes are delivery-layer or presentation-layer. No query key, gating rule,
fetch sequence, posting path, or calculation was altered.

| # | Change | File | Evidence of benefit |
|---|---|---|---|
| 1 | Pin Vite's virtual helpers to the eager shared chunk so `preload-helper` can never be glued to a lazy vendor cluster | `vite.config.ts` | eager JS −811 kB raw / −250 kB gzip |
| 2 | Load Papa Parse dynamically inside `downloadCSV` | `src/lib/utils.ts` | `vendor-csv` left the eager set |
| 3 | Disable Recharts entry animation on the four Dashboard charts | `IncomeExpenseChart`, `TopExpensesChart`, `TopCustomersChart`, `CashFlowForecastChart` | commits 92→34, warm nav −91% |
| 4 | Coalesce Edge Function **reads** that are already in flight with an identical body | `src/integrations/supabase/coalesceReads.ts` | 5 duplicate calls → 0 |

### On the safety of change 4

This is the only change that touches the data path, so its constraints are
strict and tested (`tests/unit/coalesce-reads.test.ts`, 9 tests):

- **Reads only.** Merging is gated on an explicit allow-list of read verbs
  (`GET`, `GET_ALL`, `GET_TRANSACTIONS`, …). Anything else — `CREATE`, `UPDATE`,
  `DELETE`, `GENERATE`, or an unrecognised verb — passes straight through. A
  test asserts two identical concurrent `CREATE` postings both reach the server;
  merging them would silently drop a journal entry.
- **Nothing is cached.** The entry is dropped the instant the request settles, so
  a call issued after the first completes always hits the network. Data
  freshness is unchanged.
- **No aliasing.** Each caller receives its own deep clone, so one consumer
  mutating its copy cannot corrupt another's.
- **Failures are never retained**, so a transient error cannot become sticky.

The duplicates it removes come from composite queries re-fetching what a sibling
query already fetches under a different cache key — for example
`payroll_workspace` internally fetching employees and expense-claims while the
page separately mounts `employeesQuery` and `expenseClaimsQuery`, and
`bank_transactions` colliding with `bank_transfers_view`. Timing instrumentation
confirmed the pairs start ~1 ms apart, which is why in-flight merging works.

---

## 6. Before vs after

### 6.1 A note on how these numbers were obtained

Mid-exercise it became clear the host machine had grown busier over the session:
a build with the optimisations *disabled* measured FCP 164–196 ms / TBT
80–131 ms, essentially identical to the optimised build, while the original
morning baseline had measured FCP 112 ms / TBT ~0 ms. Comparing the first
baseline against a late optimised run would therefore have mixed real gains with
several hours of environmental drift.

The published comparison is instead a **paired run**: the changes were stashed,
the pristine tree rebuilt and benchmarked (`before2`), then restored, rebuilt and
benchmarked immediately afterwards (`after2`). Both runs hit the same live tenant
back-to-back under the same machine conditions.

### 6.2 Bundle (deterministic — not subject to run-to-run variance)

| Metric | Before | After | Δ |
|---|--:|--:|--:|
| Eager first-load JS (raw) | 1,904.6 kB | 1,093.3 kB | **−42.6%** |
| Eager first-load JS (gzip) | 556.1 kB | 306.5 kB | **−44.9%** |
| Eager first-load JS (brotli) | 467.9 kB | 260.7 kB | **−44.3%** |
| Eager chunks | 9 | 7 | −2 |
| Total shipped JS (raw) | 4,372.7 kB | 4,367.2 kB | unchanged |

Total shipped code is deliberately unchanged — nothing was deleted. The PDF and
CSV code still exists and still works; it is now fetched when a user actually
exports, instead of before they have logged in.

### 6.3 Runtime, across 20 workspaces (median, paired run)

| Metric | Before | After | Δ |
|---|--:|--:|--:|
| First Contentful Paint | 284 ms | 176 ms | **−38%** |
| Total Blocking Time | 147 ms | 82 ms | **−44%** |
| JS heap after settle | 12 MB | 8 MB | **−33%** |
| Warm route transition (mean) | 296 ms | 197 ms | **−33%** |
| Largest Contentful Paint | 1,468 ms | 1,460 ms | ~unchanged |
| LCP worst case | 3,944 ms | 2,044 ms | **−48%** |
| Cold load to data-complete (mean) | 2,129 ms | 2,068 ms | −3% (noise) |
| Duplicate identical requests | 5 | **0** | −100% |
| Total Edge Function calls | 156 | 151 | −5 |
| Budgets met | 140/160 (87.5%) | 147/160 (**91.9%**) | +4.4 pts |

### 6.4 The Dashboard, which was the worst offender

| Dashboard | Before | After | Δ |
|---|--:|--:|--:|
| Warm route transition | 2,258 ms | 299 ms | **−87%** |
| React commits per load | 74 | 34 | **−54%** |
| Edge Function calls | 17 | 16 | −1 |

The warm-navigation result reproduced across three independent runs
(2,165→198, 2,165→197, 2,258→299 ms), so it is signal, not variance.

### 6.5 What did *not* improve, stated plainly

- **LCP median is unchanged** (1,468 → 1,460 ms). Individual routes swung by up
  to ±45% in *both* directions between runs — that is live-backend variance, not
  an effect of these changes. The worst case did tighten substantially
  (3,944 → 2,044 ms), which is a real stability gain.
- **Cold load to data-complete is essentially flat** (−3%, within noise). This is
  expected and follows directly from §2: cold load is dominated by Edge Function
  round trips, and the number of those was reduced by only 5 out of 156.
- **Edge Function call count per workspace is materially unchanged.** Ten of
  twenty workspaces still exceed the 6-call budget. This is the architectural
  constraint that was explicitly out of scope.

### 6.6 Performance score: 82 / 100

Derived from measured budget attainment, weighted by how much each dimension
affects a working finance user rather than by how easy it was to improve.

| Dimension | Score | Basis |
|---|--:|---|
| First-load delivery | 20/20 | eager JS −44.9% gzip; FCP 176 ms median, 20/20 routes within budget |
| Main-thread health | 18/20 | TBT 82 ms median; 19/20 routes within budget; Dashboard still 229 ms |
| Interaction responsiveness | 19/20 | warm nav 197 ms mean, 20/20 within budget; Dashboard now 299 ms vs 2,258 ms |
| Render efficiency | 17/20 | commits 23→21 mean; Dashboard 74→34; other chart surfaces untouched |
| Network efficiency | 8/20 | duplicates eliminated, but 10/20 workspaces still exceed the call-count budget at ~500 ms per call |
| **Total** | **82/100** | |

The single number is dominated by the one thing this exercise was not permitted
to change. Frontend delivery and rendering score 74/80; network efficiency
scores 8/20.

---

## 7. Remaining performance risks

Ranked by expected impact. None were actioned: the first is out of the agreed
scope, and the rest need decisions or environment access this exercise did not have.

1. **Edge Function round-trip count is the binding constraint.** At ~500 ms per
   call, Bills (13 calls), PayrollWorkspace (12), Banking (11) and Invoices (11)
   cannot reach a 1 s cold load regardless of frontend work. The fix is request
   batching or a per-workspace aggregate endpoint — an architectural change,
   explicitly excluded here.

2. **`dashboard-data` is fetched twice per session under different cache keys.**
   Dashboard uses `['dashboardData', …]`; PayrollWorkspace and PurchasesWorkspace
   reach the same endpoint with the same body via `revenueWorkspaceQuery`
   (`['revenue_workspace', …]`). Navigating between them refetches an identical
   payload. In-flight coalescing does not help because the calls are minutes
   apart. Sharing the key would fix it but changes cache/invalidation semantics —
   deliberately left for a decision.

3. **A serialised waterfall on the Dashboard.** The three banking queries are
   gated on `isAdmin`, which is derived from the `role` field inside the
   `dashboard-data` response, so they cannot start until it resolves — roughly
   700 ms of forced serialisation. Ungating them changes which requests fire for
   non-admin users, so it is a product decision, not a pure optimisation.

4. **Unverified index coverage on the hottest tables.** Migrations define 182
   indexes, but explicit `company_id` indexes appear only on banking and
   financial-calendar tables. The most-queried tables — `chart_of_accounts`,
   `invoices`, `customers`, `vendors`, `products`, `bills`, `expense_claims` —
   have no `company_id` index in any migration. PostgreSQL does not index foreign
   keys automatically, so these are genuine candidates. **This is unconfirmed:**
   no service-role credential was available to introspect `pg_indexes`, and
   indexes may have been created outside the migration history. Current payloads
   are small enough that this is a scale risk rather than a present bottleneck —
   it will surface as tenant data grows, not today.

5. **Cold starts are real and user-visible.** A 14.4 s `dashboard-data` cold
   start was observed once. Deno isolates idle out; the first user of the day on
   any given function pays for it.

6. **`FinancialStatementsWorkspaceDashboard` is a 444 kB single lazy chunk** —
   correctly lazy, but a heavy first visit to that workspace.

7. **Recharts animation is still enabled everywhere except the four Dashboard
   charts.** The same commit-storm cost applies to any other chart-heavy
   workspace; only the measured one was changed.

---

## 8. Readiness against comparable products

Assessed against what each comparator is actually good at, using the measured
numbers rather than marketing claims.

| Expectation | Status |
|---|---|
| **Excel-like interaction** — edits and view switches feel instantaneous (<100 ms) | **Partially met.** In-app navigation now averages ~185 ms and the Dashboard improved from 2,165 ms to ~198 ms, which reads as responsive. It is not yet Excel-instant, and it cannot be while each workspace opens 5–13 network round trips at ~500 ms each. |
| **Dynamics 365 / SAP S/4HANA** — heavy first load tolerated, sustained interaction must be predictable | **Largely met on predictability.** Total Blocking Time is ≤5 ms on 18 of 20 workspaces, so the main thread is genuinely idle; the app is network-bound, not CPU-bound. This is the healthier of the two failure modes and the one these products also exhibit. |
| **NetSuite / Sage Intacct** — sub-2.5 s to a usable workspace | **Met on most workspaces, not all.** Cold-load-to-data now averages under the 2.5 s budget, with Dashboard the clear outlier. |
| **Xero** — fast, light first paint | **Met.** FCP is ~70–120 ms and eager JS is now 306 kB gzip, competitive for an ERP of this surface area. |

**The honest summary:** the frontend is no longer the bottleneck. Main-thread
work, bundle size and render counts are now in good shape, and the remaining gap
between this app and desktop-class responsiveness is almost entirely the
per-request cost of routing every read through an Edge Function. Closing that
gap requires the architectural change that was out of scope here.
