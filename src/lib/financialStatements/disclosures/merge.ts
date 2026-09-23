/**
 * Regeneration without loss.
 *
 * A disclosure is built from the accounting records, and then an accountant
 * works on it — rewording a caption, adding a row the ledger cannot know about,
 * formatting a column. When the statements are next rebuilt, both have to
 * survive: the figures must follow the ledger, and the work must not be undone.
 *
 * So the saved table owns the structure — which rows exist, in what order, with
 * what formatting — and the freshly generated table owns the figures in cells
 * that are linked to it. A row the reader deleted stays deleted; a row they
 * added stays added; a caption they rewrote stays rewritten; and the numbers
 * underneath are this morning's.
 */
import type { Cell, DisclosureRow, GeneratedTable } from './types';

function isNumeric(v: Cell['value']): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Look up a generated cell by row key and column, if it still exists. */
function generatedCell(
  generated: GeneratedTable,
  key: string | undefined,
  column: number,
): Cell | undefined {
  if (!key) return undefined;
  const row = generated.rows.find((r) => r.key === key);
  return row?.cells[column];
}

/** Recompute every calculated cell from the rows it says it adds up. */
export function recalculate(rows: DisclosureRow[]): DisclosureRow[] {
  const byKey = new Map<string, DisclosureRow>();
  for (const r of rows) if (r.key) byKey.set(r.key, r);

  return rows.map((row) => ({
    ...row,
    cells: row.cells.map((cellValue, column) => {
      if (cellValue.origin !== 'calculated' || !cellValue.sums?.length) return cellValue;
      let sum = 0;
      for (const key of cellValue.sums) {
        const target = byKey.get(key);
        const v = target?.cells[column]?.value;
        if (isNumeric(v)) sum += v;
      }
      return { ...cellValue, value: sum };
    }),
  }));
}

/**
 * Merge what the reader has saved with what the engine has just generated.
 * Returns the table to show, or the generated table when nothing is saved yet.
 */
export function mergeTable(
  generated: GeneratedTable,
  saved: GeneratedTable | null | undefined,
): GeneratedTable {
  if (!saved || !Array.isArray(saved.rows) || saved.rows.length === 0) return generated;

  const rows: DisclosureRow[] = saved.rows.map((savedRow) => ({
    ...savedRow,
    cells: savedRow.cells.map((savedCell, column) => {
      // A linked cell reports the ledger; take this run's figure and the
      // accounts behind it, while keeping however the reader formatted it.
      if (savedCell.origin === 'linked') {
        const fresh = generatedCell(generated, savedRow.key, column);
        if (fresh && fresh.origin === 'linked') {
          return { ...savedCell, value: fresh.value, source: fresh.source };
        }
        // The accounts behind it are gone — say so rather than show a stale figure.
        return { ...savedCell, value: null, source: undefined };
      }
      return savedCell;
    }),
  }));

  return {
    ...generated,
    // Structure, headings and widths are the reader's.
    title: saved.title ?? generated.title,
    columns: saved.columns?.length ? saved.columns : generated.columns,
    rows: recalculate(rows),
    footnote: saved.footnote ?? generated.footnote,
  };
}

/** True when the saved copy carries work worth keeping. */
export function hasAuthoredContent(saved: GeneratedTable | null | undefined): boolean {
  if (!saved?.rows?.length) return false;
  return saved.rows.some((r) =>
    r.cells.some((c) => c.origin === 'manual' && c.value != null && String(c.value).trim() !== ''),
  );
}
