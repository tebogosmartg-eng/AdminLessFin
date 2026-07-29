/**
 * Leave Encashment Engine — Taxed as normal remuneration (gross income).
 */

import type { StatutoryCalculationContext, StatutoryEngineResult } from '../types';
import {
  ENGINE_VERSION,
  createAuditStep,
  isEngineEnabled,
  roundCurrency,
  skippedEngineResult,
} from '../utils';

export function runLeaveEncashmentEngine(
  ctx: StatutoryCalculationContext
): StatutoryEngineResult {
  const engineId = 'leave_encashment' as const;
  if (!isEngineEnabled(ctx.enabledEngines, engineId, false)) {
    return skippedEngineResult(engineId, 'Leave encashment engine disabled');
  }

  const encashment = ctx.components?.leaveEncashment;
  if (!encashment) {
    return skippedEngineResult(engineId, 'No leave encashment configured');
  }

  const amount = roundCurrency(encashment.days * encashment.dailyRate);
  if (amount <= 0) {
    return skippedEngineResult(engineId, 'Leave encashment amount is zero');
  }

  return {
    engineId,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    skipped: false,
    employeeAmount: 0,
    employerAmount: 0,
    taxableAdjustment: amount,
    breakdown: { days: encashment.days, dailyRate: encashment.dailyRate, encashmentAmount: amount },
    auditTrail: [
      createAuditStep(
        'leave_encashment',
        'leave_days × daily_rate',
        {
          taxYear: ctx.ruleSet.taxYearLabel,
          days: encashment.days,
          dailyRate: encashment.dailyRate,
        },
        amount
      ),
    ],
  };
}
