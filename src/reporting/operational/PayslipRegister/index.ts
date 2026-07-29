/**
 * Payslip Register operational view — facts only (presentation listing)
 */

import type { PayrollFact } from '../../facts/PayrollFact';

export type PayslipRegisterRow = {
  payslipId: string;
  employeeNumber: string;
  employee: string;
  department: string;
  payDate: string;
  netPay: number;
  status: string;
};

export function buildPayslipRegisterFromFacts(facts: PayrollFact[]): PayslipRegisterRow[] {
  return facts.map((f) => ({
    payslipId: f.metadata.payslipId ?? `${f.payrollRunId}:${f.employeeId}`,
    employeeNumber: f.employeeNumber,
    employee: `${f.employeeName} ${f.surname}`.trim(),
    department: f.department,
    payDate: f.payDate,
    netPay: f.totals.netPay,
    status: f.metadata.paymentStatus ?? f.metadata.runStatus,
  }));
}
