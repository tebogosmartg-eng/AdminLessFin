# 04 — Regression Report (V6.6.0)

**Run date:** 2026-07-14  
**Scope:** Ensure EFS acceptance activity did not regress Accounting, Payroll, or platform stability

## Unit test suite

```
npm test
```

| Metric | Result |
|--------|--------|
| Test files | 7 passed |
| Tests | 62 passed |
| Duration | ~8.3s |
| EFS-specific unit tests | **None** (gap noted) |

## Edge function regression (V6.5.2 probes — re-run 2026-07-14)

```
node scripts/efs-edge-live-validation.mjs
```

| Probe | Result |
|-------|--------|
| OPTIONS preflight HTTP 200 | PASS |
| CORS headers complete | PASS |
| Function reachable (non-404) | PASS |
| Unauthenticated POST rejected | PASS |

## Accounting independence

| Gate | Status | Evidence |
|------|--------|----------|
| EFS does not mutate accounting balances | PASS | Validation + Review platforms read-only; edge header explicit |
| Statutory statements never read live GL post-seal | PASS | `financialFactsAdapter` + statement engine |
| No duplicated accounting calculations in EFS | PASS | Single seal via `EXTRACT_FACT_SNAPSHOT` RPC refs |
| Legacy `/financial-statements` operational reports unchanged | PASS | Separate route; V6.5.0 regression |

## Internal Preview regression (V6.5.x lineage)

| Area | Status |
|------|--------|
| Feature flags (`flags.ts`) | PASS — Publication/XBRL/AI forced off |
| Navigation gate | PASS — `shouldShowFinancialStatementsNav()` |
| Permission matrix | PASS — owner/admin/member+allowlist |
| Phase A–D2 migrations idempotent | PASS (prior board evidence) |

## Known gaps (not regressions)

| Gap | Impact |
|-----|--------|
| No EFS unit/integration tests | Cannot catch statement engine regressions in CI |
| Sidebar `?surface=` query params unused | UX nav model partially wired |
| Dashboard validation/review counts are placeholders | Cosmetic only |

## Changes introduced for V6.6.0 acceptance

| Change | Risk |
|--------|------|
| `tests/e2e/run-efs-e2e-certification.ts` (new) | None — test harness only |
| `npm run certify:efs` script | None |
| Certification docs under `docs/financial-statements-certification/V6.6.0/` | None — documentation only |

No application code, migrations, or edge function changes were made during this acceptance run (architecture frozen).

## Verdict

**Regression gates: PASS**

No regressions detected in existing test suite or edge infrastructure. EFS-specific automated regression coverage remains a gap for future certification cycles.
