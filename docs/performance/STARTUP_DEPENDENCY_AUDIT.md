# Startup Dependency Audit — why `vendor-pdf` was eagerly modulepreloaded

**Status disclosure:** the root cause below was identified during the
performance pass of 2026-07-31 and the **Tier 1 fix is already applied** to the
working tree. This document re-proves the finding from archived pre-fix bundle
data (`tests/perf/results/bundle-before.json`) plus fresh static analysis of the
current source, and separates what is fixed from what is not.

**Verdict in one line:** no application module ever imported jsPDF eagerly. A
single 400-byte Vite virtual module — `\0vite/preload-helper.js` — was placed
inside the `vendor-pdf` chunk, and that placement alone made 793 kB of PDF code a
static dependency of the entry.

---

## 1. Dependency graph from `src/main.tsx` to `jspdf`

**There is none.** No static path exists.

`tools/perf/eagerGraph.ts` walks every static import from `src/main.tsx`,
stopping at each `lazy(() => import())` boundary:

```
total eager source files            : 188
EAGER files touching reporting/ or PDF modules : (NONE)
eager npm packages including jspdf  : false
```

Rollup's own module graph agrees. `tools/perf/traceImporters.ts` searches upward
from every module of each package to any entry, following **static importer
edges only**:

```
### jspdf (1 modules in graph)             Not statically reachable from any entry (lazy-only).
### jspdf-autotable (1 modules in graph)   Not statically reachable from any entry (lazy-only).
### html2canvas (1 modules in graph)       Not statically reachable from any entry (lazy-only).
### canvg (1 modules in graph)             Not statically reachable from any entry (lazy-only).
### core-js (206 modules in graph)         Not statically reachable from any entry (lazy-only).
```

Both the source-level walker and the bundler-level walker independently conclude
that the entry cannot reach jsPDF. The architecture note in `vite.config.ts` was
**correct** about jsPDF; it was the chunk that was wrong.

---

## 2. Every static import chain that reaches `jspdf`

Exactly three modules import jsPDF at module scope:

| # | Module | Line |
|---|---|---|
| A | `src/lib/payrollDocuments.ts` | `import { jsPDF } from 'jspdf'` (2), `import autoTable from 'jspdf-autotable'` (3) |
| B | `src/reporting/export/pdf/index.ts` | `import jsPDF from 'jspdf'` (1), autoTable (2) |
| C | `src/reporting/audit/VIP/export/pdf.ts` | `import jsPDF from 'jspdf'` (5), autoTable (6) |

Every route that reaches them crosses a `lazy(() => import())` boundary first:

```
A  src/lib/payrollDocuments.ts
   <- src/components/payroll/PayrollCommandCentre.tsx   (imports BANK_BATCH_STATUS_LABELS)
   <- PayrollRunDetail                                   [LAZY route boundary]

B  src/reporting/export/pdf/index.ts
   <- src/reporting/export/index.ts        (barrel: `import { exportPdf, exportPdfAsync } from './pdf'`)
   <- src/pages/PayrollReports.tsx         (imports only `buildReportId`)
                                            [LAZY route boundary]

C  src/reporting/audit/VIP/export/pdf.ts
   <- src/reporting/audit/VIP/export/index.ts  (barrel: `import { exportVipPdf, ... } from './pdf'`)
   <- src/reporting/audit/VIP/index.ts
   <- AuditComplianceReports                    [LAZY route boundary]
```

Two of these three are **barrel-file couplings** worth noting independently of
the eager-preload bug:

- `PayrollReports.tsx` imports a single helper, `buildReportId`, from
  `../reporting/export` — and the barrel's own `import … from './pdf'` drags the
  entire jsPDF tree in behind it.
- `PayrollCommandCentre.tsx` imports one type and one constant
  (`BANK_BATCH_STATUS_LABELS`) from `payrollDocuments.ts`. The type import is
  free (erased at build time); the constant import pulls the whole module,
  jsPDF included.

---

## 3. The module responsible for making `vendor-pdf` eager

**One module, and the evidence is exhaustive.** The pre-fix `vendor-pdf` chunk
contained 238 modules. Filtering out everything belonging to the jsPDF
dependency tree leaves precisely one:

```
--- vendor-pdf module inventory (238 modules) ---
  modules NOT part of the PDF dependency tree: ["vite/preload-helper.js"]
```

That is the whole cause. 237 modules of PDF code, plus one stowaway that the
entire application depends on.

The blast radius was larger than "the entry chunk". **105 chunks statically
imported `vendor-pdf`** — essentially every route in the app — because every
chunk containing a dynamic `import()` needs `__vitePreload` from that helper:

```
--- chunks that STATICALLY import vendor-pdf ---
  assets/index-CVnQ_dcP.js  <== ENTRY
  assets/Customers-D9tgi5vE.js
  assets/Invoices-CGZ19GjQ.js
  assets/TrialBalance-nnMlbZAK.js
  … 101 more …

--- chunks that DYNAMICALLY import vendor-pdf ---
  none
```

Note the second list. **Nothing imported `vendor-pdf` dynamically.** The chunk
that was supposed to be lazy-only had zero lazy importers and 105 static ones.

---

## 4. Was it `payrollDocuments.ts`, `reporting/export/pdf`, or something else?

**Neither. It was `\0vite/preload-helper.js`.**

Ruling the two suspects out is not an inference — it is a direct measurement.
If either had been the cause, jsPDF would appear in the entry's static closure.
It does not (§1). Both modules sit behind lazy route boundaries (§2), and the
post-fix build confirms it: with the helper relocated and **no source change to
either module**, `vendor-pdf` left the eager set entirely.

Those two modules do cause a *different*, smaller problem — they make three lazy
route chunks pull in 793 kB on first visit. That is §7 Tier 2, not this bug.

---

## 5. Does any eager component import them, directly or indirectly?

**No.** Of the 188 source files reachable from `src/main.tsx` without crossing a
lazy boundary, **zero** match `reporting/`, `payrollDocuments`, or
`PayrollCommandCentre`. `jspdf` does not appear in the eager package set.

---

## 6. Why Rollup emitted `vendor-pdf` as a modulepreload

Four mechanics compose into the bug. Each is individually reasonable.

1. **Vite emits `<link rel="modulepreload">` for the entry's transitive *static*
   import closure.** Dynamic imports are excluded by design — that is what makes
   code-splitting work.

2. **`manualChunks` assigns modules to named chunks, and Rollup then lifts
   module-level edges to chunk-level edges.** If *any* module in chunk B is
   statically imported by *any* module in chunk A, then chunk A statically
   imports chunk B — and pulls in **all** of B. Chunk membership is all-or-nothing;
   there is no partial import of a chunk.

3. **`vendorChunk()` returned `undefined` for the helper.** Its first line was:

   ```ts
   if (!id.includes("node_modules")) return undefined;
   ```

   The helper's module id is `\0vite/preload-helper.js` — a virtual module with
   no `node_modules` segment. It fell straight through, leaving placement to
   Rollup's default algorithm, which groups un-assigned modules by their
   entry-dependency signature and may merge them into an existing chunk. It
   merged this one into `vendor-pdf`.

4. **Every `import()` call site statically imports `__vitePreload` from that
   helper.** Since all 100+ routes are lazy, all of them — and the entry —
   acquired a static edge to whatever chunk hosted it.

Composing 1–4: entry → (needs `__vitePreload`) → `vendor-pdf` is a static edge →
Vite preloads `vendor-pdf` → the browser downloads and parses 793 kB raw /
243 kB gzip of jsPDF, html2canvas, canvg and 206 core-js modules before the
login screen can paint.

**The critical property is that step 3 is not deterministic in any meaningful
sense.** Nothing pinned the helper to `vendor-pdf`; Rollup's default placement
merely happened to land there. A dependency bump, a new chunk, or a reordered
regex could move it to `vendor-ocr` or `vendor-recharts` and silently change
which megabyte ships on first paint. That fragility — not the 793 kB itself — is
the real defect.

---

## 7. Smallest change

### Tier 1 — stop `vendor-pdf` shipping at startup *(APPLIED)*

Three lines in `vite.config.ts`, placed **above** the `node_modules` guard so the
virtual modules are claimed before they can fall through:

```ts
if (id.startsWith("\0vite/") || id.startsWith("\0commonjsHelpers")) return "vendor";
```

This is the minimum correct fix: it pins the helper to the already-eager shared
bucket, making placement explicit instead of emergent. No source file changes, no
behaviour change.

Measured result:

| | Before | After |
|---|--:|--:|
| `vendor-pdf` in eager set | yes | **no** |
| Chunks statically importing `vendor-pdf` | 105 | 3 |
| Eager chunks | 9 | 7 |
| Eager JS (raw) | 1,904.6 kB | 1,093.3 kB (**−42.6%**) |
| Eager JS (gzip) | 556.1 kB | 306.5 kB (**−44.9%**) |

The helper now lives in `assets/vendor-*.js`, which is eager by design and where
it costs nothing extra.

### Tier 2 — load `vendor-pdf` *only when an export is requested* **(NOT APPLIED)**

Tier 1 answers the audit's question, but it does **not** fully satisfy the
literal goal of "load only when a PDF export is requested". `vendor-pdf` is still
statically imported by three lazy route chunks:

```
statically imported by: PayrollRunDetail, PayrollReports, AuditComplianceReports
dynamically imported by: (nothing)
```

So merely *visiting* Payroll Run Detail, Payroll Reports, or Audit & Compliance
Reports downloads all 793 kB, whether or not the user ever clicks Export.

Closing that requires converting the three module-scope imports from §2 into
dynamic imports inside the functions that actually use them — the same treatment
already applied to Papa Parse in `downloadCSV`. Assessed cost:

- **`src/lib/payrollDocuments.ts` — low friction.** The three jsPDF consumers
  (`generatePayslipPdf`, `downloadPayslipPdf`, `downloadHtmlAsPdf`) are *already*
  `async`, so `const { jsPDF } = await import('jspdf')` needs no signature change.
  `generatePayslipPdf` returns `Promise<jsPDF>`, but that use is type-only —
  `import type { jsPDF }` is erased at build time and creates no runtime edge.
- **`src/reporting/export/pdf/index.ts` — one signature change.** `exportPdfAsync`
  converts for free; the sync `exportPdf` (line 164) would have to become async,
  so its call sites need checking.
- **`src/reporting/audit/VIP/export/pdf.ts` — identical shape.** `exportVipPdfAsync`
  is free; sync `exportVipPdf` (line 164) needs the same treatment.

Optionally, `PayrollReports.tsx` should import `buildReportId` from its defining
module rather than through the `reporting/export` barrel, so a single helper stops
dragging the PDF tree behind it.

### Tier 3 — prevent silent regression *(recommended, NOT APPLIED)*

Because the original bug was invisible in source and produced no warning, a build
assertion is worth more than the fix itself: fail the build if the eager chunk set
ever contains `vendor-pdf`, `vendor-ocr`, or `vendor-recharts`. `bundleReport.ts`
already computes the eager set, so this is a small wrapper, not new machinery.

---

## Reproducing this audit

```bash
npx tsx tools/perf/eagerGraph.ts                                   # eager source/package closure
npx tsx tools/perf/traceImporters.ts jspdf jspdf-autotable canvg   # bundler-level static reachability
npx tsx tools/perf/bundleReport.ts --out tests/perf/results/x.json # per-chunk sizes + eager set + module inventory
```
