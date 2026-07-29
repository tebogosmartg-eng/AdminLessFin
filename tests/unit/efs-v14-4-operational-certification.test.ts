/**
 * V14.4 — Enterprise IFRS for SMEs Operational Certification.
 */
import { describe, expect, it } from 'vitest';
import {
  CERTIFICATION_SCENARIOS,
  runOperationalCertification,
} from '../../src/lib/financialStatements/framework/knowledgeRepository/certification/operationalCertification';
import { writeCertificationEvidence } from '../../tools/efs-v14-operational-certification-evidence';

describe('V14.4 Enterprise IFRS for SMEs Operational Certification', () => {
  const report = runOperationalCertification();
  writeCertificationEvidence(report);

  it('executes every certification scenario', () => {
    expect(CERTIFICATION_SCENARIOS).toHaveLength(20);
    expect(report.scenarios).toHaveLength(20);
  });

  it('publishes PDF and DOCX for every scenario without manual editing', () => {
    expect(report.publication.scenariosPublished).toBe(20);
    expect(report.publication.pdfCertified).toBe(true);
    expect(report.publication.docxCertified).toBe(true);
  });

  it('passes every end-to-end scenario', () => {
    const failed = report.scenarios.filter((s) => !s.pass);
    expect(failed, failed.map((f) => `${f.id}: ${f.failures.join('; ')}`).join('\n')).toEqual([]);
  });

  it('certifies every accounting policy', () => {
    const failed = report.policies.filter((p) => p.status === 'FAILED');
    expect(failed, failed.map((f) => f.code).join(', ')).toEqual([]);
    expect(report.policies.every((p) => p.status === 'CERTIFIED')).toBe(true);
  });

  it('certifies every disclosure as CERTIFIED or NOT_APPLICABLE (none FAILED)', () => {
    const failed = report.disclosures.filter((d) => d.status === 'FAILED');
    expect(failed, failed.map((f) => f.code).join(', ')).toEqual([]);
  });

  it('records an enterprise release decision', () => {
    expect(['CERTIFIED FOR PRODUCTION', 'CONDITIONALLY CERTIFIED', 'NOT CERTIFIED']).toContain(
      report.decision,
    );
    // Prefer production certification when the operational suite is green.
    expect(report.decision).toBe('CERTIFIED FOR PRODUCTION');
  });
});
