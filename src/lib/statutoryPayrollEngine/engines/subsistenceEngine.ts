/**
 * Subsistence engine — adds only the excess over the domestic deemed rate
 * to taxable earnings. The cash payment itself is an earning line from the
 * pay-component assembler, not from this engine.
 */

import { calculateSubsistence } from '../registry/subsistence';
import type { StatutoryCalculationContext, StatutoryEngineResult } from '../types';
import { ENGINE_VERSION, isEngineEnabled, skippedEngineResult } from '../utils';

export function runSubsistenceEngine(ctx: StatutoryCalculationContext): StatutoryEngineResult {
  const engineId = 'subsistence' as const;
  if (!isEngineEnabled(ctx.enabledEngines, engineId, false)) {
    return skippedEngineResult(engineId, 'Subsistence engine disabled');
  }

  const subsistence = ctx.components?.subsistence;
  if (!subsistence || subsistence.amountPaid <= 0 || subsistence.days <= 0) {
    return skippedEngineResult(engineId, 'No subsistence configured');
  }

  if (subsistence.domestic === false) {
    return skippedEngineResult(
      engineId,
      'Foreign subsistence rates are not loaded'
    );
  }

  const rate = subsistence.incidentalOnly
    ? ctx.ruleSet.subsistenceIncidentalDaily
    : ctx.ruleSet.subsistenceDomesticDaily;
  if (!rate || rate <= 0) {
    return skippedEngineResult(engineId, 'Domestic subsistence rate is not configured');
  }

  const result = calculateSubsistence(subsistence, ctx.ruleSet);

  return {
    engineId,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    skipped: false,
    employeeAmount: 0,
    employerAmount: 0,
    taxableAdjustment: result.excess,
    breakdown: {
      amountPaid: result.amountPaid,
      days: result.days,
      deemed: result.deemed,
      exempt: result.exempt,
      excess: result.excess,
    },
    auditTrail: result.auditTrail.map((step) => ({
      ...step,
      legislativeReference: result.legislativeReference,
    })),
  };
}
