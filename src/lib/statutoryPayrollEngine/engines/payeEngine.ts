/**
 * PAYE Engine — Pay-As-You-Earn income tax (Section 81, Income Tax Act).
 * Single responsibility: calculate monthly PAYE from taxable earnings.
 */

import type { PayeCalculationMode, StatutoryCalculationContext, StatutoryEngineResult } from '../types';
import {
  ENGINE_VERSION,
  calculateAnnualTax,
  createAuditStep,
  isEngineEnabled,
  resolveRebate,
  roundCurrency,
  skippedEngineResult,
} from '../utils';

/** Employees' tax rate for non-standard employment. */
export const NON_STANDARD_RATE = 0.25;

export type PayeEngineInput = {
  monthlyTaxableIncome: number;
  annualMedicalCredits: number;
  age?: number;
  ytdTaxableIncome?: number;
  ytdPayePaid?: number;
  periodsProcessed?: number;
  payeMode?: PayeCalculationMode;
  /** Annual payments inside monthlyTaxableIncome (bonus, once-off taxable amounts). */
  annualPayment?: number;
  /** Pay periods in the tax year (12 monthly, 26 fortnightly, 52 weekly). monthlyTaxableIncome is per period. */
  periodsPerYear?: number;
};

export function calculatePayeAmount(
  ctx: StatutoryCalculationContext,
  input: PayeEngineInput
): StatutoryEngineResult {
  const engineId = 'paye' as const;
  if (!isEngineEnabled(ctx.enabledEngines, engineId)) {
    return skippedEngineResult(engineId, 'PAYE engine disabled');
  }

  // Non-standard employment (Fourth Schedule; SARS Guide for Employers iro Employees' Tax):
  // employees' tax at 25% of the remuneration, without rebates or medical credits.
  if (input.payeMode === 'non_standard') {
    const base = roundCurrency(Math.max(0, input.monthlyTaxableIncome));
    const paye = roundCurrency(base * NON_STANDARD_RATE);
    return {
      engineId,
      engineVersion: ENGINE_VERSION,
      enabled: true,
      skipped: false,
      employeeAmount: paye,
      employerAmount: 0,
      taxableAdjustment: 0,
      breakdown: { periodTaxableIncome: base, flatRate: NON_STANDARD_RATE, payePayable: paye },
      auditTrail: [
        createAuditStep('non_standard_employment', 'period_remuneration × 25% (no rebates, no medical credits)', { periodTaxableIncome: base }, paye),
      ],
    };
  }

  const { ruleSet } = ctx;
  const {
    monthlyTaxableIncome,
    annualMedicalCredits,
    age,
    ytdTaxableIncome = 0,
    ytdPayePaid = 0,
    periodsProcessed,
    payeMode = 'standard',
  } = input;

  const auditTrail = [];
  const periods = input.periodsPerYear && input.periodsPerYear > 0 ? input.periodsPerYear : 12;
  const isDirectorAnnualFee = payeMode === 'director_annual_fee';
  const annualPayment = isDirectorAnnualFee
    ? 0
    : roundCurrency(Math.min(Math.max(0, input.annualPayment ?? 0), Math.max(0, monthlyTaxableIncome)));
  // Only the periodic part is annualised; annual payments are taxed once below.
  const periodicMonthly = roundCurrency(monthlyTaxableIncome - annualPayment);
  const annualTaxableIncome = isDirectorAnnualFee
    ? roundCurrency(monthlyTaxableIncome)
    : roundCurrency(periodicMonthly * periods);
  auditTrail.push(
    createAuditStep(
      'annualise',
      isDirectorAnnualFee
        ? 'director_annual_fee — full fee as annual taxable income'
        : annualPayment > 0
          ? '(period_taxable_income − annual_payments) × periods_per_year'
          : 'period_taxable_income × periods_per_year',
      { monthlyTaxableIncome, annualPayment, payeMode, periodsPerYear: periods },
      annualTaxableIncome
    )
  );

  const annualTaxBeforeCredits = calculateAnnualTax(annualTaxableIncome, ruleSet.brackets);
  const bracket = ruleSet.brackets.find(
    (b) => annualTaxableIncome >= b.from && (b.to == null || annualTaxableIncome < b.to)
  ) ?? ruleSet.brackets[ruleSet.brackets.length - 1];
  auditTrail.push(
    createAuditStep(
      'bracket_tax',
      'base + (income - bracket_from) × rate',
      {
        taxYear: ruleSet.taxYearLabel,
        ruleVersion: ruleSet.ruleVersion,
        annualTaxableIncome,
        bracketFrom: bracket.from,
        bracketRate: bracket.rate,
      },
      annualTaxBeforeCredits,
      { bracketBase: bracket.base }
    )
  );

  const annualRebate = resolveRebate(ruleSet.rebates, age, {
    secondaryAge: ruleSet.rebateSecondaryAge,
    tertiaryAge: ruleSet.rebateTertiaryAge,
  });
  auditTrail.push(
    createAuditStep(
      'rebate',
      'primary + age_based_secondary_or_tertiary',
      { age: age ?? null, primary: ruleSet.rebates.primary },
      annualRebate
    )
  );

  auditTrail.push(
    createAuditStep(
      'medical_credits_offset',
      'annual_medical_tax_credits (from medical engine)',
      { annualMedicalCredits },
      annualMedicalCredits
    )
  );

  let monthlyPaye: number;
  let annualTaxLiability: number;
  /** Tax on annual payments: tax(base + payments) − tax(base), after rebates and credits. */
  const annualPaymentTax = (annualBase: number): number => {
    if (annualPayment <= 0) return 0;
    const without = Math.max(0, calculateAnnualTax(annualBase, ruleSet.brackets) - annualRebate - annualMedicalCredits);
    const withPayment = Math.max(
      0,
      calculateAnnualTax(annualBase + annualPayment, ruleSet.brackets) - annualRebate - annualMedicalCredits
    );
    const tax = roundCurrency(withPayment - without);
    auditTrail.push(
      createAuditStep(
        'annual_payment',
        'tax(annual_equivalent + annual_payments) − tax(annual_equivalent) — SARS difference method',
        { annualEquivalent: annualBase, annualPayment, annualRebate, annualMedicalCredits },
        tax
      )
    );
    return tax;
  };

  if (ytdTaxableIncome > 0 || ytdPayePaid > 0) {
    const monthsElapsed = periodsProcessed ?? Math.max(
      1,
      Math.round(ytdTaxableIncome / Math.max(periodicMonthly, 1))
    );
    const remainingMonths = Math.max(1, periods - monthsElapsed);
    const projectedAnnual = ytdTaxableIncome + periodicMonthly * remainingMonths;
    const projectedTax = Math.max(
      0,
      calculateAnnualTax(projectedAnnual, ruleSet.brackets) - annualRebate - annualMedicalCredits
    );
    annualTaxLiability = Math.max(0, projectedTax - ytdPayePaid);
    const paymentTax = annualPaymentTax(projectedAnnual);
    monthlyPaye = isDirectorAnnualFee
      ? roundCurrency(annualTaxLiability)
      : roundCurrency(annualTaxLiability / remainingMonths + paymentTax);
    auditTrail.push(
      createAuditStep(
        'ytd_adjustment',
        '(projected_annual_tax - rebates - credits - ytd_paye) / remaining_months',
        { ytdTaxableIncome, ytdPayePaid, remainingMonths, projectedAnnual },
        monthlyPaye,
        { projectedTax, annualTaxLiability }
      )
    );
  } else {
    annualTaxLiability = Math.max(
      0,
      annualTaxBeforeCredits - annualRebate - annualMedicalCredits
    );
    const paymentTax = annualPaymentTax(annualTaxableIncome);
    monthlyPaye = isDirectorAnnualFee
      ? roundCurrency(annualTaxLiability)
      : roundCurrency(annualTaxLiability / periods + paymentTax);
    auditTrail.push(
      createAuditStep(
        'monthly_paye',
        isDirectorAnnualFee
          ? 'max(0, annual_tax - rebate - medical_credits) — director annual fee'
          : 'max(0, annual_tax - rebate - medical_credits) / 12',
        { annualTaxBeforeCredits, annualRebate, annualMedicalCredits },
        monthlyPaye,
        { annualTaxLiability }
      )
    );
  }

  return {
    engineId,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    skipped: false,
    employeeAmount: monthlyPaye,
    employerAmount: 0,
    taxableAdjustment: 0,
    breakdown: {
      monthlyPaye,
      annualTaxableIncome,
      annualTaxBeforeCredits,
      annualRebate,
      annualMedicalCredits,
      annualTaxLiability,
      annualPayment,
      effectiveRate:
        annualTaxableIncome > 0 ? roundCurrency(annualTaxLiability / annualTaxableIncome) : 0,
    },
    auditTrail,
  };
}

export function runPayeEngine(
  ctx: StatutoryCalculationContext,
  monthlyMedicalCredits = 0
): StatutoryEngineResult {
  const annualMedicalCredits = roundCurrency(monthlyMedicalCredits * 12);

  return calculatePayeAmount(ctx, {
    monthlyTaxableIncome: Math.max(0, ctx.taxableEarnings),
    annualMedicalCredits,
    age: ctx.employee.age,
    ytdTaxableIncome: ctx.ytd?.taxableIncome,
    ytdPayePaid: ctx.ytd?.payePaid,
    periodsProcessed: ctx.ytd?.periodsProcessed,
    payeMode: ctx.payeMode ?? 'standard',
    annualPayment: ctx.nonPeriodicTaxable ?? 0,
    periodsPerYear: ctx.periodsPerYear ?? 12,
  });
}
