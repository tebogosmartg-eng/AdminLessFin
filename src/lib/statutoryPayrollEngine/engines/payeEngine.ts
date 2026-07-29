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

export type PayeEngineInput = {
  monthlyTaxableIncome: number;
  annualMedicalCredits: number;
  age?: number;
  ytdTaxableIncome?: number;
  ytdPayePaid?: number;
  periodsProcessed?: number;
  payeMode?: PayeCalculationMode;
};

export function calculatePayeAmount(
  ctx: StatutoryCalculationContext,
  input: PayeEngineInput
): StatutoryEngineResult {
  const engineId = 'paye' as const;
  if (!isEngineEnabled(ctx.enabledEngines, engineId)) {
    return skippedEngineResult(engineId, 'PAYE engine disabled');
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
  const isDirectorAnnualFee = payeMode === 'director_annual_fee';
  const annualTaxableIncome = isDirectorAnnualFee
    ? roundCurrency(monthlyTaxableIncome)
    : roundCurrency(monthlyTaxableIncome * 12);
  auditTrail.push(
    createAuditStep(
      'annualise',
      isDirectorAnnualFee
        ? 'director_annual_fee — full fee as annual taxable income'
        : 'monthly_taxable_income × 12',
      { monthlyTaxableIncome, payeMode },
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

  if (ytdTaxableIncome > 0 || ytdPayePaid > 0) {
    const monthsElapsed = periodsProcessed ?? Math.max(
      1,
      Math.round(ytdTaxableIncome / Math.max(monthlyTaxableIncome, 1))
    );
    const remainingMonths = Math.max(1, 12 - monthsElapsed);
    const projectedAnnual = ytdTaxableIncome + monthlyTaxableIncome * remainingMonths;
    const projectedTax = Math.max(
      0,
      calculateAnnualTax(projectedAnnual, ruleSet.brackets) - annualRebate - annualMedicalCredits
    );
    annualTaxLiability = Math.max(0, projectedTax - ytdPayePaid);
    monthlyPaye = isDirectorAnnualFee
      ? roundCurrency(annualTaxLiability)
      : roundCurrency(annualTaxLiability / remainingMonths);
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
    monthlyPaye = isDirectorAnnualFee
      ? roundCurrency(annualTaxLiability)
      : roundCurrency(annualTaxLiability / 12);
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
  });
}
