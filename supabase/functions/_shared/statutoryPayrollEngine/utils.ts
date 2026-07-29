/**
 * Shared statutory calculation utilities — no hardcoded tax values.
 */

import type { AuditStep, StatutoryEngineId, StatutoryEngineResult } from './types.ts';

export const ENGINE_VERSION = '3.0.2';

export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function findBracket(annualIncome: number, brackets: import('./types').TaxBracket[]): import('./types').TaxBracket {
  const sorted = [...brackets].sort((a, b) => a.from - b.from);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (annualIncome >= sorted[i].from) return sorted[i];
  }
  return sorted[0];
}

export function calculateAnnualTax(
  annualIncome: number,
  brackets: import('./types').TaxBracket[]
): number {
  if (annualIncome <= 0) return 0;
  const bracket = findBracket(annualIncome, brackets);
  const excess = annualIncome - bracket.from;
  return roundCurrency(bracket.base + excess * bracket.rate);
}

export function resolveRebate(
  rebates: { primary: number; secondary: number; tertiary: number },
  age?: number
): number {
  let rebate = rebates.primary;
  if (age != null && age >= 65) {
    rebate += rebates.secondary;
  }
  if (age != null && age >= 75) {
    rebate += rebates.tertiary;
  }
  return rebate;
}

export function createAuditStep(
  step: string,
  formula: string,
  inputs: Record<string, number | string | boolean | null>,
  result: number | string,
  intermediate?: Record<string, number>
): AuditStep {
  return { step, formula, inputs, intermediate, result };
}

export function isEngineEnabled(
  enabledEngines: Record<string, boolean | undefined>,
  engineId: string,
  defaultEnabled = true
): boolean {
  if (enabledEngines[engineId] === false) return false;
  if (enabledEngines[engineId] === true) return true;
  return defaultEnabled;
}

export function skippedEngineResult(
  engineId: StatutoryEngineId,
  reason: string
): StatutoryEngineResult {
  return {
    engineId,
    engineVersion: ENGINE_VERSION,
    enabled: false,
    skipped: true,
    skipReason: reason,
    employeeAmount: 0,
    employerAmount: 0,
    taxableAdjustment: 0,
    breakdown: {},
    auditTrail: [
      createAuditStep('skip', 'engine disabled or not applicable', { reason }, 0),
    ],
  };
}
