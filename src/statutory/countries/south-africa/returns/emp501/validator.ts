/**
 * EMP501 validator — isolated reconciliation checks (V3.6.1).
 */

import { buildValidationResult, mergeIssues } from '../../../../returns/snapshot';
import type { GenerateReturnInput, StatutoryReturn, StatutoryValidationResult } from '../../../../../lib/statutoryReturns/types';

export function validateEmp501(
  ret: StatutoryReturn,
  _input?: GenerateReturnInput
): StatutoryValidationResult {
  const issues = mergeIssues(ret.validationResult?.issues ?? []);

  if (ret.returnType !== 'EMP501') {
    issues.push({
      code: 'EMP501_TYPE_MISMATCH',
      severity: 'error',
      message: `Expected EMP501, received ${ret.returnType}.`,
    });
  }

  const reconciliation = ret.declarationData.reconciliation as
    | { payeDeclared?: number; employeeCount?: number }
    | undefined;
  const monthlyBreakdown = ret.declarationData.monthlyBreakdown as
    | Array<{ paye: number }>
    | undefined;

  if (!reconciliation) {
    issues.push({
      code: 'EMP501_MISSING_RECONCILIATION',
      severity: 'error',
      message: 'EMP501 declaration missing reconciliation block.',
    });
  } else {
    if ((reconciliation.employeeCount ?? 0) === 0) {
      issues.push({
        code: 'EMP501_NO_EMPLOYEES',
        severity: 'error',
        message: 'EMP501 requires at least one employee on finalized payslips.',
      });
    }
    if (monthlyBreakdown) {
      const sumMonthlyPaye = monthlyBreakdown.reduce((s, m) => s + m.paye, 0);
      const paye = reconciliation.payeDeclared ?? 0;
      if (Math.abs(sumMonthlyPaye - paye) > 0.02) {
        issues.push({
          code: 'EMP501_PAYE_RECON_MISMATCH',
          severity: 'error',
          message: `Annual PAYE (${paye}) does not equal sum of monthly breakdown (${sumMonthlyPaye}).`,
          field: 'reconciliation.payeDeclared',
        });
      }
    }
  }

  return buildValidationResult(issues);
}
