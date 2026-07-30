import { describe, expect, it } from 'vitest';

import {
  buildCanonicalFinancialAggregation,
  canonicalToPerformanceLines,
  buildStatementTotals,
  sumPeriodRevenue,
  sumPeriodExpenses,
  sumPeriodNetIncome,
  sumBalanceSheetTotals,
  sumEquityWithCurrentYearEarnings,
} from '../../src/lib/accounting/dashboardReconciliation';

/**
 * Canonical Financial Aggregation — reconciliation proof.
 * Dashboard ≡ Income Statement ≡ Financial Statements ≡ Trial Balance (typed sums).
 */
describe('Canonical Financial Aggregation Engine', () => {
  const meta = [
    { id: 'sales', account_role: 'sales', category: 'Revenue', account_code: '4010' },
    { id: 'other_inc', category: 'Other Income', account_code: '4510' },
    { id: 'cogs', account_role: 'cogs', category: 'Cost of Sales', account_code: '5020' },
    { id: 'opex', category: 'Operating Expenses', account_code: '6010' },
    { id: 'finance', category: 'Other Expenses', account_code: '8010', cash_flow_classification: 'financing' },
    { id: 'tax', category: 'Other Expenses', account_code: '8030' },
    { id: 'cash', account_role: 'bank', category: 'Current Assets', subcategory: 'Cash and Cash Equivalents' },
    { id: 'ar', account_role: 'trade_receivable', subcategory: 'Trade and Other Receivables' },
    { id: 'ap', account_role: 'trade_payable', subcategory: 'Trade and Other Payables' },
    { id: 'vat_out', account_role: 'output_vat', tax_treatment: 'vat_output' },
    { id: 'vat_in', account_role: 'input_vat', tax_treatment: 'vat_input' },
    { id: 're', account_role: 'retained_earnings' },
  ];

  const balancesAsOf = [
    { id: 'cash', type: 'Asset', balance: 1000 },
    { id: 'ar', type: 'Asset', balance: 500 },
    { id: 'vat_in', type: 'Asset', balance: 40 },
    { id: 'ap', type: 'Liability', balance: 200 },
    { id: 'vat_out', type: 'Liability', balance: 150 },
    // Stored equity so A = L + E + CYE: 1540 = 350 + 740 + 450
    { id: 're', type: 'Equity', balance: 740 },
  ];

  const periodActivity = [
    { id: 'sales', type: 'Income', activity: 1000 },
    { id: 'other_inc', type: 'Income', activity: 50 },
    { id: 'cogs', type: 'Expense', activity: 300 },
    { id: 'opex', type: 'Expense', activity: 200 },
    { id: 'finance', type: 'Expense', activity: 40 },
    { id: 'tax', type: 'Expense', activity: 60 },
  ];

  const cashFlowData = [
    { section: 'Operating', amount: 100 },
    { section: 'Investing', amount: -20 },
    { section: 'Financing', amount: -30 },
  ];

  const openingBalances = [
    { id: 'cash', type: 'Asset', balance: 700 },
    { id: 're', type: 'Equity', balance: 740 },
  ];

  it('exposes every required canonical figure from GL/TB payloads', () => {
    const agg = buildCanonicalFinancialAggregation({
      balancesAsOf,
      periodActivity,
      cashFlowData,
      openingBalances,
      accountMeta: meta,
      bankCoaIds: ['cash'],
    });

    expect(agg.revenue).toBe(1000);
    expect(agg.costOfSales).toBe(300);
    expect(agg.grossProfit).toBe(700);
    expect(agg.otherIncome).toBe(50);
    expect(agg.operatingExpenses).toBe(200);
    expect(agg.financeCosts).toBe(40);
    expect(agg.taxExpense).toBe(60);
    expect(agg.totalIncome).toBe(1050);
    expect(agg.totalExpenses).toBe(600);
    expect(agg.netProfit).toBe(450);
    expect(agg.currentYearEarnings).toBe(450);

    expect(agg.assets).toBe(1540);
    expect(agg.liabilities).toBe(350);
    expect(agg.storedEquity).toBe(740);
    expect(agg.equity).toBe(1190);
    expect(agg.retainedEarnings).toBe(740);
    expect(agg.cash).toBe(1000);
    expect(agg.receivables).toBe(500);
    expect(agg.payables).toBe(200);
    expect(agg.vatPayable).toBe(150);
    expect(agg.vatReceivable).toBe(40);
    expect(agg.netCashFlow).toBe(50);

    expect(agg.profitIdentityHolds).toBe(true);
    expect(agg.balanceSheetBalanced).toBe(true);
    expect(agg.equityIdentityHolds).toBe(true);
  });

  it('Dashboard Revenue = Income Statement Revenue = TB period Income (typed)', () => {
    const agg = buildCanonicalFinancialAggregation({ periodActivity, accountMeta: meta });
    const dashboardRevenue = agg.totalIncome;
    const incomeStatementRevenue = sumPeriodRevenue(periodActivity);
    const tbPeriodIncome = periodActivity
      .filter((r) => r.type === 'Income')
      .reduce((s, r) => s + r.activity, 0);

    expect(dashboardRevenue).toBe(incomeStatementRevenue);
    expect(dashboardRevenue).toBe(tbPeriodIncome);
    expect(agg.revenue + agg.otherIncome).toBe(tbPeriodIncome);
  });

  it('Dashboard Expenses = Income Statement Expenses = TB period Expense (typed)', () => {
    const agg = buildCanonicalFinancialAggregation({ periodActivity, accountMeta: meta });
    expect(agg.totalExpenses).toBe(sumPeriodExpenses(periodActivity));
    expect(agg.totalExpenses).toBe(
      periodActivity.filter((r) => r.type === 'Expense').reduce((s, r) => s + r.activity, 0),
    );
    expect(
      agg.costOfSales + agg.operatingExpenses + agg.financeCosts + agg.taxExpense,
    ).toBe(agg.totalExpenses);
  });

  it('Dashboard Profit = Income Statement Profit = Financial Statements Profit', () => {
    const agg = buildCanonicalFinancialAggregation({
      balancesAsOf,
      periodActivity,
      accountMeta: meta,
    });
    const totals = buildStatementTotals({
      balancesAsOf,
      periodActivity,
      accountMeta: meta,
    });
    const lines = canonicalToPerformanceLines(agg);
    const profitLine = lines.find((l) => l.line_code === 'perf.result')!;

    expect(agg.netProfit).toBe(sumPeriodNetIncome(periodActivity));
    expect(totals.netIncome).toBe(agg.netProfit);
    expect(profitLine.amount).toBe(agg.netProfit);
    expect(agg.revenue - agg.costOfSales + agg.otherIncome - agg.operatingExpenses - agg.financeCosts - agg.taxExpense).toBe(
      agg.netProfit,
    );
  });

  it('Assets / Liabilities / Equity match Balance Sheet and TB as-of type sums', () => {
    const agg = buildCanonicalFinancialAggregation({
      balancesAsOf,
      periodActivity,
      accountMeta: meta,
    });
    const tb = sumBalanceSheetTotals(balancesAsOf);
    expect(agg.assets).toBe(tb.assets);
    expect(agg.liabilities).toBe(tb.liabilities);
    expect(agg.storedEquity).toBe(tb.storedEquity);
    expect(agg.equity).toBe(sumEquityWithCurrentYearEarnings(tb.storedEquity, agg.netProfit));
    expect(agg.assets).toBe(agg.liabilitiesAndEquity);
  });

  it('Cash matches banking-linked / role cash on TB', () => {
    const agg = buildCanonicalFinancialAggregation({
      balancesAsOf,
      accountMeta: meta,
      bankCoaIds: ['cash'],
    });
    expect(agg.cash).toBe(1000);
  });

  it('buildStatementTotals is a pure facade over canonical aggregation', () => {
    const input = {
      balancesAsOf,
      periodActivity,
      cashFlowData,
      openingBalances,
      accountMeta: meta,
    };
    const agg = buildCanonicalFinancialAggregation(input);
    const totals = buildStatementTotals(input);
    expect(totals.netIncome).toBe(agg.netProfit);
    expect(totals.totalAssets).toBe(agg.assets);
    expect(totals.revenue).toBe(agg.revenue);
    expect(totals.costOfSales).toBe(agg.costOfSales);
    expect(totals.cash).toBe(agg.cash);
  });

  it('without CoA categories, all Income→Revenue and all Expense→Operating (partition still equals totals)', () => {
    const agg = buildCanonicalFinancialAggregation({
      periodActivity: [
        { id: 'a', type: 'Income', activity: 100 },
        { id: 'b', type: 'Expense', activity: 40 },
      ],
    });
    expect(agg.revenue).toBe(100);
    expect(agg.otherIncome).toBe(0);
    expect(agg.operatingExpenses).toBe(40);
    expect(agg.costOfSales).toBe(0);
    expect(agg.profitIdentityHolds).toBe(true);
    expect(agg.netProfit).toBe(60);
  });
});
