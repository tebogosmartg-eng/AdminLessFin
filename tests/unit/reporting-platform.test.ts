import { describe, expect, it, beforeEach } from 'vitest';
import {
  bootstrapReportingPlatform,
  buildMatrix,
  clearReportRegistry,
  exportReportRows,
  getReport,
  listReports,
  registerReport,
  requireReport,
  rowsToCsvString,
  buildSpreadsheetMl,
  canAccessReport,
} from '@/reporting';
import { buildPeriodReports } from '@/lib/payrollReports';
import { buildPayrollMatrix, type FinalizedPayrollFact } from '@/lib/payrollMatrixEngine';

describe('Enterprise Reporting Platform (V3.6.3)', () => {
  beforeEach(() => {
    clearReportRegistry();
  });

  it('registers reports through the Report Registry with required fields', () => {
    registerReport({
      id: 'demo.ops.sample',
      name: 'Sample',
      module: 'platform',
      category: 'operational',
      description: 'Demo',
      supportedFilters: [{ id: 'start', label: 'Start', type: 'date_range' }],
      supportedExports: ['csv', 'json'],
      permissions: {},
      generator: () => ({
        reportId: 'demo.ops.sample',
        generatedAt: new Date().toISOString(),
        title: 'Sample',
        rows: [{ A: 1 }],
      }),
    });

    const def = requireReport('demo.ops.sample');
    expect(def.id).toBe('demo.ops.sample');
    expect(def.supportedExports).toContain('csv');
    expect(listReports({ module: 'platform' })).toHaveLength(1);
  });

  it('builds a domain-agnostic matrix from measures and columns', () => {
    const matrix = buildMatrix({
      data: [
        { region: 'North', revenue: 100, cost: 40 },
        { region: 'North', revenue: 50, cost: 20 },
        { region: 'South', revenue: 80, cost: 30 },
      ],
      measures: [
        { id: 'revenue', label: 'Revenue', value: (r) => Number(r.revenue) },
        { id: 'cost', label: 'Cost', value: (r) => Number(r.cost) },
      ],
      columns: { key: (r) => String(r.region) },
      includeTotalColumn: true,
    });

    expect(matrix.cells.revenue.North).toBe(150);
    expect(matrix.cells.revenue.South).toBe(80);
    expect(matrix.cells.revenue.Total).toBe(230);
    expect(matrix.cells.cost.Total).toBe(90);
  });

  it('bootstraps payroll reports without changing register semantics', async () => {
    const boot = bootstrapReportingPlatform();
    expect(boot.payroll.length).toBeGreaterThanOrEqual(7);

    const register = getReport('payroll.operational.register');
    expect(register?.name).toBe('Payroll Register');

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
        pay_date: '2026-07-25',
      },
    ];

    const direct = buildPeriodReports(payslips, { start: '2026-07-01', end: '2026-07-31' });
    const viaRegistry = await requireReport('payroll.operational.register').generator({
      companyId: 'c1',
      filters: { start: '2026-07-01', end: '2026-07-31' },
      source: payslips,
    });

    expect(viaRegistry.rows[0]['Gross Pay']).toBe(10000);
    expect(viaRegistry.rows[0]['Cost to Company']).toBe(10100);
    expect(direct.register[0].cost_to_company).toBe(10100);
  });

  it('exports csv/excel/json via platform facade', async () => {
    const rows = [{ Metric: 'Revenue', North: 150, Total: 150 }];
    expect(rowsToCsvString(rows)).toContain('Revenue');
    expect(buildSpreadsheetMl(rows)).toContain('Excel.Sheet');

    const json = await exportReportRows(rows, { format: 'json', fileBaseName: 'demo' });
    expect(json.format).toBe('json');
    expect(json.payload).toContain('Revenue');
  });

  it('evaluates report permissions', () => {
    registerReport({
      id: 'secured.demo',
      name: 'Secured',
      module: 'platform',
      category: 'operational',
      description: 'x',
      supportedFilters: [],
      supportedExports: ['csv'],
      permissions: { roles: ['admin'], permissions: ['reports.read'] },
      generator: () => ({
        reportId: 'secured.demo',
        generatedAt: new Date().toISOString(),
        title: 'Secured',
        rows: [],
      }),
    });
    const def = requireReport('secured.demo');
    expect(canAccessReport(def, { roles: ['admin'] })).toBe(true);
    expect(canAccessReport(def, { roles: ['viewer'] })).toBe(false);
    expect(canAccessReport(def, { permissions: ['reports.read'] })).toBe(true);
  });

  it('keeps payroll matrix outputs stable via generic engine', () => {
    const facts: FinalizedPayrollFact[] = [
      {
        payDate: '2026-07-25',
        employee: 'Ada',
        department: 'Finance',
        costCentre: 'CC-A',
        employeeGroup: 'Permanent',
        company: 'Demo',
        grossPay: 20000,
        netPay: 15000,
        employerContributions: 400,
        items: [
          { description: 'Basic Salary', type: 'earning', amount: 20000 },
          { description: 'PAYE', type: 'deduction', amount: 3500 },
        ],
      },
    ];
    const matrix = buildPayrollMatrix(facts, { dimension: 'month', taxYearStartYear: 2026 });
    expect(matrix.cells.gross_pay['Jul 2026']).toBe(20000);
    expect(matrix.columns.at(-1)).toBe('Total');
  });
});
