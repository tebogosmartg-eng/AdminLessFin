/**
 * Enterprise Reporting Framework Library — compatibility facade (V14.2).
 *
 * Previously this file held the entire Framework Content Library inline.
 * Reporting knowledge now lives in the Enterprise Reporting Knowledge Repository
 * (`./knowledgeRepository`). This module re-exports the engine-facing contract
 * unchanged so existing imports continue to work:
 *
 *   - Framework Content Engine
 *   - Document Model
 *   - Unit / certification tests
 *
 * DO NOT add duplicate disclosure or policy bodies here.
 */

export type {
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
  ChecklistRequirement,
} from './knowledgeRepository';

export {
  normaliseFrameworkKey,
  getFrameworkDefinition,
  listFrameworkKeys,
  resolveExtensionNotes,
  getFrameworkKnowledgePack,
  listFrameworkKnowledgePacks,
  getRepositoryCoverageSummary,
  inferDisclosureConditions,
  ACTIVE_FRAMEWORK_VERSION,
  measureChecklistCoverage,
  listChecklistRequirements,
  evaluateIfrsSmeSectionCompleteness,
  formatSectionCompletenessMatrix,
} from './knowledgeRepository';

export type { SectionCompletenessRow, SectionStatus } from './knowledgeRepository';
