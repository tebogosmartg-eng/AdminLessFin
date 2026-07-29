/**
 * V17.0 — Materiality Engine.
 *
 * Classifies each disclosure by materiality and recommends presentation actions.
 */
import type { DocumentModel } from '../document/documentModel';
import type { DisclosureConditionMap } from '../framework/knowledgeRepository/types';
import { extractStatementFacts, hasNonZeroBalance } from './facts';
import type { EntityProfile, MaterialityAction, MaterialityAssessment, MaterialityClass } from './types';

const DISCLOSURE_BALANCE_MAP: Record<string, string[]> = {
  'DISC.PPE': ['sfp.ppe'],
  'DISC.INTANGIBLES': ['sfp.intangibles', 'sfp.intangible'],
  'DISC.INVPROP': ['sfp.investment_property', 'sfp.invprop'],
  'DISC.INVENTORIES': ['sfp.inventories', 'sfp.inventory'],
  'DISC.RECEIVABLES': ['sfp.receivables', 'sfp.trade_receivables'],
  'DISC.PAYABLES': ['sfp.payables', 'sfp.trade_payables'],
  'DISC.LEASES': ['sfp.lease_liability', 'sfp.rou_asset', 'sfp.leases'],
  'DISC.BORROWINGS': ['sfp.borrowings', 'sfp.loans'],
  'DISC.PROVISIONS': ['sfp.provisions'],
  'DISC.EMPLOYEE': ['sfp.employee_benefits', 'sfp.leave_pay'],
  'DISC.EMPLOYEEBENEFITS': ['sfp.employee_benefits', 'sfp.leave_pay'],
  'DISC.DEFERREDTAX': ['sfp.deferred_tax', 'sfp.deferred_tax_asset', 'sfp.deferred_tax_liability'],
  'DISC.TAX': ['perf.tax_expense', 'perf.tax'],
  'DISC.RELATED': ['note.related_party'],
  'DISC.RELATEDPARTY': ['note.related_party'],
  'DISC.RELATEDPARTIES': ['note.related_party'],
  'DISC.BIOLOGICAL': ['sfp.biological'],
  'DISC.ASSOCIATES': ['sfp.associates'],
  'DISC.JOINTVENTURES': ['sfp.joint_ventures'],
  'DISC.GOODWILL': ['sfp.goodwill'],
  'DISC.BUSCOMB': ['sfp.goodwill', 'note.business_combination'],
  'DISC.REVENUE': ['perf.revenue', 'perf.total_revenue'],
  'DISC.COMMITMENTS': ['note.commitments'],
  'DISC.CONTINGENT': ['note.contingencies'],
  'DISC.CONTINGENCIES': ['note.contingencies'],
  'DISC.IMPAIRMENT': ['perf.impairment'],
  'DISC.FOREX': ['perf.forex', 'note.forex'],
  'DISC.SHAREBASEDPAYMENT': ['perf.share_based_payment', 'note.sbp'],
  'DISC.SBP': ['perf.share_based_payment', 'note.sbp'],
  'DISC.GOVERNMENTGRANTS': ['perf.government_grants', 'sfp.deferred_grants'],
  'DISC.GRANTS': ['perf.government_grants', 'sfp.deferred_grants'],
  'DISC.HERITAGE': ['sfp.heritage'],
  'DISC.INVESTMENTPROPERTY': ['sfp.investment_property', 'sfp.invprop'],
  'DISC.DISCONTINUED': ['perf.discontinued'],
  'DISC.FININST': ['sfp.receivables', 'sfp.payables', 'sfp.borrowings', 'sfp.cash'],
};

const CONDITION_KEY_MAP: Record<string, string> = {
  'DISC.LEASES': 'hasLeases',
  'DISC.BIOLOGICAL': 'industryAgriculture',
  'DISC.RELATED': 'hasRelatedParties',
  'DISC.RELATEDPARTY': 'hasRelatedParties',
  'DISC.RELATEDPARTIES': 'hasRelatedParties',
  'DISC.IMPAIRMENT': 'hasImpairment',
  'DISC.INVESTMENTPROPERTY': 'hasInvestmentProperty',
  'DISC.INTANGIBLES': 'hasIntangibleAssets',
  'DISC.GOODWILL': 'hasBusinessCombination',
  'DISC.BUSCOMB': 'hasBusinessCombination',
  'DISC.PROVISIONS': 'hasProvisions',
  'DISC.EMPLOYEE': 'hasEmployeeBenefits',
  'DISC.EMPLOYEEBENEFITS': 'hasEmployeeBenefits',
  'DISC.DEFERREDTAX': 'hasDeferredTax',
  'DISC.HERITAGE': 'hasHeritageAssets',
  'DISC.ASSOCIATES': 'hasAssociates',
  'DISC.JOINTVENTURES': 'hasJointVentures',
  'DISC.GOVERNMENTGRANTS': 'hasGovernmentGrants',
  'DISC.GRANTS': 'hasGovernmentGrants',
  'DISC.SHAREBASEDPAYMENT': 'hasShareBasedPayment',
  'DISC.SBP': 'hasShareBasedPayment',
  'DISC.FOREX': 'hasForeignCurrency',
  'DISC.DISCONTINUED': 'hasDiscontinuedOperations',
  'DISC.COMMITMENTS': 'hasCommitments',
  'DISC.CONTINGENT': 'hasContingencies',
  'DISC.CONTINGENCIES': 'hasContingencies',
};

function materialityThreshold(
  profile: EntityProfile,
  companyPercentageThreshold?: number | null,
): number {
  // G3.6C — company materiality settings are the single enterprise threshold.
  // Entity-size heuristics are fallback only when settings are unset.
  if (
    companyPercentageThreshold != null &&
    Number.isFinite(companyPercentageThreshold) &&
    companyPercentageThreshold >= 0
  ) {
    return companyPercentageThreshold / 100;
  }
  switch (profile.size) {
    case 'micro_entity':
    case 'dormant_entity':
      return 0.05;
    case 'small_sme':
      return 0.03;
    case 'medium_sme':
      return 0.02;
    default:
      return 0.01;
  }
}

function resolveAction(
  materiality: MaterialityClass,
  balanceImpact: number,
  percentOfAssets: number,
  threshold: number,
  profile: EntityProfile,
): MaterialityAction {
  if (materiality === 'zero_balance') return 'suppress';
  if (materiality === 'mandatory' || materiality === 'framework_required') return 'present';
  if (materiality === 'immaterial' && percentOfAssets < threshold * 0.5) return 'suppress';
  if (materiality === 'immaterial') return 'collapse';
  if (materiality === 'material' && percentOfAssets > threshold * 3) return 'expand';
  if (materiality === 'material' && profile.characteristics.isAssetIntensive && balanceImpact > 0) {
    return 'highlight';
  }
  if (materiality === 'conditional' && balanceImpact <= 0) return 'suppress';
  return 'present';
}

function classifyMateriality(
  disclosureCode: string,
  requirementLevel: string,
  facts: ReturnType<typeof extractStatementFacts>,
  conditions: DisclosureConditionMap,
  profile: EntityProfile,
): { materiality: MaterialityClass; balanceImpact: number; percentOfAssets: number } {
  const balanceCodes = DISCLOSURE_BALANCE_MAP[disclosureCode] || [];
  const balanceImpact = balanceCodes.reduce((sum, code) => {
    for (const [key, amount] of facts.lookup) {
      if (key === code || key.startsWith(`${code}.`)) sum += Math.abs(amount);
    }
    return sum;
  }, 0);

  const percentOfAssets =
    facts.totalAssets > 0 ? balanceImpact / facts.totalAssets : balanceImpact > 0 ? 1 : 0;

  if (requirementLevel === 'required' || requirementLevel === 'mandatory') {
    return { materiality: 'framework_required', balanceImpact, percentOfAssets };
  }

  const conditionKey = CONDITION_KEY_MAP[disclosureCode];
  if (conditionKey && conditions[conditionKey] === false) {
    return { materiality: 'zero_balance', balanceImpact: 0, percentOfAssets: 0 };
  }

  if (!hasNonZeroBalance(facts, balanceCodes) && conditionKey) {
    const hasCondition = conditions[conditionKey];
    if (!hasCondition) {
      return { materiality: 'zero_balance', balanceImpact: 0, percentOfAssets: 0 };
    }
  }

  const threshold = materialityThreshold(profile);
  if (balanceImpact <= 0 && !conditionKey) {
    return { materiality: 'future_use', balanceImpact, percentOfAssets };
  }

  if (percentOfAssets >= threshold) {
    return { materiality: 'material', balanceImpact, percentOfAssets };
  }
  if (percentOfAssets > 0) {
    return { materiality: 'immaterial', balanceImpact, percentOfAssets };
  }

  return { materiality: 'conditional', balanceImpact, percentOfAssets };
}

/** Assess materiality for all disclosures in the document model. */
export function assessMateriality(
  model: DocumentModel,
  profile: EntityProfile,
  conditions: DisclosureConditionMap,
  companyPercentageThreshold?: number | null,
): MaterialityAssessment[] {
  const facts = extractStatementFacts(model);
  const threshold = materialityThreshold(profile, companyPercentageThreshold);
  const assessments: MaterialityAssessment[] = [];

  for (const note of model.notes) {
    const code = note.disclosure_code;
    const { materiality, balanceImpact, percentOfAssets } = classifyMateriality(
      code,
      note.requirement_level,
      facts,
      conditions,
      profile,
    );
    const action = resolveAction(materiality, balanceImpact, percentOfAssets, threshold, profile);

    let reason = `Classified as ${materiality}`;
    if (action === 'suppress') reason = `Zero balance or immaterial — ${code} suppressed`;
    if (action === 'expand') reason = `Material balance (${(percentOfAssets * 100).toFixed(1)}% of assets) — expand`;
    if (action === 'collapse') reason = `Immaterial balance — simplified presentation`;
    if (action === 'highlight') reason = `Asset-intensive entity — highlight ${code}`;
    if (companyPercentageThreshold != null) {
      reason += ` (company threshold ${companyPercentageThreshold}%)`;
    }

    assessments.push({
      disclosureCode: code,
      materiality,
      action,
      reason,
      balanceImpact,
      percentOfAssets,
    });
  }

  return assessments;
}
