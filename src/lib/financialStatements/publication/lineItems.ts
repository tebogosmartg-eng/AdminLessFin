/**
 * Which lines of a note's tables print.
 *
 * Framework notes arrive with every line the framework might ask for —
 * "Basic financial assets at amortised cost — other  [ — ]  [ — ]" — whether
 * or not the company has anything to say there. Printed as they are, a note
 * reads like a form that was never filled in.
 *
 * Every table line has a stable key, and the preparer decides whether it
 * prints. Left undecided, a line prints only when it is complete: a line with
 * any figure still waiting for input is held back until someone fills it in or
 * switches it on — a movement schedule that knows only its closing balance is
 * not yet a movement schedule. A table with nothing left to print is left out entirely,
 * heading and all. This works on the printed rows, so it applies the same way
 * whether a table came from the disclosure engine, the framework library or a
 * movement schedule.
 */

/** A figure the framework wanted and nobody has supplied: "[ — ]", "[ - ]", "[]". */
const PLACEHOLDER = /^\[\s*[—–-]?\s*\]$/;

export type LineItem = {
  key: string;
  table: string;
  label: string;
  cells: string[];
  /** Some figure on the line is a placeholder waiting for input. */
  placeholder: boolean;
  /** Every figure on the line is a placeholder: nothing has been filled in. */
  unfilled: boolean;
  /** The preparer's own choice, if they made one. */
  choice: boolean | undefined;
  /** Whether it prints, after the choice or the default. */
  printed: boolean;
};

type TableBlock = { type: 'table'; title: string; rows: string[][]; kinds?: string[] };
type Block = { type: 'paragraph'; text: string; bold?: boolean } | TableBlock;

function slug(text: string): string {
  return (
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  );
}

/** The key a line is remembered by. Stable across rebuilds: note, table and line wording. */
export function lineKey(noteCode: string, table: string, label: string, occurrence = 0): string {
  const base = `${String(noteCode || '').toUpperCase()}|${slug(table)}|${slug(label)}`;
  return occurrence > 0 ? `${base}#${occurrence + 1}` : base;
}

/** A figure on the line is still waiting for input. */
export function isPlaceholderLine(cells: string[]): boolean {
  return cells.slice(1).some((c) => PLACEHOLDER.test(String(c ?? '').trim()));
}

/** Nothing on the line has been filled in. */
export function isUnfilledLine(cells: string[]): boolean {
  const figures = cells.slice(1).map((c) => String(c ?? '').trim());
  return isPlaceholderLine(cells) && figures.every((c) => c === '' || PLACEHOLDER.test(c));
}

/**
 * Apply the preparer's choices to a note's blocks. Returns the blocks that
 * print, and every table line with what was decided for it.
 */
export function applyLineChoices<B extends Block>(
  noteCode: string,
  blocks: B[],
  choices: Record<string, boolean> | undefined,
): { blocks: B[]; items: LineItem[] } {
  const items: LineItem[] = [];
  const out: B[] = [];
  for (const block of blocks) {
    if (block.type !== 'table') {
      out.push(block);
      continue;
    }
    const [header, ...body] = block.rows;
    const bodyKinds = block.kinds && block.kinds.length === block.rows.length ? block.kinds.slice(1) : null;
    const seen = new Map<string, number>();
    const kept: string[][] = [];
    const keptKinds: string[] = [];
    for (const [index, row] of body.entries()) {
      const label = String(row[0] ?? '').trim();
      const n = seen.get(label) ?? 0;
      seen.set(label, n + 1);
      const key = lineKey(noteCode, block.title, label, n);
      const placeholder = isPlaceholderLine(row);
      const choice = choices?.[key];
      const printed = choice ?? !placeholder;
      items.push({
        key,
        table: block.title,
        label,
        cells: row,
        placeholder,
        unfilled: isUnfilledLine(row),
        choice,
        printed,
      });
      if (printed) {
        kept.push(row);
        if (bodyKinds) keptKinds.push(bodyKinds[index]);
      }
    }
    // A table with nothing left to print is not printed, heading and all —
    // and a table that never had a body row is a bare header, not a table.
    if (kept.length === 0) continue;
    // A caption left with nothing under it — the next row is another caption,
    // or there is none — says nothing: it goes with its lines.
    let rowsOut = kept;
    let kindsOut: string[] | undefined = bodyKinds ? keptKinds : undefined;
    if (kindsOut) {
      const keep = kindsOut.map((k, i) => {
        if (k !== 'header') return true;
        const next = kindsOut![i + 1];
        return next != null && next !== 'header';
      });
      rowsOut = kept.filter((_, i) => keep[i]);
      kindsOut = kindsOut.filter((_, i) => keep[i]);
    }
    out.push({
      ...block,
      rows: header ? [header, ...rowsOut] : rowsOut,
      ...(kindsOut ? { kinds: header ? [block.kinds![0], ...kindsOut] : kindsOut } : {}),
    });
  }
  return { blocks: out, items };
}
