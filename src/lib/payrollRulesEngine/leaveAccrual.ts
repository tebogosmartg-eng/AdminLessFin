/**
 * The leave pay accrual at a date (ADR-0009): what the company would pay its
 * employees for the annual leave they have earned and not yet taken —
 * IFRS for SMEs s28.6 / IAS 19.13, accumulating compensated absences.
 *
 * Each employee employed on the date: their annual leave balance (the BCEA
 * register, never below nil) × their daily rate. A salaried employee's day is
 * the weekly wage ÷ working days; a daily-paid employee's is their day rate; an
 * hourly-paid employee's is their hourly rate × their hours a day. The accrual
 * is offered as a journal for the user to accept, never posted on its own.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */
import { dailyRate, leaveBalance, type LeaveEntry } from './leave';
import { hoursPerDay, payBasisOf } from './timePay';

export type AccrualEmployee = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  employee_number?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  work_days_per_week?: number | null;
  annual_leave_days_per_cycle?: number | null;
  salary_amount?: number | null;
  salary_period?: string | null;
  pay_basis?: string | null;
  pay_rate?: number | null;
  ordinary_hours_per_week?: number | null;
};

export type AccrualLine = {
  employeeId: string;
  name: string;
  employeeNumber: string | null;
  days: number;
  dailyRate: number;
  amount: number;
};

export type LeaveAccrual = {
  asOf: string;
  lines: AccrualLine[];
  total: number;
  /** Employees with leave owing but no rate to value it at. */
  unvalued: string[];
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The day an employee's leave is paid at. */
export function leaveDayRate(e: AccrualEmployee): number {
  const basis = payBasisOf(e);
  if (basis === 'daily') return round2(Number(e.pay_rate) || 0);
  if (basis === 'hourly') return round2((Number(e.pay_rate) || 0) * hoursPerDay(e));
  return dailyRate(Number(e.salary_amount) || 0, e.salary_period, e.work_days_per_week == null ? null : Number(e.work_days_per_week));
}

/** `entriesFor(employeeId)` returns that employee's annual leave register entries. */
export function leaveAccrual(asOf: string, employees: AccrualEmployee[], entriesFor: (employeeId: string) => LeaveEntry[]): LeaveAccrual {
  const lines: AccrualLine[] = [];
  const unvalued: string[] = [];
  for (const e of employees) {
    if (!e.start_date || e.start_date > asOf || (e.end_date && e.end_date < asOf)) continue;
    const balance = leaveBalance('bcea_annual', {
      startDate: e.start_date,
      endDate: e.end_date ?? null,
      workDaysPerWeek: e.work_days_per_week == null ? null : Number(e.work_days_per_week),
      annualLeaveDaysPerCycle: e.annual_leave_days_per_cycle == null ? null : Number(e.annual_leave_days_per_cycle),
    }, entriesFor(e.id), asOf).balance;
    const days = round2(Math.max(0, balance));
    if (days <= 0) continue;
    const name = [e.first_name, e.last_name].filter(Boolean).join(' ') || e.id;
    const rate = leaveDayRate(e);
    if (rate <= 0) {
      unvalued.push(name);
      continue;
    }
    lines.push({ employeeId: e.id, name, employeeNumber: e.employee_number ?? null, days, dailyRate: rate, amount: round2(days * rate) });
  }
  lines.sort((a, b) => a.name.localeCompare(b.name));
  return { asOf, lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)), unvalued };
}
