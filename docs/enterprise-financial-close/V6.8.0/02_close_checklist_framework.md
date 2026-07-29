# 2. Close Checklist Framework

**Version:** 6.8.0

## Automatic build

Opening a close automatically instantiates the standard checklist — the accountant never builds it manually.

| Item | Category | Mandatory |
|---|---|---|
| Bank Reconciliations | Reconciliation | Yes |
| Debtors Reconciliation | Reconciliation | Yes |
| Creditors Reconciliation | Reconciliation | Yes |
| Inventory Reconciliation | Reconciliation | No |
| VAT Reconciliation | Reconciliation | Yes |
| Payroll Reconciliation | Reconciliation | Yes |
| Asset Register Reconciliation | Reconciliation | No |
| Loan Reconciliation | Reconciliation | No |
| Suspense Accounts | Review | Yes |
| Journal Review | Review | Yes |
| Accrual Review | Review | Yes |
| Prepayment Review | Review | No |
| Intercompany Review | Review | No |
| Foreign Currency Review | Review | No |
| Trial Balance Review | Review | Yes |

## Item attributes

Every item carries: **Status** (Ready / In Progress / Outstanding / Overdue / Completed), **Prepared By**, **Reviewed By**, **Completion Date** (set automatically when completed), **Outstanding Issues** (free text), mandatory flag, and sort order.

## Rules

- Mandatory items gate manager/partner approval.
- Statuses are accountant language only; no engine terminology.
- The blueprint lives in the close orchestration function; adding future items is additive.
