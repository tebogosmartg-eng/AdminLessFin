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

/** Pay periods in a tax year for a pay frequency. */
export function periodsPerYearFor(frequency: 'monthly' | 'weekly' | 'fortnightly' | null | undefined): number {
  if (frequency === 'weekly') return 52;
  if (frequency === 'fortnightly') return 26;
  return 12;
}

/**
 * A salary expressed per `salaryPeriod`, converted to one pay period of a run that
 * has `periodsPerYear` periods (weekly salary on a weekly run is paid as is).
 */
export function salaryForPayPeriod(
  amount: number,
  salaryPeriod: 'monthly' | 'weekly' | 'fortnightly' | null | undefined,
  periodsPerYear = 12
): number {
  const own = periodsPerYearFor(salaryPeriod);
  if (own === periodsPerYear) return roundCurrency(amount);
  return roundCurrency((amount * own) / periodsPerYear);
}

/** A fixed monthly amount (deduction or contribution) for one pay period. */
export function monthlyAmountForPayPeriod(amount: number, periodsPerYear = 12): number {
  if (periodsPerYear === 12) return roundCurrency(amount);
  return roundCurrency((amount * 12) / periodsPerYear);
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
