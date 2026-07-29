/**
 * Payroll Rules Engine orchestrator — processes rules in sequence.
 */

import { getSortedRules } from './catalogue';
import { RULE_CALCULATORS, applyRuleResult, isRuleEnabled } from './rules';
import { roundCurrency } from './paye';
import type {
  CalculationState,
  PayrollCalculationResult,
  PayrollRulesContext,
  RuleConfigValue,
  TaxYearConfig,
} from './types';

export function executePayrollRules(ctx: PayrollRulesContext): PayrollCalculationResult {
  const state: CalculationState = {
    grossPay: 0,
    taxableIncome: 0,
    lineItems: [],
    employeeDeductions: {},
    employerContributions: {},
  };

  const calculatorMap = new Map(RULE_CALCULATORS.map((c) => [c.ruleId, c]));
  const ruleExecutionSummary = [];

  for (const ruleDef of getSortedRules()) {
    const calculator = calculatorMap.get(ruleDef.id);
    if (!calculator) continue;
    const result = calculator.calculate(ctx, state);
    applyRuleResult(state, result);
    ruleExecutionSummary.push(result);
  }

  const totalEmployeeDeductions = Object.values(state.employeeDeductions).reduce(
    (s, v) => s + v,
    0
  );
  const totalEmployerContributions = Object.values(state.employerContributions).reduce(
    (s, v) => s + v,
    0
  );

  return {
    grossPay: roundCurrency(state.grossPay),
    taxableIncome: roundCurrency(state.taxableIncome),
    employeeDeductions: state.employeeDeductions,
    employerContributions: state.employerContributions,
    totalEmployeeDeductions: roundCurrency(totalEmployeeDeductions),
    totalEmployerContributions: roundCurrency(totalEmployerContributions),
    netPay: roundCurrency(state.grossPay - totalEmployeeDeductions),
    costToCompany: roundCurrency(state.grossPay + totalEmployerContributions),
    lineItems: state.lineItems,
    ruleExecutionSummary,
  };
}

/** Build effective rule config for a company (defaults from catalogue + DB settings). */
export function buildEffectiveCompanyRules(
  catalogDefaults: { id: string; enabled_by_default: boolean }[],
  companySettings: { rule_id: string; enabled: boolean; config?: Record<string, unknown> }[]
): Record<string, RuleConfigValue> {
  const settingsMap = new Map(companySettings.map((s) => [s.rule_id, s]));
  const result: Record<string, RuleConfigValue> = {};
  for (const rule of catalogDefaults) {
    const setting = settingsMap.get(rule.id);
    result[rule.id] = {
      enabled: setting?.enabled ?? rule.enabled_by_default,
      config: setting?.config ?? {},
    };
  }
  return result;
}

/** Merge run overrides on top of company defaults. */
export function mergeRunRuleConfig(
  companyRules: Record<string, RuleConfigValue>,
  runConfig: Record<string, RuleConfigValue>
): Record<string, RuleConfigValue> {
  const merged = { ...companyRules };
  for (const [ruleId, override] of Object.entries(runConfig)) {
    merged[ruleId] = {
      enabled: override.enabled ?? merged[ruleId]?.enabled,
      config: { ...merged[ruleId]?.config, ...override.config },
    };
  }
  return merged;
}

/** Statutory engine config — medical_aid only when rule is enabled with a contribution. */
export function buildStatutoryEngineConfig(
  companyRules: Record<string, RuleConfigValue>,
  employeeRuleSettings: Record<string, RuleConfigValue> = {},
  runOverrides: Record<string, RuleConfigValue> = {}
): Record<string, Record<string, unknown>> {
  const ctx: PayrollRulesContext = {
    employee: {
      id: 'statutory',
      firstName: '',
      lastName: '',
      salaryAmount: 0,
      salaryPeriod: 'monthly',
      employmentType: 'permanent',
      startDate: '',
    },
    period: { payPeriodStart: '', payPeriodEnd: '', payDate: '' },
    taxYearConfig: {
      id: '',
      taxYearLabel: '',
      effectiveFrom: '',
      effectiveTo: '',
      countryCode: 'ZA',
      brackets: [],
      rebates: { primary: 0, secondary: 0, tertiary: 0 },
      medicalCredits: { mainMember: 0, firstDependant: 0, additionalDependant: 0 },
      uifCeilingMonthly: 0,
      sdlRate: 0,
      uifRate: 0,
    },
    companyRuleSettings: companyRules,
    employeeRuleSettings,
    runRuleOverrides: runOverrides,
  };

  return Object.fromEntries(
    Object.entries(companyRules).map(([ruleId, rule]) => {
      if (ruleId !== 'medical_aid') {
        return [ruleId, rule.config ?? {}];
      }
      const merged = {
        ...(rule.config ?? {}),
        ...(employeeRuleSettings.medical_aid?.config ?? {}),
        ...(runOverrides.medical_aid?.config ?? {}),
      };
      const contribution = Number(merged.monthly_amount ?? merged.amount ?? 0);
      const enabled = isRuleEnabled(ctx, 'medical_aid');
      return [ruleId, enabled && contribution > 0 ? merged : {}];
    })
  );
}

/** Map DB tax year row to engine type. */
export function mapTaxYearFromDb(row: Record<string, unknown>): TaxYearConfig {
  return {
    id: row.id as string,
    taxYearLabel: row.tax_year_label as string,
    effectiveFrom: row.effective_from as string,
    effectiveTo: row.effective_to as string,
    countryCode: row.country_code as string,
    brackets: row.brackets as TaxYearConfig['brackets'],
    rebates: row.rebates as TaxYearConfig['rebates'],
    medicalCredits: row.medical_credits as TaxYearConfig['medicalCredits'],
    uifCeilingMonthly: row.uif_ceiling_monthly as number,
    sdlRate: row.sdl_rate as number,
    uifRate: row.uif_rate as number,
  };
}

export * from './types';
export * from './catalogue';
export * from './paye';
export * from './rules';
