/**
 * How a primary statement reads on the page.
 *
 * The Editor, the Live Preview, the PDF and the Word document each drew their
 * own statements, and they disagreed: the printed ones put last year before
 * this year, the Editor wrote "R 2 540 000,00" where the PDF wrote
 * "2,540,000.00", and only one of them could tell a subtotal from a line. The
 * rules live here now, once, and every renderer asks.
 *
 * Nothing here computes a figure. It decides which column a figure goes in,
 * how it is written, and whether a line is a heading, a line item or a total.
 */
import type { EfsStatementLine } from '../api';
import { formatCellValue } from '../disclosures/format';

type PeriodLike = {
  end_date?: string | null;
  label?: string | null;
  period_key?: string | null;
} | null | undefined;

/** The two column headings, current year first. */
export type ReportingYears = { current: string; comparative: string };

/**
 * The years printed above the figures: the year the reporting period ends in,
 * and the one before it. A year ending in February 2027 is "2027".
 */
export function reportingYears(period: PeriodLike): ReportingYears {
  const fromDate = /^(\d{4})/.exec(String(period?.end_date || ''));
  const fromLabel = /(\d{4})/.exec(String(period?.label || period?.period_key || ''));
  const year = fromDate ? Number(fromDate[1]) : fromLabel ? Number(fromLabel[1]) : null;
  if (year == null) return { current: 'Current year', comparative: 'Prior year' };
  return { current: String(year), comparative: String(year - 1) };
}

/**
 * What a line is, which decides its weight and its rules.
 *
 * - heading: a caption with no figure ("Current Assets")
 * - item: a figure the reader can trace to a note
 * - subtotal: closes a section ("Total Current Assets")
 * - total: closes a statement part ("Total Assets", "Total Liabilities")
 * - grand_total: the figure the statement exists to state, double-ruled
 */
export type LineRole = 'heading' | 'item' | 'subtotal' | 'total' | 'grand_total';

type RoleLine = Pick<
  EfsStatementLine,
  'line_code' | 'label' | 'is_header' | 'is_subheader' | 'is_total' | 'is_subtotal' | 'is_grand_total'
>;

const GRAND_LABEL = /^total (assets|equity and liabilities|comprehensive income)\b/i;

export function lineRole(line: RoleLine): LineRole {
  if (line.is_header || line.is_subheader) return 'heading';
  const code = String(line.line_code || '').toLowerCase();
  const label = String(line.label || '').trim();
  if (line.is_grand_total || GRAND_LABEL.test(label) || /\.closing$/.test(code)) return 'grand_total';
  // The engine marks section totals by their code rather than by a flag.
  if (line.is_subtotal || /\.subtotal$/.test(code)) return 'subtotal';
  // An opening balance is flagged as a total by the engine; it is a balance
  // brought forward, not a sum of the lines above it.
  if (/\.opening$/.test(code)) return 'item';
  if (line.is_total || /(^|\.)total_/.test(code) || /^total\b/i.test(label)) return 'total';
  return 'item';
}

export function isTotalRole(role: LineRole): boolean {
  return role === 'subtotal' || role === 'total' || role === 'grand_total';
}

/** Indent depth for the label. Headings and totals sit at the margin. */
export function lineIndent(line: Pick<EfsStatementLine, 'level'>, role: LineRole): number {
  if (role !== 'item') return 0;
  return Math.max(0, Math.min(3, Number(line.level ?? 0)));
}

/**
 * A figure as it is printed on a statement: whole Rands, thousands separated,
 * negatives in brackets, a nil as a dash — the writing of a published set of
 * annual financial statements, where the column band reads "Figures in Rand".
 * The same writing the notes use, so a figure reads identically on the face of
 * the statement and in its note. The cents live on in the underlying figures;
 * only the printing rounds.
 *
 * A figure the engine did not produce is left blank rather than shown as nil,
 * because a dash says "nothing" and a blank says "not stated".
 */
export function formatStatementFigure(
  value: number | null | undefined,
  role: LineRole,
  opts: { negate?: boolean } = {},
): string {
  if (role === 'heading') return '';
  if (value == null || !Number.isFinite(Number(value))) return '';
  const presented = Math.round(Number(value)) * (opts.negate ? -1 : 1);
  return formatCellValue(presented === 0 ? 0 : presented, { numberFormat: 'currency', decimals: 0 });
}

type SignLine = Pick<EfsStatementLine, 'line_code' | 'section'>;

/**
 * Whether a line prints its figure negated. Expenses on the face of the
 * statement of comprehensive income are shown in brackets — "Cost of sales
 * (162 079 910)" — while the engine holds them positive, the way the notes and
 * the ledger state them. Presentation only: nothing downstream reads the
 * printed sign back.
 */
export function lineNegatesFigure(statementType: string, line: SignLine): boolean {
  if (statementType !== 'financial_performance') return false;
  const code = String(line.line_code || '');
  if (/^perf\.(expenses|cost_of_sales|total_expenses|taxation)/.test(code)) return true;
  return String(line.section || '') === 'expenses';
}

type ComparativeLine = Pick<EfsStatementLine, 'prior_amount' | 'is_header' | 'is_subheader'>;

/**
 * Whether the document has a comparative year at all.
 *
 * Decided once for the whole set, so every statement carries the same two
 * columns: a statement for which the engine produced no comparative figures
 * still shows the comparative column, blank, rather than quietly changing
 * shape from one page to the next.
 */
export function documentHasComparatives(statements: Array<{ lines: ComparativeLine[] }>): boolean {
  return statements.some((s) =>
    s.lines.some((l) => !l.is_header && !l.is_subheader && l.prior_amount != null),
  );
}

/**
 * Whether a printed cell is a figure, in either writing the document has
 * used: "2 540 000,00" (what the notes and statements print) or
 * "2,540,000.00". Used to right-align figure columns in tables.
 */
export function looksLikeFigure(text: string): boolean {
  const t = String(text ?? '').replace(/\u00a0/g, ' ').trim();
  return /^\(?-?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d{1,2})?\)?%?$/.test(t);
}

/**
 * Read a printed figure back into a number, in either writing: "2 540 000,00",
 * "2,540,000.00", "(140 000,00)". Anything that is not a figure — a heading,
 * a placeholder, a dash — is null, never a number made of its stray digits.
 */
export function parseFigure(text: string | null | undefined): number | null {
  const raw = String(text ?? '').replace(/\u00a0/g, ' ').trim();
  if (!looksLikeFigure(raw)) return null;
  const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-');
  let body = raw.replace(/[()%\-\s]/g, '');
  // A comma followed by one or two final digits is a decimal comma; any other
  // comma separates thousands.
  body = /,\d{1,2}$/.test(body) ? body.replace(/\./g, '').replace(',', '.') : body.replace(/,/g, '');
  const value = Number(body);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

const CENTS_FIGURE = /^\(?-?\d{1,3}(?:[ ,\u00a0]\d{3})*[.,]\d{1,2}\)?$/;
const GENERIC_YEAR = /^(current|prior|comparative) (year|period)$/i;

/**
 * A note table as it prints: its year columns headed by the years, and every
 * figure written the one way the document writes figures.
 *
 * The framework library writes "Current year / Prior year" and "740,650.00";
 * the disclosure engine works in cents, "740 650,00". The printed document
 * writes whole Rands under a "Figures in Rand" band, so any cell that is a
 * figure carrying decimals is rewritten to that one style. A year, a count, a
 * percentage or a word in a cell is left exactly as it is.
 */
export function presentTableRows(rows: string[][], years: ReportingYears): string[][] {
  return rows.map((row, r) =>
    row.map((cell) => {
      const text = String(cell ?? '');
      if (r === 0 && GENERIC_YEAR.test(text.trim())) {
        return /^current/i.test(text.trim()) ? years.current : years.comparative;
      }
      if (CENTS_FIGURE.test(text.trim())) {
        const value = parseFigure(text);
        return value == null ? text : formatStatementFigure(value, 'item');
      }
      return text;
    }),
  );
}
