import { describe, expect, it } from 'vitest';

import { buildCanonicalFinancialAggregation } from '../../src/lib/accounting/canonicalFinancialAggregation';
import { buildRevenueMetrics } from '../../src/lib/revenueIntelligence';
import { sumVatGlBalances } from '../../src/lib/accounting/dashboardReconciliation';

describe('CFA convergence — residual consumers', () => {
  const balances = [
    { id: 'cash', type: 'Asset', balance: 5000, account_role: 'cash' },
    { id: 'ar', type: 'Asset', balance: 1200, subcategory: 'Trade and Other Receivables' },
    { id: 'ap', type: 'Liability', balance: 800, subcategory: 'Trade and Other Payables' },
    { id: 'vat_out', type: 'Liability', balance: 150, account_role: 'output_vat' },
    { id: 'vat_in', type: 'Asset', balance: 40, account_role: 'input_vat' },
    { id: 'eq', type: 'Equity', balance: 5510 },
  ];
  const period = [
    { id: 'rev', type: 'Income', activity: 400 },
    { id: 'exp', type: 'Expense', activity: 150 },
  ];

  it('revenue metrics AR / expected receipts use CFA figures only', () => {
    const cfa = buildCanonicalFinancialAggregation({
      balancesAsOf: balances,
      periodActivity: period,
    });
    const metrics = buildRevenueMetrics({
      arBalances: [
        { customer_id: 'c1', customer_name: 'A', balance: 99999 },
        { customer_id: 'c2', customer_name: 'B', balance: 88888 },
      ],
      overdueInvoices: [{ customer_id: 'c1', customer_name: 'A', total: 77777, due_date: '2020-01-01' }],
      periodRevenue: cfa.totalIncome,
      cashFlowForecast: [
        { date: '2026-01-01', balance: 100 },
        { date: '2026-01-02', balance: 500 },
      ],
      receivables: cfa.receivables,
      expectedReceipts: Math.max(0, cfa.netCashFlow),
    });
    expect(metrics.totalAr).toBe(cfa.receivables);
    expect(metrics.overdueTotal).toBe(cfa.receivables);
    expect(metrics.revenueThisMonth).toBe(cfa.totalIncome);
    // Subledger / forecast reduces must not win over CFA.
    expect(metrics.totalAr).not.toBe(99999 + 88888);
    expect(metrics.expectedPayments).toBe(Math.max(0, cfa.netCashFlow));
  });

  it('sumVatGlBalances is a CFA wrapper', () => {
    const cfa = buildCanonicalFinancialAggregation({ balancesAsOf: balances });
    const vat = sumVatGlBalances(balances);
    expect(vat.outputVat).toBe(cfa.vatPayable);
    expect(vat.inputVat).toBe(cfa.vatReceivable);
    expect(vat.netVatLiability).toBe(cfa.vatNet);
  });

  it('CFA company P&L equals Income − Expense', () => {
    const cfa = buildCanonicalFinancialAggregation({
      balancesAsOf: balances,
      periodActivity: period,
    });
    expect(cfa.totalIncome).toBe(400);
    expect(cfa.totalExpenses).toBe(150);
    expect(cfa.netIncome).toBe(250);
  });
});
