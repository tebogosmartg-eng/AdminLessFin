/**
 * Enrich pack definitions with Knowledge Repository metadata (V14.2).
 * Additive only — does not change narrative/table/policy bodies.
 */
import { noteSortOrder } from './assets/noteOrdering';
import { buildDisclosureChecklistIndex } from './certification/ifrsSmeChecklistMap';
import { ACTIVE_FRAMEWORK_VERSION, contentRefFor } from './versioning';
import type {
  DisclosureCategory,
  FrameworkDefinition,
  FrameworkKey,
  FrameworkNoteDef,
  FrameworkPolicyDef,
} from './types';

const CHECKLIST_INDEX = buildDisclosureChecklistIndex();

const CATEGORY_BY_CODE: Record<string, DisclosureCategory> = {
  'DISC.GENERAL': 'general',
  'DISC.BASIS': 'presentation',
  'DISC.POLICIES': 'accounting_policy',
  'DISC.JUDGEMENTS': 'accounting_policy',
  'DISC.POLICYCHANGES': 'accounting_policy',
  'DISC.CONSOLIDATION': 'presentation',
  'DISC.CAPITAL': 'presentation',
  'DISC.TRANSITION': 'presentation',
  'DISC.REVENUE': 'statement_note',
  'DISC.GRANTS': 'statement_note',
  'DISC.DISCONTINUED': 'statement_note',
  'DISC.REVENUE_NONEXCHANGE': 'statement_note',
  'DISC.REVENUE_EXCHANGE': 'statement_note',
  'DISC.PPE': 'statement_note',
  'DISC.INTANGIBLES': 'statement_note',
  'DISC.INVPROP': 'statement_note',
  'DISC.BUSCOMB': 'statement_note',
  'DISC.ASSOCIATES': 'statement_note',
  'DISC.JOINTVENTURES': 'statement_note',
  'DISC.IMPAIRMENT': 'statement_note',
  'DISC.INVENTORIES': 'statement_note',
  'DISC.RECEIVABLES': 'financial_instrument',
  'DISC.PAYABLES': 'financial_instrument',
  'DISC.FININST': 'financial_instrument',
  'DISC.LEASES': 'statement_note',
  'DISC.BORROWINGS': 'financial_instrument',
  'DISC.BORROWINGCOST': 'statement_note',
  'DISC.PROVISIONS': 'contingency',
  'DISC.EMPLOYEE': 'statement_note',
  'DISC.SBP': 'statement_note',
  'DISC.TAX': 'statement_note',
  'DISC.DEFERREDTAX': 'statement_note',
  'DISC.FOREX': 'statement_note',
  'DISC.HYPERINFLATION': 'presentation',
  'DISC.SHARECAPITAL': 'statement_note',
  'DISC.CASHFLOW': 'statement_note',
  'DISC.RELATED': 'related_party',
  'DISC.COMMITMENTS': 'contingency',
  'DISC.CONTINGENT': 'contingency',
  'DISC.EVENTS': 'subsequent_event',
  'DISC.GOINGCONCERN': 'presentation',
  'DISC.BUDGET': 'statement_note',
  'DISC.HERITAGE': 'industry',
  'DISC.BIOLOGICAL': 'industry',
};

const VALIDATION_BY_CLASS: Record<string, string[]> = {
  required: ['FW.REQUIRED_DISCLOSURES', 'FW.DISCLOSURE_COMPLETE'],
  conditional: ['FW.DISCLOSURE_COMPLETE'],
  optional: ['FW.DISCLOSURE_COMPLETE'],
};

function enrichNote(note: FrameworkNoteDef, key: FrameworkKey, versionId: string): FrameworkNoteDef {
  const policyReferences = (note.dependencies || []).filter((d) => d.startsWith('POL.'));
  const checklistRefs =
    key === 'IFRS_SME' ? CHECKLIST_INDEX[note.code] || note.checklistRefs || [] : note.checklistRefs || [];

  return {
    ...note,
    framework: key,
    frameworkVersion: versionId,
    category: note.category || CATEGORY_BY_CODE[note.code] || 'other',
    policyReferences: note.policyReferences || policyReferences,
    checklistRefs,
    validationRules:
      note.validationRules ||
      VALIDATION_BY_CLASS[note.disclosureClass || (note.requirement === 'mandatory' ? 'required' : 'optional')] ||
      [],
    sectionReferences: note.sectionReferences || note.standards || [],
    presentationHints: note.presentationHints || {
      sortOrder: noteSortOrder(note.code),
      headingStyle: 'note',
    },
    industryApplicability: note.industryApplicability || [],
    entityApplicability: note.entityApplicability || [],
  };
}

function enrichPolicy(policy: FrameworkPolicyDef, versionId: string, key: FrameworkKey): FrameworkPolicyDef {
  const checklistRefs =
    key === 'IFRS_SME' ? CHECKLIST_INDEX[policy.code] || policy.checklistRefs || [] : policy.checklistRefs || [];
  return {
    ...policy,
    frameworkVersion: versionId,
    sectionReferences: policy.sectionReferences || policy.standards || [],
    checklistRefs,
  };
}

export function enrichFrameworkDefinition(
  def: FrameworkDefinition,
  versionId: string = ACTIVE_FRAMEWORK_VERSION,
): FrameworkDefinition {
  const key = def.key;
  return {
    ...def,
    versionId,
    contentRef: def.contentRef || contentRefFor(key, versionId),
    policies: def.policies.map((p) => enrichPolicy(p, versionId, key)),
    notes: def.notes.map((n) => enrichNote(n, key, versionId)),
    extensionPoints: def.extensionPoints.map((ext) => ({
      ...ext,
      notes: (ext.notes || []).map((n) => enrichNote(n, key, versionId)),
      industryApplicability: ext.industryApplicability || [ext.conditionKey],
    })),
    statements: def.statements.map((s) => ({
      ...s,
      frameworkVersion: versionId,
    })),
  };
}
