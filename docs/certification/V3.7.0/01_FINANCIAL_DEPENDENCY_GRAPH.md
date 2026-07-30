# Financial Dependency Graph

```
Business Event
    ↓
BOE / domain atomic RPC / journal-entries edge
    ↓
posting_engine_submit (PostgreSQL)     ← single write gateway
    ↓
journal_entries + journal_entry_items  ← General Ledger
    ↓
┌───────────────────────┬────────────────────────┬─────────────────────────┐
│ get_balances_as_of_date │ get_period_activity   │ get_cash_flow_statement │
└───────────┬───────────┴──────────┬─────────────┴───────────┬─────────────┘
            ↓                      ↓                         ↓
     Trial Balance / BS      Income Statement / CYE     Cash Flow Statement
            ↓                      ↓
     Retained Earnings ←── year-end close ── Current Year Earnings
            ↓
     Balance Sheet (Equity = stored + CYE)
            ↓
     reports.statementTotals / dashboard-data KPIs / EFS sealed facts
            ↓
     Financial Statements · Reports · Comparative · Dashboard
```

**Rule:** UI never invents money figures already owned by the engine.
