/**
 * Copy, cut and paste across a disclosure table.
 *
 * A spreadsheet without a clipboard is a form. An accountant preparing a note
 * moves blocks of figures around, pulls a schedule out of Excel and drops it in,
 * and expects Ctrl+C to mean what it means everywhere else.
 *
 * The one thing that does not behave like Excel is overwriting. A figure drawn
 * from the ledger is not the preparer's to replace by pasting over it — doing so
 * would break the link silently and the note would stop agreeing with the books
 * with nothing on screen to say why. So a paste lands its formatting on every
 * cell it covers, lands its values only on the cells the preparer owns, and
 * reports how many it refused. Refusing loudly is the point: the alternative is
 * a set of financial statements that no longer ties to the trial balance.
 */
import type { Cell, CellFormat, DisclosureRow } from './types';
import { formatCellValue, parseCellValue } from './format';

/** A rectangle of cells lifted out of a table. */
export type CellBlock = Cell[][];

export type Rect = { top: number; left: number; bottom: number; right: number };

/**
 * The block as tab-separated text, which is what every other spreadsheet reads.
 * Values are written the way they are displayed so a figure pasted into Excel
 * arrives as the reader saw it.
 */
export function blockToTsv(block: CellBlock): string {
  return block
    .map((row) =>
      row
        .map((c) => {
          const text = formatCellValue(c.value, c.format);
          // A nil currency cell displays as a dash; as text it should be blank,
          // or Excel receives an en-dash where a number belongs.
          return text === '–' ? '' : text.replace(/[\t\r\n]/g, ' ');
        })
        .join('\t'),
    )
    .join('\n');
}

/** Tab-separated text from anywhere, read back as manual cells. */
export function tsvToBlock(text: string): CellBlock {
  const normalised = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (normalised === '') return [];
  return normalised.split('\n').map((line) =>
    line.split('\t').map((value) => ({
      value: parseCellValue(value),
      origin: 'manual' as const,
    })),
  );
}

/** Lift a rectangle out of the rows, for the clipboard. */
export function readBlock(rows: DisclosureRow[], rect: Rect): CellBlock {
  const block: CellBlock = [];
  for (let r = rect.top; r <= rect.bottom; r += 1) {
    const row: Cell[] = [];
    for (let c = rect.left; c <= rect.right; c += 1) {
      const source = rows[r]?.cells[c];
      row.push(
        source
          ? { value: source.value, origin: source.origin, format: source.format ? { ...source.format } : undefined }
          : { value: null, origin: 'manual' },
      );
    }
    block.push(row);
  }
  return block;
}

export type PasteResult = {
  rows: DisclosureRow[];
  /** Cells whose value the accounting records own; their figures were kept. */
  kept: number;
  /** Cells whose value was taken from the clipboard. */
  applied: number;
  /** Columns the clipboard had that the table has no room for. */
  clippedColumns: number;
  /** Rows appended to make room for the paste. */
  addedRows: number;
};

function blankRow(width: number, key: string): DisclosureRow {
  return {
    key,
    cells: Array.from({ length: width }, () => ({ value: null, origin: 'manual' as const })),
  };
}

/**
 * Paste a block at a position.
 *
 * Rows grow to fit — pasting eight lines of a debtors schedule into a four-line
 * note should give eight lines, not four. Columns do not: a disclosure's columns
 * carry meaning (this year, last year, cost, depreciation) and an extra nameless
 * one is noise, so anything wider than the table is clipped and counted.
 */
export function pasteBlock(
  rows: DisclosureRow[],
  at: { row: number; col: number },
  block: CellBlock,
  options: { width: number; grow?: boolean } = { width: 0 },
): PasteResult {
  const width = options.width || Math.max(...rows.map((r) => r.cells.length), 0);
  const grow = options.grow !== false;
  const next: DisclosureRow[] = JSON.parse(JSON.stringify(rows));

  let kept = 0;
  let applied = 0;
  let addedRows = 0;

  const needed = at.row + block.length;
  if (needed > next.length) {
    if (grow) {
      const stamp = Date.now();
      for (let i = next.length; i < needed; i += 1) {
        next.push(blankRow(width, `pasted-${stamp}-${i}`));
        addedRows += 1;
      }
    }
  }

  const blockWidth = Math.max(...block.map((r) => r.length), 0);
  const room = Math.max(0, width - at.col);
  const clippedColumns = Math.max(0, blockWidth - room);

  for (let r = 0; r < block.length; r += 1) {
    const target = next[at.row + r];
    if (!target) continue;
    for (let c = 0; c < block[r].length; c += 1) {
      const col = at.col + c;
      if (col >= width) break;
      const incoming = block[r][c];
      const cell = target.cells[col];
      if (!cell) {
        target.cells[col] = { value: incoming.value, origin: 'manual', format: incoming.format };
        applied += 1;
        continue;
      }
      // Formatting is presentation and is always the preparer's to set.
      if (incoming.format) cell.format = { ...cell.format, ...incoming.format };
      if (cell.origin === 'manual') {
        cell.value = incoming.value;
        applied += 1;
      } else {
        // Linked and calculated cells keep their figure. Saying so is what
        // stops a paste quietly severing a note from the ledger.
        kept += 1;
      }
    }
  }

  return { rows: next, kept, applied, clippedColumns, addedRows };
}

/** Clear the values a cut removes, under the same rule as a paste. */
export function clearBlock(rows: DisclosureRow[], rect: Rect): { rows: DisclosureRow[]; kept: number } {
  const next: DisclosureRow[] = JSON.parse(JSON.stringify(rows));
  let kept = 0;
  for (let r = rect.top; r <= rect.bottom; r += 1) {
    for (let c = rect.left; c <= rect.right; c += 1) {
      const cell = next[r]?.cells[c];
      if (!cell) continue;
      if (cell.origin === 'manual') cell.value = null;
      else kept += 1;
    }
  }
  return { rows: next, kept };
}

/**
 * What to tell the preparer after a paste.
 *
 * Silence would be the wrong answer when figures were refused, and a modal
 * would be the wrong answer when nothing was.
 */
export function describePaste(result: PasteResult): { message: string; protective: boolean } | null {
  const parts: string[] = [];
  if (result.kept > 0) {
    parts.push(
      `${result.kept} ${result.kept === 1 ? 'cell keeps its' : 'cells keep their'} figure from the ledger`,
    );
  }
  if (result.clippedColumns > 0) {
    parts.push(
      `${result.clippedColumns} ${result.clippedColumns === 1 ? 'column was' : 'columns were'} wider than the table`,
    );
  }
  if (parts.length === 0) return null;
  return {
    message: `Pasted ${result.applied} ${result.applied === 1 ? 'cell' : 'cells'} — ${parts.join(', ')}.`,
    protective: result.kept > 0,
  };
}

/** Formatting that travels with a copied cell, for the format painter. */
export function formatOf(cell: Cell | undefined): CellFormat | undefined {
  return cell?.format ? { ...cell.format } : undefined;
}
