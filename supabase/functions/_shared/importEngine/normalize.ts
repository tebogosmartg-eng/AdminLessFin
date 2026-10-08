/**
 * Value normalization: dates, numbers and strings arrive in whatever shape
 * the user's spreadsheet produced. Everything here is pure and total — a
 * value either normalizes or returns null; nothing throws.
 */

import type { RawCell, RawRow } from './types.ts';

/** Collapse whitespace and trim. Returns null for empty/blank values. */
export function normText(value: RawCell): string | null {
  if (value == null) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s.length ? s : null;
}

/** Lower-cased lookup key: letters and digits only. */
export function matchKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export type DateFormat = 'auto' | 'ymd' | 'dmy' | 'mdy';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;
const YMD_LOOSE = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/;
const DMY_OR_MDY = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;
const DMY_SHORT_YEAR = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/;
const TEXT_MONTH = /^(\d{1,2})[ -]([A-Za-z]{3,9})[ -](\d{4})$/;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/**
 * Parse one date cell to ISO YYYY-MM-DD.
 * Excel values arrive as ISO strings already (the client converts Date cells).
 * 'auto' accepts unambiguous forms and, for two-digit-pair forms, requires the
 * caller to have detected the file's convention (detectDateFormat) first.
 */
export function normDate(value: RawCell, format: DateFormat): string | null {
  const s = normText(value);
  if (s == null) return null;

  let m = ISO_DATE.exec(s);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = YMD_LOOSE.exec(s);
  if (m) return validDate(+m[1], +m[2], +m[3]);

  m = TEXT_MONTH.exec(s);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    return validDate(+m[3], month, +m[1]);
  }

  const pair = DMY_OR_MDY.exec(s) ?? DMY_SHORT_YEAR.exec(s);
  if (pair) {
    const a = +pair[1];
    const b = +pair[2];
    let y = +pair[3];
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    if (format === 'dmy') return validDate(y, b, a);
    if (format === 'mdy') return validDate(y, a, b);
    if (format === 'ymd') return null; // a ymd file should not contain d/m/y forms
    // auto: only unambiguous cells parse
    if (a > 12 && b <= 12) return validDate(y, b, a); // must be day-first
    if (b > 12 && a <= 12) return validDate(y, a, b); // must be month-first
    if (a === b) return validDate(y, a, b);
    return null;
  }
  return null;
}

/**
 * Look at every value under the mapped date columns and decide whether the
 * file is day-first or month-first. Returns 'dmy' | 'mdy' when the data
 * proves it, 'ymd' when only ISO-style dates appear, and null when the file
 * is genuinely ambiguous (every pair ≤ 12) — the UI then asks the user.
 */
export function detectDateFormat(values: RawCell[]): DateFormat | null {
  let sawPair = false;
  let dayFirst = false;
  let monthFirst = false;
  let sawYmd = false;
  for (const v of values) {
    const s = normText(v);
    if (!s) continue;
    if (ISO_DATE.test(s) || YMD_LOOSE.test(s)) {
      sawYmd = true;
      continue;
    }
    const m = DMY_OR_MDY.exec(s) ?? DMY_SHORT_YEAR.exec(s);
    if (!m) continue;
    sawPair = true;
    const a = +m[1];
    const b = +m[2];
    if (a > 12 && b <= 12) dayFirst = true;
    if (b > 12 && a <= 12) monthFirst = true;
  }
  if (dayFirst && !monthFirst) return 'dmy';
  if (monthFirst && !dayFirst) return 'mdy';
  if (!sawPair && sawYmd) return 'ymd';
  return null;
}

export type NumberFormat = 'auto' | 'point' | 'comma';

/**
 * Parse a money/quantity cell. Handles currency symbols, spaces as thousands
 * separators, parentheses negatives, and both decimal conventions.
 */
export function normNumber(value: RawCell, format: NumberFormat = 'auto'): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return null;

  let s = String(value).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  // Currency symbols, letters (R, ZAR), non-breaking and thin spaces.
  s = s.replace(/[A-Za-z  \s$€£¥]/g, '').replace(/^[Rr]/, '');
  if (s.startsWith('-')) {
    negative = !negative ? true : negative;
    s = s.slice(1);
  }
  if (!s) return null;

  const hasComma = s.includes(',');
  const hasPoint = s.includes('.');
  if (hasComma && hasPoint) {
    // The later separator is the decimal one.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    const commas = (s.match(/,/g) ?? []).length;
    if (commas > 1) {
      s = s.replace(/,/g, ''); // several commas are always thousands separators
    } else {
      const decimalComma =
        format === 'comma' || (format === 'auto' && !/^\d{1,3},\d{3}$/.test(s));
      s = decimalComma ? s.replace(',', '.') : s.replace(',', '');
    }
  } else if (hasPoint && format === 'comma') {
    // comma-decimal files use '.' as thousands
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }

  if (!/^\d*(\.\d+)?$/.test(s) || s === '' || s === '.') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Integer-only fields (payment terms, quantities that must be whole). */
export function normInteger(value: RawCell, format: NumberFormat = 'auto'): number | null {
  const n = normNumber(value, format);
  if (n == null || !Number.isInteger(n)) return null;
  return n;
}

/** Money rounded to cents, matching the posting engine's 0.01 tolerance. */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Case-insensitive raw cell lookup used when applying a column mapping. */
export function applyMapping(raw: RawRow, mapping: Record<string, string>): Record<string, RawCell> {
  const out: Record<string, RawCell> = {};
  for (const [field, header] of Object.entries(mapping)) {
    if (!header) continue;
    if (header in raw) {
      out[field] = raw[header];
      continue;
    }
    const want = matchKey(header);
    const found = Object.keys(raw).find(k => matchKey(k) === want);
    out[field] = found != null ? raw[found] : null;
  }
  return out;
}

/** A row is blank when every mapped value is empty. */
export function isBlankRecord(record: Record<string, RawCell>): boolean {
  return Object.values(record).every(v => normText(v) == null);
}
