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

  // A total may add up other totals ("net = gross less allowance"), so each
  // is worked out from the figures its parts have AFTER their own recount,
  // whatever order the rows sit in.
  const done = new Map<string, DisclosureRow>();
  const resolving = new Set<string>();
  const resolve = (row: DisclosureRow): DisclosureRow => {
    if (row.key && done.has(row.key)) return done.get(row.key)!;
    if (row.key) resolving.add(row.key);
    const out: DisclosureRow = {
      ...row,
      cells: row.cells.map((cellValue, column) => {
        if (cellValue.origin !== 'calculated' || !cellValue.sums?.length) return cellValue;
        let sum = 0;
        for (const key of cellValue.sums) {
          const target = byKey.get(key);
          if (!target || resolving.has(key)) continue;
          const v = resolve(target).cells[column]?.value;
          if (isNumeric(v)) sum += v;
        }
        return { ...cellValue, value: sum };
      }),
    };
    if (row.key) {
      resolving.delete(row.key);
      done.set(row.key, out);
    }
    return out;
  };
  return rows.map(resolve);
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

  admitNewAccounts(generated, saved, rows);

  return {
    ...generated,
    // Structure, headings and widths are the reader's.
    title: saved.title ?? generated.title,
    columns: saved.columns?.length ? withCurrentYearHeadings(saved.columns, generated.columns) : generated.columns,
    rows: recalculate(rows),
    footnote: saved.footnote ?? generated.footnote,
  };
}

const groupOf = (key: string | undefined) => (key && key.includes(':') ? key.split(':')[0] : null);

/**
 * An account that carries a figure under this note now, but had none when the
 * note was saved, joins its group and the totals that add the group up.
 * Without it the note stops agreeing with the statement line it explains the
 * moment a new account is posted to.
 *
 * A row the preparer deleted is told apart by the totals: deleting a ledger
 * row leaves its key in the `sums` of the totals it fed, so a key the saved
 * table's totals still name is one somebody took out, and stays out.
 */
function admitNewAccounts(generated: GeneratedTable, saved: GeneratedTable, rows: DisclosureRow[]): void {
  const present = new Set(rows.map((r) => r.key).filter(Boolean) as string[]);
  const named = new Set<string>();
  for (const r of saved.rows) for (const c of r.cells) for (const k of c.sums ?? []) named.add(k);

  for (const fresh of generated.rows) {
    const group = groupOf(fresh.key);
    if (!group || present.has(fresh.key!) || named.has(fresh.key!)) continue;
    const carriesFigure = fresh.cells.some((c) => c.origin === 'linked' && isNumeric(c.value) && c.value !== 0);
    if (!carriesFigure) continue;
    const siblings = rows.filter((r) => groupOf(r.key) === group);
    if (!siblings.length) continue;

    const at = rows.indexOf(siblings[siblings.length - 1]) + 1;
    rows.splice(at, 0, { ...fresh, cells: fresh.cells.map((c) => ({ ...c })) });
    present.add(fresh.key!);

    const siblingKeys = new Set(siblings.map((s) => s.key));
    for (let i = 0; i < rows.length; i += 1) {
      rows[i] = {
        ...rows[i],
        cells: rows[i].cells.map((c) =>
          c.origin === 'calculated' && c.sums?.some((k) => siblingKeys.has(k)) && !c.sums.includes(fresh.key!)
            ? { ...c, sums: [...c.sums, fresh.key!] }
            : c,
        ),
      };
    }
  }
}

/** A heading that only names a year, which the reader did not write. */
const YEAR_HEADING = /^(?:FY\s?)?\d{4}$|^(?:current|prior|comparative) (?:year|period)$/i;

/**
 * A figure column's heading names the year it reports, and that follows the
 * reporting period: saved as "FY2026" last year, it reads "2027" this year.
 * A heading the reader wrote themselves is theirs and is left as it is.
 */
function withCurrentYearHeadings(
  saved: GeneratedTable['columns'],
  generated: GeneratedTable['columns'],
): GeneratedTable['columns'] {
  return saved.map((column) => {
    if (!column.basis || !YEAR_HEADING.test(String(column.label ?? '').trim())) return column;
    const fresh = generated.find((g) => g.basis === column.basis);
    return fresh ? { ...column, label: fresh.label } : column;
  });
}

/** True when the saved copy carries work worth keeping. */
export function hasAuthoredContent(saved: GeneratedTable | null | undefined): boolean {
  if (!saved?.rows?.length) return false;
  return saved.rows.some((r) =>
    r.cells.some((c) => c.origin === 'manual' && c.value != null && String(c.value).trim() !== ''),
  );
}
