/**
 * VIP Working Paper validation — audit integrity checks (V3.6.6)
 */

import { listVipComponentCodes } from './sections';
import type { VipWorkingPaperReport } from './types';

export type VipValidationIssue = {
  code: string;
  message: string;
  employeeNumber?: string;
};

export type VipValidationResult = {
  ok: boolean;
  issues: VipValidationIssue[];
};

export function validateVipWorkingPaper(report: VipWorkingPaperReport): VipValidationResult {
  const issues: VipValidationIssue[] = [];
  const expectedCodes = listVipComponentCodes();
  const seenEmployees = new Set<string>();

  for (const emp of report.employees) {
    const key = emp.identity.employeeNumber;
    if (seenEmployees.has(key)) {
      issues.push({
        code: 'DUPLICATE_EMPLOYEE',
        message: `Employee ${key} appears more than once`,
        employeeNumber: key,
      });
    }
    seenEmployees.add(key);

    const lineCodes: string[] = [];
    for (const block of emp.blocks) {
      for (const line of block.lines) {
        lineCodes.push(line.code);
        const monthSum = round2(
          report.monthColumns.reduce((s, c) => s + (line.months[c] ?? 0), 0)
        );
        if (monthSum !== line.annualTotal) {
          issues.push({
            code: 'ANNUAL_TOTAL_MISMATCH',
            message: `${line.label}: month sum ${monthSum} ≠ annual ${line.annualTotal}`,
            employeeNumber: key,
          });
        }
        for (const c of report.monthColumns) {
          if (!(c in line.months)) {
            issues.push({
              code: 'MISSING_MONTH',
              message: `${line.label} missing month column ${c}`,
              employeeNumber: key,
            });
          }
        }
      }
    }

    const unique = new Set(lineCodes);
    if (unique.size !== lineCodes.length) {
      issues.push({
        code: 'DUPLICATE_COMPONENT',
        message: `Duplicate payroll components for employee ${key}`,
        employeeNumber: key,
      });
    }
    for (const code of expectedCodes) {
      if (!unique.has(code)) {
        issues.push({
          code: 'MISSING_COMPONENT',
          message: `Missing payroll component ${code} for employee ${key}`,
          employeeNumber: key,
        });
      }
    }
  }

  if (report.employeeCount !== report.employees.length) {
    issues.push({
      code: 'EMPLOYEE_COUNT_MISMATCH',
      message: `employeeCount ${report.employeeCount} ≠ sections ${report.employees.length}`,
    });
  }

  return { ok: issues.length === 0, issues };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
