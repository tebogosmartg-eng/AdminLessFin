/**
 * V17.0 — Disclosure Decision Engine.
 *
 * Determines whether each disclosure should exist, expand, simplify, merge, or suppress.
 */
import type { DocumentModel } from '../document/documentModel';
import type { DisclosureConditionMap } from '../framework/knowledgeRepository/types';
import { extractStatementFacts } from './facts';
import type {
  DisclosureDecision,
  EntityProfile,
  MaterialityAssessment,
  MaterialityAction,
} from './types';

const SUPPRESS_WHEN_ABSENT: Array<{ code: string; factCheck: (facts: ReturnType<typeof extractStatementFacts>) => boolean; reason: string }> = [
  {
    code: 'DISC.PPE',
    factCheck: (f) => f.ppeBalance <= 0,
    reason: 'No PPE — suppress PPE disclosure',
  },
  {
    code: 'DISC.LEASES',
    factCheck: (f) => f.leaseBalance <= 0,
    reason: 'No leases — suppress lease disclosures',
  },
  {
    code: 'DISC.TAX',
    factCheck: (f) => f.taxExpense <= 0,
    reason: 'No tax — suppress tax reconciliation',
  },
  {
    code: 'DISC.DEFERREDTAX',
    factCheck: (f) => !f.lookup.has('sfp.deferred_tax') && !f.lookup.has('sfp.deferred_tax_asset'),
    reason: 'No deferred tax — suppress deferred tax disclosure',
  },
  {
    code: 'DISC.RELATED',
    factCheck: () => false,
    reason: 'No related parties — suppress related party disclosures',
  },
  {
    code: 'DISC.RELATEDPARTY',
    factCheck: () => false,
    reason: 'No related parties — suppress related party disclosures',
  },
  {
    code: 'DISC.RELATEDPARTIES',
    factCheck: () => false,
    reason: 'No related parties — suppress related party disclosures',
  },
  {
    code: 'DISC.BIOLOGICAL',
    factCheck: (f) => !f.lookup.has('sfp.biological') || Math.abs(f.lookup.get('sfp.biological') || 0) <= 0,
    reason: 'No biological assets — suppress biological disclosure',
  },
  {
    code: 'DISC.INVENTORIES',
    factCheck: (f) => f.inventoryBalance <= 0,
    reason: 'No inventories — suppress inventory disclosure',
  },
];

function shouldExpandPpe(facts: ReturnType<typeof extractStatementFacts>): boolean {
  return facts.ppeCategories > 1 || facts.ppeBalance > facts.totalAssets * 0.15;
}

function shouldSimplifyPpe(facts: ReturnType<typeof extractStatementFacts>): boolean {
  return facts.ppeBalance > 0 && facts.ppeCategories <= 1;
}

/** Make disclosure decisions from materiality assessments and entity facts. */
export function makeDisclosureDecisions(
  model: DocumentModel,
  profile: EntityProfile,
  materiality: MaterialityAssessment[],
  conditions: DisclosureConditionMap,
): DisclosureDecision[] {
  const facts = extractStatementFacts(model);
  const materialityByCode = new Map(materiality.map((m) => [m.disclosureCode, m]));
  const decisions: DisclosureDecision[] = [];

  for (const note of model.notes) {
    const code = note.disclosure_code;
    const mat = materialityByCode.get(code);
    const action: MaterialityAction = mat?.action ?? 'present';
    const materialityClass = mat?.materiality ?? 'conditional';

    let exists = action !== 'suppress';
    let shouldSuppress = action === 'suppress';
    let shouldExpand = action === 'expand' || action === 'highlight';
    let shouldSimplify = action === 'collapse';
    const shouldMerge = action === 'merge';
    let reason = mat?.reason ?? 'Default presentation';
    let mergedWith: string | undefined;

    const suppressRule = SUPPRESS_WHEN_ABSENT.find((r) => r.code === code);
    if (suppressRule && note.requirement_level !== 'mandatory' && note.requirement_level !== 'required') {
      if (code.startsWith('DISC.RELATED') && conditions.hasRelatedParties === false) {
        exists = false;
        shouldSuppress = true;
        reason = suppressRule.reason;
      } else if (suppressRule.factCheck(facts)) {
        exists = false;
        shouldSuppress = true;
        reason = suppressRule.reason;
      }
    }

    if (code === 'DISC.PPE' && exists) {
      if (facts.ppeBalance <= 0) {
        shouldSimplify = true;
        reason = 'No PPE balance — simplified narrative disclosure only';
      } else if (shouldExpandPpe(facts)) {
        shouldExpand = true;
        reason = 'Multiple PPE categories — produce movement schedule';
      } else if (shouldSimplifyPpe(facts)) {
        shouldSimplify = true;
        reason = 'One PPE category — produce simplified disclosure';
      }
    }

    if (code === 'DISC.BORROWINGS' && exists && facts.borrowingsBalance <= 0) {
      shouldSimplify = true;
      reason = 'No borrowings balance — simplified narrative disclosure only';
    }

    if (profile.size === 'micro_entity' || profile.size === 'dormant_entity') {
      if (materialityClass === 'immaterial' && note.requirement_level !== 'required') {
        exists = false;
        shouldSuppress = true;
        reason = 'Micro entity — immaterial disclosure suppressed';
      }
    }

    if (profile.industry === 'npo' && /DISC.TAX|DISC.DEFERREDTAX/.test(code)) {
      if (facts.taxExpense <= 0) {
        exists = false;
        shouldSuppress = true;
        reason = 'NPO — no tax disclosure required';
      }
    }

    if (shouldMerge && code === 'DISC.PAYABLES') {
      mergedWith = 'DISC.FININST';
    }

    decisions.push({
      disclosureCode: code,
      exists,
      shouldExpand,
      shouldSimplify,
      shouldMerge,
      shouldSuppress,
      action: shouldSuppress ? 'suppress' : shouldExpand ? 'expand' : shouldSimplify ? 'collapse' : shouldMerge ? 'merge' : 'present',
      materiality: materialityClass,
      reason,
      mergedWith,
    });
  }

  return decisions;
}
