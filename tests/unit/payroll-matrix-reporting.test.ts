import { describe, expect, it } from 'vitest';
import {
  buildMatrixVariance,
  buildPayrollMatrix,
  extractMetricsFromFact,
  saFinancialYearMonthColumns,
  saTaxYearStartYear,
  type FinalizedPayrollFact,
} from '@/lib/payrollMatrixEngine';
import {
  buildManagementReports,
  managementReportToRows,
  type ManagementPayslipInput,
} from '@/lib/payrollManagementReports';
import { buildPeriodReports } from '@/lib/payrollReports';
import { buildSpreadsheetMl, rowsToCsvString } from '@/lib/payrollReportExport';

function fact(overrides: Partial<FinalizedPayrollFact> = {}): FinalizedPayrollFact {
  return {
    payDate: '2026-07-25',
    employeeNumber: 'EMP-1',
    employee: 'Ada Lovelace',
    department: 'Finance',
    costCentre: 'CC-FIN',
    employeeGroup: 'Permanent',
    company: 'Demo Co',
    grossPay: 20000,
    netPay: 15000,
    employerContributions: 400,
    items: [
      { description: 'Basic Salary', type: 'earning', amount: 18000 },
      { description: 'Overtime', type: 'earning', amount: 1000 },
      { description: 'Bonus', type: 'earning', amount: 1000 },
      { description: 'PAYE', type: 'deduction', amount: 3500 },
      { description: 'UIF', type: 'deduction', amount: 177.12 },
      { description: 'UIF Employer', type: 'employer_contribution', amount: 177.12 },
      { description: 'SDL', type: 'employer_contribution', amount: 200 },
      { description: 'Pension', type: 'deduction', amount: 900 },
      { description: 'Medical Aid', type: 'deduction', amount: 422.88 },
    ],
    status: 'paid',
    ...overrides,
  };
}

describe('Payroll matrix engine (V3.6.2)', () => {
  it('uses SA financial year March–February columns', () => {
    expect(saTaxYearStartYear('2026-07-01')).toBe(2026);
    expect(saTaxYearStartYear('2026-02-28')).toBe(2025);
    const cols = saFinancialYearMonthColumns(2026);
    expect(cols[0]).toBe('Mar 2026');
    expect(cols[11]).toBe('Feb 2027');
    expect(cols).toHaveLength(12);
  });

  it('extracts metrics from finalized items without inventing statutory rates', () => {
    const metrics = extractMetricsFromFact(fact());
    expect(metrics.basic_salary).toBe(18000);
    expect(metrics.overtime).toBe(1000);
    expect(metrics.bonus).toBe(1000);
    expect(metrics.paye).toBe(3500);
    expect(metrics.uif_employee).toBe(177.12);
    expect(metrics.uif_employer).toBe(177.12);
    expect(metrics.sdl).toBe(200);
    expect(metrics.pension).toBe(900);
    expect(metrics.medical_aid).toBe(422.88);
    expect(metrics.gross_pay).toBe(20000);
    expect(metrics.net_pay).toBe(15000);
    expect(metrics.cost_to_company).toBe(20400);
  });

  it('builds a reusable month matrix with Total column', () => {
    const matrix = buildPayrollMatrix(
      [
        fact({ payDate: '2026-03-25' }),
        fact({
          payDate: '2026-04-25',
          grossPay: 21000,
          netPay: 15500,
          employerContributions: 420,
          items: [
            { description: 'Basic Salary', type: 'earning', amount: 21000 },
            { description: 'PAYE', type: 'deduction', amount: 3600 },
            { description: 'UIF', type: 'deduction', amount: 177.12 },
          ],
        }),
      ],
      { dimension: 'month', taxYearStartYear: 2026 }
    );

    expect(matrix.columns).toContain('Mar 2026');
    expect(matrix.columns).toContain('Apr 2026');
    expect(matrix.columns.at(-1)).toBe('Total');
    expect(matrix.cells.gross_pay['Mar 2026']).toBe(20000);
    expect(matrix.cells.gross_pay['Apr 2026']).toBe(21000);
    expect(matrix.cells.gross_pay.Total).toBe(41000);
    expect(matrix.factCount).toBe(2);
  });

  it('aggregates by department and cost centre dimensions', () => {
    const facts = [
      fact({ department: 'Finance', costCentre: 'CC-A' }),
      fact({ department: 'Ops', costCentre: 'CC-B', employee: 'Grace Hopper', employeeNumber: 'EMP-2' }),
      fact({ department: 'Finance', costCentre: 'CC-A', employee: 'Alan Turing', employeeNumber: 'EMP-3' }),
    ];
    const byDept = buildPayrollMatrix(facts, {
      dimension: 'department',
      metrics: ['gross_pay', 'cost_to_company'],
    });
    expect(byDept.cells.gross_pay.Finance).toBe(40000);
    expect(byDept.cells.gross_pay.Ops).toBe(20000);

    const byCc = buildPayrollMatrix(facts, {
      dimension: 'cost_centre',
      metrics: ['gross_pay'],
      includeTotalColumn: false,
    });
    expect(byCc.cells.gross_pay['CC-A']).toBe(40000);
    expect(byCc.cells.gross_pay['CC-B']).toBe(20000);
  });

  it('computes month-over-month variance from matrix totals only', () => {
    const matrix = buildPayrollMatrix(
      [fact({ payDate: '2026-03-25' }), fact({ payDate: '2026-04-25', grossPay: 22000 })],
      { dimension: 'month', taxYearStartYear: 2026, metrics: ['gross_pay'], includeTotalColumn: true }
    );
    const variance = buildMatrixVariance(matrix, ['gross_pay']);
    const apr = variance[0].periods.find((p) => p.column === 'Apr 2026');
    expect(apr?.amount).toBe(22000);
    expect(apr?.variance).toBe(2000);
  });
});

describe('Management reporting layer', () => {
  const payslips: ManagementPayslipInput[] = [
    {
      employee_number: 'EMP-1',
      employee: 'Ada Lovelace',
      department: 'Finance',
      cost_centre: 'CC-FIN',
      employee_group: 'Permanent',
      pay_date: '2026-07-25',
      gross_pay: 20000,
      total_deductions: 5000,
      net_pay: 15000,
      employer_contributions: 400,
      items: [
        { description: 'Basic Salary', type: 'earning', amount: 20000 },
        { description: 'PAYE', type: 'deduction', amount: 3500 },
        { description: 'UIF', type: 'deduction', amount: 177.12 },
        { description: 'SDL', type: 'employer_contribution', amount: 200 },
      ],
      status: 'paid',
    },
  ];

  it('builds management bundle including payroll matrix and analyses', () => {
    const bundle = buildManagementReports(payslips, { companyName: 'Demo Co', taxYearStartYear: 2026 });
    expect(bundle.taxYearLabel).toContain('2026');
    expect(bundle.payrollMatrix.cells.gross_pay['Jul 2026']).toBe(20000);
    expect(bundle.departmentAnalysis[0].dimension).toBe('Finance');
    expect(bundle.costCentreAnalysis[0].dimension).toBe('CC-FIN');
    expect(bundle.statutory.paye_summary[0].amount).toBe(3500);
    expect(bundle.statutory.sdl_summary[0].amount).toBe(200);

    const matrixRows = managementReportToRows('payroll_matrix', bundle);
    expect(matrixRows[0]).toHaveProperty('Metric');
    expect(matrixRows[0]).toHaveProperty('Jul 2026');
    expect(matrixRows[0]).toHaveProperty('Total');
  });

  it('does not change operational Payroll Register behaviour', () => {
    const operational = buildPeriodReports(payslips, { start: '2026-07-01', end: '2026-07-31' });
    expect(operational.register).toHaveLength(1);
    expect(operational.register[0].gross_pay).toBe(20000);
    expect(operational.register[0].employer_contributions).toBe(400);
    expect(operational.totals.cost_to_company).toBe(20400);
    expect(operational.paye_summary.length).toBeGreaterThan(0);
  });
});

describe('Export framework', () => {
  it('renders CSV and SpreadsheetML from row objects', () => {
    const rows = [
      { Metric: 'Gross Pay', 'Jul 2026': 20000, Total: 20000 },
      { Metric: 'PAYE', 'Jul 2026': 3500, Total: 3500 },
    ];
    const csv = rowsToCsvString(rows);
    expect(csv).toContain('Metric');
    expect(csv).toContain('Gross Pay');

    const xml = buildSpreadsheetMl(rows);
    expect(xml).toContain('Excel.Sheet');
    expect(xml).toContain('Gross Pay');
    expect(xml).toContain('ss:Type="Number"');
  });
});
