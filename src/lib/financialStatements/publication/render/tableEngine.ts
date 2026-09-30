/**
 * Professional Table Engine (V13.0).
 *
 * Renders disclosure / financial tables with dynamic column widths, automatic
 * numeric right-alignment, consistent decimal alignment, header shading with a
 * rule, subtotal/total rules, repeating headers across page splits and
 * professional row spacing. Draws through the LayoutEngine + pdfKit only.
 */
import { CONTENT_L, CONTENT_R, CONTENT_W, ellipsize, textWidth, wrapText } from './pdfKit';
import { LayoutEngine, TYPE } from './layoutEngine';
import { looksLikeFigure } from '../statementPresentation';

const DASH_RE = /^[-–—\s]*$/;
export const TABLE_MANUAL_TOKENS = ['[ — ]', '[—]', '[ - ]'];

function isNumericCell(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (looksLikeFigure(v)) return true;
  if (DASH_RE.test(v)) return true;
  if (TABLE_MANUAL_TOKENS.includes(v)) return true;
  return false;
}

function isTotalRow(row: string[]): boolean {
  return String(row[0] || '').toLowerCase().includes('total');
}

/** A column heading that only names a reporting year (or nothing). */
const YEAR_ONLY = /^(?:(?:FY\s?)?\d{4}|current(?: year| period)?|comparative(?: year| period)?|prior(?: year| period)?|description|)$/i;

export type NoteTableOptions = {
  /** Row kinds aligned with `rows` (row 0 is the column header). */
  kinds?: Array<string | undefined>;
  /** Right edges of the page band's year columns, current first. */
  bandRights: number[];
};

/**
 * A note's table as a published set prints it.
 *
 * When the table's figure columns are just the reporting years, the page
 * band above already names them: the table prints no header of its own and
 * its figures sit exactly under the band's years. A table with columns of its
 * own (a movement schedule, a cost/depreciation/carrying matrix) prints a
 * plain bold header across evenly spaced columns. Captions are bold; a
 * subtotal has a rule above its figures; a total is bold with a rule above
 * and a double rule below. No shading, no editor chrome.
 */
export function renderNoteTable(engine: LayoutEngine, rows: string[][], opts: NoteTableOptions): void {
  if (!rows.length) return;
  const ncol = Math.max(...rows.map((r) => r.length), 1);
  const norm = rows.map((r) => {
    const c = r.map((x) => String(x ?? ''));
    while (c.length < ncol) c.push('');
    return c;
  });
  const kinds = opts.kinds && opts.kinds.length === norm.length ? opts.kinds : undefined;
  const header = norm[0];
  const body = norm.slice(1);
  const bodyKinds = kinds ? kinds.slice(1) : body.map(() => undefined);
  const figures = ncol - 1;

  const size = TYPE.body;
  const leading = size * 1.5;
  const yearsOnly =
    figures >= 1 && figures <= opts.bandRights.length && header.slice(1).every((h) => YEAR_ONLY.test(h.trim()));

  // Right edges of the figure columns: the band's years, or an even spread.
  const colWidth = yearsOnly ? 88 : Math.min(86, (CONTENT_W - 150) / Math.max(figures, 1));
  const rights = yearsOnly
    ? opts.bandRights.slice(0, figures)
    : Array.from({ length: figures }, (_, i) => CONTENT_R - (figures - 1 - i) * colWidth);
  const figureLeft = (rights[0] ?? CONTENT_R) - colWidth;
  const labelWidth = Math.max(120, figureLeft - CONTENT_L - 8);

  const kindOf = (row: string[], i: number): string => {
    const k = bodyKinds[i];
    if (k) return k;
    const label = row[0].trim().toLowerCase();
    const hasFigure = row.slice(1).some((c) => c.trim());
    if (!hasFigure && label) return 'header';
    if (/^total\b/.test(label)) return 'total';
    return 'data';
  };

  const drawHeader = () => {
    if (yearsOnly) return;
    const lines = header.slice(1).map((h) => wrapText(h, colWidth - 4, size, 'bold'));
    const depth = Math.max(1, ...lines.map((l) => l.length));
    engine.ensure(depth * leading + leading * 2);
    const top = engine.y;
    if (header[0].trim()) engine.page.text(CONTENT_L, top, header[0], { size, font: 'bold' });
    lines.forEach((ls, c) => ls.forEach((ln, i) => engine.page.textRight(rights[c], top - i * leading, ln, { size, font: 'bold' })));
    engine.y = top - depth * leading + leading * 0.35;
    engine.page.line(CONTENT_L, engine.y + size * 0.6, CONTENT_R, engine.y + size * 0.6, 0.6, 0.3);
    engine.y -= leading * 0.45;
  };

  drawHeader();
  body.forEach((row, i) => {
    const kind = kindOf(row, i);
    if (kind === 'spacer') {
      engine.y -= leading * 0.5;
      return;
    }
    // A caption opens a new block of lines: a half line of space above it,
    // unless it is the first thing in the table.
    if (kind === 'header' && i > 0) engine.y -= leading * 0.4;
    const bold = kind === 'header' || kind === 'total' || kind === 'subtotal';
    const font = bold ? 'bold' : 'regular';
    const descLines = wrapText(row[0], labelWidth, size, font);
    const rowH = Math.max(1, descLines.length) * leading + (kind === 'total' ? 5 : kind === 'subtotal' ? 3 : 0);
    if (engine.remaining < rowH + 6) {
      engine.newPage();
      drawHeader();
    }
    if (kind === 'total' || kind === 'subtotal') {
      engine.y -= kind === 'total' ? 3 : 2;
      const ruleY = engine.y + size * 1.05;
      engine.page.line(kind === 'total' ? CONTENT_L : figureLeft, ruleY, CONTENT_R, ruleY, 0.6, 0.25);
    }
    const firstY = engine.y;
    descLines.forEach((ln, j) => engine.page.text(CONTENT_L, firstY - j * leading, ln, { size, font }));
    for (let c = 1; c < ncol; c++) {
      if (row[c].trim()) engine.page.textRight(rights[c - 1], firstY, row[c], { size, font });
    }
    engine.y -= Math.max(1, descLines.length) * leading;
    if (kind === 'total') {
      const y1 = engine.y + leading * 0.5;
      engine.page.line(CONTENT_L, y1, CONTENT_R, y1, 0.6, 0.1);
      engine.page.line(CONTENT_L, y1 - 2, CONTENT_R, y1 - 2, 0.6, 0.1);
      engine.y -= 4;
    }
  });
  engine.spacer(6);
}

export type TableRenderOptions = {
  /** Soft wash behind the header row (brand accent tint). */
  headerTint?: [number, number, number];
};

/**
 * Render a table whose first row is the column header. Remaining rows are body
 * rows; a first-cell containing "total"/"subtotal" is treated as a total rule.
 */
export function renderFinancialTable(
  engine: LayoutEngine,
  rows: string[][],
  opts: TableRenderOptions = {},
): void {
  if (!rows.length) return;
  const ncol = Math.max(...rows.map((r) => r.length), 1);
  const norm = rows.map((r) => {
    const c = r.map((x) => String(x ?? ''));
    while (c.length < ncol) c.push('');
    return c;
  });
  const header = norm[0];
  const body = norm.slice(1);

  const size = 9.5;
  const leading = size * 1.55;

  // Detect numeric columns (non-first columns default to numeric).
  const numericCol = new Array(ncol).fill(false);
  for (let c = 1; c < ncol; c++) {
    let num = 0;
    let tot = 0;
    for (const r of body) {
      const v = r[c].trim();
      if (!v) continue;
      tot += 1;
      if (isNumericCell(v)) num += 1;
    }
    numericCol[c] = tot > 0 ? num / tot >= 0.5 : true;
  }

  // Column widths: numeric columns sized to content; description column flexes.
  const colW = new Array(ncol).fill(0);
  let numericTotal = 0;
  for (let c = 1; c < ncol; c++) {
    let w = textWidth(header[c], size, 'bold');
    for (const r of body) w = Math.max(w, textWidth(r[c], size, isTotalRow(r) ? 'bold' : 'regular'));
    colW[c] = Math.min(Math.max(w + 16, 62), 120);
    numericTotal += colW[c];
  }
  colW[0] = Math.max(140, CONTENT_W - numericTotal);
  // If description forces overflow, clamp numeric columns proportionally.
  const overflow = colW.reduce((a, b) => a + b, 0) - CONTENT_W;
  if (overflow > 0 && ncol > 1) {
    const per = overflow / (ncol - 1);
    for (let c = 1; c < ncol; c++) colW[c] = Math.max(52, colW[c] - per);
  }

  const rightEdge: number[] = [];
  let acc = CONTENT_L;
  for (let c = 0; c < ncol; c++) {
    acc += colW[c];
    rightEdge[c] = acc;
  }

  const drawHeaderRow = () => {
    engine.ensure(leading + 4);
    if (opts.headerTint) {
      engine.page.rect(CONTENT_L, engine.y - size * 0.32, CONTENT_W, leading, 0.94, opts.headerTint);
    } else {
      engine.page.rect(CONTENT_L, engine.y - size * 0.32, CONTENT_W, leading, 0.94);
    }
    engine.page.text(CONTENT_L + 3, engine.y, ellipsize(header[0], colW[0] - 6, size, 'bold'), {
      size,
      font: 'bold',
    });
    for (let c = 1; c < ncol; c++) {
      engine.page.textRight(rightEdge[c] - 3, engine.y, ellipsize(header[c], colW[c] - 6, size, 'bold'), {
        size,
        font: 'bold',
      });
    }
    // The rule closes the header band; the first row starts a full line
    // below it, so the rule never runs through the row's lettering.
    const ruleY = engine.y - size * 0.32;
    engine.page.line(CONTENT_L, ruleY, CONTENT_R, ruleY, 0.8, 0.15);
    engine.y = ruleY - size * 1.25;
  };

  drawHeaderRow();

  for (const r of body) {
    const total = isTotalRow(r);
    const font = total ? 'bold' : 'regular';
    const descLines = wrapText(r[0], colW[0] - 6, size, font);
    const rowH = Math.max(1, descLines.length) * leading;

    if (engine.remaining < rowH + 4) {
      engine.newPage();
      drawHeaderRow();
    }

    if (total) {
      // Above the capitals of the total row, not through them.
      engine.y -= 3;
      engine.page.line(CONTENT_L, engine.y + size * 1.05, CONTENT_R, engine.y + size * 1.05, 0.6, 0.3);
    }

    const firstY = engine.y;
    descLines.forEach((ln, i) => {
      engine.page.text(CONTENT_L + 3, firstY - i * leading, ln, { size, font });
    });
    for (let c = 1; c < ncol; c++) {
      engine.page.textRight(rightEdge[c] - 3, firstY, r[c], { size, font });
    }
    engine.y -= rowH;

    if (total) {
      engine.page.line(CONTENT_L, engine.y + leading * 0.55, CONTENT_R, engine.y + leading * 0.55, 1.1, 0.1);
      engine.y -= 2;
    }
  }
  engine.spacer(4);
}
