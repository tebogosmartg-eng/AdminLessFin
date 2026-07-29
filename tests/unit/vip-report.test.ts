import { describe, expect, it, beforeEach } from 'vitest';
import {
  mapRawPayslipToPayrollFact,
  type RawFinalizedPayslipPayload,
  assertFactImmutable,
  validatePayrollFact,
  listPayrollItems,
  VIP_ITEM_CODES,
  measureFactItemAmount,
  factsToRegisterPayslips,
  buildVipWorkingPaperFromFacts,
  buildVipReportFromFacts,
  VIP_ANNUAL_TOTAL_COLUMN,
  VIP_ITEM_COLUMN,
  vipReportToRows,
  listVipComponentCodes,
  validateVipWorkingPaper,
  exportVipWorkingPaper,
  createVipExportBranding,
  bootstrapReportingPlatform,
  clearReportRegistry,
  exportReportRows,
  getReport,
  requireReport,
  rowsToCsvString,
  buildSpreadsheetMl,
  VIP_REPORT_ID,
  buildOperationalReportsFromFacts,
} from '@/reporting';
import { buildPeriodReports } from '@/lib/payrollReports';
import { buildPayrollMatrix, type FinalizedPayrollFact } from '@/lib/payrollMatrixEngine';
import { VIP_COMPONENTS } from '@/lib/vipReport';

function rawPayload(overrides: Partial<RawFinalizedPayslipPayload> = {}): RawFinalizedPayslipPayload {
  return {
    companyId: 'co-1',
    payrollRunId: 'run-1',
    payDate: '2026-07-25',
    runStatus: 'finalized',
    payslipId: 'ps-1',
    paymentStatus: 'paid',
    employeeId: 'emp-1',
    employees: {
      id: 'emp-1',
      employee_number: 'EMP-1',
      first_name: 'Ada',
      last_name: 'Lovelace',
      department: 'Finance',
      branch: 'CC-FIN',
      position: 'Analyst',
      employment_status: 'active',
      tax_number: '1234567890',
    },
    total_earnings: 20000,
    total_deductions: 5000,
    net_pay: 15000,
    calculation_snapshot: {
      tax_year: '2026/2027',
      total_employer_contributions: 400,
      cost_to_company: 20400,
      engine_results: [],
    },
    payslip_items: [
      { description: 'Basic Salary', type: 'earning', amount: 18000 },
      { description: 'Overtime', type: 'earning', amount: 1000 },
      { description: 'Bonus', type: 'earning', amount: 500 },
      { description: 'Commission', type: 'earning', amount: 300 },
      { description: 'Travel Allowance', type: 'earning', amount: 200 },
      { description: 'PAYE', type: 'deduction', amount: 3500 },
      { description: 'UIF', type: 'deduction', amount: 177.12 },
      { description: 'UIF Employer', type: 'employer_contribution', amount: 177.12 },
      { description: 'SDL', type: 'employer_contribution', amount: 200 },
      { description: 'Pension', type: 'deduction', amount: 900 },
      { description: 'Medical Aid', type: 'deduction', amount: 422.88 },
    ],
    ...overrides,
  };
}

describe('Payroll Facts architecture (locked)', () => {
  it('maps finalized snapshots to immutable PayrollFact', () => {
    const fact = mapRawPayslipToPayrollFact(rawPayload());
    expect(assertFactImmutable(fact)).toBe(true);
    expect(validatePayrollFact(fact).ok).toBe(true);
    expect(fact.employeeNumber).toBe('EMP-1');
    expect(fact.metadata.taxReference).toBe('1234567890');
  });

  it('preserves Payroll Register output via fact adapter', () => {
    const fact = mapRawPayslipToPayrollFact(rawPayload());
    const fromFacts = buildOperationalReportsFromFacts([fact], {
      start: '2026-07-01',
      end: '2026-07-31',
    });
    const legacy = buildPeriodReports(factsToRegisterPayslips([fact]), {
      start: '2026-07-01',
      end: '2026-07-31',
    });
    expect(fromFacts.register[0].cost_to_company).toBe(legacy.register[0].cost_to_company);
    expect(fromFacts.register[0].net_salary).toBe(15000);
  });

  it('exposes registry items and measures without recalculation', () => {
    expect(listPayrollItems().length).toBeGreaterThanOrEqual(14);
    const fact = mapRawPayslipToPayrollFact(rawPayload());
    expect(measureFactItemAmount(fact, 'basic_salary')).toBe(18000);
    expect(measureFactItemAmount(fact, 'paye')).toBe(3500);
    expect(measureFactItemAmount(fact, 'net_pay')).toBe(15000);
    expect(VIP_ITEM_CODES).toContain('paye');
  });
});

describe('VIP employee-first audit working paper (V3.6.6)', () => {
  it('builds one employee section with audit blocks and SA FY months', () => {
    const facts = [
      mapRawPayslipToPayrollFact(rawPayload({ payDate: '2026-03-25' })),
      mapRawPayslipToPayrollFact(
        rawPayload({
          payDate: '2026-04-25',
          payslipId: 'ps-2',
          total_earnings: 19000,
          net_pay: 15400,
          calculation_snapshot: {
            tax_year: '2026/2027',
            total_employer_contributions: 410,
            cost_to_company: 19410,
          },
          payslip_items: [
            { description: 'Basic Salary', type: 'earning', amount: 19000 },
            { description: 'PAYE', type: 'deduction', amount: 3600 },
          ],
        })
      ),
    ];

    const report = buildVipWorkingPaperFromFacts(facts, { taxYearStartYear: 2026 });
    expect(report.monthColumns[0]).toBe('Mar 2026');
    expect(report.monthColumns[11]).toBe('Feb 2027');
    expect(report.employeeCount).toBe(1);
    expect(report.employees).toHaveLength(1);

    const emp = report.employees[0];
    expect(emp.identity.employeeNumber).toBe('EMP-1');
    expect(emp.identity.taxNumber).toBe('1234567890');
    expect(emp.blocks.map((b) => b.id)).toEqual([
      'employee_information',
      'earnings',
      'deductions',
      'net_pay',
      'employer_contributions',
      'cost_to_company',
    ]);

    const earnings = emp.blocks.find((b) => b.id === 'earnings')!;
    const basic = earnings.lines.find((l) => l.code === 'basic_salary')!;
    expect(basic.months['Mar 2026']).toBe(18000);
    expect(basic.months['Apr 2026']).toBe(19000);
    expect(basic.annualTotal).toBe(37000);

    const gross = earnings.lines.find((l) => l.code === 'gross_earnings')!;
    expect(gross.emphasis).toBe('section_total');
    expect(gross.annualTotal).toBe(39000);

    const validation = validateVipWorkingPaper(report);
    expect(validation.ok).toBe(true);
    expect(listVipComponentCodes().length).toBeGreaterThan(10);
  });

  it('creates independent sections per employee', () => {
    const facts = [
      mapRawPayslipToPayrollFact(rawPayload({ payDate: '2026-05-25' })),
      mapRawPayslipToPayrollFact(
        rawPayload({
          payDate: '2026-06-25',
          payslipId: 'ps-2',
          employeeId: 'emp-2',
          employees: {
            id: 'emp-2',
            employee_number: 'EMP-2',
            first_name: 'Grace',
            last_name: 'Hopper',
            department: 'Engineering',
            branch: 'CC-ENG',
            position: 'Engineer',
            employment_status: 'active',
          },
        })
      ),
    ];
    const report = buildVipWorkingPaperFromFacts(facts, { taxYearStartYear: 2026 });
    expect(report.employeeCount).toBe(2);
    expect(report.employees.map((e) => e.identity.employeeNumber)).toEqual(['EMP-1', 'EMP-2']);
  });

  it('exports via VIP-owned branded pipeline (not management matrix)', () => {
    const fact = mapRawPayslipToPayrollFact(rawPayload({ payDate: '2026-06-25' }));
    const report = buildVipWorkingPaperFromFacts([fact], { taxYearStartYear: 2026 });
    const branding = createVipExportBranding({
      companyName: 'Demo Co',
      financialYear: report.taxYearLabel,
      payrollPeriod: '2026-03-01 – 2027-02-28',
      generatedBy: 'Ada Lovelace',
      report,
    });

    const excel = exportVipWorkingPaper(report, {
      format: 'excel',
      fileBaseName: 'AdminLess-Fin-VIP-Working-Paper',
      branding,
    });
    expect(excel.payload).toContain('VIP Payroll Report');
    expect(excel.payload).toContain('AdminLess Fin');
    expect(excel.payload).toContain('Enterprise Payroll Platform');
    expect(excel.payload).toContain('EMPLOYEE INFORMATION');
    expect(excel.payload).toContain('EARNINGS');
    expect(excel.payload).toContain('FreezePanes');
    expect(excel.payload).toContain('AutoFilter');
    expect(excel.payload).toContain('CONFIDENTIAL');

    const csv = exportVipWorkingPaper(report, {
      format: 'csv',
      fileBaseName: 'AdminLess-Fin-VIP-Working-Paper',
      branding,
    });
    expect(csv.payload).toContain('# AdminLess Fin');
    expect(csv.payload).toContain('# Enterprise VIP Payroll Working Paper');
    expect(csv.payload).toContain('# Classification: CONFIDENTIAL');
    expect(csv.payload).toContain(VIP_ITEM_COLUMN);
    expect(csv.payload).toContain(VIP_ANNUAL_TOTAL_COLUMN);
  });
});

describe('Locked regressions — Register / Matrix / platform export', () => {
  beforeEach(() => {
    clearReportRegistry();
  });

  it('registers VIP compliance report on bootstrap', async () => {
    const boot = bootstrapReportingPlatform();
    expect(boot.compliance).toContain(VIP_REPORT_ID);
    const def = getReport(VIP_REPORT_ID);
    expect(def?.category).toBe('compliance');

    const fact = mapRawPayslipToPayrollFact(rawPayload({ payDate: '2026-08-25' }));
    const result = await requireReport(VIP_REPORT_ID).generator({
      companyId: 'c1',
      companyName: 'Demo',
      filters: { taxYearStartYear: 2026 },
      source: { facts: [fact] },
    });
    expect(result.title).toContain('VIP');
    expect(result.meta?.architecture).toBe('v3.6.6');
    expect(result.rows.length).toBeGreaterThan(0);
    expect(VIP_COMPONENTS.length).toBe(VIP_ITEM_CODES.length);
    expect(vipReportToRows(buildVipReportFromFacts([fact], { taxYearStartYear: 2026 })).length).toBe(
      listVipComponentCodes().length
    );
  });

  it('does not alter Payroll Register semantics', () => {
    const payslips = [
      {
        employee_number: 'EMP-1',
        employee: 'Ada',
        department: 'Finance',
        gross_pay: 10000,
        total_deductions: 100,
        net_pay: 9900,
        employer_contributions: 100,
        items: [
          { description: 'Basic Salary', type: 'earning' as const, amount: 10000 },
          { description: 'UIF', type: 'deduction' as const, amount: 100 },
        ],
        status: 'paid',
      },
    ];
    const register = buildPeriodReports(payslips, { start: '2026-07-01', end: '2026-07-31' });
    expect(register.register[0].cost_to_company).toBe(10100);
  });

  it('does not alter payroll matrix month column contract', () => {
    const facts: FinalizedPayrollFact[] = [
      {
        payDate: '2026-03-25',
        employee: 'Ada',
        department: 'Finance',
        costCentre: 'CC',
        employeeGroup: 'G',
        company: 'Co',
        grossPay: 10000,
        netPay: 8000,
        employerContributions: 100,
        items: [{ description: 'Basic Salary', type: 'earning', amount: 10000 }],
      },
    ];
    const matrix = buildPayrollMatrix(facts, { dimension: 'month', taxYearStartYear: 2026 });
    expect(matrix.columns[0]).toBe('Mar 2026');
    expect(matrix.columns[11]).toBe('Feb 2027');
  });

  it('leaves operational/platform SpreadsheetML helper usable without VIP branding', () => {
    const rows = [{ A: 1, B: 2 }];
    const xml = buildSpreadsheetMl(rows);
    expect(xml).toContain('Excel.Sheet');
    const csv = rowsToCsvString(rows);
    expect(csv).toContain('A');
    const json = exportReportRows(rows, { format: 'json', fileBaseName: 'ops-demo' });
    expect(json.format).toBe('json');
  });
});
