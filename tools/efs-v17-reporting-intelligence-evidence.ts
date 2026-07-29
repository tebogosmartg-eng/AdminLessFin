/**
 * V17.0 — Reporting Intelligence evidence generator (Node-only).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyOverrides } from '../src/lib/financialStatements/document/documentStore';
import { runRegressionSuite } from '../src/lib/financialStatements/reportingIntelligence/regressionSuite';
import { buildRegressionScenarioModel } from '../src/lib/financialStatements/reportingIntelligence/sampleEntities';
import { produceReportingPackage } from '../src/lib/financialStatements/reportingIntelligence/orchestrator';
import type { RegressionScenarioResult } from '../src/lib/financialStatements/reportingIntelligence/types';

export type V17ReportingIntelligenceEvidence = {
  version: '17.0';
  decision: string;
  entityProfiles: Record<string, string>;
  regressionResults: RegressionScenarioResult[];
  allCertified: boolean;
  totalScenarios: number;
  passedScenarios: number;
  contractFingerprint: string;
};

export function writeV17ReportingIntelligenceEvidence(
  outDir = join(process.cwd(), 'docs/enterprise-accounts-production/V17.0/evidence'),
): V17ReportingIntelligenceEvidence {
  mkdirSync(outDir, { recursive: true });

  const regressionResults = runRegressionSuite();
  const passedScenarios = regressionResults.filter((r) => r.certified).length;
  const allCertified = passedScenarios === regressionResults.length;

  const sampleModel = buildRegressionScenarioModel('manufacturing_entity');
  const samplePkg = produceReportingPackage(sampleModel, emptyOverrides());

  const evidence: V17ReportingIntelligenceEvidence = {
    version: '17.0',
    decision: allCertified ? 'READY FOR CERTIFICATION' : 'VALIDATION ISSUES',
    entityProfiles: Object.fromEntries(
      regressionResults.map((r) => [
        r.scenarioId,
        `${r.entityProfile.size} / ${r.entityProfile.industry}`,
      ]),
    ),
    regressionResults,
    allCertified,
    totalScenarios: regressionResults.length,
    passedScenarios,
    contractFingerprint: samplePkg.publicationContract.contractFingerprint,
  };

  writeFileSync(join(outDir, 'REPORTING_INTELLIGENCE_EVIDENCE.json'), JSON.stringify(evidence, null, 2));
  return evidence;
}
