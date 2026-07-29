/**
 * Directors PAYE Engine — SARS annual equivalent / deemed remuneration method.
 * Income Tax Act §83; PAYE-GEN-01-G01 Directors section.
 */

import type { PayeCalculationMode, StatutoryCalculationContext, StatutoryEngineResult } from '../types.ts';
import {
  ENGINE_VERSION,
  createAuditStep,
  isEngineEnabled,
  roundCurrency,
  skippedEngineResult,
} from '../utils.ts';

export function runDirectorsPayeEngine(ctx: StatutoryCalculationContext): StatutoryEngineResult {
  const engineId = 'directors_paye' as const;
  const isDirector =
    ctx.employee.isDirector ||
    ctx.employee.employmentType === 'director' ||
    !!ctx.components?.directors;

  if (!isDirector) {
    return skippedEngineResult(engineId, 'Employee is not a director');
  }
  if (!isEngineEnabled(ctx.enabledEngines, engineId, true)) {
    return skippedEngineResult(engineId, 'Directors PAYE engine disabled');
  }

  const directors = ctx.components?.directors;
  const remunerationType = directors?.remunerationType ?? 'monthly_fixed';
  const auditTrail = [];
  let deemedTaxable = ctx.taxableEarnings;
  let payeMode: PayeCalculationMode = 'standard';

  switch (remunerationType) {
    case 'annual_fee': {
      const fee = directors?.annualFeeAmount ?? ctx.grossEarnings;
      deemedTaxable = fee;
      payeMode = 'director_annual_fee';
      auditTrail.push(
        createAuditStep(
          'director_annual_fee',
          'annual_fee_amount as deemed taxable remuneration (annual equivalent)',
          { annualFeeAmount: fee, remunerationType },
          fee
        )
      );
      break;
    }
    case 'monthly_variable': {
      const payment = directors?.variablePaymentThisPeriod ?? ctx.grossEarnings;
      const months = Math.max(1, directors?.monthsSinceLastPayment ?? 1);
      const annualEquivalent = roundCurrency((payment / months) * 12);
      deemedTaxable = roundCurrency(annualEquivalent / 12);
      payeMode = 'director_variable';
      auditTrail.push(
        createAuditStep(
          'director_variable',
          '(payment / months_since_last) × 12 / 12 = deemed monthly taxable',
          { payment, months, annualEquivalent },
          deemedTaxable
        )
      );
      break;
    }
    case 'connected_person': {
      deemedTaxable = directors?.fixedMonthlyAmount ?? ctx.taxableEarnings;
      auditTrail.push(
        createAuditStep(
          'director_connected_person',
          'connected_person — standard monthly remuneration',
          { isConnectedPerson: directors?.isConnectedPerson ?? true, deemedTaxable },
          deemedTaxable
        )
      );
      break;
    }
    case 'monthly_fixed':
    default: {
      deemedTaxable = directors?.fixedMonthlyAmount ?? ctx.taxableEarnings;
      auditTrail.push(
        createAuditStep(
          'director_monthly_fixed',
          'fixed monthly director remuneration',
          { fixedMonthlyAmount: deemedTaxable },
          deemedTaxable
        )
      );
    }
  }

  const taxableAdjustment = roundCurrency(deemedTaxable - ctx.taxableEarnings);

  return {
    engineId,
    engineVersion: ENGINE_VERSION,
    enabled: true,
    skipped: false,
    employeeAmount: 0,
    employerAmount: 0,
    taxableAdjustment,
    breakdown: {
      deemedTaxable,
      payeModeFlag: payeMode === 'director_annual_fee' ? 1 : payeMode === 'director_variable' ? 2 : 0,
    },
    auditTrail,
  };
}

export function resolvePayeModeFromDirectorResult(
  result: StatutoryEngineResult
): PayeCalculationMode {
  if (result.skipped) return 'standard';
  const flag = result.breakdown.payeModeFlag ?? 0;
  if (flag === 1) return 'director_annual_fee';
  if (flag === 2) return 'director_variable';
  return 'standard';
}

export function resolveDeemedTaxableFromDirectorResult(
  result: StatutoryEngineResult,
  fallback: number
): number {
  if (result.skipped) return fallback;
  return result.breakdown.deemedTaxable ?? fallback;
}
