/**
 * What each disclosure is, and how to build it from the accounts.
 *
 * A definition says three things: when the disclosure applies, what it says, and
 * how its tables are laid out. Nothing here is a React component and nothing
 * here knows about a particular company — a definition is run against an
 * AccountIndex and produces a populated table, so the same definition serves
 * IFRS, GRAP and the Modified Cash Standard.
 *
 * Where the ledger cannot answer — how much of the movement in an asset class
 * was an addition rather than a disposal — the row is created anyway and marked
 * manual. Leaving it out would hide a disclosure the framework requires; filling
 * it in would be inventing a figure.
 */
import { AccountIndex, ACCUMULATED_DEPRECIATION, ALLOWANCE, type AccountRow } from './accountIndex';
import {
  label,
  MONEY,
  type Cell,
  type DisclosureColumn,
  type DisclosureRow,
  type GeneratedDisclosure,
  type GeneratedTable,
} from './types';

export type BuildContext = {
  index: AccountIndex;
  currentLabel: string;
  priorLabel: string;
  withComparatives: boolean;
};

export type DisclosureDefinition = {
  code: string;
  title: string;
  /** Framework keys this applies to; absent means all of them. */
  frameworks?: string[];
  applies(ctx: BuildContext): boolean;
  reason(ctx: BuildContext): string;
  narrative(ctx: BuildContext): string[];
  tables(ctx: BuildContext): GeneratedTable[];
};

// ── helpers ────────────────────────────────────────────────────────────────

function columns(ctx: BuildContext, firstHeading = ''): DisclosureColumn[] {
  const cols: DisclosureColumn[] = [{ label: firstHeading, align: 'left', width: 240 }];
  cols.push({ label: ctx.currentLabel, align: 'right', basis: 'closing', width: 120 });
  if (ctx.withComparatives) {
    cols.push({ label: ctx.priorLabel, align: 'right', basis: 'prior', width: 120 });
  }
  return cols;
}

/** A row whose figures are drawn from the accounts, one column per period. */
function linkedRow(
  ctx: BuildContext,
  text: string,
  filter: Parameters<AccountIndex['total']>[0],
  opts: { indent?: number; sign?: 1 | -1; kind?: DisclosureRow['kind']; key?: string } = {},
): DisclosureRow {
  const sign = opts.sign ?? 1;
  const current = ctx.index.total(filter, 'closing');
  const cells: Cell[] = [
    label(text, { indent: opts.indent }),
    {
      value: sign * current.amount,
      origin: 'linked',
      format: MONEY,
      source: current.source,
    },
  ];
  if (ctx.withComparatives) {
    const prior = ctx.index.total(filter, 'prior');
    cells.push({ value: sign * prior.amount, origin: 'linked', format: MONEY, source: prior.source });
  }
  return { cells, kind: opts.kind, key: opts.key ?? text };
}

/** A row the preparer must complete, created because the framework asks for it. */
function manualRow(ctx: BuildContext, text: string, indent?: number): DisclosureRow {
  const cells: Cell[] = [label(text, { indent })];
  const blank: Cell = { value: null, origin: 'manual', format: MONEY };
  cells.push({ ...blank });
  if (ctx.withComparatives) cells.push({ ...blank });
  return { cells, key: text };
}

/**
 * A total of the rows above it. Computed here so the table is right on arrival,
 * and marked calculated so the editor keeps it right afterwards.
 */
function totalRow(
  ctx: BuildContext,
  text: string,
  rows: DisclosureRow[],
  formula: string,
  kind: DisclosureRow['kind'] = 'total',
): DisclosureRow {
  const columnCount = ctx.withComparatives ? 2 : 1;
  const cells: Cell[] = [label(text, { bold: true })];
  for (let c = 1; c <= columnCount; c += 1) {
    const sum = rows.reduce((acc, r) => {
      const v = r.cells[c]?.value;
      return acc + (typeof v === 'number' ? v : 0);
    }, 0);
    cells.push({
      value: sum,
      origin: 'calculated',
      formula,
      sums: rows.map((r) => r.key).filter((k): k is string => !!k),
      format: {
        ...MONEY,
        bold: true,
        borderTop: true,
        doubleBottom: kind === 'total',
        borderBottom: kind === 'subtotal',
      },
    });
  }
  return { cells, kind, key: text };
}

function spacer(ctx: BuildContext): DisclosureRow {
  const width = ctx.withComparatives ? 3 : 2;
  return {
    kind: 'spacer',
    cells: Array.from({ length: width }, () => ({ value: null, origin: 'manual' as const })),
  };
}

function headerRow(ctx: BuildContext, text: string): DisclosureRow {
  const width = ctx.withComparatives ? 3 : 2;
  const cells: Cell[] = [label(text, { bold: true })];
  for (let i = 1; i < width; i += 1) cells.push({ value: null, origin: 'manual' });
  return { cells, kind: 'header', key: text };
}

/** Asset classes within a subcategory, excluding its contra account. */
function classesOf(index: AccountIndex, subcategory: string, contra: RegExp): AccountRow[] {
  return index
    .find({ subcategory, nameExcludes: contra })
    .filter((a) => a.closing !== 0 || a.prior !== 0)
    .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));
}

// ── definitions ────────────────────────────────────────────────────────────

const PPE: DisclosureDefinition = {
  code: 'DISC.PPE',
  title: 'Property, plant and equipment',
  applies: (ctx) => ctx.index.any({ subcategory: 'Property, Plant and Equipment' }),
  reason: () => 'The company holds property, plant and equipment.',
  narrative: () => [
    'Property, plant and equipment is measured at cost less accumulated depreciation and any accumulated impairment losses. Depreciation is recognised on the straight-line basis over the estimated useful life of each class of asset.',
    'The carrying amount of each class of property, plant and equipment is reconciled below.',
  ],
  tables: (ctx) => {
    const classes = classesOf(ctx.index, 'Property, Plant and Equipment', ACCUMULATED_DEPRECIATION);

    // Carrying amount by class.
    const costRows = classes.map((a) =>
      linkedRow(ctx, a.name, { subcategory: 'Property, Plant and Equipment', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `cost:${a.name}` }),
    );
    const cost = totalRow(ctx, 'Cost', costRows, 'Sum of the cost of each class', 'subtotal');
    const depreciation = linkedRow(
      ctx,
      'Accumulated depreciation',
      { subcategory: 'Property, Plant and Equipment', nameMatches: ACCUMULATED_DEPRECIATION },
      { key: 'accumulated-depreciation' },
    );
    const carrying = totalRow(
      ctx,
      'Carrying amount',
      [cost, depreciation],
      'Cost less accumulated depreciation',
    );

    const carryingTable: GeneratedTable = {
      code: 'PPE.CARRYING',
      title: 'Carrying amount',
      columns: columns(ctx),
      rows: [...costRows, cost, depreciation, carrying],
    };

    // Movement for the year. Opening and closing come from the two balance
    // dates; the depreciation charge is the movement on the contra account.
    // Additions and disposals cannot be separated from a net movement, so they
    // are offered as rows to complete rather than guessed at.
    const opening = ctx.index.total({ subcategory: 'Property, Plant and Equipment' }, 'prior');
    const closing = ctx.index.total({ subcategory: 'Property, Plant and Equipment' }, 'closing');
    const charge = ctx.index.total(
      { subcategory: 'Property, Plant and Equipment', nameMatches: ACCUMULATED_DEPRECIATION },
      'activity',
    );

    const movementCols: DisclosureColumn[] = [
      { label: '', align: 'left', width: 240 },
      { label: ctx.currentLabel, align: 'right', basis: 'closing', width: 120 },
    ];
    const movementRows: DisclosureRow[] = [
      {
        key: 'opening',
        cells: [
          label('Carrying amount at the beginning of the year'),
          { value: opening.amount, origin: 'linked', format: MONEY, source: opening.source },
        ],
      },
      { key: 'additions', cells: [label('Additions', { indent: 1 }), { value: null, origin: 'manual', format: MONEY }] },
      { key: 'disposals', cells: [label('Disposals', { indent: 1 }), { value: null, origin: 'manual', format: MONEY }] },
      {
        key: 'depreciation',
        cells: [
          label('Depreciation charge for the year', { indent: 1 }),
          { value: charge.amount, origin: 'linked', format: MONEY, source: charge.source },
        ],
      },
      { key: 'impairment', cells: [label('Impairment losses', { indent: 1 }), { value: null, origin: 'manual', format: MONEY }] },
      { key: 'revaluations', cells: [label('Revaluations', { indent: 1 }), { value: null, origin: 'manual', format: MONEY }] },
      {
        key: 'closing',
        kind: 'total',
        cells: [
          label('Carrying amount at the end of the year', { bold: true }),
          {
            value: closing.amount,
            origin: 'linked',
            format: { ...MONEY, bold: true, borderTop: true, doubleBottom: true },
            source: closing.source,
          },
        ],
      },
    ];

    return [
      carryingTable,
      {
        code: 'PPE.MOVEMENT',
        title: 'Reconciliation of carrying amount',
        columns: movementCols,
        rows: movementRows,
        footnote:
          'Opening and closing carrying amounts and the depreciation charge are taken from the accounting records. Additions and disposals are shown separately where the entity records them as such.',
      },
    ];
  },
};

const INTANGIBLES: DisclosureDefinition = {
  code: 'DISC.INTANGIBLES',
  title: 'Intangible assets',
  applies: (ctx) => ctx.index.any({ subcategory: 'Intangible Assets' }),
  reason: () => 'The company holds intangible assets.',
  narrative: () => [
    'Intangible assets are measured at cost less accumulated amortisation and any accumulated impairment losses. Amortisation is recognised on the straight-line basis over the estimated useful life of the asset.',
  ],
  tables: (ctx) => {
    const classes = classesOf(ctx.index, 'Intangible Assets', ACCUMULATED_DEPRECIATION);
    const rows = classes.map((a) =>
      linkedRow(ctx, a.name, { subcategory: 'Intangible Assets', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `cost:${a.name}` }),
    );
    const amortisation = linkedRow(
      ctx,
      'Accumulated amortisation',
      { subcategory: 'Intangible Assets', nameMatches: ACCUMULATED_DEPRECIATION },
      { key: 'accumulated-amortisation' },
    );
    return [
      {
        code: 'INTANGIBLES.CARRYING',
        title: 'Carrying amount',
        columns: columns(ctx),
        rows: [...rows, amortisation, totalRow(ctx, 'Carrying amount', [...rows, amortisation], 'Cost less accumulated amortisation')],
      },
    ];
  },
};

const RECEIVABLES: DisclosureDefinition = {
  code: 'DISC.RECEIVABLES',
  title: 'Trade and other receivables',
  applies: (ctx) => ctx.index.any({ subcategory: 'Trade and Other Receivables' }),
  reason: () => 'The company holds trade and other receivables.',
  narrative: () => [
    'Trade and other receivables are measured at amortised cost less any allowance for amounts considered irrecoverable.',
  ],
  tables: (ctx) => {
    const gross = ctx.index
      .find({ subcategory: 'Trade and Other Receivables', nameExcludes: ALLOWANCE })
      .filter((a) => a.closing !== 0 || a.prior !== 0)
      .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));

    const grossRows = gross.map((a) =>
      linkedRow(ctx, a.name, { subcategory: 'Trade and Other Receivables', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `gross:${a.name}` }),
    );
    const grossTotal = totalRow(ctx, 'Gross receivables', grossRows, 'Sum of receivable accounts', 'subtotal');
    const allowance = linkedRow(
      ctx,
      'Allowance for doubtful debts',
      { subcategory: 'Trade and Other Receivables', nameMatches: ALLOWANCE },
      { key: 'allowance' },
    );
    return [
      {
        code: 'RECEIVABLES.ANALYSIS',
        title: 'Trade and other receivables',
        columns: columns(ctx),
        rows: [
          ...grossRows,
          grossTotal,
          allowance,
          totalRow(ctx, 'Net receivables', [grossTotal, allowance], 'Gross receivables less the allowance'),
        ],
      },
    ];
  },
};

const PAYABLES: DisclosureDefinition = {
  code: 'DISC.PAYABLES',
  title: 'Trade and other payables',
  applies: (ctx) =>
    ctx.index.any({ subcategory: ['Trade and Other Payables', 'Statutory Payables', 'Related-party Payables'] }),
  reason: () => 'The company owes trade, statutory or related-party payables.',
  narrative: () => [
    'Trade and other payables are measured at amortised cost. Statutory amounts owing are shown separately.',
  ],
  tables: (ctx) => {
    const subs = ['Trade and Other Payables', 'Statutory Payables', 'Related-party Payables'].filter(
      (s) => ctx.index.any({ subcategory: s }),
    );
    const rows: DisclosureRow[] = [];
    const totals: DisclosureRow[] = [];
    for (const sub of subs) {
      const accounts = ctx.index
        .find({ subcategory: sub })
        .filter((a) => a.closing !== 0 || a.prior !== 0)
        .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));
      if (accounts.length === 0) continue;
      if (subs.length > 1) rows.push(headerRow(ctx, sub));
      for (const a of accounts) {
        const r = linkedRow(ctx, a.name, { subcategory: sub, nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `${sub}:${a.name}` });
        rows.push(r);
        totals.push(r);
      }
    }
    rows.push(totalRow(ctx, 'Total trade and other payables', totals, 'Sum of the payable accounts'));
    return [{ code: 'PAYABLES.ANALYSIS', title: 'Trade and other payables', columns: columns(ctx), rows }];
  },
};

const CASH: DisclosureDefinition = {
  code: 'DISC.CASH',
  title: 'Cash and cash equivalents',
  applies: (ctx) => ctx.index.any({ subcategory: 'Cash and Cash Equivalents' }),
  reason: () => 'The company holds cash and cash equivalents.',
  narrative: () => [
    'Cash and cash equivalents comprise cash on hand and balances with banks, and are measured at amortised cost.',
  ],
  tables: (ctx) => {
    const accounts = ctx.index
      .find({ subcategory: 'Cash and Cash Equivalents' })
      .filter((a) => a.closing !== 0 || a.prior !== 0)
      .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));
    const rows = accounts.map((a) =>
      linkedRow(ctx, a.name, { subcategory: 'Cash and Cash Equivalents', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `cash:${a.name}` }),
    );
    return [
      {
        code: 'CASH.ANALYSIS',
        title: 'Cash and cash equivalents',
        columns: columns(ctx),
        rows: [...rows, totalRow(ctx, 'Cash and cash equivalents', rows, 'Sum of the cash accounts')],
      },
    ];
  },
};

const BORROWINGS: DisclosureDefinition = {
  code: 'DISC.BORROWINGS',
  title: 'Interest-bearing borrowings',
  applies: (ctx) => ctx.index.any({ subcategory: 'Interest-bearing Borrowings' }),
  reason: () => 'The company has interest-bearing borrowings.',
  narrative: () => [
    'Interest-bearing borrowings are measured at amortised cost. Amounts falling due within twelve months of the reporting date are presented as current liabilities.',
  ],
  tables: (ctx) => {
    const accounts = ctx.index
      .find({ subcategory: 'Interest-bearing Borrowings' })
      .filter((a) => a.closing !== 0 || a.prior !== 0)
      .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));
    const rows = accounts.map((a) =>
      linkedRow(ctx, a.name, { subcategory: 'Interest-bearing Borrowings', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `borrowing:${a.name}` }),
    );
    const total = totalRow(ctx, 'Total borrowings', rows, 'Sum of the borrowing accounts');

    const opening = ctx.index.total({ subcategory: 'Interest-bearing Borrowings' }, 'prior');
    const closing = ctx.index.total({ subcategory: 'Interest-bearing Borrowings' }, 'closing');
    const movement: GeneratedTable = {
      code: 'BORROWINGS.MOVEMENT',
      title: 'Movement in borrowings',
      columns: [
        { label: '', align: 'left', width: 240 },
        { label: ctx.currentLabel, align: 'right', basis: 'closing', width: 120 },
      ],
      rows: [
        {
          key: 'opening',
          cells: [label('Balance at the beginning of the year'), { value: opening.amount, origin: 'linked', format: MONEY, source: opening.source }],
        },
        { key: 'raised', cells: [label('Borrowings raised', { indent: 1 }), { value: null, origin: 'manual', format: MONEY }] },
        { key: 'repaid', cells: [label('Repayments', { indent: 1 }), { value: null, origin: 'manual', format: MONEY }] },
        { key: 'interest', cells: [label('Interest accrued', { indent: 1 }), { value: null, origin: 'manual', format: MONEY }] },
        {
          key: 'closing',
          kind: 'total',
          cells: [
            label('Balance at the end of the year', { bold: true }),
            { value: closing.amount, origin: 'linked', format: { ...MONEY, bold: true, borderTop: true, doubleBottom: true }, source: closing.source },
          ],
        },
      ],
    };

    return [
      { code: 'BORROWINGS.ANALYSIS', title: 'Borrowings', columns: columns(ctx), rows: [...rows, total] },
      movement,
    ];
  },
};

const INVENTORIES: DisclosureDefinition = {
  code: 'DISC.INVENTORIES',
  title: 'Inventories',
  applies: (ctx) => ctx.index.any({ subcategory: 'Inventory' }),
  reason: () => 'The company holds inventory.',
  narrative: () => [
    'Inventories are measured at the lower of cost and net realisable value.',
  ],
  tables: (ctx) => {
    const accounts = ctx.index.find({ subcategory: 'Inventory' }).filter((a) => a.closing !== 0 || a.prior !== 0);
    const rows = accounts.map((a) =>
      linkedRow(ctx, a.name, { subcategory: 'Inventory', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `inv:${a.name}` }),
    );
    return [
      {
        code: 'INVENTORIES.ANALYSIS',
        title: 'Inventories',
        columns: columns(ctx),
        rows: [
          ...rows,
          totalRow(ctx, 'Total inventories', rows, 'Sum of the inventory accounts', 'subtotal'),
          manualRow(ctx, 'Write-down to net realisable value recognised as an expense', 1),
        ],
      },
    ];
  },
};

const REVENUE: DisclosureDefinition = {
  code: 'DISC.REVENUE',
  title: 'Revenue',
  applies: (ctx) => ctx.index.any({ category: 'Revenue' }),
  reason: () => 'The company earned revenue during the period.',
  narrative: () => [
    'Revenue is measured at the fair value of the consideration received or receivable, net of value added tax, discounts and returns. Revenue is disaggregated below by category.',
  ],
  tables: (ctx) => {
    const accounts = ctx.index
      .find({ category: 'Revenue' })
      .filter((a) => a.closing !== 0 || a.prior !== 0)
      .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));
    const rows = accounts.map((a) =>
      linkedRow(ctx, a.name, { category: 'Revenue', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `rev:${a.name}` }),
    );
    return [
      {
        code: 'REVENUE.DISAGGREGATION',
        title: 'Revenue',
        columns: columns(ctx),
        rows: [...rows, totalRow(ctx, 'Total revenue', rows, 'Sum of the revenue accounts')],
      },
    ];
  },
};

const OTHER_INCOME: DisclosureDefinition = {
  code: 'DISC.OTHERINCOME',
  title: 'Other income',
  applies: (ctx) => ctx.index.any({ category: 'Other Income' }),
  reason: () => 'The company earned income outside its principal activity.',
  narrative: () => ['Other income comprises amounts earned outside the ordinary course of trading.'],
  tables: (ctx) => {
    const accounts = ctx.index
      .find({ category: 'Other Income' })
      .filter((a) => a.closing !== 0 || a.prior !== 0)
      .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));
    const rows = accounts.map((a) =>
      linkedRow(ctx, a.name, { category: 'Other Income', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `oi:${a.name}` }),
    );
    return [
      {
        code: 'OTHERINCOME.ANALYSIS',
        title: 'Other income',
        columns: columns(ctx),
        rows: [...rows, totalRow(ctx, 'Total other income', rows, 'Sum of the other income accounts')],
      },
    ];
  },
};

const EMPLOYEE_COSTS: DisclosureDefinition = {
  code: 'DISC.EMPLOYEE',
  title: 'Employee costs',
  applies: (ctx) => ctx.index.any({ subcategory: 'Employee Costs' }),
  reason: () => 'The company incurred employee costs.',
  narrative: () => [
    'Employee costs comprise salaries, wages and the related statutory and benefit contributions recognised during the period.',
  ],
  tables: (ctx) => {
    const accounts = ctx.index
      .find({ subcategory: 'Employee Costs' })
      .filter((a) => a.closing !== 0 || a.prior !== 0)
      .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));
    const rows = accounts.map((a) =>
      linkedRow(ctx, a.name, { subcategory: 'Employee Costs', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `emp:${a.name}` }),
    );
    return [
      {
        code: 'EMPLOYEE.ANALYSIS',
        title: 'Employee costs',
        columns: columns(ctx),
        rows: [
          ...rows,
          totalRow(ctx, 'Total employee costs', rows, 'Sum of the employee cost accounts', 'subtotal'),
          manualRow(ctx, 'Average number of employees during the year', 1),
        ],
      },
    ];
  },
};

const OPERATING_EXPENSES: DisclosureDefinition = {
  code: 'DISC.OPERATINGEXPENSES',
  title: 'Operating expenses',
  applies: (ctx) => ctx.index.any({ category: 'Operating Expenses' }),
  reason: () => 'The company incurred operating expenses.',
  narrative: () => [
    'Operating expenses recognised in arriving at the result for the period are set out below.',
  ],
  tables: (ctx) => {
    const accounts = ctx.index
      .find({ category: 'Operating Expenses', subcategory: undefined })
      .filter((a) => (a.closing !== 0 || a.prior !== 0) && a.subcategory !== 'Employee Costs')
      .sort((a, b) => Math.abs(b.closing) - Math.abs(a.closing));
    const rows = accounts.map((a) =>
      linkedRow(ctx, a.name, { category: 'Operating Expenses', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `opex:${a.name}` }),
    );
    return [
      {
        code: 'OPEX.ANALYSIS',
        title: 'Operating expenses',
        columns: columns(ctx),
        rows: [...rows, totalRow(ctx, 'Total operating expenses', rows, 'Sum of the operating expense accounts')],
      },
    ];
  },
};

const COST_OF_SALES: DisclosureDefinition = {
  code: 'DISC.COSTOFSALES',
  title: 'Cost of sales',
  applies: (ctx) => ctx.index.any({ category: 'Cost of Sales' }),
  reason: () => 'The company incurred cost of sales.',
  narrative: () => ['Cost of sales comprises the direct costs of goods sold and services rendered.'],
  tables: (ctx) => {
    const accounts = ctx.index
      .find({ category: 'Cost of Sales' })
      .filter((a) => a.closing !== 0 || a.prior !== 0)
      .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));
    const rows = accounts.map((a) =>
      linkedRow(ctx, a.name, { category: 'Cost of Sales', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `cos:${a.name}` }),
    );
    return [
      {
        code: 'COSTOFSALES.ANALYSIS',
        title: 'Cost of sales',
        columns: columns(ctx),
        rows: [...rows, totalRow(ctx, 'Total cost of sales', rows, 'Sum of the cost of sales accounts')],
      },
    ];
  },
};

const PROVISIONS: DisclosureDefinition = {
  code: 'DISC.PROVISIONS',
  title: 'Provisions',
  applies: (ctx) => ctx.index.any({ subcategory: 'Provisions' }),
  reason: () => 'The company carries provisions.',
  narrative: () => [
    'A provision is recognised when the entity has a present obligation arising from a past event, it is probable that an outflow of resources will be required, and the amount can be estimated reliably.',
  ],
  tables: (ctx) => {
    const accounts = ctx.index.find({ subcategory: 'Provisions' }).filter((a) => a.closing !== 0 || a.prior !== 0);
    const rows = accounts.map((a) =>
      linkedRow(ctx, a.name, { subcategory: 'Provisions', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `prov:${a.name}` }),
    );
    return [
      {
        code: 'PROVISIONS.ANALYSIS',
        title: 'Provisions',
        columns: columns(ctx),
        rows: [...rows, totalRow(ctx, 'Total provisions', rows, 'Sum of the provision accounts')],
      },
    ];
  },
};

const EQUITY: DisclosureDefinition = {
  code: 'DISC.SHARECAPITAL',
  title: 'Share capital and reserves',
  applies: (ctx) => ctx.index.any({ category: 'Equity' }),
  reason: () => 'The company has issued capital or holds reserves.',
  narrative: () => [
    'Issued capital and reserves are stated below. Distributions to owners are recognised directly in equity.',
  ],
  tables: (ctx) => {
    const subs = ['Issued Capital', 'Reserves', 'Distributions'].filter((s) =>
      ctx.index.any({ subcategory: s }),
    );
    const rows = subs.map((s) => linkedRow(ctx, s, { subcategory: s }, { indent: 1, key: `eq:${s}` }));
    return [
      {
        code: 'EQUITY.ANALYSIS',
        title: 'Share capital and reserves',
        columns: columns(ctx),
        rows: [...rows, totalRow(ctx, 'Total equity', rows, 'Sum of issued capital, reserves and distributions')],
      },
    ];
  },
};

/** Escape a ledger account name for use inside a RegExp. */
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const DISCLOSURE_DEFINITIONS: DisclosureDefinition[] = [
  PPE,
  INTANGIBLES,
  INVENTORIES,
  RECEIVABLES,
  CASH,
  EQUITY,
  BORROWINGS,
  PAYABLES,
  PROVISIONS,
  REVENUE,
  OTHER_INCOME,
  COST_OF_SALES,
  EMPLOYEE_COSTS,
  OPERATING_EXPENSES,
];

/** Build every disclosure the company's accounting data supports. */
export function generateDisclosures(ctx: BuildContext): GeneratedDisclosure[] {
  const out: GeneratedDisclosure[] = [];
  for (const def of DISCLOSURE_DEFINITIONS) {
    if (!def.applies(ctx)) continue;
    const tables = def.tables(ctx).filter((t) => t.rows.length > 0);
    if (tables.length === 0) continue;
    out.push({
      code: def.code,
      title: def.title,
      narrative: def.narrative(ctx),
      tables,
      reason: def.reason(ctx),
    });
  }
  return out;
}
