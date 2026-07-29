# Database Consistency Report (Phase A)

Date: 2026-07-02  
Scope: Schema, migrations, RPCs, RLS assumptions, storage, and frontend/backend contract consistency

## Executive Result

Database consistency is **partially verifiable** in this phase:
- Static contract mapping is strong (frontend -> edge -> RPC paths are present).
- Live schema-level verification is blocked (local Supabase not running; remote project inactive/timeouts).

## Live Database Verification Status

- Local stack: `supabase start` failed due Docker daemon unavailability.
- MCP Supabase:
  - Project discovered: `vovtagdmmruqehnmxmth` (`INACTIVE`)
  - `list_tables`, `list_migrations`, `list_extensions` timed out
  - `list_edge_functions` returned empty deployed set

Impact: Unable to directly verify live tables, indexes, constraints, triggers, views, policies, and storage configuration from active database metadata.

## Static Schema/Contract Inventory (From Repository)

### SQL and Migrations
- No `.sql` files found in workspace.
- No migration files/directories found under `supabase`.

### Edge Functions (Code-defined data contract layer)
- Function directories present under `supabase/functions` (accounting, invoices, bills, reports, settings, payroll, etc.).
- `seed-data` and `year-end-close` directories are present but empty.

### RPC Inventory (from edge function code)
- `get_balances_as_of_date`
- `get_period_activity`
- `get_cash_flow_statement`
- `get_aged_receivables`
- `get_aged_payables`
- `get_customer_ar_balances`
- `get_vendor_ap_balances`
- `get_overdue_invoices`
- `get_monthly_summary`
- `get_top_expenses`
- `get_budgets_with_activity`
- `record_bill_with_taxes`
- `record_bill_with_inventory`
- `record_invoice_payment`
- `pay_specific_bill`
- `create_invoice_with_taxes`
- `update_invoice_full`
- `void_invoice`
- `get_next_invoice_number_for_user`
- `get_next_quote_number_for_user`
- `generate_amortization_schedule`
- `record_loan_payment`
- `generate_payslips_for_run`
- `get_payroll_summary_report`
- `create_credit_note`
- `allocate_credit_note`
- `create_vendor_credit`
- `allocate_vendor_credit`
- `close_financial_year`
- `reopen_financial_year`
- `dispose_asset`

### Storage Buckets (from frontend usage)
- `attachments`
- `avatars`

## Consistency Checks

### Frontend <-> Edge consistency
- Broad use of `supabase.functions.invoke(...)` across domains with method payloads matching edge handler switch branches.
- React Query keys are generally scoped by company and/or entity IDs, supporting consistent refresh patterns.

### Policy drift detected
- `src/integrations/supabase/client.ts` explicitly forbids direct frontend `supabase.from(...)`.
- Direct frontend table access still exists in:
  - `src/components/SendInvoiceDialog.tsx`
  - `src/components/SendQuoteDialog.tsx`
  - `src/components/SendPODialog.tsx`
  - `src/components/LoanForm.tsx`
  - `src/components/ReceivePaymentForm.tsx`

### Type safety consistency risk
- No generated DB type artifacts found in repository.
- Widespread `@ts-nocheck` in edge functions reduces contract enforcement.

## RLS, FK, Index, Constraint, Trigger, View Verification

Status:
- RLS policies: **Not live-verified**
- Foreign keys: **Not live-verified**
- Indexes: **Not live-verified**
- Constraints: **Not live-verified**
- Triggers: **Not live-verified**
- Views: **Not live-verified**

Reason: no active introspectable DB endpoint available in this phase.

## Risk Summary

- Critical: inability to prove live DB structural integrity before release.
- High: architecture-policy drift (direct frontend table access).
- Medium: absent migration/sql artifacts in repo limits audit traceability.

## Required Next Validation Gate

Before implementation phase:
1. Restore local Docker and boot local Supabase, or activate a dedicated dev project.
2. Re-run metadata extraction for tables/FKs/indexes/constraints/triggers/views/RLS.
3. Reconcile live schema against frontend forms, queries, dashboard/report dependencies, and edge method contracts.
