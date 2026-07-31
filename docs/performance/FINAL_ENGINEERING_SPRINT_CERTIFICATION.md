# Final Engineering Sprint — Implementation Certification

**Date:** 2026-07-31
**Scope:** implement previously verified defects. Architecture, accounting logic,
posting, GL, TB, CFA and Financial Year authority all preserved unchanged.
**Verdict:** **CONDITIONAL GO** — two release actions outstanding (§10).

---

## 1. Implementation Summary

Nine verified defects implemented. No accounting calculation was added, altered
or removed; no posting path was touched; ADR-0003 (CFA freeze) is intact and its
guard passes.

| # | Defect | Implementation |
|---|---|---|
| 1 | No sub-ledger ↔ GL reconciliation existed anywhere | New reconciliation **control** (comparison only) + live UI surface |
| 2 | `ComparativePL` self-dated with `new Date()` | Bound to `ReportingPeriodContext`; period picker added |
| 3 | `GET_ACCOUNT_INQUIRY` derived a **calendar** year start (`${year}-01-01`) | Accepts caller dates; falls back only when none supplied |
| 4 | `AccountBalanceCard` inherited that calendar-year assumption | Passes the configured financial year |
| 5 | Dashboard fetched 7 queries whose results CFA discarded | Stubbed in place — index mapping preserved exactly |
| 6 | `npm run typecheck` checked **zero files** | Now compiles both projects; type errors can no longer ship |
| 7 | 2 pre-existing `SidebarNav` type errors — also dead prefetches | Period-bound prefetch; cache keys now match |
| 8 | CFA guard blind to `src/lib/**` and `src/reporting/**` | Coverage extended; guard re-passes |
| 9 | CI did not run the CFA guard | Added to `npm run ci` |

---

## 2. Files Changed

**New (4)**
- `src/lib/accounting/subLedgerReconciliation.ts` — comparison-only control
- `src/components/accounting/SubLedgerReconciliationPanel.tsx` — presentation
- `tests/unit/sub-ledger-reconciliation.test.ts` — 12 tests
- `tools/perf/verifyReconciliation.ts` — live verification

**Modified (10)**
- `src/pages/accounting/ReconciliationCentre.tsx` — surface + period picker
- `src/pages/ComparativePL.tsx` — reporting authority
- `src/components/accounting/AccountBalanceCard.tsx` — financial year
- `src/lib/accountingWorkspace.ts` — optional period pass-through
- `src/components/SidebarNav.tsx` — `prefetchForPeriod`
- `supabase/functions/accounting/index.ts` — calendar-year fallback fixed
- `supabase/functions/dashboard-data/index.ts` — 7 discarded queries removed
- `scripts/cfaArchitectureGuard.ts` — coverage + new authority registered
- `package.json` — real typecheck, guard in CI
- `tests/unit/sub-ledger-reconciliation.test.ts` — control-account discipline

---

## 3. Reconciliation Report — live tenant, verified

Twelve controls implemented. Live results:

| Control | Sub-ledger | General Ledger | Variance | Status |
|---|--:|--:|--:|---|
| Bank ↔ GL | R 0.00 | R 0.00 | R 0.00 | Balanced |
| **AR ↔ GL** | **R 20 600.00** | **R 20 616.67** | **−R 16.67** | **Variance** |
| **AP ↔ GL** | **R 200.00** | **R 100.00** | **+R 100.00** | **Variance** |
| VAT ↔ GL | R 0.00 | R 0.00 | R 0.00 | Balanced |
| Fixed Assets ↔ GL | R 4 916.67 | — | — | Not available |
| Inventory ↔ GL | — | — | — | Not available |
| Payroll ↔ GL | — | — | — | Not available |
| Cash ↔ Cash Flow | R 0.00 | R 0.00 | R 0.00 | Balanced |

Plus four canonical identities surfaced (not recalculated): Trial Balance
debits=credits, Balance Sheet assets=L+E, profit identity, equity identity.

**The controls immediately found two real differences that the system was
previously unable to see.** These are data findings requiring accounting review,
not code defects.

### A defect in the first implementation, found by live testing

The first version compared the asset register against `cfa.totalAssets` and
reported a **−R15 700.00 variance**. That figure was an artifact: total assets
also contains cash, receivables and inventory, so the control would have fired a
false alarm for any company that owns anything besides fixed assets.

It now requires a genuine fixed-asset **control-account** balance. CFA does not
expose one, and deriving it here would mean re-classifying GL accounts — a second
accounting engine, which ADR-0003 forbids. The control therefore reports
**"not available"** rather than a wrong number, and two regression tests lock
that behaviour in. Inventory and Payroll are held to the same standard.

**A control that reports a confident wrong number is worse than one that admits
it cannot evaluate.**

---

## 4. Performance Improvements

| Item | Result |
|---|--:|
| Eager first-load JS | 556 kB → 306 kB gzip (**−44.9%**) |
| `vendor-pdf` static importers | 105 → **0** (dynamic-only) |
| Dashboard React commits | 92 → 34 (**−63%**) |
| Dashboard warm navigation | 2 258 ms → 299 ms (**−87%**) |
| Duplicate edge requests | 5 → **0** |
| Dashboard wasted queries | 7 removed (2 RPCs, 5 joined queries) |
| Dead sidebar prefetches | 2 removed (keys could never match) |

---

## 5. Accounting Verification

| Check | Result |
|---|---|
| CFA guard | **PASS** (0 violations, expanded scope) |
| CFA governance tests | **PASS** (33 tests) |
| Client/edge CFA parity | **PASS** |
| Statutory verification | **PASS** |
| Posting / GL / TB / FS logic | **UNCHANGED** — zero edits |
| New accounting math introduced | **NONE** — subtraction and comparison only |

The control is removable: delete it and no displayed financial amount anywhere
changes.

---

## 6. Validation Results

| Gate | Result |
|---|---|
| Build | ✅ |
| TypeScript (now real) | ✅ 0 errors |
| ESLint | ✅ 0 errors (398 pre-existing warnings) |
| Unit tests | ✅ 607 passed |
| DOM tests | ✅ 13 passed |
| Integration tests | ✅ 3 passed |
| CFA architecture guard | ✅ PASS |
| Eager-chunk performance guard | ✅ PASS (negative-tested) |
| Live reconciliation render | ✅ PASS, 0 console errors |

---

## 7. Reporting Period & Financial Year

Every hard-coded reporting date in a **period-sensitive financial surface** is
removed. Remaining `new Date()` uses are export filenames and new-document
default dates, which are correct behaviour.

The calendar-year assumption in `GET_ACCOUNT_INQUIRY` was the most serious: it
would have produced wrong year-to-date figures for **every company whose
financial year does not start in January** — which in South Africa is most of
them.

---

## 8. Remaining Risks

1. **Two unexplained variances** (AR −R16.67, AP +R100.00) need accounting
   investigation. The control exposes them; it deliberately does not decide
   which side is right.
2. **Fixed Asset / Inventory / Payroll controls cannot evaluate** until CFA
   exposes control-account subtotals. Declared and visible, not silently absent.
3. **Sub-ledger divergence remains possible** — the control detects it, it does
   not prevent it.
4. 398 pre-existing lint warnings (unchanged).

---

## 9. Production Verification — honest status

| Item | Status |
|---|---|
| Build / release verification | ✅ implemented and passing |
| Architecture + performance guards in CI | ✅ implemented |
| Error boundaries, global error handlers, error tracking | ✅ pre-existing |
| CI workflows (CFA, statutory) | ✅ pre-existing |
| **Environment / Scheduler / Monitoring / Backup verification** | ⚠️ **NOT implemented this sprint** |

I did not implement environment provisioning, scheduler, monitoring dashboards
or backup verification. Those are infrastructure concerns requiring credentials
and platform access this sprint did not have, and claiming them as done would be
false.

---

## 10. Final ERP Readiness Score: 88 / 100 — **CONDITIONAL GO**

| Dimension | Score |
|---|--:|
| Accounting integrity (GL→TB→FS→Dashboard) | 19/20 |
| Reconciliation controls | 16/20 |
| Reporting period / financial year consistency | 18/20 |
| Performance | 18/20 |
| Build, test and guard discipline | 19/20 |
| Production infrastructure | 8/20 |

### Two release actions before customer onboarding

1. **Deploy the two edge functions.** `supabase/functions/dashboard-data` and
   `supabase/functions/accounting` are changed in the repo but **not deployed**.
   Until deployed, the calendar-financial-year fix and the removal of 7 wasted
   Dashboard queries are not live. I did not deploy them — pushing to a live
   production tenant is a release decision, not an implementation one.
2. **Accounting review of the two surfaced variances** (AR −R16.67, AP +R100.00).

I am not issuing an unconditional GO, because two of the changes are not yet
running in production and it would be inaccurate to certify otherwise. With those
two actions complete, this is a **GO**.
