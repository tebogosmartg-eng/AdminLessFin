/**
 * Enterprise Reporting Knowledge Repository (V14.2)
 *
 * Single authoritative source for reporting knowledge consumed by the existing
 * Framework Content Engine. Folder layout:
 *
 *   knowledgeRepository/
 *     types.ts                 — canonical knowledge model
 *     compose.ts               — policy composition / freeze helpers
 *     versioning.ts            — framework pack version ids
 *     enrich.ts                — additive metadata enrichment
 *     registry.ts              — versioned pack registry
 *     assets/                  — shared statements ordering, terminology
 *     conditions/              — TB → disclosure condition inference
 *     certification/           — checklist mapping (not runtime PDF)
 *     packs/contentLibrary.ts  — statement / policy / disclosure bodies
 *     frameworks/<key>/<ver>/  — versioned pack entry points
 *
 * Public consumers should import from `../frameworkContent` (compat facade)
 * or from this index for repository-specific APIs.
 */

export type {
  ChecklistRequirement,
  DisclosureCategory,
  DisclosureClass,
  DisclosureConditionMap,
  FrameworkDefinition,
  FrameworkExtensionPoint,
  FrameworkFactMapping,
  FrameworkKey,
  FrameworkKnowledgePack,
  FrameworkNoteDef,
  FrameworkPolicyDef,
  FrameworkRequirement,
  FrameworkStatementDef,
  FrameworkTableDef,
  PresentationHints,
} from './types';

export { deepFreeze, normaliseFrameworkKey, composePolicyBody, pol } from './compose';
export { ACTIVE_FRAMEWORK_VERSION, contentRefFor } from './versioning';
export { inferDisclosureConditions } from './conditions/inferConditions';
export {
  CERTIFICATION_ASSET_IFRS_SME_ED_2008,
  IFRS_SME_ED_CHECKLIST_2008,
  buildDisclosureChecklistIndex,
  checklistRefsForDisclosure,
  listChecklistRequirements,
  measureChecklistCoverage,
} from './certification/ifrsSmeChecklistMap';
export {
  evaluateIfrsSmeSectionCompleteness,
  formatSectionCompletenessMatrix,
  IFRS_SME_SECTION_SPECS,
  type SectionCompletenessRow,
  type SectionStatus,
} from './certification/sectionCompleteness';
export { TERMINOLOGY } from './assets/terminology';
export { DEFAULT_NOTE_ORDER, noteSortOrder } from './assets/noteOrdering';
export {
  getFrameworkDefinition,
  getFrameworkKnowledgePack,
  getRepositoryCoverageSummary,
  listFrameworkKeys,
  listFrameworkKnowledgePacks,
  resolveExtensionNotes,
} from './registry';
