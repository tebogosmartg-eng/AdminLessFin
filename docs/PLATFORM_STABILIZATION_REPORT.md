# Platform Stabilization Report (Phase A)

Date: 2026-07-02  
Scope: Full-stack consistency audit across `Frontend -> API/Edge -> RPC -> Database -> Response -> Frontend`  
Execution mode: Verification only (no code fixes, no SQL execution, no schema mutations)

## Deliverables Produced

1. `docs/PLATFORM_STABILIZATION_REPORT.md`
2. `docs/RUNTIME_VALIDATION_REPORT.md`
3. `docs/DATABASE_CONSISTENCY_REPORT.md`
4. `docs/FRONTEND_BACKEND_TRACEABILITY_MATRIX.md`
5. `docs/SQL_RECOMMENDATION_PACK.md`
6. `docs/PRODUCTION_READINESS_SCORE.md`

## Audit Evidence Summary

- Live runtime evidence:
  - Dev server started successfully at `http://localhost:8080/`.
  - Major configured routes returned HTTP 200 in local smoke run.
  - `npm run build` passed.
  - `npm run lint` failed with `455 errors, 10 warnings`.
- Live backend evidence:
  - `supabase start` failed because Docker daemon is unavailable.
  - Supabase MCP project found (`vovtagdmmruqehnmxmth`) is inactive.
  - `list_tables`, `list_migrations`, `list_extensions` timed out.
- Static evidence completed:
  - Route/guard coverage, CRUD/form path mapping, edge/RPC contract mapping.
  - Dashboard/report/chart lineage tracing.
  - Placeholder keyword audit across required terms.
  - Orphan/dead-path scan.

---

## Critical Findings

### C1) Full end-to-end runtime proof is blocked
- Problem: Full runtime verification could not be completed for all CRUD/report flows.
- Evidence:
  - Local Supabase stack cannot start (`supabase start` fails due unavailable Docker daemon).
  - Remote MCP project is inactive; live metadata introspection timed out.
- Impact: End-to-end assertions for data persistence, RLS behavior, and UI mutation refresh remain unproven in this pass.
- Owner layer: `cross-layer`
- Recommendation: Re-run Phase A validation after restoring local Supabase runtime or activating a staging project with known seed data.

### C2) Quality gate failure in critical frontend/edge paths
- Problem: Edge function code quality gate is failing broadly.
- Evidence:
  - `npm run lint` reports `455 errors, 10 warnings`.
  - Many edge handlers use `@ts-nocheck`.
  - Widespread explicit `any` and switch-case declaration issues.
- Impact: High risk of hidden runtime defects, weak compile-time contract safety, and unstable production behavior.
- Owner layer: `edge`
- Recommendation: Make lint-clean edge runtime a hard release gate before V2 continuation.

---

## High Findings

### H1) Frontend data access policy is violated
- Problem: Frontend directly mutates/queries tables despite edge-only architecture rule.
- Evidence:
  - Policy in `src/integrations/supabase/client.ts` prohibits direct `supabase.from(...)`.
  - Direct access still exists in:
    - `src/components/SendInvoiceDialog.tsx`
    - `src/components/SendQuoteDialog.tsx`
    - `src/components/SendPODialog.tsx`
    - `src/components/LoanForm.tsx`
    - `src/components/ReceivePaymentForm.tsx`
- Impact: Bypasses centralized validation/auditing logic, increases authorization inconsistency risk.
- Owner layer: `frontend` + `edge`
- Recommendation: Move these table operations into dedicated edge function methods.

### H2) Runtime report actions are partially non-functional
- Problem: Report download buttons exist with empty handlers in financial statements.
- Evidence:
  - `src/pages/FinancialStatements.tsx` has export buttons wired to empty handlers (`onClick={() => {}}`) for some tabs.
- Impact: User-visible behavior appears complete but is functionally incomplete; weakens production trust.
- Owner layer: `frontend`
- Recommendation: Implement export handlers or remove buttons until implemented.

### H3) Placeholder production content remains
- Problem: Production-facing page includes explicit placeholder section.
- Evidence:
  - `src/pages/Landing.tsx` contains `/* Testimonials (placeholder) */`.
- Impact: Signals non-final content in production software baseline.
- Owner layer: `frontend`
- Recommendation: Replace with real customer proof or remove section.

---

## Medium Findings

### M1) Orphan/legacy page remains in codebase
- Problem: Fallback template page appears unused and non-domain.
- Evidence:
  - `src/pages/Index.tsx` contains default “Welcome to Your Blank App” template and is not routed.
- Impact: Maintenance overhead and confusion for future contributors.
- Owner layer: `frontend`
- Recommendation: Remove or repurpose intentionally with route linkage.

### M2) Unused import in router
- Problem: Router imports `ErrorBoundary` without using it.
- Evidence:
  - `src/router.tsx` imports `ErrorBoundary`; boundary is actually used in `src/App.tsx`.
- Impact: Minor maintainability issue and signal of drift between app shell and router wiring.
- Owner layer: `frontend`
- Recommendation: Remove unused router import.

### M3) Uninvoked/empty edge-function paths remain
- Problem: Some function directories have no frontend invocation path.
- Evidence:
  - No frontend invoke references found for `audit-logs`, `process-recurring-entries`, `run-depreciation`, `seed-data`, `year-end-close`.
  - `seed-data` and `year-end-close` directories are empty.
- Impact: Potential dead code/orphan deployment surface.
- Owner layer: `edge`
- Recommendation: Classify each as scheduled-only, admin-only, or remove if obsolete.

---

## Low Findings

### L1) Build warning: oversized frontend bundle
- Problem: Bundle exceeds chunk warning threshold.
- Evidence:
  - `vite build` reports large main chunk (~1.94 MB pre-gzip).
- Impact: Potential slower first-load performance.
- Owner layer: `frontend`
- Recommendation: Introduce route-level code splitting and chunk strategy.

### L2) HMR refresh warnings in UI utility files
- Problem: Fast-refresh compatibility warnings for shared constants with component exports.
- Impact: Developer-experience friction only; low production risk.
- Owner layer: `frontend`
- Recommendation: Split constants/helpers into separate files where practical.

---

## Quick Wins

- Remove unused `ErrorBoundary` import from `src/router.tsx`.
- Remove/replace `src/pages/Index.tsx` template page.
- Replace landing placeholder testimonials block.
- Remove no-op export buttons or wire real handlers in financial statements.
- Standardize edge function response envelope parsing in `src/lib/queries.ts` (apply `parseFunctionResult` consistently).
- Add runtime validation checklist artifact for converting static coverage to verified runtime coverage.

---

## Route and CRUD Coverage Status

Status legend:
- `VERIFIED_BUILD_ONLY`: build path validated, no interactive runtime proof.
- `STATIC_ONLY`: validated from source wiring only.
- `BLOCKED_ENV`: runtime proof blocked by environment.

Current aggregate status:
- Route wiring and route HTTP availability: `VERIFIED_RUNTIME` (frontend route serving).
- CRUD mapping to edge methods: `STATIC_ONLY`.
- Runtime CRUD execution proof: `BLOCKED_ENV` (database runtime unavailable).
- Dashboard/report lineage proof: `STATIC_ONLY` (lineage traced; numerical truth not DB-verified live).

---

## Placeholder Audit (Required Terms)

Searched repository for: `TODO`, `FIXME`, `mock`, `placeholder`, `dummy`, `sample`, `fake`, `hardcoded`, `coming soon`, `lorem`, `test`, `temp`, `stub`.

Findings:
- `placeholder` appears in production/frontend files and existing docs context.
- `sample` appears in `src/pages/Import.tsx`.
- `test` appears in `docs/MASTER_ARCHITECTURE_REVIEW_REPORT.md`.
- `mock`/`hardcoded` also appear in existing report documentation context.
- No strong evidence of large mock-data modules in active runtime pages was found, but placeholder language exists and should be resolved for production baseline.

## Dashboard, Chart, and Report Truthfulness

What is confirmed:
- Dashboard metrics source: `dashboard-data` edge function.
- Reports/statements source: `reports` edge function + report RPCs.
- Charts (`TopExpenses`, `TopCustomers`, `IncomeExpense`, `CashFlowForecast`) are bound to returned datasets, not static arrays in page definitions.

What remains blocked:
- Numerical cross-check against live DB rows/RPC outputs remains blocked in this run.

---

## SQL Recommendation Annex (No Execution)

All SQL below is proposal-only. Do not execute without approval.

### SQL-1: Enforce edge-only write discipline via constrained DB write surface (policy + API model)
- Problem: Frontend performs direct table mutations for status updates.
- Reason: Business logic currently split between edge function and client table updates.
- SQL (proposal):
```sql
-- Example strategy (per table): restrict UPDATE columns via RLS policy + RPC wrappers.
-- 1) Revoke broad table updates from anon/authenticated where not required.
-- 2) Expose controlled SECURITY DEFINER RPC functions for allowed status transitions.
-- 3) Add transition guard checks in RPC function body.
```
- Risk: Medium (can break existing UI flows if applied before frontend migration).
- Expected impact: High consistency and security hardening.
- Migration order:
  1. Add RPC transition functions.
  2. Update frontend to call edge/RPC methods only.
  3. Tighten/revoke direct table update paths.

### SQL-2: Add/verify composite indexes for reporting and list queries
- Problem: Heavy filters/sorts likely perform full scans under growth.
- Reason: Query patterns repeatedly filter by `company_id`, status, and date windows.
- SQL (proposal):
```sql
create index if not exists idx_invoices_company_status_due_date
  on public.invoices (company_id, status, due_date);

create index if not exists idx_bills_company_status_due_date
  on public.bills (company_id, status, due_date);

create index if not exists idx_journal_entries_company_entry_date
  on public.journal_entries (company_id, entry_date);

create index if not exists idx_journal_entry_items_account_journal
  on public.journal_entry_items (account_id, journal_entry_id);
```
- Risk: Low to Medium (index build overhead).
- Expected impact: Faster dashboards, reports, and aged summaries.
- Migration order:
  1. Apply during low-traffic window.
  2. Run `EXPLAIN ANALYZE` on key report queries.
  3. Remove redundant indexes if overlap is detected.

### SQL-3: Add uniqueness constraints for business document numbers per company
- Problem: Duplicate-number prevention appears primarily application-enforced.
- Reason: App logic and RPC generation can drift; DB should be final guard.
- SQL (proposal):
```sql
alter table public.invoices
  add constraint uq_invoices_company_invoice_number unique (company_id, invoice_number);

alter table public.quotes
  add constraint uq_quotes_company_quote_number unique (company_id, quote_number);

alter table public.purchase_orders
  add constraint uq_pos_company_po_number unique (company_id, po_number);
```
- Risk: Medium (fails if duplicates already exist).
- Expected impact: Strong integrity for financial document identifiers.
- Migration order:
  1. Detect and clean duplicates.
  2. Add unique constraints.
  3. Keep sequence/number RPCs aligned.

### SQL-4: Validate and backfill foreign keys for tenant and transactional integrity
- Problem: FK definitions could not be verified from live metadata in this run.
- Reason: No local migrations in repo and remote table introspection unavailable.
- SQL (proposal):
```sql
-- Example pattern; actual FKs must be generated from live catalog audit:
alter table public.invoices
  add constraint fk_invoices_customer
  foreign key (customer_id) references public.customers(id);

alter table public.bills
  add constraint fk_bills_vendor
  foreign key (vendor_id) references public.vendors(id);
```
- Risk: High if orphan rows already exist.
- Expected impact: Prevents silent relational corruption.
- Migration order:
  1. Run orphan-row diagnostic queries.
  2. Clean invalid references.
  3. Add FKs with `not valid`, then `validate constraint`.

### SQL-5: RLS policy consistency audit and hardening
- Problem: RLS policy completeness cannot be proven from repository.
- Reason: Policy-as-code SQL is absent in repo snapshot.
- SQL (proposal):
```sql
-- Representative pattern only.
alter table public.invoices enable row level security;

create policy invoices_company_member_select
  on public.invoices
  for select
  using (exists (
    select 1
    from public.company_users cu
    where cu.company_id = invoices.company_id
      and cu.user_id = auth.uid()
  ));
```
- Risk: Medium to High (misconfigured policies can block valid access).
- Expected impact: Tenant isolation assurance and security compliance.
- Migration order:
  1. Inventory current RLS policies from system catalogs.
  2. Diff against required table set.
  3. Roll out table-by-table with integration tests.

---

## Final Stabilization Posture

- Platform integration wiring exists across major domains, but production proof is incomplete.
- Critical blockers are environment/runtime related (no active DB runtime for full E2E and metadata checks).
- Readiness score is documented in `docs/PRODUCTION_READINESS_SCORE.md` as **52/100**.
- Next gate: activate local/remote dev DB runtime, then rerun full live CRUD/report/authz validation to convert static traces into runtime-proven evidence.
