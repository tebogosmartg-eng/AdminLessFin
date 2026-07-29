/**
 * V16.0 — Enterprise Disclosure Composition Engine (public API).
 */
export { composeDocument } from './compose';
export { DOCUMENT_PHASES, getPhaseDefinition, phaseSortOrder } from './documentPhases';
export {
  assembleAccountingPolicies,
  excludePolicyNotes,
  groupPoliciesByDomain,
  isAccountingPolicyNoteCode,
  resolvePolicyDomain,
} from './accountingPolicies';
export {
  isDisclosureNote,
  toCompositionDisclosureNote,
  sanitizeDisclosureNarrative,
} from './disclosureNotes';
export {
  buildDisclosureLibraryComponents,
  buildLibraryComponent,
  libraryToCompositionComponents,
  tableToCompositionRows,
} from './disclosureComponents';
export {
  buildEnterpriseDisclosures,
  enterpriseDisclosureToBlocks,
  toEnterpriseDisclosure,
} from './enterpriseDisclosure';
export {
  MOVEMENT_SCHEDULE_DEFINITIONS,
  buildMovementSchedule,
  resolveMovementSchedules,
  movementScheduleToTableRows,
  validateMovementRow,
  findMovementDefinition,
} from './movementScheduleEngine';
export {
  buildComparativeContext,
  buildDisclosureComparatives,
  comparativeColumnHeaders,
} from './comparativeEngine';
export {
  DISCLOSURE_CONDITION_MAP,
  evaluateConditionalDisclosures,
  filterActiveDisclosureNotes,
  inferDisclosureArchetype,
} from './conditionalDisclosureEngine';
export {
  validateEnterpriseDisclosure,
  validateCompositionDocument,
} from './disclosureValidation';
export {
  buildDisclosureCrossReferences,
  resolveInterDisclosureReferences,
  crossReferencesToNarrative,
} from './crossReferences';
export {
  computeCompositionNoteNumbering,
  resolveNoteNumber,
} from './noteNumbering';
export {
  CLASSIFICATION_RULES,
  classifyStatementLine,
  classificationLabel,
  groupLinesByClassification,
} from './statementClassification';
export {
  LINE_DISCLOSURE_LINK_RULES,
  disclosureCodeForLine,
  resolveLineLinks,
  linksForDisclosure,
  emptyDisclosureLinks,
} from './disclosureLinking';
export {
  sequencePhases,
  flattenSequencedSections,
  buildContentsEntries,
  createEmptyPhases,
  defaultPublicationProfile,
} from './sequencing';
export { buildPublicationHints, spacingAfterPx, compositionContentsLabels } from './publicationHints';
export { buildV16SampleModel } from './fixtures/v16SampleModel';
export {
  fingerprintDocumentModel,
  fingerprintTrialBalance,
  buildDependencyGraph,
  affectedDisclosures,
  buildDisclosureMetadataIndex,
  getCachedComposition,
  setCachedComposition,
  invalidateCompositionCache,
  getCompositionCacheStats,
  incrementalRecompose,
} from './compositionCache';
export type * from './types';
