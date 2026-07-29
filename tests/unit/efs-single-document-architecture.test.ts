/**
 * Critical Gap 1 — Single Document Architecture identity tests.
 *
 * Preview == Workspace PDF == Published PDF
 * Structure / numbering / xrefs / hidden notes / signatures identical across PDF & DOCX
 */
import { describe, expect, it } from 'vitest';
import type { DocumentModel, DocNoteNode } from '../../src/lib/financialStatements/document/documentModel';
import { assembleSignatures } from '../../src/lib/financialStatements/document/signatureModel';
import { emptyOverrides, type DocOverrides } from '../../src/lib/financialStatements/document/documentStore';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import {
  generateWorkspaceAfsPdf,
  workspacePdfToBytes,
} from '../../src/lib/financialStatements/publication/afsWorkspacePdf';
import {
  buildCanonicalPublishPackage,
  extractDocxPlainText,
} from '../../src/lib/financialStatements/publication/canonicalDocumentPublish';

function makeNote(
  partial: Partial<DocNoteNode> & Pick<DocNoteNode, 'id' | 'disclosure_code' | 'title' | 'sort_order'>,
): DocNoteNode {
  return {
    kind: 'note',
    status: 'draft',
    requirement_level: 'required',
    sections: [],
    paragraphs: [],
    tables: [],
    ...partial,
  };
}

function eightNotes(revenueBody: string): DocNoteNode[] {
  const topics = [
    'Note Topic 01 Basis',
    'Note Topic 02 Policies',
    'Note Topic 03 Judgements',
    'Note Topic 04 Cash',
    'Note Topic 05 Receivables',
    'Note Topic 06 Inventories',
    'Note Topic 07 Revenue',
    'Note Topic 08 Property Plant & Equipment',
  ];
  return topics.map((title, idx) => {
    const n = idx + 1;
    const id = `note-${n}`;
    return makeNote({
      id,
      disclosure_code: `DISC.TOPIC_${String(n).padStart(2, '0')}`,
      title,
      sort_order: n * 10,
      paragraphs: [
        {
          id: `${id}-p1`,
          paragraph_code: 'P1',
          body: n === 7 ? revenueBody : `${title} disclosure.`,
          sort_order: 1,
        },
      ],
    });
  });
}

function model(notes: DocNoteNode[], entity = {
  registered_name: 'Single Doc Co',
  prepared_by: 'Ada Accountant',
  reviewed_by: 'Mo Manager',
  approved_by: 'Pat Partner',
  approval_date: '2026-06-30',
  company_secretary: 'Sam Secretary',
  authorisation_date: '2026-07-01',
  reporting_currency: 'ZAR',
}): DocumentModel {
  return {
    companyId: 'co-1',
    workspaceId: 'ws-single-1',
    workspaceName: 'Single document engagement',
    frameworkPackId: 'pack-1',
    frameworkKey: 'IFRS_SME',
    frameworkLabel: 'IFRS for SMEs',
    entity: entity as DocumentModel['entity'],
    period: {
      label: 'FY2026',
      start_date: '2025-04-01',
      end_date: '2026-03-31',
    },
    statements: [
      {
        id: 'financial_position',
        kind: 'statement',
        statement_type: 'financial_position',
        title: 'Statement of Financial Position',
        lines: [
          {
            line_code: 'sfp.total_assets',
            label: 'Total Assets',
            section: 'assets',
            amount: 100,
            is_total: true,
          },
        ],
        populated: true,
      },
      {
        id: 'financial_performance',
        kind: 'statement',
        statement_type: 'financial_performance',
        title: 'Statement of Profit or Loss and Other Comprehensive Income',
        lines: [],
        populated: false,
      },
      {
        id: 'changes_in_equity',
        kind: 'statement',
        statement_type: 'changes_in_equity',
        title: 'Statement of Changes in Equity',
        lines: [],
        populated: false,
      },
      {
        id: 'cash_flows',
        kind: 'statement',
        statement_type: 'cash_flows',
        title: 'Statement of Cash Flows',
        lines: [],
        populated: false,
      },
    ],
    policySets: [],
    notes,
    crossReferences: [],
    signatures: assembleSignatures(entity as never),
    trialBalanceCaptured: true,
  };
}

function decodePdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const matches = [...raw.matchAll(/\((?:\\.|[^\\)])*\)/g)];
  return matches
    .map((m) =>
      m[0]
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\([()\\])/g, '$1'),
    )
    .join('\n');
}

describe('Critical Gap 1 — Single document architecture', () => {
  it('Preview PDF bytes equal Workspace PDF bytes equal Published PDF bytes', () => {
    const m = model(eightNotes('Refer to Note 8.'));
    const overrides: DocOverrides = { ...emptyOverrides(), hidden: { 'note-4': true } };

    const previewPdf = generateWorkspaceAfsPdf(m, overrides);
    const previewBytes = workspacePdfToBytes(previewPdf);
    const published = buildCanonicalPublishPackage(m, overrides);

    expect(published.pdfBytes).toEqual(previewBytes);
    expect(workspacePdfToBytes(published.pdfString)).toEqual(previewBytes);
  });

  it('Document ordering, numbering, hidden notes, xrefs, signatures identical in view fingerprint', () => {
    const m = model(eightNotes('Refer to Note 8.'));
    const overrides: DocOverrides = {
      ...emptyOverrides(),
      hidden: { 'note-4': true },
      order: {
        'note-8': 1,
        'note-1': 2,
        'note-2': 3,
        'note-3': 4,
        'note-5': 5,
        'note-6': 6,
        'note-7': 7,
      },
    };
    const view = prepareCanonicalDocumentView(m, overrides);
    const pkg = buildCanonicalPublishPackage(m, overrides);

    expect(pkg.structureFingerprint).toBe(view.structureFingerprint);
    expect(view.hiddenNoteIds).toContain('note-4');
    expect(view.notes.find((n) => n.id === 'note-8')?.noteNumber).toBe(1);

    const pdfText = decodePdfText(pkg.pdfBytes);
    expect(pdfText).toMatch(/Refer to Note/);
    expect(pdfText).toMatch(/Prepared By/);
    expect(pdfText).toMatch(/Ada Accountant/);
    expect(pdfText).toMatch(/Approval of Annual Financial Statements/);
    // Hidden note-4 content should not appear as its own heading in numbering path
    expect(view.notes.some((n) => n.id === 'note-4')).toBe(false);
  });

  it('Published DOCX carries the same structure fingerprint content (notes, xrefs, signatures)', () => {
    const m = model(eightNotes('Refer to Note 8.'));
    const overrides: DocOverrides = { ...emptyOverrides(), hidden: { 'note-4': true } };
    const pkg = buildCanonicalPublishPackage(m, overrides);
    const docxText = extractDocxPlainText(pkg.docxBytes);

    expect(docxText).toMatch(/Single Doc Co/);
    expect(docxText).toMatch(/Notes to the Financial Statements/);
    expect(docxText).toMatch(/Significant Accounting Policies/);
    expect(docxText).toMatch(/Refer to Note 7/);
    expect(docxText).not.toMatch(/Refer to Note 8/);
    expect(docxText).toMatch(/Approval of Annual Financial Statements/);
    expect(docxText).toMatch(/Ada Accountant/);
    expect(docxText).toMatch(/Sam Secretary/);
    expect(docxText).toMatch(/\[Signature\]/);

    // Ordering: note headings present with display numbers
    for (const note of pkg.view.notes) {
      expect(docxText).toContain(note.heading);
    }
  });

  it('Cross references identical between PDF and DOCX after hide', () => {
    const m = model(eightNotes('See Note 3 and Note 8.'));
    const overrides: DocOverrides = { ...emptyOverrides(), hidden: { 'note-4': true } };
    const pkg = buildCanonicalPublishPackage(m, overrides);
    const pdfText = decodePdfText(pkg.pdfBytes);
    const docxText = extractDocxPlainText(pkg.docxBytes);

    expect(pdfText).toMatch(/Note 7/);
    expect(docxText).toMatch(/Note 7/);
    expect(pdfText).not.toMatch(/See Note 3 and Note 8/);
    expect(docxText).not.toMatch(/See Note 3 and Note 8/);
  });

  it('Signature rendering identical across prepare → PDF → DOCX', () => {
    const m = model(eightNotes('x'), {
      registered_name: 'Sig Identity Co',
      prepared_by: '',
      reviewed_by: '',
      approved_by: '',
      reporting_currency: 'ZAR',
    });
    const pkg = buildCanonicalPublishPackage(m, emptyOverrides());
    expect(pkg.view.signatures).toHaveLength(4);
    expect(pkg.view.signatures.every((s) => s.nameDisplay === '[Name]')).toBe(true);

    const pdfText = decodePdfText(pkg.pdfBytes);
    const docxText = extractDocxPlainText(pkg.docxBytes);
    expect(pdfText).toContain('[Name]');
    expect(docxText).toContain('[Name]');
    expect(pdfText).toContain('[Signature]');
    expect(docxText).toContain('[Signature]');
  });
});
