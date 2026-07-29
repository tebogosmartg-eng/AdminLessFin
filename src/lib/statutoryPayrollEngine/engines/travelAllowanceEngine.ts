/**
 * Travel Allowance Engine — §8(1)(b) Income Tax Act.
 */

import { calculateTravelAllowance } from '../registry/travelAllowance';
import type { StatutoryCalculationContext, StatutoryEngineResult } from '../types';
import {
  ENGINE_VERSION,
  isEngineEnabled,
  skippedEngineResult,
} from '../utils';

export function runTravelAllowanceEngine(
  ctx: StatutoryCalculationContext
): StatutoryEngineResult {
  const engineId = 'travel_allowance' as const;
  if (!isEngineEnabled(ctx.enabledEngines, engineId, false)) {
    return skippedEngineResult(engineId, 'Travel allowance engine disabled');
  }

  const travel = ctx.components?.travelAllowance;
  if (!travel?.monthlyAllowance) {
    return skippedEngineResult(engineId, 'No travel allowance configured');
  }

  const result = calculateTravelAllowance(travel, ctx.ruleSet);

  return {
    engineId,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    skipped: false,
    employeeAmount: 0,
    employerAmount: 0,
    taxableAdjustment: result.taxablePortion,
    breakdown: {
      monthlyAllowance: travel.monthlyAllowance,
      taxablePortion: result.taxablePortion,
      nonTaxablePortion: result.nonTaxablePortion,
    },
    auditTrail: result.auditTrail.map((step) => ({
      ...step,
      legislativeReference: result.legislativeReference,
      inputs: { ...step.inputs, method: result.method },
    })),
  };
}
