# Reconciliation Matrix (V3.6.9)

Identity rule: for a given company + reporting period, money KPIs that share a row below must be numerically equal.

| KPI | Dashboard | Banking | Revenue | Purchases | Reports | Live FS | Comparative BS | Tax (GL) | TB |
|-----|-----------|---------|---------|-----------|---------|---------|----------------|----------|-----|
| Cash (bank-linked GL) | = | = | — | — | — | — | — | — | subset |
| Assets | = | — | — | — | = | = | = | — | = |
| Liabilities | = | — | — | — | = | = | = | — | = |
| Equity + CYE | — | — | — | — | = | = | = | — | * |
| Period Revenue | — | — | = | — | = | = | — | — | — |
| Period Expenses | — | — | — | = | = | = | — | — | — |
| Net Income | = | — | — | — | = | = | CYE row | — | — |
| VAT GL roles | — | — | — | — | BS lines | BS lines | BS lines | = | = |
| Cash Flow Statement | ≠ forecast | — | ≠ forecast | ≠ forecast | — | = | — | — | — |

\* Trial Balance retains unclosed Income/Expense; Equity+CYE is the Balance Sheet presentation of the same books.

Operational forecasts (invoice/bill due cash) are **FCT** authority — never labelled as Cash Flow Statement.
