/**
 * Extract statutory amounts from finalized payroll snapshots only.
 * Never recalculates PAYE / UIF / SDL — reads engine_results from calculation_snapshot.
 */

import { isRunFinalized } from '../payrollWorkflow';
import type { FinalizedPayrollRunSource, FinalizedPayslipSource } from './types';
import type { StatutoryValidationIssue } from './types';

export type EngineResultSlice = {
  engine_id: string;
  employee_amount?: number;
  employer_amount?: number;
  skipped?: boolean;
};

export function assertFinalizedRuns(runs: FinalizedPayrollRunSource[]): StatutoryValidationIssue[] {
  const issues: StatutoryValidationIssue[] = [];
  if (!runs.length) {
    issues.push({
      code: 'NO_SOURCE_RUNS',
      severity: 'error',
      message: 'Statutory returns require at least one finalized payroll run.',
    });
    return issues;
  }
  for (const run of runs) {
    if (!isRunFinalized(run.status)) {
      issues.push({
        code: 'RUN_NOT_FINALIZED',
        severity: 'error',
        message: `Payroll run ${run.id} has status "${run.status}". Only finalized/paid runs may feed statutory returns.`,
        field: 'sourcePayrollRuns',
      });
    }
    if (!run.payslips.length) {
      issues.push({
        code: 'RUN_HAS_NO_PAYSLIPS',
        severity: 'error',
        message: `Finalized payroll run ${run.id} has no payslips.`,
        field: 'sourcePayrollRuns',
      });
    }
  }
  return issues;
}

export function engineResultsFromSnapshot(
  snapshot: Record<string, unknown> | null | undefined
): EngineResultSlice[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const raw = snapshot.engine_results;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      engine_id: String(r.engine_id ?? ''),
      employee_amount: Number(r.employee_amount ?? 0) || 0,
      employer_amount: Number(r.employer_amount ?? 0) || 0,
      skipped: Boolean(r.skipped),
    }));
}

export function sumEngineAmount(
  payslips: FinalizedPayslipSource[],
  engineIds: string[],
  side: 'employee' | 'employer'
): number {
  const idSet = new Set(engineIds);
  let total = 0;
  for (const p of payslips) {
    for (const er of engineResultsFromSnapshot(p.calculationSnapshot)) {
      if (!idSet.has(er.engine_id) || er.skipped) continue;
      total += side === 'employee' ? (er.employee_amount ?? 0) : (er.employer_amount ?? 0);
    }
  }
  return roundMoney(total);
}

/** Fallback when snapshot engines are missing — keyword match on persisted payslip_items only. */
export function sumItemKeywords(
  payslips: FinalizedPayslipSource[],
  keywords: string[],
  itemType?: string
): number {
  const lower = keywords.map((k) => k.toLowerCase());
  let total = 0;
  for (const p of payslips) {
    for (const item of p.payslipItems) {
      if (itemType && item.type !== itemType) continue;
      const desc = item.description.toLowerCase();
      if (lower.some((k) => desc.includes(k))) total += item.amount;
    }
  }
  return roundMoney(total);
}

export function resolvePaye(payslips: FinalizedPayslipSource[]): number {
  const fromEngine = sumEngineAmount(payslips, ['paye', 'directors_paye', 'bonus_tax', 'termination_tax'], 'employee');
  if (fromEngine > 0) return fromEngine;
  return sumItemKeywords(payslips, ['paye', 'tax'], 'deduction');
}

export function resolveUifEmployee(payslips: FinalizedPayslipSource[]): number {
  const fromEngine = sumEngineAmount(payslips, ['uif'], 'employee');
  if (fromEngine > 0) return fromEngine;
  return sumItemKeywords(payslips, ['uif'], 'deduction');
}

export function resolveUifEmployer(payslips: FinalizedPayslipSource[]): number {
  const fromEngine = sumEngineAmount(payslips, ['uif_employer'], 'employer');
  if (fromEngine > 0) return fromEngine;
  return sumItemKeywords(payslips, ['uif employer'], 'employer_contribution');
}

export function resolveSdl(payslips: FinalizedPayslipSource[]): number {
  const fromEngine = sumEngineAmount(payslips, ['sdl'], 'employer');
  if (fromEngine > 0) return fromEngine;
  return sumItemKeywords(payslips, ['sdl', 'skills development'], 'employer_contribution');
}

export function resolveGross(payslips: FinalizedPayslipSource[]): number {
  let fromSnapshot = 0;
  let hasSnapshot = false;
  for (const p of payslips) {
    const g = p.calculationSnapshot?.gross_earnings;
    if (typeof g === 'number') {
      fromSnapshot += g;
      hasSnapshot = true;
    }
  }
  if (hasSnapshot) return roundMoney(fromSnapshot);
  return roundMoney(payslips.reduce((s, p) => s + p.grossPay, 0));
}

export function taxYearFromRuns(runs: FinalizedPayrollRunSource[], fallback: string): string {
  for (const run of runs) {
    if (run.taxYear) return run.taxYear;
    for (const p of run.payslips) {
      const ty = p.calculationSnapshot?.tax_year;
      if (typeof ty === 'string' && ty) return ty;
    }
  }
  return fallback;
}

export function allPayslips(runs: FinalizedPayrollRunSource[]): FinalizedPayslipSource[] {
  return runs.flatMap((r) => r.payslips);
}

export function filterRunsByPeriod(
  runs: FinalizedPayrollRunSource[],
  periodStart?: string,
  periodEnd?: string
): FinalizedPayrollRunSource[] {
  if (!periodStart && !periodEnd) return runs;
  return runs.filter((r) => {
    if (periodStart && r.payDate < periodStart) return false;
    if (periodEnd && r.payDate > periodEnd) return false;
    return true;
  });
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function newReturnId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}
