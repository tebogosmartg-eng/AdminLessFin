/**
 * Bonus Tax Engine — adds bonus to taxable earnings for PAYE calculation.
 * PAYE engine applies marginal rate on combined income (aggregate method).
 */

import type { StatutoryCalculationContext, StatutoryEngineResult } from '../types';
import {
  ENGINE_VERSION,
  createAuditStep,
  isEngineEnabled,
  skippedEngineResult,
} from '../utils';

export function runBonusTaxEngine(ctx: StatutoryCalculationContext): StatutoryEngineResult {
  const engineId = 'bonus_tax' as const;
  if (!isEngineEnabled(ctx.enabledEngines, engineId, false)) {
    return skippedEngineResult(engineId, 'Bonus tax engine disabled');
  }

  const bonus = ctx.components?.bonus;
  if (!bonus?.amount || bonus.amount <= 0) {
    return skippedEngineResult(engineId, 'No bonus amount configured');
  }

  const method = bonus.method ?? 'aggregate';

  return {
    engineId,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    skipped: false,
    employeeAmount: 0,
    employerAmount: 0,
    taxableAdjustment: bonus.amount,
    breakdown: { bonusAmount: bonus.amount },
    auditTrail: [
      createAuditStep(
        'bonus_taxable',
        'bonus_amount added to taxable earnings for PAYE',
        {
          taxYear: ctx.ruleSet.taxYearLabel,
          ruleVersion: ctx.ruleSet.ruleVersion,
          bonusAmount: bonus.amount,
          method,
        },
        bonus.amount
      ),
    ],
  };
}
