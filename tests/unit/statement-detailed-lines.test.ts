/**
 * The Statement of Financial Position is presented from the chart of accounts'
 * own classification, and every total still comes from Canonical Financial
 * Aggregation. These tests pin both halves of that contract.
 */
import { describe, it, expect } from 'vitest';
import {
  buildEquityLines,
  buildPositionLines,
  buildPerformanceLines,
  hasClassification,
  presentationFor,
  DEFAULT_PRESENTATION,
} from '../../supabase/functions/_shared/efsStatementEngine/detailedLines.ts';

type Line = {
  line_code: string;
  label: string;
  section: string;
  level?: number;
  amount: number | null;
  prior_amount?: number | null;
  is_header?: boolean;
  is_subtotal?: boolean;
  is_total?: boolean;
  is_grand_total?: boolean;
  is_reconciling?: boolean;
};

const account = (
  id: string,
  name: string,
  type: string,
  category: string | null,
  subcategory: string | null,
  balance: number,
  extra: Record<string, unknown> = {},
) => ({ id, name, type, category, subcategory, balance, ...extra });

/** A small but realistic ledger: two asset groups, equity, two liability groups. */
const closing = [
  account('a1', 'Motor vehicles', 'Asset', 'Non-Current Assets', 'Property, Plant and Equipment', 120_000),
  account('a2', 'Software', 'Asset', 'Non-Current Assets', 'Intangible Assets', 30_000),
  account('a3', 'Stock on hand', 'Asset', 'Current Assets', 'Inventory', 45_000),
  account('a4', 'Debtors control', 'Asset', 'Current Assets', 'Trade and Other Receivables', 80_000),
  account('a5', 'Bank', 'Asset', 'Current Assets', 'Cash and Cash Equivalents', 25_000),
  account('e1', 'Share capital', 'Equity', 'Equity', 'Issued Capital', 100),
  account('e2', 'Retained earnings', 'Equity', 'Equity', null, 220_000, {
    account_role: 'retained_earnings',
  }),
  account('l1', 'Long-term loan', 'Liability', 'Non-Current Liabilities', 'Interest-bearing Borrowings', 40_000),
  account('l2', 'Creditors control', 'Liability', 'Current Liabilities', 'Trade and Other Payables', 30_000),
  account('l3', 'VAT control', 'Liability', 'Current Liabilities', 'Statutory Payables', 9_900),
];

const prior = [
  account('a1', 'Motor vehicles', 'Asset', 'Non-Current Assets', 'Property, Plant and Equipment', 100_000),
  account('a4', 'Debtors control', 'Asset', 'Current Assets', 'Trade and Other Receivables', 60_000),
  account('l2', 'Creditors control', 'Liability', 'Current Liabilities', 'Trade and Other Payables', 25_000),
];

// Totals as the accounting engine reports them. The line builder must present
// these, never its own additions.
const canonical = {
  assets: 300_000,
  liabilities: 79_900,
  equity: 220_100,
  liabilitiesAndEquity: 300_000,
  netProfit: 0,
  totalIncome: 0,
  totalExpenses: 0,
};

const find = (lines: Line[], code: string) => lines.find((l) => l.line_code === code);
const labels = (lines: Line[]) => lines.map((l) => l.label);

describe('detailed statement lines — presentation from the chart of accounts', () => {
  it('groups assets by category and subcategory, in statement order', () => {
    const lines = buildPositionLines({ closing, prior, canonical, presentation: DEFAULT_PRESENTATION }) as Line[];
    const assetLabels = labels(lines.filter((l) => l.section === 'assets'));
    expect(assetLabels).toEqual([
      'Non-Current Assets',
      'Property, Plant and Equipment',
      'Intangible Assets',
      'Total Non-Current Assets',
      'Current Assets',
      'Inventory',
      'Trade and Other Receivables',
      'Cash and Cash Equivalents',
      'Total Current Assets',
      'Total Assets',
    ]);
  });

  it('is more than the five type-level lines it replaced', () => {
    const lines = buildPositionLines({ closing, prior, canonical, presentation: DEFAULT_PRESENTATION }) as Line[];
    expect(lines.length).toBeGreaterThan(15);
  });

  it('takes every statement total from the accounting engine, not from its own sums', () => {
    const lines = buildPositionLines({ closing, prior, canonical, presentation: DEFAULT_PRESENTATION }) as Line[];
    expect(find(lines, 'sfp.total_assets')?.amount).toBe(canonical.assets);
    expect(find(lines, 'sfp.total_liabilities')?.amount).toBe(canonical.liabilities);
    expect(find(lines, 'sfp.total_equity')?.amount).toBe(canonical.equity);
    expect(find(lines, 'sfp.total_liabilities_and_equity')?.amount).toBe(canonical.liabilitiesAndEquity);
  });

  it('carries comparative figures per line', () => {
    const lines = buildPositionLines({ closing, prior, canonical, presentation: DEFAULT_PRESENTATION }) as Line[];
    const ppe = lines.find((l) => l.label === 'Property, Plant and Equipment');
    const receivables = lines.find((l) => l.label === 'Trade and Other Receivables');
    const payables = lines.find((l) => l.label === 'Trade and Other Payables');
    expect(ppe?.amount).toBe(120_000);
    expect(ppe?.prior_amount).toBe(100_000);
    expect(receivables?.prior_amount).toBe(60_000);
    expect(payables?.prior_amount).toBe(25_000);
    // A line with no prior balance comparatives to nil, not to its own figure.
    expect(lines.find((l) => l.label === 'Intangible Assets')?.prior_amount).toBe(0);
  });

  it('subtotals each category from the lines printed under it', () => {
    const lines = buildPositionLines({ closing, prior, canonical, presentation: DEFAULT_PRESENTATION }) as Line[];
    expect(find(lines, 'sfp.assets.non_current_assets.subtotal')?.amount).toBe(150_000);
    expect(find(lines, 'sfp.assets.current_assets.subtotal')?.amount).toBe(150_000);
    expect(find(lines, 'sfp.assets.non_current_assets.subtotal')?.prior_amount).toBe(100_000);
  });

  it('leaves off a line that is nil in both periods', () => {
    const withNil = [
      ...closing,
      account('a9', 'Unused deposit', 'Asset', 'Current Assets', 'Deposits', 0),
    ];
    const lines = buildPositionLines({
      closing: withNil,
      prior,
      canonical,
      presentation: DEFAULT_PRESENTATION,
    }) as Line[];
    expect(labels(lines)).not.toContain('Deposits');
  });

  it('shows a difference between the detail and the ledger instead of absorbing it', () => {
    const disagreeing = { ...canonical, assets: 310_000 };
    const lines = buildPositionLines({
      closing,
      prior,
      canonical: disagreeing,
      presentation: DEFAULT_PRESENTATION,
    }) as Line[];
    const recon = lines.find((l) => l.is_reconciling && l.section === 'assets');
    expect(recon).toBeTruthy();
    expect(recon?.amount).toBe(10_000);
    // The engine's total still stands.
    expect(find(lines, 'sfp.total_assets')?.amount).toBe(310_000);
  });

  it('surfaces unclassified accounts rather than hiding them in a total', () => {
    const withUnclassified = [...closing, account('a8', 'Suspense', 'Asset', null, null, 5_000)];
    const lines = buildPositionLines({
      closing: withUnclassified,
      prior,
      canonical: { ...canonical, assets: 305_000 },
      presentation: DEFAULT_PRESENTATION,
    }) as Line[];
    expect(labels(lines)).toContain('Unclassified');
  });

  it('gives the lines that notes bind to a stable code', () => {
    // Note tables auto-fill from the statement by line code. A positional or
    // wording-derived code would silently empty the PPE note.
    const lines = buildPositionLines({ closing, prior, canonical, presentation: DEFAULT_PRESENTATION }) as Line[];
    expect(find(lines, 'sfp.ppe')?.amount).toBe(120_000);
    expect(find(lines, 'sfp.intangibles')?.amount).toBe(30_000);
    expect(find(lines, 'sfp.inventory')?.amount).toBe(45_000);
    expect(find(lines, 'sfp.receivables')?.amount).toBe(80_000);
    expect(find(lines, 'sfp.cash')?.amount).toBe(25_000);
    expect(find(lines, 'sfp.payables')?.amount).toBe(30_000);
    expect(find(lines, 'sfp.ppe')?.prior_amount).toBe(100_000);
  });

  it("states retained earnings including the year profit, as a balance sheet does", () => {
    const lines = buildPositionLines({
      closing,
      prior,
      canonical: { ...canonical, netProfit: 12_000, equity: 232_100 },
      presentation: DEFAULT_PRESENTATION,
    }) as Line[];
    // The retained earnings account (220 000) plus the year's profit (12 000).
    expect(find(lines, 'sfp.equity.retained_earnings')?.amount).toBe(232_000);
    // The year's profit is not printed a second time on the balance sheet.
    expect(find(lines, 'sfp.equity.current_result')).toBeUndefined();
  });

  it("carries an earlier year unclosed profit, so both years balance", () => {
    // The demo company: FY2025's profit was never closed into retained earnings.
    const rows = (sales: number, costs: number, extra: Array<Record<string, unknown>> = []) => [
      { id: 'a', type: 'Asset', category: 'Current Assets', subcategory: 'Cash and Cash Equivalents', balance: 0 },
      { id: 'cap', type: 'Equity', category: 'Equity', subcategory: 'Issued Capital', balance: 900_000 },
      { id: 'sales', type: 'Income', category: 'Revenue', balance: sales },
      { id: 'costs', type: 'Expense', category: 'Operating Expenses', balance: costs },
      ...extra,
    ];
    const lines = buildPositionLines({
      closing: rows(5_571_000, 2_126_250),
      prior: rows(2_150_000, 861_200),
      canonical: {
        assets: 3_929_900,
        liabilities: -414_850,
        equity: 4_344_750,
        liabilitiesAndEquity: 3_929_900,
        netProfit: 2_155_950,
        unclosedPriorEarnings: 1_288_800,
      },
      presentation: DEFAULT_PRESENTATION,
    }) as Line[];
    const re = find(lines, 'sfp.equity.retained_earnings')!;
    expect(re.amount).toBe(3_444_750);
    expect(re.prior_amount).toBe(1_288_800);
    expect(find(lines, 'sfp.total_equity')?.amount).toBe(4_344_750);
    expect(find(lines, 'sfp.total_equity')?.prior_amount).toBe(2_188_800);
    expect(find(lines, 'sfp.equity.unreconciled')).toBeUndefined();
  });
});

describe('framework presentation', () => {
  it('defaults to private-entity wording when a pack sets none', () => {
    expect(presentationFor(null).equity_label).toBe('Equity');
    expect(presentationFor({ presentation: null }).equity_label).toBe('Equity');
  });

  it('lets a framework pack decide the section wording', () => {
    const mcs = presentationFor({
      presentation: { equity_label: 'Net Assets', equity_section_label: 'Net Assets', revenue_label: 'Receipts' },
    });
    const lines = buildPositionLines({ closing, prior, canonical, presentation: mcs }) as Line[];
    expect(find(lines, 'sfp.total_equity')?.label).toBe('Total Net Assets');
    expect(find(lines, 'sfp.equity')?.label).toBe('Net Assets');
    // Unset keys keep the defaults.
    expect(mcs.total_assets_label).toBe('Total Assets');
  });
});

describe('financial performance', () => {
  const activity = [
    account('i1', 'Sales', 'Income', 'Revenue', null, 0, { period_activity: 500_000 }),
    account('i2', 'Interest received', 'Income', 'Other Income', null, 0, { period_activity: 2_000 }),
    account('x1', 'Purchases', 'Expense', 'Cost of Sales', null, 0, { period_activity: 300_000 }),
    account('x2', 'Salaries', 'Expense', 'Operating Expenses', 'Employee Costs', 0, { period_activity: 120_000 }),
    account('x3', 'Rent', 'Expense', 'Operating Expenses', null, 0, { period_activity: 40_000 }),
  ];
  const perfCanonical = { totalIncome: 502_000, totalExpenses: 460_000, netProfit: 42_000 };

  it('splits income and expenditure by the ledger categories', () => {
    const lines = buildPerformanceLines({
      activity,
      canonical: perfCanonical,
      presentation: DEFAULT_PRESENTATION,
    }) as Line[];
    const shown = labels(lines);
    expect(shown).toContain('Revenue');
    expect(shown).toContain('Other Income');
    expect(shown).toContain('Cost of Sales');
    expect(shown).toContain('Employee Costs');
  });

  it('takes the result from the accounting engine', () => {
    const lines = buildPerformanceLines({
      activity,
      canonical: perfCanonical,
      presentation: DEFAULT_PRESENTATION,
    }) as Line[];
    expect(find(lines, 'perf.total_revenue')?.amount).toBe(502_000);
    expect(find(lines, 'perf.total_expenses')?.amount).toBe(460_000);
    expect(find(lines, 'perf.result')?.amount).toBe(42_000);
  });
});

describe('snapshots sealed before classification existed', () => {
  it('are recognised so they keep their original presentation', () => {
    expect(hasClassification([{ id: 'x', name: 'Bank', type: 'Asset', balance: 1 }])).toBe(false);
    expect(hasClassification(closing)).toBe(true);
    expect(hasClassification([])).toBe(false);
  });
});

describe('comparatives from the sealed comparative year', () => {
  const activity = [
    { id: 'sales', type: 'Income', category: 'Revenue', period_activity: 3_421_000 },
    { id: 'wages', type: 'Expense', category: 'Operating Expenses', subcategory: 'Employee Costs', period_activity: 853_450 },
  ];
  const priorActivity = [
    { id: 'sales', type: 'Income', category: 'Revenue', period_activity: 2_150_000 },
    { id: 'wages', type: 'Expense', category: 'Operating Expenses', subcategory: 'Employee Costs', period_activity: 626_200 },
  ];
  const canonical = { totalIncome: 3_421_000, totalExpenses: 853_450, netProfit: 2_567_550 };
  const priorCanonical = { totalIncome: 2_150_000, totalExpenses: 626_200, netProfit: 1_523_800 };

  it('prints last year beside this year when the seal carries last year', () => {
    const lines = buildPerformanceLines({ activity, canonical, presentation: DEFAULT_PRESENTATION, priorActivity, priorCanonical }) as Line[];
    expect(find(lines, 'perf.revenue')?.prior_amount).toBe(2_150_000);
    expect(find(lines, 'perf.employee_costs')?.prior_amount).toBe(626_200);
    expect(find(lines, 'perf.result')?.prior_amount).toBe(1_523_800);
  });

  it('leaves last year blank, not nil, when the seal does not carry it', () => {
    const lines = buildPerformanceLines({ activity, canonical, presentation: DEFAULT_PRESENTATION }) as Line[];
    expect(find(lines, 'perf.revenue')?.prior_amount).toBeNull();
    expect(find(lines, 'perf.result')?.prior_amount).toBeNull();
  });

  it('states changes in equity for both years, closing on the balance sheet equity', () => {
    const lines = buildEquityLines({
      canonical: { openingEquity: 2_188_800, netProfit: 2_155_950, otherEquityMovements: 0, equity: 4_344_750 },
      priorCanonical: { openingEquity: 900_000, netProfit: 1_288_800, otherEquityMovements: 0, equity: 2_188_800 },
    }) as Line[];
    expect(lines.map((l) => [l.line_code, l.amount, l.prior_amount])).toEqual([
      ['eq.opening', 2_188_800, 900_000],
      ['eq.period_result', 2_155_950, 1_288_800],
      ['eq.closing', 4_344_750, 2_188_800],
    ]);
  });
});
