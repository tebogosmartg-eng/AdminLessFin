# 06 — Platform Compliance Matrix

**Version:** 4.2.1  
**Date:** 2026-07-13  
**Scope:** All implemented Edge Functions (47)  

Legend: ✓ = compliant via `withEnterprisePlatform` + shared CORS/errors/logs.

| Function | Mode | OPTIONS | CORS | Auth | Company | Struct Err | Struct Log | Corr ID | Multi-co |
|----------|------|---------|------|------|---------|------------|------------|---------|----------|
| accounting | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ai-copilot | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| asset-categories | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| audit-logs | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| bills | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| budgets | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| calendar-events | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| chart-of-accounts | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| company-management | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| credit-notes | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| customers | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| dashboard-data | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| data-import | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| employees | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| expense-claims | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| financial-year | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| fixed-assets | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| global-search | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| invite-user | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| invoices | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| journal-entries | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| loans | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| messages | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| payments | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| payroll | tenant | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | ✓ | ✓ |
| process-recurring-entries | system | ✓ | ✓ | system | n/a | ✓ | ✓ | ✓ | n/a |
| products | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| projects | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| purchase-orders | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| quotes | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| recurring-bills | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| recurring-entries | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| recurring-invoices | tenant | ✓ | ✓ | ✓ | ✓† | ✓ | ✓ | ✓ | ✓ |
| reports | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| run-depreciation | system | ✓ | ✓ | system | n/a | ✓ | ✓ | ✓ | n/a |
| send-invoice-email | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| send-payslip-email | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| send-po-email | service | ✓ | ✓ | service | n/a | ✓ | ✓ | ✓ | n/a |
| send-quote-email | service | ✓ | ✓ | service | n/a | ✓ | ✓ | ✓ | n/a |
| send-statement-email | service | ✓ | ✓ | service | n/a | ✓ | ✓ | ✓ | n/a |
| settings | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| tax-rates | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| timesheets | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| user-session | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| vendor-credits | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| vendors | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| work | tenant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

\* Payroll uses domain `payrollErrorResponse` enriched with correlation + platform headers (business shape preserved).  
† `company_users` membership added in V4.2.1 (previously missing).

### Out of scope (no `index.ts`)

| Directory | Status |
|-----------|--------|
| seed-data | Empty stub — not a runtime function |
| year-end-close | Empty stub — not a runtime function |

### Freeze preservation

| Module | Business logic modified? | Platform shell adopted? |
|--------|--------------------------|-------------------------|
| Payroll | No | Yes |
| Accounting | No | Yes |
| Reporting (`reports`) | No | Yes |

### Fleet score

| Metric | Value |
|--------|-------|
| Implemented functions | 47 |
| Platform-compliant | **47 / 47** |
| Broken syntax markers | 0 |
