/**
 * Critical Gap 2 — Enterprise Framework Content Engine regression tests.
 *
 * Proves that each framework (IFRS, IFRS for SMEs, GRAP, IPSAS) generates a
 * complete draft AFS (policies, mandatory notes, tables), that optional
 * disclosures are handled by conditional rules, that the Trial Balance populates
 * disclosure tables where supported, and that numbering / cross-references stay
 * correct with Preview == Published output.
 */
import { describe, expect, it } from 'vitest';
import type {
  DocumentModel,
  DocNoteNode,
  DocStatementNode,
} from '../../src/lib/financialStatements/document/documentModel';
import { assembleSignatures } from '../../src/lib/financialStatements/document/signatureModel';
import { emptyOverrides } from '../../src/lib/financialStatements/document/documentStore';
import {
  assembleFrameworkDocument,
  type FrameworkAssemblyResult,
} from '../../src/lib/financialStatements/framework/frameworkContentEngine';
import {
  getFrameworkDefinition,
  listFrameworkKeys,
  normaliseFrameworkKey,
  type FrameworkKey,
} from '../../src/lib/financialStatements/framework/frameworkContent';
import { MANUAL_FIELD_TOKEN } from '../../src/lib/financialStatements/framework/trialBalanceDisclosureMapping';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import {
  generateWorkspaceAfsPdf,
  workspacePdfToBytes,
} from '../../src/lib/financialStatements/publication/afsWorkspacePdf';
import { buildCanonicalPublishPackage } from '../../src/lib/financialStatements/publication/canonicalDocumentPublish';

const ENTITY = {
  registered_name: 'Framework Content Co',
  prepared_by: 'Ada Accountant',
  reviewed_by: 'Mo Manager',
  approved_by: 'Pat Partner',
  approval_date: '2026-06-30',
  reporting_currency: 'ZAR',
};

function statements(withFacts: boolean): DocStatementNode[] {
  const positionLines = withFacts
    ? [
        { line_code: 'sfp.ppe', label: 'Property, plant and equipment', section: 'assets', amount: 1500 },
        { line_code: 'sfp.ppe.prior', label: 'PPE prior', section: 'assets', amount: 1200 },
      ]
    : [];
  const performanceLines = withFacts
    ? [
        { line_code: 'perf.total_revenue', label: 'Revenue', section: 'income', amount: 8000 },
        { line_code: 'perf.nonexchange_revenue', label: 'Grants', section: 'income', amount: 3000 },
      ]
    : [];
  return [
    {
      id: 'financial_position',
      kind: 'statement',
      statement_type: 'financial_position',
      title: 'Statement of Financial Position',
      lines: positionLines,
      populated: withFacts,
    },
    {
      id: 'financial_performance',
      kind: 'statement',
      statement_type: 'financial_performance',
      title: 'Statement of Financial Performance',
      lines: performanceLines,
      populated: withFacts,
    },
  ];
}

function modelFrom(assembled: FrameworkAssemblyResult, stmts: DocStatementNode[]): DocumentModel {
  return {
    companyId: 'co-1',
    workspaceId: 'ws-fw-1',
    workspaceName: 'Framework engagement',
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
    trialBalanceCaptured: stmts.some((s) => s.populated),
    optionalDisclosures: assembled.optionalDisclosures,
    manualFields: assembled.manualFields,
  };
}

function mandatoryNotes(result: FrameworkAssemblyResult): DocNoteNode[] {
  return result.notes.filter((n) => n.requirement_level === 'mandatory');
}

describe('Critical Gap 2 — Framework key normalisation', () => {
  it('maps identifiers/labels to canonical framework keys', () => {
    expect(normaliseFrameworkKey('IFRS')).toBe('IFRS');
    expect(normaliseFrameworkKey('IFRS for SMEs')).toBe('IFRS_SME');
    expect(normaliseFrameworkKey('ifrs_sme')).toBe('IFRS_SME');
    expect(normaliseFrameworkKey('GRAP')).toBe('GRAP');
    expect(normaliseFrameworkKey('IPSAS')).toBe('IPSAS');
    expect(normaliseFrameworkKey(null)).toBe('IFRS');
  });

  it('does not turn the Modified Cash Standard into full IFRS', () => {
    // MCS matched none of the branches above and fell through to the IFRS
    // default, so an MCS engagement was assembled with full IFRS accrual
    // policies and notes and said nothing about it.
    expect(normaliseFrameworkKey('MCS')).toBe('MCS');
    expect(normaliseFrameworkKey('Modified Cash Standard')).toBe('MCS');
    expect(normaliseFrameworkKey('MCS Pack 2026.1')).toBe('MCS');

    const mcs = getFrameworkDefinition('MCS');
    const basis = mcs.policies.find((p) => p.code === 'POL.BASIS');
    expect(basis?.body).toMatch(/modified cash basis/i);
    expect(basis?.body).not.toMatch(/International Financial Reporting Standards/i);
    // The basis of accounting is the point of the standard: it must say so.
    expect(mcs.policies.some((p) => p.code === 'POL.EXPENDITURE_MCS')).toBe(true);
    expect(getFrameworkDefinition('IFRS').policies.find((p) => p.code === 'POL.BASIS')?.body)
      .not.toEqual(basis?.body);
  });

  it('framework definitions are immutable (deep frozen)', () => {
    const def = getFrameworkDefinition('IFRS');
    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.notes)).toBe(true);
    expect(() => {
      // @ts-expect-error intentional mutation attempt
      def.notes.push({});
    }).toThrow();
  });
});

describe.each(listFrameworkKeys())('Critical Gap 2 — %s pack generates complete draft AFS', (key: FrameworkKey) => {
  it('generates policies, mandatory notes and tables', () => {
    const result = assembleFrameworkDocument({ frameworkKey: key, statements: statements(true) });

    // Accounting policies generated.
    expect(result.policySets).toHaveLength(1);
    expect(result.policySets[0].policies.length).toBeGreaterThanOrEqual(4);
    expect(result.policySets[0].policies.every((p) => p.body.length > 0)).toBe(true);

    // Mandatory disclosures generated with headings + narratives.
    const mandatory = mandatoryNotes(result);
    expect(mandatory.length).toBeGreaterThanOrEqual(5);
    expect(mandatory.every((n) => n.title.length > 0)).toBe(true);
    expect(mandatory.every((n) => n.paragraphs.length > 0 || n.tables.length > 0)).toBe(true);

    // Disclosure tables generated (at least PPE).
    const withTables = result.notes.filter((n) => n.tables.length > 0);
    expect(withTables.length).toBeGreaterThanOrEqual(1);

    // Provenance flag on generated content.
    expect(result.notes.every((n) => n.source === 'framework')).toBe(true);
  });
});

describe('Policies apply only where the company has the item', () => {
  it('withholds specialised boilerplate policies when the facts do not support them', () => {
    const result = assembleFrameworkDocument({ frameworkKey: 'IFRS_SME', statements: statements(true) });
    const codes = result.policySets[0].policies.map((p) => p.policy_code);
    // A small trading company does not publish these.
    for (const gone of ['POL.HYPERINFLATION', 'POL.SBP', 'POL.BUSCOMB', 'POL.JOINTVENTURES', 'POL.INVPROP']) {
      expect(codes, `${gone} needs a supporting fact`).not.toContain(gone);
    }
    // The core policies always print, and judgements join them as 1.1.
    for (const kept of ['POL.BASIS', 'POL.JUDGEMENTS', 'POL.REVENUE', 'POL.FININST', 'POL.TAX']) {
      expect(codes).toContain(kept);
    }
  });

  it('includes a conditional policy the moment its condition is met', () => {
    const result = assembleFrameworkDocument({
      frameworkKey: 'IFRS_SME',
      statements: statements(true),
      context: { conditions: { hasInvestmentProperty: true } },
    });
    expect(result.policySets[0].policies.map((p) => p.policy_code)).toContain('POL.INVPROP');
  });
});

describe('Critical Gap 2 — Optional disclosures handled by conditional rules', () => {
  it('flags optional disclosures but does not insert them when conditions are unmet', () => {
    const result = assembleFrameworkDocument({ frameworkKey: 'IFRS', statements: statements(false) });
    expect(result.optionalDisclosures.length).toBeGreaterThan(0);
    const contingencies = result.optionalDisclosures.find((o) => o.code === 'DISC.CONTINGENT');
    expect(contingencies).toBeDefined();
    expect(contingencies?.included).toBe(false);
    expect(result.notes.some((n) => n.disclosure_code === 'DISC.CONTINGENT')).toBe(false);
  });

  it('inserts an optional disclosure when its condition is met', () => {
    const result = assembleFrameworkDocument({
      frameworkKey: 'IFRS',
      statements: statements(false),
      context: { conditions: { hasContingencies: true } },
    });
    const contingencies = result.optionalDisclosures.find((o) => o.code === 'DISC.CONTINGENT');
    expect(contingencies?.included).toBe(true);
    expect(result.notes.some((n) => n.disclosure_code === 'DISC.CONTINGENT')).toBe(true);
  });
});

describe('Critical Gap 2 — Trial Balance populates disclosure tables', () => {
  it('auto-fills mapped rows from facts and marks unmapped rows manual', () => {
    const result = assembleFrameworkDocument({ frameworkKey: 'IFRS', statements: statements(true) });
    const ppe = result.notes.find((n) => n.disclosure_code === 'DISC.PPE');
    expect(ppe).toBeDefined();
    const table = ppe?.tables[0];
    expect(table).toBeDefined();
    const rows = table?.rows_json as string[][];

    // Carrying amount populated from sfp.ppe fact (1,500.00).
    const carrying = rows.find((r) => r[0].startsWith('Carrying amount'));
    expect(carrying?.[1]).toBe('1,500.00');
    expect(carrying?.[2]).toBe('1,200.00');

    // Manual movement rows flagged with the manual token.
    const additions = rows.find((r) => r[0] === 'Additions');
    expect(additions?.[1]).toBe(MANUAL_FIELD_TOKEN);
    expect(result.manualFields.some((m) => m.label === 'Additions')).toBe(true);
  });

  it('marks the fact-mapped row as manual when no Trial Balance exists', () => {
    const result = assembleFrameworkDocument({ frameworkKey: 'IFRS', statements: statements(false) });
    const ppe = result.notes.find((n) => n.disclosure_code === 'DISC.PPE');
    const rows = ppe?.tables[0].rows_json as string[][];
    const carrying = rows.find((r) => r[0].startsWith('Carrying amount'));
    expect(carrying?.[1]).toBe(MANUAL_FIELD_TOKEN);
    expect(result.manualFields.some((m) => m.label.startsWith('Carrying amount'))).toBe(true);
  });
});

describe('Critical Gap 2 — Server engagement content takes precedence (immutability + editability)', () => {
  it('keeps an existing engagement note and does not duplicate it', () => {
    const serverNote: DocNoteNode = {
      id: 'srv-ppe',
      kind: 'note',
      disclosure_code: 'DISC.PPE',
      title: 'Property, plant and equipment (company)',
      status: 'draft',
      requirement_level: 'mandatory',
      sort_order: 40,
      sections: [],
      paragraphs: [
        { id: 'srv-ppe-p1', section_id: null, paragraph_code: 'P1', body: 'Company authored PPE note.', sort_order: 1 },
      ],
      tables: [],
      source: 'engagement',
    };
    const result = assembleFrameworkDocument({
      frameworkKey: 'IFRS',
      statements: statements(true),
      serverNotes: [serverNote],
    });
    const ppeNotes = result.notes.filter((n) => n.disclosure_code === 'DISC.PPE');
    expect(ppeNotes).toHaveLength(1);
    expect(ppeNotes[0].id).toBe('srv-ppe');
    expect(ppeNotes[0].paragraphs[0].body).toBe('Company authored PPE note.');
  });

  it('appends company-specific server notes not defined by the framework', () => {
    const companyNote: DocNoteNode = {
      id: 'srv-custom',
      kind: 'note',
      disclosure_code: 'DISC.COMPANY_SPECIFIC',
      title: 'Company specific disclosure',
      status: 'draft',
      requirement_level: 'mandatory',
      sort_order: 999,
      sections: [],
      paragraphs: [{ id: 'c1', section_id: null, paragraph_code: 'P1', body: 'Custom.', sort_order: 1 }],
      tables: [],
      source: 'engagement',
    };
    const result = assembleFrameworkDocument({
      frameworkKey: 'IFRS',
      statements: statements(true),
      serverNotes: [companyNote],
    });
    expect(result.notes.some((n) => n.id === 'srv-custom')).toBe(true);
  });
});

describe('Critical Gap 2 — Numbering, cross-references and Preview == Published', () => {
  it('numbers generated notes sequentially in the canonical view', () => {
    const result = assembleFrameworkDocument({ frameworkKey: 'IFRS', statements: statements(true) });
    const model = modelFrom(result, statements(true));
    const view = prepareCanonicalDocumentView(model, emptyOverrides());
    const numbers = view.notes.map((n) => n.noteNumber);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(numbers[0]).toBe(2); // the accounting policies are note 1
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it.each(listFrameworkKeys())('Preview PDF == Published PDF for %s', (key: FrameworkKey) => {
    const stmts = statements(true);
    const result = assembleFrameworkDocument({ frameworkKey: key, statements: stmts });
    const model = modelFrom(result, stmts);
    const overrides = emptyOverrides();

    const previewBytes = workspacePdfToBytes(generateWorkspaceAfsPdf(model, overrides));
    const published = buildCanonicalPublishPackage(model, overrides);
    expect(published.pdfBytes).toEqual(previewBytes);
    expect(published.structureFingerprint).toBe(
      prepareCanonicalDocumentView(model, overrides).structureFingerprint,
    );
  });
});

/**
 * Saving one piece of a note must not delete the rest of it.
 *
 * A framework note has no row of its own until something in it is saved. The
 * assembler used to ask "does this stored note have a body?" and, if it did,
 * discard the framework's content entirely. One saved table was enough — so
 * clicking Add table on Financial instruments deleted that note's standard
 * table and both its paragraphs, leaving only the empty table just added.
 */
describe('a note that has been partly authored', () => {
  const CODE = 'DISC.RELATED';
  const INSTANCE = 'c0ffee00-0000-4000-8000-000000000001';

  function assembleWith(serverNotes: DocNoteNode[]): FrameworkAssemblyResult {
    return assembleFrameworkDocument({
      frameworkKey: 'IFRS_SME',
      statements: statements(true),
      serverNotes,
      serverPolicySets: [],
    });
  }

  /** What the framework supplies for this note before anyone touches it. */
  function standard() {
    const note = assembleWith([]).notes.find((n) => n.disclosure_code === CODE);
    expect(note, 'the framework defines this note').toBeDefined();
    return note!;
  }

  it('keeps the standard wording and tables when one table is added', () => {
    const before = standard();
    expect(before.paragraphs.length + before.tables.length).toBeGreaterThan(1);

    const stored: DocNoteNode = {
      ...before,
      id: INSTANCE,
      // The engagement row holds only what was actually saved.
      sections: [],
      paragraphs: [],
      tables: [
        {
          id: 'c0ffee00-0000-4000-8000-000000000002',
          table_code: 'T1790000000000',
          title: 'New table',
          columns_json: [],
          rows_json: [],
          sort_order: 100,
        },
      ],
    };

    const after = assembleWith([stored]).notes.find((n) => n.disclosure_code === CODE)!;
    expect(after.paragraphs).toHaveLength(before.paragraphs.length);
    // The framework's own tables are still there, and the new one is with them.
    for (const t of before.tables) {
      expect(after.tables.some((x) => x.table_code === t.table_code)).toBe(true);
    }
    expect(after.tables.some((x) => x.title === 'New table')).toBe(true);
    expect(after.tables).toHaveLength(before.tables.length + 1);
  });

  it('lets authored wording win over the standard wording of the same code', () => {
    const before = standard();
    const first = before.paragraphs[0];
    expect(first, 'this note has standard wording').toBeDefined();

    const stored: DocNoteNode = {
      ...before,
      id: INSTANCE,
      sections: [],
      tables: [],
      paragraphs: [
        {
          id: 'c0ffee00-0000-4000-8000-000000000003',
          section_id: null,
          paragraph_code: first.paragraph_code,
          body: 'Our own wording for this note.',
          sort_order: 1,
        },
      ],
    };

    const after = assembleWith([stored]).notes.find((n) => n.disclosure_code === CODE)!;
    const mine = after.paragraphs.find((p) => p.paragraph_code === first.paragraph_code);
    expect(mine!.body).toBe('Our own wording for this note.');
    // And it did not cost the note its other standard paragraphs.
    expect(after.paragraphs).toHaveLength(before.paragraphs.length);
  });

  it('keeps an addition the framework does not define', () => {
    const before = standard();
    const stored: DocNoteNode = {
      ...before,
      id: INSTANCE,
      sections: [],
      tables: [],
      paragraphs: [
        {
          id: 'c0ffee00-0000-4000-8000-000000000004',
          section_id: null,
          paragraph_code: 'P1790000000001',
          body: 'A paragraph we added ourselves.',
          sort_order: 900,
        },
      ],
    };

    const after = assembleWith([stored]).notes.find((n) => n.disclosure_code === CODE)!;
    expect(after.paragraphs).toHaveLength(before.paragraphs.length + 1);
    expect(after.paragraphs[after.paragraphs.length - 1].body).toBe(
      'A paragraph we added ourselves.',
    );
  });
});
