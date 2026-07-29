/**
 * Retirement Deduction Engine — Section 11F, Income Tax Act.
 * Deductible retirement contributions: min(27.5% of remuneration, R350,000 p.a.).
 */

import type { StatutoryCalculationContext, StatutoryEngineResult } from '../types.ts';
import {
  ENGINE_VERSION,
  createAuditStep,
  isEngineEnabled,
  roundCurrency,
  skippedEngineResult,
} from '../utils.ts';

export function runRetirementDeductionEngine(
  ctx: StatutoryCalculationContext
): StatutoryEngineResult {
  const engineId = 'retirement_deduction' as const;
  if (!isEngineEnabled(ctx.enabledEngines, engineId, false)) {
    return skippedEngineResult(engineId, 'Retirement deduction engine disabled');
  }

  const config = ctx.engineConfig.retirement_deduction ?? ctx.engineConfig.pension ?? {};
  const contribution = Number(
    ctx.components?.retirementContributions ??
      config.amount ??
      config.monthly_amount ??
      0
  );

  if (contribution <= 0) {
    return skippedEngineResult(engineId, 'No retirement contribution configured');
  }

  const annualRemuneration = ctx.grossEarnings * 12;
  const maxByRate = roundCurrency(annualRemuneration * ctx.ruleSet.retirementDeductionMaxRate);
  const maxAnnual = Math.min(maxByRate, ctx.ruleSet.retirementDeductionCapAnnual);
  const ytdContributions = ctx.ytd?.retirementContributions ?? 0;
  const remainingAnnualCap = Math.max(0, maxAnnual - ytdContributions);
  const maxMonthly = roundCurrency(remainingAnnualCap / 12);
  const deductible = Math.min(contribution, maxMonthly);
  const nonDeductible = roundCurrency(contribution - deductible);

  return {
    engineId,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    skipped: false,
    employeeAmount: contribution,
    employerAmount: 0,
    taxableAdjustment: -deductible,
    breakdown: {
      contribution,
      deductible,
      nonDeductible,
      maxMonthly,
      maxAnnual,
    },
    auditTrail: [
      createAuditStep(
        'retirement_limit',
        'min(contribution, min(27.5% × annual_remuneration, R350000) / 12)',
        {
          taxYear: ctx.ruleSet.taxYearLabel,
          ruleVersion: ctx.ruleSet.ruleVersion,
          contribution,
          annualRemuneration,
          maxRate: ctx.ruleSet.retirementDeductionMaxRate,
          capAnnual: ctx.ruleSet.retirementDeductionCapAnnual,
        },
        deductible,
        { maxMonthly, nonDeductible }
      ),
    ],
  };
}
