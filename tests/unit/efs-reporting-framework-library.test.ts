/**
 * V13.1 — Enterprise Reporting Framework Library regression tests.
 *
 * Proves that the Framework Library is a standards-driven disclosure engine, not
 * a set of sample notes: structured accounting policies, conditional / required /
 * optional disclosure rules, a reusable table library, industry extension points,
 * configurable branding presentation metadata, and the absence of any placeholder,
 * TODO, Lorem Ipsum or bracket-instruction artifacts in the rendered document.
 */
import { describe, expect, it } from 'vitest';
import type {
  DocumentModel,
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
  resolveExtensionNotes,
  type FrameworkKey,
} from '../../src/lib/financialStatements/framework/frameworkContent';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import { ADMINLESS_FIN_BRAND } from '../../src/lib/financialStatements/publication/branding';
import {
  generateWorkspaceAfsPdf,
} from '../../src/lib/financialStatements/publication/afsWorkspacePdf';

const ENTITY = {
  registered_name: 'Enterprise Reporting Co (Pty) Ltd',
  registration_number: '2018/123456/07',
  prepared_by: 'Ada Accountant',
  reviewed_by: 'Mo Manager',
  approved_by: 'Pat Partner',
  approval_date: '2026-06-30',
  reporting_currency: 'ZAR',
  nature_of_business: 'the manufacture and distribution of industrial components',
  auditor: 'Independent Auditors Incorporated',
  directors: [{ name: 'A. Director' }, { name: 'B. Director' }],
};

function statements(): DocStatementNode[] {
  return [
    {
      id: 'financial_position',
      kind: 'statement',
      statement_type: 'financial_position',
      title: 'Statement of Financial Position',
      lines: [
        { line_code: 'sfp.ppe', label: 'Property, plant and equipment', section: 'assets', amount: 1500 },
        { line_code: 'sfp.ppe.prior', label: 'PPE prior', section: 'assets', amount: 1200 },
      ],
      populated: true,
    },
    {
      id: 'financial_performance',
      kind: 'statement',
      statement_type: 'financial_performance',
      title: 'Statement of Profit or Loss and Other Comprehensive Income',
      lines: [
        { line_code: 'perf.total_revenue', label: 'Revenue', section: 'income', amount: 8000 },
      ],
      populated: true,
    },
  ];
}

function modelFrom(assembled: FrameworkAssemblyResult, stmts: DocStatementNode[]): DocumentModel {
  return {
    companyId: 'co-1',
    workspaceId: 'ws-1',
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
    trialBalanceCaptured: true,
    optionalDisclosures: assembled.optionalDisclosures,
    manualFields: assembled.manualFields,
  };
}

/** Decode text drawn in a PDF string (matches the certification harness). */
function decodePdfText(pdf: string): string {
  const texts: string[] = [];
  const re = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pdf))) {
    const inner = m[0].slice(1, m[0].lastIndexOf(')'));
    texts.push(inner.replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\'));
  }
  return texts.join('\n');
}

describe('V13.1 — Framework library structure', () => {
  it('every framework exposes statements, policies, notes and extension points', () => {
    for (const key of listFrameworkKeys()) {
      const def = getFrameworkDefinition(key);
      expect(def.statements.length).toBe(4);
      expect(def.policies.length).toBeGreaterThanOrEqual(8);
      expect(def.notes.length).toBeGreaterThanOrEqual(10);
      expect(def.extensionPoints.length).toBeGreaterThanOrEqual(1);
      expect(def.scope.length).toBeGreaterThan(0);
    }
  });

  it('accounting policies are structured (recognition / measurement lifecycle)', () => {
    const def = getFrameworkDefinition('IFRS');
    const ppe = def.policies.find((p) => p.code === 'POL.PPE');
    expect(ppe).toBeDefined();
    expect(ppe?.recognition).toBeTruthy();
    expect(ppe?.initialMeasurement).toBeTruthy();
    expect(ppe?.subsequentMeasurement).toBeTruthy();
    expect(ppe?.derecognition).toBeTruthy();
    // Composed body is flowing professional prose (no robotic lifecycle labels).
    expect(ppe?.body).toContain('recognised as an asset');
    expect(ppe?.body).toContain('carried at cost less accumulated depreciation');
    expect(ppe?.body).not.toContain('Recognition —');
    expect(ppe?.standards).toContain('IAS 16');
  });

  it('IFRS for SMEs applies an SME-aligned profile distinct from full IFRS', () => {
    const full = getFrameworkDefinition('IFRS');
    const sme = getFrameworkDefinition('IFRS_SME');
    // SME omits the standalone deferred-tax analysis note used under full IFRS.
    expect(sme.notes.some((n) => n.code === 'DISC.DEFERREDTAX')).toBe(false);
    expect(full.notes.some((n) => n.code === 'DISC.DEFERREDTAX')).toBe(true);
    // SME policies cite the IFRS for SMEs, not IFRS 15 / IFRS 16.
    const revenue = sme.policies.find((p) => p.code === 'POL.REVENUE');
    const leases = sme.policies.find((p) => p.code === 'POL.LEASES');
    expect(revenue?.standards?.some((s) => /IFRS for SMEs/i.test(s))).toBe(true);
    expect(leases?.standards?.some((s) => /IFRS for SMEs/i.test(s))).toBe(true);
    expect(revenue?.body).not.toMatch(/performance obligation/i);
    expect(leases?.body).toMatch(/finance leases|operating leases/i);
  });

  it('public-sector frameworks disclose non-exchange revenue', () => {
    for (const key of ['GRAP', 'IPSAS'] as FrameworkKey[]) {
      const def = getFrameworkDefinition(key);
      expect(def.notes.some((n) => n.code === 'DISC.REVENUE_NONEXCHANGE')).toBe(true);
    }
  });
});

describe('V13.1 — Conditional, required and optional disclosure rules', () => {
  it('conditional disclosures are inserted only when their trigger is present', () => {
    const without = assembleFrameworkDocument({ frameworkKey: 'IFRS', statements: statements() });
    expect(without.notes.some((n) => n.disclosure_code === 'DISC.LEASES')).toBe(false);

    const withLeases = assembleFrameworkDocument({
      frameworkKey: 'IFRS',
      statements: statements(),
      context: { conditions: { hasLeases: true } },
    });
    const leases = withLeases.notes.find((n) => n.disclosure_code === 'DISC.LEASES');
    expect(leases).toBeDefined();
    expect(leases?.tables.length).toBeGreaterThanOrEqual(1);
    expect(leases?.tables[0].title).toContain('maturity');
  });

  it('required disclosures are always assembled', () => {
    const result = assembleFrameworkDocument({ frameworkKey: 'IFRS', statements: statements() });
    for (const code of ['DISC.BASIS', 'DISC.POLICIES', 'DISC.JUDGEMENTS', 'DISC.REVENUE', 'DISC.PPE', 'DISC.RELATED', 'DISC.EVENTS', 'DISC.TAX']) {
      expect(result.notes.some((n) => n.disclosure_code === code)).toBe(true);
    }
  });

  it('a note may carry multiple narratives and multiple tables', () => {
    const result = assembleFrameworkDocument({ frameworkKey: 'IFRS', statements: statements() });
    const related = result.notes.find((n) => n.disclosure_code === 'DISC.RELATED');
    expect(related).toBeDefined();
    expect(related?.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(related?.tables.length).toBe(2);
    // Multiple tables receive distinct table codes.
    const codes = new Set(related?.tables.map((t) => t.table_code));
    expect(codes.size).toBe(related?.tables.length);
  });
});

describe('V13.1 — Industry extension points', () => {
  it('activates industry-specific disclosures on demand', () => {
    const notes = resolveExtensionNotes('IFRS', { industryAgriculture: true });
    expect(notes.some((n) => n.code === 'DISC.BIOLOGICAL')).toBe(true);

    const result = assembleFrameworkDocument({
      frameworkKey: 'IFRS',
      statements: statements(),
      context: { conditions: { industryAgriculture: true } },
    });
    expect(result.notes.some((n) => n.disclosure_code === 'DISC.BIOLOGICAL')).toBe(true);
  });

  it('does not activate extensions when their condition is absent', () => {
    const result = assembleFrameworkDocument({ frameworkKey: 'IFRS', statements: statements() });
    expect(result.notes.some((n) => n.disclosure_code === 'DISC.BIOLOGICAL')).toBe(false);
  });
});

describe('V13.1 — Branding is presentation metadata only', () => {
  it('exposes the AdminLess Fin brand in the canonical view', () => {
    const result = assembleFrameworkDocument({ frameworkKey: 'IFRS', statements: statements() });
    const view = prepareCanonicalDocumentView(modelFrom(result, statements()), emptyOverrides());
    expect(view.presentation.branding.brandName).toBe(ADMINLESS_FIN_BRAND.brandName);
    expect(view.presentation.branding.primaryHex).toBe(ADMINLESS_FIN_BRAND.primaryHex);
    expect(view.presentation.natureOfBusiness).toContain('industrial components');
    expect(view.presentation.directors.length).toBe(2);
  });

  it('branding is excluded from the structure fingerprint', () => {
    const result = assembleFrameworkDocument({ frameworkKey: 'IFRS', statements: statements() });
    const view = prepareCanonicalDocumentView(modelFrom(result, statements()), emptyOverrides());
    // The fingerprint captures notes, statements and signatures — not branding.
    expect(view.structureFingerprint).not.toContain('AdminLess Fin');
    expect(view.structureFingerprint).not.toContain(ADMINLESS_FIN_BRAND.primaryHex);
  });
});

describe('V13.1 — No placeholder or development artifacts in the rendered AFS', () => {
  it.each(listFrameworkKeys())('rendered PDF for %s contains only professional content', (key: FrameworkKey) => {
    const result = assembleFrameworkDocument({
      frameworkKey: key,
      statements: statements(),
      // Turn on a broad set of disclosures to exercise the full library.
      context: {
        conditions: {
          hasIntangibleAssets: true,
          hasInventories: true,
          hasReceivables: true,
          hasLeases: true,
          hasBorrowings: true,
          hasProvisions: true,
          hasContingencies: true,
          hasCommitments: true,
          hasFinancialInstruments: true,
          hasApprovedBudget: true,
        },
      },
    });
    const model = modelFrom(result, statements());
    const text = decodePdfText(generateWorkspaceAfsPdf(model, emptyOverrides())).toLowerCase();

    expect(text.includes('lorem ipsum')).toBe(false);
    expect(text.includes('todo')).toBe(false);
    expect(text.includes('placeholder')).toBe(false);
    expect(text.includes('sample')).toBe(false);
    // No bracketed authoring instructions left in the document.
    expect(/\[describe|\[insert|\[list|\[disclose|\[this page/.test(text)).toBe(false);
    // No raw disclosure codes leak into the rendered text.
    expect(/\bdisc\.[a-z0-9_.]+/.test(text)).toBe(false);
    // Genuine statutory content is present.
    expect(text.includes('basis of preparation')).toBe(true);
    expect(text.includes('related part')).toBe(true);
  });
});
