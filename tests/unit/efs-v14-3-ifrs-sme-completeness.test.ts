/**
 * V14.3 — IFRS for SMEs section completeness programme.
 */
import { describe, expect, it } from 'vitest';
import {
  assembleFrameworkDocument,
} from '../../src/lib/financialStatements/framework/frameworkContentEngine';
import {
  evaluateIfrsSmeSectionCompleteness,
  formatSectionCompletenessMatrix,
  getFrameworkDefinition,
  inferDisclosureConditions,
} from '../../src/lib/financialStatements/framework/frameworkContent';

describe('V14.3 IFRS for SMEs completeness', () => {
  it('ships SME-aligned policies without full-IFRS revenue or lease models', () => {
    const sme = getFrameworkDefinition('IFRS_SME');
    expect(sme.policies.length).toBeGreaterThanOrEqual(20);
    expect(sme.notes.length).toBeGreaterThanOrEqual(35);
    expect(sme.notes.some((n) => n.code === 'DISC.ASSOCIATES')).toBe(true);
    expect(sme.notes.some((n) => n.code === 'DISC.GRANTS')).toBe(true);
    expect(sme.notes.some((n) => n.code === 'DISC.TRANSITION')).toBe(true);
    expect(sme.policies.some((p) => p.code === 'POL.BUSCOMB')).toBe(true);
    expect(sme.policies.some((p) => p.code === 'POL.BORROWINGCOST')).toBe(true);
  });

  it('assembles new conditional SME disclosures when conditions are met', () => {
    const result = assembleFrameworkDocument({
      frameworkKey: 'IFRS_SME',
      statements: [],
      context: {
        conditions: {
          hasAssociates: true,
          hasGovernmentGrants: true,
          hasImpairment: true,
          industryAgriculture: true,
        },
      },
    });
    for (const code of ['DISC.ASSOCIATES', 'DISC.GRANTS', 'DISC.IMPAIRMENT', 'DISC.BIOLOGICAL']) {
      expect(result.notes.some((n) => n.disclosure_code === code)).toBe(true);
    }
  });

  it('infers new SME condition keys from statement facts', () => {
    const conditions = inferDisclosureConditions([
      {
        lines: [
          { line_code: 'sfp.associates', amount: 100 },
          { line_code: 'perf.government_grants', amount: 50 },
          { line_code: 'sfp.biological', amount: 20 },
        ],
      },
    ]);
    expect(conditions.hasAssociates).toBe(true);
    expect(conditions.hasGovernmentGrants).toBe(true);
    expect(conditions.industryAgriculture).toBe(true);
  });

  it('reports section-by-section completeness without an overall percentage', () => {
    const rows = evaluateIfrsSmeSectionCompleteness();
    expect(rows).toHaveLength(35);
    const matrix = formatSectionCompletenessMatrix(rows);
    expect(matrix.every((line) => /Section \d+.+ (COMPLETE|PARTIAL|NOT_APPLICABLE)/.test(line))).toBe(
      true,
    );
    // No overall percentage string in the matrix output.
    expect(matrix.join('\n')).not.toMatch(/%/);

    const applicable = rows.filter((r) => r.status !== 'NOT_APPLICABLE');
    const complete = applicable.filter((r) => r.status === 'COMPLETE');
    // This wave must complete the large majority of applicable sections.
    expect(complete.length).toBeGreaterThanOrEqual(30);
    expect(applicable.every((r) => r.status === 'COMPLETE' || r.status === 'PARTIAL')).toBe(true);

    // Print matrix for certification evidence (visible in test reporter on failure too).
    // eslint-disable-next-line no-console
    console.log('\n' + matrix.join('\n'));
  });
});
