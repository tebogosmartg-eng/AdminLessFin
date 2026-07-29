/**
 * V13.0 — Professional Statutory Renderer regression tests.
 *
 * Verifies professional statement/note/table rendering, automatic page breaks,
 * multi-page notes with continuation headings, header/footer consistency, the
 * statutory document structure, and Preview == PDF == DOCX.
 */
import { describe, expect, it } from 'vitest';
import type {
  DocumentModel,
  DocNoteNode,
} from '../../src/lib/financialStatements/document/documentModel';
import { assembleSignatures } from '../../src/lib/financialStatements/document/signatureModel';
import { emptyOverrides } from '../../src/lib/financialStatements/document/documentStore';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import {
  generateWorkspaceAfsPdf,
  workspacePdfToBytes,
} from '../../src/lib/financialStatements/publication/afsWorkspacePdf';
import {
  buildCanonicalPublishPackage,
  extractDocxPlainText,
} from '../../src/lib/financialStatements/publication/canonicalDocumentPublish';

function decodePdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const matches = [...raw.matchAll(/\((?:\\.|[^\\)])*\)/g)];
  return matches
    .map((m) => m[0].slice(1, -1).replace(/\\n/g, '\n').replace(/\\([()\\])/g, '$1'))
    .join('\n');
}

function pageCount(pdfString: string): number {
  return (pdfString.match(/\/MediaBox/g) || []).length;
}

function makeNote(
  partial: Partial<DocNoteNode> & Pick<DocNoteNode, 'id' | 'disclosure_code' | 'title' | 'sort_order'>,
): DocNoteNode {
  return {
    kind: 'note',
    status: 'draft',
    requirement_level: 'mandatory',
    sections: [],
    paragraphs: [],
    tables: [],
    ...partial,
  };
}

const ENTITY = {
  registered_name: 'Statutory Render Co (Pty) Ltd',
  registration_number: '2019/123456/07',
  trading_name: 'StatRender',
  prepared_by: 'Ada Accountant',
  reviewed_by: 'Mo Manager',
  approved_by: 'Pat Partner',
  reporting_currency: 'ZAR',
};

function buildModel(): DocumentModel {
  const notes: DocNoteNode[] = [
    makeNote({
      id: 'note-basis',
      disclosure_code: 'DISC.BASIS',
      title: 'Basis of preparation',
      sort_order: 10,
      paragraphs: [
        { id: 'nb-p1', section_id: null, paragraph_code: 'P1', body: 'These financial statements have been prepared on the going concern basis. Refer to Note 2.', sort_order: 1 },
      ],
    }),
    makeNote({
      id: 'note-ppe',
      disclosure_code: 'DISC.PPE',
      title: 'Property, plant and equipment',
      sort_order: 20,
      paragraphs: [
        { id: 'np-p1', section_id: null, paragraph_code: 'P1', body: 'The carrying amount is reconciled below.', sort_order: 1 },
      ],
      tables: [
        {
          id: 'np-t1',
          table_code: 'PPE.TBL',
          title: 'Property, plant and equipment',
          columns_json: ['Description', 'Current year', 'Prior year'],
          rows_json: [
            ['Carrying amount at end of year', '1,500.00', '1,200.00'],
            ['Additions', '300.00', '150.00'],
            ['Total movement', '450.00', '300.00'],
          ],
          sort_order: 1,
        },
      ],
    }),
    // A long note to force an automatic page break + continuation heading.
    makeNote({
      id: 'note-long',
      disclosure_code: 'DISC.LONG',
      title: 'Detailed accounting policies',
      sort_order: 30,
      paragraphs: Array.from({ length: 60 }, (_, i) => ({
        id: `nl-p${i}`,
        section_id: null,
        paragraph_code: `P${i}`,
        body: `Policy clause ${i + 1}: the entity applies this accounting policy consistently across all periods presented in the financial statements.`,
        sort_order: i + 1,
      })),
    }),
  ];

  return {
    companyId: 'co-1',
    workspaceId: 'ws-render-1',
    workspaceName: 'Statutory render engagement',
    frameworkPackId: 'pack-1',
    frameworkKey: 'IFRS_SME',
    frameworkLabel: 'IFRS for SMEs',
    entity: ENTITY as DocumentModel['entity'],
    period: { label: 'FY2026', start_date: '2025-04-01', end_date: '2026-03-31' },
    statements: [
      {
        id: 'financial_position',
        kind: 'statement',
        statement_type: 'financial_position',
        title: 'Statement of Financial Position',
        lines: [
          { line_code: 'sfp.ppe', label: 'Property, plant and equipment', section: 'assets', amount: 1500 },
          { line_code: 'sfp.cash', label: 'Cash and cash equivalents', section: 'assets', amount: 800 },
          { line_code: 'sfp.total_assets', label: 'Total assets', section: 'assets', amount: 2300, is_total: true },
        ],
        populated: true,
      },
      {
        id: 'financial_performance',
        kind: 'statement',
        statement_type: 'financial_performance',
        title: 'Statement of Profit or Loss and Other Comprehensive Income',
        lines: [
          { line_code: 'perf.revenue', label: 'Revenue', section: 'income', amount: 8000 },
          { line_code: 'perf.profit', label: 'Profit for the year', section: 'income', amount: 1200, is_total: true },
        ],
        populated: true,
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
    signatures: assembleSignatures(ENTITY as never),
    trialBalanceCaptured: true,
  };
}

describe('V13.0 — Professional statutory PDF', () => {
  const model = buildModel();
  const overrides = emptyOverrides();
  const pkg = buildCanonicalPublishPackage(model, overrides);
  const pdfText = decodePdfText(pkg.pdfBytes);

  it('renders a premium cover page (company, registration, title, framework)', () => {
    expect(pdfText).toContain('Statutory Render Co (Pty) Ltd');
    expect(pdfText).toMatch(/Registration number: 2019\/123456\/07/);
    expect(pdfText).toContain('Annual Financial Statements');
    expect(pdfText).toMatch(/IFRS for SMEs/);
  });

  it('renders contents and full statutory document structure', () => {
    expect(pdfText).toContain('Contents');
    expect(pdfText).toMatch(/Directors' Responsibilities and Approval/);
    expect(pdfText).toMatch(/Directors' Report/);
    expect(pdfText).toMatch(/Independent Auditor's Report/);
    expect(pdfText).toContain('Notes to the Financial Statements');
    expect(pdfText).toContain('Significant Accounting Policies');
    expect(pdfText).toContain('Supplementary Information');
    expect(pdfText).toContain('Approval of Annual Financial Statements');
  });

  it('renders every statement professionally with Note column, figures and totals', () => {
    expect(pdfText).toContain('Statement of Financial Position');
    expect(pdfText).toContain('Notes'); // column header
    expect(pdfText).toContain('2,300.00'); // total figure
    expect(pdfText).toContain('Total assets');
    // Empty statements show the professional placeholder.
    expect(pdfText).toMatch(/Figures will be presented in this statement once the trial\s+balance/);
  });

  it('renders notes and professional disclosure tables', () => {
    expect(pdfText).toContain('Property, plant and equipment');
    expect(pdfText).toContain('Current year');
    expect(pdfText).toContain('Prior year');
    expect(pdfText).toContain('1,500.00');
    expect(pdfText).toContain('Total movement');
  });

  it('applies automatic page breaks and multi-page note continuation headings', () => {
    expect(pageCount(pkg.pdfString)).toBeGreaterThan(8);
    expect(pdfText).toMatch(/\(continued\)/);
  });

  it('applies a consistent running header and footer with page numbers', () => {
    expect(pdfText).toContain('AdminLess Fin');
    // The cover is page 1 and carries no footer; numbered footers begin at page 2.
    expect(pdfText).toMatch(/2 \/ \d+/);
    expect(pdfText).toMatch(/3 \/ \d+/);
    const total = pageCount(pkg.pdfString);
    expect(pdfText).toContain(`${total} / ${total}`);
  });
});

describe('V13.0 — Preview == PDF == DOCX', () => {
  const model = buildModel();
  const overrides = emptyOverrides();

  it('preview PDF bytes equal published PDF bytes', () => {
    const previewBytes = workspacePdfToBytes(generateWorkspaceAfsPdf(model, overrides));
    const pkg = buildCanonicalPublishPackage(model, overrides);
    expect(pkg.pdfBytes).toEqual(previewBytes);
    expect(pkg.structureFingerprint).toBe(
      prepareCanonicalDocumentView(model, overrides).structureFingerprint,
    );
  });

  it('published DOCX carries the same professional structure and content', () => {
    const pkg = buildCanonicalPublishPackage(model, overrides);
    const docxText = extractDocxPlainText(pkg.docxBytes);
    expect(docxText).toContain('Statutory Render Co (Pty) Ltd');
    expect(docxText).toContain('Statement of Financial Position');
    expect(docxText).toContain('Notes to the Financial Statements');
    expect(docxText).toContain('Significant Accounting Policies');
    expect(docxText).toContain('Supplementary Information');
    expect(docxText).toContain('Approval of Annual Financial Statements');
    expect(docxText).toContain('AdminLess Fin');
    // Table content is present in DOCX.
    expect(docxText).toContain('Current year');
    expect(docxText).toContain('1,500.00');
    // Every note heading appears.
    for (const note of pkg.view.notes) expect(docxText).toContain(note.heading);
  });
});
