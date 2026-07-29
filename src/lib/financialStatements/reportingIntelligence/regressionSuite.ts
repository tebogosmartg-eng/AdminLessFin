/**
 * V17.0 — Reporting Intelligence regression suite (browser-safe).
 */
import { emptyOverrides } from '../document/documentStore';
import { buildCanonicalPublishPackage } from '../publication/canonicalDocumentPublish';
import { prepareCanonicalDocumentView } from '../publication/canonicalDocumentView';
import { produceReportingPackage } from './orchestrator';
import { allRegressionScenarioIds, buildRegressionScenarioModel } from './sampleEntities';
import type { RegressionScenarioResult } from './types';

export function runRegressionSuite(): RegressionScenarioResult[] {
  const overrides = emptyOverrides();
  return allRegressionScenarioIds().map((scenarioId) => {
    const model = buildRegressionScenarioModel(scenarioId);
    const pkg = produceReportingPackage(model, overrides);
    const view = prepareCanonicalDocumentView(model, overrides);
    const publishPkg = buildCanonicalPublishPackage(model, overrides);

    const orderedCodes = pkg.orderedDisclosureCodes;
    const orderingValid = orderedCodes.length > 0 && new Set(orderedCodes).size === orderedCodes.length;

    return {
      scenarioId,
      entityProfile: pkg.entityProfile,
      disclosureCount: pkg.composition.numberedNotes.length,
      suppressedCount: pkg.disclosureDecisions.filter((d) => d.shouldSuppress).length,
      expandedCount: pkg.disclosureDecisions.filter((d) => d.shouldExpand).length,
      orderingValid,
      consistencyPassed: pkg.consistency.passed,
      certified: pkg.certified,
      pdfBytes: publishPkg.pdfBytes.byteLength,
      docxBytes: publishPkg.docxBytes.byteLength,
      corporateInformationValid: pkg.corporateInformation.validation.passed,
      levelOfAssurance: pkg.corporateInformation.levelOfAssurance.formatted || '',
    };
  });
}
