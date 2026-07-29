import { describe, expect, it } from 'vitest';
import { buildPeriodReports, type RegisterPayslipInput } from '@/lib/payrollReports';

describe('Payroll employer contribution consistency', () => {
  it('uses canonical persisted employer contribution when payslip items omit employer rows', () => {
    const payslips: RegisterPayslipInput[] = [
      {
        employee_number: 'EMP-0001',
        employee: 'Jane Doe',
        department: 'Finance',
        gross_pay: 10000,
        total_deductions: 100,
        net_pay: 9900,
        employer_contributions: 100,
        items: [
          { description: 'Basic Salary', type: 'earning', amount: 10000 },
          { description: 'UIF', type: 'deduction', amount: 100 },
        ],
        status: 'paid',
      },
    ];

    const reports = buildPeriodReports(payslips, { start: '2026-07-01', end: '2026-07-31' });

    expect(reports.totals.employer_contributions).toBe(100);
    expect(reports.totals.cost_to_company).toBe(10100);
    expect(reports.register[0].employer_contributions).toBe(100);
    expect(reports.employer_contributions[0]?.amount).toBe(100);
  });
});
