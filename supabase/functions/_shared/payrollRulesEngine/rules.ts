/**
 * Individual rule calculators — each rule is a pluggable unit.
 */

import { getRuleById } from './catalogue.ts';
import { calculatePaye, normalizeSalaryToMonthly, roundCurrency } from './paye.ts';
import type {
  CalculationState,
  PayrollRulesContext,
  RuleCalculator,
  RuleExecutionResult,
} from './types.ts';

export function isRuleEnabled(ctx: PayrollRulesContext, ruleId: string): boolean {
  const def = getRuleById(ruleId);
  if (!def) return false;

  const runOverride = ctx.runRuleOverrides[ruleId];
  if (runOverride?.enabled != null) return runOverride.enabled;

  const employeeSetting = ctx.employeeRuleSettings[ruleId];
  if (employeeSetting?.enabled === false) return false;

  const companySetting = ctx.companyRuleSettings[ruleId];
  if (companySetting?.enabled != null) return companySetting.enabled;

  return def.enabledByDefault;
}

function mergeConfig(
  ctx: PayrollRulesContext,
  ruleId: string
): Record<string, unknown> {
  const def = getRuleById(ruleId);
  const company = ctx.companyRuleSettings[ruleId]?.config ?? {};
  const employee = ctx.employeeRuleSettings[ruleId]?.config ?? {};
  const run = ctx.runRuleOverrides[ruleId]?.config ?? {};
  return { ...company, ...employee, ...run };
}

function skippedResult(ruleId: string, reason: string): RuleExecutionResult {
  const def = getRuleById(ruleId)!;
  return {
    ruleId,
    ruleName: def.name,
    enabled: false,
    skipped: true,
    skipReason: reason,
    employeeAmount: 0,
    employerAmount: 0,
    lineItems: [],
    taxableAdjustment: 0,
  };
}

function buildResult(
  ruleId: string,
  employeeAmount: number,
  employerAmount: number,
  lineItems: RuleExecutionResult['lineItems'],
  taxableAdjustment = 0
): RuleExecutionResult {
  const def = getRuleById(ruleId)!;
  return {
    ruleId,
    ruleName: def.name,
    enabled: true,
    skipped: false,
    employeeAmount,
    employerAmount,
    lineItems,
    taxableAdjustment,
  };
}

export const basicSalaryRule: RuleCalculator = {
  ruleId: 'basic_salary',
  calculate(ctx, _state) {
    if (!isRuleEnabled(ctx, 'basic_salary')) {
      return skippedResult('basic_salary', 'Rule disabled');
    }
    const monthly = normalizeSalaryToMonthly(
      ctx.employee.salaryAmount,
      ctx.employee.salaryPeriod
    );
    const def = getRuleById('basic_salary')!;
    return buildResult(
      'basic_salary',
      0,
      0,
      [{
        ruleId: 'basic_salary',
        description: def.payslipLabel,
        type: 'earning',
        amount: monthly,
        taxableImpact: def.taxableImpact,
        accountingImpact: def.accountingImpact,
      }],
      monthly
    );
  },
};

export const pensionRule: RuleCalculator = {
  ruleId: 'pension',
  calculate(ctx, state) {
    if (!isRuleEnabled(ctx, 'pension')) return skippedResult('pension', 'Rule disabled');
    const config = mergeConfig(ctx, 'pension');
    const amount = resolveContributionAmount(state.grossPay, config);
    if (amount <= 0) return skippedResult('pension', 'No contribution configured');
    const def = getRuleById('pension')!;
    return buildResult('pension', amount, 0, [{
      ruleId: 'pension', description: def.payslipLabel, type: 'deduction', amount,
      taxableImpact: def.taxableImpact, accountingImpact: def.accountingImpact,
    }], -amount);
  },
};

export const providentFundRule: RuleCalculator = {
  ruleId: 'provident_fund',
  calculate(ctx, state) {
    if (!isRuleEnabled(ctx, 'provident_fund')) return skippedResult('provident_fund', 'Rule disabled');
    const config = mergeConfig(ctx, 'provident_fund');
    const amount = resolveContributionAmount(state.grossPay, config);
    if (amount <= 0) return skippedResult('provident_fund', 'No contribution configured');
    const def = getRuleById('provident_fund')!;
    return buildResult('provident_fund', amount, 0, [{
      ruleId: 'provident_fund', description: def.payslipLabel, type: 'deduction', amount,
      taxableImpact: def.taxableImpact, accountingImpact: def.accountingImpact,
    }], -amount);
  },
};

export const medicalAidRule: RuleCalculator = {
  ruleId: 'medical_aid',
  calculate(ctx, _state) {
    if (!isRuleEnabled(ctx, 'medical_aid')) return skippedResult('medical_aid', 'Rule disabled');
    const config = mergeConfig(ctx, 'medical_aid');
    const amount = Number(config.monthly_amount ?? config.amount ?? 0);
    if (amount <= 0) return skippedResult('medical_aid', 'No contribution configured');
    const def = getRuleById('medical_aid')!;
    return buildResult('medical_aid', amount, 0, [{
      ruleId: 'medical_aid', description: def.payslipLabel, type: 'deduction', amount,
      taxableImpact: def.taxableImpact, accountingImpact: def.accountingImpact,
    }], -amount);
  },
};

export const payeRule: RuleCalculator = {
  ruleId: 'paye',
  calculate(ctx, state) {
    if (!isRuleEnabled(ctx, 'paye')) return skippedResult('paye', 'Rule disabled');
    const config = mergeConfig(ctx, 'paye');
    const medicalAidConfig = mergeConfig(ctx, 'medical_aid');
    const medicalDependants = Number(config.medical_dependants ?? 0);
    const medicalSchemeEntitled =
      isRuleEnabled(ctx, 'medical_aid') &&
      Number(medicalAidConfig.monthly_amount ?? medicalAidConfig.amount ?? 0) > 0;
    const paye = calculatePaye({
      monthlyTaxableIncome: Math.max(0, state.taxableIncome),
      taxYearConfig: ctx.taxYearConfig,
      age: ctx.employee.age,
      medicalDependants,
      medicalSchemeEntitled,
      ytdTaxableIncome: ctx.ytdTaxableIncome,
      ytdPayePaid: ctx.ytdPayePaid,
    });
    const def = getRuleById('paye')!;
    return buildResult('paye', paye.monthlyPaye, 0, [{
      ruleId: 'paye', description: def.payslipLabel, type: 'deduction', amount: paye.monthlyPaye,
      taxableImpact: def.taxableImpact, accountingImpact: def.accountingImpact,
    }]);
  },
};

export const uifRule: RuleCalculator = {
  ruleId: 'uif',
  calculate(ctx, state) {
    if (!isRuleEnabled(ctx, 'uif')) return skippedResult('uif', 'Rule disabled');
    const config = mergeConfig(ctx, 'uif');
    const rate = Number(config.rate ?? ctx.taxYearConfig.uifRate ?? 0.01);
    const ceiling = Number(config.ceiling ?? ctx.taxYearConfig.uifCeilingMonthly ?? Infinity);
    const remuneration = Math.min(state.grossPay, ceiling);
    const amount = roundCurrency(remuneration * rate);
    const def = getRuleById('uif')!;
    return buildResult('uif', amount, 0, [{
      ruleId: 'uif', description: def.payslipLabel, type: 'deduction', amount,
      taxableImpact: def.taxableImpact, accountingImpact: def.accountingImpact,
    }]);
  },
};

export const uifEmployerRule: RuleCalculator = {
  ruleId: 'uif_employer',
  calculate(ctx, state) {
    if (!isRuleEnabled(ctx, 'uif_employer')) return skippedResult('uif_employer', 'Rule disabled');
    const config = mergeConfig(ctx, 'uif_employer');
    const rate = Number(config.rate ?? ctx.taxYearConfig.uifRate ?? 0.01);
    const ceiling = Number(config.ceiling ?? ctx.taxYearConfig.uifCeilingMonthly ?? Infinity);
    const remuneration = Math.min(state.grossPay, ceiling);
    const amount = roundCurrency(remuneration * rate);
    const def = getRuleById('uif_employer')!;
    return buildResult('uif_employer', 0, amount, [{
      ruleId: 'uif_employer', description: def.payslipLabel, type: 'employer_contribution', amount,
      taxableImpact: def.taxableImpact, accountingImpact: def.accountingImpact,
    }]);
  },
};

export const sdlRule: RuleCalculator = {
  ruleId: 'sdl',
  calculate(ctx, state) {
    if (!isRuleEnabled(ctx, 'sdl')) return skippedResult('sdl', 'Rule disabled');
    const config = mergeConfig(ctx, 'sdl');
    const rate = Number(config.rate ?? ctx.taxYearConfig.sdlRate ?? 0.01);
    const amount = roundCurrency(state.grossPay * rate);
    const def = getRuleById('sdl')!;
    return buildResult('sdl', 0, amount, [{
      ruleId: 'sdl', description: def.payslipLabel, type: 'employer_contribution', amount,
      taxableImpact: def.taxableImpact, accountingImpact: def.accountingImpact,
    }]);
  },
};

export const unionFeesRule: RuleCalculator = {
  ruleId: 'union_fees',
  calculate(ctx, _state) {
    if (!isRuleEnabled(ctx, 'union_fees')) return skippedResult('union_fees', 'Rule disabled');
    const config = mergeConfig(ctx, 'union_fees');
    const amount = Number(config.monthly_amount ?? config.amount ?? 0);
    if (amount <= 0) return skippedResult('union_fees', 'No amount configured');
    const def = getRuleById('union_fees')!;
    return buildResult('union_fees', amount, 0, [{
      ruleId: 'union_fees', description: def.payslipLabel, type: 'deduction', amount,
      taxableImpact: def.taxableImpact, accountingImpact: def.accountingImpact,
    }]);
  },
};

export const garnisheeRule: RuleCalculator = {
  ruleId: 'garnishee',
  calculate(ctx, _state) {
    if (!isRuleEnabled(ctx, 'garnishee')) return skippedResult('garnishee', 'Rule disabled');
    const config = mergeConfig(ctx, 'garnishee');
    const amount = Number(config.monthly_amount ?? config.amount ?? 0);
    if (amount <= 0) return skippedResult('garnishee', 'No amount configured');
    const label = String(config.label ?? getRuleById('garnishee')!.payslipLabel);
    const def = getRuleById('garnishee')!;
    return buildResult('garnishee', amount, 0, [{
      ruleId: 'garnishee', description: label, type: 'deduction', amount,
      taxableImpact: def.taxableImpact, accountingImpact: def.accountingImpact,
    }]);
  },
};

export const customDeductionRule: RuleCalculator = {
  ruleId: 'custom_deduction',
  calculate(ctx, state) {
    if (!isRuleEnabled(ctx, 'custom_deduction')) return skippedResult('custom_deduction', 'Rule disabled');
    const config = mergeConfig(ctx, 'custom_deduction');
    const amount = resolveContributionAmount(state.grossPay, config);
    if (amount <= 0) return skippedResult('custom_deduction', 'No amount configured');
    const label = String(config.label ?? 'Custom Deduction');
    const def = getRuleById('custom_deduction')!;
    return buildResult('custom_deduction', amount, 0, [{
      ruleId: 'custom_deduction', description: label, type: 'deduction', amount,
      taxableImpact: def.taxableImpact, accountingImpact: def.accountingImpact,
    }]);
  },
};

export const customEmployerContributionRule: RuleCalculator = {
  ruleId: 'custom_employer_contribution',
  calculate(ctx, state) {
    if (!isRuleEnabled(ctx, 'custom_employer_contribution')) {
      return skippedResult('custom_employer_contribution', 'Rule disabled');
    }
    const config = mergeConfig(ctx, 'custom_employer_contribution');
    const amount = resolveContributionAmount(state.grossPay, config);
    if (amount <= 0) return skippedResult('custom_employer_contribution', 'No amount configured');
    const label = String(config.label ?? 'Custom Employer Contribution');
    const def = getRuleById('custom_employer_contribution')!;
    return buildResult('custom_employer_contribution', 0, amount, [{
      ruleId: 'custom_employer_contribution', description: label, type: 'employer_contribution', amount,
      taxableImpact: def.taxableImpact, accountingImpact: def.accountingImpact,
    }]);
  },
};

function resolveContributionAmount(
  grossPay: number,
  config: Record<string, unknown>
): number {
  if (config.amount != null) return roundCurrency(Number(config.amount));
  if (config.monthly_amount != null) return roundCurrency(Number(config.monthly_amount));
  if (config.percentage != null) {
    return roundCurrency(grossPay * (Number(config.percentage) / 100));
  }
  return 0;
}

export const RULE_CALCULATORS: RuleCalculator[] = [
  basicSalaryRule,
  pensionRule,
  providentFundRule,
  medicalAidRule,
  payeRule,
  uifRule,
  uifEmployerRule,
  sdlRule,
  customEmployerContributionRule,
  unionFeesRule,
  garnisheeRule,
  customDeductionRule,
];

export function applyRuleResult(
  state: CalculationState,
  result: RuleExecutionResult
): void {
  if (result.skipped) return;
  state.lineItems.push(...result.lineItems);
  state.grossPay += result.lineItems
    .filter((i) => i.type === 'earning')
    .reduce((s, i) => s + i.amount, 0);
  state.taxableIncome += result.taxableAdjustment;
  if (result.employeeAmount > 0) {
    state.employeeDeductions[result.ruleId] = result.employeeAmount;
  }
  if (result.employerAmount > 0) {
    state.employerContributions[result.ruleId] = result.employerAmount;
  }
}
