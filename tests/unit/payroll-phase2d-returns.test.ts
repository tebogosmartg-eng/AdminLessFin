import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  emp201DueDate,
  emp501Window,
  isOverdue,
  monthFilingState,
  monthsOfReconciliation,
  monthsOfYear,
  reconciliationPeriod,
  yearOfAssessmentFor,
} from '@/lib/sars/statutoryCalendar';
import {
  buildTaxCertificate,
  natureOfPersonFor,
  reconcileEmp501,
  sarsAccountType,
  type BuildCertificateInput,
  type CertificateEmployee,
  type CertificatePayslip,
} from '@/lib/sars/emp501';
import { buildEasyFile, initialsFrom, sarsText, type NumberedCertificate } from '@/lib/sars/easyFile';
import { passportCountryCode } from '@/lib/sars/countryCodes';
import { EMPTY_EMPLOYER_PROFILE, type EmployerProfile } from '@/lib/sars/employerProfile';
import { medicalCreditOnPayslip } from '../../supabase/functions/_shared/statutoryFiling';

describe('SARS calendar', () => {
  it('names the year of assessment by the year it ends in', () => {
    expect(yearOfAssessmentFor('2026-03')).toBe(2027);
    expect(yearOfAssessmentFor('2027-02')).toBe(2027);
    expect(monthsOfYear(2027)).toEqual([
      '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
      '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02',
    ]);
    expect(monthsOfReconciliation(2027, 'interim')).toHaveLength(6);
    expect(reconciliationPeriod(2027, 'interim')).toBe('202608');
    expect(reconciliationPeriod(2027, 'annual')).toBe('202702');
  });

  it('EMP201 is due on the 7th, or the last business day before it', () => {
    expect(emp201DueDate('2026-11')).toBe('2026-12-07'); // Monday
    expect(emp201DueDate('2027-02')).toBe('2027-03-05'); // 7 March 2027 is a Sunday
    expect(emp201DueDate('2026-08', new Set(['2026-09-07']))).toBe('2026-09-04'); // holiday on Monday
    expect(emp201DueDate('2026-12')).toBe('2027-01-07');
  });

  it('EMP501 windows', () => {
    expect(emp501Window(2027, 'interim')).toEqual({ opens: '2026-09-01', due: '2026-10-31' });
    expect(emp501Window(2027, 'annual')).toEqual({ opens: '2027-04-01', due: '2027-05-31' });
  });

  it('month state follows filing, approval, submission and payment', () => {
    expect(monthFilingState({ hasFinalisedPayroll: false, filed: null, paid: 0 })).toBe('no_payroll');
    expect(monthFilingState({ hasFinalisedPayroll: true, filed: null, paid: 0 })).toBe('not_filed');
    const filed = { approved: false, submitted: false, totalPayable: 1000 };
    expect(monthFilingState({ hasFinalisedPayroll: true, filed, paid: 0 })).toBe('filed');
    expect(monthFilingState({ hasFinalisedPayroll: true, filed: { ...filed, approved: true }, paid: 0 })).toBe('approved');
    expect(monthFilingState({ hasFinalisedPayroll: true, filed: { ...filed, approved: true, submitted: true }, paid: 0 })).toBe('submitted');
    expect(monthFilingState({ hasFinalisedPayroll: true, filed: { ...filed, approved: true, submitted: true }, paid: 400 })).toBe('underpaid');
    expect(monthFilingState({ hasFinalisedPayroll: true, filed: { ...filed, approved: true, submitted: true }, paid: 1000 })).toBe('paid');
    expect(monthFilingState({ hasFinalisedPayroll: true, filed: { ...filed, approved: true, submitted: true }, paid: 1000.01 })).toBe('overpaid');
    expect(monthFilingState({ hasFinalisedPayroll: true, filed: { approved: true, submitted: true, totalPayable: 0 }, paid: 0 })).toBe('paid');
    expect(isOverdue('not_filed', '2026-12-07', '2026-12-08')).toBe(true);
    expect(isOverdue('not_filed', '2026-12-07', '2026-12-07')).toBe(false);
    expect(isOverdue('paid', '2026-12-07', '2027-01-08')).toBe(false);
  });
});

const employee: CertificateEmployee = {
  id: 'e1', employeeNumber: 'EMP-1', firstName: 'Sipho John', lastName: 'Dlamini', idNumber: '8601015800086',
  passportNumber: null, passportCountry: null, dateOfBirth: '1986-01-01', taxNumber: '0001339050', natureOfPerson: null,
  email: 'sipho@example.co.za', phone: '0115550001', startDate: '2020-01-01', endDate: null,
  residential: { unitNumber: null, complex: null, streetNumber: '5', streetName: 'Oak Street', suburb: 'Soweto', city: 'Johannesburg', postalCode: '1804' },
  postalSameAsResidential: true, postalLines: [], postalCode: null,
  bankAccountType: 'savings', bankAccountNumber: '1234567890', bankBranchCode: '250655', bankName: 'FNB',
  etiEmploymentDate: null, etiSezCode: null,
};

const employer = {
  payeReference: '7230767891', sdlReference: 'L230767891', uifReference: 'U230767891', sic7Code: '62010',
  businessPhone: '0115550000',
  workAddress: { unitNumber: null, complex: null, streetNumber: '1', streetName: 'Main Road', suburb: null, city: 'Johannesburg', postalCode: '2001' },
};

function payslip(month: string, items: Array<[string | null, number]>, extra: Partial<CertificatePayslip> = {}): CertificatePayslip {
  return {
    payslipId: `${month}-${Math.random()}`, employeeId: 'e1', month, periodKey: `${month}-01`, periodsPerYear: 12, periodFraction: 1,
    items: items.map(([code, amount]) => ({ code, amount })), medicalCredit: 0, ...extra,
  };
}

const salaryMonth = (month: string) => payslip(month, [
  ['3601', 20_000.6], ['3713', 500.5], ['3714', 300], ['4001', 1_500.4], ['4102', 2_345.67], ['4141', 200], ['4142', 205.01], [null, 99],
]);

function input(overrides: Partial<BuildCertificateInput> = {}): BuildCertificateInput {
  return {
    yearOfAssessment: 2027, kind: 'annual', employer, employee,
    payslips: monthsOfYear(2027).map(salaryMonth), etiMonths: [], ...overrides,
  };
}

describe('IRP5 / IT3(a) certificate (BRS V25.3.0)', () => {
  it('totals by code in whole rand, gross non-taxable and taxable, total deductions and tax', () => {
    const c = buildTaxCertificate(input());
    expect(c.certificateType).toBe('IRP5');
    expect(c.reasonCode).toBeNull();
    expect(c.income).toEqual([
      { code: '3601', amount: 240_007 }, // 240 007.20 → cents dropped
      { code: '3713', amount: 6_006 },
      { code: '3714', amount: 3_600 },
    ]);
    expect(c.grossNonTaxable).toBe(3_600);
    expect(c.grossTaxable).toBe(246_013);
    expect(c.deductions).toEqual([{ code: '4001', amount: 18_004 }]);
    expect(c.totalDeductions).toBe(18_004);
    expect(c.tax.paye).toBe(28_148.04);
    expect(c.tax.uif).toBe(2_400);
    expect(c.tax.sdl).toBe(2_460.12);
    expect(c.tax.total).toBe(33_008.16);
    expect(c.tax.medicalCredit).toBeNull();
    expect(c.payPeriodsInYear).toBe(12);
    expect(c.payPeriodsWorked).toBe(12);
    expect(c.periodStart).toBe('2026-03-01');
    expect(c.periodEnd).toBe('2027-02-28');
    expect(c.monthly['2026-11']).toEqual({ paye: 2_345.67, uif: 200, sdl: 205.01 });
    expect(c.issues).toEqual([]);
  });

  it("folds retired codes into their main code (directors' 3615 into 3601, loans 3807 into 3801)", () => {
    const c = buildTaxCertificate(input({ payslips: [payslip('2026-03', [['3615', 50_000], ['3807', 120], ['3801', 30], ['4102', 10_000]])] }));
    expect(c.income).toEqual([{ code: '3601', amount: 50_000 }, { code: '3801', amount: 150 }]);
  });

  it('no PAYE is an IT3(a): reason 02, or 08 when the medical credit removed the tax', () => {
    const low = buildTaxCertificate(input({ payslips: [payslip('2026-03', [['3601', 5_000], ['4141', 100]])] }));
    expect(low.certificateType).toBe('IT3A');
    expect(low.reasonCode).toBe('02');
    expect(low.tax.total).toBe(100);
    const medical = buildTaxCertificate(input({ payslips: [payslip('2026-03', [['3601', 9_000], ['4005', 1_200], ['4141', 90]], { medicalCredit: 364 })] }));
    expect(medical.certificateType).toBe('IT3A');
    expect(medical.reasonCode).toBe('08');
    expect(medical.tax.medicalCredit).toBe(364);
  });

  it('employer medical aid (3810) is deemed paid by the employee: 4005 includes it and 4474 equals it', () => {
    const c = buildTaxCertificate(input({ payslips: [payslip('2026-03', [['3601', 30_000], ['3810', 2_000], ['4005', 1_000], ['4102', 4_000]])] }));
    expect(c.deductions).toEqual([{ code: '4005', amount: 3_000 }, { code: '4474', amount: 2_000 }]);
    expect(c.totalDeductions).toBe(5_000);
  });

  it('UIF and SDL codes appear only when the employer has those references', () => {
    const c = buildTaxCertificate(input({ employer: { ...employer, sdlReference: null }, payslips: [payslip('2026-03', [['3601', 10_000], ['4102', 500], ['4141', 100]])] }));
    expect(c.tax.sdl).toBeNull();
    expect(c.tax.uif).toBe(100);
  });

  it('a second run in the same pay period is not a second pay period', () => {
    const c = buildTaxCertificate(input({
      payslips: [
        payslip('2026-03', [['3601', 10_000], ['4102', 500]]),
        payslip('2026-03', [['3605', 5_000], ['4102', 1_000]]),
        payslip('2026-04', [['3601', 5_000], ['4102', 250]], { periodKey: '2026-04-01', periodFraction: 0.5 }),
      ],
    }));
    expect(c.payPeriodsWorked).toBe(1.5);
  });

  it('a leaver ends on the termination date', () => {
    const c = buildTaxCertificate(input({ employee: { ...employee, startDate: '2026-06-15', endDate: '2026-10-31' } }));
    expect(c.periodStart).toBe('2026-06-15');
    expect(c.periodEnd).toBe('2026-10-31');
  });

  it('ETI: Y with all twelve months (zeros where none was claimed), 4118 = sum of 7004', () => {
    const c = buildTaxCertificate(input({
      employee: { ...employee, etiEmploymentDate: '2025-06-01' },
      etiMonths: [
        { month: '2026-11', cycle: 1, remunerationPaid: 6_500, hoursReported: 160, minimumWageHourly: 28.79, wagePaidHourly: 37.5, eti: 750 },
        { month: '2026-12', cycle: 1, remunerationPaid: 6_500, hoursReported: 160, minimumWageHourly: 28.79, wagePaidHourly: 37.5, eti: 750 },
      ],
    }));
    expect(c.eti.indicator).toBe('Y');
    expect(c.eti.employmentDate).toBe('2025-06-01');
    expect(c.eti.months.map((m) => m.month)).toEqual(monthsOfYear(2027));
    expect(c.eti.months[0]).toMatchObject({ cycle: 0, eti: 0, hoursReported: 0 });
    expect(c.eti.months[0].minimumWageHourly).toBeGreaterThan(0);
    expect(c.tax.eti).toBe(1_500);
  });

  it('ETI indicator: N without qualifying months; left out for public administration (Appendix D)', () => {
    expect(buildTaxCertificate(input()).eti.indicator).toBe('N');
    expect(buildTaxCertificate(input({ employer: { ...employer, sic7Code: '84111' } })).eti.indicator).toBeNull();
  });

  it('ETI above 75% of taxable income is refused from 2027', () => {
    const c = buildTaxCertificate(input({
      payslips: [payslip('2026-03', [['3601', 1_000]])],
      etiMonths: [{ month: '2026-03', cycle: 1, remunerationPaid: 1_000, hoursReported: 40, minimumWageHourly: 28.79, wagePaidHourly: 30, eti: 900 }],
    }));
    expect(c.issues.map((i) => i.code)).toContain('ETI_ABOVE_75_PERCENT');
  });

  it('lists what SARS would reject about the employee', () => {
    const c = buildTaxCertificate(input({
      employee: {
        ...employee, taxNumber: '0123456789', idNumber: null, dateOfBirth: null, phone: null,
        residential: { ...employee.residential, streetName: null, postalCode: '0000' }, bankBranchCode: '25065',
      },
      employer: { ...employer, businessPhone: null },
    }));
    expect(c.issues.map((i) => i.code).sort()).toEqual([
      'BRANCH_CODE_INVALID', 'BUSINESS_PHONE_MISSING', 'DATE_OF_BIRTH_MISSING', 'NO_IDENTITY_NATURE_B',
      'RESIDENTIAL_ADDRESS_MISSING', 'RESIDENTIAL_POSTAL_CODE', 'TAX_NUMBER_REQUIRED',
    ]);
    expect(c.natureOfPerson).toBe('B');
  });

  it('nature of person and account type', () => {
    expect(natureOfPersonFor({ idNumber: null, passportNumber: 'A1234567', natureOfPerson: null })).toBe('A');
    expect(natureOfPersonFor({ idNumber: '8601015800086', passportNumber: null, natureOfPerson: 'C' })).toBe('A');
    expect(sarsAccountType({ bankAccountType: 'current', bankAccountNumber: '123' })).toBe(1);
    expect(sarsAccountType({ bankAccountType: 'current', bankAccountNumber: '' })).toBe(0);
    expect(passportCountryCode('GB')).toBe('GBR');
    expect(passportCountryCode('ZA')).toBe('ZAF');
    expect(passportCountryCode('XX')).toBe('ZNC');
  });
});

describe('EMP501 reconciliation', () => {
  const cert = buildTaxCertificate(input({ kind: 'interim', payslips: monthsOfReconciliation(2027, 'interim').map(salaryMonth) }));
  const declared = (month: string, paye = 2_345.67) => ({
    returnId: month, month, version: 1, status: 'submitted', paye, uif: 200, sdl: 205.01, etiUtilised: 0, totalPayable: paye + 405.01,
  });

  it('agrees when every month is declared, matches and is paid', () => {
    const months = monthsOfReconciliation(2027, 'interim');
    const r = reconcileEmp501({
      yearOfAssessment: 2027, kind: 'interim', certificates: [cert], emp201s: months.map((m) => declared(m)),
      paymentsByMonth: Object.fromEntries(months.map((m) => [m, 2_750.68])), monthsWithPayroll: months,
    });
    expect(r.issues).toEqual([]);
    expect(r.totals.declared.paye).toBe(r.totals.certificates.paye);
    expect(r.certificateCount).toEqual({ irp5: 1, it3a: 0 });
  });

  it('flags an unfiled month, a declared amount that differs, and underpayment', () => {
    const months = monthsOfReconciliation(2027, 'interim');
    const r = reconcileEmp501({
      yearOfAssessment: 2027, kind: 'interim', certificates: [cert],
      emp201s: months.slice(1).map((m, i) => declared(m, i === 0 ? 2_000 : 2_345.67)),
      paymentsByMonth: { [months[2]]: 100 }, monthsWithPayroll: months,
    });
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain('EMP201_NOT_FILED');
    expect(codes).toContain('DECLARED_NOT_EQUAL_CERTIFICATES');
    expect(codes).toContain('UNDERPAID');
    expect(r.months[1].differences.paye).toBe(-345.67);
  });
});

const profile: EmployerProfile = {
  ...EMPTY_EMPLOYER_PROFILE,
  trading_name: 'Acme, Trading (Pty) Ltd', paye_reference: '7230767891', sdl_reference: 'L230767891', uif_reference: 'U230767891',
  contact_first_name: 'Thandi', contact_surname: 'Mokoena', contact_business_phone: '0115550000', contact_email: 'payroll@acme.co.za',
  sic7_code: '62010', address_street_name: 'Main Road', address_city: 'Johannesburg', address_postal_code: '2001', address_country: 'ZA',
};

describe('e@syFile import file', () => {
  const certificate: NumberedCertificate = {
    ...buildTaxCertificate(input({
      employee: { ...employee, etiEmploymentDate: '2025-06-01' },
      etiMonths: [{ month: '2026-11', cycle: 1, remunerationPaid: 6_500, hoursReported: 173.33, minimumWageHourly: 28.79, wagePaidHourly: 37.5, eti: 750 }],
    })),
    certificateNumber: '723076789120270200000000000001',
  };

  it('writes the employer record, one record per certificate and the trailer, CRLF-separated', () => {
    const { content, fileName, issues } = buildEasyFile({ profile, yearOfAssessment: 2027, period: '202702', live: false, certificates: [certificate] });
    expect(issues).toEqual([]);
    expect(fileName).toBe('EMP501_7230767891_202702_Annual_TEST.csv');
    const records = content.split('\r\n');
    expect(records).toHaveLength(3);
    expect(records[0].startsWith('2010,"Acme Trading (Pty) Ltd",2015,"TEST",2020,7230767891,2022,"L230767891",2024,"U230767891"')).toBe(true);
    expect(records[0]).toContain('2030,2027,2031,202702,2082,"62010",2037,"N"');
    expect(records[0].endsWith(',9999')).toBe(true);
    expect(records[2]).toBe('6010,2,9999');
    expect(content.endsWith('9999')).toBe(true);
  });

  it('certificate record: quoting, whole rand, tax with cents, ETI blocks at the end', () => {
    const record = buildEasyFile({ profile, yearOfAssessment: 2027, period: '202702', live: true, certificates: [certificate] }).content.split('\r\n')[1];
    expect(record.startsWith('3010,"723076789120270200000000000001",3015,"IRP5",3020,"A",3025,2027,3026,"Y",3030,"Dlamini",3040,"Sipho John",3050,"SJ",3060,8601015800086')).toBe(true);
    expect(record).toContain('3080,19860101,3100,0001339050,3263,"62010"');
    expect(record).toContain('3170,20260301,3180,20270228,3190,20250601,3195,"N",3200,12.0000,3210,12.0000,3220,"N"');
    expect(record).toContain('3288,1,3240,2,3241,"1234567890",3242,250655,3243,"FNB",3245,"Sipho John Dlamini",3246,1');
    expect(record).toContain('3601,240007,3713,6006,3714,3600,3696,3600,3699,246013,4001,18004,4497,18004,4102,28148.04,4141,2400.00,4142,2460.12,4149,33008.16,4118,750.00');
    expect(record).toContain('7006,"11",7005,1,7007,160.0000,7002,6500.00,7003,28.79,7008,37.50,7004,750.00');
    expect(record).toContain('7006,"03",7005,0,7007,0.0000,7002,0.00');
    expect((record.match(/7006,/g) ?? []).length).toBe(12);
    expect(record.endsWith('7004,0.00,9999')).toBe(true);
    expect(record).not.toContain('4150');
  });

  it('IT3(a): no PAYE code, a reason code, and 4149 only when UIF or SDL is reported', () => {
    const it3a: NumberedCertificate = {
      ...buildTaxCertificate(input({ employer: { ...employer, uifReference: null, sdlReference: null }, payslips: [payslip('2026-03', [['3601', 5_000]])] })),
      certificateNumber: '723076789120270200000000000002',
    };
    const p = { ...profile, uif_reference: null, sdl_reference: null };
    const record = buildEasyFile({ profile: p, yearOfAssessment: 2027, period: '202702', live: false, certificates: [it3a] }).content.split('\r\n')[1];
    expect(record).toContain('3015,"IT3(a)"');
    expect(record).not.toContain('4102,');
    expect(record).not.toContain('4149,');
    expect(record).not.toContain('3195,');
    expect(record).toContain('4150,02');
  });

  it('refuses a certificate number that does not follow PAYE reference + year + month', () => {
    const bad = { ...certificate, certificateNumber: '723076789120260200000000000001' };
    const { issues } = buildEasyFile({ profile, yearOfAssessment: 2027, period: '202702', live: false, certificates: [bad, bad] });
    expect(issues.map((i) => i.code)).toEqual(['CERTIFICATE_NUMBER_INVALID', 'CERTIFICATE_NUMBER_INVALID', 'CERTIFICATE_NUMBER_DUPLICATE']);
  });

  it('text helpers strip what a SARS file cannot hold', () => {
    expect(sarsText(' A, B | "C"\nD ', 90)).toBe('A B C D');
    expect(initialsFrom('Mary-Ann Élise')).toBe('MAE');
  });
});

describe('medical tax credit on a payslip', () => {
  it('is the period share of the annual credit, limited to the tax it reduced', () => {
    const snapshot = (before: number) => ({
      period_employment: { periods_per_year: 12, pro_rata_factor: 1 },
      engine_results: [
        { engine_id: 'medical_tax_credit', breakdown: { annualCredit: 8_736 } },
        { engine_id: 'paye', breakdown: { annualTaxBeforeCredits: before, annualRebate: 17_235 } },
      ],
    });
    expect(medicalCreditOnPayslip(snapshot(100_000))).toBe(728);
    expect(medicalCreditOnPayslip(snapshot(20_000))).toBe(230.42);
    expect(medicalCreditOnPayslip({ engine_results: [] })).toBe(0);
  });
});

describe('client and server copies', () => {
  it('are identical apart from Deno import extensions', () => {
    for (const file of ['statutoryCalendar.ts', 'countryCodes.ts', 'emp501.ts', 'easyFile.ts']) {
      const client = readFileSync(`src/lib/sars/${file}`, 'utf8').replace(/\r\n/g, '\n');
      const server = readFileSync(`supabase/functions/_shared/sars/${file}`, 'utf8').replace(/\r\n/g, '\n')
        .replace(/(from '\.{1,2}\/[^']+)\.ts'/g, "$1'");
      expect(server, file).toBe(client);
    }
  });
});
