/**
 * UIF Engine — Unemployment Insurance Fund (UI Act 4 of 2001).
 * Employee contribution: 1% of remuneration, capped at monthly ceiling.
 */

import type { StatutoryCalculationContext, StatutoryEngineResult } from '../types';
import {
  ENGINE_VERSION,
  createAuditStep,
  isEngineEnabled,
  roundCurrency,
  skippedEngineResult,
} from '../utils';

function runUifContribution(
  ctx: StatutoryCalculationContext,
  engineId: 'uif' | 'uif_employer',
  isEmployee: boolean
): StatutoryEngineResult {
  if (!isEngineEnabled(ctx.enabledEngines, engineId)) {
    return skippedEngineResult(engineId, `UIF ${isEmployee ? 'employee' : 'employer'} engine disabled`);
  }

  const config = ctx.engineConfig[engineId] ?? ctx.engineConfig.uif ?? {};
  const rate = Number(config.rate ?? ctx.ruleSet.uifRate);
  const ceiling = Number(config.ceiling ?? ctx.ruleSet.uifCeilingMonthly);
  const remuneration = ctx.grossEarnings;
  const cappedRemuneration = Math.min(remuneration, ceiling);
  const amount = roundCurrency(cappedRemuneration * rate);

  const auditTrail = [
    createAuditStep(
      'uif_base',
      'min(gross_remuneration, monthly_ceiling)',
      { grossEarnings: remuneration, ceiling },
      cappedRemuneration
    ),
    createAuditStep(
      'uif_contribution',
      'capped_remuneration × uif_rate',
      {
        taxYear: ctx.ruleSet.taxYearLabel,
        ruleVersion: ctx.ruleSet.ruleVersion,
        rate,
        cappedRemuneration,
      },
      amount
    ),
  ];

  return {
    engineId,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    skipped: false,
    employeeAmount: isEmployee ? amount : 0,
    employerAmount: isEmployee ? 0 : amount,
    taxableAdjustment: 0,
    breakdown: { cappedRemuneration, rate, contribution: amount },
    auditTrail,
  };
}

export function runUifEmployeeEngine(ctx: StatutoryCalculationContext): StatutoryEngineResult {
  return runUifContribution(ctx, 'uif', true);
}

export function runUifEmployerEngine(ctx: StatutoryCalculationContext): StatutoryEngineResult {
  return runUifContribution(ctx, 'uif_employer', false);
}
