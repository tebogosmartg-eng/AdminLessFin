/**
 * Lump sum and termination benefit tax — §10(1)(x), Second Schedule.
 */

import type { LumpSumTaxBracket, StatutoryRuleSet, TerminationInput } from '../types';
import { calculateAnnualTax, createAuditStep, roundCurrency } from '../utils';
import type { AuditStep } from '../types';

export type TerminationTaxResult = {
  taxableAdjustment: number;
  withholdingAmount: number;
  exemptPortion: number;
  legislativeReference: string;
  auditTrail: AuditStep[];
};

function calculateLumpSumTax(amount: number, table: LumpSumTaxBracket[]): number {
  return calculateAnnualTax(amount, table);
}

export function calculateTerminationBenefit(
  input: TerminationInput,
  ruleSet: StatutoryRuleSet,
  employeeAge?: number
): TerminationTaxResult {
  const gross = roundCurrency(input.grossAmount + (input.gratuityAmount ?? 0));
  const auditTrail: AuditStep[] = [];

  switch (input.benefitType) {
    case 'retrenchment':
    case 'severance': {
      const lifetimeClaimed = input.lifetimeSeveranceClaimed ?? 0;
      const remaining = Math.max(0, ruleSet.severanceExemptionLifetime - lifetimeClaimed);
      const exempt = Math.min(gross, remaining);
      const taxable = roundCurrency(gross - exempt);
      auditTrail.push(
        createAuditStep(
          'severance_exemption',
          'min(payment, lifetime_exemption_remaining) per §10(1)(x)',
          { gross, lifetimeClaimed, exemptionCap: ruleSet.severanceExemptionLifetime },
          exempt,
          { taxablePortion: taxable }
        )
      );
      return {
        taxableAdjustment: taxable,
        withholdingAmount: 0,
        exemptPortion: exempt,
        legislativeReference: 'Income Tax Act §10(1)(x) — severance exemption R500,000 lifetime',
        auditTrail,
      };
    }
    case 'retirement_lump_sum': {
      const prior = input.lifetimeRetirementLumpSumClaimed ?? 0;
      const tax = calculateLumpSumTax(gross, ruleSet.retirementLumpSumTable);
      auditTrail.push(
        createAuditStep(
          'retirement_lump_sum_tax',
          'Second Schedule retirement fund lump sum table',
          { gross, priorClaims: prior },
          tax
        )
      );
      return {
        taxableAdjustment: 0,
        withholdingAmount: tax,
        exemptPortion: 0,
        legislativeReference: 'Second Schedule Part II — retirement fund lump sum benefits',
        auditTrail,
      };
    }
    case 'death': {
      const exempt = Math.min(gross, ruleSet.deathBenefitExemption);
      const taxable = roundCurrency(gross - exempt);
      const tax = taxable > 0 ? calculateLumpSumTax(taxable, ruleSet.retirementLumpSumTable) : 0;
      auditTrail.push(
        createAuditStep(
          'death_benefit',
          'exemption then retirement lump sum table on balance',
          { gross, deathExemption: ruleSet.deathBenefitExemption },
          tax,
          { exempt, taxable }
        )
      );
      return {
        taxableAdjustment: 0,
        withholdingAmount: tax,
        exemptPortion: exempt,
        legislativeReference: '§10(1)(o)(i) and Second Schedule — death benefits',
        auditTrail,
      };
    }
    case 'disability': {
      const tax = calculateLumpSumTax(gross, ruleSet.retirementLumpSumTable);
      auditTrail.push(
        createAuditStep(
          'disability_lump_sum',
          'Second Schedule lump sum table',
          { gross, employeeAge: employeeAge ?? null },
          tax
        )
      );
      return {
        taxableAdjustment: 0,
        withholdingAmount: tax,
        exemptPortion: 0,
        legislativeReference: '§10(1)(o)(ii) — disability lump sum benefits',
        auditTrail,
      };
    }
    default:
      return {
        taxableAdjustment: gross,
        withholdingAmount: 0,
        exemptPortion: 0,
        legislativeReference: 'Income Tax Act — remuneration',
        auditTrail,
      };
  }
}
