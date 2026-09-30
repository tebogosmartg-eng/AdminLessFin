/**
 * Every piece of a note — section, paragraph, table — moves through one
 * sequence, so a paragraph the preparer adds can sit below the table it
 * explains, and it prints there in every output.
 */
import { describe, expect, it } from 'vitest';
import { buildV16SampleModel } from '../../src/lib/financialStatements/composition/fixtures/v16SampleModel';
import { emptyOverrides, type DocOverrides } from '../../src/lib/financialStatements/document/documentStore';
import type { DocumentModel, DocNoteNode } from '../../src/lib/financialStatements/document/documentModel';
import {
  movedPieceOrder,
  orderedPieces,
  stableKey,
} from '../../src/lib/financialStatements/document/noteContent';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import { buildCanonicalPublishPackage } from '../../src/lib/financialStatements/publication/canonicalDocumentPublish';

const MINE = 'Commentary written by the preparer about the movement above.';

/** The sample's PPE note with a paragraph of the preparer's own added. */
function model(): { m: DocumentModel; ppe: DocNoteNode } {
  const m = buildV16SampleModel();
  const ppe = m.notes.find((n) => n.disclosure_code === 'DISC.PPE')!;
  expect(ppe.tables.length).toBeGreaterThan(0);
  ppe.paragraphs.push({
    id: '11111111-1111-4111-8111-111111111111',
    section_id: null,
    paragraph_code: 'PMINE',
    body: MINE,
    sort_order: 999,
  });
  return { m, ppe };
}

const blocksOf = (m: DocumentModel, o: DocOverrides) =>
  prepareCanonicalDocumentView(m, o).notes.find((n) => n.disclosureCode === 'DISC.PPE')!.blocks;

const decode = (bytes: Uint8Array) =>
  [...Buffer.from(bytes).toString('latin1').matchAll(/\((?:\\.|[^\\)])*\)/g)].map((x) => x[0]).join('\n');

describe('A note reads in one order', () => {
  it('by default: sections, then paragraphs, then tables — as before', () => {
    const { m } = model();
    const blocks = blocksOf(m, emptyOverrides());
    const mine = blocks.findIndex((b) => b.type === 'paragraph' && b.text === MINE);
    const firstTable = blocks.findIndex((b) => b.type === 'table');
    expect(mine).toBeGreaterThanOrEqual(0);
    expect(mine).toBeLessThan(firstTable);
  });

  it('a paragraph moved below the tables prints below them', () => {
    const { m, ppe } = model();
    const keys = orderedPieces(ppe, emptyOverrides()).map((p) => p.key);
    const mineKey = stableKey('DISC.PPE', 'paragraph', 'PMINE');
    // Move it down, one step at a time, to the end.
    let order = keys;
    while (order.indexOf(mineKey) < order.length - 1) {
      order = movedPieceOrder(order, order.indexOf(mineKey), 1)!;
    }
    const o: DocOverrides = { ...emptyOverrides(), pieceOrder: { 'DISC.PPE': order } };

    const blocks = blocksOf(m, o);
    const mine = blocks.findIndex((b) => b.type === 'paragraph' && b.text === MINE);
    const lastTable = blocks.map((b) => b.type).lastIndexOf('table');
    expect(mine).toBeGreaterThan(lastTable);

    // And in the PDF: the wording comes after the note's table rows.
    const pdf = decode(buildCanonicalPublishPackage(m, o).pdfBytes);
    const at = pdf.indexOf('Commentary written by the preparer');
    expect(at).toBeGreaterThan(0);
    const tableRow = pdf.indexOf('Property, plant and equipment', pdf.indexOf('Notes to the'));
    expect(tableRow).toBeGreaterThan(0);
    expect(at).toBeGreaterThan(tableRow);
  });

  it('cannot move past either end', () => {
    expect(movedPieceOrder(['a', 'b'], 0, -1)).toBeNull();
    expect(movedPieceOrder(['a', 'b'], 1, 1)).toBeNull();
    expect(movedPieceOrder(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('a piece that arrives after the note was arranged follows the arranged ones', () => {
    const { ppe } = model();
    const keys = orderedPieces(ppe, emptyOverrides()).map((p) => p.key);
    const arranged = keys.filter((k) => !k.endsWith(':PMINE')).reverse();
    const o: DocOverrides = { ...emptyOverrides(), pieceOrder: { 'DISC.PPE': arranged } };
    const order = orderedPieces(ppe, o).map((p) => p.key);
    expect(order.slice(0, arranged.length)).toEqual(arranged);
    expect(order[order.length - 1]).toBe(stableKey('DISC.PPE', 'paragraph', 'PMINE'));
  });
});
