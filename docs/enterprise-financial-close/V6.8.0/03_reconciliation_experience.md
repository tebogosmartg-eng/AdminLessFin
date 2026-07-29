# 3. Reconciliation Experience

**Version:** 6.8.0

## Display

The Reconciliations section shows accounting reconciliation status only:

- Ready
- In Progress
- Outstanding
- Overdue
- Completed

No technical implementation is exposed — no journal item IDs, no table names, no reconciliation engine internals.

## Live signals (automatic)

The platform automatically surfaces the count of unreconciled bank items up to the close period end (read from existing journal data — same source as the certified bank reconciliation feature). When items are unreconciled, the section links to the existing **Accounting → Reconcile** page where the actual bank reconciliation work is performed.

## Ownership

- Bank reconciliation execution remains in the existing operational Reconciliation page and `accounting` Edge Function (`FINISH_RECONCILIATION`) — unchanged.
- The close platform records reconciliation *status and sign-off context* (Prepared By / Reviewed By / Completion Date / Outstanding Issues) per close period.
- No reconciliation calculations are duplicated.
