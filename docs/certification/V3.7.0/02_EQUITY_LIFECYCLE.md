# Equity Lifecycle

## Identity

```
Opening Equity
  + Profit / Loss (Current Year Earnings)
  + Capital movements
  − Drawings
= Closing Equity (presented)
```

Engine encoding:

```
openingStoredEquity + netIncome + otherEquityMovements = totalEquity
```

where:

- `netIncome` / CYE = `get_period_activity` Income − Expense  
- `otherEquityMovements` = closing stored Equity − opening stored Equity  
- `totalEquity` = closing stored Equity + CYE  

## Retained Earnings

| State | Source |
|-------|--------|
| Opening RE | `get_balances_as_of_date(prior_date)` ∩ role `retained_earnings` |
| Presented closing RE | Opening RE + period NI |
| Stored closing RE (after year-end) | Updated by `close_financial_year` closing journal |

## Current Year Earnings

- Not a separate live balance requirement for Reports/FS totals  
- Equals period NI until year-end posts P&L into RE  
- Resets when the new financial year's period activity window has no Income/Expense  

## Year-end

1. Soft close (EFCP) — checklist only; no GL mutation  
2. Hard close — `financial-year` CLOSE → `close_financial_year(p_end_date)`  
3. Opening new year — prior closing RE becomes opening RE; CYE starts at 0  
