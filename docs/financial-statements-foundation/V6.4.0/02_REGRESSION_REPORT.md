# 02 — Regression Report (Phase A)

**Version:** 6.4.0  
**Board:** Independent Principal Enterprise Implementation Board  
**Date:** 2026-07-13  

---

## Quality gates

| Gate | Result | Evidence |
|------|--------|----------|
| No broken routes | ✅ PASS | `/financial-statements` retained; new routes additive behind gate |
| Existing Reports unchanged | ✅ PASS | No edits to `src/pages/Reports.tsx` or Reports ownership |
| Existing Accounting unchanged | ✅ PASS | No CoA/journal/ledger calculation redesign; extract calls existing `get_balances_as_of_date` only |
| Existing Payroll unchanged | ✅ PASS | No payroll files touched |
| Existing Assets unchanged | ✅ PASS | No assets/loans files touched |
| Reporting Snapshot immutable | ✅ PASS | DB triggers deny Fact Snapshot mutation; certified/frozen version content protected |
| Multi-company preserved | ✅ PASS | All tenant tables keyed by `company_id`; edge API membership check |
| RLS preserved | ✅ PASS | RLS enabled on all tenant EFS tables via `company_users` |
| Navigation unchanged until authorised | ✅ PASS | `SidebarNav` still only links `/financial-statements` (operational); `shouldShowFinancialStatementsNav()` hard-returns `false` |

---

## Static verification

| Check | Result |
|-------|--------|
| TypeScript `tsc --noEmit` | PASS (exit 0) |
| Sidebar contains `/financial-statements-workspace` | NO |
| Operational FS page imports EFS API | NO |
| Phase B statement engines present | NO (intentional) |

---

## Residual risks (non-blocking for Phase A)

1. Remote migration apply pending (Supabase project was INACTIVE at implementation time) — apply `20260713203152_efs_v640_financial_statements_foundation.sql` before lab UAT.
2. Edge function `financial-statements` must be deployed with secrets `EFCP_SILENT_BACKENDS=true` (and/or `EFS_MODULE=true`) for lab.
3. Frontend flags default OFF — enable `VITE_EFS_WORKSPACE_UI=true` (or allowlist) for developer access only.

---

## Verdict

**Phase A regression gates: PASS**
