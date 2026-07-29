/**
 * Payroll Fact Validator — immutability + finalized-only gates
 */

import type { PayrollFact } from './PayrollFact';
import { isRunFinalized } from '../../lib/payrollWorkflow';

export type PayrollFactValidationIssue = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  factKey?: string;
};

export type PayrollFactValidationResult = {
  ok: boolean;
  issues: PayrollFactValidationIssue[];
};

export function assertFactImmutable(fact: PayrollFact): boolean {
  return Object.isFrozen(fact) && Object.isFrozen(fact.totals) && Object.isFrozen(fact.payrollItems);
}

export function validatePayrollFact(fact: PayrollFact): PayrollFactValidationResult {
  const issues: PayrollFactValidationIssue[] = [];
  const key = `${fact.payrollRunId}:${fact.employeeId}`;

  if (!assertFactImmutable(fact)) {
    issues.push({
      code: 'FACT_NOT_IMMUTABLE',
      severity: 'error',
      message: 'PayrollFact must be frozen/immutable after mapping.',
      factKey: key,
    });
  }

  if (!isRunFinalized(fact.metadata.runStatus)) {
    issues.push({
      code: 'FACT_NOT_FINALIZED',
      severity: 'error',
      message: `Run status "${fact.metadata.runStatus}" is not finalized/paid.`,
      factKey: key,
    });
  }

  if (!fact.payDate) {
    issues.push({
      code: 'FACT_MISSING_PAY_DATE',
      severity: 'error',
      message: 'PayrollFact requires payDate.',
      factKey: key,
    });
  }

  if (!fact.snapshotChecksum) {
    issues.push({
      code: 'FACT_MISSING_CHECKSUM',
      severity: 'warning',
      message: 'PayrollFact missing snapshotChecksum.',
      factKey: key,
    });
  }

  return { ok: issues.every((i) => i.severity !== 'error'), issues };
}

export function validatePayrollFacts(facts: PayrollFact[]): PayrollFactValidationResult {
  const issues: PayrollFactValidationIssue[] = [];
  for (const fact of facts) {
    issues.push(...validatePayrollFact(fact).issues);
  }
  return { ok: issues.every((i) => i.severity !== 'error'), issues };
}
