/**
 * How a cell reads on the page.
 *
 * Financial statements have their own conventions — negatives in brackets, a
 * nil shown as a dash rather than a zero, thousands separated — and they are
 * the same on screen, in the preview and in the PDF, because they are applied
 * here and nowhere else.
 */
import type { Cell, CellFormat } from './types';

const ZA = 'en-ZA';

export function formatCellValue(value: Cell['value'], format: CellFormat | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'number') return String(value);

  const decimals = format?.decimals ?? 2;
  const kind = format?.numberFormat ?? 'currency';

  if (kind === 'text') return String(value);

  // A nil balance reads as a dash; a zero that was calculated reads as zero.
  if (value === 0 && kind === 'currency') return '–';

  const magnitude = Math.abs(value);
  let body: string;
  if (kind === 'percent') {
    body = `${new Intl.NumberFormat(ZA, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(magnitude)}%`;
  } else {
    body = new Intl.NumberFormat(ZA, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(magnitude);
  }

  if (value < 0) return format?.negativeParens === false ? `-${body}` : `(${body})`;
  return body;
}

/** Parse what someone typed into a figure, accepting the way they write them. */
export function parseCellValue(text: string): number | string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  // Bracketed negatives, spaces and separators, a leading R.
  const negative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed
    .replace(/^\(|\)$/g, '')
    .replace(/^R\s*/i, '')
    // \s does not cover the non-breaking space Intl puts between thousands.
    .replace(/[\s\u00a0]/g, '')
    .replace(/,/g, '.');

  // Only treat it as a figure when the whole string is one.
  if (/^-?\d+(\.\d+)?%?$/.test(cleaned)) {
    const numeric = Number(cleaned.replace('%', ''));
    if (Number.isFinite(numeric)) return negative ? -numeric : numeric;
  }
  return text;
}
