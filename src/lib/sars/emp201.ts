/**
 * EMP201 monthly employer declaration, built from the finalised payslips paid in the
 * month: PAYE, SDL, UIF and the Employment Tax Incentive, with ETI brought forward,
 * used against PAYE and carried forward (SARS PAYE-GEN-01-G05 sections 11–14).
 *
 * Pure: the payroll function loads the data, this works out the declaration, so the
 * same figures can be tested without a database.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

import { calculateEtiForEmployeeMonth, type EtiEmployeeMonthResult } from './eti';
import { SIC7_NOT_QUALIFYING_FOR_ETI } from './sic7Codes';

export type Emp201Payslip = {
  payslipId: string;
  payrollRunId: string;
  employeeId: string;
  payDate: string;
  paye: number;
  uifEmployee: number;
  uifEmployer: number;
  sdl: number;
  /** Cash remuneration (gross earnings excluding non-cash benefits). */
  cashRemuneration: number;
  /** Ordinary hours paid on this payslip. */
  hours: number;
};

export type Emp201Employee = {
  id: string;
  name: string;
  employeeNumber: string | null;
  ageAtMonthEnd: number | undefined;
  hasValidSaId: boolean;
  employmentDate: string | null;
  sezCode: string | null;
  domesticWorker: boolean;
  connectedPerson: boolean;
  wageRegulatingMinimumHourly: number | null;
  /** Qualifying ETI months before this month (filed EMP201s plus months taken on). */
  priorQualifyingMonths: number;
};

export type Emp201Input = {
  /** YYYY-MM */
  month: string;
  employer: { claimEti: boolean; payeReference: string | null; sic7Code: string | null };
  payslips: Emp201Payslip[];
  employees: Emp201Employee[];
  /** ETI carried forward on the previous month's EMP201 (ignored in March and September). */
  etiBroughtForward: number;
};

export type Emp201EmployeeLine = {
  employeeId: string;
  name: string;
  employeeNumber: string | null;
  payslips: number;
  paye: number;
  uif: number;
  sdl: number;
  remuneration: number;
  hours: number;
  eti: EtiEmployeeMonthResult | null;
};

export type Emp201Declaration = {
  month: string;
  /** SARS period CCYYMM. */
  period: string;
  paye: number;
  sdl: number;
  uif: number;
  eti: {
    employerEligible: boolean;
    employerReason: string | null;
    calculated: number;
    broughtForward: number;
    available: number;
    utilised: number;
    carriedForward: number;
  };
  /** PAYE less ETI used, plus SDL and UIF: the amount to pay SARS. */
  totalPayable: number;
  employeeCount: number;
  sourcePayrollRunIds: string[];
  employees: Emp201EmployeeLine[];
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The employer can claim ETI only if it chose to, is registered for PAYE, and is not in an excluded industry. */
export function employerEtiEligibility(employer: Emp201Input['employer']): { eligible: boolean; reason: string | null } {
  if (!employer.claimEti) return { eligible: false, reason: 'The company has not switched on ETI claims.' };
  if (!employer.payeReference?.startsWith('7')) return { eligible: false, reason: 'Only employers registered for PAYE (reference starting with 7) can claim ETI.' };
  if (employer.sic7Code && SIC7_NOT_QUALIFYING_FOR_ETI.has(employer.sic7Code)) {
    return { eligible: false, reason: `SIC7 code ${employer.sic7Code} does not qualify for ETI (government).` };
  }
  return { eligible: true, reason: null };
}

/** ETI brought forward resets at the start of each reconciliation period (March and September). */
export function etiBroughtForwardFor(month: string, previousCarriedForward: number): number {
  const mm = month.slice(5, 7);
  return mm === '03' || mm === '09' ? 0 : round2(Math.max(0, previousCarriedForward));
}

export function buildEmp201(input: Emp201Input): Emp201Declaration {
  const employer = employerEtiEligibility(input.employer);
  const byEmployee = new Map<string, Emp201Payslip[]>();
  for (const p of input.payslips) {
    const list = byEmployee.get(p.employeeId) ?? [];
    list.push(p);
    byEmployee.set(p.employeeId, list);
  }
  const employeesById = new Map(input.employees.map((e) => [e.id, e]));

  const lines: Emp201EmployeeLine[] = [...byEmployee.entries()].map(([employeeId, slips]) => {
    const employee = employeesById.get(employeeId);
    const sum = (pick: (p: Emp201Payslip) => number) => round2(slips.reduce((s, p) => s + (Number(pick(p)) || 0), 0));
    const remuneration = sum((p) => p.cashRemuneration);
    const hours = Math.round(slips.reduce((s, p) => s + (Number(p.hours) || 0), 0) * 10_000) / 10_000;
    const eti = employer.eligible && employee
      ? calculateEtiForEmployeeMonth({
        month: input.month,
        ageAtMonthEnd: employee.ageAtMonthEnd,
        hasValidSaId: employee.hasValidSaId,
        employmentDate: employee.employmentDate,
        sezCode: employee.sezCode,
        domesticWorker: employee.domesticWorker,
        connectedPerson: employee.connectedPerson,
        remuneration,
        hours,
        wageRegulatingMinimumHourly: employee.wageRegulatingMinimumHourly,
        priorQualifyingMonths: employee.priorQualifyingMonths,
      })
      : null;
    return {
      employeeId,
      name: employee?.name ?? employeeId,
      employeeNumber: employee?.employeeNumber ?? null,
      payslips: slips.length,
      paye: sum((p) => p.paye),
      uif: sum((p) => p.uifEmployee + p.uifEmployer),
      sdl: sum((p) => p.sdl),
      remuneration,
      hours,
      eti,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const paye = round2(lines.reduce((s, l) => s + l.paye, 0));
  const sdl = round2(lines.reduce((s, l) => s + l.sdl, 0));
  const uif = round2(lines.reduce((s, l) => s + l.uif, 0));
  const calculated = round2(lines.reduce((s, l) => s + (l.eti?.eti ?? 0), 0));
  const broughtForward = employer.eligible ? etiBroughtForwardFor(input.month, input.etiBroughtForward) : 0;
  const available = round2(calculated + broughtForward);
  // ETI only reduces PAYE; the rest is carried forward (refunded at the end of a reconciliation period).
  const utilised = round2(Math.min(available, paye));
  const carriedForward = round2(available - utilised);

  return {
    month: input.month,
    period: input.month.replace('-', ''),
    paye,
    sdl,
    uif,
    eti: {
      employerEligible: employer.eligible,
      employerReason: employer.reason,
      calculated,
      broughtForward,
      available,
      utilised,
      carriedForward,
    },
    totalPayable: round2(paye - utilised + sdl + uif),
    employeeCount: lines.length,
    sourcePayrollRunIds: [...new Set(input.payslips.map((p) => p.payrollRunId))].sort(),
    employees: lines,
  };
}
