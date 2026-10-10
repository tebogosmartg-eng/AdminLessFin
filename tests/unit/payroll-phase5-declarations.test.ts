import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  accountHash,
  acbAccountType,
  bankText,
  buildBankFile,
  universalBranchCode,
  type BankPayment,
  type BankPaymentProfile,
} from '@/lib/payrollRulesEngine/bankFiles';
import { buildUifDeclaration, isValidUifReference, uifMonthlyCeiling, type UifEmployeeLine } from '@/lib/payrollRulesEngine/uifDeclaration';
import { buildRoeWorksheet, coidaEarningsFromItems, coidaPeriod, coidaYear } from '@/lib/payrollRulesEngine/coida';
import { normaliseEmployerProfile, validateEmployerProfile, EMPTY_EMPLOYER_PROFILE } from '@/lib/sars/employerProfile';

const profile: BankPaymentProfile = {
  name: 'FNB salaries', kind: 'acb', payingAccountNumber: '62012345678', payingBranchCode: '250655', payingAccountName: 'Acme Trading',
  userCode: 'AB12', abbreviatedName: 'ACME', serviceType: 'SAMEDAY', entryClass: '61', installationGeneration: 7, userGeneration: 7,
  ownReference: 'SALARY {period}', recipientReference: '{company} SALARY', includeHashTotal: true,
  csvColumns: [], csvHeader: true, csvDelimiter: ',', csvAmountStyle: 'rands', csvDateFormat: 'YYYYMMDD',
};
const payments: BankPayment[] = [
  { employeeName: 'Thabo Mokoena', employeeNumber: 'EMP001', accountNumber: '62000000001', branchCode: '250655', bankName: 'FNB', accountType: 'current', amount: 15_234.5 },
  { employeeName: 'Ann Smith-Ö', employeeNumber: 'EMP002', accountNumber: '4012345678', branchCode: null, bankName: 'Absa', accountType: 'savings', amount: 3_728.68 },
  { employeeName: 'No Account', employeeNumber: 'EMP003', accountNumber: null, branchCode: null, bankName: null, accountType: null, amount: 100 },
  { employeeName: 'Zero Pay', employeeNumber: 'EMP004', accountNumber: '123', branchCode: '051001', bankName: null, accountType: null, amount: 0 },
];
const options = { actionDate: '2026-11-25', creationDate: '2026-11-20', period: '2026-11', companyName: 'Acme' };

describe('bank payment files', () => {
  it('ACB: 180-character records in order 02, 04, 10…, 12, 92, 94 with cents, totals and the hash', () => {
    const r = buildBankFile(profile, payments, options);
    const lines = r.content.split('\r\n').filter(Boolean);
    expect(lines.every((l) => l.length === 180)).toBe(true);
    expect(lines.map((l) => l.slice(0, 2))).toEqual(['02', '04', '10', '10', '12', '92', '94']);
    expect(lines[0].slice(14, 18)).toBe('AB12');
    expect(lines[0].slice(34, 38)).toBe('0007');
    expect(lines[1].slice(40, 50)).toBe('SAMEDAY   ');
    // First payment: homing branch, account, type, amount in cents, action date YYMMDD, references, name.
    expect(lines[2].slice(29, 35)).toBe('250655');
    expect(lines[2].slice(35, 46)).toBe('62000000001');
    expect(lines[2].slice(46, 47)).toBe('1');
    expect(lines[2].slice(47, 58)).toBe('00001523450');
    expect(lines[2].slice(58, 64)).toBe('261125');
    expect(lines[2].slice(70, 100)).toBe('ACME      ACME SALARY         ');
    expect(lines[2].slice(100, 130).trim()).toBe('THABO MOKOENA');
    // Second payment used Absa's universal branch code; savings is type 2; accents stripped.
    expect(lines[3].slice(29, 35)).toBe('632005');
    expect(lines[3].slice(46, 47)).toBe('2');
    expect(lines[3].slice(100, 130).trim()).toBe('ANN SMITH-O');
    // Contra: total of the set.
    expect(lines[4].slice(47, 58)).toBe(String(1_523_450 + 372_868).padStart(11, '0'));
    // Trailer: 1 debit (contra), 2 credits, 1 contra, totals and hash.
    expect(lines[5].slice(30, 48)).toBe('000001000002000001');
    expect(lines[5].slice(72, 84)).toBe(accountHash(['62000000001', '4012345678'], '62012345678'));
    expect(lines[6].slice(62, 68)).toBe('000007');
    expect(r.control).toMatchObject({ payments: 2, total: 18_963.18 });
    expect(r.issues.map((i) => i.severity)).toEqual(['warning', 'error', 'warning']);
  });

  it('hash total = recipient accounts + the paying account once, last 12 digits', () => {
    expect(accountHash(['62000000001', '4012345678'], '62012345678')).toBe(String(62_000_000_001 + 4_012_345_678 + 62_012_345_678).slice(-12).padStart(12, '0'));
  });

  it('FNB Online Banking Enterprise ACB variant: reference at 71-90, name at 101-115, date on the contra only', () => {
    const lines = buildBankFile({ ...profile, kind: 'fnb_obe_acb' }, payments, options).content.split('\r\n').filter(Boolean);
    expect(lines.every((l) => l.length === 180)).toBe(true);
    expect(lines[2].slice(58, 66)).toBe('00000000');
    expect(lines[2].slice(70, 90).trim()).toBe('ACME SALARY');
    expect(lines[2].slice(100, 115).trim()).toBe('THABO MOKOENA');
    expect(lines[4].slice(58, 64)).toBe('261125');
  });

  it('FNB Online Banking Enterprise CSV: header block, rands, hash', () => {
    const rows = buildBankFile({ ...profile, kind: 'fnb_obe_csv' }, payments, options).content.split('\r\n').filter(Boolean);
    expect(rows[0].startsWith('BInSol - U ver 1.00,')).toBe(true);
    expect(rows[1].startsWith('2026/11/25,')).toBe(true);
    expect(rows[2].startsWith(`62012345678,${accountHash(['62000000001', '4012345678'], '62012345678')}`)).toBe(true);
    expect(rows[3].startsWith('RECIPIENT NAME,RECIPIENT ACCOUNT,RECIPIENT ACCOUNT TYPE,BRANCHCODE,AMOUNT,OWN REFERENCE,RECIPIENT REFERENCE')).toBe(true);
    expect(rows[4].startsWith('THABO MOKOENA,62000000001,1,250655,15234.50,SALARY 2026-11,ACME SALARY')).toBe(true);
    expect(rows[4].split(',')).toHaveLength(36);
  });

  it('Absa BIO and Capitec CSVs, and a CSV mapped to any template', () => {
    expect(buildBankFile({ ...profile, kind: 'absa_bio_csv' }, payments, options).content.split('\r\n')[0]).toBe('62000000001,THABO MOKOENA,250655,15234.50,ACME SALARY');
    expect(buildBankFile({ ...profile, kind: 'capitec_csv' }, payments, options).content.split('\r\n')[1]).toBe('632005,4012345678,3728.68,ACME SALARY,SALARY 2026-11,ANN SMITH-O');
    const mapped = buildBankFile({ ...profile, kind: 'mapped_csv', csvColumns: ['employee_number', 'account_number', 'branch_code', 'amount', 'action_date'], csvAmountStyle: 'cents', csvDateFormat: 'DD/MM/YYYY', csvDelimiter: ';' }, payments, options);
    expect(mapped.content.split('\r\n').slice(0, 2)).toEqual(['Employee Number;Account Number;Branch Code;Amount;Date', 'EMP001;62000000001;250655;1523450;25/11/2026']);
  });

  it('refuses a profile without the paying account, and ACB without the user code', () => {
    const r = buildBankFile({ ...profile, payingAccountNumber: '', userCode: null }, payments, options);
    expect(r.content).toBe('');
    expect(r.issues.filter((i) => !i.employeeName).map((i) => i.message)).toEqual([
      'The bank payment profile has no paying account number.',
      'An ACB file needs the 4-character user code the bank issued.',
    ]);
  });

  it('reference data', () => {
    expect(universalBranchCode('Standard Bank of SA')).toBe('051001');
    expect(universalBranchCode('Capitec Bank')).toBe('470010');
    expect(universalBranchCode('Unknown Bank')).toBeNull();
    expect(acbAccountType('transmission')).toBe('3');
    expect(bankText('José "O\'Neil" <3>', 30)).toBe('JOSE O NEIL 3');
  });
});

describe('UIF declaration (E03)', () => {
  it('UIF reference check digits (Appendix A)', () => {
    expect(isValidUifReference('1916733/3')).toBe(true);
    expect(isValidUifReference('123456/8')).toBe(true);
    expect(isValidUifReference('0123456/7')).toBe(false);
    expect(isValidUifReference('')).toBe(false);
    expect(uifMonthlyCeiling('2026-09')).toBe(17_712);
  });

  const line = (extra: Partial<UifEmployeeLine>): UifEmployeeLine => ({
    employeeId: 'e', idNumber: null, otherNumber: null, employeeNumber: null, surname: '', firstNames: '', dateOfBirth: null, employedFrom: null, employedTo: null,
    status: 'active', nonContributionReason: null, grossTaxable: 0, uifRemuneration: 0, contribution: 0, branchCode: null, accountNumber: null, accountType: null, ...extra,
  });
  it('U1 file: creator, employee lines (zero fields left out), employer trailer, file name', () => {
    const r = buildUifDeclaration({
      month: '2026-09', live: true, fileSequence: 1,
      creator: { uifReference: '123456/8', contactName: 'Jane Admin', contactPhone: '011 555 1234', contactEmail: 'payroll@acme.co.za' },
      employer: { uifReference: '123456/8', payeReference: '7123456789', email: null },
      lines: [
        line({ employeeId: 'e1', idNumber: '8001015009087', employeeNumber: 'EMP001', surname: 'Mokoena', firstNames: 'Thabo', dateOfBirth: '1980-01-01', employedFrom: '2020-03-01', grossTaxable: 25_000, uifRemuneration: 17_712, contribution: 354.24 }),
        line({ employeeId: 'e2', otherNumber: 'A1234567', employeeNumber: 'EMP002', surname: 'Smith', firstNames: 'Ann', dateOfBirth: '1990-05-15', employedFrom: '2025-01-01', employedTo: '2026-08-31', status: 'resigned', nonContributionReason: '06' }),
      ],
    });
    expect(r.fileName).toBe('01234568.001');
    expect(r.content.split('\r\n').slice(0, 4)).toEqual([
      '8000,"UICR",8010,"U1",8015,"E03",8020,"001234568",8030,"LIVE",8040,"Jane Admin",8050,"0115551234",8060,"payroll@acme.co.za",8070,202609',
      '8001,"UIWK",8110,"001234568",8200,8001015009087,8220,"EMP001",8230,"Mokoena",8240,"Thabo",8250,19800101,8260,20200301,8280,1,8300,25000.00,8310,17712.00,8320,354.24',
      '8001,"UIWK",8110,"001234568",8210,"A1234567",8220,"EMP002",8230,"Smith",8240,"Ann",8250,19900515,8260,20250101,8270,20260831,8280,6,8290,6',
      '8002,"UIEM",8115,"001234568",8120,7123456789,8130,25000.00,8135,17712.00,8140,354.24,8150,2',
    ]);
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('flags what the Fund would reject', () => {
    const r = buildUifDeclaration({
      month: '2026-09', live: false, fileSequence: 2,
      creator: { uifReference: '0123456/7', contactName: '', contactPhone: '', contactEmail: null },
      employer: { uifReference: '0123456/7', payeReference: null, email: null },
      lines: [line({ employeeId: 'e3', surname: 'X', firstNames: 'Y', status: 'resigned', grossTaxable: 100 })],
    });
    expect(r.issues.filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([
      expect.stringMatching(/UIF reference number/),
      'Y X: an SA ID, passport or employee number is required.',
      'Y X: a termination date is required for this employment status.',
      'Y X: no contribution and no reason for non-contribution.',
    ]);
  });
  it('the employer profile checks the Department of Labour UIF reference', () => {
    const base = { ...EMPTY_EMPLOYER_PROFILE, uif_dol_reference: '0123456/7' };
    expect(validateEmployerProfile(normaliseEmployerProfile(base)).some((e) => e.field === 'uif_dol_reference')).toBe(true);
    expect(validateEmployerProfile(normaliseEmployerProfile({ ...base, uif_dol_reference: '1234568' })).some((e) => e.field === 'uif_dol_reference')).toBe(false);
    expect(normaliseEmployerProfile({ ...base, coida_rate_percent: '0.18' as unknown as number }).coida_rate_percent).toBe(0.18);
  });
});

describe('COIDA return of earnings', () => {
  it('years, periods and earnings', () => {
    expect(coidaYear(2026).maxEarnings).toBe(668_000);
    expect(coidaYear(2025).maxEarnings).toBe(633_168);
    expect(coidaPeriod(2027)).toEqual({ start: '2027-03-01', end: '2028-02-29' });
    expect(coidaEarningsFromItems([
      { code: '3601', amount: 10_000 }, { code: '3607', amount: 500 }, { code: '3714', amount: 300 }, { code: '3802', amount: 2_000 }, { code: '4102', amount: 900, type: 'deduction' }, { code: null, amount: 50 },
    ])).toBe(10_500);
  });
  it('caps each employee, applies the rate with the minimum assessment, estimates next year', () => {
    const w = buildRoeWorksheet({
      startYear: 2025, ratePercent: 0.18, provisionalGrowthPercent: 10,
      employees: [
        { employeeId: 'a', name: 'High Earner', employeeNumber: null, idNumber: null, earnings: 900_000 },
        { employeeId: 'b', name: 'Clerk', employeeNumber: null, idNumber: null, earnings: 240_000 },
        { employeeId: 'c', name: 'Never Paid', employeeNumber: null, idNumber: null, earnings: 0 },
      ],
    });
    expect(w.totals).toEqual({ employees: 2, earnings: 1_140_000, assessable: 873_168 });
    expect(w.employees.find((e) => e.employeeId === 'a')).toMatchObject({ assessable: 633_168, capped: true });
    expect(w.assessment).toBe(1_621); // 873 168 × 0.18% = R1 571.70, below the minimum
    expect(w.provisional).toMatchObject({ earnings: 1_254_000, assessable: 668_000 + 264_000 });
    expect(buildRoeWorksheet({ startYear: 2025, ratePercent: null, employees: [] }).assessment).toBeNull();
  });
});

describe('client and server copies', () => {
  it('are identical apart from Deno import extensions', () => {
    for (const file of ['payrollRulesEngine/bankFiles.ts', 'payrollRulesEngine/uifDeclaration.ts', 'payrollRulesEngine/coida.ts', 'sars/employerProfile.ts']) {
      const client = readFileSync(`src/lib/${file}`, 'utf8').replace(/\r\n/g, '\n');
      const server = readFileSync(`supabase/functions/_shared/${file}`, 'utf8').replace(/\r\n/g, '\n')
        .replace(/(from '\.{1,2}\/[^']+)\.ts'/g, "$1'");
      expect(server, file).toBe(client);
    }
  });
});
