/**
 * Medical Tax Credit Engine — Section 6A, Income Tax Act.
 * Monthly credits offset against PAYE (not a payslip deduction).
 */

import type { StatutoryCalculationContext, StatutoryEngineResult } from '../types';
import {
  ENGINE_VERSION,
  createAuditStep,
  isEngineEnabled,
  roundCurrency,
  skippedEngineResult,
} from '../utils';

export function resolveMonthlyMedicalCredits(
  dependants: number,
  credits: StatutoryCalculationContext['ruleSet']['medicalCredits'],
  entitled = false
): number {
  if (!entitled) return 0;
  const main = credits.mainMember;
  if (dependants <= 0) return main;
  const first = credits.firstDependant;
  const additional = credits.additionalDependant;
  if (dependants === 1) return roundCurrency(main + first);
  return roundCurrency(main + first + (dependants - 1) * additional);
}

function hasMedicalSchemeContribution(ctx: StatutoryCalculationContext): boolean {
  const medicalAidCfg = ctx.engineConfig.medical_aid ?? {};
  const contribution = Number(medicalAidCfg.monthly_amount ?? medicalAidCfg.amount ?? 0);
  return contribution > 0;
}

export function runMedicalTaxCreditEngine(
  ctx: StatutoryCalculationContext
): StatutoryEngineResult {
  const engineId = 'medical_tax_credit' as const;
  if (!isEngineEnabled(ctx.enabledEngines, engineId, true)) {
    return skippedEngineResult(engineId, 'Medical tax credit engine disabled');
  }

  const entitled = hasMedicalSchemeContribution(ctx);
  const config = ctx.engineConfig.medical_tax_credit ?? ctx.engineConfig.paye ?? {};
  const dependants = Number(
    ctx.components?.medicalDependants ?? config.medical_dependants ?? 0
  );
  const monthlyCredit = resolveMonthlyMedicalCredits(dependants, ctx.ruleSet.medicalCredits, entitled);
  const annualCredit = roundCurrency(monthlyCredit * 12);

  if (!entitled) {
    return {
      engineId,
      engineVersion: ENGINE_VERSION,
      enabled: true,
      skipped: true,
      skipReason: 'No registered medical scheme contribution — Section 6A not applicable',
      employeeAmount: 0,
      employerAmount: 0,
      taxableAdjustment: 0,
      breakdown: { dependants, monthlyCredit: 0, annualCredit: 0 },
      auditTrail: [
        createAuditStep(
          'medical_credit',
          'section_6a_requires_medical_scheme_contribution',
          { dependants, entitled: false },
          0,
          { annualCredit: 0 }
        ),
      ],
    };
  }
  return {
    engineId,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    skipped: dependants === 0 && monthlyCredit === ctx.ruleSet.medicalCredits.mainMember,
    skipReason: undefined,
    employeeAmount: 0,
    employerAmount: 0,
    taxableAdjustment: 0,
    breakdown: { dependants, monthlyCredit, annualCredit },
    auditTrail: [
      createAuditStep(
        'medical_credit',
        'main_member + first_dependant + (additional × (dependants - 1))',
        {
          taxYear: ctx.ruleSet.taxYearLabel,
          ruleVersion: ctx.ruleSet.ruleVersion,
          dependants,
          mainMember: ctx.ruleSet.medicalCredits.mainMember,
        },
        monthlyCredit,
        { annualCredit }
      ),
    ],
  };
}
