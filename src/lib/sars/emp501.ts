/**
 * EMP501 employer reconciliation: IRP5 / IT3(a) certificates built from finalised payroll
 * and the reconciliation of what the certificates show against what was declared on the
 * EMP201s and what was paid to SARS. Rules from SARS_PAYE_BRS - PAYE Employer
 * Reconciliation V25.3.0 (codes, consolidation, gross totals, IRP5 vs IT3(a), ETI blocks).
 *
 * Pure: the payroll function loads the data and stores the result.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

import { isValidIncomeTaxNumber, isValidSaIdNumber, isValidSarsPhone } from './sarsNumbers';
import { nationalMinimumWageHourly } from './eti';
import { passportCountryCode } from './countryCodes';
import { SIC7_NOT_QUALIFYING_FOR_ETI } from './sic7Codes';
import {
  monthsOfReconciliation,
  reconciliationPeriod,
  type Emp501Kind,
} from './statutoryCalendar';

export type FilingIssue = { severity: 'error' | 'warning'; code: string; message: string; employeeId?: string };

export type CertificateAddress = {
  unitNumber: string | null;
  complex: string | null;
  streetNumber: string | null;
  streetName: string | null;
  suburb: string | null;
  city: string | null;
  postalCode: string | null;
};

export type CertificateEmployee = {
  id: string;
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
  idNumber: string | null;
  passportNumber: string | null;
  /** 2-letter country that issued the passport. */
  passportCountry: string | null;
  dateOfBirth: string | null;
  taxNumber: string | null;
  /** A, B or C as captured; null = worked out from the record. */
  natureOfPerson: string | null;
  email: string | null;
  phone: string | null;
  startDate: string | null;
  endDate: string | null;
  residential: CertificateAddress;
  postalSameAsResidential: boolean;
  postalLines: string[];
  postalCode: string | null;
  bankAccountType: string | null;
  bankAccountNumber: string | null;
  bankBranchCode: string | null;
  bankName: string | null;
  etiEmploymentDate: string | null;
  etiSezCode: string | null;
};

export type CertificatePayslip = {
  payslipId: string;
  employeeId: string;
  /** Month the payslip was paid in (YYYY-MM). */
  month: string;
  /** Identifies the pay period, so a second run in the same period is not counted twice. */
  periodKey: string;
  periodsPerYear: number;
  /** Share of the pay period worked (1 = full period). */
  periodFraction: number;
  items: Array<{ code: string | null; amount: number }>;
  /** Medical scheme fees tax credit allowed on this payslip. */
  medicalCredit: number;
};

/** One month of ETI for an employee, as filed on that month's EMP201. */
export type CertificateEtiMonth = {
  month: string;
  cycle: 0 | 1 | 2;
  remunerationPaid: number;
  hoursReported: number;
  minimumWageHourly: number;
  wagePaidHourly: number;
  eti: number;
};

export type CertificateEmployer = {
  payeReference: string;
  sdlReference: string | null;
  uifReference: string | null;
  sic7Code: string;
  /** Employer's business telephone, used when the employee has no work number. */
  businessPhone: string | null;
  workAddress: CertificateAddress;
};

export type CodeAmount = { code: string; amount: number };

export type TaxCertificate = {
  employeeId: string;
  employeeName: string;
  employeeNumber: string | null;
  certificateType: 'IRP5' | 'IT3A';
  /** BRS 4150, IT3(a) only. */
  reasonCode: string | null;
  natureOfPerson: 'A' | 'B';
  yearOfAssessment: number;
  /** BRS 2031: CCYY08 interim, CCYY02 annual. */
  period: string;
  periodStart: string;
  periodEnd: string;
  payPeriodsInYear: number;
  payPeriodsWorked: number;
  /** Income codes in whole rand (cents dropped), consolidated to main codes. */
  income: CodeAmount[];
  /** BRS 3696 gross non-taxable and 3699 gross taxable income. */
  grossNonTaxable: number;
  grossTaxable: number;
  /** Deduction and contribution codes in whole rand. */
  deductions: CodeAmount[];
  /** BRS 4497: sum of the deduction codes, or null when there are none. */
  totalDeductions: number | null;
  tax: {
    paye: number;
    uif: number | null;
    sdl: number | null;
    total: number;
    medicalCredit: number | null;
    eti: number | null;
  };
  eti: {
    indicator: 'Y' | 'N' | null;
    employmentDate: string | null;
    sezCode: string | null;
    months: CertificateEtiMonth[];
  };
  /** Per month PAYE, UIF and SDL on the certificate, for the reconciliation. */
  monthly: Record<string, { paye: number; uif: number; sdl: number }>;
  employee: CertificateEmployee;
  issues: FilingIssue[];
};

/** Sub-codes and retired codes folded into their main code (BRS section 5). */
const CONSOLIDATE: Record<string, string> = {
  '3615': '3601',
  '3604': '3602', '3609': '3602', '3612': '3602',
  '3706': '3713', '3710': '3713', '3711': '3713', '3712': '3713',
  '3705': '3714', '3709': '3714', '3716': '3714',
  '3803': '3801', '3804': '3801', '3807': '3801',
  '4004': '4003',
};

/** Income codes counted in 3696 (gross non-taxable income). */
const NON_TAXABLE_INCOME = new Set([
  '3602', '3652', '3703', '3753', '3714', '3764', '3815', '3865', '3821', '3871',
  '3822', '3872', '3830', '3880', '3832', '3882', '3834', '3884', '3908',
]);
const LONG_SERVICE_CODES = ['3622', '3672', '3835', '3885'];

const TAX_CODES = new Set(['4101', '4102', '4115', '4116', '4118', '4120', '4141', '4142', '4149']);
const isIncomeCode = (code: string) => /^3[6-9]\d\d$/.test(code) && !['3696', '3697', '3698', '3699'].includes(code);
const isDeductionCode = (code: string) => /^4(0\d\d|4\d\d|5\d\d)$/.test(code) && code !== '4497';

const ACCOUNT_TYPE: Record<string, number> = {
  current: 1, savings: 2, transmission: 3, bond: 4, credit_card: 5, subscription_share: 6, foreign: 7,
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const text = (v: string | null | undefined) => (v ?? '').trim();

/** BRS 3240: 0 when the employee is not paid by electronic transfer. */
export function sarsAccountType(employee: Pick<CertificateEmployee, 'bankAccountType' | 'bankAccountNumber'>): number {
  if (!text(employee.bankAccountNumber)) return 0;
  return ACCOUNT_TYPE[text(employee.bankAccountType)] ?? 0;
}

/** BRS 3020 for the people this payroll pays: A with an ID or passport, otherwise B. C is not valid from 2020. */
export function natureOfPersonFor(employee: Pick<CertificateEmployee, 'idNumber' | 'passportNumber' | 'natureOfPerson'>): 'A' | 'B' {
  if (employee.natureOfPerson === 'B') return 'B';
  if (isValidSaIdNumber(employee.idNumber) || text(employee.passportNumber)) return 'A';
  return 'B';
}

function yoaStart(yoa: number) {
  return `${yoa - 1}-03-01`;
}

function periodEndDate(yoa: number, kind: Emp501Kind) {
  if (kind === 'interim') return `${yoa - 1}-08-31`;
  const leap = (yoa % 4 === 0 && yoa % 100 !== 0) || yoa % 400 === 0;
  return `${yoa}-02-${leap ? 29 : 28}`;
}

/** The long-service award exemption threshold (3622/3835) for a year of assessment. */
function longServiceThreshold(yoa: number) {
  return yoa >= 2027 ? 16_000 : 5_000;
}

export type BuildCertificateInput = {
  yearOfAssessment: number;
  kind: Emp501Kind;
  employer: CertificateEmployer;
  employee: CertificateEmployee;
  payslips: CertificatePayslip[];
  etiMonths: CertificateEtiMonth[];
};

export function buildTaxCertificate(input: BuildCertificateInput): TaxCertificate {
  const { yearOfAssessment: yoa, kind, employer, employee, payslips } = input;
  const issues: FilingIssue[] = [];
  const name = [employee.firstName, employee.lastName].filter(Boolean).join(' ') || employee.id;
  const issue = (severity: FilingIssue['severity'], code: string, message: string) =>
    issues.push({ severity, code, message: `${name}: ${message}`, employeeId: employee.id });

  // ── Totals per code, consolidated ──
  const totals = new Map<string, number>();
  const monthly: TaxCertificate['monthly'] = {};
  let medicalCredit = 0;
  for (const p of payslips) {
    const m = (monthly[p.month] ??= { paye: 0, uif: 0, sdl: 0 });
    for (const item of p.items) {
      if (!item.code) continue;
      const code = CONSOLIDATE[item.code] ?? item.code;
      const amount = Number(item.amount) || 0;
      totals.set(code, round2((totals.get(code) ?? 0) + amount));
      if (code === '4102') m.paye = round2(m.paye + amount);
      if (code === '4141') m.uif = round2(m.uif + amount);
      if (code === '4142') m.sdl = round2(m.sdl + amount);
    }
    medicalCredit = round2(medicalCredit + (Number(p.medicalCredit) || 0));
  }
  // Employer medical aid (3810) is deemed paid by the employee: it is in 4005 too, and 4474 equals it.
  const employerMedical = totals.get('3810') ?? 0;
  if (employerMedical > 0) {
    totals.set('4474', employerMedical);
    totals.set('4005', round2((totals.get('4005') ?? 0) + employerMedical));
  }

  // ── Income: whole rand, never negative ──
  const income: CodeAmount[] = [];
  for (const [code, amount] of [...totals.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!isIncomeCode(code)) continue;
    if (amount < 0) issue('error', 'NEGATIVE_AMOUNT', `code ${code} totals R${amount.toFixed(2)}; SARS does not accept negative amounts. Correct the payroll.`);
    const rands = Math.floor(Math.max(0, amount));
    if (rands > 0) income.push({ code, amount: rands });
  }
  if (income.length > 20) issue('error', 'TOO_MANY_INCOME_CODES', 'more than 20 income codes on one certificate.');
  const longService = LONG_SERVICE_CODES.reduce((s, c) => s + (income.find((i) => i.code === c)?.amount ?? 0), 0);
  const longServiceExempt = longService > 0 && longService <= longServiceThreshold(yoa);
  const grossNonTaxable = income
    .filter((i) => NON_TAXABLE_INCOME.has(i.code) || (longServiceExempt && LONG_SERVICE_CODES.includes(i.code)))
    .reduce((s, i) => s + i.amount, 0);
  const grossTaxable = income.reduce((s, i) => s + i.amount, 0) - grossNonTaxable;

  // ── Deductions: whole rand ──
  const deductions: CodeAmount[] = [];
  for (const [code, amount] of [...totals.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!isDeductionCode(code) || TAX_CODES.has(code)) continue;
    const rands = Math.floor(Math.max(0, amount));
    if (rands > 0) deductions.push({ code, amount: rands });
  }
  if (deductions.length > 12) issue('error', 'TOO_MANY_DEDUCTION_CODES', 'more than 12 deduction codes on one certificate.');
  const totalDeductions = deductions.length ? deductions.reduce((s, d) => s + d.amount, 0) : null;

  // ── Tax ──
  const paye = round2(Math.max(0, totals.get('4102') ?? 0));
  const certificateType: 'IRP5' | 'IT3A' = paye > 0 ? 'IRP5' : 'IT3A';
  const uif = employer.uifReference ? round2(Math.max(0, totals.get('4141') ?? 0)) : null;
  const sdl = employer.sdlReference ? round2(Math.max(0, totals.get('4142') ?? 0)) : null;
  const hasMedicalFees = deductions.some((d) => d.code === '4005');
  const credit = hasMedicalFees ? round2(medicalCredit) : null;
  const reasonCode = certificateType === 'IRP5' ? null : credit && credit > 0 ? '08' : '02';
  if (!employer.uifReference && (totals.get('4141') ?? 0) > 0) {
    issue('error', 'UIF_REFERENCE_MISSING', 'UIF was deducted but the employer has no UIF reference number.');
  }
  if (!employer.sdlReference && (totals.get('4142') ?? 0) > 0) {
    issue('error', 'SDL_REFERENCE_MISSING', 'SDL was paid but the employer has no SDL reference number.');
  }
  if (certificateType === 'IRP5' && !String(employer.payeReference).startsWith('7')) {
    issue('error', 'PAYE_NOT_REGISTERED', 'PAYE was deducted, so the employer must have a PAYE reference starting with 7.');
  }
  if (paye > grossTaxable) issue('error', 'PAYE_EXCEEDS_INCOME', `PAYE (R${paye.toFixed(2)}) is more than the taxable income (R${grossTaxable}).`);

  // ── ETI ──
  const periodMonths = monthsOfReconciliation(yoa, kind);
  const nature = natureOfPersonFor(employee);
  const employmentDate = employee.etiEmploymentDate ?? employee.startDate;
  const filedMonths = new Map(input.etiMonths.map((m) => [m.month, m]));
  const anyQualifying = input.etiMonths.some((m) => m.cycle === 1 || m.cycle === 2);
  // BRS 3026: omitted for employers whose industry cannot claim ETI (Appendix D), otherwise Y or N.
  const indicator: 'Y' | 'N' | null = SIC7_NOT_QUALIFYING_FOR_ETI.has(employer.sic7Code) ? null : anyQualifying ? 'Y' : 'N';
  const etiMonths: CertificateEtiMonth[] = indicator === 'Y'
    ? periodMonths.map((month) => filedMonths.get(month) ?? {
      month, cycle: 0, remunerationPaid: 0, hoursReported: 0, wagePaidHourly: 0, eti: 0,
      minimumWageHourly: nationalMinimumWageHourly(month) ?? 0,
    })
    : [];
  const eti = indicator === 'Y' ? round2(etiMonths.reduce((s, m) => s + m.eti, 0)) : null;
  if (eti !== null && yoa >= 2027 && eti > 0.75 * grossTaxable) {
    issue('error', 'ETI_ABOVE_75_PERCENT', `ETI (R${eti.toFixed(2)}) is more than 75% of taxable income (R${grossTaxable}), which SARS rejects from 2027.`);
  }

  // ── Dates and pay periods ──
  const start = [yoaStart(yoa), employee.startDate ?? ''].sort().at(-1)!;
  const periodEnd = periodEndDate(yoa, kind);
  const end = employee.endDate && employee.endDate < periodEnd ? employee.endDate : periodEnd;
  if (indicator === 'Y' && employmentDate && employmentDate > start) {
    issue('error', 'ETI_DATE_AFTER_START', 'the ETI employment date is after the certificate start date.');
  }
  const payPeriodsInYear = payslips.length ? Math.max(...payslips.map((p) => p.periodsPerYear || 12)) : 12;
  const fractionByPeriod = new Map<string, number>();
  for (const p of payslips) {
    fractionByPeriod.set(p.periodKey, Math.max(fractionByPeriod.get(p.periodKey) ?? 0, Math.min(1, Number(p.periodFraction) || 0)));
  }
  const payPeriodsWorked = Math.min(
    payPeriodsInYear,
    Math.round([...fractionByPeriod.values()].reduce((s, f) => s + f, 0) * 10_000) / 10_000,
  );

  // ── Employee details SARS requires ──
  if (!income.length) issue('error', 'NO_INCOME', 'no income on the certificate.');
  if (!text(employee.lastName) || /\d/.test(employee.lastName)) issue('error', 'SURNAME_INVALID', 'surname is required and may not contain digits.');
  if (!text(employee.firstName) || /\d/.test(employee.firstName)) issue('error', 'FIRST_NAMES_INVALID', 'first names are required and may not contain digits.');
  if (nature === 'A' && !isValidSaIdNumber(employee.idNumber) && !text(employee.passportNumber)) {
    issue('error', 'IDENTITY_MISSING', 'a valid SA ID number or a passport number is required.');
  }
  if (text(employee.passportNumber) && (text(employee.passportNumber).length < 6 || /\s/.test(text(employee.passportNumber)))) {
    issue('error', 'PASSPORT_INVALID', 'the passport number must be at least 6 characters without spaces.');
  }
  if (!employee.dateOfBirth) issue('error', 'DATE_OF_BIRTH_MISSING', 'date of birth is required (capture it or a valid SA ID number).');
  const taxRequired = certificateType === 'IRP5' || reasonCode !== '02';
  if (taxRequired && !isValidIncomeTaxNumber(employee.taxNumber)) {
    issue('error', 'TAX_NUMBER_REQUIRED', 'a valid income tax reference number is required on this certificate.');
  } else if (text(employee.taxNumber) && !isValidIncomeTaxNumber(employee.taxNumber)) {
    issue('error', 'TAX_NUMBER_INVALID', 'the income tax reference number fails the SARS check digit.');
  }
  if (nature === 'B' && employee.natureOfPerson !== 'B') {
    issue('warning', 'NO_IDENTITY_NATURE_B', 'no SA ID or passport number is captured, so the certificate reports a person without either (nature B).');
  }
  if (nature === 'B' && !text(employee.employeeNumber)) issue('error', 'EMPLOYEE_NUMBER_REQUIRED', 'an employee number is required for a person without an ID or passport.');
  const r = employee.residential;
  if (!text(r.streetName)) issue('error', 'RESIDENTIAL_ADDRESS_MISSING', 'the residential street or farm name is required.');
  if (!text(r.suburb) && !text(r.city)) issue('error', 'RESIDENTIAL_ADDRESS_MISSING', 'the residential suburb or city is required.');
  if (!/^\d{4}$/.test(text(r.postalCode)) || text(r.postalCode) === '0000') issue('error', 'RESIDENTIAL_POSTAL_CODE', 'the residential postal code must be 4 digits.');
  if (!employee.postalSameAsResidential && !text(employee.postalLines[0])) issue('error', 'POSTAL_ADDRESS_MISSING', 'the postal address is required (or mark it the same as the residential address).');
  const workPhone = text(employee.phone).replace(/[\s()-]/g, '') || text(employer.businessPhone);
  if (!isValidSarsPhone(workPhone)) issue('error', 'BUSINESS_PHONE_MISSING', 'a business telephone number (10+ digits, starting with 0) is required.');
  const accountType = sarsAccountType(employee);
  if (accountType !== 0 && accountType !== 7) {
    if (!/^\d{1,16}$/.test(text(employee.bankAccountNumber))) issue('error', 'BANK_ACCOUNT_INVALID', 'the bank account number must be digits only (up to 16).');
    if (!/^\d{6}$/.test(text(employee.bankBranchCode))) issue('error', 'BRANCH_CODE_INVALID', 'the branch code must be 6 digits.');
  }
  if (text(employee.bankAccountNumber) && accountType === 0) {
    issue('warning', 'BANK_ACCOUNT_TYPE_MISSING', 'the bank account type is not captured, so the certificate says "not paid by electronic transfer".');
  }
  if (employee.passportNumber && !employee.passportCountry) issue('error', 'PASSPORT_COUNTRY_MISSING', 'the passport country is required.');
  if (passportCountryCode(employee.passportCountry) === 'ZNC' && employee.passportCountry) {
    issue('warning', 'PASSPORT_COUNTRY_UNKNOWN', `passport country ${employee.passportCountry} is not on the SARS list; reported as "any other country".`);
  }

  return {
    employeeId: employee.id,
    employeeName: name,
    employeeNumber: employee.employeeNumber,
    certificateType,
    reasonCode,
    natureOfPerson: nature,
    yearOfAssessment: yoa,
    period: reconciliationPeriod(yoa, kind),
    periodStart: start,
    periodEnd: end,
    payPeriodsInYear,
    payPeriodsWorked,
    income,
    grossNonTaxable,
    grossTaxable,
    deductions,
    totalDeductions,
    tax: {
      paye,
      uif,
      sdl,
      total: round2(paye + (uif ?? 0) + (sdl ?? 0)),
      medicalCredit: credit,
      eti,
    },
    eti: { indicator, employmentDate: indicator === 'Y' ? employmentDate : null, sezCode: employee.etiSezCode, months: etiMonths },
    monthly,
    employee,
    issues,
  };
}

// ── Reconciliation ─────────────────────────────────────────────────────────

export type ReconciliationEmp201 = {
  returnId: string;
  month: string;
  version: number;
  status: string;
  paye: number;
  uif: number;
  sdl: number;
  etiUtilised: number;
  totalPayable: number;
};

export type ReconciliationMonth = {
  month: string;
  hasPayroll: boolean;
  declared: ReconciliationEmp201 | null;
  certificates: { paye: number; uif: number; sdl: number };
  paid: number;
  differences: { paye: number; uif: number; sdl: number; payment: number };
};

export type Emp501Reconciliation = {
  yearOfAssessment: number;
  kind: Emp501Kind;
  period: string;
  months: ReconciliationMonth[];
  totals: {
    declared: { paye: number; uif: number; sdl: number; eti: number; payable: number };
    certificates: { paye: number; uif: number; sdl: number; eti: number };
    paid: number;
  };
  certificateCount: { irp5: number; it3a: number };
  issues: FilingIssue[];
};

export function reconcileEmp501(input: {
  yearOfAssessment: number;
  kind: Emp501Kind;
  certificates: TaxCertificate[];
  emp201s: ReconciliationEmp201[];
  paymentsByMonth: Record<string, number>;
  monthsWithPayroll: string[];
}): Emp501Reconciliation {
  const { yearOfAssessment: yoa, kind } = input;
  const issues: FilingIssue[] = [];
  const declaredByMonth = new Map(input.emp201s.map((r) => [r.month, r]));
  const withPayroll = new Set(input.monthsWithPayroll);
  const months: ReconciliationMonth[] = monthsOfReconciliation(yoa, kind).map((month) => {
    const certificates = { paye: 0, uif: 0, sdl: 0 };
    for (const c of input.certificates) {
      const m = c.monthly[month];
      if (!m) continue;
      certificates.paye = round2(certificates.paye + m.paye);
      certificates.uif = round2(certificates.uif + m.uif);
      certificates.sdl = round2(certificates.sdl + m.sdl);
    }
    const declared = declaredByMonth.get(month) ?? null;
    const paid = round2(input.paymentsByMonth[month] ?? 0);
    const differences = {
      paye: round2((declared?.paye ?? 0) - certificates.paye),
      uif: round2((declared?.uif ?? 0) - certificates.uif),
      sdl: round2((declared?.sdl ?? 0) - certificates.sdl),
      payment: round2((declared?.totalPayable ?? 0) - paid),
    };
    const hasPayroll = withPayroll.has(month) || certificates.paye + certificates.uif + certificates.sdl > 0;
    if (hasPayroll && !declared) {
      issues.push({ severity: 'error', code: 'EMP201_NOT_FILED', message: `${month}: payroll was paid but no EMP201 is filed here.` });
    }
    if (declared && (differences.paye || differences.uif || differences.sdl)) {
      issues.push({
        severity: 'error', code: 'DECLARED_NOT_EQUAL_CERTIFICATES',
        message: `${month}: the EMP201 (PAYE ${declared.paye.toFixed(2)}, UIF ${declared.uif.toFixed(2)}, SDL ${declared.sdl.toFixed(2)}) does not match the certificates (PAYE ${certificates.paye.toFixed(2)}, UIF ${certificates.uif.toFixed(2)}, SDL ${certificates.sdl.toFixed(2)}). File a corrected EMP201 for the month.`,
      });
    }
    if (declared && differences.payment > 0.009) {
      issues.push({ severity: 'warning', code: 'UNDERPAID', message: `${month}: R${differences.payment.toFixed(2)} of the EMP201 is not recorded as paid.` });
    } else if (declared && differences.payment < -0.009) {
      issues.push({ severity: 'warning', code: 'OVERPAID', message: `${month}: payments exceed the EMP201 by R${(-differences.payment).toFixed(2)}.` });
    }
    if (declared && !['submitted', 'accepted'].includes(declared.status)) {
      issues.push({ severity: 'warning', code: 'EMP201_NOT_SUBMITTED', message: `${month}: the EMP201 is filed here but not marked as submitted to SARS.` });
    }
    return { month, hasPayroll, declared, certificates, paid, differences };
  });

  for (const c of input.certificates) issues.push(...c.issues);

  const sum = (pick: (m: ReconciliationMonth) => number) => round2(months.reduce((s, m) => s + pick(m), 0));
  return {
    yearOfAssessment: yoa,
    kind,
    period: reconciliationPeriod(yoa, kind),
    months,
    totals: {
      declared: {
        paye: sum((m) => m.declared?.paye ?? 0),
        uif: sum((m) => m.declared?.uif ?? 0),
        sdl: sum((m) => m.declared?.sdl ?? 0),
        eti: sum((m) => m.declared?.etiUtilised ?? 0),
        payable: sum((m) => m.declared?.totalPayable ?? 0),
      },
      certificates: {
        paye: sum((m) => m.certificates.paye),
        uif: sum((m) => m.certificates.uif),
        sdl: sum((m) => m.certificates.sdl),
        eti: round2(input.certificates.reduce((s, c) => s + (c.tax.eti ?? 0), 0)),
      },
      paid: sum((m) => m.paid),
    },
    certificateCount: {
      irp5: input.certificates.filter((c) => c.certificateType === 'IRP5').length,
      it3a: input.certificates.filter((c) => c.certificateType === 'IT3A').length,
    },
    issues,
  };
}
