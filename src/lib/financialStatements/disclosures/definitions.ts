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
import {
  AccountIndex,
  ACCUMULATED_DEPRECIATION,
  ALLOWANCE,
  type AccountFilter,
  type AccountRow,
  type FinancialFacts,
  type PayrollYear,
} from './accountIndex';
import {
  label,
  MONEY,
  type Cell,
  type CellFormat,
  type CellSource,
  type DisclosureColumn,
  type DisclosureRow,
  type GeneratedDisclosure,
  type GeneratedTable,
} from './types';

/** What the engagement records about the entity, where a note needs it. */
export type EntityParticulars = {
  registeredName?: string | null;
  countryOfIncorporation?: string | null;
  registeredOffice?: string | null;
  natureOfBusiness?: string | null;
  entityType?: string | null;
  shares?: {
    share_class?: string;
    authorised_shares?: number;
    issued_shares?: number;
    issued_shares_prior?: number;
    par_value?: number;
  } | null;
};

export type BuildContext = {
  index: AccountIndex;
  currentLabel: string;
  priorLabel: string;
  withComparatives: boolean;
  entity?: EntityParticulars | null;
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
  /**
   * The note is stated entirely from the company's data: the framework's
   * generic wording for it does not print, even when the engine has no
   * narrative of its own (a published note of figures carries none).
   */
  ownsNarrative?: boolean;
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
  opts: {
    indent?: number;
    sign?: 1 | -1;
    kind?: DisclosureRow['kind'];
    key?: string;
    /** An income or expense line: this year's figure is the year's movement. */
    flow?: boolean;
  } = {},
): DisclosureRow {
  const sign = opts.sign ?? 1;
  const current = ctx.index.total(filter, opts.flow ? 'period' : 'closing');
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
    if (opts.flow && !ctx.index.hasPriorFlows) {
      // Last year's revenue or expense is last year's movement. A seal without
      // it leaves the figure blank; the running balance is not last year.
      cells.push({ value: null, origin: 'linked', format: MONEY });
    } else {
      const prior = ctx.index.total(filter, opts.flow ? 'priorPeriod' : 'prior');
      cells.push({ value: sign * prior.amount, origin: 'linked', format: MONEY, source: prior.source });
    }
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
    const figures = rows.map((r) => r.cells[c]?.value).filter((v): v is number => typeof v === 'number');
    // A total of nothing stated is not stated either — never a nil.
    const sum = figures.length ? figures.reduce((acc, v) => acc + v, 0) : null;
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

// ── property, plant and equipment from the register ────────────────────────

const isContra = (a: AccountRow) =>
  String(a.account_role || '').toLowerCase() === 'accumulated_depreciation' ||
  ACCUMULATED_DEPRECIATION.test(a.name);

const money = (value: number | null, source?: CellSource): Cell => ({
  value,
  origin: 'linked',
  format: MONEY,
  ...(source ? { source } : {}),
});
const round = (v: number) => Math.round(v * 100) / 100;
/** A total the editor keeps right: the sum of the rows it names. */
const summed = (value: number, sums: string[]): Cell => ({
  value,
  origin: 'calculated',
  formula: 'Sum of the classes above',
  sums,
  format: { ...MONEY, bold: true },
});

/**
 * The note as a published set states it — cost, accumulated depreciation and
 * carrying value by class for both years, and a reconciliation of each
 * year's carrying amount by class: opening, additions, disposals,
 * depreciation, closing.
 *
 * Cost and its movements come from the ledger (each class is a cost account;
 * additions are its debits, disposals its credits). The split of accumulated
 * depreciation by class comes from the fixed asset register's recorded
 * depreciation runs — and only when the register agrees with the ledger's
 * accumulated depreciation control account in both years. When it does not,
 * or the seal carries no register or gross movements, this returns null and
 * the note falls back to what the ledger alone can support.
 */
function ppeFromRegister(ctx: BuildContext): GeneratedTable[] | null {
  const { index } = ctx;
  const register = index.register;
  const start = index.period?.start_date;
  const end = index.period?.end_date;
  const priorEnd = index.period?.prior_as_of;
  const priorStart = index.period?.prior_start_date;
  if (!register?.length || !index.hasGross || !start || !end || !priorEnd) return null;

  const accounts = index.find({ subcategory: 'Property, Plant and Equipment' });
  const classes = accounts
    .filter((a) => !isContra(a))
    .filter((a) => a.closing !== 0 || a.prior !== 0)
    .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));
  const contra = accounts.filter(isContra);
  if (!classes.length) return null;

  // Accumulated depreciation by class, from the register, to a date.
  const chargedTo = (classId: string, from: string | null, to: string) =>
    register
      .filter((asset) => asset.asset_account_id === classId)
      .flatMap((asset) => asset.events)
      .filter((e) => e.type === 'depreciated' && e.as_of <= to && (from == null || e.as_of > from))
      .reduce((sum, e) => sum + e.amount, 0);
  const accumAt = (classId: string, to: string) => chargedTo(classId, null, to);

  // Where each figure comes from, for the reviewer: the class's ledger
  // account for cost and its movements; the register assets whose recorded
  // depreciation runs make up accumulated depreciation and the charge.
  const accountSource = (c: AccountRow, amount: number, basis: CellSource['basis']): CellSource => ({
    basis,
    accounts: [{ id: c.id, code: c.account_code ?? (c.account_number != null ? String(c.account_number) : null), name: c.name, amount }],
  });
  const registerSource = (classId: string, from: string | null, to: string, basis: CellSource['basis']): CellSource => ({
    basis,
    accounts: register
      .filter((asset) => asset.asset_account_id === classId)
      .map((asset) => ({
        id: asset.id,
        code: asset.asset_code ?? null,
        name: asset.description || asset.asset_code || 'Asset',
        amount: -round(
          asset.events
            .filter((e) => e.type === 'depreciated' && e.as_of <= to && (from == null || e.as_of > from))
            .reduce((s2, e) => s2 + e.amount, 0),
        ),
      }))
      .filter((a) => a.amount !== 0),
  });

  // The register must agree with the ledger's control account, both years.
  const ledgerAccumNow = -contra.reduce((s, a) => s + a.closing, 0);
  const ledgerAccumThen = -contra.reduce((s, a) => s + a.prior, 0);
  const regAccumNow = classes.reduce((s, c) => s + accumAt(c.id, end), 0);
  const regAccumThen = classes.reduce((s, c) => s + accumAt(c.id, priorEnd), 0);
  if (Math.abs(regAccumNow - ledgerAccumNow) > 0.5 || Math.abs(regAccumThen - ledgerAccumThen) > 0.5) {
    return null;
  }

  const years = [
    { label: ctx.currentLabel, cost: (c: AccountRow) => c.closing, to: end },
    ...(ctx.withComparatives ? [{ label: ctx.priorLabel, cost: (c: AccountRow) => c.prior, to: priorEnd }] : []),
  ];

  // Cost, accumulated depreciation and carrying value, by class, per year.
  const matrixRows: DisclosureRow[] = [];
  for (const y of years) {
    const blank = (): Cell => ({ value: null, origin: 'manual' });
    matrixRows.push({ kind: 'header', key: `m:${y.label}`, cells: [label(y.label), blank(), blank(), blank()] });
    let cost = 0;
    let accum = 0;
    const keys: string[] = [];
    for (const c of classes) {
      const k = y.cost(c);
      const d = round(accumAt(c.id, y.to));
      if (k === 0 && d === 0) continue;
      cost += k;
      accum += d;
      const key = `m:${y.label}:${c.name}`;
      keys.push(key);
      const basis: CellSource['basis'] = y.to === end ? 'closing' : 'prior';
      const costSource = accountSource(c, k, basis);
      const accumSource = registerSource(c.id, null, y.to, basis);
      matrixRows.push({
        key,
        cells: [
          label(c.name),
          money(k, costSource),
          money(-d, accumSource),
          money(round(k - d), { basis, accounts: [...costSource.accounts, ...accumSource.accounts] }),
        ],
      });
    }
    matrixRows.push({
      key: `m:${y.label}:total`,
      kind: 'total',
      cells: [
        label('Total', { bold: true }),
        summed(round(cost), keys),
        summed(round(-accum), keys),
        summed(round(cost - accum), keys),
      ],
    });
  }

  // Reconciliation of each year's carrying amount, by class.
  const recon = (
    title: string,
    code: string,
    periodStart: string | null,
    periodEnd: string,
    openingCost: (c: AccountRow) => number,
    closingCost: (c: AccountRow) => number,
    debits: (c: AccountRow) => number,
    credits: (c: AccountRow) => number,
  ): GeneratedTable | null => {
    const openingDate = periodStart ? dayBefore(periodStart) : null;
    const rows: DisclosureRow[] = [];
    const totals = [0, 0, 0, 0, 0];
    let anyDisposal = false;
    for (const c of classes) {
      const openAccum = openingDate ? accumAt(c.id, openingDate) : 0;
      const opening = round(openingCost(c) - openAccum);
      const additions = round(debits(c));
      const disposals = round(-credits(c));
      const depreciation = round(-chargedTo(c.id, openingDate, periodEnd));
      const closing = round(closingCost(c) - accumAt(c.id, periodEnd));
      if ([opening, additions, disposals, depreciation, closing].every((v) => v === 0)) continue;
      if (disposals !== 0) anyDisposal = true;
      [opening, additions, disposals, depreciation, closing].forEach((v, i) => (totals[i] += v));
      rows.push({
        key: `${code}:${c.name}`,
        cells: [
          label(c.name),
          money(opening),
          money(additions, accountSource(c, additions, 'activity')),
          money(disposals, accountSource(c, disposals, 'activity')),
          money(depreciation, registerSource(c.id, openingDate, periodEnd, 'activity')),
          money(closing),
        ],
      });
    }
    if (!rows.length) return null;
    const classKeys = rows.map((r) => r.key!).filter(Boolean);
    rows.push({
      key: `${code}:total`,
      kind: 'total',
      cells: [label('', { bold: true }), ...totals.map((t) => summed(round(t), classKeys))],
    });
    const columns: DisclosureColumn[] = [
      { label: '', align: 'left', width: 200 },
      { label: 'Opening balance', align: 'right', width: 80 },
      { label: 'Additions', align: 'right', width: 80 },
      { label: 'Disposals', align: 'right', width: 80 },
      { label: 'Depreciation', align: 'right', width: 80 },
      { label: 'Closing balance', align: 'right', width: 80 },
    ];
    // A disposals column of nothing but dashes is left out.
    const drop = anyDisposal ? -1 : 3;
    return {
      code,
      title,
      columns: columns.filter((_, i) => i !== drop),
      rows: rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== drop) })),
    };
  };

  const tables: GeneratedTable[] = [
    {
      code: 'PPE.MATRIX',
      title: 'Property, plant and equipment',
      columns: [
        { label: '', align: 'left', width: 200 },
        { label: 'Cost', align: 'right', width: 90 },
        { label: 'Accumulated depreciation', align: 'right', width: 90 },
        { label: 'Carrying value', align: 'right', width: 90 },
      ],
      rows: matrixRows,
    },
  ];
  const current = recon(
    `Reconciliation of property, plant and equipment - ${ctx.currentLabel}`,
    'PPE.RECON.CURRENT',
    start,
    end,
    (c) => c.prior,
    (c) => c.closing,
    (c) => c.debits,
    (c) => c.credits,
  );
  if (current) tables.push(current);
  if (ctx.withComparatives && priorStart && index.hasPriorGross) {
    const prior = recon(
      `Reconciliation of property, plant and equipment - ${ctx.priorLabel}`,
      'PPE.RECON.PRIOR',
      priorStart,
      priorEnd,
      (c) => c.prior - c.priorActivity,
      (c) => c.prior,
      (c) => c.priorDebits,
      (c) => c.priorCredits,
    );
    if (prior) tables.push(prior);
  }
  return tables;
}

/** The ISO date before another. */
function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ── definitions ────────────────────────────────────────────────────────────

const PPE: DisclosureDefinition = {
  code: 'DISC.PPE',
  title: 'Property, plant and equipment',
  ownsNarrative: true,
  applies: (ctx) => ctx.index.any({ subcategory: 'Property, Plant and Equipment' }),
  reason: () => 'The company holds property, plant and equipment.',
  // The measurement basis is the accounting policy's to state; the note is
  // the figures.
  narrative: () => [],
  tables: (ctx) => {
    const fromRegister = ppeFromRegister(ctx);
    if (fromRegister) return fromRegister;
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
  // The note explains the statement line it is referenced from: trade and
  // other payables. Statutory and related-party payables are lines of their
  // own on the statement of financial position.
  applies: (ctx) => ctx.index.any({ subcategory: 'Trade and Other Payables' }),
  reason: () => 'The company owes trade and other payables.',
  narrative: () => ['Trade and other payables are measured at amortised cost.'],
  tables: (ctx) => {
    const subs = ['Trade and Other Payables'].filter((s) => ctx.index.any({ subcategory: s }));
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

    const tables: GeneratedTable[] = [
      { code: 'BORROWINGS.ANALYSIS', title: 'Borrowings', columns: columns(ctx), rows: [...rows, total] },
    ];
    // The movement for the year is the ledger's own: credits raised, debits
    // repaid. Without gross movements in the seal it cannot be split, and is
    // not guessed at.
    if (ctx.index.hasGross) {
      const priorGross = ctx.withComparatives && ctx.index.hasPriorGross;
      const sumOf = (f: (a: AccountRow) => number) => accounts.reduce((s, a) => s + f(a), 0);
      const row = (key: string, text: string, now: number, then: number | null, kind?: DisclosureRow['kind']): DisclosureRow => ({
        key,
        kind,
        cells: [label(text, { bold: kind === 'total' }), money(Math.round(now * 100) / 100), ...(priorGross ? [money(then == null ? null : Math.round(then * 100) / 100)] : [])],
      });
      const cols = priorGross ? columns(ctx) : columns(ctx).slice(0, 2);
      tables.push({
        code: 'BORROWINGS.MOVEMENT',
        title: 'Movement in borrowings',
        columns: cols,
        rows: [
          row('opening', 'Balance at the beginning of the year', sumOf((a) => a.prior), sumOf((a) => a.prior - a.priorActivity)),
          row('raised', 'Borrowings raised', sumOf((a) => a.credits), sumOf((a) => a.priorCredits)),
          row('repaid', 'Repayments', -sumOf((a) => a.debits), -sumOf((a) => a.priorDebits)),
          row('closing', 'Balance at the end of the year', sumOf((a) => a.closing), sumOf((a) => a.prior), 'total'),
        ].filter((r) => r.kind === 'total' || r.key === 'opening' || r.cells.slice(1).some((c) => (c.value ?? 0) !== 0)),
      });
    }
    return tables;
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
      linkedRow(ctx, a.name, { category: 'Revenue', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `rev:${a.name}`, flow: true }),
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
      linkedRow(ctx, a.name, { category: 'Other Income', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `oi:${a.name}`, flow: true }),
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
      linkedRow(ctx, a.name, { category: 'Operating Expenses', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `opex:${a.name}`, flow: true }),
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
      linkedRow(ctx, a.name, { category: 'Cost of Sales', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `cos:${a.name}`, flow: true }),
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
  title: 'Share capital',
  ownsNarrative: true,
  applies: (ctx) => ctx.index.any({ subcategory: 'Issued Capital' }),
  reason: () => 'The company has issued share capital.',
  narrative: () => [],
  tables: (ctx) => {
    const shares = ctx.entity?.shares ?? null;
    const shareClass = String(shares?.share_class || 'Ordinary');
    const count = (v: unknown) =>
      Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v).toLocaleString('en-ZA').replace(/,/g, ' ') : null;
    const blank = (text: string, bold = false): DisclosureRow => ({
      key: `text:${text}`,
      kind: bold ? 'header' : undefined,
      cells: [label(text, { bold }), money(null), ...(ctx.withComparatives ? [money(null)] : [])],
    });
    const rows: DisclosureRow[] = [];
    const authorised = count(shares?.authorised_shares);
    if (authorised) {
      rows.push(blank('Authorised', true));
      rows.push({
        ...blank(`${authorised} ${shareClass.toLowerCase()} shares${shares?.par_value ? ` of R${shares.par_value} each` : ''}`),
        kind: 'body',
      });
      rows.push({ kind: 'spacer', cells: [label(''), money(null), ...(ctx.withComparatives ? [money(null)] : [])] });
    }
    rows.push(blank('Issued', true));
    const issued = count(shares?.issued_shares);
    const issuedRow = linkedRow(
      ctx,
      issued ? `${issued} ${shareClass.toLowerCase()} shares` : `${shareClass} share capital`,
      { subcategory: 'Issued Capital' },
      { key: 'issued' },
    );
    rows.push({ ...issuedRow, kind: 'total', key: 'issued' });
    return [{ code: 'SHARECAPITAL.ANALYSIS', title: 'Share capital', columns: columns(ctx), rows }];
  },
};

/** Profit before taxation for a year, from the income and expense accounts. */
function profitBeforeTax(ctx: BuildContext, basis: 'period' | 'priorPeriod'): number {
  const flow = (a: AccountRow) => (basis === 'period' ? a.activity : a.priorActivity);
  const income = ctx.index.find({ type: 'Income' }).reduce((s, a) => s + flow(a), 0);
  const expense = ctx.index
    .find({ type: 'Expense' })
    .filter((a) => String(a.category || '') !== 'Taxation')
    .reduce((s, a) => s + flow(a), 0);
  return Math.round((income - expense) * 100) / 100;
}

const TAXATION: DisclosureDefinition = {
  code: 'DISC.TAX',
  title: 'Taxation',
  ownsNarrative: true,
  applies: (ctx) =>
    ctx.index.find({ category: 'Taxation' }).some((a) => a.activity !== 0 || a.priorActivity !== 0),
  reason: () => 'The company recognised a tax expense.',
  narrative: () => [],
  tables: (ctx) => {
    const accounts = ctx.index
      .find({ category: 'Taxation' })
      .filter((a) => a.activity !== 0 || a.priorActivity !== 0)
      .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));
    const rows = accounts.map((a) =>
      linkedRow(ctx, a.name, { category: 'Taxation', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { key: `tax:${a.name}`, flow: true }),
    );
    const tables: GeneratedTable[] = [
      {
        code: 'TAX.COMPONENTS',
        title: 'Major components of the tax expense',
        columns: columns(ctx),
        rows: [...rows, totalRow(ctx, 'Total taxation', rows, 'Sum of the taxation accounts')],
      },
    ];
    // The reconciliation to the statutory rate is stated only where the rate
    // is known: South African normal tax on companies.
    const country = String(ctx.entity?.countryOfIncorporation || 'South Africa').toLowerCase();
    if (country.includes('south africa')) {
      const RATE = 0.27;
      const priorKnown = ctx.withComparatives && ctx.index.hasPriorFlows;
      const pbtNow = profitBeforeTax(ctx, 'period');
      const pbtThen = priorKnown ? profitBeforeTax(ctx, 'priorPeriod') : null;
      const taxNow = accounts.reduce((s, a) => s + a.activity, 0);
      const taxThen = priorKnown ? accounts.reduce((s, a) => s + a.priorActivity, 0) : null;
      const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
      const line = (key: string, text: string, now: number | null, then: number | null, kind?: DisclosureRow['kind']): DisclosureRow => ({
        key,
        kind,
        cells: [label(text, { bold: kind === 'total' }), money(r2(now)), ...(ctx.withComparatives ? [money(r2(then))] : [])],
      });
      const recon: DisclosureRow[] = [
        line('pbt', 'Accounting profit', pbtNow, pbtThen),
        line('at-rate', 'Tax at the applicable tax rate of 27%', pbtNow * RATE, pbtThen == null ? null : pbtThen * RATE),
      ];
      const otherNow = taxNow - pbtNow * RATE;
      const otherThen = taxThen == null || pbtThen == null ? null : taxThen - pbtThen * RATE;
      if (Math.abs(otherNow) >= 0.5 || (otherThen != null && Math.abs(otherThen) >= 0.5)) {
        recon.push(line('other', 'Tax effect of adjustments on taxable income', otherNow, otherThen));
      }
      recon.push(line('tax-total', 'Taxation', taxNow, taxThen, 'total'));
      tables.push({ code: 'TAX.RECONCILIATION', title: 'Reconciliation of the tax expense', columns: columns(ctx), rows: recon });
    }
    return tables;
  },
};

const FINANCE_COSTS: DisclosureDefinition = {
  code: 'DISC.FINANCECOSTS',
  title: 'Finance costs',
  ownsNarrative: true,
  applies: (ctx) =>
    ctx.index.find({ category: 'Finance Costs' }).some((a) => a.activity !== 0 || a.priorActivity !== 0),
  reason: () => 'The company incurred finance costs.',
  narrative: () => [],
  tables: (ctx) => {
    const accounts = ctx.index
      .find({ category: 'Finance Costs' })
      .filter((a) => a.activity !== 0 || a.priorActivity !== 0)
      .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));
    const rows = accounts.map((a) =>
      linkedRow(ctx, a.name, { category: 'Finance Costs', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { key: `fin:${a.name}`, flow: true }),
    );
    return [
      {
        code: 'FINANCECOSTS.ANALYSIS',
        title: 'Finance costs',
        columns: columns(ctx),
        rows: [...rows, totalRow(ctx, 'Total finance costs', rows, 'Sum of the finance cost accounts')],
      },
    ];
  },
};

/** A liability that holds income tax owed — its movement is tax paid, not working capital. */
const INCOME_TAX_PAYABLE = /income tax|current tax|provisional tax/i;

/**
 * Cash generated from operations, by the indirect method: profit before tax,
 * the non-cash and non-operating items taken out, and the movement in working
 * capital — every figure a movement in the sealed balances. It must equal the
 * cash generated from operations the statement of cash flows reports from the
 * ledger's cash, and readiness checks that it does.
 */
const CASH_GENERATED: DisclosureDefinition = {
  code: 'DISC.CASHFLOW',
  title: 'Cash generated from operations',
  ownsNarrative: true,
  applies: (ctx) => ctx.index.any({ subcategory: 'Cash and Cash Equivalents' }) && ctx.index.rows.some((a) => a.hasActivity),
  reason: () => 'The statement of cash flows reports cash generated from operations.',
  narrative: () => [],
  tables: (ctx) => {
    const priorKnown = ctx.withComparatives && ctx.index.hasPriorFlows;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const now = (f: (a: AccountRow) => number, filter: AccountFilter) => r2(ctx.index.find(filter).reduce((s, a) => s + f(a), 0));
    const closing = (a: AccountRow) => a.closing;
    const prior = (a: AccountRow) => a.prior;
    const opening = (a: AccountRow) => a.prior - a.priorActivity;
    const move = (filter: AccountFilter, keep: (a: AccountRow) => boolean = () => true) => {
      const list = ctx.index.find(filter).filter(keep);
      return [
        r2(list.reduce((s, a) => s + closing(a) - prior(a), 0)),
        r2(list.reduce((s, a) => s + prior(a) - opening(a), 0)),
      ] as const;
    };
    const flowOf = (filter: AccountFilter, keep: (a: AccountRow) => boolean = () => true) => {
      const list = ctx.index.find(filter).filter(keep);
      return [r2(list.reduce((s, a) => s + a.activity, 0)), r2(list.reduce((s, a) => s + a.priorActivity, 0))] as const;
    };
    const isDepreciation = (a: AccountRow) => String(a.account_role || '').toLowerCase() === 'depreciation_expense';
    const notTaxPayable = (a: AccountRow) => !INCOME_TAX_PAYABLE.test(a.name);

    const pbt = [profitBeforeTax(ctx, 'period'), priorKnown ? profitBeforeTax(ctx, 'priorPeriod') : 0] as const;
    const dep = flowOf({ type: 'Expense' }, isDepreciation);
    const otherIncome = flowOf({ category: 'Other Income' });
    const finance = flowOf({ category: 'Finance Costs' });
    const inventory = move({ subcategory: 'Inventory' });
    const receivables = move({ subcategory: 'Trade and Other Receivables' });
    const payables = move({ subcategory: ['Trade and Other Payables', 'Statutory Payables'] }, notTaxPayable);
    const provisions = move({ subcategory: 'Provisions' });

    const row = (key: string, text: string, v: readonly [number, number], kind?: DisclosureRow['kind']): DisclosureRow => ({
      key,
      kind,
      cells: [label(text, { bold: kind === 'header' || kind === 'total' }), money(v[0]), ...(ctx.withComparatives ? [money(priorKnown ? v[1] : null)] : [])],
    });
    const caption = (text: string): DisclosureRow => ({
      key: `cap:${text}`,
      kind: 'header',
      cells: [label(text, { bold: true }), money(null), ...(ctx.withComparatives ? [money(null)] : [])],
    });
    const lines: DisclosureRow[] = [row('pbt', 'Profit before taxation', pbt), caption('Adjustments for:')];
    const adjust = (key: string, text: string, v: readonly [number, number]) => {
      if (v[0] !== 0 || v[1] !== 0) lines.push(row(key, text, v));
    };
    adjust('dep', 'Depreciation and amortisation', dep);
    adjust('oi', 'Interest received', [-otherIncome[0], -otherIncome[1]]);
    adjust('fin', 'Finance costs', finance);
    const wc: DisclosureRow[] = [];
    const change = (key: string, text: string, v: readonly [number, number], sign: 1 | -1) => {
      if (v[0] !== 0 || v[1] !== 0) wc.push(row(key, text, [sign * v[0], sign * v[1]]));
    };
    change('inv', 'Inventories', inventory, -1);
    change('rec', 'Trade and other receivables', receivables, -1);
    // Liabilities are carried credit-positive: an increase is cash retained.
    change('pay', 'Trade and other payables', payables, 1);
    change('prov', 'Provisions', provisions, 1);
    if (wc.length) lines.push(caption('Changes in working capital:'), ...wc);
    const all = lines.filter((l) => l.kind !== 'header');
    const total = [0, 1].map((i) => r2(all.reduce((s, l) => s + Number(l.cells[i + 1]?.value ?? 0), 0))) as [number, number];

    // The reconciliation is stated only when it reconciles: the indirect
    // figure must equal the cash the ledger itself shows generated from
    // operations (its operating cash flows before tax paid). Where accounts
    // the chart has not classified move working capital the indirect method
    // cannot see, the two differ — and a reconciliation that does not
    // reconcile is not printed. Readiness reports the unclassified accounts.
    const ledgerGenerated = (flows: Array<{ section: string; category: string; amount: number }> | null) =>
      flows == null
        ? null
        : r2(
            flows
              .filter((f) => String(f.section) === 'Operating' && !INCOME_TAX_PAYABLE.test(String(f.category)))
              .reduce((s, f) => s + Number(f.amount || 0), 0),
          );
    const ledgerNow = ledgerGenerated(ctx.index.cashFlow);
    const ledgerThen = priorKnown ? ledgerGenerated(ctx.index.priorCashFlow) : null;
    if (ledgerNow == null || Math.abs(ledgerNow - total[0]) > 1) return [];
    if (ledgerThen != null && Math.abs(ledgerThen - total[1]) > 1) return [];

    lines.push(row('cash-generated', 'Cash generated from operations', total, 'total'));
    return [{ code: 'CASHFLOW.CGO', title: 'Cash generated from operations', columns: columns(ctx), rows: lines }];
  },
};

const EVENTS_AFTER_REPORTING: DisclosureDefinition = {
  code: 'DISC.EVENTS',
  title: 'Events after the reporting period',
  applies: (ctx) => ctx.index.rows.length > 0,
  reason: () => 'Every set of annual financial statements addresses events after the reporting date.',
  narrative: () => [
    'The directors are not aware of any material event which occurred after the reporting date and up to the date of this report.',
  ],
  tables: () => [],
};

const GENERAL_INFORMATION: DisclosureDefinition = {
  code: 'DISC.GENERAL',
  title: 'General information',
  applies: (ctx) => !!(ctx.entity?.registeredName || ctx.entity?.natureOfBusiness),
  reason: () => 'The entity is identified in its annual financial statements.',
  narrative: (ctx) => {
    const e = ctx.entity || {};
    const name = e.registeredName || 'The company';
    const country = e.countryOfIncorporation || 'South Africa';
    const kind = /private/i.test(String(e.entityType || '')) || /\(pty\)/i.test(name) ? 'a private company' : 'a company';
    const office = String(e.registeredOffice || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join(', ');
    const nature = String(e.natureOfBusiness || '').trim().replace(/\.$/, '');
    const parts = [`${name} is ${kind} incorporated and domiciled in ${country}.`];
    if (office) parts.push(`The address of its registered office is ${office}.`);
    if (nature) parts.push(`Its principal activities are ${nature.charAt(0).toLowerCase()}${nature.slice(1)}.`);
    return [parts.join(' ')];
  },
  tables: () => [],
};

/**
 * Retained earnings exactly as the balance sheet states them: the retained
 * earnings account plus every period's profit still held in the income and
 * expense accounts. Without it the note's "Total equity" was capital alone and
 * disagreed with the balance sheet it explains.
 */
function retainedEarningsRow(ctx: BuildContext): DisclosureRow | null {
  const reserve = ctx.index.rows.filter((a) => String(a.account_role || '').toLowerCase() === 'retained_earnings');
  const income = ctx.index.find({ type: 'Income' });
  const expense = ctx.index.find({ type: 'Expense' });
  const figure = (basis: 'closing' | 'prior') => {
    const accounts = [
      ...reserve.map((a) => ({ a, v: a[basis] })),
      ...income.map((a) => ({ a, v: a[basis] })),
      ...expense.map((a) => ({ a, v: -a[basis] })),
    ].filter((x) => x.v !== 0);
    return {
      value: accounts.reduce((sum, x) => sum + x.v, 0),
      source: {
        basis,
        accounts: accounts.map(({ a, v }) => ({
          id: a.id,
          code: a.account_code ?? (a.account_number != null ? String(a.account_number) : null),
          name: a.name,
          amount: v,
        })),
      },
    };
  };
  const now = figure('closing');
  const then = figure('prior');
  if (now.value === 0 && then.value === 0) return null;
  const cells: Cell[] = [
    label('Retained earnings', { indent: 1 }),
    { value: now.value, origin: 'linked', format: MONEY, source: now.source as CellSource },
  ];
  if (ctx.withComparatives) {
    cells.push({ value: then.value, origin: 'linked', format: MONEY, source: then.source as CellSource });
  }
  return { cells, key: 'eq:Retained earnings' };
}

/** Escape a ledger account name for use inside a RegExp. */
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── payroll: employee costs, directors, key management, operating profit ───

/**
 * Payroll figures for a year as the notes use them: present only where the seal
 * carries that year's payroll and the ledger's employee costs can hold it (a
 * company whose wages post outside Employee Costs cannot have its note split by
 * payroll — the analysis would not add up to the statement line).
 */
function payrollYears(ctx: BuildContext): { current: PayrollYear | null; prior: PayrollYear | null } {
  const p = ctx.index.payroll;
  const ledger = (basis: 'period' | 'priorPeriod') => ctx.index.total({ subcategory: 'Employee Costs' }, basis).amount;
  const fits = (year: PayrollYear | null | undefined, basis: 'period' | 'priorPeriod') =>
    year && year.payrollCost > 0 && ledger(basis) + 0.5 >= year.payrollCost ? year : null;
  return {
    current: fits(p?.current, 'period'),
    prior: ctx.withComparatives && ctx.index.hasPriorFlows ? fits(p?.prior, 'priorPeriod') : null,
  };
}

/** A figure taken from payroll, traceable to the payslips it summarises. */
function payrollCell(value: number | null, year: PayrollYear | null, what: string): Cell {
  if (value == null || !year) return { value: null, origin: 'linked', format: MONEY };
  return {
    value: round(value),
    origin: 'linked',
    format: MONEY,
    source: { basis: 'activity', accounts: [{ name: `${what}: ${year.payslips} payslips, ${year.from} to ${year.to}`, amount: round(value) }] },
  };
}

const COUNT: CellFormat = { align: 'right', numberFormat: 'number', decimals: 0 };

function countRow(ctx: BuildContext, text: string, now: number | null, then: number | null): DisclosureRow {
  const cell = (v: number | null): Cell => (v == null ? { value: null, origin: 'manual', format: COUNT } : { value: v, origin: 'linked', format: COUNT });
  return { key: text, cells: [label(text), cell(now), ...(ctx.withComparatives ? [cell(then)] : [])] };
}

const EMPLOYEE_COSTS: DisclosureDefinition = {
  code: 'DISC.EMPLOYEE',
  title: 'Employee costs',
  applies: (ctx) => ctx.index.any({ subcategory: 'Employee Costs' }),
  reason: () => 'The company incurred employee costs.',
  narrative: () => [
    'Employee costs comprise salaries, wages and the related statutory and benefit contributions recognised during the period.',
  ],
  tables: (ctx) => {
    const { current, prior } = payrollYears(ctx);
    const p = ctx.index.payroll;
    const headcount = [
      countRow(ctx, 'Average number of employees during the year', p?.current?.employees.average ?? null, p?.prior?.employees.average ?? null),
      ...(p?.current ? [countRow(ctx, 'Number of employees at year end', p.current.employees.yearEnd, p.prior?.employees.yearEnd ?? null)] : []),
    ];

    if (!current) {
      // No payroll the ledger can hold: one row per employee cost account.
      const accounts = ctx.index
        .find({ subcategory: 'Employee Costs' })
        .filter((a) => a.closing !== 0 || a.prior !== 0)
        .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));
      const rows = accounts.map((a) =>
        linkedRow(ctx, a.name, { subcategory: 'Employee Costs', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `emp:${a.name}`, flow: true }),
      );
      return [{
        code: 'EMPLOYEE.ANALYSIS',
        title: 'Employee costs',
        columns: columns(ctx),
        rows: [...rows, totalRow(ctx, 'Total employee costs', rows, 'Sum of the employee cost accounts', 'subtotal'), ...headcount],
      }];
    }

    // By nature, from payroll; what the ledger holds beyond payroll is other employee costs.
    const natures: Array<[string, (y: PayrollYear) => number]> = [
      ['Salaries and wages', (y) => y.earnings.salaries + y.earnings.overtime + y.earnings.commission + y.earnings.other],
      ['Bonuses', (y) => y.earnings.bonuses],
      ['Leave pay', (y) => y.earnings.leavePay],
      ['Allowances', (y) => y.earnings.allowances],
      ['Unemployment Insurance Fund (employer)', (y) => y.employer.uif],
      ['Skills development levy', (y) => y.employer.sdl],
      ['Other employer contributions', (y) => y.employer.other],
    ];
    const rows: DisclosureRow[] = [];
    for (const [text, of] of natures) {
      const now = of(current);
      const then = prior ? of(prior) : null;
      if (Math.abs(now) < 0.005 && Math.abs(then ?? 0) < 0.005) continue;
      rows.push({
        key: `emp:${text}`,
        cells: [label(text, { indent: 1 }), payrollCell(now, current, text), ...(ctx.withComparatives ? [payrollCell(then, prior, text)] : [])],
      });
    }
    const ledgerNow = ctx.index.total({ subcategory: 'Employee Costs' }, 'period');
    const ledgerThen = ctx.withComparatives && ctx.index.hasPriorFlows ? ctx.index.total({ subcategory: 'Employee Costs' }, 'priorPeriod') : null;
    const otherNow = round(ledgerNow.amount - current.payrollCost);
    const otherThen = ledgerThen ? round(ledgerThen.amount - (prior?.payrollCost ?? 0)) : null;
    if (Math.abs(otherNow) >= 0.005 || Math.abs(otherThen ?? 0) >= 0.005) {
      const cell = (v: number | null, source?: CellSource): Cell => ({ value: v, origin: 'linked', format: MONEY, ...(source ? { source } : {}) });
      rows.push({
        key: 'emp:Other employee costs',
        cells: [
          label('Other employee costs', { indent: 1 }),
          cell(otherNow, ledgerNow.source),
          ...(ctx.withComparatives ? [cell(otherThen, ledgerThen?.source)] : []),
        ],
      });
    }
    const comparativeNotAnalysed = ctx.withComparatives && !prior && (ledgerThen?.amount ?? 0) !== 0;
    return [{
      code: 'EMPLOYEE.ANALYSIS',
      title: 'Employee costs',
      columns: columns(ctx),
      rows: [...rows, totalRow(ctx, 'Total employee costs', rows, 'Sum of the employee costs above', 'subtotal'), ...headcount],
      ...(comparativeNotAnalysed ? { footnote: 'Comparative employee costs are not analysed by nature.' } : {}),
    }];
  },
};

/** The directors paid through payroll in either year. */
function directorsOf(ctx: BuildContext): { current: PayrollYear | null; prior: PayrollYear | null } {
  const p = ctx.index.payroll;
  return {
    current: p?.current?.directors.length ? p.current : null,
    prior: ctx.withComparatives && p?.prior?.directors.length ? p.prior : null,
  };
}

/**
 * Directors' emoluments (Companies Act 71 of 2008, s30(4)–(6)): each director's
 * remuneration by kind, from payroll, for each year. Fees paid to non-executive
 * directors outside payroll are the preparer's row to complete.
 */
const DIRECTORS_EMOLUMENTS: DisclosureDefinition = {
  code: 'DISC.DIRECTORS',
  title: "Directors' emoluments",
  applies: (ctx) => {
    const d = directorsOf(ctx);
    return !!(d.current || d.prior);
  },
  reason: () => 'Directors were remunerated through payroll (Companies Act s30(4)).',
  narrative: () => [
    'The emoluments paid to directors for services rendered as directors and in connection with the affairs of the company are set out below.',
  ],
  tables: (ctx) => {
    const d = directorsOf(ctx);
    const kinds: Array<[string, (x: PayrollYear['directors'][number]) => number]> = [
      ['Salary', (x) => x.salary],
      ['Bonuses and performance payments', (x) => x.bonuses],
      ['Allowances', (x) => x.allowances],
      ['Benefits', (x) => x.benefits],
    ];
    const table = (year: PayrollYear, yearLabel: string, code: string): GeneratedTable => {
      const used = kinds.filter(([, of]) => year.directors.some((x) => Math.abs(of(x)) >= 0.005));
      const rows: DisclosureRow[] = year.directors.map((x) => ({
        key: `${code}:${x.employeeId}`,
        cells: [label(x.name), ...used.map(([text, of]) => payrollCell(of(x), year, `${x.name}, ${text.toLowerCase()}`)), payrollCell(x.total, year, `${x.name}, total`)],
      }));
      const keys = rows.map((r) => r.key!);
      const totals: Cell[] = [...used.map(([, of]) => year.directors.reduce((s, x) => s + of(x), 0)), year.directors.reduce((s, x) => s + x.total, 0)]
        .map((v) => ({ value: round(v), origin: 'calculated' as const, formula: 'Sum of the directors above', sums: keys, format: { ...MONEY, bold: true, borderTop: true, doubleBottom: true } }));
      const blank = (): Cell => ({ value: null, origin: 'manual', format: MONEY });
      return {
        code,
        title: `Directors' emoluments - ${yearLabel}`,
        columns: [
          { label: 'Director', align: 'left', width: 180 },
          ...used.map(([text]) => ({ label: text, align: 'right' as const, width: 90 })),
          { label: 'Total', align: 'right', width: 90 },
        ],
        rows: [
          ...rows,
          { key: `${code}:non-executive`, cells: [label("Non-executive directors' fees"), ...used.map(blank), blank()] },
          { key: `${code}:total`, kind: 'total', cells: [label('Total', { bold: true }), ...totals] },
        ],
      };
    };
    const tables: GeneratedTable[] = [];
    if (d.current) tables.push(table(d.current, ctx.currentLabel, 'DIRECTORS.CURRENT'));
    if (d.prior) tables.push(table(d.prior, ctx.priorLabel, 'DIRECTORS.PRIOR'));
    return tables;
  },
};

/**
 * Related parties: the framework's relationships table, and key management
 * personnel compensation (IFRS for SMEs s33.7, IAS 24.17) with the directors'
 * short-term benefits from payroll. The other categories are the preparer's.
 */
const RELATED_PARTIES: DisclosureDefinition = {
  code: 'DISC.RELATED',
  title: 'Related parties',
  applies: (ctx) => {
    const d = directorsOf(ctx);
    return !!(d.current || d.prior);
  },
  reason: () => 'The directors are key management personnel, remunerated through payroll.',
  narrative: () => [
    'Related party relationships exist between the company and its directors, their close family members and entities they control or significantly influence. Transactions with related parties are entered into in the ordinary course of business.',
    'The directors are the key management personnel of the company. Their compensation is set out below and in the directors’ emoluments note.',
  ],
  tables: (ctx) => {
    const d = directorsOf(ctx);
    const short = (y: PayrollYear | null) => (y ? y.directors.reduce((s, x) => s + x.total, 0) : null);
    const blankRow = (text: string): DisclosureRow => manualRow(ctx, text);
    const benefits: DisclosureRow = {
      key: 'Short-term employee benefits',
      cells: [
        label('Short-term employee benefits'),
        payrollCell(short(d.current), d.current, "Directors' emoluments"),
        ...(ctx.withComparatives ? [payrollCell(short(d.prior), d.prior, "Directors' emoluments")] : []),
      ],
    };
    const kmpRows = [benefits, blankRow('Post-employment benefits'), blankRow('Other long-term benefits'), blankRow('Termination benefits'), blankRow('Share-based payment')];
    const relationship = (text: string): DisclosureRow => ({
      key: text,
      cells: [label(text), { value: null, origin: 'manual', format: MONEY }, { value: null, origin: 'manual', format: MONEY }],
    });
    return [
      {
        code: 'DISC.RELATED.TBL',
        title: 'Related party transactions and balances',
        columns: [
          { label: 'Related party / nature', align: 'left', width: 240 },
          { label: 'Transactions for the year', align: 'right', width: 120 },
          { label: 'Outstanding balance', align: 'right', width: 120 },
        ],
        rows: ['Parent / holding company', 'Subsidiaries and fellow subsidiaries', 'Associates and joint ventures', 'Key management personnel', 'Other related parties'].map(relationship),
      },
      {
        code: 'DISC.RELATED.TBL.2',
        title: 'Key management personnel compensation',
        columns: columns(ctx),
        rows: [...kmpRows, totalRow(ctx, 'Total', kmpRows, 'Sum of the compensation above')],
      },
    ];
  },
};

/** Expense accounts whose movement a reader of the income statement is told about. */
const DEPRECIATION = /depreciation|amorti[sz]ation/i;
const AUDIT_FEES = /audit/i;
const LEASES = /\b(rent|rental|lease)\b/i;

/**
 * "Operating profit for the year is stated after accounting for": the items a
 * published set calls out — employee costs and the directors' share of them,
 * depreciation and amortisation, auditor's remuneration, lease charges.
 */
const OPERATING_PROFIT: DisclosureDefinition = {
  code: 'DISC.OPERATINGPROFIT',
  title: 'Operating profit',
  applies: (ctx) =>
    ctx.index.any({ subcategory: 'Employee Costs' }) ||
    ctx.index.find({ type: 'Expense' }).some((a) => (a.activity !== 0 || a.priorActivity !== 0) && (DEPRECIATION.test(a.name) || String(a.account_role) === 'depreciation_expense')),
  reason: () => 'A published set states the items operating profit is stated after.',
  narrative: () => ['Operating profit for the year is stated after accounting for the following:'],
  tables: (ctx) => {
    const rows: DisclosureRow[] = [];
    const expenses = ctx.index.find({ type: 'Expense' }).filter((a) => a.activity !== 0 || a.priorActivity !== 0);
    const group = (text: string, pick: (a: AccountRow) => boolean, key: string, manualWhenNone = false) => {
      const accounts = expenses.filter(pick);
      if (!accounts.length) {
        if (manualWhenNone) rows.push(manualRow(ctx, text));
        return;
      }
      rows.push(linkedRow(ctx, text, { type: 'Expense', nameMatches: new RegExp(`^(${accounts.map((a) => escape(a.name)).join('|')})$`, 'i') }, { key, flow: true }));
    };
    if (ctx.index.any({ subcategory: 'Employee Costs' })) {
      rows.push(linkedRow(ctx, 'Employee costs', { subcategory: 'Employee Costs' }, { key: 'op:employee', flow: true }));
      const d = directorsOf(ctx);
      if (d.current || d.prior) {
        const total = (y: PayrollYear | null) => (y ? y.directors.reduce((s, x) => s + x.total, 0) : null);
        rows.push({
          key: 'op:directors',
          cells: [
            label("Directors' emoluments", { indent: 1 }),
            payrollCell(total(d.current), d.current, "Directors' emoluments"),
            ...(ctx.withComparatives ? [payrollCell(total(d.prior), d.prior, "Directors' emoluments")] : []),
          ],
        });
      }
    }
    group('Depreciation and amortisation', (a) => DEPRECIATION.test(a.name) || String(a.account_role) === 'depreciation_expense', 'op:depreciation');
    group("Auditor's remuneration", (a) => AUDIT_FEES.test(a.name), 'op:audit', true);
    group('Lease rentals', (a) => LEASES.test(a.name) && !DEPRECIATION.test(a.name), 'op:leases');
    return [{ code: 'OPERATINGPROFIT.ITEMS', title: 'Operating profit', columns: columns(ctx), rows }];
  },
};

/**
 * Statutory payables — the statement of financial position's own line for
 * amounts owed to SARS and the Unemployment Insurance Fund (PAYE, UIF, SDL).
 */
const STATUTORY_PAYABLES: DisclosureDefinition = {
  code: 'DISC.STATUTORYPAYABLES',
  title: 'Statutory payables',
  applies: (ctx) => ctx.index.any({ subcategory: 'Statutory Payables' }),
  reason: () => 'The company owes statutory amounts to SARS or the Unemployment Insurance Fund.',
  narrative: () => ['Amounts owed to the South African Revenue Service and the Unemployment Insurance Fund at the reporting date.'],
  tables: (ctx) => {
    const accounts = ctx.index
      .find({ subcategory: 'Statutory Payables' })
      .filter((a) => a.closing !== 0 || a.prior !== 0)
      .sort((a, b) => (a.account_number ?? 0) - (b.account_number ?? 0));
    const rows = accounts.map((a) =>
      linkedRow(ctx, a.name, { subcategory: 'Statutory Payables', nameMatches: new RegExp(`^${escape(a.name)}$`, 'i') }, { indent: 1, key: `stat:${a.name}` }),
    );
    return [{
      code: 'STATUTORYPAYABLES.ANALYSIS',
      title: 'Statutory payables',
      columns: columns(ctx),
      rows: [...rows, totalRow(ctx, 'Total statutory payables', rows, 'Sum of the statutory payable accounts')],
    }];
  },
};

/** Where payroll recorded more employee costs than the ledger's Employee Costs accounts hold. */
export function payrollLedgerDifferences(facts: FinancialFacts | null | undefined): Array<{ year: 'current' | 'comparative'; payroll: number; ledger: number }> {
  const index = new AccountIndex(facts);
  const out: Array<{ year: 'current' | 'comparative'; payroll: number; ledger: number }> = [];
  const check = (year: PayrollYear | null | undefined, basis: 'period' | 'priorPeriod', which: 'current' | 'comparative') => {
    if (!year || year.payrollCost <= 0) return;
    if (basis === 'priorPeriod' && !index.hasPriorFlows) return;
    const ledger = round(index.total({ subcategory: 'Employee Costs' }, basis).amount);
    if (ledger + 0.5 < year.payrollCost) out.push({ year: which, payroll: year.payrollCost, ledger });
  };
  check(index.payroll?.current, 'period', 'current');
  check(index.payroll?.prior, 'priorPeriod', 'comparative');
  return out;
}

export const DISCLOSURE_DEFINITIONS: DisclosureDefinition[] = [
  GENERAL_INFORMATION,
  PPE,
  INTANGIBLES,
  INVENTORIES,
  RECEIVABLES,
  CASH,
  EQUITY,
  BORROWINGS,
  PAYABLES,
  STATUTORY_PAYABLES,
  PROVISIONS,
  REVENUE,
  OTHER_INCOME,
  COST_OF_SALES,
  EMPLOYEE_COSTS,
  DIRECTORS_EMOLUMENTS,
  OPERATING_EXPENSES,
  OPERATING_PROFIT,
  FINANCE_COSTS,
  TAXATION,
  CASH_GENERATED,
  RELATED_PARTIES,
  EVENTS_AFTER_REPORTING,
];

/** Build every disclosure the company's accounting data supports. */
export function generateDisclosures(ctx: BuildContext): GeneratedDisclosure[] {
  const out: GeneratedDisclosure[] = [];
  for (const def of DISCLOSURE_DEFINITIONS) {
    if (!def.applies(ctx)) continue;
    const tables = def.tables(ctx).filter((t) => t.rows.length > 0);
    const narrative = def.narrative(ctx);
    if (tables.length === 0 && narrative.length === 0) continue;
    out.push({
      code: def.code,
      title: def.title,
      narrative,
      tables,
      reason: def.reason(ctx),
      ownsNarrative: !!def.ownsNarrative,
    });
  }
  return out;
}
