/**
 * V15.0 — Enterprise Accounts Production Composition Engine.
 */
import { describe, expect, it } from 'vitest';
import {
  composeDocument,
  DOCUMENT_PHASES,
  classifyStatementLine,
  disclosureCodeForLine,
  computeCompositionNoteNumbering,
  assembleAccountingPolicies,
  excludePolicyNotes,
} from '../../src/lib/financialStatements/composition';
import type { DocumentModel, DocNoteNode } from '../../src/lib/financialStatements/document/documentModel';
import { emptyOverrides, type DocOverrides } from '../../src/lib/financialStatements/document/documentStore';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import { buildCanonicalPublishPackage } from '../../src/lib/financialStatements/publication/canonicalDocumentPublish';
import { assembleFrameworkDocument } from '../../src/lib/financialStatements/framework/frameworkContentEngine';
import { inferDisclosureConditions } from '../../src/lib/financialStatements/framework/frameworkContent';
import { assembleSignatures } from '../../src/lib/financialStatements/document/signatureModel';
import { writeV15CompositionEvidence } from '../../tools/efs-v15-composition-evidence';

function makeNote(
  partial: Partial<DocNoteNode> & Pick<DocNoteNode, 'id' | 'disclosure_code' | 'title'>,
): DocNoteNode {
  return {
    kind: 'note',
    status: 'draft',
    requirement_level: 'required',
    sort_order: 100,
    sections: [],
    paragraphs: [{ id: `${partial.id}-p`, paragraph_code: 'P1', body: `${partial.title} disclosure.`, sort_order: 1 }],
    tables: [],
    ...partial,
  };
}

function sampleModel(): DocumentModel {
  const statements = [
    {
      id: 'financial_position',
      kind: 'statement' as const,
      statement_type: 'financial_position',
      title: 'Statement of Financial Position',
      populated: true,
      lines: [
        { line_code: 'sfp.ppe', label: 'Property, plant and equipment', section: 'assets', amount: 5000000 },
        { line_code: 'sfp.inventories', label: 'Inventories', section: 'assets', amount: 1200000 },
        { line_code: 'sfp.cash', label: 'Cash and cash equivalents', section: 'assets', amount: 800000 },
        { line_code: 'sfp.total_assets', label: 'Total assets', section: 'assets', amount: 7000000, is_total: true },
        { line_code: 'sfp.share_capital', label: 'Share capital', section: 'equity', amount: 1000000 },
        { line_code: 'sfp.retained_earnings', label: 'Retained earnings', section: 'equity', amount: 4200000 },
        { line_code: 'sfp.payables', label: 'Trade and other payables', section: 'liabilities', amount: 900000 },
        { line_code: 'sfp.borrowings', label: 'Borrowings', section: 'liabilities', amount: 900000 },
        {
          line_code: 'sfp.total_liabilities_and_equity',
          label: 'Total equity and liabilities',
          section: 'equity',
          amount: 7000000,
          is_total: true,
        },
      ],
    },
    {
      id: 'financial_performance',
      kind: 'statement' as const,
      statement_type: 'financial_performance',
      title: 'Statement of Profit or Loss and Other Comprehensive Income',
      populated: true,
      lines: [
        { line_code: 'perf.revenue', label: 'Revenue', section: 'income', amount: 12000000 },
        { line_code: 'perf.total_expenses', label: 'Expenses', section: 'income', amount: 9000000 },
        { line_code: 'perf.finance_costs', label: 'Finance costs', section: 'result', amount: 380000 },
        { line_code: 'perf.tax_expense', label: 'Tax expense', section: 'result', amount: 655000 },
        {
          line_code: 'perf.profit_before_tax',
          label: 'Profit before tax',
          section: 'result',
          amount: 2620000,
          is_total: true,
        },
      ],
    },
    {
      id: 'changes_in_equity',
      kind: 'statement' as const,
      statement_type: 'changes_in_equity',
      title: 'Statement of Changes in Equity',
      populated: true,
      lines: [
        { line_code: 'eq.opening', label: 'Opening equity', amount: 4200000, is_total: true },
        { line_code: 'eq.period_result', label: 'Profit for the period', amount: 1965000 },
        { line_code: 'eq.closing', label: 'Closing equity', amount: 6165000, is_total: true },
      ],
    },
    {
      id: 'cash_flows',
      kind: 'statement' as const,
      statement_type: 'cash_flows',
      title: 'Statement of Cash Flows',
      populated: true,
      lines: [
        { line_code: 'cf.operating', label: 'Net cash from operating activities', section: 'operating', amount: 2100000 },
        { line_code: 'cf.investing', label: 'Net cash from investing activities', section: 'investing', amount: -800000 },
        { line_code: 'cf.financing', label: 'Net cash from financing activities', section: 'financing', amount: -400000 },
      ],
    },
  ];

  const assembled = assembleFrameworkDocument({
    frameworkKey: 'IFRS_SME',
    statements,
    context: { conditions: inferDisclosureConditions(statements) },
  });

  const entity = {
    registered_name: 'Meridian Composition Holdings (Pty) Ltd',
    trading_name: 'Meridian Composition',
    registration_number: '2020/150015/07',
    reporting_currency: 'ZAR',
    nature_of_business: 'Wholesale distribution of industrial components.',
    registered_office: '1 Composition Way, Sandton, 2196',
    company_secretary: 'A. Secretary',
    auditor: 'Independent Audit Partners',
    directors: [{ name: 'T. Director' }, { name: 'R. Director' }],
  };

  return {
    companyId: 'co-v15',
    workspaceId: 'ws-v15',
    workspaceName: 'FY2026 Annual Financial Statements',
    frameworkPackId: 'pack-ifrs-sme',
    frameworkKey: 'IFRS_SME',
    frameworkLabel: 'IFRS for SMEs',
    entity: entity as DocumentModel['entity'],
    period: {
      label: 'Year ended 31 March 2026',
      period_key: 'FY2026',
      start_date: '2025-04-01',
      end_date: '2026-03-31',
    },
    statements,
    policySets: assembled.policySets,
    notes: assembled.notes,
    crossReferences: [],
    signatures: assembleSignatures(entity as never),
    trialBalanceCaptured: true,
    optionalDisclosures: assembled.optionalDisclosures,
    manualFields: assembled.manualFields,
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

describe('V15.0 — Document Phase Engine', () => {
  it('defines the six canonical document phases', () => {
    expect(DOCUMENT_PHASES).toHaveLength(6);
    expect(DOCUMENT_PHASES.map((p) => p.id)).toEqual([
      'front_matter',
      'primary_statements',
      'accounting_policies',
      'notes',
      'supplementary',
      'approval',
    ]);
  });

  it('composes all six phases into the document hierarchy', () => {
    const doc = composeDocument(sampleModel(), emptyOverrides());
    expect(doc.version).toBe('16.0');
    expect(doc.phases.map((p) => p.id)).toEqual([
      'front_matter',
      'primary_statements',
      'accounting_policies',
      'notes',
      'supplementary',
      'approval',
    ]);
    expect(doc.phases.every((p) => p.sections.length > 0)).toBe(true);
  });
});

describe('V15.0 — Accounting Policy Architecture', () => {
  it('assembles unique policies independent of disclosure notes', () => {
    const model = sampleModel();
    const policies = assembleAccountingPolicies(model.policySets);
    expect(policies.length).toBeGreaterThan(5);
    const keys = policies.map((p) => p.uniqueKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('excludes policy vessels from disclosure note stream', () => {
    const model = sampleModel();
    const disclosures = excludePolicyNotes(model.notes);
    expect(disclosures.every((n) => n.disclosure_code !== 'DISC.POLICIES')).toBe(true);
  });

  it('places policies once in Phase 3 of the composition', () => {
    const doc = composeDocument(sampleModel(), emptyOverrides());
    const phase = doc.phases.find((p) => p.id === 'accounting_policies')!;
    expect(phase.sections.some((s) => /Significant Accounting Policies/i.test(s.title))).toBe(true);
    expect(doc.accountingPolicies.length).toBeGreaterThan(0);
    expect(doc.numberedNotes.every((n) => n.disclosureCode !== 'DISC.POLICIES')).toBe(true);
  });
});

describe('V15.0 — Note Numbering Engine', () => {
  it('numbers notes from the final document without gaps or hardcoding', () => {
    const model = sampleModel();
    const numbering = computeCompositionNoteNumbering(model.notes, emptyOverrides());
    expect(numbering.visible.length).toBeGreaterThan(5);
    expect(numbering.visible.every((v, i) => v.noteNumber === i + 1)).toBe(true);
    expect(numbering.visible.some((v) => v.note.disclosure_code === 'DISC.POLICIES')).toBe(false);
  });

  it('renumbers automatically when notes are hidden', () => {
    const model = sampleModel();
    const numbering = computeCompositionNoteNumbering(model.notes, emptyOverrides());
    const mid = numbering.visible[2];
    const overrides: DocOverrides = {
      ...emptyOverrides(),
      hidden: { [mid.note.id]: true },
    };
    const next = computeCompositionNoteNumbering(model.notes, overrides);
    expect(next.visible.every((v, i) => v.noteNumber === i + 1)).toBe(true);
    expect(next.visible.map((v) => v.note.id)).not.toContain(mid.note.id);
    expect(next.visible.length).toBe(numbering.visible.length - 1);
  });
});

describe('V15.0 — Statement Classification Engine', () => {
  it('classifies SoFP, SoPL and cash-flow lines from metadata', () => {
    expect(
      classifyStatementLine('financial_position', {
        line_code: 'sfp.ppe',
        label: 'Property, plant and equipment',
        section: 'assets',
      }),
    ).toBe('non_current_assets');
    expect(
      classifyStatementLine('financial_position', {
        line_code: 'sfp.inventories',
        label: 'Inventories',
        section: 'assets',
      }),
    ).toBe('current_assets');
    expect(
      classifyStatementLine('financial_performance', {
        line_code: 'perf.revenue',
        label: 'Revenue',
        section: 'income',
      }),
    ).toBe('revenue');
    expect(
      classifyStatementLine('financial_performance', {
        line_code: 'perf.finance_costs',
        label: 'Finance costs',
        section: 'result',
      }),
    ).toBe('finance_costs');
    expect(
      classifyStatementLine('cash_flows', {
        line_code: 'cf.operating',
        label: 'Operating activities',
        section: 'operating',
      }),
    ).toBe('operating');
  });
});

describe('V15.0 — Disclosure Linking Engine', () => {
  it('links statement lines to disclosures automatically', () => {
    expect(disclosureCodeForLine('sfp.ppe')).toBe('DISC.PPE');
    expect(disclosureCodeForLine('perf.revenue')).toBe('DISC.REVENUE');
    expect(disclosureCodeForLine('cf.operating')).toBe('DISC.CASHFLOW');
  });

  it('injects automatic note references onto face statements', () => {
    const view = prepareCanonicalDocumentView(sampleModel(), emptyOverrides());
    const sfp = view.statements.find((s) => s.statement_type === 'financial_position')!;
    const ppe = sfp.lines.find((l) => l.line_code === 'sfp.ppe');
    expect(ppe?.note_ref).toBeTruthy();
    expect(Number(ppe?.note_ref)).toBeGreaterThan(0);
  });
});

describe('V15.0 — Document Sequencing + Publication', () => {
  it('sequences the document without manual ordering', () => {
    const doc = composeDocument(sampleModel(), emptyOverrides());
    const ids = doc.sequencedSections.map((s) => s.phaseId);
    const firstNote = ids.indexOf('notes');
    const firstPolicy = ids.indexOf('accounting_policies');
    const firstStmt = ids.indexOf('primary_statements');
    expect(firstStmt).toBeGreaterThan(-1);
    expect(firstPolicy).toBeGreaterThan(firstStmt);
    expect(firstNote).toBeGreaterThan(firstPolicy);
  });

  it('publishes PDF and DOCX from the composition model', () => {
    const model = sampleModel();
    const view = prepareCanonicalDocumentView(model, emptyOverrides());
    expect(view.composition.version).toBe('16.0');
    expect(view.accountingPolicies.length).toBeGreaterThan(0);

    const pkg = buildCanonicalPublishPackage(model, emptyOverrides());
    expect(pkg.pdfBytes.length).toBeGreaterThan(1000);
    expect(pkg.docxBytes.length).toBeGreaterThan(1000);

    const pdfText = decodePdfText(pkg.pdfBytes);
    expect(pdfText).toContain('Significant Accounting Policies');
    expect(pdfText).toContain('Notes to the Financial Statements');
    expect(pdfText).toContain('Corporate Information');
    expect(pdfText).toMatch(/Note \d+\./);
    expect(pdfText).toContain('Meridian Composition Holdings');
  });

  it('keeps Preview ≡ PDF ≡ DOCX structure fingerprint', () => {
    const model = sampleModel();
    const view = prepareCanonicalDocumentView(model, emptyOverrides());
    const pkg = buildCanonicalPublishPackage(model, emptyOverrides());
    expect(pkg.structureFingerprint).toBe(view.structureFingerprint);
  });

  it('writes V15 composition evidence pack', () => {
    const evidence = writeV15CompositionEvidence();
    expect(evidence.decision).toBe('READY FOR CERTIFICATION');
    expect(evidence.phases).toHaveLength(6);
    expect(evidence.pdfBytes).toBeGreaterThan(1000);
    expect(evidence.docxBytes).toBeGreaterThan(1000);
  });
});
