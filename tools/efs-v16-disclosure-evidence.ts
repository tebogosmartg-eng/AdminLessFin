/**
 * V16.0 — Enterprise Disclosure Intelligence Engine evidence generator (Node-only).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildV16SampleModel } from '../src/lib/financialStatements/composition/fixtures/v16SampleModel';
import { emptyOverrides } from '../src/lib/financialStatements/document/documentStore';
import { buildCanonicalPublishPackage } from '../src/lib/financialStatements/publication/canonicalDocumentPublish';
import { prepareCanonicalDocumentView } from '../src/lib/financialStatements/publication/canonicalDocumentView';
import { composeDocument } from '../src/lib/financialStatements/composition/compose';
import { MOVEMENT_SCHEDULE_DEFINITIONS } from '../src/lib/financialStatements/composition/movementScheduleEngine';
import { validateCompositionDocument } from '../src/lib/financialStatements/composition/disclosureValidation';
import { buildDependencyGraph, buildDisclosureMetadataIndex, fingerprintDocumentModel } from '../src/lib/financialStatements/composition/compositionCache';
import { allRegressionScenarioIds, buildRegressionScenarioModel } from '../src/lib/financialStatements/reportingIntelligence/sampleEntities';

export type V16DisclosureEvidence = {
  version: '16.0';
  decision: string;
  disclosureCount: number;
  movementScheduleCount: number;
  reconciliationCount: number;
  movementDefinitions: number;
  validationPassed: boolean;
  failedRules: string[];
  pdfBytes: number;
  docxBytes: number;
  structureFingerprint: string;
  sampleDisclosures: Array<{
    code: string;
    archetype: string;
    sections: number;
    components: number;
    movementSchedules: number;
    crossReferences: number;
  }>;
  /** Phase 12: Performance */
  performance: {
    cacheFingerprint: string;
    dependencyGraphSize: number;
    metadataIndexSize: number;
  };
  /** Phase 13: Regression */
  regressionResults: Array<{
    scenarioId: string;
    disclosureCount: number;
    pdfBytes: number;
    passed: boolean;
  }>;
};

export function writeV16DisclosureEvidence(
  outDir = join(process.cwd(), 'docs/enterprise-accounts-production/V16.0/evidence'),
): V16DisclosureEvidence {
  mkdirSync(outDir, { recursive: true });
  const model = buildV16SampleModel();
  const overrides = emptyOverrides();
  const doc = composeDocument(model, overrides);
  const view = prepareCanonicalDocumentView(model, overrides);
  const pkg = buildCanonicalPublishPackage(model, overrides);
  const validation = validateCompositionDocument(doc);

  const dependencyGraph = buildDependencyGraph(doc.enterpriseDisclosures);
  const metadataIndex = buildDisclosureMetadataIndex(doc.enterpriseDisclosures);
  const cacheFingerprint = fingerprintDocumentModel(model, overrides);

  const regressionResults = allRegressionScenarioIds().map((id) => {
    try {
      const rModel = buildRegressionScenarioModel(id);
      const rDoc = composeDocument(rModel, emptyOverrides());
      const rPkg = buildCanonicalPublishPackage(rModel, emptyOverrides());
      return { scenarioId: id, disclosureCount: rDoc.enterpriseDisclosures.length, pdfBytes: rPkg.pdfBytes.length, passed: true };
    } catch {
      return { scenarioId: id, disclosureCount: 0, pdfBytes: 0, passed: false };
    }
  });

  const evidence: V16DisclosureEvidence = {
    version: '16.0',
    decision: validation.passed && regressionResults.every((r) => r.passed) ? 'READY FOR CERTIFICATION' : 'VALIDATION ISSUES',
    disclosureCount: doc.enterpriseDisclosures.length,
    movementScheduleCount: doc.validationSummary.movementScheduleCount,
    reconciliationCount: doc.validationSummary.reconciliationCount,
    movementDefinitions: MOVEMENT_SCHEDULE_DEFINITIONS.length,
    validationPassed: validation.passed,
    failedRules: validation.failedRules,
    pdfBytes: pkg.pdfBytes.length,
    docxBytes: pkg.docxBytes.length,
    structureFingerprint: view.structureFingerprint,
    sampleDisclosures: doc.enterpriseDisclosures.slice(0, 8).map((d) => ({
      code: d.disclosureCode,
      archetype: d.archetype,
      sections: d.sections.length,
      components: d.sections.reduce((a, s) => a + s.libraryComponents.length, 0),
      movementSchedules: d.movementSchedules.length,
      crossReferences: d.crossReferences.length,
    })),
    performance: {
      cacheFingerprint,
      dependencyGraphSize: dependencyGraph.size,
      metadataIndexSize: metadataIndex.byCode.size,
    },
    regressionResults,
  };

  writeFileSync(join(outDir, 'disclosure_evidence.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(join(outDir, 'AFS_V16_Enterprise_Disclosure_Demo.pdf'), pkg.pdfBytes);
  return evidence;
}
