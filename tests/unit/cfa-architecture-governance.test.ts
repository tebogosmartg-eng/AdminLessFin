import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function mustConsumeCfa(src: string, labels: string[]) {
  const hit = labels.some((l) => src.includes(l));
  expect(hit, `Expected one of: ${labels.join(', ')}`).toBe(true);
}

describe('CFA architectural governance — certified consumers', () => {
  it('Dashboard consumes CFA (no AR/AP reduce)', () => {
    const src = read('src/pages/Dashboard.tsx');
    mustConsumeCfa(src, ['canonicalAggregation', 'statementTotals']);
    expect(src).toMatch(/cfa\??\.receivables/);
    expect(src).not.toMatch(/arBalances\s*\.\s*reduce/);
    expect(src).not.toMatch(/apBalances\s*\.\s*reduce/);
  });

  it('Financial Statements consume CFA statementTotals', () => {
    const src = read('src/pages/FinancialStatements.tsx');
    mustConsumeCfa(src, ['statementTotals', 'canonicalAggregation']);
    expect(src).toMatch(/totalIncome|netIncome|totalAssets/);
    expect(src).not.toMatch(/accounts\s*\.\s*filter[\s\S]{0,120}\.reduce/);
  });

  it('Reports consume CFA statementTotals', () => {
    const src = read('src/pages/Reports.tsx');
    mustConsumeCfa(src, ['statementTotals', 'canonicalAggregation']);
    expect(src).toMatch(/receivables|payables|totalIncome|netIncome/);
    expect(src).not.toMatch(/agedReceivables\s*\.\s*reduce/);
  });

  it('Tax Report consumes CFA VAT via GET_TAX_REPORT', () => {
    const src = read('src/pages/TaxReport.tsx');
    expect(src).toMatch(/GET_TAX_REPORT/);
    expect(src).toMatch(/money_source|vatNet|vatPayable/);
    expect(src).not.toMatch(/taxCollected\s*\.\s*reduce|\.reduce\([^)]*taxCollected/);
  });

  it('Banking consumes CFA cash', () => {
    const src = read('src/pages/Banking.tsx');
    mustConsumeCfa(src, ['canonicalAggregation', 'statementTotals']);
    expect(src).toMatch(/cfa\.cash|cfaCash|cfa\?\.cash/);
    expect(src).not.toMatch(/bankAccounts[\s\S]{0,80}\.reduce\([^)]*balance/);
  });

  it('Dashboard Insights uses CFA AR (no overdue invoice money reduce)', () => {
    const src = read('src/components/DashboardInsights.tsx');
    expect(src).toMatch(/totalAr/);
    expect(src).not.toMatch(/overdueInvoices\s*\.\s*reduce/);
  });

  it('Accounting Intelligence attaches CFA company_financials', () => {
    const src = read('supabase/functions/accounting/index.ts');
    expect(src).toMatch(/CFA_ATTACH|loadCanonicalAggregation/);
    expect(src).toMatch(/company_financials/);
    expect(src).toMatch(/canonicalAggregation/);
  });

  it('reports edge uses CFA for tax + project profitability', () => {
    const src = read('supabase/functions/reports/index.ts');
    expect(src).toMatch(/loadCanonicalAggregation|buildCanonicalFinancialAggregation|buildStatementTotals/);
    expect(src).toMatch(/GET_TAX_REPORT/);
    expect(src).toMatch(/GET_PROJECT_PROFITABILITY/);
    expect(src).toMatch(/vatNet|canonicalAggregation/);
  });

  it('dashboard-data KPIs originate from CFA buildStatementTotals', () => {
    const src = read('supabase/functions/dashboard-data/index.ts');
    expect(src).toMatch(/buildStatementTotals|buildCanonicalFinancialAggregation/);
    expect(src).toMatch(/statementTotals/);
  });

  it('CFA authority files exist and export builder', () => {
    const client = read('src/lib/accounting/canonicalFinancialAggregation.ts');
    const edge = read('supabase/functions/_shared/canonicalFinancialAggregation.ts');
    expect(client).toMatch(/export function buildCanonicalFinancialAggregation/);
    expect(edge).toMatch(/export function buildCanonicalFinancialAggregation/);
    expect(client).toMatch(/ONLY permitted monetary aggregation|sole|Canonical Financial Aggregation/i);
  });
});

/**
 * Single-source-of-truth regression gate for the Dashboard payload.
 *
 * Every one of these scalars used to be a *copy* of a `statementTotals`
 * property. A copy is a second place a figure can drift from the General
 * Ledger, and a fallback chain made the drift invisible. They are removed;
 * these tests stop them coming back.
 */
describe('Dashboard single source of accounting truth', () => {
  const OBSOLETE_MONEY_FIELDS = [
    'periodNetIncome',
    'periodRevenue',
    'periodExpenses',
    'totalStoredEquity',
    'cashBalance',
  ];

  it('dashboard-data emits exactly one canonical money field', () => {
    const src = read('supabase/functions/dashboard-data/index.ts');
    // `statementTotals` is the only permitted money field on the response.
    expect(src).toMatch(/\n\s*statementTotals,/);
    expect(src).not.toMatch(/canonicalAggregation\s*:/);
    // `totalAssets`/`totalLiabilities` survive only as CFA properties read from
    // `totals.`, never as response scalars.
    expect(src).not.toMatch(/\n\s*totalAssets,/);
    expect(src).not.toMatch(/\n\s*totalLiabilities,/);
  });

  it.each(OBSOLETE_MONEY_FIELDS)(
    'dashboard-data no longer emits the obsolete scalar %s',
    (field) => {
      const src = read('supabase/functions/dashboard-data/index.ts');
      expect(src).not.toMatch(new RegExp(`\\n\\s*${field}[,:]`));
    },
  );

  const payloadConsumers = [
    'src/pages/Dashboard.tsx',
    'src/pages/RevenueWorkspace.tsx',
    'src/pages/PurchasesWorkspace.tsx',
    'src/pages/PayrollWorkspace.tsx',
    'src/components/accounting/SubLedgerReconciliationPanel.tsx',
  ];

  it.each(payloadConsumers)('%s reads only statementTotals from the payload', (file) => {
    const src = read(file);
    // No consumer may read the removed duplicate field off a payload object.
    expect(src).not.toMatch(/\??\.\s*canonicalAggregation\b/);
    // Nor fall back to an obsolete per-KPI scalar.
    for (const field of OBSOLETE_MONEY_FIELDS) {
      expect(src).not.toMatch(new RegExp(`(?:data|dashboard|dashboardData)\\?\\?\\.\\s*${field}\\b`));
      expect(src).not.toMatch(new RegExp(`(?:data|dashboard|dashboardData)\\?\\.\\s*${field}\\b`));
    }
  });

  it('Dashboard never renders a zero when CFA is absent', () => {
    const src = read('src/pages/Dashboard.tsx');
    // A missing aggregation must surface as unavailable, not as R0.00 — a
    // silent zero is indistinguishable from a real nil balance.
    expect(src).toMatch(/financialsUnavailable/);
    expect(src).toMatch(/financialsReady/);
    expect(src).toMatch(/Financial figures unavailable/);
  });
});

describe('CFA architectural governance — forbidden bypass markers', () => {
  const consumers = [
    'src/pages/Dashboard.tsx',
    'src/pages/FinancialStatements.tsx',
    'src/pages/Reports.tsx',
    'src/pages/TaxReport.tsx',
    'src/pages/Banking.tsx',
    'src/lib/revenueIntelligence.ts',
  ];

  it.each(consumers)('%s must not reintroduce arBalances.reduce', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/\barBalances\s*\.\s*reduce\b/);
  });

  it.each(consumers)('%s must not reintroduce apBalances.reduce', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/\bapBalances\s*\.\s*reduce\b/);
  });
});
