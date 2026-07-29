/**
 * Shared statutory return validation framework (V3.6).
 * Generators compose these checks; they never recalculate payroll.
 */

import { assertFinalizedRuns } from './source';
import type {
  FinalizedPayrollRunSource,
  GenerateReturnInput,
  StatutoryValidationIssue,
  StatutoryValidationResult,
} from './types';

export function buildValidationResult(issues: StatutoryValidationIssue[]): StatutoryValidationResult {
  return {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
    validatedAt: new Date().toISOString(),
  };
}

export function validateGenerateInput(
  input: GenerateReturnInput,
  options?: {
    requirePeriod?: boolean;
    requireEmployee?: boolean;
    expectedTaxYear?: string;
  }
): StatutoryValidationIssue[] {
  const issues: StatutoryValidationIssue[] = [];

  if (!input.country?.trim()) {
    issues.push({
      code: 'COUNTRY_REQUIRED',
      severity: 'error',
      message: 'Country code is required for statutory returns.',
      field: 'country',
    });
  }

  if (!input.taxYear?.trim()) {
    issues.push({
      code: 'TAX_YEAR_REQUIRED',
      severity: 'error',
      message: 'Tax year is required for statutory returns.',
      field: 'taxYear',
    });
  }

  if (options?.requirePeriod && (!input.periodStart || !input.periodEnd)) {
    issues.push({
      code: 'PERIOD_REQUIRED',
      severity: 'error',
      message: 'This return requires periodStart and periodEnd (monthly declaration).',
      field: 'periodStart',
    });
  }

  if (options?.requireEmployee && !input.employeeId) {
    issues.push({
      code: 'EMPLOYEE_REQUIRED',
      severity: 'error',
      message: 'This return requires an employeeId (per-employee certificate).',
      field: 'employeeId',
    });
  }

  issues.push(...assertFinalizedRuns(input.runs));

  if (options?.expectedTaxYear && input.taxYear && input.taxYear !== options.expectedTaxYear) {
    issues.push({
      code: 'TAX_YEAR_MISMATCH',
      severity: 'warning',
      message: `Requested tax year ${input.taxYear} differs from source snapshot tax year ${options.expectedTaxYear}.`,
      field: 'taxYear',
    });
  }

  return issues;
}

export function validateSourcePayrollIntegrity(runs: FinalizedPayrollRunSource[]): StatutoryValidationIssue[] {
  const issues: StatutoryValidationIssue[] = [];
  for (const run of runs) {
    for (const p of run.payslips) {
      if (!p.calculationSnapshot) {
        issues.push({
          code: 'MISSING_CALCULATION_SNAPSHOT',
          severity: 'warning',
          message: `Payslip ${p.payslipId} has no calculation_snapshot; amounts may fall back to payslip line items.`,
          field: 'calculationSnapshot',
        });
      }
    }
  }
  return issues;
}

export function mergeIssues(...groups: StatutoryValidationIssue[][]): StatutoryValidationIssue[] {
  return groups.flat();
}
