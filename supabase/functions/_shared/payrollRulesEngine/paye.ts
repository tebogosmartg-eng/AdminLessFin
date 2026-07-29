/**
 * PAYE calculation — delegates to Statutory PAYE Engine.
 * Maintains backward-compatible API for Payroll Rules Engine.
 */

import type { TaxYearConfig } from './types.ts';
import { taxYearConfigToRuleSet } from '../statutoryPayrollEngine/adapter.ts';
import { runPayeEngine } from '../statutoryPayrollEngine/engines/payeEngine.ts';
import { resolveMonthlyMedicalCredits } from '../statutoryPayrollEngine/engines/medicalTaxCreditEngine.ts';
import { roundCurrency } from '../statutoryPayrollEngine/utils.ts';

export { roundCurrency };

export type PayeInput = {
  monthlyTaxableIncome: number;
  taxYearConfig: TaxYearConfig;
  age?: number;
  medicalDependants?: number;
  medicalSchemeEntitled?: boolean;
  ytdTaxableIncome?: number;
  ytdPayePaid?: number;
};

export type PayeResult = {
  monthlyPaye: number;
  annualTaxableIncome: number;
  annualTaxBeforeCredits: number;
  annualRebate: number;
  annualMedicalCredits: number;
  annualTaxLiability: number;
  effectiveRate: number;
};

export function calculatePaye(input: PayeInput): PayeResult {
  const {
    monthlyTaxableIncome,
    taxYearConfig,
    age,
    medicalDependants = 0,
    medicalSchemeEntitled = false,
    ytdTaxableIncome = 0,
    ytdPayePaid = 0,
  } = input;

  const ruleSet = taxYearConfigToRuleSet(taxYearConfig);
  const monthlyMedical = resolveMonthlyMedicalCredits(
    medicalDependants,
    ruleSet.medicalCredits,
    medicalSchemeEntitled
  );

  const result = runPayeEngine(
    {
      employee: { id: 'paye-calc', age },
      period: { payPeriodStart: '', payPeriodEnd: '', payDate: taxYearConfig.effectiveFrom },
      ruleSet,
      grossEarnings: monthlyTaxableIncome,
      taxableEarnings: monthlyTaxableIncome,
      enabledEngines: { paye: true },
      engineConfig: {},
      ytd: { taxableIncome: ytdTaxableIncome, payePaid: ytdPayePaid },
    },
    monthlyMedical
  );

  const b = result.breakdown;
  return {
    monthlyPaye: result.employeeAmount,
    annualTaxableIncome: b.annualTaxableIncome ?? monthlyTaxableIncome * 12,
    annualTaxBeforeCredits: b.annualTaxBeforeCredits ?? 0,
    annualRebate: b.annualRebate ?? 0,
    annualMedicalCredits: b.annualMedicalCredits ?? monthlyMedical * 12,
    annualTaxLiability: b.annualTaxLiability ?? 0,
    effectiveRate: b.effectiveRate ?? 0,
  };
}

export function normalizeSalaryToMonthly(
  amount: number,
  period: 'monthly' | 'weekly' | 'fortnightly'
): number {
  switch (period) {
    case 'weekly':
      return roundCurrency((amount * 52) / 12);
    case 'fortnightly':
      return roundCurrency((amount * 26) / 12);
    default:
      return roundCurrency(amount);
  }
}

export function resolveTaxYearForDate(
  payDate: string,
  configs: TaxYearConfig[]
): TaxYearConfig | undefined {
  const date = payDate.slice(0, 10);
  return configs.find(
    (c) => date >= c.effectiveFrom && date <= c.effectiveTo
  );
}
