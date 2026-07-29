/**
 * Termination Tax Engine — §10(1)(x), Second Schedule lump sums.
 */

import { calculateTerminationBenefit } from '../registry/terminationBenefits';
import type { StatutoryCalculationContext, StatutoryEngineResult } from '../types';
import {
  ENGINE_VERSION,
  isEngineEnabled,
  skippedEngineResult,
} from '../utils';

export function runTerminationTaxEngine(
  ctx: StatutoryCalculationContext
): StatutoryEngineResult {
  const engineId = 'termination_tax' as const;
  if (!isEngineEnabled(ctx.enabledEngines, engineId, false)) {
    return skippedEngineResult(engineId, 'Termination tax engine disabled');
  }

  const termination = ctx.components?.termination;
  if (!termination) {
    return skippedEngineResult(engineId, 'No termination payment configured');
  }

  const result = calculateTerminationBenefit(termination, ctx.ruleSet, ctx.employee.age);

  return {
    engineId,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    skipped: false,
    employeeAmount: result.withholdingAmount,
    employerAmount: 0,
    taxableAdjustment: result.taxableAdjustment,
    breakdown: {
      exemptPortion: result.exemptPortion,
      taxablePortion: result.taxableAdjustment,
      withholdingAmount: result.withholdingAmount,
    },
    auditTrail: result.auditTrail.map((step) => ({
      ...step,
      legislativeReference: result.legislativeReference,
      inputs: { ...step.inputs, benefitType: termination.benefitType },
    })),
  };
}
