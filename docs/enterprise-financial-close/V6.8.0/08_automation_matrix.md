# 8. Automation Matrix

**Version:** 6.8.0

Users never manually synchronise information. The close platform retrieves signals automatically, read-only, at dashboard load:

| Source | Signal retrieved | Used for |
|---|---|---|
| General Ledger | Unreconciled bank items up to period end | GL readiness, Reconciliations section |
| Journal Engine | Journal count in period; latest journal timestamp | Close progress; accounting change detection |
| Assets | Fixed asset register count | Asset Register Reconciliation context |
| Loans | Loan register count | Loan Reconciliation context |
| Payroll | Payroll runs in the close period | Payroll Reconciliation context |
| Inventory | Via reconciliation checklist status | Inventory Reconciliation |
| VAT | Via reconciliation checklist status | VAT Reconciliation |
| Working Papers | Certified EFS close-evidence data (unchanged APIs) | Supporting evidence context |
| Validation | Open critical issue count (certified Validation Platform) | Readiness, approval gates |
| Review | Manager/partner close approvals | Approval status, readiness |
| Publication | Downstream only — unchanged | — |

## Rules

- All retrieval is read-only (`select` with counts/timestamps); no financial figure is copied, stored, or recalculated by the close platform.
- Signal collection degrades gracefully: a missing source yields a zero signal, never an error that blocks the accountant.
- The checklist itself is instantiated automatically at close creation — no manual setup.
