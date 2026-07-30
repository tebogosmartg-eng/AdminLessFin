# Reconciliation Matrix

| Metric | General Ledger / TB | Income Statement | Balance Sheet | Cash Flow | Dashboard |
|--------|---------------------|------------------|---------------|-----------|-----------|
| Assets | as-of balances | — | statementTotals | — | totalAssets |
| Liabilities | as-of balances | — | statementTotals | — | totalLiabilities |
| Equity + CYE | stored* + NI | NI feeds CYE | statementTotals | — | totalEquity |
| Revenue | — | totalIncome | — | — | periodRevenue |
| Expenses | — | totalExpenses | — | — | periodExpenses |
| Net Income | — | netIncome | CYE line | — | periodNetIncome |
| Retained Earnings | role balance | — | SoCE | — | — |
| Current Year Earnings | — | = NI | equity line | — | = NI |
| Cash | bank-linked GL | — | — | CF sections | cashBalance |
| VAT | role GL | — | Tax GL KPIs | — | — |
| Receivables | aged / AR RPC | — | — | — | arBalances |
| Payables | aged / AP RPC | — | — | — | apBalances |

\* Trial Balance retains unclosed Income/Expense; Balance Sheet presents them as Current Year Earnings so A = L + E.
