# KPI Dependency Map (V3.6.9)

Trace for every financial KPI: Component → Hook → React Query → Edge → SQL → Journals → GL → Statements.

```
journal_entries / journal_entry_items
        │
        ▼
 PostgreSQL RPCs (canonical engine)
   get_balances_as_of_date
   get_period_activity
   get_cash_flow_statement
        │
        ├── reports ──────────────► Reports, Live FS, Comparative BS/PL
        ├── dashboard-data ───────► Dashboard, Revenue WS, Purchases WS
        ├── chart-of-accounts ────► Banking / CoA (optional as_of_date)
        ├── accounting ───────────► Trial Balance, Health, Intelligence
        └── financial-statements ─► EFS extract → sealed TB (statutory)
```

See `00_FINANCIAL_KPI_ARCHITECTURE_CERTIFICATION.md` §1 for the full table.
