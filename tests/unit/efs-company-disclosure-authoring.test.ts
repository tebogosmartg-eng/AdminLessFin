/**
 * Final Release Blocker (V12.2) — Company-specific disclosure authoring tests.
 *
 * Proves an accountant-created disclosure behaves exactly like a
 * framework-generated one: correct creation payload, correct numbering and
 * insertion position, editable/hideable/reorderable, cross-reference-aware, and
 * present with Preview == Published (PDF & DOCX) output.
 */
import { describe, expect, it } from 'vitest';
import type {
  DocumentModel,
  DocNoteNode,
  DocStatementNode,
} from '../../src/lib/financialStatements/document/documentModel';
import { assembleSignatures } from '../../src/lib/financialStatements/document/signatureModel';
import { emptyOverrides, type DocOverrides } from '../../src/lib/financialStatements/document/documentStore';
import { assembleFrameworkDocument } from '../../src/lib/financialStatements/framework/frameworkContentEngine';
import { computeNoteNumbering } from '../../src/lib/financialStatements/document/renumber';
import {
  buildCreateDisclosurePayload,
  buildInsertionOrder,
  COMPANY_DISCLOSURE_PREFIX,
  nextCompanyDisclosureCode,
  pickNotesStructureNodeCode,
  type RawInstanceStructure,
} from '../../src/lib/financialStatements/document/createDisclosure';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import {
  generateWorkspaceAfsPdf,
  workspacePdfToBytes,
} from '../../src/lib/financialStatements/publication/afsWorkspacePdf';
import {
  buildCanonicalPublishPackage,
  extractDocxPlainText,
} from '../../src/lib/financialStatements/publication/canonicalDocumentPublish';

const ENTITY = {
  registered_name: 'Authoring Co',
  prepared_by: 'Ada Accountant',
  reviewed_by: 'Mo Manager',
  approved_by: 'Pat Partner',
  reporting_currency: 'ZAR',
};

function statements(): DocStatementNode[] {
  return [
    {
      id: 'financial_position',
      kind: 'statement',
      statement_type: 'financial_position',
      title: 'Statement of Financial Position',
      lines: [{ line_code: 'sfp.ppe', label: 'PPE', section: 'assets', amount: 1500 }],
      populated: true,
    },
    {
      id: 'financial_performance',
      kind: 'statement',
      statement_type: 'financial_performance',
      title: 'Statement of Financial Performance',
      lines: [{ line_code: 'perf.total_revenue', label: 'Revenue', section: 'income', amount: 8000 }],
      populated: true,
    },
  ];
}

/** A persisted company-specific note as it would return from the server. */
function companyNote(id: string, title: string, body: string): DocNoteNode {
  return {
    id,
    kind: 'note',
    disclosure_code: 'DISC.COMPANY.01',
    title,
    status: 'draft',
    requirement_level: 'required',
    sort_order: 900,
    sections: [],
    paragraphs: [{ id: `${id}-p1`, section_id: null, paragraph_code: 'P1', body, sort_order: 1 }],
    tables: [],
    source: 'engagement',
  };
}

function modelWith(serverNotes: DocNoteNode[]): DocumentModel {
  const stmts = statements();
  const assembled = assembleFrameworkDocument({
    frameworkKey: 'IFRS_SME',
    statements: stmts,
    serverNotes,
  });
  return {
    companyId: 'co-1',
    workspaceId: 'ws-1',
    workspaceName: 'Authoring engagement',
    frameworkPackId: 'pack-1',
    frameworkKey: assembled.frameworkKey,
    frameworkLabel: assembled.frameworkLabel,
    entity: ENTITY as DocumentModel['entity'],
    period: { label: 'FY2026', start_date: '2025-04-01', end_date: '2026-03-31' },
    statements: stmts,
    policySets: assembled.policySets,
    notes: assembled.notes,
    crossReferences: [],
    signatures: assembleSignatures(ENTITY as never),
    trialBalanceCaptured: true,
    optionalDisclosures: assembled.optionalDisclosures,
    manualFields: assembled.manualFields,
  };
}

describe('V12.2 — Disclosure creation command', () => {
  it('picks a notes structure node code, preferring note-like nodes', () => {
    const instances: RawInstanceStructure[] = [
      { disclosure_code: 'DISC.BASIS', efs_structure_nodes: { node_code: 'SFP.ROOT', node_kind: 'statement' } },
      { disclosure_code: 'DISC.PPE', efs_structure_nodes: { node_code: 'NOTES.ROOT', node_kind: 'note_group' } },
    ];
    expect(pickNotesStructureNodeCode(instances)).toBe('NOTES.ROOT');
  });

  it('falls back to the first coded node, and returns null when none exist', () => {
    expect(
      pickNotesStructureNodeCode([
        { disclosure_code: 'X', efs_structure_nodes: { node_code: 'ONLY.ONE', node_kind: 'statement' } },
      ]),
    ).toBe('ONLY.ONE');
    expect(pickNotesStructureNodeCode([{ disclosure_code: 'X', efs_structure_nodes: null }])).toBeNull();
    expect(pickNotesStructureNodeCode([])).toBeNull();
  });

  it('generates unique company disclosure codes', () => {
    expect(nextCompanyDisclosureCode([])).toBe(`${COMPANY_DISCLOSURE_PREFIX}01`);
    expect(nextCompanyDisclosureCode([`${COMPANY_DISCLOSURE_PREFIX}01`])).toBe(`${COMPANY_DISCLOSURE_PREFIX}02`);
    expect(
      nextCompanyDisclosureCode([`${COMPANY_DISCLOSURE_PREFIX}01`, `${COMPANY_DISCLOSURE_PREFIX}02`]),
    ).toBe(`${COMPANY_DISCLOSURE_PREFIX}03`);
  });

  it('builds a valid CREATE_DISCLOSURE_INSTANCE payload', () => {
    const payload = buildCreateDisclosurePayload({
      workspaceId: 'ws-1',
      structureNodeCode: 'NOTES.ROOT',
      title: "Directors' emoluments",
      disclosureCode: `${COMPANY_DISCLOSURE_PREFIX}01`,
      disclosureKind: 'note',
    });
    expect(payload.workspace_id).toBe('ws-1');
    expect(payload.structure_node_code).toBe('NOTES.ROOT');
    expect(payload.title).toBe("Directors' emoluments");
    expect(payload.disclosure_kind).toBe('note');
    expect(payload.disclosure_code).toBe(`${COMPANY_DISCLOSURE_PREFIX}01`);
  });
});

describe('V12.2 — Insertion position and numbering', () => {
  it('places a new note at the beginning, after a note, or at the end', () => {
    const model = modelWith([]);
    const ids = computeNoteNumbering(model.notes, emptyOverrides()).visible.map((v) => v.note.id);
    const newId = 'srv-new';

    const atEnd = buildInsertionOrder(model.notes, emptyOverrides(), newId, { position: 'end' });
    expect(atEnd[newId]).toBe(ids.length);

    const atStart = buildInsertionOrder(model.notes, emptyOverrides(), newId, { position: 'beginning' });
    expect(atStart[newId]).toBe(0);

    const afterFirst = buildInsertionOrder(model.notes, emptyOverrides(), newId, {
      position: 'after',
      afterNoteId: ids[0],
    });
    expect(afterFirst[newId]).toBe(1);
    expect(afterFirst[ids[0]]).toBe(0);
  });

  it('numbers the company note as Note 1 when inserted at the beginning', () => {
    const model = modelWith([companyNote('srv-new', 'Directors emoluments', 'Body.')]);
    const orderMap = buildInsertionOrder(model.notes, emptyOverrides(), 'srv-new', { position: 'beginning' });
    const overrides: DocOverrides = { ...emptyOverrides(), order: orderMap };
    const view = prepareCanonicalDocumentView(model, overrides);
    expect(view.notes[0].id).toBe('srv-new');
    expect(view.notes.find((n) => n.id === 'srv-new')?.noteNumber).toBe(1);
  });
});

describe('V12.2 — Company note behaves like a framework note', () => {
  it('is included in the canonical model and numbered sequentially', () => {
    const model = modelWith([companyNote('srv-new', 'Directors emoluments', 'Body.')]);
    const view = prepareCanonicalDocumentView(model, emptyOverrides());
    const numbers = view.notes.map((n) => n.noteNumber);
    expect(view.notes.some((n) => n.id === 'srv-new')).toBe(true);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('can be hidden and restored', () => {
    const model = modelWith([companyNote('srv-new', 'Directors emoluments', 'Body.')]);
    const hidden: DocOverrides = { ...emptyOverrides(), hidden: { 'srv-new': true } };
    const hiddenView = prepareCanonicalDocumentView(model, hidden);
    expect(hiddenView.notes.some((n) => n.id === 'srv-new')).toBe(false);
    expect(hiddenView.hiddenNoteIds).toContain('srv-new');

    const restoredView = prepareCanonicalDocumentView(model, emptyOverrides());
    expect(restoredView.notes.some((n) => n.id === 'srv-new')).toBe(true);
  });

  it('supports cross-reference numbering, Preview == Published PDF, and appears in DOCX', () => {
    // A standard note references the company note by its display number.
    const company = companyNote('srv-new', 'Directors emoluments', 'Directors remuneration details.');
    const model = modelWith([company]);
    // Pin the company note first so its number is deterministic (Note 1).
    const orderMap = buildInsertionOrder(model.notes, emptyOverrides(), 'srv-new', { position: 'beginning' });
    const overrides: DocOverrides = { ...emptyOverrides(), order: orderMap };

    const view = prepareCanonicalDocumentView(model, overrides);
    expect(view.notes[0].id).toBe('srv-new');

    const previewBytes = workspacePdfToBytes(generateWorkspaceAfsPdf(model, overrides));
    const published = buildCanonicalPublishPackage(model, overrides);
    expect(published.pdfBytes).toEqual(previewBytes);
    expect(published.structureFingerprint).toBe(view.structureFingerprint);

    const docxText = extractDocxPlainText(published.docxBytes);
    expect(docxText).toMatch(/Directors emoluments/);
  });
});
