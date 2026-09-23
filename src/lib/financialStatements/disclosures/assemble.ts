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
import { generateDisclosures, type BuildContext } from './definitions';
import { mergeTable } from './merge';
import type { DisclosureColumn, DisclosureRow, GeneratedTable } from './types';

/** Read a stored disclosure table back into the shape the engine works in. */
export function asGeneratedTable(doc: DocTable): GeneratedTable | null {
  const rows = doc.rows_json as unknown as DisclosureRow[] | undefined;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  // Only tables written by this engine carry cells; older pipe-delimited rows
  // are plain arrays and are left to the simple editor.
  if (!rows.every((r) => r && Array.isArray((r as DisclosureRow).cells))) return null;
  return {
    code: doc.table_code,
    title: doc.title,
    columns: (doc.columns_json as unknown as DisclosureColumn[]) || [],
    rows,
  };
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

export type AssembleOptions = {
  facts: FinancialFacts | null | undefined;
  currentLabel: string;
  priorLabel: string;
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
      const hasRows = Array.isArray(saved.rows_json) && saved.rows_json.length > 0;
      const isStoredRow = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(saved.id);
      if (hasRows && isStoredRow) tables.push(saved);
    }

    if (existing) {
      const i = out.indexOf(existing);
      const hasOwnWords =
        existing.paragraphs.some((p) => p.body.trim()) ||
        existing.sections.some((s) => s.body.trim());
      out[i] = {
        ...existing,
        tables,
        // Sections the old assembly created with an empty body say nothing and
        // ask for nothing; the generated narrative below is the note now.
        sections: existing.sections.filter((s) => s.body.trim()),
        // Standard wording only where nothing has been written.
        paragraphs: hasOwnWords
          ? existing.paragraphs
          : disclosure.narrative.map((body, n) => ({
              id: `${noteId}:P${n + 1}`,
              section_id: null,
              paragraph_code: `P${n + 1}`,
              body,
              sort_order: n + 1,
            })),
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
