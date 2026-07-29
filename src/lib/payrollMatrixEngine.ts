/**
 * Reusable Payroll Matrix Reporting Engine (V3.6.2)
 *
 * Consumes finalized payroll facts only. Never recalculates statutory amounts.
 * Aggregates snapshot-derived metrics across Month / Department / Cost Centre /
 * Company / Employee Group dimensions.
 *
 * V3.6.3: Aggregation delegated to domain-agnostic `src/reporting/engine/matrixEngine`.
 * Public payroll API and outputs remain LOCKED / unchanged.
 */

import { buildColumnVariance, buildMatrix } from '../reporting/engine/matrixEngine';

export type MatrixDimension =
  | 'month'
  | 'department'
  | 'cost_centre'
  | 'company'
  | 'employee_group';

export type MatrixMetricKey =
  | 'basic_salary'
  | 'overtime'
  | 'bonus'
  | 'gross_pay'
  | 'paye'
  | 'uif_employee'
  | 'uif_employer'
  | 'sdl'
  | 'pension'
  | 'medical_aid'
  | 'other_earnings'
  | 'other_deductions'
  | 'employer_contributions'
  | 'net_pay'
  | 'cost_to_company';

export const MATRIX_METRIC_LABELS: Record<MatrixMetricKey, string> = {
  basic_salary: 'Basic Salary',
  overtime: 'Overtime',
  bonus: 'Bonus',
  gross_pay: 'Gross Pay',
  paye: 'PAYE',
  uif_employee: 'UIF Employee',
  uif_employer: 'UIF Employer',
  sdl: 'SDL',
  pension: 'Pension',
  medical_aid: 'Medical Aid',
  other_earnings: 'Other Earnings',
  other_deductions: 'Other Deductions',
  employer_contributions: 'Employer Contributions',
  net_pay: 'Net Pay',
  cost_to_company: 'Cost to Company',
};

/** Default Payroll Matrix row order (ERP management layout). */
export const DEFAULT_MATRIX_METRICS: MatrixMetricKey[] = [
  'basic_salary',
  'overtime',
  'bonus',
  'other_earnings',
  'gross_pay',
  'paye',
  'uif_employee',
  'uif_employer',
  'sdl',
  'pension',
  'medical_aid',
  'other_deductions',
  'employer_contributions',
  'net_pay',
  'cost_to_company',
];

export type FinalizedPayslipItemFact = {
  description: string;
  type: 'earning' | 'deduction' | 'employer_contribution' | string;
  amount: number;
};

/**
 * One finalized payslip fact. All monetary values must originate from
 * finalized run snapshots / payslip headers — never from live engine recalculation.
 */
export type FinalizedPayrollFact = {
  payDate: string;
  employeeNumber?: string;
  employee: string;
  department: string;
  costCentre: string;
  employeeGroup: string;
  company: string;
  grossPay: number;
  netPay: number;
  employerContributions: number;
  items: FinalizedPayslipItemFact[];
  status?: string;
};

export type MatrixBuildOptions = {
  dimension: MatrixDimension;
  /** When dimension is month, columns follow SA FY March–February for this tax year start (YYYY). */
  taxYearStartYear?: number;
  metrics?: MatrixMetricKey[];
  includeTotalColumn?: boolean;
  /** Optional filter predicates (still snapshot-only). */
  filter?: (fact: FinalizedPayrollFact) => boolean;
};

export type PayrollMatrix = {
  dimension: MatrixDimension;
  metrics: MatrixMetricKey[];
  columns: string[];
  /** cells[metric][column] */
  cells: Record<MatrixMetricKey, Record<string, number>>;
  rowLabels: Record<MatrixMetricKey, string>;
  factCount: number;
  taxYearLabel?: string;
};

export type ExtractedMetrics = Record<MatrixMetricKey, number>;

const SA_FY_MONTHS = [
  { month: 3, label: 'Mar' },
  { month: 4, label: 'Apr' },
  { month: 5, label: 'May' },
  { month: 6, label: 'Jun' },
  { month: 7, label: 'Jul' },
  { month: 8, label: 'Aug' },
  { month: 9, label: 'Sep' },
  { month: 10, label: 'Oct' },
  { month: 11, label: 'Nov' },
  { month: 12, label: 'Dec' },
  { month: 1, label: 'Jan' },
  { month: 2, label: 'Feb' },
] as const;

function includesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function sumMatching(
  items: FinalizedPayslipItemFact[],
  predicate: (item: FinalizedPayslipItemFact) => boolean
): number {
  return items.filter(predicate).reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

/**
 * Extracts display metrics from finalized payslip line items + header totals.
 * Keyword classification only — does not invoke the Payroll Engine.
 */
export function extractMetricsFromFact(fact: FinalizedPayrollFact): ExtractedMetrics {
  const items = fact.items ?? [];

  const basic = sumMatching(items, (i) =>
    i.type === 'earning' && includesAny(i.description, ['basic salary', 'basic pay', 'salary'])
  );
  const overtime = sumMatching(items, (i) =>
    i.type === 'earning' && includesAny(i.description, ['overtime', 'ot '])
  );
  const bonus = sumMatching(items, (i) =>
    i.type === 'earning' && includesAny(i.description, ['bonus', 'incentive', '13th'])
  );
  const paye = sumMatching(items, (i) => includesAny(i.description, ['paye']) || (
    includesAny(i.description, ['tax']) && !includesAny(i.description, ['medical tax', 'tax credit'])
  ));
  const uifEmployee = sumMatching(items, (i) => {
    const d = i.description.toLowerCase();
    return d.includes('uif') && !d.includes('employer');
  });
  const uifEmployer = sumMatching(items, (i) => {
    const d = i.description.toLowerCase();
    return d.includes('uif') && d.includes('employer');
  });
  const sdl = sumMatching(items, (i) => includesAny(i.description, ['sdl', 'skills development']));
  const pension = sumMatching(items, (i) =>
    includesAny(i.description, ['pension', 'provident', 'retirement'])
  );
  const medical = sumMatching(items, (i) => includesAny(i.description, ['medical aid', 'medical']));

  const classifiedEarning = basic + overtime + bonus;
  const otherEarnings = Math.max(
    0,
    sumMatching(items, (i) => i.type === 'earning') - classifiedEarning
  );

  const classifiedDeduction = paye + uifEmployee + pension + medical;
  const otherDeductions = Math.max(
    0,
    sumMatching(
      items,
      (i) =>
        i.type === 'deduction' &&
        !includesAny(i.description, ['uif employer', 'sdl', 'skills development', 'employer contribution'])
    ) - classifiedDeduction
  );

  const employerFromItems = sumMatching(
    items,
    (i) =>
      i.type === 'employer_contribution' ||
      includesAny(i.description, ['uif employer', 'sdl', 'skills development', 'employer contribution', 'coida'])
  );
  const employerContributions =
    Number.isFinite(fact.employerContributions) && fact.employerContributions > 0
      ? fact.employerContributions
      : employerFromItems;

  const gross = Number.isFinite(fact.grossPay) ? fact.grossPay : sumMatching(items, (i) => i.type === 'earning');
  const net = Number.isFinite(fact.netPay) ? fact.netPay : 0;

  return {
    basic_salary: basic,
    overtime,
    bonus,
    other_earnings: otherEarnings,
    gross_pay: gross,
    paye,
    uif_employee: uifEmployee,
    uif_employer: uifEmployer > 0 ? uifEmployer : 0,
    sdl,
    pension,
    medical_aid: medical,
    other_deductions: otherDeductions,
    employer_contributions: employerContributions,
    net_pay: net,
    cost_to_company: gross + employerContributions,
  };
}

/** SA tax year for a calendar date: year Y means 1 Mar Y → 28/29 Feb Y+1. */
export function saTaxYearStartYear(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00`);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return month >= 3 ? year : year - 1;
}

export function saFinancialYearMonthColumns(taxYearStartYear: number): string[] {
  return SA_FY_MONTHS.map(({ month, label }) => {
    const year = month >= 3 ? taxYearStartYear : taxYearStartYear + 1;
    return `${label} ${year}`;
  });
}

export function monthColumnKey(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const label = SA_FY_MONTHS.find((m) => m.month === month)?.label ?? String(month);
  return `${label} ${year}`;
}

function dimensionValue(fact: FinalizedPayrollFact, dimension: MatrixDimension): string {
  switch (dimension) {
    case 'month':
      return monthColumnKey(fact.payDate);
    case 'department':
      return fact.department || '—';
    case 'cost_centre':
      return fact.costCentre || '—';
    case 'company':
      return fact.company || '—';
    case 'employee_group':
      return fact.employeeGroup || '—';
    default:
      return '—';
  }
}

function emptyMetricMap(metrics: MatrixMetricKey[]): ExtractedMetrics {
  return Object.fromEntries(metrics.map((m) => [m, 0])) as ExtractedMetrics;
}

/**
 * Build a reusable payroll matrix from finalized facts only.
 * Delegates aggregation to the platform matrix engine (V3.6.3).
 */
export function buildPayrollMatrix(
  facts: FinalizedPayrollFact[],
  options: MatrixBuildOptions
): PayrollMatrix {
  const metrics = options.metrics ?? DEFAULT_MATRIX_METRICS;
  const includeTotal = options.includeTotalColumn !== false;
  const filtered = options.filter ? facts.filter(options.filter) : facts;

  let columnOrder: string[] | undefined;
  let taxYearLabel: string | undefined;

  if (options.dimension === 'month') {
    const startYear =
      options.taxYearStartYear ??
      (filtered[0] ? saTaxYearStartYear(filtered[0].payDate) : saTaxYearStartYear(new Date().toISOString().slice(0, 10)));
    columnOrder = saFinancialYearMonthColumns(startYear);
    taxYearLabel = `FY ${startYear}/${String(startYear + 1).slice(-2)}`;
  }

  const generic = buildMatrix<FinalizedPayrollFact>({
    data: filtered,
    measures: metrics.map((id) => ({
      id,
      label: MATRIX_METRIC_LABELS[id],
      value: (fact) => extractMetricsFromFact(fact)[id] ?? 0,
      aggregation: 'sum' as const,
    })),
    columns: {
      key: (fact) => dimensionValue(fact, options.dimension),
      order: columnOrder,
    },
    includeTotalColumn: includeTotal,
  });

  return {
    dimension: options.dimension,
    metrics,
    columns: generic.columns,
    cells: generic.cells as Record<MatrixMetricKey, Record<string, number>>,
    rowLabels: { ...MATRIX_METRIC_LABELS },
    factCount: generic.factCount,
    taxYearLabel,
  };
}

/**
 * Pivot helper: aggregate a single metric across a dimension (for analysis tables).
 */
export function aggregateMetricByDimension(
  facts: FinalizedPayrollFact[],
  metric: MatrixMetricKey,
  dimension: Exclude<MatrixDimension, 'month'> | 'month'
): { key: string; amount: number }[] {
  const matrix = buildPayrollMatrix(facts, {
    dimension,
    metrics: [metric],
    includeTotalColumn: false,
  });
  return matrix.columns.map((key) => ({
    key,
    amount: matrix.cells[metric][key] ?? 0,
  }));
}

/**
 * Month-over-month variance from an existing month matrix (no recalculation).
 */
export function buildMatrixVariance(
  matrix: PayrollMatrix,
  metrics: MatrixMetricKey[] = matrix.metrics
): {
  metric: MatrixMetricKey;
  label: string;
  periods: { column: string; amount: number; variance: number | null; variancePct: number | null }[];
}[] {
  const generic = {
    rowKeys: matrix.metrics,
    rowLabels: matrix.rowLabels as Record<string, string>,
    columns: matrix.columns,
    cells: matrix.cells as Record<string, Record<string, number>>,
    measureIds: matrix.metrics,
    factCount: matrix.factCount,
  };
  return buildColumnVariance(generic, metrics).map((row) => ({
    metric: row.measureId as MatrixMetricKey,
    label: row.label,
    periods: row.periods,
  }));
}

export function matrixToRowObjects(matrix: PayrollMatrix): Record<string, string | number>[] {
  return matrix.metrics.map((metric) => {
    const row: Record<string, string | number> = {
      Metric: matrix.rowLabels[metric] ?? metric,
    };
    for (const col of matrix.columns) {
      row[col] = Number((matrix.cells[metric][col] ?? 0).toFixed(2));
    }
    return row;
  });
}

/** Zero-filled metric bag for tests / empty states. */
export function createEmptyMetrics(metrics: MatrixMetricKey[] = DEFAULT_MATRIX_METRICS): ExtractedMetrics {
  return emptyMetricMap(metrics);
}
