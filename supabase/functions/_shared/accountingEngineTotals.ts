/**
 * Accounting engine statement totals — thin facade over Canonical Financial Aggregation.
 * Edge consumers (reports, dashboard-data) must use buildCanonicalFinancialAggregation /
 * buildStatementTotals; UI must not re-derive money.
 *
 * Canonical inputs: get_balances_as_of_date | get_period_activity | get_cash_flow_statement
 */
// @ts-nocheck

export {
  buildCanonicalFinancialAggregation,
  canonicalToPerformanceLines,
  canonicalToPositionLines,
  canonicalToCashFlowLines,
  canonicalToEquityLines,
  buildComparativeBalanceSheetTotals,
  buildComparativePlMonthTotals,
  sumCashFromBankLinks,
  sumBalanceSheetFromRows,
  sumPeriodNetIncome,
} from './canonicalFinancialAggregation.ts';

import { buildCanonicalFinancialAggregation } from './canonicalFinancialAggregation.ts';

export type BalanceRow = {
  id: string;
  name?: string;
  type: string;
  balance: number;
  account_role?: string | null;
  category?: string | null;
  subcategory?: string | null;
  account_code?: string | null;
  tax_treatment?: string | null;
  cash_flow_classification?: string | null;
};

export type ActivityRow = {
  id: string;
  type: string;
  activity: number;
  account_role?: string | null;
  category?: string | null;
  subcategory?: string | null;
  account_code?: string | null;
  tax_treatment?: string | null;
  cash_flow_classification?: string | null;
};

export type CashFlowRow = {
  section: string;
  category?: string;
  amount: number;
};

export type StatementTotals = {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  currentYearEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalStoredEquity: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  balanceSheetBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
  trialBalanceBalanced: boolean;
  openingRetainedEarnings: number;
  closingRetainedEarningsStored: number;
  closingRetainedEarningsPresented: number;
  openingStoredEquity: number;
  otherEquityMovements: number;
  equityIdentityHolds: boolean;
  cashOperating: number;
  cashInvesting: number;
  cashFinancing: number;
  netCashFlow: number;
  // Extended canonical fields
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  otherIncome: number;
  operatingExpenses: number;
  financeCosts: number;
  taxExpense: number;
  cash: number;
  receivables: number;
  payables: number;
  vatPayable: number;
  vatReceivable: number;
  vatNet: number;
  retainedEarnings: number;
  profitIdentityHolds: boolean;
};

/**
 * Build certified statement totals from accounting-engine RPC payloads.
 * Delegates entirely to Canonical Financial Aggregation — no parallel math.
 */
export function buildStatementTotals(input: {
  balancesAsOf?: BalanceRow[] | null;
  periodActivity?: ActivityRow[] | null;
  cashFlowData?: CashFlowRow[] | null;
  openingBalances?: BalanceRow[] | null;
  retainedEarningsAccountIds?: Iterable<string> | null;
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
}): StatementTotals {
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
