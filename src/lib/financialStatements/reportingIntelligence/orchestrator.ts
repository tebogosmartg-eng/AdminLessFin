/**
 * V17.0 — Reporting Intelligence Orchestrator.
 *
 * Decision-making layer above the Composition Engine.
 * Pipeline: Composition → Reporting Intelligence → Publication
 */
import { composeDocument } from '../composition/compose';
import type { CompositionDocument } from '../composition/types';
import type { DocumentModel } from '../document/documentModel';
import type { DocOverrides } from '../document/documentStore';
import { evaluateConditionalDisclosures } from '../composition/conditionalDisclosureEngine';
import { validateCompositionDocument } from '../composition/disclosureValidation';
import { applyIntelligenceToComposition } from './applyIntelligence';
import { validateConsistency } from './consistencyEngine';
import { makeDisclosureDecisions } from './disclosureDecisionEngine';
import { profileEntity } from './entityProfilingEngine';
import { assessMateriality } from './materialityEngine';
import { orderDisclosures } from './orderingEngine';
import { buildPublicationContract } from './publicationContract';
import { determineStatementPresentation } from './statementPresentationEngine';
import type { ReportingPackage } from './types';

/** Optional enterprise inputs for reporting intelligence (G3.6C). */
export type ReportingIntelligenceOptions = {
  /** Percentage threshold from company_materiality_settings (e.g. 5 = 5%). */
  companyMaterialityPercentage?: number | null;
};

/**
 * Produce the complete reporting intelligence package.
 * This is the sole entry point for automatic financial statement determination.
 */
export function produceReportingPackage(
  model: DocumentModel,
  overrides: DocOverrides,
  options?: ReportingIntelligenceOptions,
): ReportingPackage {
  const baseComposition = composeDocument(model, overrides);

  const entityProfile = profileEntity(model);
  const conditional = evaluateConditionalDisclosures(model);
  const materiality = assessMateriality(
    model,
    entityProfile,
    conditional.conditions,
    options?.companyMaterialityPercentage,
  );
  const disclosureDecisions = makeDisclosureDecisions(
    model,
    entityProfile,
    materiality,
    conditional.conditions,
  );
  const statementPresentation = determineStatementPresentation(model, entityProfile);

  const allCodes = model.notes.map((n) => n.disclosure_code);
  const { orderedCodes } = orderDisclosures(
    allCodes,
    entityProfile,
    materiality,
    disclosureDecisions,
  );

  const refinedComposition = applyIntelligenceToComposition(
    baseComposition,
    disclosureDecisions,
    orderedCodes,
    overrides.order,
  );

  const revalidation = validateCompositionDocument(refinedComposition);
  refinedComposition.validationSummary = revalidation.summary;

  const consistency = validateConsistency(model, refinedComposition, disclosureDecisions);

  const publicationContract = buildPublicationContract({
    entityProfile,
    materiality,
    disclosureDecisions,
    statementPresentation,
    orderedDisclosureCodes: orderedCodes,
    conditions: conditional.conditions,
    composition: refinedComposition,
    consistency,
  });

  return {
    version: '17.0',
    entityProfile,
    materiality,
    disclosureDecisions,
    statementPresentation,
    orderedDisclosureCodes: orderedCodes,
    consistency,
    composition: refinedComposition,
    publicationContract,
    certified: publicationContract.certified,
    corporateInformation: refinedComposition.corporateInformation,
  };
}

/** Convenience: get intelligence-refined composition only. */
export function composeWithIntelligence(
  model: DocumentModel,
  overrides: DocOverrides,
  options?: ReportingIntelligenceOptions,
): CompositionDocument {
  return produceReportingPackage(model, overrides, options).composition;
}
