/**
 * Management Reporting layer (V3.6.2)
 *
 * Sits alongside operational period reports. Does not modify Payroll Register.
 * All inputs are finalized payroll facts / snapshots only.
 */

import {
  buildMatrixVariance,
  buildPayrollMatrix,
  DEFAULT_MATRIX_METRICS,
  extractMetricsFromFact,
  matrixToRowObjects,
  monthColumnKey,
  type FinalizedPayrollFact,
  type MatrixMetricKey,
  type PayrollMatrix,
  saTaxYearStartYear,
} from './payrollMatrixEngine';
import type { RegisterPayslipInput } from './payrollReports';

export type ManagementReportId =
  | 'payroll_matrix'
  | 'monthly_analysis'
  | 'department_analysis'
  | 'cost_centre_analysis'
  | 'payroll_variance';

export type StatutoryReportId =
  | 'paye_summary'
  | 'uif_summary'
  | 'sdl_summary'
  | 'employer_contributions';

export type ReportCategory = 'operational' | 'management' | 'statutory';

export const MANAGEMENT_REPORT_CATALOG: {
  id: ManagementReportId;
  label: string;
  description: string;
}[] = [
  {
    id: 'payroll_matrix',
    label: 'Payroll Matrix',
    description: 'Payroll items × financial year months (Mar–Feb) with totals',
  },
  {
    id: 'monthly_analysis',
    label: 'Monthly Payroll Analysis',
    description: 'Key payroll KPIs by month from finalized runs',
  },
  {
    id: 'department_analysis',
    label: 'Department Analysis',
    description: 'Payroll metrics aggregated by department',
  },
  {
    id: 'cost_centre_analysis',
    label: 'Cost Centre Analysis',
    description: 'Payroll metrics aggregated by cost centre (branch)',
  },
  {
    id: 'payroll_variance',
    label: 'Payroll Variance Report',
    description: 'Month-over-month variance on finalized matrix totals',
  },
];

export const STATUTORY_REPORT_CATALOG: {
  id: StatutoryReportId;
  label: string;
  description: string;
}[] = [
  { id: 'paye_summary', label: 'PAYE Summary', description: 'PAYE withholding from finalized payslips' },
  { id: 'uif_summary', label: 'UIF Summary', description: 'UIF employee and employer from finalized payslips' },
  { id: 'sdl_summary', label: 'SDL Summary', description: 'Skills Development Levy from finalized payslips' },
  {
    id: 'employer_contributions',
    label: 'Employer Contributions',
    description: 'Employer statutory and benefit contributions from snapshots',
  },
];

/** Extended fact input used by management reporting (superset of register input). */
export type ManagementPayslipInput = RegisterPayslipInput & {
  pay_date: string;
  cost_centre?: string;
  employee_group?: string;
  company?: string;
};

export function toFinalizedPayrollFacts(
  payslips: ManagementPayslipInput[],
  companyName = 'Company'
): FinalizedPayrollFact[] {
  return payslips.map((p) => ({
    payDate: p.pay_date,
    employeeNumber: p.employee_number,
    employee: p.employee,
    department: p.department || '—',
    costCentre: p.cost_centre || p.department || '—',
    employeeGroup: p.employee_group || 'Ungrouped',
    company: p.company || companyName,
    grossPay: p.gross_pay,
    netPay: p.net_pay,
    employerContributions: p.employer_contributions ?? 0,
    items: p.items,
    status: p.status,
  }));
}

export type MonthlyAnalysisRow = {
  month: string;
  gross_pay: number;
  paye: number;
  uif_employee: number;
  sdl: number;
  employer_contributions: number;
  net_pay: number;
  cost_to_company: number;
  employees: number;
};

export type DimensionAnalysisRow = {
  dimension: string;
  gross_pay: number;
  paye: number;
  uif: number;
  sdl: number;
  employer_contributions: number;
  net_pay: number;
  cost_to_company: number;
  employees: number;
};

export type VarianceReportRow = {
  metric: string;
  column: string;
  amount: number;
  variance: number | null;
  variance_pct: number | null;
};

export type StatutoryLineRow = {
  description: string;
  amount: number;
  employee_count?: number;
};

export type ManagementReportsBundle = {
  taxYearStartYear: number;
  taxYearLabel: string;
  payrollMatrix: PayrollMatrix;
  monthlyAnalysis: MonthlyAnalysisRow[];
  departmentAnalysis: DimensionAnalysisRow[];
  costCentreAnalysis: DimensionAnalysisRow[];
  variance: VarianceReportRow[];
  statutory: {
    paye_summary: StatutoryLineRow[];
    uif_summary: StatutoryLineRow[];
    sdl_summary: StatutoryLineRow[];
    employer_contributions: StatutoryLineRow[];
  };
};

const MONTHLY_METRICS: MatrixMetricKey[] = [
  'gross_pay',
  'paye',
  'uif_employee',
  'sdl',
  'employer_contributions',
  'net_pay',
  'cost_to_company',
];

function buildDimensionAnalysis(
  facts: FinalizedPayrollFact[],
  dimension: 'department' | 'cost_centre'
): DimensionAnalysisRow[] {
  const groups = new Map<string, FinalizedPayrollFact[]>();
  for (const fact of facts) {
    const key = dimension === 'department' ? fact.department : fact.costCentre;
    const list = groups.get(key) ?? [];
    list.push(fact);
    groups.set(key, list);
  }

  return Array.from(groups.entries())
    .map(([key, group]) => {
      const totals = group.reduce(
        (acc, fact) => {
          const m = extractMetricsFromFact(fact);
          return {
            gross_pay: acc.gross_pay + m.gross_pay,
            paye: acc.paye + m.paye,
            uif: acc.uif + m.uif_employee,
            sdl: acc.sdl + m.sdl,
            employer_contributions: acc.employer_contributions + m.employer_contributions,
            net_pay: acc.net_pay + m.net_pay,
            cost_to_company: acc.cost_to_company + m.cost_to_company,
            employees: acc.employees + 1,
          };
        },
        {
          gross_pay: 0,
          paye: 0,
          uif: 0,
          sdl: 0,
          employer_contributions: 0,
          net_pay: 0,
          cost_to_company: 0,
          employees: 0,
        }
      );
      return { dimension: key, ...totals };
    })
    .sort((a, b) => b.cost_to_company - a.cost_to_company);
}

function buildStatutorySummaries(facts: FinalizedPayrollFact[]): ManagementReportsBundle['statutory'] {
  const payeEmployees = new Set<string>();
  const uifEmployees = new Set<string>();
  const sdlEmployees = new Set<string>();
  let paye = 0;
  let uifEmployee = 0;
  let uifEmployer = 0;
  let sdl = 0;
  let employer = 0;

  for (const fact of facts) {
    const m = extractMetricsFromFact(fact);
    const empKey = fact.employeeNumber ?? fact.employee;
    if (m.paye) {
      paye += m.paye;
      payeEmployees.add(empKey);
    }
    if (m.uif_employee || m.uif_employer) {
      uifEmployee += m.uif_employee;
      uifEmployer += m.uif_employer;
      uifEmployees.add(empKey);
    }
    if (m.sdl) {
      sdl += m.sdl;
      sdlEmployees.add(empKey);
    }
    employer += m.employer_contributions;
  }

  return {
    paye_summary: [
      { description: 'PAYE', amount: paye, employee_count: payeEmployees.size },
    ],
    uif_summary: [
      { description: 'UIF Employee', amount: uifEmployee, employee_count: uifEmployees.size },
      { description: 'UIF Employer', amount: uifEmployer, employee_count: uifEmployees.size },
      { description: 'UIF Total', amount: uifEmployee + uifEmployer },
    ],
    sdl_summary: [
      { description: 'SDL', amount: sdl, employee_count: sdlEmployees.size },
    ],
    employer_contributions: [
      { description: 'Employer Contributions', amount: employer, employee_count: facts.length },
    ],
  };
}

export function buildManagementReports(
  payslips: ManagementPayslipInput[],
  options?: { companyName?: string; taxYearStartYear?: number }
): ManagementReportsBundle {
  const facts = toFinalizedPayrollFacts(payslips, options?.companyName ?? 'Company');
  const taxYearStartYear =
    options?.taxYearStartYear ??
    (facts[0] ? saTaxYearStartYear(facts[0].payDate) : saTaxYearStartYear(new Date().toISOString().slice(0, 10)));

  const fyFacts = facts.filter((f) => saTaxYearStartYear(f.payDate) === taxYearStartYear);

  const payrollMatrix = buildPayrollMatrix(fyFacts, {
    dimension: 'month',
    taxYearStartYear,
    metrics: DEFAULT_MATRIX_METRICS,
    includeTotalColumn: true,
  });

  const monthMatrix = buildPayrollMatrix(fyFacts, {
    dimension: 'month',
    taxYearStartYear,
    metrics: MONTHLY_METRICS,
    includeTotalColumn: false,
  });

  const monthEmployeeCounts = new Map<string, number>();
  for (const fact of fyFacts) {
    const col = monthColumnKey(fact.payDate);
    monthEmployeeCounts.set(col, (monthEmployeeCounts.get(col) ?? 0) + 1);
  }

  const monthlyAnalysis: MonthlyAnalysisRow[] = monthMatrix.columns.map((month) => ({
    month,
    gross_pay: monthMatrix.cells.gross_pay[month] ?? 0,
    paye: monthMatrix.cells.paye[month] ?? 0,
    uif_employee: monthMatrix.cells.uif_employee[month] ?? 0,
    sdl: monthMatrix.cells.sdl[month] ?? 0,
    employer_contributions: monthMatrix.cells.employer_contributions[month] ?? 0,
    net_pay: monthMatrix.cells.net_pay[month] ?? 0,
    cost_to_company: monthMatrix.cells.cost_to_company[month] ?? 0,
    employees: monthEmployeeCounts.get(month) ?? 0,
  }));

  const varianceRaw = buildMatrixVariance(payrollMatrix, [
    'gross_pay',
    'paye',
    'uif_employee',
    'sdl',
    'employer_contributions',
    'net_pay',
    'cost_to_company',
  ]);

  const variance: VarianceReportRow[] = varianceRaw.flatMap((row) =>
    row.periods.map((p) => ({
      metric: row.label,
      column: p.column,
      amount: p.amount,
      variance: p.variance,
      variance_pct: p.variancePct,
    }))
  );

  return {
    taxYearStartYear,
    taxYearLabel: payrollMatrix.taxYearLabel ?? `FY ${taxYearStartYear}/${String(taxYearStartYear + 1).slice(-2)}`,
    payrollMatrix,
    monthlyAnalysis,
    departmentAnalysis: buildDimensionAnalysis(fyFacts, 'department'),
    costCentreAnalysis: buildDimensionAnalysis(fyFacts, 'cost_centre'),
    variance,
    statutory: buildStatutorySummaries(fyFacts),
  };
}

export function managementReportToRows(
  reportId: ManagementReportId,
  bundle: ManagementReportsBundle
): Record<string, string | number>[] {
  switch (reportId) {
    case 'payroll_matrix':
      return matrixToRowObjects(bundle.payrollMatrix);
    case 'monthly_analysis':
      return bundle.monthlyAnalysis.map((r) => ({
        Month: r.month,
        'Gross Pay': Number(r.gross_pay.toFixed(2)),
        PAYE: Number(r.paye.toFixed(2)),
        'UIF Employee': Number(r.uif_employee.toFixed(2)),
        SDL: Number(r.sdl.toFixed(2)),
        'Employer Contributions': Number(r.employer_contributions.toFixed(2)),
        'Net Pay': Number(r.net_pay.toFixed(2)),
        'Cost to Company': Number(r.cost_to_company.toFixed(2)),
        Employees: r.employees,
      }));
    case 'department_analysis':
      return bundle.departmentAnalysis.map((r) => ({
        Department: r.dimension,
        'Gross Pay': Number(r.gross_pay.toFixed(2)),
        PAYE: Number(r.paye.toFixed(2)),
        UIF: Number(r.uif.toFixed(2)),
        SDL: Number(r.sdl.toFixed(2)),
        'Employer Contributions': Number(r.employer_contributions.toFixed(2)),
        'Net Pay': Number(r.net_pay.toFixed(2)),
        'Cost to Company': Number(r.cost_to_company.toFixed(2)),
        Employees: r.employees,
      }));
    case 'cost_centre_analysis':
      return bundle.costCentreAnalysis.map((r) => ({
        'Cost Centre': r.dimension,
        'Gross Pay': Number(r.gross_pay.toFixed(2)),
        PAYE: Number(r.paye.toFixed(2)),
        UIF: Number(r.uif.toFixed(2)),
        SDL: Number(r.sdl.toFixed(2)),
        'Employer Contributions': Number(r.employer_contributions.toFixed(2)),
        'Net Pay': Number(r.net_pay.toFixed(2)),
        'Cost to Company': Number(r.cost_to_company.toFixed(2)),
        Employees: r.employees,
      }));
    case 'payroll_variance':
      return bundle.variance.map((r) => ({
        Metric: r.metric,
        Period: r.column,
        Amount: Number(r.amount.toFixed(2)),
        Variance: r.variance == null ? '' : Number(r.variance.toFixed(2)),
        'Variance %': r.variance_pct == null ? '' : Number(r.variance_pct.toFixed(2)),
      }));
    default:
      return [];
  }
}

export function statutoryReportToRows(
  reportId: StatutoryReportId,
  bundle: ManagementReportsBundle
): Record<string, string | number>[] {
  const rows = bundle.statutory[reportId] ?? [];
  return rows.map((r) => ({
    Description: r.description,
    Amount: Number(r.amount.toFixed(2)),
    Employees: r.employee_count ?? '',
  }));
}
