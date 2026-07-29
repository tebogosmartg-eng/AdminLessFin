# 4. Accounting Readiness Model

**Version:** 6.8.0

## One score

The Overview displays a single **Overall Close Readiness** score (0–100), composed of weighted components:

| Component | Weight | Derived from (read-only) |
|---|---|---|
| General Ledger | 20% | Unreconciled bank items up to period end |
| Reconciliations | 25% | Completed reconciliation checklist items |
| Supporting Evidence | 5% | Completed evidence checklist items |
| Journal Review | 10% | Journal Review checklist item completed |
| Validation | 20% | Open critical issues in the certified Validation Platform |
| Management Approval | 20% | Manager (60) / Partner (100) approvals recorded |

## Ready for Financial Statements

`ready_for_financial_statements` is true only when **all** hold:

1. All mandatory checklist items completed
2. No open critical validation issues
3. Manager approval recorded
4. Period status is Manager Approved, Partner Approved, or Locked

## Rules

- Readiness is computed at read time from live data — nothing is manually synchronised and no financial figures are recalculated or stored.
- The score is presentation only; it never mutates any platform.
- Component labels are accounting concepts only (General Ledger, Reconciliations, Supporting Evidence, Journal Review, Validation, Management Approval).
