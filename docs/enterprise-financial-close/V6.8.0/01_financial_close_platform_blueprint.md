# 1. Financial Close Platform Blueprint

**Version:** 6.8.0

## Position in the architecture

```
Accounting (GL / Journal Engine — FROZEN)
        │  read-only signals
        ▼
Financial Close Platform (NEW — orchestration + experience)
        │  approved / locked periods
        ▼
Financial Statements (EFS — FROZEN, consumes readiness)
```

The Financial Close Platform is the operational bridge between Accounting and Financial Statements. It coordinates accounting readiness without changing accounting ownership: Accounting still owns financial facts; EFS still owns statement presentation.

## Close types

- Month-End Close
- Quarter-End Close
- Year-End Close

Each close is a workspace covering one accounting period, with an automatically built checklist and an accounting period status ladder.

## Workspace sections

1. **Overview** — Overall Close Readiness score, close progress, outstanding reconciliations, validation summary, approval status, Ready for Financial Statements.
2. **Close Checklist** — the full automatically built checklist.
3. **Reconciliations** — reconciliation items with live unreconciled-bank-item signal.
4. **Review** — journal, accrual, prepayment, intercompany, FX, trial balance reviews.
5. **Approval** — manager and partner approvals with enforced gates.
6. **Close History** — immutable activity trail for the close.
7. **Period Locks** — Open → Soft Closed → Manager Approved → Partner Approved → Locked.

## Ownership rules

| Owner | Owns | Close Platform does |
|---|---|---|
| Accounting | GL, journals, balances | Reads counts/timestamps only |
| Validation Platform | Issues | Reads open critical counts only |
| Review Workflow (EFS) | AFS pack review | Untouched; close approval is a separate period-level record |
| Publication | Output packs | Untouched |
| Financial Close | Checklist, approvals, period status, close history | Full ownership (new tables) |

## Storage

Four new tables (additive migration `efcp_v680_financial_close_platform`): `efcp_close_workspaces`, `efcp_close_items`, `efcp_close_approvals`, `efcp_close_activity`. Same tenant RLS pattern as the certified EFS foundation. No existing table is altered.
