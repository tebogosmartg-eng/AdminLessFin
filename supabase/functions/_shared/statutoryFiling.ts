/**
 * Server side of SARS filing: loads what a return needs from the database and builds
 * it with the shared SARS rules (sars/*.ts). Returns are built here, from finalised
 * payroll, never from figures sent by the browser.
 */

import { ageOn, birthDateFromSaId } from './payrollRulesEngine/periodEmployment.ts';
import { payslipOrdinaryHours } from './sars/eti.ts';
import { buildEmp201, type Emp201Declaration, type Emp201Employee, type Emp201Payslip } from './sars/emp201.ts';
import { isValidSaIdNumber } from './sars/sarsNumbers.ts';
import { normaliseEmployerProfile, validateEmployerProfile, type EmployerProfile } from './sars/employerProfile.ts';
import {
  buildTaxCertificate,
  reconcileEmp501,
  type CertificateEmployee,
  type CertificateEtiMonth,
  type CertificatePayslip,
  type Emp501Reconciliation,
  type ReconciliationEmp201,
  type TaxCertificate,
} from './sars/emp501.ts';
import {
  emp201DueDate,
  emp501Window,
  isOverdue,
  monthFilingState,
  monthsOfReconciliation,
  monthsOfYear,
  reconciliationPeriod,
  type Emp501Kind,
} from './sars/statutoryCalendar.ts';

const FINALIZED_RUN_STATUSES = ['finalized', 'paid'];
const PAGE_SIZE = 1000;
const PAYE_ENGINES = new Set(['paye', 'directors_paye', 'bonus_tax', 'termination_tax']);

export type FilingIssue = { severity: 'error' | 'warning'; code: string; message: string; employeeId?: string };

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

/** Finalised payslips paid between two dates, with the run each came from. */
async function loadFinalisedPayslips(admin, companyId: string, start: string, end: string) {
  const { data: runs, error } = await admin
    .from('payroll_runs')
    .select('id, status, pay_date, pay_period_start, output_metadata')
    .eq('company_id', companyId)
    .gte('pay_date', start)
    .lte('pay_date', end);
  if (error) throw error;
  const finalised = (runs ?? []).filter((r) => FINALIZED_RUN_STATUSES.includes(r.status) && r.output_metadata?.cancelled !== true);
  const notFinalised = (runs ?? []).filter((r) => !FINALIZED_RUN_STATUSES.includes(r.status));
  const runById = new Map(finalised.map((r) => [r.id, r]));
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
  return { rows, payDateByRun, runById, notFinalised, finalisedRuns: finalised };
}

async function loadMonthPayslips(admin, companyId: string, month: string) {
  const { start, end } = monthBounds(month);
  return loadFinalisedPayslips(admin, companyId, start, end);
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

// ── EMP501 ────────────────────────────────────────────────────────────────

/**
 * Medical scheme fees tax credit allowed on a payslip: the period's share of the annual
 * credit, never more than the tax it reduced (PAYE breakdown before credits and rebates).
 */
export function medicalCreditOnPayslip(snapshot: Record<string, any> | null): number {
  const engines = Array.isArray(snapshot?.engine_results) ? snapshot!.engine_results : [];
  const medical = engines.find((e) => e.engine_id === 'medical_tax_credit');
  if (!medical || medical.skip_reason || medical.skipReason) return 0;
  const annualCredit = Number(medical.breakdown?.annualCredit) || 0;
  if (annualCredit <= 0) return 0;
  const paye = engines.find((e) => e.engine_id === 'paye' || e.engine_id === 'directors_paye');
  const before = Number(paye?.breakdown?.annualTaxBeforeCredits);
  const rebate = Number(paye?.breakdown?.annualRebate) || 0;
  const usable = Number.isFinite(before) ? Math.min(annualCredit, Math.max(0, before - rebate)) : annualCredit;
  const period = snapshot?.period_employment ?? {};
  const periods = Number(period.periods_per_year) || 12;
  const fraction = Number(period.pro_rata_factor ?? 1);
  return round2((usable / periods) * (Number.isFinite(fraction) ? fraction : 1));
}

function certificatePayslip(row, run): CertificatePayslip {
  const snapshot = row.calculation_snapshot ?? {};
  const period = snapshot.period_employment ?? {};
  return {
    payslipId: row.id,
    employeeId: row.employee_id,
    month: String(run.pay_date).slice(0, 7),
    periodKey: `${run.pay_period_start ?? run.pay_date}`,
    periodsPerYear: Number(period.periods_per_year) || 12,
    periodFraction: Number(period.pro_rata_factor ?? 1),
    items: (row.payslip_items ?? []).map((i) => ({ code: i.irp5_code ?? null, amount: Number(i.amount) || 0 })),
    medicalCredit: medicalCreditOnPayslip(snapshot),
  };
}

export function certificateEmployee(e: Record<string, any>, asAt: string): CertificateEmployee {
  const dob = e.date_of_birth || birthDateFromSaId(e.id_number, asAt) || null;
  return {
    id: e.id,
    employeeNumber: e.employee_number ?? null,
    firstName: (e.first_name ?? '').trim(),
    lastName: (e.last_name ?? '').trim(),
    idNumber: e.id_number ?? null,
    passportNumber: e.passport_number ?? null,
    passportCountry: e.passport_country ?? null,
    dateOfBirth: dob,
    taxNumber: e.tax_number ?? null,
    natureOfPerson: e.nature_of_person ?? null,
    email: e.email ?? null,
    phone: e.phone ?? null,
    startDate: e.start_date ?? null,
    endDate: e.end_date ?? null,
    residential: {
      unitNumber: e.residential_unit_number ?? null,
      complex: e.residential_complex ?? null,
      streetNumber: e.residential_street_number ?? null,
      streetName: e.residential_street_name ?? null,
      suburb: e.residential_suburb ?? null,
      city: e.residential_city ?? null,
      postalCode: e.residential_postal_code ?? null,
    },
    postalSameAsResidential: e.postal_same_as_residential !== false,
    postalLines: [e.postal_address_line1, e.postal_address_line2, e.postal_address_line3].filter((l) => !!l && String(l).trim()),
    postalCode: e.postal_code ?? null,
    bankAccountType: e.bank_account_type ?? null,
    bankAccountNumber: e.bank_account_number ?? null,
    bankBranchCode: e.bank_branch_code ?? null,
    bankName: e.bank_name ?? null,
    etiEmploymentDate: e.eti_employment_date ?? null,
    etiSezCode: e.eti_sez_code ?? null,
  };
}

export async function loadPaymentsByReturn(admin, companyId: string, returnIds: string[]) {
  const totals = new Map<string, number>();
  if (!returnIds.length) return totals;
  const { data, error } = await admin
    .from('statutory_return_payments')
    .select('statutory_return_id, amount')
    .eq('company_id', companyId)
    .in('statutory_return_id', returnIds)
    .is('voided_at', null);
  if (error) throw error;
  for (const p of data ?? []) totals.set(p.statutory_return_id, round2((totals.get(p.statutory_return_id) ?? 0) + Number(p.amount)));
  return totals;
}

const monthOfPeriod = (period: string) => `${period.slice(0, 4)}-${period.slice(4, 6)}`;

function emp201Summary(ret): ReconciliationEmp201 {
  const d = ret.declaration_data ?? {};
  return {
    returnId: ret.id,
    month: monthOfPeriod(ret.period),
    version: ret.version,
    status: ret.status,
    paye: Number(d.paye) || 0,
    uif: Number(d.uif) || 0,
    sdl: Number(d.sdl) || 0,
    etiUtilised: Number(d.eti?.utilised) || 0,
    totalPayable: Number(d.totalPayable) || 0,
  };
}

export async function loadEmployerProfile(admin, companyId: string): Promise<{ profile: EmployerProfile | null; errors: string[] }> {
  const { data, error } = await admin.from('company_payroll_employer_profile').select('*').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  if (!data) return { profile: null, errors: ['Capture the employer details for SARS under Settings → Payroll first.'] };
  const profile = normaliseEmployerProfile(data);
  return { profile, errors: validateEmployerProfile(profile).map((e) => `Employer details for SARS: ${e.message}`) };
}

export async function prepareEmp501(admin, companyId: string, yearOfAssessment: number, kind: Emp501Kind): Promise<{
  certificates: TaxCertificate[];
  reconciliation: Emp501Reconciliation;
  issues: FilingIssue[];
  profile: EmployerProfile | null;
  sourceRunIds: string[];
}> {
  if (!Number.isInteger(yearOfAssessment) || yearOfAssessment < 2014 || yearOfAssessment > 2100) {
    throw new Error('Year of assessment must be a year such as 2027.');
  }
  const months = monthsOfReconciliation(yearOfAssessment, kind);
  const start = `${months[0]}-01`;
  const end = monthBounds(months[months.length - 1]).end;
  const periods = new Set(months.map((m) => m.replace('-', '')));

  const [{ rows, runById, notFinalised, finalisedRuns }, { profile, errors: profileErrors }, employeesResult, emp201s] = await Promise.all([
    loadFinalisedPayslips(admin, companyId, start, end),
    loadEmployerProfile(admin, companyId),
    admin.from('employees').select('*').eq('company_id', companyId),
    loadActiveReturns(admin, companyId, 'EMP201'),
  ]);
  if (employeesResult.error) throw employeesResult.error;
  const issues: FilingIssue[] = profileErrors.map((message) => ({ severity: 'error', code: 'EMPLOYER_PROFILE', message }));
  for (const run of notFinalised) {
    issues.push({ severity: 'warning', code: 'RUN_NOT_FINALISED', message: `A payroll run paid on ${run.pay_date} is still ${run.status} and is not included.` });
  }

  const yearEmp201s = emp201s.filter((r) => r.period && periods.has(r.period));
  const payments = await loadPaymentsByReturn(admin, companyId, yearEmp201s.map((r) => r.id));

  // ETI per employee per month, as filed on each month's EMP201.
  const etiByEmployee = new Map<string, CertificateEtiMonth[]>();
  for (const ret of yearEmp201s) {
    const month = monthOfPeriod(ret.period);
    for (const line of ret.declaration_data?.employees ?? []) {
      if (!line?.eti) continue;
      const list = etiByEmployee.get(line.employeeId) ?? [];
      list.push({
        month,
        cycle: line.eti.cycle === 1 || line.eti.cycle === 2 ? line.eti.cycle : 0,
        remunerationPaid: Number(line.eti.remunerationPaid) || 0,
        hoursReported: Number(line.eti.hoursReported) || 0,
        minimumWageHourly: Number(line.eti.minimumWageHourly) || 0,
        wagePaidHourly: Number(line.eti.wagePaidHourly) || 0,
        eti: Number(line.eti.eti) || 0,
      });
      etiByEmployee.set(line.employeeId, list);
    }
  }

  const payslipsByEmployee = new Map<string, CertificatePayslip[]>();
  for (const row of rows) {
    const list = payslipsByEmployee.get(row.employee_id) ?? [];
    list.push(certificatePayslip(row, runById.get(row.payroll_run_id)));
    payslipsByEmployee.set(row.employee_id, list);
  }
  const employeeById = new Map((employeesResult.data ?? []).map((e) => [e.id, e]));
  const certificates: TaxCertificate[] = [];
  if (profile) {
    for (const [employeeId, payslips] of payslipsByEmployee) {
      const employee = employeeById.get(employeeId);
      if (!employee) continue;
      certificates.push(buildTaxCertificate({
        yearOfAssessment,
        kind,
        employer: {
          payeReference: profile.paye_reference,
          sdlReference: profile.sdl_reference,
          uifReference: profile.uif_reference,
          sic7Code: profile.sic7_code,
          businessPhone: profile.contact_business_phone ?? profile.contact_cell_phone,
          workAddress: {
            unitNumber: profile.address_unit_number, complex: profile.address_complex,
            streetNumber: profile.address_street_number, streetName: profile.address_street_name,
            suburb: profile.address_suburb, city: profile.address_city, postalCode: profile.address_postal_code,
          },
        },
        employee: certificateEmployee(employee, end),
        payslips,
        etiMonths: (etiByEmployee.get(employeeId) ?? []).filter((m) => months.includes(m.month)),
      }));
    }
    certificates.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }

  const reconciliation = reconcileEmp501({
    yearOfAssessment,
    kind,
    certificates,
    emp201s: yearEmp201s.map(emp201Summary),
    paymentsByMonth: Object.fromEntries(yearEmp201s.map((r) => [monthOfPeriod(r.period), payments.get(r.id) ?? 0])),
    monthsWithPayroll: [...new Set(finalisedRuns.map((r) => String(r.pay_date).slice(0, 7)))],
  });
  if (!rows.length) issues.push({ severity: 'error', code: 'NO_FINALISED_PAYROLL', message: 'No finalised payroll was paid in this period.' });
  return {
    certificates,
    reconciliation,
    issues: [...issues, ...reconciliation.issues],
    profile,
    sourceRunIds: finalisedRuns.map((r) => r.id),
  };
}

// ── Workspace ─────────────────────────────────────────────────────────────

/** Today in South Africa (UTC+2, no daylight saving), YYYY-MM-DD. */
export function todayInSouthAfrica(now = new Date()): string {
  return new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
}

export async function loadStatutoryWorkspace(admin, companyId: string, yearOfAssessment: number) {
  const months = monthsOfYear(yearOfAssessment);
  const start = `${months[0]}-01`;
  const end = monthBounds(months[11]).end;
  const [runsResult, returnsResult, holidaysResult] = await Promise.all([
    admin.from('payroll_runs').select('id, status, pay_date, output_metadata').eq('company_id', companyId).gte('pay_date', start).lte('pay_date', end),
    admin.from('statutory_returns')
      .select('id, return_type, period, status, version, filed_at, filed_by, approved_at, approved_by, self_approved, submitted_at, submission_reference, declaration_data, journal_entry_id')
      .eq('company_id', companyId).in('return_type', ['EMP201', 'EMP501']).neq('status', 'superseded'),
    admin.from('compliance_public_holidays').select('holiday_date').eq('country_code', 'ZA')
      .gte('holiday_date', start).lte('holiday_date', `${yearOfAssessment}-06-30`),
  ]);
  if (runsResult.error) throw runsResult.error;
  if (returnsResult.error) throw returnsResult.error;
  if (holidaysResult.error) throw holidaysResult.error;
  const holidays = new Set((holidaysResult.data ?? []).map((h) => String(h.holiday_date)));
  const today = todayInSouthAfrica();
  const runs = runsResult.data ?? [];
  const returns = returnsResult.data ?? [];
  const payments = await loadPaymentsByReturn(admin, companyId, returns.map((r) => r.id));

  const monthRows = months.map((month) => {
    const period = month.replace('-', '');
    const monthRuns = runs.filter((r) => String(r.pay_date).startsWith(month) && r.output_metadata?.cancelled !== true);
    const finalised = monthRuns.filter((r) => FINALIZED_RUN_STATUSES.includes(r.status));
    const ret = returns.find((r) => r.return_type === 'EMP201' && r.period === period) ?? null;
    const paid = ret ? payments.get(ret.id) ?? 0 : 0;
    const totalPayable = Number(ret?.declaration_data?.totalPayable ?? 0);
    const state = monthFilingState({
      hasFinalisedPayroll: finalised.length > 0,
      filed: ret ? { approved: !!ret.approved_at, submitted: ['submitted', 'accepted'].includes(ret.status), totalPayable } : null,
      paid,
    });
    const dueDate = emp201DueDate(month, holidays);
    return {
      month,
      period,
      dueDate,
      state,
      overdue: isOverdue(state, dueDate, today),
      finalisedRuns: finalised.length,
      pendingRuns: monthRuns.length - finalised.length,
      paid,
      return: ret ? {
        id: ret.id,
        version: ret.version,
        status: ret.status,
        filedAt: ret.filed_at,
        filedBy: ret.filed_by,
        approvedAt: ret.approved_at,
        approvedBy: ret.approved_by,
        selfApproved: ret.self_approved,
        submittedAt: ret.submitted_at,
        submissionReference: ret.submission_reference,
        paye: Number(ret.declaration_data?.paye ?? 0),
        uif: Number(ret.declaration_data?.uif ?? 0),
        sdl: Number(ret.declaration_data?.sdl ?? 0),
        etiUtilised: Number(ret.declaration_data?.eti?.utilised ?? 0),
        totalPayable,
        journalEntryId: ret.journal_entry_id,
      } : null,
    };
  });

  const reconciliations = (['interim', 'annual'] as Emp501Kind[]).map((kind) => {
    const period = reconciliationPeriod(yearOfAssessment, kind);
    const ret = returns.find((r) => r.return_type === 'EMP501' && r.period === period) ?? null;
    const window = emp501Window(yearOfAssessment, kind);
    const done = !!ret && ['submitted', 'accepted'].includes(ret.status);
    return {
      kind,
      period,
      opens: window.opens,
      due: window.due,
      overdue: !done && today > window.due,
      return: ret ? {
        id: ret.id,
        version: ret.version,
        status: ret.status,
        filedAt: ret.filed_at,
        filedBy: ret.filed_by,
        approvedAt: ret.approved_at,
        approvedBy: ret.approved_by,
        submittedAt: ret.submitted_at,
        submissionReference: ret.submission_reference,
        certificateCount: Number(ret.declaration_data?.certificateCount ?? 0),
      } : null,
    };
  });

  return { yearOfAssessment, today, months: monthRows, reconciliations };
}
