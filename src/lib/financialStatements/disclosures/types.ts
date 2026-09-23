/**
 * A disclosure is a table of cells that know where they came from.
 *
 * That is the whole idea. A figure in a note is not a number someone typed — it
 * is either drawn from the ledger, worked out from other figures under a rule,
 * or supplied by the preparer because no ledger can know it. Keeping that on the
 * cell is what lets the document be edited freely and still be rebuilt from the
 * accounting records without destroying anyone's work.
 */

/** Where a cell's value came from. */
export type CellOrigin =
  /** Taken from named ledger accounts. Refreshed whenever the statements are. */
  | 'linked'
  /** Derived from other cells under a stated rule. */
  | 'calculated'
  /** The preparer's own figure or wording. Never overwritten. */
  | 'manual';

export type NumberFormat = 'text' | 'currency' | 'number' | 'percent';

export type CellFormat = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  numberFormat?: NumberFormat;
  decimals?: number;
  /** Show negatives in brackets, as financial statements do. */
  negativeParens?: boolean;
  /** Indent steps, for sub-items within a note. */
  indent?: number;
  /** Rule above / below, for subtotals and totals. */
  borderTop?: boolean;
  borderBottom?: boolean;
  /** Double rule, for a grand total. */
  doubleBottom?: boolean;
};

/** Which accounts produced a linked figure, so it can be traced. */
export type CellSource = {
  accounts: Array<{ id?: string | null; code?: string | null; name: string; amount: number }>;
  /** Which side of the period: this year's balance, last year's, the movement. */
  basis: 'closing' | 'prior' | 'activity';
};

export type Cell = {
  value: string | number | null;
  origin: CellOrigin;
  format?: CellFormat;
  source?: CellSource;
  /** How a calculated cell was worked out, in words a reviewer can check. */
  formula?: string;
  /**
   * The row keys a calculated cell adds up. Kept so the total can be worked out
   * again after the reader has added, removed or reordered rows around it.
   */
  sums?: string[];
  colSpan?: number;
  rowSpan?: number;
};

export type RowKind = 'body' | 'header' | 'subtotal' | 'total' | 'spacer';

export type DisclosureRow = {
  cells: Cell[];
  kind?: RowKind;
  /** Stable across regeneration, so an edit survives a rebuild. */
  key?: string;
};

export type DisclosureColumn = {
  label: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  /** The period this column reports, where it reports one. */
  basis?: 'closing' | 'prior';
};

export type GeneratedTable = {
  code: string;
  title: string;
  columns: DisclosureColumn[];
  rows: DisclosureRow[];
  /** Said under the table, where the framework calls for it. */
  footnote?: string;
};

export type GeneratedDisclosure = {
  code: string;
  title: string;
  /** Standard wording, before the preparer touches it. */
  narrative: string[];
  tables: GeneratedTable[];
  /** Why this disclosure was included, for the reader who wonders. */
  reason: string;
};

export function cell(value: Cell['value'], origin: CellOrigin, extra: Partial<Cell> = {}): Cell {
  return { value, origin, ...extra };
}

/** A label cell down the left of a note table. */
export function label(text: string, format: CellFormat = {}): Cell {
  return { value: text, origin: 'manual', format: { align: 'left', ...format } };
}

/** The money format financial statements use: bracketed negatives, two decimals. */
export const MONEY: CellFormat = {
  align: 'right',
  numberFormat: 'currency',
  decimals: 2,
  negativeParens: true,
};
