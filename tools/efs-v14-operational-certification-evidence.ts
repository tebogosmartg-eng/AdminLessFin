/**
 * V14.4 — Operational certification evidence writer (Node-only).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OperationalCertificationReport } from '../src/lib/financialStatements/framework/knowledgeRepository/certification/operationalCertification';

export function writeCertificationEvidence(report: OperationalCertificationReport): string {
  const outDir = join(process.cwd(), 'docs/enterprise-accounts-production/V14.4/evidence');
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, 'operational_certification_report.json');
  writeFileSync(path, JSON.stringify(report, null, 2));

  const matrix = [
    '# V14.4 Operational Certification Evidence',
    '',
    `Generated: ${report.generatedAt}`,
    `Decision: ${report.decision}`,
    '',
    '## Scenarios',
    ...report.scenarios.map(
      (s) =>
        `- ${s.id}: ${s.pass ? 'PASS' : 'FAIL'} | notes=${s.noteCodes.length} policies=${s.policyCodes.length} pdf=${s.pdfBytes}B docx=${s.docxBytes}B pages=${s.pageCount}${s.failures.length ? ' | ' + s.failures.join('; ') : ''}`,
    ),
    '',
    '## Policies',
    ...report.policies.map((p) => `- ${p.code}: ${p.status}`),
    '',
    '## Disclosures',
    ...report.disclosures.map((d) => `- ${d.code}: ${d.status}`),
    '',
    '## Decision evidence',
    ...report.decisionEvidence.map((e) => `- ${e}`),
  ].join('\n');
  writeFileSync(join(outDir, 'OPERATIONAL_CERTIFICATION.md'), matrix);
  return path;
}
