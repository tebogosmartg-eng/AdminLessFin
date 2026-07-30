import { describe, expect, it } from 'vitest';

import {

  sumBalanceSheetTotals,

  sumCashFromBankLinks,

  sumEquityWithCurrentYearEarnings,

  sumPeriodExpenses,

  sumPeriodNetIncome,

  sumPeriodRevenue,

  sumVatGlBalances,

  buildStatementTotals,

} from '../../src/lib/accounting/dashboardReconciliation';



describe('dashboard reconciliation vs accounting engine', () => {

  const tbAsOf = [

    { id: 'cash', type: 'Asset', balance: 1000 },

    { id: 'ar', type: 'Asset', balance: 500 },

    { id: 'ap', type: 'Liability', balance: 200 },

    { id: 'rev', type: 'Income', balance: 800 },

    { id: 'exp', type: 'Expense', balance: 300 },

    { id: 'eq', type: 'Equity', balance: 400 },

  ];



  const period = [

    { id: 'rev', type: 'Income', activity: 400 },

    { id: 'exp', type: 'Expense', activity: 150 },

  ];



  it('Assets / Liabilities / stored Equity match Trial Balance / Balance Sheet as-of sums', () => {

    expect(sumBalanceSheetTotals(tbAsOf)).toEqual({

      assets: 1500,

      liabilities: 200,

      storedEquity: 400,

    });

  });



  it('Cash Balance matches bank-linked GL balances from the same as-of TB', () => {

    expect(sumCashFromBankLinks(tbAsOf, ['cash'])).toBe(1000);

    expect(sumCashFromBankLinks(tbAsOf, ['cash', 'missing'])).toBe(1000);

  });



  it('Period Revenue / Expenses / Net Income match Income Statement activity', () => {

    expect(sumPeriodRevenue(period)).toBe(400);

    expect(sumPeriodExpenses(period)).toBe(150);

    expect(sumPeriodNetIncome(period)).toBe(250);

    // Prove as-of Income−Expense would diverge from period NI

    expect(800 - 300).not.toBe(250);

  });



  it('Equity with Current Year Earnings matches Financial Statements / Reports', () => {

    const { storedEquity } = sumBalanceSheetTotals(tbAsOf);

    const ni = sumPeriodNetIncome(period);

    expect(sumEquityWithCurrentYearEarnings(storedEquity, ni)).toBe(650);

  });



  it('VAT GL balances use account roles — not tax-rate × base', () => {

    const rows = [

      { id: '1', type: 'Liability', balance: 150, account_role: 'output_vat' },

      { id: '2', type: 'Asset', balance: 40, account_role: 'input_vat' },

      { id: '3', type: 'Liability', balance: 10, tax_treatment: 'vat_control' },

      { id: '4', type: 'Liability', balance: 999, account_role: 'trade_payable' },

    ];

    expect(sumVatGlBalances(rows)).toEqual({

      outputVat: 160,

      inputVat: 40,

      vatControl: 0,

      netVatLiability: 120,

    });

  });

  it('buildStatementTotals: BS balances, equity identity, RE by role', () => {
    const opening = [
      { id: 'cash', type: 'Asset', balance: 1000 },
      { id: 're', type: 'Equity', balance: 400, account_role: 'retained_earnings', name: 'Retained Earnings' },
      { id: 'capital', type: 'Equity', balance: 600, name: 'Owner Capital' },
    ];
    const asOf = [
      { id: 'cash', type: 'Asset', balance: 1250 },
      { id: 're', type: 'Equity', balance: 400, account_role: 'retained_earnings', name: 'Retained Earnings' },
      { id: 'capital', type: 'Equity', balance: 700, name: 'Owner Capital' },
    ];
    const period = [
      { id: 'rev', type: 'Income', activity: 200 },
      { id: 'exp', type: 'Expense', activity: 50 },
    ];
    const t = buildStatementTotals({
      balancesAsOf: asOf,
      openingBalances: opening,
      periodActivity: period,
      cashFlowData: [
        { section: 'Operating', amount: 150 },
        { section: 'Investing', amount: 0 },
        { section: 'Financing', amount: 100 },
      ],
    });
    expect(t.netIncome).toBe(150);
    expect(t.currentYearEarnings).toBe(150);
    expect(t.totalAssets).toBe(1250);
    expect(t.totalStoredEquity).toBe(1100);
    expect(t.totalEquity).toBe(1250);
    expect(t.balanceSheetBalanced).toBe(true);
    expect(t.openingRetainedEarnings).toBe(400);
    expect(t.closingRetainedEarningsPresented).toBe(550);
    expect(t.otherEquityMovements).toBe(100); // capital +100
    expect(t.equityIdentityHolds).toBe(true);
    expect(t.netCashFlow).toBe(250);
  });

  it('year-end close simulation: RE absorbs NI; CYE resets for new year', () => {
    // Before close: P&L open; BS uses stored equity + CYE
    const beforeClose = buildStatementTotals({
      balancesAsOf: [
        { id: 'cash', type: 'Asset', balance: 500 },
        { id: 're', type: 'Equity', balance: 200, account_role: 'retained_earnings' },
        { id: 'rev', type: 'Income', balance: 400 },
        { id: 'exp', type: 'Expense', balance: 100 },
      ],
      openingBalances: [
        { id: 'cash', type: 'Asset', balance: 200 },
        { id: 're', type: 'Equity', balance: 200, account_role: 'retained_earnings' },
      ],
      periodActivity: [
        { id: 'rev', type: 'Income', activity: 400 },
        { id: 'exp', type: 'Expense', activity: 100 },
      ],
    });
    expect(beforeClose.netIncome).toBe(300);
    expect(beforeClose.totalEquity).toBe(500); // 200 stored + 300 CYE
    expect(beforeClose.balanceSheetBalanced).toBe(true);

    // After close_financial_year: Income/Expense zeroed into RE; new year activity empty
    const afterCloseNewYear = buildStatementTotals({
      balancesAsOf: [
        { id: 'cash', type: 'Asset', balance: 500 },
        { id: 're', type: 'Equity', balance: 500, account_role: 'retained_earnings' },
      ],
      openingBalances: [
        { id: 'cash', type: 'Asset', balance: 500 },
        { id: 're', type: 'Equity', balance: 500, account_role: 'retained_earnings' },
      ],
      periodActivity: [],
    });
    expect(afterCloseNewYear.netIncome).toBe(0);
    expect(afterCloseNewYear.currentYearEarnings).toBe(0);
    expect(afterCloseNewYear.openingRetainedEarnings).toBe(500);
    expect(afterCloseNewYear.closingRetainedEarningsStored).toBe(500);
    expect(afterCloseNewYear.totalEquity).toBe(500);
    expect(afterCloseNewYear.balanceSheetBalanced).toBe(true);
    expect(afterCloseNewYear.equityIdentityHolds).toBe(true);
  });

});


