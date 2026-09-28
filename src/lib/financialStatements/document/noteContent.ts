/**
 * The order the pieces of a note appear in, and which of them appear at all.
 *
 * A note is built from two kinds of content. Some of it is generated: the
 * framework's standard wording and the tables the disclosure engine draws from
 * the ledger. That content has no row of its own and is rebuilt on every load,
 * so "delete this paragraph" cannot mean deleting a record — there is none, and
 * it would come back at the next rebuild. The rest is authored, and deleting it
 * means what it says.
 *
 * So removal has two meanings, and both are honest:
 *
 *   authored   the row is deleted; it is gone
 *   generated  it is withheld from this document, and can be brought back
 *
 * Order is presentation either way, so it is always the reviewer's placement
 * first and the framework's sequence second. Resolving it here, once, is what
 * keeps the Editor, the Live Preview and the PDF showing the same note.
 *
 * None of it is keyed on the row id. A generated piece's id is built from its
 * note's id, and a note's id changes the first time anything in it is saved —
 * "fw:note:generated:DISC.PPE:P1" becomes "<uuid>:P1". Keying on that would
 * mean a paragraph you removed quietly returning the moment you edited the one
 * above it. The code a piece carries is stable across both regeneration and
 * materialisation, so that is what a placement is remembered against.
 */
import type { DocNoteNode, DocParagraph, DocTable, DocSection } from './documentModel';
import type { DocOverrides } from './documentStore';

export type PieceKind = 'section' | 'paragraph' | 'table';

/** What a placement or a removal is remembered against. */
export function stableKey(disclosureCode: string, kind: PieceKind, code: string): string {
  return `${String(disclosureCode || 'note').toUpperCase()}:${kind}:${code}`;
}

function keyOfParagraph(note: DocNoteNode, p: DocParagraph): string {
  return stableKey(note.disclosure_code, 'paragraph', p.paragraph_code);
}

function keyOfTable(note: DocNoteNode, t: DocTable): string {
  return stableKey(note.disclosure_code, 'table', t.table_code);
}

function keyOfSection(note: DocNoteNode, s: DocSection): string {
  return stableKey(note.disclosure_code, 'section', s.section_code);
}

/**
 * A placement the reviewer chose and a sort order the framework gave are not
 * on the same scale — one counts in tens from a reordering, the other is
 * whatever sequence the engine emitted — so comparing them across the two
 * would interleave them meaninglessly. Pieces the reviewer has arranged come
 * first, in the order they arranged them; anything they have not touched,
 * including wording the engine has just added, follows in the framework's own
 * sequence. Arranged stays arranged, and new arrivals appear at the end where
 * they can be seen.
 */
function placement(
  overrides: DocOverrides,
  key: string,
  sortOrder: number | null | undefined,
  index: number,
): { arranged: 0 | 1; at: number } {
  const chosen = overrides.order[key];
  if (typeof chosen === 'number') return { arranged: 0, at: chosen };
  return { arranged: 1, at: typeof sortOrder === 'number' ? sortOrder : index };
}

function ordered<T>(
  items: T[],
  overrides: DocOverrides,
  keyOf: (item: T) => string,
  sortOf: (item: T) => number | null | undefined,
): T[] {
  return items
    .map((item, index) => ({ item, index, ...placement(overrides, keyOf(item), sortOf(item), index) }))
    // A stable tie-break: two pieces given the same place keep their own order.
    .sort((a, b) => a.arranged - b.arranged || a.at - b.at || a.index - b.index)
    .map((entry) => entry.item);
}

export function isKeyHidden(overrides: DocOverrides, key: string): boolean {
  return !!overrides.hidden[key];
}

export function paragraphKey(note: DocNoteNode, p: DocParagraph): string {
  return keyOfParagraph(note, p);
}

export function tableKey(note: DocNoteNode, t: DocTable): string {
  return keyOfTable(note, t);
}

/** In reading order, including anything withheld — for the Editor. */
export function orderedParagraphs(note: DocNoteNode, overrides: DocOverrides): DocParagraph[] {
  return ordered(note.paragraphs, overrides, (p) => keyOfParagraph(note, p), (p) => p.sort_order);
}

export function orderedTables(note: DocNoteNode, overrides: DocOverrides): DocTable[] {
  return ordered(note.tables, overrides, (t) => keyOfTable(note, t), (t) => t.sort_order);
}

export function orderedSections(note: DocNoteNode, overrides: DocOverrides): DocSection[] {
  return ordered(note.sections, overrides, (s) => keyOfSection(note, s), (s) => s.sort_order);
}

/** In reading order with withheld content removed — for everything printed. */
export function resolveNoteContent(note: DocNoteNode, overrides: DocOverrides): DocNoteNode {
  return {
    ...note,
    sections: orderedSections(note, overrides).filter(
      (s) => !isKeyHidden(overrides, keyOfSection(note, s)),
    ),
    paragraphs: orderedParagraphs(note, overrides).filter(
      (p) => !isKeyHidden(overrides, keyOfParagraph(note, p)),
    ),
    tables: orderedTables(note, overrides).filter(
      (t) => !isKeyHidden(overrides, keyOfTable(note, t)),
    ),
  };
}

/**
 * The placements to store after moving one piece up or down.
 *
 * Every piece is given an explicit place rather than only the two that swapped,
 * so the result does not depend on sort orders that regeneration may change.
 * Returns null when the move would go off either end.
 */
export function reorderedPlacements(
  keys: string[],
  from: number,
  direction: -1 | 1,
): Record<string, number> | null {
  const to = from + direction;
  if (from < 0 || to < 0 || to >= keys.length) return null;

  const moved = [...keys];
  const [key] = moved.splice(from, 1);
  moved.splice(to, 0, key);

  const placements: Record<string, number> = {};
  moved.forEach((k, index) => {
    placements[k] = (index + 1) * 10;
  });
  return placements;
}

/** Where a newly added piece goes: after everything already there. */
export function nextPlacement(
  keys: string[],
  sortOrders: Array<number | null | undefined>,
  overrides: DocOverrides,
): number {
  const places = keys.map((key, index) => placement(overrides, key, sortOrders[index], index).at);
  return (places.length ? Math.max(...places) : 0) + 10;
}
