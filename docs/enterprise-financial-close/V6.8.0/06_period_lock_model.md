# 6. Period Lock Model

**Version:** 6.8.0

## Status ladder

```
Open → Soft Closed → Manager Approved → Partner Approved → Locked
```

| Status | Meaning | How reached |
|---|---|---|
| Open | Accounting continues normally | Default; also via Reopen (before lock) |
| Soft Closed | Close in progress; period under review | Accountant action (Period Locks) |
| Manager Approved | Manager signed off the close | Approval workflow only |
| Partner Approved | Partner signed off the close | Approval workflow only |
| Locked | Period final | Accountant action; requires Partner Approved |

## Rules

- **Only Accounting controls locking.** The lock action lives in the Financial Close workspace (an Accounting surface). Financial Statements never lock or unlock periods — they only consume the status.
- Transitions are enforced server-side: one step forward at a time; approval statuses only via the approval workflow; locking only from Partner Approved; reopening allowed any time **before** lock; Locked is final for the close.
- Every transition is written to the immutable Close History (`close.period.locked`, `close.period.status`).

## Consumption by Financial Statements

- The FS wizard surfaces the period status before generation (`GET_PERIOD_READINESS`).
- Unlocked periods are monitored for accounting changes (see Financial Statements Integration); locked periods are final and never flagged.
- Existing EFS reporting-period statuses (`open_for_reporting`, `frozen`, …) are unchanged — the close ladder is a separate, additive accounting-period concept.
