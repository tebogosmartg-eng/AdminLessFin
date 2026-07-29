# Account Identity Migration Report

**Date:** 2026-07-29  
**Objective:** Eliminate runtime account identification by display name.

## Architecture delivered

Canonical identity is now `chart_of_accounts.account_role`, composed with existing `tax_treatment`, `system_account`, `control_account`, `account_code`, `category`, and `subcategory`.

Shared resolver:

- `src/lib/accounting/accountRoles.ts`
- `supabase/functions/_shared/chartOfAccounts/accountRoles.ts`

Name matching is allowed **only** in one-time SQL backfill migrations — never in runtime posting/forms/governance resolve paths.

---

## 1. Locations found and replacements

### Schema / SQL

| Location | Was | Replaced with |
|----------|-----|----------------|
| `chart_of_accounts` | No role column | `account_role` + CHECK + singleton unique index |
| `accounting_policy_evaluate_posting` | `name ILIKE` for RE/VAT/depr/inventory/bank | `account_role` / `tax_treatment` / `subcategory` |
| Migration backfill | — | Codes → tax_treatment → system/subcategory → one-time name heuristics |
| Cash legacy | Bank had null subcategory | `20260729120100_…` sets `Cash and Cash Equivalents` |

### Forms / pages

| Location | Was | Replaced with |
|----------|-----|----------------|
| `InvoiceForm.tsx` | Name regex AR/tax/inventory | `resolveControlAccounts` |
| `InvoiceForm.tsx` / `InvoiceDetail.tsx` | `name.includes('tax')` | `isTaxLedgerAccount` |
| `ReceivePaymentForm.tsx` | receivable/bank/cash name filters | role + cash-equivalent subcategory |
| `InvoicePaymentForm.tsx` | receivable name filters | role + cash equivalents |
| `BillForm.tsx` | payable/inventory name | `trade_payable` / `inventory_asset` |
| `BillPaymentForm.tsx` | bank/payable name | cash subcategory + `trade_payable` |
| `AllocateCreditDialog.tsx` | receivable name | `findAccountsByRole(..., 'trade_receivable')` |
| `AllocateVendorCreditDialog.tsx` | payable name | `findAccountsByRole(..., 'trade_payable')` |
| `InventoryAdjustmentDialog.tsx` | inventory/cogs name | `resolveControlAccounts` |
| `ProjectDetail.tsx` | receivable name | `account_role` / subcategory metadata |
| `Reconciliation.tsx` | bank/checking/cash name | `isCashEquivalentAccount` |
| `Dashboard.tsx` | bank keywords for cash total | `isCashEquivalentAccount` |
| `FinancialStatements.tsx` | current A/L name keywords | `isCurrentAssetAccount` / `isCurrentLiabilityAccount` (+ CoA metadata merge) |
| `payrollIntelligence.ts` | bank keywords | `findCashEquivalentAccounts` |

### Edge functions

| Location | Was | Replaced with |
|----------|-----|----------------|
| `chart-of-accounts` GET | balances only | merge `account_role` + metadata |
| CoA GENERATE / templates | no role | `account_role` from template codes/tax |
| `customers` / `vendors` / `send-statement-email` | `.ilike('%receivable%'/'%payable%')` | `.eq('account_role', …)` |
| `recurring-invoices` | `getAccountId(...namePart)` | `getAccountIdByRole` |
| `recurring-bills` | `.ilike('%accounts payable%')` | `account_role = trade_payable` |
| `dashboard-data` | bank name keywords | subcategory cash equivalents |
| `accounting` | suspense name ILIKE | `account_role = suspense` |
| `invoices` GET_ONE | CoA name only | also `account_role`, `tax_treatment` |

### Governance (src + `_shared` mirrors)

| Location | Was | Replaced with |
|----------|-----|----------------|
| Rules `ROLE_PATTERNS` | name regex | `account_role` / tax / code / subcategory |
| Readiness `matchesRole` | name regex | metadata role map |
| Readiness contra | name regex | normal_balance / role |
| Health mandatory/VAT/bank/assets | name patterns | role / tax / subcategory / codes |
| Policy `isRetainedEarnings` etc. | name regex | role / tax / subcategory |

---

## 2. Remaining name-based lookups (intentional non-goals)

| Area | Why kept |
|------|----------|
| CoA / bank / inventory **search boxes**, Command Menu | User search UX, not identity |
| Import CSV name maps | External file mapping |
| FS presentation `labelPatterns` / disclosure titles / knowledge copy | Display/content, line_code preferred elsewhere |
| Payroll *item description* tax heuristics (`payrollReports`, VIP) | Payroll item taxonomy, not CoA identity |
| Duplicate account **name** warning in health | Data-quality advisory about labels, not role resolution |
| E2E/scripts that still find accounts by name | Non-production; prefer updating over time to `account_role` |

---

## 3. Evidence

Certification company (`3cbfd4eb-…`) after migration:

| Name | `account_role` |
|------|----------------|
| AR | `trade_receivable` |
| AP | `trade_payable` |
| VAT Output | `output_vat` |
| VAT Input | `input_vat` |
| Bank | subcategory `Cash and Cash Equivalents` |

---

## 4. Recommended future architecture

1. **Settings UI** — company admins assign/override singleton control roles (`trade_receivable`, `trade_payable`, VAT, inventory, RE) without renaming accounts.
2. **Optional `company_account_mappings`** — only if a company needs multiple accounts per role with explicit override (payroll already has this pattern).
3. **Never** reintroduce `name.includes` / `ILIKE '%…%'` in posting, statements, or smart-defaults.
4. **Generator-only seeding** — new companies get `account_role` from templates; legacy backfill stays historical.
5. **Reports RPC enrichment** — optionally return CoA metadata from `get_balances_as_of_date` to avoid client-side merge on Financial Statements.

---

## Migrations

- `20260729120000_coa_account_role_metadata.sql` — **Yes** (applied)
- `20260729120100_coa_cash_subcategory_legacy_backfill.sql` — **Yes** (applied)
