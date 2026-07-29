import { downloadCSV } from './utils';
import type { PayslipItem } from './payrollDocuments';

export type ReportLineItem = {
  description: string;
  amount: number;
  employee_count?: number;
};

export type EmployeeReportRow = {
  employee: string;
  department: string;
  amount: number;
};

export type PayrollRegisterReportRow = {
  employee_number?: string;
  employee: string;
  department: string;
  gross_pay: number;
  deductions: number;
  paye: number;
  uif: number;
  sdl: number;
  employer_contributions: number;
  net_salary: number;
  cost_to_company: number;
  status: string;
};

export type PayrollPeriodReports = {
  period: { start: string; end: string };
  register: PayrollRegisterReportRow[];
  earnings: ReportLineItem[];
  deductions: ReportLineItem[];
  employer_contributions: ReportLineItem[];
  uif_summary: ReportLineItem[];
  paye_summary: ReportLineItem[];
  employee_cost: EmployeeReportRow[];
  totals: {
    gross_pay: number;
    net_pay: number;
    paye: number;
    uif: number;
    sdl: number;
    employer_contributions: number;
    cost_to_company: number;
    employees: number;
  };
};

const EMPLOYER_KEYWORDS = ['uif employer', 'sdl', 'skills development', 'medical aid employer', 'provident employer', 'coida', 'employer contribution'];

function sumByKeyword(items: PayslipItem[], keywords: string[]): number {
  return items
    .filter((i) => keywords.some((k) => i.description.toLowerCase().includes(k)))
    .reduce((s, i) => s + i.amount, 0);
}

function isEmployerContribution(description: string): boolean {
  const lower = description.toLowerCase();
  return EMPLOYER_KEYWORDS.some((k) => lower.includes(k));
}

export type PayslipItemWithEmployee = PayslipItem & {
  employee_name?: string;
  department?: string;
};

function aggregateByDescription(
  items: PayslipItemWithEmployee[],
  filter: (item: PayslipItemWithEmployee) => boolean
): ReportLineItem[] {
  const map = new Map<string, { amount: number; employees: Set<string> }>();
  for (const item of items.filter(filter)) {
    const key = item.description.trim();
    const existing = map.get(key) ?? { amount: 0, employees: new Set<string>() };
    existing.amount += item.amount;
    if (item.employee_name) existing.employees.add(item.employee_name);
    map.set(key, existing);
  }
  return Array.from(map.entries())
    .map(([description, { amount, employees }]) => ({
      description,
      amount,
      employee_count: employees.size || undefined,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export type RegisterPayslipInput = {
  employee_number?: string;
  employee: string;
  department: string;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  employer_contributions?: number;
  items: PayslipItem[];
  status: string;
};

export function buildPeriodReports(
  payslips: RegisterPayslipInput[],
  period: { start: string; end: string }
): PayrollPeriodReports {
  const allItems: PayslipItemWithEmployee[] = payslips.flatMap((p) =>
    p.items.map((i) => ({
      ...i,
      employee_name: p.employee,
      department: p.department,
    }))
  );

  const register: PayrollRegisterReportRow[] = payslips.map((p) => {
    const paye = sumByKeyword(p.items, ['paye', 'tax']);
    const uif = sumByKeyword(p.items, ['uif']);
    const sdl = sumByKeyword(p.items, ['sdl', 'skills development']);
    const employerContributions = Number.isFinite(p.employer_contributions)
      ? (p.employer_contributions as number)
      : 0;
    return {
      employee_number: p.employee_number,
      employee: p.employee,
      department: p.department,
      gross_pay: p.gross_pay,
      deductions: p.total_deductions,
      paye,
      uif,
      sdl,
      employer_contributions: employerContributions,
      net_salary: p.net_pay,
      cost_to_company: p.gross_pay + employerContributions,
      status: p.status,
    };
  });

  const earnings = aggregateByDescription(allItems, (i) => i.type === 'earning');
  const deductions = aggregateByDescription(
    allItems,
    (i) => i.type === 'deduction' && !isEmployerContribution(i.description)
  );
  const employerContributions = aggregateByDescription(
    allItems,
    (i) => i.type === 'employer_contribution' || (i.type === 'deduction' && isEmployerContribution(i.description))
  );
  if (employerContributions.length === 0) {
    const registerEmployerTotal = register.reduce((sum, row) => sum + row.employer_contributions, 0);
    if (registerEmployerTotal > 0) {
      employerContributions.push({
        description: 'Employer Contributions',
        amount: registerEmployerTotal,
      });
    }
  }
  const uifSummary = aggregateByDescription(allItems, (i) => i.description.toLowerCase().includes('uif'));
  const payeSummary = aggregateByDescription(allItems, (i) => {
    const d = i.description.toLowerCase();
    return d.includes('paye') || d.includes('tax');
  });

  const employeeCost: EmployeeReportRow[] = register.map((r) => ({
    employee: r.employee,
    department: r.department,
    amount: r.cost_to_company,
  }));

  const totals = register.reduce(
    (acc, r) => ({
      gross_pay: acc.gross_pay + r.gross_pay,
      net_pay: acc.net_pay + r.net_salary,
      paye: acc.paye + r.paye,
      uif: acc.uif + r.uif,
      sdl: acc.sdl + r.sdl,
      employer_contributions: acc.employer_contributions + r.employer_contributions,
      cost_to_company: acc.cost_to_company + r.cost_to_company,
      employees: acc.employees + 1,
    }),
    { gross_pay: 0, net_pay: 0, paye: 0, uif: 0, sdl: 0, employer_contributions: 0, cost_to_company: 0, employees: 0 }
  );

  return {
    period,
    register,
    earnings,
    deductions,
    employer_contributions: employerContributions,
    uif_summary: uifSummary,
    paye_summary: payeSummary,
    employee_cost: employeeCost.sort((a, b) => b.amount - a.amount),
    totals,
  };
}

export type PayrollReportType =
  | 'register'
  | 'earnings'
  | 'deductions'
  | 'employer_contributions'
  | 'uif_summary'
  | 'paye_summary'
  | 'employee_cost';

export const PAYROLL_REPORT_CATALOG: { id: PayrollReportType; label: string; description: string }[] = [
  { id: 'register', label: 'Payroll Register', description: 'Employee-level gross, deductions, statutory and net pay' },
  { id: 'earnings', label: 'Earnings Report', description: 'Aggregated earnings by line item' },
  { id: 'deductions', label: 'Deductions Report', description: 'Employee deductions by type' },
  { id: 'employer_contributions', label: 'Employer Contributions', description: 'Employer statutory and benefit contributions' },
  { id: 'uif_summary', label: 'UIF Summary', description: 'UIF employee and employer totals' },
  { id: 'paye_summary', label: 'PAYE Summary', description: 'PAYE withholding totals' },
  { id: 'employee_cost', label: 'Employee Cost Report', description: 'Total cost to company per employee' },
];

export function downloadReportCsv(
  reportType: PayrollReportType,
  reports: PayrollPeriodReports,
  label: string
) {
  const periodLabel = `${reports.period.start}_to_${reports.period.end}`;
  switch (reportType) {
    case 'register':
      downloadCSV(
        reports.register.map((r) => ({
          'Employee Number': r.employee_number ?? '',
          Employee: r.employee,
          Department: r.department,
          'Gross Pay': r.gross_pay.toFixed(2),
          Deductions: r.deductions.toFixed(2),
          PAYE: r.paye.toFixed(2),
          UIF: r.uif.toFixed(2),
          SDL: r.sdl.toFixed(2),
          'Employer Contributions': r.employer_contributions.toFixed(2),
          'Net Salary': r.net_salary.toFixed(2),
          'Cost to Company': r.cost_to_company.toFixed(2),
          Status: r.status,
        })),
        `payroll-register-${label || periodLabel}.csv`
      );
      break;
    case 'earnings':
      downloadCSV(
        reports.earnings.map((r) => ({ Description: r.description, Amount: r.amount.toFixed(2) })),
        `payroll-earnings-${label || periodLabel}.csv`
      );
      break;
    case 'deductions':
      downloadCSV(
        reports.deductions.map((r) => ({ Description: r.description, Amount: r.amount.toFixed(2) })),
        `payroll-deductions-${label || periodLabel}.csv`
      );
      break;
    case 'employer_contributions':
      downloadCSV(
        reports.employer_contributions.map((r) => ({ Description: r.description, Amount: r.amount.toFixed(2) })),
        `payroll-employer-contributions-${label || periodLabel}.csv`
      );
      break;
    case 'uif_summary':
      downloadCSV(
        reports.uif_summary.map((r) => ({ Description: r.description, Amount: r.amount.toFixed(2) })),
        `payroll-uif-${label || periodLabel}.csv`
      );
      break;
    case 'paye_summary':
      downloadCSV(
        reports.paye_summary.map((r) => ({ Description: r.description, Amount: r.amount.toFixed(2) })),
        `payroll-paye-${label || periodLabel}.csv`
      );
      break;
    case 'employee_cost':
      downloadCSV(
        reports.employee_cost.map((r) => ({
          Employee: r.employee,
          Department: r.department,
          'Cost to Company': r.amount.toFixed(2),
        })),
        `payroll-employee-cost-${label || periodLabel}.csv`
      );
      break;
  }
}
