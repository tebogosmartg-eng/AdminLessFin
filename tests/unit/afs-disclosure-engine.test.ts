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
import { applyGeneratedDisclosures, asGeneratedTable } from '../../src/lib/financialStatements/disclosures/assemble';
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

  it('brings in an account posted to after the note was saved, and adds it into the totals', () => {
    const money = (v: number) => ({ value: v, origin: 'linked' as const });
    const label = (t: string) => ({ value: t, origin: 'manual' as const });
    // The receivables note as it was saved, before VAT Input carried a balance.
    const saved: GeneratedTable = {
      code: 'RECEIVABLES.ANALYSIS',
      title: 'Trade and other receivables',
      columns: [],
      rows: [
        { key: 'gross:Accounts Receivable (Trade Debtors)', cells: [label('AR'), money(1_150), money(0)] },
        { key: 'gross:Prepaid Expenses', cells: [label('Prepaid'), money(790_000), money(280_000)] },
        {
          key: 'Gross receivables',
          kind: 'subtotal',
          cells: [
            label('Gross receivables'),
            { value: 791_150, origin: 'calculated', sums: ['gross:Accounts Receivable (Trade Debtors)', 'gross:Prepaid Expenses'] },
            { value: 280_000, origin: 'calculated', sums: ['gross:Accounts Receivable (Trade Debtors)', 'gross:Prepaid Expenses'] },
          ],
        },
        { key: 'allowance', cells: [label('Allowance'), money(-50_500), money(-32_000)] },
        {
          key: 'Net receivables',
          kind: 'total',
          cells: [
            label('Net receivables'),
            { value: 740_650, origin: 'calculated', sums: ['Gross receivables', 'allowance'] },
            { value: 248_000, origin: 'calculated', sums: ['Gross receivables', 'allowance'] },
          ],
        },
      ],
    };
    const fresh: GeneratedTable = JSON.parse(JSON.stringify(saved));
    fresh.rows[0].cells[1].value = 139_150;
    fresh.rows.splice(2, 0, { key: 'gross:VAT Input (Receivable)', cells: [label('VAT Input'), money(5_100), money(0)] });

    const merged = mergeTable(fresh, saved);
    const net = merged.rows.find((r) => r.key === 'Net receivables')!;
    expect(net.cells[1].value).toBe(883_750);
    expect(net.cells[2].value).toBe(248_000);
    // Placed with its group, above the subtotal that adds it up.
    const keys = merged.rows.map((r) => r.key);
    expect(keys.indexOf('gross:VAT Input (Receivable)')).toBeLessThan(keys.indexOf('Gross receivables'));
    // The saved input is not changed underneath the caller.
    expect(saved.rows[2].cells[1].sums).toHaveLength(2);
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

/**
 * The standard wording and the preparer's own, in one note.
 *
 * This used to be all or nothing, and both ends were wrong: rewriting a single
 * paragraph silently dropped every other paragraph the framework supplies, and
 * adding a paragraph — which starts empty — left the note looking untouched, so
 * Add paragraph appeared to do nothing at all.
 */
describe('merging narrative when the statements are rebuilt', () => {
  const NOTE_ID = '7b1f4c2e-0c1a-4f6d-9e2b-8a3d5c6f1234';
  const STORED = 'a1b2c3d4-0000-4000-8000-000000000001';

  function noteWith(paragraphs: Array<Record<string, unknown>>) {
    return {
      id: NOTE_ID,
      kind: 'note' as const,
      // A note the engine states narrative for. (The PPE note carries none: its
      // measurement basis is the accounting policy's to state.)
      disclosure_code: 'DISC.RECEIVABLES',
      title: 'Trade and other receivables',
      status: 'in_progress',
      requirement_level: 'required',
      sort_order: 30,
      sections: [],
      paragraphs,
      tables: [],
    };
  }

  function rebuild(note: ReturnType<typeof noteWith>) {
    return applyGeneratedDisclosures([note] as never, {
      facts: facts(),
      currentLabel: 'FY2026',
      priorLabel: 'FY2025',
    }).notes.find((n) => n.disclosure_code === 'DISC.RECEIVABLES')!;
  }

  it('keeps the framework wording the preparer has not touched', () => {
    const rebuilt = rebuild(noteWith([]));
    expect(rebuilt.paragraphs.length).toBeGreaterThan(0);
    expect(rebuilt.paragraphs.every((p) => p.body.trim())).toBe(true);
  });

  it('keeps a paragraph the preparer added, even before they have written in it', () => {
    // The defect: an empty paragraph meant "this note has no wording of its
    // own", so the whole note was replaced and the new paragraph disappeared.
    const rebuilt = rebuild(
      noteWith([{ id: STORED, section_id: null, paragraph_code: 'P900', body: '', sort_order: 900 }]),
    );
    expect(rebuilt.paragraphs.some((p) => p.paragraph_code === 'P900')).toBe(true);
  });

  it('does not drop the rest of the framework wording when one paragraph is rewritten', () => {
    const generated = rebuild(noteWith([]));
    expect(generated.paragraphs.length).toBeGreaterThan(0);

    const rewritten = rebuild(
      noteWith([
        { id: STORED, section_id: null, paragraph_code: 'P1', body: 'Our own first sentence.', sort_order: 1 },
      ]),
    );
    expect(rewritten.paragraphs).toHaveLength(generated.paragraphs.length);
    expect(rewritten.paragraphs[0].body).toBe('Our own first sentence.');
    generated.paragraphs.slice(1).forEach((p, i) => expect(rewritten.paragraphs[i + 1].body).toBe(p.body));
  });

  it('puts the preparer\u2019s own additions after the standard wording', () => {
    const rebuilt = rebuild(
      noteWith([
        { id: STORED, section_id: null, paragraph_code: 'P900', body: 'Added by us.', sort_order: 900 },
      ]),
    );
    expect(rebuilt.paragraphs[rebuilt.paragraphs.length - 1].paragraph_code).toBe('P900');
  });

  it('drops an empty paragraph that has no row behind it', () => {
    // A leftover of the old assembly: it says nothing and asks for nothing.
    const rebuilt = rebuild(
      noteWith([
        { id: `${NOTE_ID}:P900`, section_id: null, paragraph_code: 'P900', body: '', sort_order: 900 },
      ]),
    );
    expect(rebuilt.paragraphs.some((p) => p.paragraph_code === 'P900')).toBe(false);
  });
});

/**
 * One table editor, not two.
 *
 * Tables written before the disclosure engine store a row as a plain array of
 * text. They used to fall through to a far poorer editor — no formatting, no
 * clipboard, no keyboard — so which editor an accountant got depended on which
 * note they opened. They are now read into the same shape as everything else.
 */
describe('a table stored before the disclosure engine', () => {
  const legacy = {
    id: 'a1b2c3d4-0000-4000-8000-00000000000a',
    table_code: 'T.CATEGORIES',
    title: 'Categories of financial instruments',
    columns_json: [{ label: 'Category' }, { label: 'FY2026' }],
    rows_json: [
      ['Loans and receivables', '500 000,00'],
      ['Financial liabilities at amortised cost', '320 000,00'],
    ],
    sort_order: 10,
  };

  it('opens in the spreadsheet rather than falling back', () => {
    const table = asGeneratedTable(legacy as never);
    expect(table).not.toBeNull();
    expect(table!.rows).toHaveLength(2);
    expect(table!.rows[0].cells[0].value).toBe('Loans and receivables');
  });

  it('is read as the preparer\u2019s own, because nothing records a link to the ledger', () => {
    const table = asGeneratedTable(legacy as never)!;
    expect(table.rows.flatMap((r) => r.cells).every((c) => c.origin === 'manual')).toBe(true);
  });

  it('keeps the headings it was stored with', () => {
    const table = asGeneratedTable(legacy as never)!;
    expect(table.columns.map((c) => c.label)).toEqual(['Category', 'FY2026']);
  });

  it('invents headings only where none were stored', () => {
    const table = asGeneratedTable({ ...legacy, columns_json: [] } as never)!;
    expect(table.columns).toHaveLength(2);
    expect(table.columns[0].label).toBe('Description');
  });

  it('still refuses a shape it cannot read', () => {
    expect(asGeneratedTable({ ...legacy, rows_json: [{ a: 1 }] } as never)).toBeNull();
    expect(asGeneratedTable({ ...legacy, rows_json: [] } as never)).toBeNull();
  });
});

describe('an income or expense note reports the year, not the running balance', () => {
  const sales = { id: '4010', name: 'Sales - Goods', type: 'Income', category: 'Revenue', subcategory: null, account_number: 4010 };
  const build = (withActivity: boolean) => {
    const index = new AccountIndex({
      balances_as_of: [{ ...sales, balance: 5_571_000 }],
      balances_prior_as_of: [{ ...sales, balance: 2_150_000 }],
      period_activity: withActivity ? [{ ...sales, period_activity: 3_421_000 }] : [],
    });
    const ctx: BuildContext = { index, currentLabel: '2026', priorLabel: '2025', withComparatives: index.hasComparatives };
    const revenue = generateDisclosures(ctx).find((d) => d.code === 'DISC.REVENUE')!;
    const table = revenue.tables.find((t) => t.code === 'REVENUE.DISAGGREGATION')!;
    return table.rows.find((r) => r.cells[0].value === 'Total revenue')!.cells[1].value;
  };

  it("takes this year's figure from the year's movement, which is what the statement shows", () => {
    // The closing balance of 5 571 000 carries last year's 2 150 000 with it.
    expect(build(true)).toBe(3_421_000);
  });

  it('falls back to the closing balance where the snapshot carries no movement', () => {
    expect(build(false)).toBe(5_571_000);
  });
});
