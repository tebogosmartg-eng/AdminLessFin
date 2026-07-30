/**
 * Dashboard ↔ Canonical Financial Aggregation reconciliation helpers.
 * Pure functions mirroring edge `canonicalFinancialAggregation.ts`.
 * Live UI must consume statementTotals / canonicalAggregation from the edge.
 *
 * Canonical engine: get_balances_as_of_date | get_period_activity | get_cash_flow_statement.
 */

export {
  buildCanonicalFinancialAggregation,
  buildComparativeBalanceSheetTotals,
  buildComparativePlMonthTotals,
  sumCashFromBankLinks,
  sumBalanceSheetFromRows,
  sumPeriodNetIncome,
  canonicalToPerformanceLines,
  canonicalToPositionLines,
  canonicalToCashFlowLines,
  canonicalToEquityLines,
  type BalanceRow,
  type ActivityRow,
  type CashFlowRow,
  type CanonicalFinancialAggregation,
} from './canonicalFinancialAggregation';

import {
  buildCanonicalFinancialAggregation,
  sumBalanceSheetFromRows as sumBs,
  type BalanceRow,
  type ActivityRow as PeriodActivityRow,
} from './canonicalFinancialAggregation';

export type { PeriodActivityRow };

/** Balance Sheet KPIs from get_balances_as_of_date rows (as-of end date). */
export function sumBalanceSheetTotals(accounts: BalanceRow[]) {
  return sumBs(accounts);
}

/**
 * Balance Sheet equity including Current Year Earnings (period net income).
 */
export function sumEquityWithCurrentYearEarnings(
  storedEquity: number,
  periodNetIncome: number,
) {
  return Number(storedEquity || 0) + Number(periodNetIncome || 0);
}

/** Period Revenue from get_period_activity (same as Income Statement Total Income). */
export function sumPeriodRevenue(rows: PeriodActivityRow[]) {
  return buildCanonicalFinancialAggregation({ periodActivity: rows }).totalIncome;
}

/** Period Expenses from get_period_activity (same as Income Statement Total Expenses). */
export function sumPeriodExpenses(rows: PeriodActivityRow[]) {
  return buildCanonicalFinancialAggregation({ periodActivity: rows }).totalExpenses;
}

/**
 * Full statement totals — delegates to Canonical Financial Aggregation.
 */
export function buildStatementTotals(input: {
  balancesAsOf?: BalanceRow[] | null;
  periodActivity?: PeriodActivityRow[] | null;
  cashFlowData?: Array<{ section: string; amount: number }> | null;
  openingBalances?: BalanceRow[] | null;
  accountMeta?: Iterable<{
    id: string;
    account_role?: string | null;
    category?: string | null;
    subcategory?: string | null;
    account_code?: string | null;
    tax_treatment?: string | null;
    cash_flow_classification?: string | null;
  }> | null;
  bankCoaIds?: Iterable<string> | null;
  retainedEarningsAccountIds?: Iterable<string> | null;
}) {
  const agg = buildCanonicalFinancialAggregation(input);
  return {
    totalIncome: agg.totalIncome,
    totalExpenses: agg.totalExpenses,
    netIncome: agg.netIncome,
    currentYearEarnings: agg.currentYearEarnings,
    totalAssets: agg.totalAssets,
    totalLiabilities: agg.totalLiabilities,
    totalStoredEquity: agg.totalStoredEquity,
    totalEquity: agg.totalEquity,
    totalLiabilitiesAndEquity: agg.totalLiabilitiesAndEquity,
    balanceSheetBalanced: agg.balanceSheetBalanced,
    totalDebits: agg.totalDebits,
    totalCredits: agg.totalCredits,
    trialBalanceBalanced: agg.trialBalanceBalanced,
    openingRetainedEarnings: agg.openingRetainedEarnings,
    closingRetainedEarningsStored: agg.closingRetainedEarningsStored,
    closingRetainedEarningsPresented: agg.closingRetainedEarningsPresented,
    openingStoredEquity: agg.openingStoredEquity,
    otherEquityMovements: agg.otherEquityMovements,
    equityIdentityHolds: agg.equityIdentityHolds,
    cashOperating: agg.cashOperating,
    cashInvesting: agg.cashInvesting,
    cashFinancing: agg.cashFinancing,
    netCashFlow: agg.netCashFlow,
    revenue: agg.revenue,
    costOfSales: agg.costOfSales,
    grossProfit: agg.grossProfit,
    otherIncome: agg.otherIncome,
    operatingExpenses: agg.operatingExpenses,
    financeCosts: agg.financeCosts,
    taxExpense: agg.taxExpense,
    cash: agg.cash,
    receivables: agg.receivables,
    payables: agg.payables,
    vatPayable: agg.vatPayable,
    vatReceivable: agg.vatReceivable,
    vatNet: agg.vatNet,
    retainedEarnings: agg.retainedEarnings,
    profitIdentityHolds: agg.profitIdentityHolds,
  };
}

/**
 * VAT Balance Sheet positions — delegates to CFA (no independent VAT math).
 */
export function sumVatGlBalances(accounts: BalanceRow[]) {
  const agg = buildCanonicalFinancialAggregation({ balancesAsOf: accounts });
  return {
    outputVat: agg.vatPayable,
    inputVat: agg.vatReceivable,
    vatControl: 0,
    netVatLiability: agg.vatNet,
  };
}
