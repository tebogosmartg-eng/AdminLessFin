/**
 * The e@syFile Employer import file (SARS_PAYE_BRS - PAYE Employer Reconciliation
 * V25.3.0, section 4): one employer record (2010…9999), one record per IRP5 / IT3(a)
 * certificate (3010…9999, with the monthly ETI block at the end) and the trailer
 * (6010…9999). Fields are "code,value"; text is quoted, numbers are not.
 *
 * SARS acceptance of this file has not been tested: the company has no e@syFile
 * employer profile yet. The rules here are the BRS rules, checked before export.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

import type { EmployerProfile } from './employerProfile.ts';
import { passportCountryCode } from './countryCodes.ts';
import { sarsAccountType, type FilingIssue, type TaxCertificate } from './emp501.ts';

export type NumberedCertificate = TaxCertificate & { certificateNumber: string };

export type EasyFileInput = {
  profile: EmployerProfile;
  yearOfAssessment: number;
  /** BRS 2031: CCYY08 interim or CCYY02 annual. */
  period: string;
  live: boolean;
  certificates: NumberedCertificate[];
  softwareProvider?: string;
  softwarePackage?: string;
};

type Field = [code: string, value: string];

/** Removes what a SARS file cannot hold: commas, pipes, line breaks, leading spaces. */
export function sarsText(value: string | null | undefined, max: number): string {
  return (value ?? '').replace(/[,|\r\n"]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

const quoted = (value: string) => `"${value}"`;
const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');
const ymd = (iso: string) => iso.replace(/-/g, '').slice(0, 8);
const money2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const four = (n: number) => n.toFixed(4);

/** Initials from the first names: letters only (BRS 3050). */
export function initialsFrom(firstNames: string): string {
  return firstNames
    .split(/[\s-]+/)
    .map((part) => part.normalize('NFD').replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase())
    .filter(Boolean)
    .join('')
    .slice(0, 5);
}

function record(fields: Field[]): string {
  return [...fields.map(([code, value]) => `${code},${value}`), '9999'].join(',');
}

function addText(fields: Field[], code: string, value: string | null | undefined, max: number) {
  const v = sarsText(value, max);
  if (v) fields.push([code, quoted(v)]);
}

function employerRecord(input: EasyFileInput): Field[] {
  const p = input.profile;
  const f: Field[] = [];
  addText(f, '2010', p.trading_name, 90);
  f.push(['2015', quoted(input.live ? 'LIVE' : 'TEST')]);
  f.push(['2020', digits(p.paye_reference)]);
  if (p.sdl_reference) f.push(['2022', quoted(p.sdl_reference)]);
  if (p.uif_reference) f.push(['2024', quoted(p.uif_reference)]);
  addText(f, '2025', p.contact_first_name, 50);
  addText(f, '2036', p.contact_surname, 50);
  addText(f, '2038', p.contact_position, 50);
  if (p.contact_business_phone) f.push(['2026', quoted(digits(p.contact_business_phone))]);
  if (p.contact_fax) f.push(['2039', quoted(digits(p.contact_fax))]);
  if (p.contact_cell_phone) f.push(['2040', quoted(digits(p.contact_cell_phone))]);
  if (p.contact_email) f.push(['2027', quoted(p.contact_email.trim())]);
  f.push(['2028', quoted(sarsText(input.softwareProvider ?? 'In-house', 70))]);
  f.push(['2029', quoted(sarsText(input.softwarePackage ?? 'In-house', 70))]);
  f.push(['2030', String(input.yearOfAssessment)]);
  f.push(['2031', input.period]);
  f.push(['2082', quoted(p.sic7_code)]);
  f.push(['2037', quoted(p.diplomatic_indemnity ? 'Y' : 'N')]);
  addText(f, '2061', p.address_unit_number, 8);
  addText(f, '2062', p.address_complex, 26);
  addText(f, '2063', p.address_street_number, 8);
  addText(f, '2064', p.address_street_name, 26);
  addText(f, '2065', p.address_suburb, 33);
  addText(f, '2066', p.address_city, 21);
  f.push(['2080', quoted(p.address_postal_code)]);
  f.push(['2081', quoted(p.address_country || 'ZA')]);
  return f;
}

function certificateRecord(c: NumberedCertificate, profile: EmployerProfile): Field[] {
  const e = c.employee;
  const f: Field[] = [];
  f.push(['3010', quoted(c.certificateNumber)]);
  f.push(['3015', quoted(c.certificateType === 'IRP5' ? 'IRP5' : 'IT3(a)')]);
  f.push(['3020', quoted(c.natureOfPerson)]);
  f.push(['3025', String(c.yearOfAssessment)]);
  if (c.eti.indicator) f.push(['3026', quoted(c.eti.indicator)]);
  addText(f, '3030', e.lastName, 120);
  addText(f, '3040', e.firstName, 90);
  f.push(['3050', quoted(initialsFrom(e.firstName))]);
  const idNumber = digits(e.idNumber);
  if (idNumber.length === 13) f.push(['3060', idNumber]);
  const passport = sarsText(e.passportNumber, 18).replace(/\s/g, '');
  if (passport) {
    f.push(['3070', quoted(passport)]);
    f.push(['3075', quoted(passportCountryCode(e.passportCountry) ?? 'ZNC')]);
  }
  if (e.dateOfBirth) f.push(['3080', ymd(e.dateOfBirth)]);
  if (digits(e.taxNumber).length === 10) f.push(['3100', digits(e.taxNumber)]);
  f.push(['3263', quoted(profile.sic7_code)]);
  if (e.email) f.push(['3125', quoted(sarsText(e.email, 70))]);
  const workPhone = digits(e.phone) || digits(profile.contact_business_phone) || digits(profile.contact_cell_phone);
  f.push(['3136', quoted(workPhone)]);
  // Work address: the employer's place of business.
  addText(f, '3144', profile.address_unit_number, 8);
  addText(f, '3145', profile.address_complex, 26);
  addText(f, '3146', profile.address_street_number, 8);
  addText(f, '3147', profile.address_street_name, 26);
  addText(f, '3148', profile.address_suburb, 33);
  addText(f, '3149', profile.address_city, 21);
  f.push(['3150', quoted(profile.address_postal_code)]);
  f.push(['3151', quoted(profile.address_country || 'ZA')]);
  addText(f, '3160', e.employeeNumber, 25);
  f.push(['3170', ymd(c.periodStart)]);
  f.push(['3180', ymd(c.periodEnd)]);
  if (c.eti.indicator === 'Y' && c.eti.employmentDate) f.push(['3190', ymd(c.eti.employmentDate)]);
  if (c.certificateType === 'IRP5') f.push(['3195', quoted('N')]);
  f.push(['3200', four(c.payPeriodsInYear)]);
  f.push(['3210', four(c.payPeriodsWorked)]);
  if (c.certificateType === 'IRP5') f.push(['3220', quoted('N')]);
  const r = e.residential;
  addText(f, '3211', r.unitNumber, 8);
  addText(f, '3212', r.complex, 26);
  addText(f, '3213', r.streetNumber, 8);
  addText(f, '3214', r.streetName, 26);
  addText(f, '3215', r.suburb, 33);
  addText(f, '3216', r.city, 21);
  if (r.postalCode) f.push(['3217', quoted(r.postalCode)]);
  f.push(['3285', quoted('ZA')]);
  f.push(['3279', quoted('N')]);
  if (e.postalSameAsResidential) {
    f.push(['3288', '1']);
  } else {
    f.push(['3288', '4']);
    e.postalLines.slice(0, 4).forEach((line, i) => addText(f, String(3289 + i), line, 35));
    if (e.postalCode) f.push(['3293', quoted(e.postalCode)]);
    f.push(['3294', quoted('ZA')]);
  }
  const accountType = sarsAccountType(e);
  f.push(['3240', String(accountType)]);
  if (accountType !== 0 && accountType !== 7) {
    f.push(['3241', quoted(digits(e.bankAccountNumber))]);
    f.push(['3242', digits(e.bankBranchCode).padStart(6, '0')]);
    addText(f, '3243', e.bankName, 50);
    addText(f, '3245', `${e.firstName} ${e.lastName}`, 49);
    f.push(['3246', '1']);
  }
  for (const i of c.income) f.push([i.code, String(i.amount)]);
  if (c.grossNonTaxable > 0) f.push(['3696', String(c.grossNonTaxable)]);
  if (c.grossTaxable > 0 || c.grossNonTaxable === 0) f.push(['3699', String(c.grossTaxable)]);
  for (const d of c.deductions) f.push([d.code, String(d.amount)]);
  if (c.totalDeductions !== null) f.push(['4497', String(c.totalDeductions)]);
  if (c.certificateType === 'IRP5') f.push(['4102', money2(c.tax.paye)]);
  if (c.tax.medicalCredit !== null) f.push(['4116', money2(c.tax.medicalCredit)]);
  if (c.tax.uif !== null) f.push(['4141', money2(c.tax.uif)]);
  if (c.tax.sdl !== null) f.push(['4142', money2(c.tax.sdl)]);
  // 4149 = 4102 + 4141 + 4142, present whenever one of them is.
  if (c.certificateType === 'IRP5' || c.tax.uif !== null || c.tax.sdl !== null) f.push(['4149', money2(c.tax.total)]);
  if (c.eti.indicator === 'Y' && c.tax.eti !== null) f.push(['4118', money2(c.tax.eti)]);
  if (c.reasonCode) f.push(['4150', c.reasonCode]);
  if (c.eti.indicator === 'Y') {
    for (const m of c.eti.months) {
      f.push(['7006', quoted(m.month.slice(5, 7))]);
      f.push(['7005', String(m.cycle)]);
      if (c.eti.sezCode) f.push(['7009', quoted(c.eti.sezCode)]);
      f.push(['7007', four(Math.min(160, m.hoursReported))]);
      f.push(['7002', money2(m.remunerationPaid)]);
      f.push(['7003', money2(m.minimumWageHourly)]);
      f.push(['7008', money2(m.wagePaidHourly)]);
      f.push(['7004', money2(m.cycle === 0 ? 0 : m.eti)]);
    }
  }
  return f;
}

/** Checks across the file that no single certificate can check on its own. */
export function validateEasyFile(input: EasyFileInput): FilingIssue[] {
  const issues: FilingIssue[] = [];
  const prefix = `${digits(input.profile.paye_reference)}${input.yearOfAssessment}${input.period.slice(4)}`;
  const seen = new Set<string>();
  for (const c of input.certificates) {
    if (!/^[0-9A-Z]{30}$/.test(c.certificateNumber) || !c.certificateNumber.startsWith(prefix)) {
      issues.push({ severity: 'error', code: 'CERTIFICATE_NUMBER_INVALID', message: `${c.employeeName}: certificate number ${c.certificateNumber} is not PAYE reference + year + month + 14 digits.`, employeeId: c.employeeId });
    }
    if (seen.has(c.certificateNumber)) {
      issues.push({ severity: 'error', code: 'CERTIFICATE_NUMBER_DUPLICATE', message: `Certificate number ${c.certificateNumber} appears twice.` });
    }
    seen.add(c.certificateNumber);
    if (c.yearOfAssessment !== input.yearOfAssessment) {
      issues.push({ severity: 'error', code: 'YEAR_MISMATCH', message: `${c.employeeName}: certificate year ${c.yearOfAssessment} differs from the file year ${input.yearOfAssessment}.` });
    }
    issues.push(...c.issues.filter((i) => i.severity === 'error'));
  }
  if (!input.certificates.length) issues.push({ severity: 'error', code: 'NO_CERTIFICATES', message: 'The file has no certificates.' });
  return issues;
}

/** The import file text, records separated by CRLF, nothing after the last 9999. */
export function buildEasyFile(input: EasyFileInput): { content: string; fileName: string; issues: FilingIssue[] } {
  const issues = validateEasyFile(input);
  const records = [
    record(employerRecord(input)),
    ...input.certificates.map((c) => record(certificateRecord(c, input.profile))),
    record([['6010', String(1 + input.certificates.length)]]),
  ];
  const kind = input.period.endsWith('08') ? 'Interim' : 'Annual';
  const fileName = `EMP501_${digits(input.profile.paye_reference)}_${input.period}_${kind}${input.live ? '' : '_TEST'}.csv`;
  return { content: records.join('\r\n'), fileName, issues };
}
