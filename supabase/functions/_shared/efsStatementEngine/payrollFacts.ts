// @ts-nocheck
/**
 * Payroll, summarised for the annual financial statements (ADR-0009).
 *
 * Sealed with the ledger facts when a set of statements is locked, so the notes
 * can say what the ledger cannot: employee costs by nature, the average number
 * of employees, each director's emoluments (Companies Act s30(4)–(6)) and key
 * management compensation (IFRS for SMEs s33.7 / IAS 24.17). It summarises the
 * payslips of runs in effect (finalised, not reversed) paid within each year,
 * by IRP5 code — the same dates the payroll journals are posted on, so the
 * figures meet the ledger's employee costs.
 *
 * Pure: the statements function loads the rows and calls this.
 */
import { isRunInEffect } from '../payrollRunState.ts';

export type PayrollYearFacts = {
  from: string;
  to: string;
  runs: number;
  payslips: number;
  employees: { average: number; yearEnd: number; paid: number };
  earnings: { salaries: number; overtime: number; bonuses: number; leavePay: number; commission: number; allowances: number; other: number };
  /** Taxable benefits in kind (not cash, not posted as payroll). */
  benefits: number;
  employer: { uif: number; sdl: number; other: number };
  grossPay: number;
  employerContributions: number;
  /** Gross pay and employer contributions: what payroll posted as employee costs. */
  payrollCost: number;
  directors: DirectorEmoluments[];
};

export type DirectorEmoluments = {
  employeeId: string;
  name: string;
  salary: number;
  bonuses: number;
  allowances: number;
  benefits: number;
  total: number;
};

export type PayrollFacts = { current: PayrollYearFacts | null; prior: PayrollYearFacts | null };

type Item = { type: string; irp5_code?: string | null; component_code?: string | null; description?: string | null; amount: number };
type Payslip = { employee_id: string; payroll_run_id: string; total_earnings?: number | null; items: Item[] };
type Run = { id: string; status: string; pay_date: string; output_metadata?: Record<string, unknown> | null };
type Employee = { id: string; first_name?: string | null; last_name?: string | null; employment_type?: string | null; nature_of_person?: string | null; start_date?: string | null; end_date?: string | null };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function isDirector(e: Employee | undefined): boolean {
  return !!e && (e.employment_type === 'director' || e.nature_of_person === 'C');
}

/** Which earnings heading a payslip line belongs to. */
export function earningKind(item: Item): keyof PayrollYearFacts['earnings'] {
  const code = String(item.irp5_code ?? '');
  const component = String(item.component_code ?? '');
  if (component === 'leave_payout') return 'leavePay';
  if (component === 'time_overtime' || code === '3607') return 'overtime';
  if (code === '3605' || component === 'bonus') return 'bonuses';
  if (code === '3606') return 'commission';
  if (/^37\d\d$/.test(code)) return 'allowances';
  if (code === '3601' || code === '' ) return /allowance/i.test(String(item.description ?? '')) ? 'allowances' : 'salaries';
  return 'other';
}

function employerKind(item: Item): keyof PayrollYearFacts['employer'] {
  const code = String(item.irp5_code ?? '');
  const text = String(item.description ?? '');
  if (code === '4141' || (!code && /(^|[^a-z])uif([^a-z]|$)|unemployment/i.test(text))) return 'uif';
  if (code === '4142' || (!code && /sdl|skills development/i.test(text))) return 'sdl';
  return 'other';
}

/** One year of payroll: payslips of runs in effect paid from `from` to `to`. */
export function summarisePayrollYear(
  from: string,
  to: string,
  runs: Run[],
  payslips: Payslip[],
  employees: Employee[],
): PayrollYearFacts | null {
  const inYear = runs.filter((r) => isRunInEffect(r) && r.pay_date >= from && r.pay_date <= to);
  if (!inYear.length) return null;
  const runById = new Map(inYear.map((r) => [r.id, r]));
  const slips = payslips.filter((p) => runById.has(p.payroll_run_id));
  const people = new Map(employees.map((e) => [e.id, e]));

  const earnings = { salaries: 0, overtime: 0, bonuses: 0, leavePay: 0, commission: 0, allowances: 0, other: 0 };
  const employer = { uif: 0, sdl: 0, other: 0 };
  let benefits = 0;
  const byMonth = new Map<string, Set<string>>();
  const directors = new Map<string, DirectorEmoluments>();

  for (const slip of slips) {
    const month = runById.get(slip.payroll_run_id)!.pay_date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, new Set());
    byMonth.get(month)!.add(slip.employee_id);
    const person = people.get(slip.employee_id);
    const director = isDirector(person)
      ? directors.get(slip.employee_id) ?? {
        employeeId: slip.employee_id,
        name: [person?.first_name, person?.last_name].filter(Boolean).join(' ') || 'Director',
        salary: 0, bonuses: 0, allowances: 0, benefits: 0, total: 0,
      }
      : null;
    for (const item of slip.items ?? []) {
      const amount = num(item.amount);
      if (item.type === 'earning') {
        const kind = earningKind(item);
        earnings[kind] += amount;
        if (director) {
          if (kind === 'bonuses') director.bonuses += amount;
          else if (kind === 'allowances') director.allowances += amount;
          else director.salary += amount;
        }
      } else if (item.type === 'taxable_benefit') {
        benefits += amount;
        if (director) director.benefits += amount;
      } else if (item.type === 'employer_contribution') {
        employer[employerKind(item)] += amount;
      }
    }
    if (director) directors.set(slip.employee_id, director);
  }

  for (const k of Object.keys(earnings)) earnings[k] = round2(earnings[k]);
  for (const k of Object.keys(employer)) employer[k] = round2(employer[k]);
  const grossPay = round2(Object.values(earnings).reduce((s, v) => s + v, 0));
  const employerContributions = round2(employer.uif + employer.sdl + employer.other);
  const paid = new Set(slips.map((s) => s.employee_id));
  const months = [...byMonth.values()];
  const yearEnd = [...paid].filter((id) => {
    const e = people.get(id);
    return !e?.end_date || e.end_date >= to;
  }).length;

  return {
    from,
    to,
    runs: inYear.length,
    payslips: slips.length,
    employees: {
      // The average over the months payroll was run in.
      average: months.length ? Math.round(months.reduce((s, m) => s + m.size, 0) / months.length) : 0,
      yearEnd,
      paid: paid.size,
    },
    earnings,
    benefits: round2(benefits),
    employer,
    grossPay,
    employerContributions,
    payrollCost: round2(grossPay + employerContributions),
    directors: [...directors.values()]
      .map((d) => ({
        ...d,
        salary: round2(d.salary), bonuses: round2(d.bonuses), allowances: round2(d.allowances), benefits: round2(d.benefits),
        total: round2(d.salary + d.bonuses + d.allowances + d.benefits),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function summarisePayroll(
  period: { start_date?: string; end_date?: string; prior_start_date?: string; prior_as_of?: string } | null | undefined,
  runs: Run[],
  payslips: Payslip[],
  employees: Employee[],
): PayrollFacts {
  const current = period?.start_date && period?.end_date
    ? summarisePayrollYear(period.start_date, period.end_date, runs, payslips, employees)
    : null;
  const prior = period?.prior_start_date && period?.prior_as_of
    ? summarisePayrollYear(period.prior_start_date, period.prior_as_of, runs, payslips, employees)
    : null;
  return { current, prior };
}
