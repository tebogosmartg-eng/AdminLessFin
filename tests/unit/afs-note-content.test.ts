/**
 * Ordering the pieces of a note, and taking them out again.
 *
 * Two rules matter more than the mechanics.
 *
 * The first is that a removal has to survive the note being saved. Generated
 * content's id is built from its note's id, and a note's id changes the first
 * time anything in it is stored — "fw:note:generated:DISC.PPE:P1" becomes
 * "<uuid>:P1". Keying a removal on that id would mean a paragraph you took out
 * coming back the moment you edited the one above it.
 *
 * The second is that the Editor and the printed document must agree. Order and
 * visibility are resolved in one place so that they cannot drift apart.
 */
import { describe, it, expect } from 'vitest';
import {
  isKeyHidden,
  nextPlacement,
  orderedParagraphs,
  orderedTables,
  paragraphKey,
  reorderedPlacements,
  resolveNoteContent,
  stableKey,
  tableKey,
} from '../../src/lib/financialStatements/document/noteContent';
import { emptyOverrides } from '../../src/lib/financialStatements/document/documentStore';
import type { DocNoteNode } from '../../src/lib/financialStatements/document/documentModel';
import type { DocOverrides } from '../../src/lib/financialStatements/document/documentStore';

function note(id = 'fw:note:generated:DISC.PPE'): DocNoteNode {
  return {
    id,
    kind: 'note',
    disclosure_code: 'DISC.PPE',
    title: 'Property, plant and equipment',
    status: 'draft',
    requirement_level: 'required',
    sort_order: 30,
    sections: [],
    paragraphs: [
      { id: `${id}:P1`, section_id: null, paragraph_code: 'P1', body: 'Measured at cost.', sort_order: 1 },
      { id: `${id}:P2`, section_id: null, paragraph_code: 'P2', body: 'Reconciled below.', sort_order: 2 },
      { id: `${id}:P3`, section_id: null, paragraph_code: 'P3', body: 'Useful lives.', sort_order: 3 },
    ],
    tables: [
      { id: `${id}:T.CARRY`, table_code: 'T.CARRY', title: 'Carrying amount', columns_json: [], rows_json: [], sort_order: 10 },
      { id: `${id}:T.MOVE`, table_code: 'T.MOVE', title: 'Movement', columns_json: [], rows_json: [], sort_order: 20 },
    ],
  } as DocNoteNode;
}

function withOverrides(patch: Partial<DocOverrides>): DocOverrides {
  return { ...emptyOverrides(), ...patch };
}

const bodies = (n: DocNoteNode) => n.paragraphs.map((p) => p.paragraph_code);

describe('the key a placement is remembered against', () => {
  it('does not contain the note’s id, which changes when the note is saved', () => {
    const generated = note('fw:note:generated:DISC.PPE');
    const stored = note('7b1f4c2e-0c1a-4f6d-9e2b-8a3d5c6f1234');
    expect(paragraphKey(generated, generated.paragraphs[0])).toBe(
      paragraphKey(stored, stored.paragraphs[0]),
    );
  });

  it('separates a paragraph from a table of the same code', () => {
    expect(stableKey('DISC.PPE', 'paragraph', 'X')).not.toBe(stableKey('DISC.PPE', 'table', 'X'));
  });

  it('separates the same code in two different notes', () => {
    expect(stableKey('DISC.PPE', 'paragraph', 'P1')).not.toBe(
      stableKey('DISC.REVENUE', 'paragraph', 'P1'),
    );
  });
});

describe('reading order', () => {
  it('follows the framework when nobody has said otherwise', () => {
    expect(bodies(resolveNoteContent(note(), emptyOverrides()))).toEqual(['P1', 'P2', 'P3']);
  });

  it('follows the reviewer once they have placed things', () => {
    const n = note();
    const overrides = withOverrides({
      order: {
        [paragraphKey(n, n.paragraphs[2])]: 1,
        [paragraphKey(n, n.paragraphs[0])]: 2,
        [paragraphKey(n, n.paragraphs[1])]: 3,
      },
    });
    expect(bodies(resolveNoteContent(n, overrides))).toEqual(['P3', 'P1', 'P2']);
  });

  it('keeps two pieces given the same place in the order they came', () => {
    const n = note();
    const overrides = withOverrides({
      order: { [paragraphKey(n, n.paragraphs[0])]: 5, [paragraphKey(n, n.paragraphs[1])]: 5 },
    });
    expect(bodies(resolveNoteContent(n, overrides))).toEqual(['P1', 'P2', 'P3']);
  });

  it('puts wording nobody has arranged after the wording they have', () => {
    // The two scales are not comparable: a chosen placement counts in tens, a
    // framework sort order counts from one. Interleaving them would drop a
    // newly generated paragraph into the middle of a note someone had ordered.
    const n = note();
    const overrides = withOverrides({
      order: {
        [paragraphKey(n, n.paragraphs[1])]: 10,
        [paragraphKey(n, n.paragraphs[2])]: 20,
      },
    });
    expect(bodies(resolveNoteContent(n, overrides))).toEqual(['P2', 'P3', 'P1']);
  });

  it('orders tables the same way', () => {
    const n = note();
    const overrides = withOverrides({ order: { [tableKey(n, n.tables[1])]: 1 } });
    expect(orderedTables(n, overrides).map((t) => t.table_code)).toEqual(['T.MOVE', 'T.CARRY']);
  });
});

describe('moving one piece', () => {
  it('restates where every piece sits, not only the two that swapped', () => {
    const n = note();
    const keys = n.paragraphs.map((p) => paragraphKey(n, p));
    const placements = reorderedPlacements(keys, 2, -1);
    expect(placements).toEqual({ [keys[0]]: 10, [keys[2]]: 20, [keys[1]]: 30 });
  });

  it('refuses to move the first one up or the last one down', () => {
    const n = note();
    const keys = n.paragraphs.map((p) => paragraphKey(n, p));
    expect(reorderedPlacements(keys, 0, -1)).toBeNull();
    expect(reorderedPlacements(keys, keys.length - 1, 1)).toBeNull();
  });

  it('moves the piece the reader actually sees, not the one the array holds', () => {
    // The reader has already reordered; "move the top one down" must act on
    // what is on top now.
    const n = note();
    const keys = n.paragraphs.map((p) => paragraphKey(n, p));
    const overrides = withOverrides({ order: { [keys[2]]: 1, [keys[0]]: 2, [keys[1]]: 3 } });
    const shown = orderedParagraphs(n, overrides).map((p) => paragraphKey(n, p));
    expect(shown[0]).toBe(keys[2]);

    const placements = reorderedPlacements(shown, 0, 1)!;
    const after = orderedParagraphs(n, withOverrides({ order: placements }));
    expect(after.map((p) => p.paragraph_code)).toEqual(['P1', 'P3', 'P2']);
  });
});

describe('taking a piece out', () => {
  it('withholds it from the printed note', () => {
    const n = note();
    const overrides = withOverrides({ hidden: { [paragraphKey(n, n.paragraphs[1])]: true } });
    expect(bodies(resolveNoteContent(n, overrides))).toEqual(['P1', 'P3']);
  });

  it('leaves it in the Editor, so it can be brought back', () => {
    const n = note();
    const overrides = withOverrides({ hidden: { [paragraphKey(n, n.paragraphs[1])]: true } });
    expect(orderedParagraphs(n, overrides)).toHaveLength(3);
    expect(isKeyHidden(overrides, paragraphKey(n, n.paragraphs[1]))).toBe(true);
  });

  it('stays out once the note has been saved and the ids have changed', () => {
    // The defect this guards: the note materialises, every generated id is
    // rebuilt from the new note id, and a removal keyed on the old id is lost.
    const generated = note('fw:note:generated:DISC.PPE');
    const overrides = withOverrides({
      hidden: { [paragraphKey(generated, generated.paragraphs[1])]: true },
    });
    const stored = note('7b1f4c2e-0c1a-4f6d-9e2b-8a3d5c6f1234');
    expect(bodies(resolveNoteContent(stored, overrides))).toEqual(['P1', 'P3']);
  });

  it('withholds a table too', () => {
    const n = note();
    const overrides = withOverrides({ hidden: { [tableKey(n, n.tables[0])]: true } });
    expect(resolveNoteContent(n, overrides).tables.map((t) => t.table_code)).toEqual(['T.MOVE']);
  });
});

describe('adding a piece', () => {
  it('puts it after everything already there', () => {
    const n = note();
    const keys = n.paragraphs.map((p) => paragraphKey(n, p));
    const orders = n.paragraphs.map((p) => p.sort_order);
    expect(nextPlacement(keys, orders, emptyOverrides())).toBe(13);
  });

  it('puts it after a reordering, not after the original sequence', () => {
    const n = note();
    const keys = n.paragraphs.map((p) => paragraphKey(n, p));
    const orders = n.paragraphs.map((p) => p.sort_order);
    const overrides = withOverrides({ order: { [keys[0]]: 10, [keys[1]]: 20, [keys[2]]: 30 } });
    expect(nextPlacement(keys, orders, overrides)).toBe(40);
  });

  it('starts somewhere sensible in an empty note', () => {
    expect(nextPlacement([], [], emptyOverrides())).toBe(10);
  });
});
