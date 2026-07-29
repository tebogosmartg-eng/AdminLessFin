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

const NUMERIC_RE = /^\(?-?[\d,]+\.\d{2}\)?$/;
const DASH_RE = /^[-–—\s]*$/;
export const TABLE_MANUAL_TOKENS = ['[ — ]', '[—]', '[ - ]'];

function isNumericCell(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (NUMERIC_RE.test(v)) return true;
  if (DASH_RE.test(v)) return true;
  if (TABLE_MANUAL_TOKENS.includes(v)) return true;
  return false;
}

function isTotalRow(row: string[]): boolean {
  return String(row[0] || '').toLowerCase().includes('total');
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
    engine.y -= leading;
    engine.page.line(CONTENT_L, engine.y + leading * 0.2, CONTENT_R, engine.y + leading * 0.2, 0.8, 0.15);
    engine.y -= 3;
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
      engine.page.line(CONTENT_L, engine.y + leading * 0.28, CONTENT_R, engine.y + leading * 0.28, 0.6, 0.3);
      engine.y -= 2;
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
