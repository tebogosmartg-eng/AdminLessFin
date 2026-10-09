/**
 * Server side of SARS filing: loads what a return needs from the database and builds
 * it with the shared SARS rules (sars/*.ts). Returns are built here, from finalised
 * payroll, never from figures sent by the browser.
 */

import { ageOn, birthDateFromSaId } from './payrollRulesEngine/periodEmployment.ts';
import { payslipOrdinaryHours } from './sars/eti.ts';
import { buildEmp201, type Emp201Declaration, type Emp201Employee, type Emp201Payslip } from './sars/emp201.ts';
import { isValidSaIdNumber } from './sars/sarsNumbers.ts';
import { normaliseEmployerProfile, validateEmployerProfile } from './sars/employerProfile.ts';

const FINALIZED_RUN_STATUSES = ['finalized', 'paid'];
const PAGE_SIZE = 1000;
const PAYE_ENGINES = new Set(['paye', 'directors_paye', 'bonus_tax', 'termination_tax']);

export type FilingIssue = { severity: 'error' | 'warning'; code: string; message: string };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function monthBounds(month: string): { start: string; end: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Month must be YYYY-MM.');
  const [y, m] = month.split('-').map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start: `${month}-01`, end };
}

export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** SARS tax year label for a month, e.g. 2026-11 → "2026-2027" (the year runs March to February). */
export function taxYearLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const start = m >= 3 ? y : y - 1;
  return `${start}-${start + 1}`;
}

/** Amounts on one payslip that the EMP201 needs. */
export function emp201AmountsFromPayslip(row: {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  total_earnings: number;
  calculation_snapshot: Record<string, any> | null;
  payslip_items?: Array<{ type: string; amount: number; irp5_code: string | null }>;
}, payDate: string, currentHoursPerWeek: number | null): Emp201Payslip {
  const snapshot = row.calculation_snapshot ?? {};
  const engines = Array.isArray(snapshot.engine_results) ? snapshot.engine_results : [];
  const engine = (id: string, side: 'employee_amount' | 'employer_amount') =>
    engines.filter((e) => e.engine_id === id && !e.skipped).reduce((s, e) => s + (Number(e[side]) || 0), 0);
  const codedPaye = (row.payslip_items ?? []).filter((i) => i.irp5_code === '4102');
  const paye = codedPaye.length
    ? codedPaye.reduce((s, i) => s + Number(i.amount), 0)
    : engines.filter((e) => PAYE_ENGINES.has(e.engine_id) && !e.skipped).reduce((s, e) => s + (Number(e.employee_amount) || 0), 0);
  const period = snapshot.period_employment ?? {};
  const hours = typeof period.ordinary_hours === 'number'
    ? period.ordinary_hours
    : payslipOrdinaryHours(currentHoursPerWeek, Number(period.periods_per_year) || 12, Number(period.pro_rata_factor ?? 1));
  return {
    payslipId: row.id,
    payrollRunId: row.payroll_run_id,
    employeeId: row.employee_id,
    payDate,
    paye: round2(paye),
    uifEmployee: round2(engine('uif', 'employee_amount')),
    uifEmployer: round2(engine('uif_employer', 'employer_amount')),
    sdl: round2(engine('sdl', 'employer_amount')),
    cashRemuneration: round2(Number(snapshot.gross_earnings ?? row.total_earnings) || 0),
    hours,
  };
}

async function loadMonthPayslips(admin, companyId: string, month: string) {
  const { start, end } = monthBounds(month);
  const { data: runs, error } = await admin
    .from('payroll_runs')
    .select('id, status, pay_date, output_metadata')
    .eq('company_id', companyId)
    .gte('pay_date', start)
    .lte('pay_date', end);
  if (error) throw error;
  const finalised = (runs ?? []).filter((r) => FINALIZED_RUN_STATUSES.includes(r.status) && r.output_metadata?.cancelled !== true);
  const notFinalised = (runs ?? []).filter((r) => !FINALIZED_RUN_STATUSES.includes(r.status));
  const payDateByRun = new Map(finalised.map((r) => [r.id, r.pay_date]));
  const rows = [];
  if (finalised.length) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error: pageError } = await admin
        .from('payslips')
        .select('id, payroll_run_id, employee_id, total_earnings, calculation_snapshot, payslip_items(type, amount, irp5_code)')
        .eq('company_id', companyId)
        .in('payroll_run_id', finalised.map((r) => r.id))
        .order('id')
        .range(from, from + PAGE_SIZE - 1);
      if (pageError) throw pageError;
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE_SIZE) break;
    }
  }
  return { rows, payDateByRun, notFinalised };
}

/** Active (not superseded) filed returns of a type, oldest first. */
export async function loadActiveReturns(admin, companyId: string, returnType: string) {
  const { data, error } = await admin
    .from('statutory_returns')
    .select('id, period, status, version, declaration_data, filed_at, submission_reference')
    .eq('company_id', companyId)
    .eq('return_type', returnType)
    .neq('status', 'superseded')
    .order('period');
  if (error) throw error;
  return data ?? [];
}

export async function prepareEmp201(admin, companyId: string, month: string): Promise<{
  declaration: Emp201Declaration;
  issues: FilingIssue[];
  taxYear: string;
}> {
  const { end } = monthBounds(month);
  const period = month.replace('-', '');
  const issues: FilingIssue[] = [];

  const [{ rows, payDateByRun, notFinalised }, profileResult, employeesResult, filed] = await Promise.all([
    loadMonthPayslips(admin, companyId, month),
    admin.from('company_payroll_employer_profile').select('*').eq('company_id', companyId).maybeSingle(),
    admin.from('employees').select('*').eq('company_id', companyId),
    loadActiveReturns(admin, companyId, 'EMP201'),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (employeesResult.error) throw employeesResult.error;

  const profile = profileResult.data;
  if (!profile) {
    issues.push({ severity: 'error', code: 'EMPLOYER_PROFILE_MISSING', message: 'Capture the employer details for SARS under Settings → Payroll first.' });
  } else {
    const profileErrors = validateEmployerProfile(normaliseEmployerProfile(profile));
    if (profileErrors.length) {
      issues.push({ severity: 'error', code: 'EMPLOYER_PROFILE_INVALID', message: `Employer details for SARS: ${profileErrors[0].message}` });
    }
  }
  if (!rows.length) {
    issues.push({ severity: 'error', code: 'NO_FINALISED_PAYROLL', message: `No finalised payroll was paid in ${month}.` });
  }
  for (const run of notFinalised) {
    issues.push({ severity: 'warning', code: 'RUN_NOT_FINALISED', message: `A payroll run paid on ${run.pay_date} is still ${run.status} and is not included.` });
  }

  const employees = employeesResult.data ?? [];
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const payslips = rows.map((row) =>
    emp201AmountsFromPayslip(row, payDateByRun.get(row.payroll_run_id) ?? end, employeeById.get(row.employee_id)?.ordinary_hours_per_week ?? null)
  );

  // Qualifying ETI months already used: earlier filed EMP201s plus months taken on.
  const priorEarlier = filed.filter((r) => r.period && r.period < period);
  const priorMonths = new Map<string, number>();
  for (const ret of priorEarlier) {
    for (const line of ret.declaration_data?.employees ?? []) {
      if (line?.eti?.cycle === 1 || line?.eti?.cycle === 2) {
        priorMonths.set(line.employeeId, (priorMonths.get(line.employeeId) ?? 0) + 1);
      }
    }
  }

  const prevPeriod = previousMonth(month).replace('-', '');
  const previous = filed.find((r) => r.period === prevPeriod);
  const mm = month.slice(5, 7);
  if (!previous && mm !== '03' && mm !== '09' && priorEarlier.length) {
    issues.push({ severity: 'warning', code: 'PREVIOUS_MONTH_NOT_FILED', message: `The EMP201 for ${previousMonth(month)} is not filed here, so no ETI is brought forward from it.` });
  }

  const paidIds = [...new Set(payslips.map((p) => p.employeeId))];
  const emp201Employees: Emp201Employee[] = paidIds.map((id) => {
    const e = employeeById.get(id) ?? {};
    const dob = e.date_of_birth || birthDateFromSaId(e.id_number, end);
    return {
      id,
      name: [e.first_name, e.last_name].filter(Boolean).join(' ') || id,
      employeeNumber: e.employee_number ?? null,
      ageAtMonthEnd: dob ? ageOn(dob, end) : undefined,
      hasValidSaId: isValidSaIdNumber(e.id_number),
      employmentDate: e.eti_employment_date ?? e.start_date ?? null,
      sezCode: e.eti_sez_code ?? null,
      domesticWorker: e.eti_domestic_worker === true,
      connectedPerson: e.eti_connected_person === true,
      wageRegulatingMinimumHourly: e.wage_regulating_minimum_hourly == null ? null : Number(e.wage_regulating_minimum_hourly),
      priorQualifyingMonths: (Number(e.eti_prior_qualifying_months) || 0) + (priorMonths.get(id) ?? 0),
    };
  });

  const declaration = buildEmp201({
    month,
    employer: {
      claimEti: profile?.claim_eti === true,
      payeReference: profile?.paye_reference ?? null,
      sic7Code: profile?.sic7_code ?? null,
    },
    payslips,
    employees: emp201Employees,
    etiBroughtForward: Number(previous?.declaration_data?.eti?.carriedForward ?? 0),
  });

  if (declaration.eti.employerEligible) {
    const missingHours = declaration.employees.filter((l) => l.eti && /No hours captured/.test(l.eti.reason ?? ''));
    for (const line of missingHours) {
      issues.push({ severity: 'warning', code: 'ETI_HOURS_MISSING', message: `${line.name}: set ordinary hours per week on the employee to check ETI.` });
    }
  }

  const taxYear = rows.find((r) => typeof r.calculation_snapshot?.tax_year === 'string')?.calculation_snapshot?.tax_year ?? taxYearLabel(month);
  return { declaration, issues, taxYear };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
