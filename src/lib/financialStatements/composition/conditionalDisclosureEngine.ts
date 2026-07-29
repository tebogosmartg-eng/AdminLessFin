/**
 * V16.0 — Conditional Disclosure Engine.
 *
 * Activates or suppresses disclosures based on entity facts.
 * Automatic renumbering continues to function via the note numbering engine.
 */
import type { DocNoteNode } from '../document/documentModel';
import type { DocumentModel } from '../document/documentModel';
import { inferDisclosureConditions } from '../framework/knowledgeRepository/conditions/inferConditions';
import type { DisclosureConditionMap } from '../framework/knowledgeRepository/types';

/** Maps disclosure codes to condition keys that must be true for activation. */
export const DISCLOSURE_CONDITION_MAP: Record<string, string[]> = {
  'DISC.LEASES': ['hasLeases'],
  'DISC.BIOLOGICAL': ['industryAgriculture'],
  'DISC.RELATEDPARTY': ['hasRelatedParties'],
  'DISC.RELATEDPARTIES': ['hasRelatedParties'],
  'DISC.IMPAIRMENT': ['hasImpairment'],
  'DISC.INVESTMENTPROPERTY': ['hasInvestmentProperty'],
  'DISC.INTANGIBLES': ['hasIntangibleAssets'],
  'DISC.GOODWILL': ['hasBusinessCombination'],
  'DISC.PROVISIONS': ['hasProvisions'],
  'DISC.EMPLOYEEBENEFITS': ['hasEmployeeBenefits'],
  'DISC.DEFERREDTAX': ['hasDeferredTax'],
  'DISC.HERITAGE': ['hasHeritageAssets'],
  'DISC.ASSOCIATES': ['hasAssociates'],
  'DISC.JOINTVENTURES': ['hasJointVentures'],
  'DISC.GOVERNMENTGRANTS': ['hasGovernmentGrants'],
  'DISC.SHAREBASEDPAYMENT': ['hasShareBasedPayment'],
  'DISC.FOREIGNCURRENCY': ['hasForeignCurrency'],
  'DISC.DISCONTINUED': ['hasDiscontinuedOperations'],
  'DISC.COMMITMENTS': ['hasCommitments'],
  'DISC.CONTINGENCIES': ['hasContingencies'],
};

export type ConditionalActivationResult = {
  activated: string[];
  suppressed: string[];
  conditions: DisclosureConditionMap;
};

function evaluateDisclosureActive(
  disclosureCode: string,
  conditions: DisclosureConditionMap,
  note: DocNoteNode,
): boolean {
  const required = DISCLOSURE_CONDITION_MAP[disclosureCode];
  if (!required?.length) return true;
  return required.some((key) => conditions[key] === true);
}

/** Evaluate conditional activation for all disclosures in the model. */
export function evaluateConditionalDisclosures(
  model: DocumentModel,
  overrides?: { manualFlags?: DisclosureConditionMap },
): ConditionalActivationResult {
  const conditions = inferDisclosureConditions(model.statements, {
    ...overrides?.manualFlags,
    hasRelatedParties: overrides?.manualFlags?.hasRelatedParties ?? false,
  });

  const activated: string[] = [];
  const suppressed: string[] = [];

  for (const note of model.notes) {
    const code = note.disclosure_code;
    if (note.requirement_level === 'required') {
      activated.push(code);
      continue;
    }
    const active = evaluateDisclosureActive(code, conditions, note);
    if (active) activated.push(code);
    else suppressed.push(code);
  }

  return { activated, suppressed, conditions };
}

/** Filter notes that should appear in the final document based on conditions. */
export function filterActiveDisclosureNotes(
  notes: DocNoteNode[],
  activation: ConditionalActivationResult,
): DocNoteNode[] {
  const suppressedSet = new Set(activation.suppressed);
  return notes.filter((n) => !suppressedSet.has(n.disclosure_code));
}

/** Infer disclosure archetype from code and content. */
export function inferDisclosureArchetype(
  disclosureCode: string,
  hasMovementSchedule: boolean,
  hasReconciliation: boolean,
): import('./types').DisclosureArchetype {
  const code = disclosureCode.toUpperCase();
  if (/TAX|DEFERREDTAX/.test(code)) return 'tax_reconciliation';
  if (/CASHFLOW|CASH/.test(code) && hasReconciliation) return 'cash_flow_reconciliation';
  if (/EQUITY|SHARECAPITAL/.test(code)) return 'equity_movement';
  if (/RELATED/.test(code)) return 'related_party';
  if (/EVENT|SUBSEQUENT/.test(code)) return 'events_after_reporting';
  if (/FININST|FINANCIAL.INSTRUMENT/.test(code)) return 'financial_instrument_categories';
  if (/AGE|AGEING|AGING/.test(code)) return 'age_analysis';
  if (/MATURITY/.test(code)) return 'maturity_analysis';
  if (/SENSITIV/.test(code)) return 'sensitivity_analysis';
  if (hasMovementSchedule) return 'movement_schedule';
  if (hasReconciliation) return 'reconciliation';
  if (/POL\./.test(code)) return 'policy_backed';
  return 'general';
}
