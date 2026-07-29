# SQL Recommendation Pack (Phase A)

Date: 2026-07-02  
Policy: Proposal only. No SQL executed.

## SQL-01: Enforce document number uniqueness per company

- Problem: Business document numbers are generated in app/RPC flow, but DB-level uniqueness cannot be confirmed.
- Evidence:
  - Invoice/quote number retrieval uses RPC methods in edge functions.
  - Live constraints could not be introspected due inactive/blocked DB runtime.
- Reason: Financial documents require hard uniqueness guarantees independent of app logic.
- Recommended SQL:
```sql
alter table public.invoices
  add constraint uq_invoices_company_invoice_number unique (company_id, invoice_number);

alter table public.quotes
  add constraint uq_quotes_company_quote_number unique (company_id, quote_number);

alter table public.purchase_orders
  add constraint uq_purchase_orders_company_po_number unique (company_id, po_number);
```
- Expected impact: Prevent duplicate legal/financial document IDs.
- Risk: Migration may fail if duplicates already exist.
- Rollback strategy:
  - Drop added constraints by name if required.
  - Restore from pre-migration snapshot for severe conflicts.
- Migration order:
  1. Detect duplicates.
  2. Clean duplicates.
  3. Apply constraints.

## SQL-02: Improve common list/report performance with composite indexes

- Problem: Frequent filters by company/status/date are likely to degrade under data growth.
- Evidence:
  - Edge/report functions query by company and date windows repeatedly.
  - Dashboard and reports aggregate from invoices, bills, journal tables.
- Reason: Core accounting/reporting paths need predictable query performance.
- Recommended SQL:
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
- Expected impact: Faster dashboards, report pages, and aging calculations.
- Risk: Additional write overhead and temporary index build load.
- Rollback strategy:
  - Drop newly created indexes if regressions occur.
- Migration order:
  1. Create indexes off-peak.
  2. Verify query plans with `EXPLAIN ANALYZE`.
  3. Remove redundant indexes if overlap found.

## SQL-03: Tighten tenant integrity with explicit foreign keys

- Problem: Foreign key coverage could not be live-verified and repo has no migration SQL artifact.
- Evidence:
  - No `.sql` migrations in repository.
  - Live metadata introspection unavailable in this phase.
- Reason: Tenant-safe accounting systems require DB-enforced referential integrity.
- Recommended SQL:
```sql
alter table public.invoices
  add constraint fk_invoices_customer
  foreign key (customer_id) references public.customers(id) not valid;

alter table public.bills
  add constraint fk_bills_vendor
  foreign key (vendor_id) references public.vendors(id) not valid;

alter table public.journal_entry_items
  add constraint fk_jei_journal_entry
  foreign key (journal_entry_id) references public.journal_entries(id) not valid;
```
- Expected impact: Prevent orphaned transactional relationships.
- Risk: Existing orphan rows can block validation.
- Rollback strategy:
  - Drop introduced constraints if validation causes service disruption.
- Migration order:
  1. Run orphan diagnostics.
  2. Repair orphan data.
  3. Add constraints as `not valid`.
  4. Validate constraints in controlled window.

## SQL-04: RLS policy completeness hardening

- Problem: RLS policies are assumed in code but were not verifiable from live metadata.
- Evidence:
  - Edge functions perform membership checks.
  - Policy catalog could not be queried from inactive/blocked DB.
- Reason: RLS must be explicit and complete for tenant isolation.
- Recommended SQL:
```sql
alter table public.invoices enable row level security;

create policy invoices_company_member_select
  on public.invoices
  for select
  using (
    exists (
      select 1
      from public.company_users cu
      where cu.company_id = invoices.company_id
        and cu.user_id = auth.uid()
    )
  );
```
- Expected impact: Enforced tenant isolation at database level.
- Risk: Misconfigured policies can block legitimate access.
- Rollback strategy:
  - Disable/replace faulty policy quickly; restore previous policy set from backup script.
- Migration order:
  1. Export existing policy definitions.
  2. Add missing policies table-by-table.
  3. Run auth-role integration tests after each batch.

## SQL-05: Move direct client-side status updates to controlled transition layer

- Problem: Some status changes happen from frontend table updates rather than edge function transitions.
- Evidence:
  - Direct frontend `supabase.from(...).update(...)` observed in send dialogs and loan form.
- Reason: Financial workflow transitions should be audited and validated server-side.
- Recommended SQL:
```sql
-- Pattern recommendation:
-- create security definer rpc function update_invoice_status_safe(...)
-- enforce allowed transitions and actor/company checks in function body
-- revoke direct update privilege for broad client role paths where applicable
```
- Expected impact: Better auditability and workflow integrity.
- Risk: Existing UI flows will fail unless switched to edge/RPC path first.
- Rollback strategy:
  - Temporarily re-enable prior update permission while correcting client flow.
- Migration order:
  1. Add transition RPCs.
  2. Update frontend and edge calls.
  3. Restrict direct table updates.
