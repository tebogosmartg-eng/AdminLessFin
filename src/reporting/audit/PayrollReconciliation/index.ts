/**
 * Payroll Reconciliation — fact totals vs checksum presence (audit helper)
 */

import type { PayrollFact } from '../../facts/PayrollFact';

export type ReconciliationRow = {
  employeeNumber: string;
  employee: string;
  payDate: string;
  grossPay: number;
  netPay: number;
  costToCompany: number;
  snapshotChecksum: string;
};

export function buildPayrollReconciliationFromFacts(facts: PayrollFact[]): ReconciliationRow[] {
  return facts.map((f) => ({
    employeeNumber: f.employeeNumber,
    employee: `${f.employeeName} ${f.surname}`.trim(),
    payDate: f.payDate,
    grossPay: f.totals.grossPay,
    netPay: f.totals.netPay,
    costToCompany: f.totals.costToCompany,
    snapshotChecksum: f.snapshotChecksum,
  }));
}
