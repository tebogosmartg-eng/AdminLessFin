/**
 * Enterprise Reporting Knowledge Repository — pack registry (V14.2).
 *
 * Single authoritative registry of versioned framework knowledge packs.
 * The Framework Content Engine consumes FrameworkDefinition via getFrameworkDefinition.
 */
import { deepFreeze } from './compose';
import { enrichFrameworkDefinition } from './enrich';
import { RAW_PACK_DEFINITIONS } from './packs/contentLibrary';
import {
  CERTIFICATION_ASSET_IFRS_SME_ED_2008,
  measureChecklistCoverage,
} from './certification/ifrsSmeChecklistMap';
import { ACTIVE_FRAMEWORK_VERSION, contentRefFor } from './versioning';
import type {
  FrameworkDefinition,
  FrameworkKey,
  FrameworkKnowledgePack,
  FrameworkNoteDef,
} from './types';

function buildPack(key: FrameworkKey): FrameworkKnowledgePack {
  const raw = RAW_PACK_DEFINITIONS[key];
  const definition = deepFreeze(enrichFrameworkDefinition(raw, ACTIVE_FRAMEWORK_VERSION));
  return deepFreeze({
    key,
    versionId: ACTIVE_FRAMEWORK_VERSION,
    label: definition.label,
    scope: definition.scope,
    contentRef: contentRefFor(key, ACTIVE_FRAMEWORK_VERSION),
    status: 'active' as const,
    definition,
    certificationAssets: key === 'IFRS_SME' ? [CERTIFICATION_ASSET_IFRS_SME_ED_2008] : [],
  });
}

const PACKS: Record<FrameworkKey, FrameworkKnowledgePack> = {
  IFRS: buildPack('IFRS'),
  IFRS_SME: buildPack('IFRS_SME'),
  GRAP: buildPack('GRAP'),
  IPSAS: buildPack('IPSAS'),
};

const DEFINITIONS: Record<FrameworkKey, FrameworkDefinition> = {
  IFRS: PACKS.IFRS.definition,
  IFRS_SME: PACKS.IFRS_SME.definition,
  GRAP: PACKS.GRAP.definition,
  IPSAS: PACKS.IPSAS.definition,
};

export function getFrameworkKnowledgePack(
  key: FrameworkKey,
  versionId: string = ACTIVE_FRAMEWORK_VERSION,
): FrameworkKnowledgePack {
  const pack = PACKS[key];
  if (pack.versionId !== versionId) {
    // Future versions register additional packs; active pack is returned until then.
    return pack;
  }
  return pack;
}

export function listFrameworkKnowledgePacks(): FrameworkKnowledgePack[] {
  return Object.values(PACKS);
}

export function getFrameworkDefinition(key: FrameworkKey): FrameworkDefinition {
  return DEFINITIONS[key];
}

export function listFrameworkKeys(): FrameworkKey[] {
  return ['IFRS', 'IFRS_SME', 'GRAP', 'IPSAS'];
}

export function resolveExtensionNotes(
  key: FrameworkKey,
  conditions: Record<string, boolean> = {},
): FrameworkNoteDef[] {
  const def = DEFINITIONS[key];
  const notes: FrameworkNoteDef[] = [];
  for (const ext of def.extensionPoints) {
    if (conditions[ext.conditionKey] === true && ext.notes) {
      notes.push(...ext.notes);
    }
  }
  return notes;
}

export function getRepositoryCoverageSummary() {
  const packs = listFrameworkKnowledgePacks();
  const disclosureCount = packs.reduce((n, p) => n + p.definition.notes.length, 0);
  const policyCount = packs.reduce((n, p) => n + p.definition.policies.length, 0);
  const checklist = measureChecklistCoverage();
  return {
    activeVersion: ACTIVE_FRAMEWORK_VERSION,
    packCount: packs.length,
    disclosureCount,
    policyCount,
    statementCount: packs.reduce((n, p) => n + p.definition.statements.length, 0),
    extensionPointCount: packs.reduce((n, p) => n + p.definition.extensionPoints.length, 0),
    ifrsSmeChecklist: checklist,
  };
}
