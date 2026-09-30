/**
 * Putting the generated disclosures into the document.
 *
 * The engine produces a disclosure for everything the company's accounts
 * support. This decides how each one meets what is already there: a note the
 * preparer has been working on keeps its identity and its saved tables, and only
 * its linked figures are refreshed; a disclosure with nothing saved against it
 * arrives fully populated.
 */
import type { DocNoteNode, DocTable } from '../document/documentModel';
import { AccountIndex, type FinancialFacts } from './accountIndex';
import { generateDisclosures, type BuildContext, type EntityParticulars } from './definitions';
import { mergeTable } from './merge';
import type { DisclosureColumn, DisclosureRow, GeneratedTable } from './types';

function hasCells(row: unknown): row is DisclosureRow {
  return !!row && typeof row === 'object' && Array.isArray((row as DisclosureRow).cells);
}

/** Column headings for a table stored before columns were recorded. */
function inferColumns(stored: unknown, width: number): DisclosureColumn[] {
  const given = (stored as DisclosureColumn[]) || [];
  if (given.length >= width) return given;
  const out = [...given];
  for (let c = out.length; c < width; c += 1) {
    out.push({ label: c === 0 ? 'Description' : '', align: c === 0 ? 'left' : 'right' });
  }
  return out;
}

/**
 * Read a stored disclosure table back into the shape the engine works in.
 *
 * Two shapes are stored. Tables this engine wrote carry cells that know where
 * their figures came from. Older ones are plain arrays of text, written before
 * any of that existed, and they used to fall through to a much poorer editor —
 * no formatting, no clipboard, no keyboard — so which editor an accountant got
 * depended on which note they happened to open.
 *
 * An old table has no recorded link to the ledger, so every cell in it is the
 * preparer's and is read as one. That is honest about what is known, and it
 * means there is one table editor rather than two.
 */
export function asGeneratedTable(doc: DocTable): GeneratedTable | null {
  const rows = doc.rows_json as unknown[] | undefined;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  if (rows.every(hasCells)) {
    return {
      code: doc.table_code,
      title: doc.title,
      columns: (doc.columns_json as unknown as DisclosureColumn[]) || [],
      rows: rows as DisclosureRow[],
    };
  }

  if (rows.every((r) => Array.isArray(r))) {
    const grid = rows as unknown[][];
    const width = Math.max(...grid.map((r) => r.length), 1);
    return {
      code: doc.table_code,
      title: doc.title,
      columns: inferColumns(doc.columns_json, width),
      rows: grid.map((cells, r) => ({
        key: `stored-${r}`,
        cells: Array.from({ length: width }, (_, c) => ({
          value: (cells[c] ?? null) as string | number | null,
          origin: 'manual' as const,
          format: { align: c === 0 ? ('left' as const) : ('right' as const) },
        })),
      })),
    };
  }

  return null;
}

/** Present a generated table as a document table the rest of the model speaks. */
export function asDocTable(noteId: string, table: GeneratedTable, sortOrder: number): DocTable {
  return {
    // Not a uuid: saving this routes through SAVE_AUTHORED_CONTENT, which
    // creates the row the first time the preparer changes anything.
    id: `${noteId}:${table.code}`,
    table_code: table.code,
    title: table.title,
    columns_json: table.columns as unknown[],
    rows_json: table.rows as unknown[],
    sort_order: sortOrder,
  };
}

/**
 * A real database row, as against generated content.
 *
 * Anchored at both ends on purpose. A generated piece's id is built from its
 * note's id, so once a note is stored its generated children read
 * "7b1f4c2e-…-8a3d5c6f1234:P2" — which a prefix test happily calls a stored
 * row, and then generated content starts being treated as the preparer's.
 */
const STORED_ROW = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The standard wording, and whatever the preparer has done to it.
 *
 * This used to be all or nothing: a note with any wording of its own kept only
 * what was stored, and a note with none took only what was generated. Both ends
 * were wrong. Rewriting one paragraph silently dropped every other paragraph
 * the framework supplies, and adding a paragraph — which starts empty — left
 * the note looking untouched, so Add paragraph appeared to do nothing at all.
 *
 * Paragraphs merge the way the tables already do: by the code each one carries.
 * A generated paragraph the preparer has rewritten is theirs; one they have not
 * is refreshed from the framework; and anything they have added of their own
 * follows on the end.
 */
function mergeNarrative(
  noteId: string,
  narrative: string[],
  existing: DocNoteNode['paragraphs'],
  owns = false,
): DocNoteNode['paragraphs'] {
  // An empty paragraph with no row behind it is a leftover of the old
  // assembly and says nothing; an empty one the preparer just added is a row,
  // and is where they are about to write. Where the engine states the note
  // from the company's own data, the framework's generic wording gives way to
  // it; the preparer's stored wording still wins over both.
  const saved = new Map(
    existing
      .filter((p) => STORED_ROW.test(p.id) || (narrative.length === 0 && !owns && p.body.trim()))
      .map((p) => [p.paragraph_code, p]),
  );

  const merged = narrative.map((body, n) => {
    const code = `P${n + 1}`;
    const own = saved.get(code);
    saved.delete(code);
    return (
      own ?? {
        id: `${noteId}:${code}`,
        section_id: null,
        paragraph_code: code,
        body,
        sort_order: n + 1,
      }
    );
  });

  // The preparer's own additions keep the order they were given.
  const extras = [...saved.values()].sort((a, b) => a.sort_order - b.sort_order);
  return [...merged, ...extras];
}

/** Table codes earlier versions of the engine produced and no longer do. */
const RETIRED_ENGINE_TABLES = new Set(['PPE.CARRYING', 'PPE.MOVEMENT', 'EQUITY.ANALYSIS']);

export type AssembleOptions = {
  facts: FinancialFacts | null | undefined;
  currentLabel: string;
  priorLabel: string;
  /** What the engagement records about the entity, for the notes that state it. */
  entity?: EntityParticulars | null;
};

/**
 * Merge the generated disclosures into the notes already assembled.
 * Returns the notes to show, and the codes the engine populated.
 */
export function applyGeneratedDisclosures(
  notes: DocNoteNode[],
  options: AssembleOptions,
): { notes: DocNoteNode[]; generatedCodes: string[]; reasons: Record<string, string> } {
  const index = new AccountIndex(options.facts);
  if (index.rows.length === 0) return { notes, generatedCodes: [], reasons: {} };

  const ctx: BuildContext = {
    index,
    currentLabel: options.currentLabel,
    priorLabel: options.priorLabel,
    withComparatives: index.hasComparatives,
    entity: options.entity ?? null,
  };

  const generated = generateDisclosures(ctx);
  if (generated.length === 0) return { notes, generatedCodes: [], reasons: {} };

  const byCode = new Map(notes.map((n) => [String(n.disclosure_code).toUpperCase(), n]));
  const out = [...notes];
  const generatedCodes: string[] = [];
  const reasons: Record<string, string> = {};

  for (const disclosure of generated) {
    const key = disclosure.code.toUpperCase();
    generatedCodes.push(disclosure.code);
    reasons[disclosure.code] = disclosure.reason;

    const existing = byCode.get(key);
    const noteId = existing?.id ?? `fw:note:generated:${disclosure.code}`;

    // Saved tables win on structure; the engine refreshes their linked figures.
    const savedByCode = new Map<string, DocTable>();
    for (const t of existing?.tables ?? []) savedByCode.set(t.table_code, t);

    const tables = disclosure.tables.map((table, i) => {
      const saved = savedByCode.get(table.code);
      const merged = mergeTable(table, saved ? asGeneratedTable(saved) : null);
      const doc = asDocTable(noteId, merged, (i + 1) * 10);
      // Keep the stored row's id so an edit updates it rather than making another.
      return saved && saved.id ? { ...doc, id: saved.id } : doc;
    });

    // Keep a table the engine does not produce only when it is the preparer's
    // own — a stored row with something in it. The two kinds dropped here are
    // the empty shell the old assembly created for every note, and the
    // framework library's placeholder table, whose every figure reads "[ — ]"
    // because it had no way to reach the ledger. The engine's table above says
    // the same thing with the numbers in it.
    for (const [code, saved] of savedByCode) {
      if (disclosure.tables.some((t) => t.code === code)) continue;
      // A table an earlier version of the engine produced, stored when the
      // preparer worked on it, is superseded by what the engine states now —
      // it is not the preparer's own, and printing both says it twice.
      if (RETIRED_ENGINE_TABLES.has(code)) continue;
      const hasRows = Array.isArray(saved.rows_json) && saved.rows_json.length > 0;
      if (hasRows && STORED_ROW.test(saved.id)) tables.push(saved);
    }

    if (existing) {
      const i = out.indexOf(existing);
      out[i] = {
        ...existing,
        // The engine owns what its notes are called; a preparer's own title is
        // a presentation override and still wins at print.
        title: disclosure.title,
        tables,
        // Sections the old assembly created with an empty body say nothing and
        // ask for nothing; the generated narrative below is the note now.
        // Where the engine states the note, the framework's generic sections
        // give way to it too; sections the preparer wrote are kept.
        sections: existing.sections.filter(
          (s) =>
            s.body.trim() &&
            (STORED_ROW.test(s.id) || (disclosure.narrative.length === 0 && !disclosure.ownsNarrative)),
        ),
        paragraphs: mergeNarrative(noteId, disclosure.narrative, existing.paragraphs, disclosure.ownsNarrative),
      };
    } else {
      out.push({
        id: noteId,
        kind: 'note',
        disclosure_code: disclosure.code,
        title: disclosure.title,
        status: 'draft',
        requirement_level: 'required',
        sort_order: 500 + generatedCodes.length * 10,
        sections: [],
        paragraphs: disclosure.narrative.map((body, n) => ({
          id: `${noteId}:P${n + 1}`,
          section_id: null,
          paragraph_code: `P${n + 1}`,
          body,
          sort_order: n + 1,
        })),
        tables,
        source: 'framework',
      });
    }
  }

  return { notes: out, generatedCodes, reasons };
}
