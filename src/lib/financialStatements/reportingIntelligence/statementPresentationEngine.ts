/**
 * V17.0 — Statement Presentation Engine.
 *
 * Determines statement layout, subtotals, and presentation format per entity profile.
 */
import type { DocumentModel } from '../document/documentModel';
import type { EntityProfile, StatementPresentationDecision } from './types';

const STATEMENT_TYPES = [
  'financial_position',
  'financial_performance',
  'changes_in_equity',
  'cash_flows',
] as const;

function presentationForStatement(
  statementType: string,
  profile: EntityProfile,
  model: DocumentModel,
): StatementPresentationDecision {
  const { size, industry, characteristics } = profile;

  let assetPresentation: StatementPresentationDecision['assetPresentation'] = 'current_non_current';
  let expensePresentation: StatementPresentationDecision['expensePresentation'] = 'nature';
  let showGrossProfit = false;
  let showOperatingProfit = false;
  let showProfitBeforeTax = true;
  const subtotals: string[] = [];
  let layoutKey = 'standard';
  let entitySpecificLayout = false;

  if (size === 'investment_entity' || size === 'holding_company') {
    assetPresentation = 'liquidity';
    expensePresentation = 'nature';
    layoutKey = 'investment_holding';
    entitySpecificLayout = true;
    subtotals.push('investment_income', 'finance_costs', 'profit_before_tax');
  }

  if (industry === 'retail' || industry === 'manufacturing') {
    expensePresentation = 'function';
    showGrossProfit = true;
    showOperatingProfit = true;
    layoutKey = industry === 'retail' ? 'retail_function' : 'manufacturing_function';
    subtotals.push('gross_profit', 'operating_profit', 'profit_before_tax');
  }

  if (industry === 'service' || industry === 'professional_practice') {
    expensePresentation = 'nature';
    showOperatingProfit = true;
    layoutKey = 'service_nature';
    subtotals.push('operating_profit', 'profit_before_tax');
  }

  if (industry === 'construction') {
    expensePresentation = 'function';
    showGrossProfit = true;
    layoutKey = 'construction_contract';
    subtotals.push('gross_profit', 'contract_revenue', 'profit_before_tax');
  }

  if (industry === 'npo') {
    expensePresentation = 'nature';
    layoutKey = 'npo_surplus';
    subtotals.push('surplus_deficit', 'changes_in_net_assets');
    showProfitBeforeTax = false;
    entitySpecificLayout = true;
  }

  if (characteristics.isAssetIntensive && statementType === 'financial_position') {
    assetPresentation = 'current_non_current';
    layoutKey = `${layoutKey}_asset_intensive`;
    entitySpecificLayout = true;
  }

  if (characteristics.isDebtIntensive && statementType === 'financial_position') {
    subtotals.push('total_liabilities', 'net_debt');
    layoutKey = `${layoutKey}_debt_intensive`;
  }

  if (size === 'dormant_entity' || size === 'micro_entity') {
    layoutKey = 'simplified_micro';
    showGrossProfit = false;
    showOperatingProfit = false;
    entitySpecificLayout = true;
  }

  if (characteristics.isLossMaking && statementType === 'financial_performance') {
    subtotals.push('loss_before_tax');
    layoutKey = `${layoutKey}_loss_making`;
  }

  if (characteristics.isHighGrowth && statementType === 'financial_performance') {
    subtotals.push('ebitda_proxy', 'profit_before_tax');
    layoutKey = `${layoutKey}_high_growth`;
  }

  if (statementType === 'cash_flows') {
    layoutKey = `${layoutKey}_indirect_method`;
    subtotals.push('operating', 'investing', 'financing', 'net_change_cash');
  }

  if (statementType === 'changes_in_equity') {
    subtotals.push('opening_balance', 'comprehensive_income', 'closing_balance');
  }

  const framework = model.frameworkKey || 'IFRS_SME';
  if (framework === 'GRAP' || framework === 'IPSAS') {
    layoutKey = `${framework.toLowerCase()}_${layoutKey}`;
  }

  return {
    statementType,
    assetPresentation,
    expensePresentation,
    showGrossProfit,
    showOperatingProfit,
    showProfitBeforeTax,
    subtotals: [...new Set(subtotals)],
    layoutKey,
    entitySpecificLayout,
  };
}

/** Determine statement presentation for all primary statements. */
export function determineStatementPresentation(
  model: DocumentModel,
  profile: EntityProfile,
): StatementPresentationDecision[] {
  return STATEMENT_TYPES.filter((type) =>
    model.statements.some((s) => s.statement_type === type),
  ).map((type) => presentationForStatement(type, profile, model));
}
