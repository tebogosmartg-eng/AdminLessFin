/**
 * The disclosure engine builds a note from the accounts, and keeps it honest.
 *
 * Three things are pinned here. A disclosure appears only when the company has
 * something to disclose. Every figure it prints comes from named accounts and
 * says so. And when the statements are rebuilt, the ledger's figures move while
 * the preparer's own work does not.
 */
import { describe, it, expect } from 'vitest';
import { AccountIndex, type FinancialFacts } from '../../src/lib/financialStatements/disclosures/accountIndex';
import { generateDisclosures, type BuildContext } from '../../src/lib/financialStatements/disclosures/definitions';
import { mergeTable, recalculate } from '../../src/lib/financialStatements/disclosures/merge';
import { formatCellValue, parseCellValue } from '../../src/lib/financialStatements/disclosures/format';
import type { GeneratedTable } from '../../src/lib/financialStatements/disclosures/types';

function account(
  id: string,
  name: string,
  type: string,
  subcategory: string | null,
  closing: number,
  prior = 0,
  activity = 0,
  category: string | null = null,
) {
  return { id, name, type, subcategory, category, account_number: Number(id), balance: closing, prior, activity };
}

function facts(): FinancialFacts {
  const rows = [
    account('1110', 'Land and Buildings', 'Asset', 'Property, Plant and Equipment', 1_200_000, 1_200_000, 0, 'Non-Current Assets'),
    account('1150', 'Motor Vehicles', 'Asset', 'Property, Plant and Equipment', 865_000, 480_000, 385_000, 'Non-Current Assets'),
    account('1190', 'Accumulated Depreciation', 'Asset', 'Property, Plant and Equipment', -240_000, -160_000, -80_000, 'Non-Current Assets'),
    account('1220', 'Accounts Receivable (Trade Debtors)', 'Asset', 'Trade and Other Receivables', 500_000, 300_000, 0, 'Current Assets'),
    account('1230', 'Provision for Doubtful Debts', 'Asset', 'Trade and Other Receivables', -50_000, -32_000, 0, 'Current Assets'),
    account('4010', 'Sales - Goods', 'Income', null, 2_910_000, 1_870_000, 0, 'Revenue'),
  ];
  return {
    period: { start_date: '2026-01-01', end_date: '2026-12-31' },
    balances_as_of: rows.map((r) => ({ ...r, balance: r.balance })),
    balances_prior_as_of: rows.map((r) => ({ ...r, balance: r.prior })),
    period_activity: rows.map((r) => ({ ...r, period_activity: r.activity })),
  };
}

function context(): BuildContext {
  const index = new AccountIndex(facts());
  return { index, currentLabel: 'FY2026', priorLabel: 'FY2025', withComparatives: index.hasComparatives };
}

describe('the disclosure engine', () => {
  it('generates a property note with a row for each asset class', () => {
    const ppe = generateDisclosures(context()).find((d) => d.code === 'DISC.PPE');
    expect(ppe).toBeDefined();

    const carrying = ppe!.tables.find((t) => t.code === 'PPE.CARRYING')!;
    const labels = carrying.rows.map((r) => String(r.cells[0].value));
    expect(labels).toContain('Land and Buildings');
    expect(labels).toContain('Motor Vehicles');
    expect(labels).toContain('Accumulated depreciation');
    expect(labels).toContain('Carrying amount');
  });

  it('adds the classes up and nets the depreciation off', () => {
    const ppe = generateDisclosures(context()).find((d) => d.code === 'DISC.PPE')!;
    const carrying = ppe.tables.find((t) => t.code === 'PPE.CARRYING')!;
    const row = (label: string) => carrying.rows.find((r) => r.cells[0].value === label)!;

    expect(row('Cost').cells[1].value).toBe(2_065_000);
    expect(row('Accumulated depreciation').cells[1].value).toBe(-240_000);
    expect(row('Carrying amount').cells[1].value).toBe(1_825_000);
    // And last year beside it.
    expect(row('Cost').cells[2].value).toBe(1_680_000);
  });

  it('says where every linked figure came from', () => {
    const ppe = generateDisclosures(context()).find((d) => d.code === 'DISC.PPE')!;
    const carrying = ppe.tables.find((t) => t.code === 'PPE.CARRYING')!;
    const vehicles = carrying.rows.find((r) => r.cells[0].value === 'Motor Vehicles')!;
    const figure = vehicles.cells[1];

    expect(figure.origin).toBe('linked');
    expect(figure.source?.accounts.map((a) => a.name)).toEqual(['Motor Vehicles']);
    expect(figure.source?.basis).toBe('closing');
  });

  it('marks a total as calculated and records what it adds up', () => {
    const ppe = generateDisclosures(context()).find((d) => d.code === 'DISC.PPE')!;
    const carrying = ppe.tables.find((t) => t.code === 'PPE.CARRYING')!;
    const cost = carrying.rows.find((r) => r.cells[0].value === 'Cost')!;
    expect(cost.cells[1].origin).toBe('calculated');
    expect(cost.cells[1].sums).toContain('cost:Land and Buildings');
  });

  it('offers additions and disposals to complete rather than guessing them', () => {
    const ppe = generateDisclosures(context()).find((d) => d.code === 'DISC.PPE')!;
    const movement = ppe.tables.find((t) => t.code === 'PPE.MOVEMENT')!;
    const additions = movement.rows.find((r) => r.key === 'additions')!;
    // The snapshot carries a net movement, not a split, so this is the
    // preparer's to enter — and it is empty, not invented.
    expect(additions.cells[1].origin).toBe('manual');
    expect(additions.cells[1].value).toBeNull();

    const opening = movement.rows.find((r) => r.key === 'opening')!;
    expect(opening.cells[1].origin).toBe('linked');
    expect(opening.cells[1].value).toBe(1_520_000);
  });

  it('nets an allowance off receivables', () => {
    const receivables = generateDisclosures(context()).find((d) => d.code === 'DISC.RECEIVABLES')!;
    const table = receivables.tables[0];
    const row = (label: string) => table.rows.find((r) => r.cells[0].value === label)!;
    expect(row('Gross receivables').cells[1].value).toBe(500_000);
    expect(row('Allowance for doubtful debts').cells[1].value).toBe(-50_000);
    expect(row('Net receivables').cells[1].value).toBe(450_000);
  });

  it('leaves out a disclosure the company has nothing to say about', () => {
    const codes = generateDisclosures(context()).map((d) => d.code);
    // Nothing in these accounts is inventory, a borrowing or a provision.
    expect(codes).not.toContain('DISC.INVENTORIES');
    expect(codes).not.toContain('DISC.BORROWINGS');
    expect(codes).not.toContain('DISC.PROVISIONS');
    expect(codes).toContain('DISC.REVENUE');
  });

  it('drops the comparative column when there is no prior year', () => {
    const index = new AccountIndex({
      balances_as_of: [account('4010', 'Sales - Goods', 'Income', null, 1_000, 0, 0, 'Revenue')],
      balances_prior_as_of: [],
      period_activity: [],
    });
    const revenue = generateDisclosures({
      index,
      currentLabel: 'FY2026',
      priorLabel: 'FY2025',
      withComparatives: index.hasComparatives,
    }).find((d) => d.code === 'DISC.REVENUE')!;
    expect(revenue.tables[0].columns).toHaveLength(2);
  });
});

describe('rebuilding a disclosure the preparer has worked on', () => {
  const generated = (): GeneratedTable => {
    const ppe = generateDisclosures(context()).find((d) => d.code === 'DISC.PPE')!;
    return ppe.tables.find((t) => t.code === 'PPE.CARRYING')!;
  };

  it('refreshes the ledger figures', () => {
    const saved = JSON.parse(JSON.stringify(generated())) as GeneratedTable;
    // Last time the statements were built, vehicles stood at something else.
    const vehicles = saved.rows.find((r) => r.key === 'cost:Motor Vehicles')!;
    vehicles.cells[1].value = 111;

    const merged = mergeTable(generated(), saved);
    expect(merged.rows.find((r) => r.key === 'cost:Motor Vehicles')!.cells[1].value).toBe(865_000);
  });

  it('keeps a row the preparer added, and their formatting', () => {
    const saved = JSON.parse(JSON.stringify(generated())) as GeneratedTable;
    saved.rows.push({
      key: 'added-1',
      cells: [
        { value: 'Assets under construction', origin: 'manual' },
        { value: 42_000, origin: 'manual' },
        { value: null, origin: 'manual' },
      ],
    });
    saved.rows[0].cells[0].format = { bold: true, italic: true };

    const merged = mergeTable(generated(), saved);
    const added = merged.rows.find((r) => r.key === 'added-1')!;
    expect(added.cells[0].value).toBe('Assets under construction');
    expect(added.cells[1].value).toBe(42_000);
    expect(merged.rows[0].cells[0].format).toMatchObject({ bold: true, italic: true });
  });

  it('does not bring back a row the preparer deleted', () => {
    const saved = JSON.parse(JSON.stringify(generated())) as GeneratedTable;
    saved.rows = saved.rows.filter((r) => r.key !== 'cost:Motor Vehicles');
    const merged = mergeTable(generated(), saved);
    expect(merged.rows.some((r) => r.key === 'cost:Motor Vehicles')).toBe(false);
  });

  it('empties a linked cell whose accounts have gone rather than showing a stale figure', () => {
    const saved = JSON.parse(JSON.stringify(generated())) as GeneratedTable;
    saved.rows.push({
      key: 'cost:Aircraft',
      cells: [
        { value: 'Aircraft', origin: 'manual' },
        { value: 9_000_000, origin: 'linked' },
        { value: null, origin: 'linked' },
      ],
    });
    const merged = mergeTable(generated(), saved);
    expect(merged.rows.find((r) => r.key === 'cost:Aircraft')!.cells[1].value).toBeNull();
  });

  it('works the totals out again after a row is added', () => {
    const rows = [
      { key: 'a', cells: [{ value: 'A', origin: 'manual' as const }, { value: 10, origin: 'linked' as const }] },
      { key: 'b', cells: [{ value: 'B', origin: 'manual' as const }, { value: 5, origin: 'manual' as const }] },
      {
        key: 'total',
        cells: [
          { value: 'Total', origin: 'manual' as const },
          { value: 10, origin: 'calculated' as const, sums: ['a', 'b'] },
        ],
      },
    ];
    expect(recalculate(rows)[2].cells[1].value).toBe(15);
  });
});

describe('how a figure reads', () => {
  it('brackets a negative and dashes a nil', () => {
    expect(formatCellValue(-1234.5, { numberFormat: 'currency', decimals: 2, negativeParens: true }))
      .toMatch(/^\(1.234,50\)$/);
    expect(formatCellValue(0, { numberFormat: 'currency' })).toBe('–');
  });

  it('reads back what an accountant types', () => {
    expect(parseCellValue('(1 234,50)')).toBe(-1234.5);
    expect(parseCellValue('R 900')).toBe(900);
    expect(parseCellValue('')).toBeNull();
    expect(parseCellValue('Assets under construction')).toBe('Assets under construction');
  });
});
