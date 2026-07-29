/**
 * V14.2 — Enterprise Reporting Knowledge Repository regression tests.
 */
import { describe, expect, it } from 'vitest';
import {
  ACTIVE_FRAMEWORK_VERSION,
  getFrameworkDefinition,
  getFrameworkKnowledgePack,
  getRepositoryCoverageSummary,
  inferDisclosureConditions,
  listFrameworkKnowledgePacks,
  listFrameworkKeys,
  measureChecklistCoverage,
  resolveExtensionNotes,
} from '../../src/lib/financialStatements/framework/frameworkContent';
import { assembleFrameworkDocument } from '../../src/lib/financialStatements/framework/frameworkContentEngine';

describe('V14.2 Enterprise Reporting Knowledge Repository', () => {
  it('registers versioned packs for every framework key', () => {
    for (const key of listFrameworkKeys()) {
      const pack = getFrameworkKnowledgePack(key);
      expect(pack.versionId).toBe(ACTIVE_FRAMEWORK_VERSION);
      expect(pack.contentRef).toContain(key);
      expect(pack.definition.notes.length).toBeGreaterThan(0);
      expect(pack.definition.policies.length).toBeGreaterThan(0);
      expect(pack.definition.versionId).toBe(ACTIVE_FRAMEWORK_VERSION);
    }
    expect(listFrameworkKnowledgePacks()).toHaveLength(4);
  });

  it('enriches IFRS for SMEs disclosures with checklist metadata', () => {
    const sme = getFrameworkDefinition('IFRS_SME');
    const basis = sme.notes.find((n) => n.code === 'DISC.BASIS');
    expect(basis?.framework).toBe('IFRS_SME');
    expect(basis?.frameworkVersion).toBe(ACTIVE_FRAMEWORK_VERSION);
    expect(basis?.checklistRefs?.length).toBeGreaterThan(0);
    expect(basis?.presentationHints?.sortOrder).toBeTypeOf('number');
    expect(basis?.category).toBeTruthy();
  });

  it('exposes certification checklist coverage without loading a PDF', () => {
    const coverage = measureChecklistCoverage();
    expect(coverage.applicable).toBeGreaterThan(0);
    expect(coverage.weightedPercent).toBeGreaterThan(0);
    expect(coverage.implemented + coverage.partial + coverage.notImplemented).toBe(coverage.applicable);
  });

  it('infers disclosure conditions from statement facts', () => {
    const conditions = inferDisclosureConditions([
      {
        lines: [
          { line_code: 'sfp.ppe', amount: 1000 },
          { line_code: 'sfp.leases', amount: 250 },
          { line_code: 'perf.total_revenue', amount: 5000 },
        ],
      },
    ]);
    expect(conditions.hasLeases).toBe(true);
    expect(conditions.hasFinancialInstruments).toBe(true);
    expect(conditions.hasShareCapital).toBe(true);
  });

  it('lets explicit overrides win over inferred conditions', () => {
    const conditions = inferDisclosureConditions(
      [{ lines: [{ line_code: 'sfp.leases', amount: 10 }] }],
      { hasLeases: false },
    );
    expect(conditions.hasLeases).toBe(false);
  });

  it('assembles conditional notes when inferred conditions are supplied', () => {
    const result = assembleFrameworkDocument({
      frameworkKey: 'IFRS',
      statements: [
        {
          id: 'sfp',
          kind: 'statement',
          statement_type: 'financial_position',
          title: 'SFP',
          lines: [{ line_code: 'sfp.leases', label: 'Leases', section: 'liabilities', amount: 100 }],
          populated: true,
        },
      ],
      context: {
        conditions: inferDisclosureConditions([
          { lines: [{ line_code: 'sfp.leases', amount: 100 }] },
        ]),
      },
    });
    expect(result.notes.some((n) => n.disclosure_code === 'DISC.LEASES')).toBe(true);
  });

  it('resolves industry extension notes from the repository', () => {
    const notes = resolveExtensionNotes('IFRS', { industryAgriculture: true });
    expect(notes.some((n) => n.code === 'DISC.BIOLOGICAL')).toBe(true);
  });

  it('reports repository coverage summary', () => {
    const summary = getRepositoryCoverageSummary();
    expect(summary.packCount).toBe(4);
    expect(summary.disclosureCount).toBeGreaterThan(50);
    expect(summary.policyCount).toBeGreaterThan(40);
    expect(summary.ifrsSmeChecklist.weightedPercent).toBeGreaterThan(0);
  });
});
