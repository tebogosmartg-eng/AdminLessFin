/**
 * Fringe Benefit Engine — Seventh Schedule, Income Tax Act.
 */

import { calculateFringeBenefitLine } from '../registry/seventhSchedule';
import type { StatutoryCalculationContext, StatutoryEngineResult } from '../types';
import {
  ENGINE_VERSION,
  isEngineEnabled,
  roundCurrency,
  skippedEngineResult,
} from '../utils';

export function runFringeBenefitEngine(ctx: StatutoryCalculationContext): StatutoryEngineResult {
  const engineId = 'fringe_benefit' as const;
  if (!isEngineEnabled(ctx.enabledEngines, engineId, false)) {
    return skippedEngineResult(engineId, 'Fringe benefit engine disabled');
  }

  const benefits = ctx.components?.fringeBenefits ?? [];
  if (!benefits.length) {
    return skippedEngineResult(engineId, 'No fringe benefits configured');
  }

  const auditTrail = [];
  let totalTaxable = 0;

  for (const benefit of benefits) {
    const line = calculateFringeBenefitLine(benefit, ctx.ruleSet);
    totalTaxable += line.taxableValue;
    auditTrail.push(
      ...line.auditTrail.map((step) => ({
        ...step,
        legislativeReference: line.legislativeReference,
        inputs: { ...step.inputs, benefitType: line.benefitType },
      }))
    );
  }

  totalTaxable = roundCurrency(totalTaxable);

  return {
    engineId,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    skipped: false,
    employeeAmount: 0,
    employerAmount: 0,
    taxableAdjustment: totalTaxable,
    breakdown: { totalTaxableBenefits: totalTaxable, benefitCount: benefits.length },
    auditTrail,
  };
}
