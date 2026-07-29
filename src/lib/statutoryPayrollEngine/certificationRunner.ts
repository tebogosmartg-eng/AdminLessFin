/**
 * Certification programme runner — V3.0.2 full gate.
 */

import { runPerformanceBenchmark } from './benchmark';
import { runCertificationSuite } from './certification';
import { runHistoricalCertification } from './historicalRecertification';
import { runStatutoryVerification } from './verify';

export type CertificationProgrammeResult = {
  verification: ReturnType<typeof runStatutoryVerification>;
  certification: ReturnType<typeof runCertificationSuite>;
  historical: ReturnType<typeof runHistoricalCertification>;
  benchmark: ReturnType<typeof runPerformanceBenchmark>;
};

export function runCertificationProgramme(): CertificationProgrammeResult {
  return {
    verification: runStatutoryVerification(),
    certification: runCertificationSuite(),
    historical: runHistoricalCertification(),
    benchmark: runPerformanceBenchmark(),
  };
}

export function formatProgrammeSummary(result: CertificationProgrammeResult): string {
  const failed = [
    ...result.verification.cases.filter((c) => !c.passed),
    ...result.certification.cases.filter((c) => !c.passed),
    ...result.historical.cases.filter((c) => !c.passed),
  ];
  return [
    '=== STATUTORY PAYROLL ENGINE CERTIFICATION V3.0.2 ===',
    `Verification:    ${result.verification.passed}/${result.verification.totalCases}`,
    `Certification:   ${result.certification.passed}/${result.certification.totalCases}`,
    `Historical:      ${result.historical.passed}/${result.historical.totalCases}`,
    `Benchmark stable: ${result.benchmark.allStable}`,
    failed.length ? `FAILED: ${failed.map((c) => c.id).join(', ')}` : 'ALL PASSED',
  ].join('\n');
}

export function certificationGatePassed(result: CertificationProgrammeResult): boolean {
  return (
    result.verification.failed === 0 &&
    result.certification.failed === 0 &&
    result.historical.failed === 0 &&
    result.benchmark.allStable
  );
}
