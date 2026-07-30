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
    expect(src).toMatch(/cfa\.receivables|canonicalAggregation/);
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
    expect(src).toMatch(/canonicalAggregation/);
  });

  it('CFA authority files exist and export builder', () => {
    const client = read('src/lib/accounting/canonicalFinancialAggregation.ts');
    const edge = read('supabase/functions/_shared/canonicalFinancialAggregation.ts');
    expect(client).toMatch(/export function buildCanonicalFinancialAggregation/);
    expect(edge).toMatch(/export function buildCanonicalFinancialAggregation/);
    expect(client).toMatch(/ONLY permitted monetary aggregation|sole|Canonical Financial Aggregation/i);
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
