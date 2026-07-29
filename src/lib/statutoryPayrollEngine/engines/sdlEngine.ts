/**
 * SDL Engine — Skills Development Levy (Skills Development Levies Act 9 of 1999).
 * Employer levy: 1% of total remuneration. Exempt if annual remuneration ≤ R500,000.
 */

import type { StatutoryCalculationContext, StatutoryEngineResult } from '../types';
import {
  ENGINE_VERSION,
  createAuditStep,
  isEngineEnabled,
  roundCurrency,
  skippedEngineResult,
} from '../utils';

export function runSdlEngine(ctx: StatutoryCalculationContext): StatutoryEngineResult {
  const engineId = 'sdl' as const;
  if (!isEngineEnabled(ctx.enabledEngines, engineId)) {
    return skippedEngineResult(engineId, 'SDL engine disabled');
  }

  const config = ctx.engineConfig.sdl ?? {};
  const rate = Number(config.rate ?? ctx.ruleSet.sdlRate);
  const exemptionThreshold = ctx.ruleSet.sdlExemptionAnnualRemuneration;
  const companyAnnual = ctx.companyAnnualRemuneration;

  if (companyAnnual != null && companyAnnual <= exemptionThreshold) {
    return {
      engineId,
      engineVersion: ENGINE_VERSION,
      enabled: true,
      skipped: true,
      skipReason: `Company annual remuneration (R${companyAnnual}) below SDL exemption threshold (R${exemptionThreshold})`,
      employeeAmount: 0,
      employerAmount: 0,
      taxableAdjustment: 0,
      breakdown: { companyAnnual, exemptionThreshold },
      auditTrail: [
        createAuditStep(
          'sdl_exemption',
          'company_annual_remuneration ≤ exemption_threshold',
          { companyAnnual, exemptionThreshold },
          0
        ),
      ],
    };
  }

  const remuneration = ctx.grossEarnings;
  const amount = roundCurrency(remuneration * rate);

  return {
    engineId,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    skipped: false,
    employeeAmount: 0,
    employerAmount: amount,
    taxableAdjustment: 0,
    breakdown: { remuneration, rate, sdlAmount: amount },
    auditTrail: [
      createAuditStep(
        'sdl_levy',
        'gross_remuneration × sdl_rate',
        {
          taxYear: ctx.ruleSet.taxYearLabel,
          ruleVersion: ctx.ruleSet.ruleVersion,
          remuneration,
          rate,
        },
        amount
      ),
    ],
  };
}
