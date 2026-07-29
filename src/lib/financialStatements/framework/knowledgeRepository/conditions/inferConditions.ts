/**
 * Disclosure condition inference from statement facts (V14.3).
 */
import type { DisclosureConditionMap } from '../types';

type FactLine = { line_code?: string; amount?: number | null };
type StatementLike = { lines?: FactLine[] };

const LINE_CONDITION_RULES: Array<{ conditionKey: string; lineCodes: string[] }> = [
  { conditionKey: 'hasIntangibleAssets', lineCodes: ['sfp.intangibles', 'sfp.intangible'] },
  { conditionKey: 'hasInvestmentProperty', lineCodes: ['sfp.investment_property', 'sfp.invprop'] },
  { conditionKey: 'hasInventories', lineCodes: ['sfp.inventories', 'sfp.inventory'] },
  { conditionKey: 'hasReceivables', lineCodes: ['sfp.receivables', 'sfp.trade_receivables'] },
  { conditionKey: 'hasPayables', lineCodes: ['sfp.payables', 'sfp.trade_payables'] },
  {
    conditionKey: 'hasFinancialInstruments',
    lineCodes: ['sfp.receivables', 'sfp.payables', 'sfp.borrowings', 'sfp.cash', 'sfp.investments'],
  },
  { conditionKey: 'hasLeases', lineCodes: ['sfp.lease_liability', 'sfp.rou_asset', 'sfp.leases'] },
  { conditionKey: 'hasBorrowings', lineCodes: ['sfp.borrowings', 'sfp.loans'] },
  { conditionKey: 'hasProvisions', lineCodes: ['sfp.provisions'] },
  { conditionKey: 'hasEmployeeBenefits', lineCodes: ['sfp.employee_benefits', 'sfp.leave_pay'] },
  {
    conditionKey: 'hasDeferredTax',
    lineCodes: ['sfp.deferred_tax', 'sfp.deferred_tax_asset', 'sfp.deferred_tax_liability'],
  },
  { conditionKey: 'hasShareCapital', lineCodes: ['sfp.share_capital', 'sfp.equity_share_capital'] },
  { conditionKey: 'hasCashFlowReconciliation', lineCodes: ['cf.operating', 'cf.investing', 'cf.financing'] },
  { conditionKey: 'hasHeritageAssets', lineCodes: ['sfp.heritage'] },
  { conditionKey: 'hasApprovedBudget', lineCodes: ['budget.total_revenue', 'budget.total_expenditure'] },
  { conditionKey: 'hasCommitments', lineCodes: ['note.commitments'] },
  { conditionKey: 'hasContingencies', lineCodes: ['note.contingencies'] },
  { conditionKey: 'hasAssociates', lineCodes: ['sfp.associates'] },
  { conditionKey: 'hasJointVentures', lineCodes: ['sfp.joint_ventures'] },
  { conditionKey: 'hasBusinessCombination', lineCodes: ['sfp.goodwill', 'note.business_combination'] },
  { conditionKey: 'hasGovernmentGrants', lineCodes: ['perf.government_grants', 'sfp.deferred_grants'] },
  { conditionKey: 'hasBorrowingCosts', lineCodes: ['perf.finance_costs', 'sfp.borrowings'] },
  { conditionKey: 'hasShareBasedPayment', lineCodes: ['perf.share_based_payment', 'note.sbp'] },
  { conditionKey: 'hasImpairment', lineCodes: ['perf.impairment'] },
  { conditionKey: 'hasForeignCurrency', lineCodes: ['perf.forex', 'note.forex'] },
  { conditionKey: 'hasHyperinflation', lineCodes: ['note.hyperinflation'] },
  { conditionKey: 'hasDiscontinuedOperations', lineCodes: ['perf.discontinued'] },
  { conditionKey: 'hasSubsidiariesOrSeparateFs', lineCodes: ['note.consolidation', 'sfp.investments_subsidiaries'] },
  { conditionKey: 'hasExternalCapitalRequirements', lineCodes: ['note.capital_requirements'] },
  { conditionKey: 'isFirstTimeIfrsSmeAdopter', lineCodes: ['note.transition_ifrs_sme'] },
  { conditionKey: 'hasPolicyChangeOrError', lineCodes: ['note.policy_change', 'note.prior_period_error'] },
  { conditionKey: 'industryAgriculture', lineCodes: ['sfp.biological'] },
];

function buildFacts(statements: StatementLike[] | undefined): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const statement of statements || []) {
    for (const line of statement.lines || []) {
      if (line && typeof line.line_code === 'string') {
        lookup.set(line.line_code, Number(line.amount) || 0);
      }
    }
  }
  return lookup;
}

function hasNonZero(facts: Map<string, number>, codes: string[]): boolean {
  for (const [key, amount] of facts) {
    if (Math.abs(amount) <= 0) continue;
    for (const code of codes) {
      if (key === code || key.startsWith(`${code}.`)) return true;
    }
  }
  return false;
}

export function inferDisclosureConditions(
  statements: StatementLike[] | undefined,
  overrides: DisclosureConditionMap = {},
): DisclosureConditionMap {
  const facts = buildFacts(statements);
  const inferred: DisclosureConditionMap = {};

  for (const rule of LINE_CONDITION_RULES) {
    inferred[rule.conditionKey] = hasNonZero(facts, rule.lineCodes);
  }

  const hasTradingFacts =
    (facts.has('sfp.ppe') && Math.abs(facts.get('sfp.ppe') || 0) > 0) ||
    (facts.has('perf.total_revenue') && Math.abs(facts.get('perf.total_revenue') || 0) > 0);

  if (hasTradingFacts) {
    if (!inferred.hasFinancialInstruments) inferred.hasFinancialInstruments = true;
    if (!inferred.hasShareCapital) inferred.hasShareCapital = true;
    if (!inferred.hasCashFlowReconciliation) inferred.hasCashFlowReconciliation = true;
  }

  return { ...inferred, ...overrides };
}
