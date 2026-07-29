/**
 * Seventh Schedule fringe benefit calculations — Income Tax Act.
 */

import type { FringeBenefitInput, StatutoryRuleSet } from '../types.ts';
import { createAuditStep, roundCurrency } from '../utils.ts';
import type { AuditStep } from '../types.ts';

export type FringeBenefitLine = {
  benefitType: string;
  taxableValue: number;
  legislativeReference: string;
  auditTrail: AuditStep[];
};

export function calculateFringeBenefitLine(
  benefit: FringeBenefitInput,
  ruleSet: StatutoryRuleSet
): FringeBenefitLine {
  switch (benefit.type) {
    case 'company_car': {
      const rate = benefit.employeePaysFuel
        ? ruleSet.vehicleFringeRateEmployeeFuel
        : ruleSet.vehicleFringeRateEmployerCosts;
      const taxable = roundCurrency(benefit.determinedValue * rate);
      const ref = benefit.employeePaysFuel
        ? 'Seventh Schedule para 7(1)(b) — 3.25% of determined value'
        : 'Seventh Schedule para 7(1)(a) — 3.5% of determined value';
      return {
        benefitType: 'company_car',
        taxableValue: taxable,
        legislativeReference: ref,
        auditTrail: [
          createAuditStep(
            'fringe_company_car',
            'determined_value × statutory_rate',
            { determinedValue: benefit.determinedValue, rate, employeePaysFuel: benefit.employeePaysFuel ?? false },
            taxable,
            { monthlyFringe: taxable }
          ),
        ],
      };
    }
    case 'employer_insurance': {
      const taxable = roundCurrency(benefit.monthlyPremium);
      return {
        benefitType: 'employer_insurance',
        taxableValue: taxable,
        legislativeReference: 'Seventh Schedule para 7(4) — premiums paid by employer',
        auditTrail: [
          createAuditStep('fringe_insurance', 'employer_premium_paid', { monthlyPremium: benefit.monthlyPremium }, taxable),
        ],
      };
    }
    case 'low_interest_loan': {
      const fringeRate = Math.max(0, ruleSet.officialInterestRateAnnual - benefit.actualInterestRateAnnual);
      const taxable = roundCurrency((benefit.loanBalance * fringeRate) / 12);
      return {
        benefitType: 'low_interest_loan',
        taxableValue: taxable,
        legislativeReference: 'Seventh Schedule para 7(1)(f) — (official_rate − actual_rate) × balance / 12',
        auditTrail: [
          createAuditStep(
            'fringe_low_interest_loan',
            '(official_rate − actual_rate) × loan_balance / 12',
            {
              loanBalance: benefit.loanBalance,
              officialRate: ruleSet.officialInterestRateAnnual,
              actualRate: benefit.actualInterestRateAnnual,
            },
            taxable
          ),
        ],
      };
    }
    case 'employer_accommodation': {
      const annualValue = benefit.monthlyRentalValue * 12;
      const abatement = benefit.furnished
        ? ruleSet.accommodationAbatementAnnual * 1.25
        : ruleSet.accommodationAbatementAnnual;
      const annualTaxable = Math.max(0, annualValue - abatement);
      const taxable = roundCurrency(annualTaxable / 12);
      return {
        benefitType: 'employer_accommodation',
        taxableValue: taxable,
        legislativeReference: 'Seventh Schedule para 7(2) — rental value minus abatement',
        auditTrail: [
          createAuditStep(
            'fringe_accommodation',
            'max(0, (monthly_rental × 12 − abatement) / 12)',
            { monthlyRentalValue: benefit.monthlyRentalValue, abatement, furnished: benefit.furnished ?? false },
            taxable
          ),
        ],
      };
    }
    case 'employer_asset': {
      const taxable = roundCurrency(benefit.monthlyValueOfUse);
      return {
        benefitType: 'employer_asset',
        taxableValue: taxable,
        legislativeReference: 'Seventh Schedule para 7(4) — value of use of employer asset',
        auditTrail: [
          createAuditStep('fringe_asset', 'monthly_value_of_use', { monthlyValueOfUse: benefit.monthlyValueOfUse }, taxable),
        ],
      };
    }
    default: {
      const taxable = roundCurrency(benefit.monthlyValue);
      return {
        benefitType: 'other',
        taxableValue: taxable,
        legislativeReference: benefit.legislativeReference ?? 'Seventh Schedule para 7(4)',
        auditTrail: [
          createAuditStep('fringe_other', 'declared_monthly_value', { monthlyValue: benefit.monthlyValue }, taxable),
        ],
      };
    }
  }
}
