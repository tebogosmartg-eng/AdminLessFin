# 9. Regression Assessment

**Version:** 6.8.0

## Scope of change — everything additive

| Change | Type |
|---|---|
| `supabase/functions/financial-close/` | New Edge Function (new name; no existing function touched) |
| `supabase/migrations/20260717190000_efcp_v680_financial_close_platform.sql` | New migration; creates 4 new `efcp_*` tables only |
| `src/lib/financialClose/`, `src/pages/financialClose/`, `src/components/financialClose/` | New frontend module |
| Routes `/financial-close`, `/financial-close/:closeId` | New routes appended; no existing route changed |
| Sidebar "Financial Close" group | New flag-gated group; renders nothing when `VITE_EFCP_NAV_SIDEBAR` off |
| `VITE_EFCP_*` flags in `.env.example` | New flags; all `VITE_EFS_*` flags untouched |
| `NewEngagementWizard.tsx` | One additive import + one flag-gated notice component in Step 3 |
| `FinancialStatementsWorkspaceDashboard.tsx` | One additive banner + one user-triggered refresh mutation chaining existing certified APIs |

## Frozen surfaces — regression status

| Surface | Status |
|---|---|
| General Ledger / Journal Engine | Unchanged (read-only queries only) |
| Statement Engine / Reporting Snapshots | Unchanged |
| Working Papers / Disclosures | Unchanged |
| Validation Platform | Unchanged (read-only issue counts) |
| Review Workflow (EFS pack review) | Unchanged |
| Publication Platform | Unchanged |
| `financial-statements` Edge Function | Not modified |
| `accounting`, `reports`, `financial-year` Edge Functions | Not modified |
| Existing migrations (V3.x–V6.6.x) | Not modified |
| Existing routes | All preserved |
| Existing `VITE_EFS_*` flags and `EFCP_SILENT_BACKENDS` backend flag | Preserved (EFCP frontend flags are new) |
| V6.6.3 accountant workflow certification | Remains valid — engagement UX unchanged apart from additive notices |

## Behaviour with flags off

With `VITE_EFCP_MODULE` and `VITE_EFCP_WORKSPACE_UI` false: routes redirect home, the sidebar group is hidden, and both FS integration components render `null`. The application is behaviourally identical to V6.6.3.

## Verification

- Full TypeScript typecheck: PASS (0 errors)
- Linter on all new/modified files: PASS (0 issues)
- Table/column names verified against existing edge functions (`fixed_assets`, `loans`, `payroll_runs.pay_period_start`, `journal_entry_items.reconciled`)
