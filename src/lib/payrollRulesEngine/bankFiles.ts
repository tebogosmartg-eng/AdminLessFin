/**
 * Salary payment files for South African banks, built from the payroll function's
 * authoritative bank rows (ADR-0002) and a company bank payment profile:
 *
 * - acb          BankservAfrica ACB fixed width (02/04/10/12/92/94; FNB "PACS Bankserv (ACB)
 *                File Format", Oct 2015). Imported by FNB, Standard Bank, Absa, Nedbank, Capitec.
 * - fnb_obe_acb  FNB Online Banking Enterprise ACB variant (Feb 2023).
 * - fnb_obe_csv  FNB Online Banking Enterprise payments CSV (April 2024 guide and template).
 * - absa_bio_csv Absa Business Integrator Online CSV (5 columns, no header).
 * - capitec_csv  Capitec Business CSV (6 columns; layout from a user report: verify on first use).
 * - mapped_csv   Any bank's CSV template: columns, header, amount and date style chosen by the user.
 *
 * Each bank still checks a file against the client's own profile (user code, services,
 * column mapping), so a first file per bank should be imported and stopped before authorising.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

export type BankFileKind = 'acb' | 'fnb_obe_acb' | 'fnb_obe_csv' | 'absa_bio_csv' | 'capitec_csv' | 'mapped_csv';

export const BANK_FILE_KINDS: Array<{ kind: BankFileKind; label: string; extension: 'txt' | 'csv' }> = [
  { kind: 'acb', label: 'BankservAfrica ACB (FNB, Standard Bank, Absa, Nedbank, Capitec)', extension: 'txt' },
  { kind: 'fnb_obe_acb', label: 'FNB Online Banking Enterprise – ACB', extension: 'txt' },
  { kind: 'fnb_obe_csv', label: 'FNB Online Banking Enterprise – CSV', extension: 'csv' },
  { kind: 'absa_bio_csv', label: 'Absa Business Integrator Online – CSV', extension: 'csv' },
  { kind: 'capitec_csv', label: 'Capitec Business – CSV', extension: 'csv' },
  { kind: 'mapped_csv', label: 'Other bank – CSV mapped to the bank\'s template', extension: 'csv' },
];

export type MappedColumn =
  | 'name' | 'account_number' | 'branch_code' | 'account_type' | 'amount'
  | 'own_reference' | 'recipient_reference' | 'employee_number' | 'action_date' | 'blank';

export type BankPaymentProfile = {
  name: string;
  kind: BankFileKind;
  payingAccountNumber: string;
  payingBranchCode: string;
  payingAccountName: string;
  /** ACB: the 4-character user code issued by the bank. */
  userCode: string | null;
  /** ACB: up to 10 characters, prefixed to every statement reference. */
  abbreviatedName: string | null;
  /** ACB: SAMEDAY, ONE DAY or TWO DAY. */
  serviceType: string;
  /** ACB entry class (statistical; confirm with the bank). */
  entryClass: string;
  installationGeneration: number;
  userGeneration: number;
  /** Text on the company's statement; {period} is replaced. */
  ownReference: string;
  /** Text on each employee's statement; {period} and {employee_number} are replaced. */
  recipientReference: string;
  includeHashTotal: boolean;
  csvColumns: MappedColumn[];
  csvHeader: boolean;
  csvDelimiter: ',' | ';';
  csvAmountStyle: 'rands' | 'cents' | 'rands_no_decimals';
  csvDateFormat: 'YYYYMMDD' | 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'YYYY/MM/DD';
};

export type BankPayment = {
  employeeName: string;
  employeeNumber: string | null;
  accountNumber: string | null;
  branchCode: string | null;
  bankName: string | null;
  /** Employee bank account type (current, savings, transmission, …). */
  accountType: string | null;
  amount: number;
};

export type BankFileIssue = { severity: 'error' | 'warning'; employeeName?: string; message: string };

export type BankFileResult = {
  content: string;
  fileName: string;
  issues: BankFileIssue[];
  control: { payments: number; total: number; hashTotal: string | null; actionDate: string };
};

/** Universal (electronic) branch codes. Data, not law: check with the bank when in doubt. */
export const UNIVERSAL_BRANCH_CODES: Array<{ bank: string; code: string; match: RegExp }> = [
  { bank: 'Absa', code: '632005', match: /\babsa\b/i },
  { bank: 'FNB', code: '250655', match: /\b(fnb|first national|rmb)\b/i },
  { bank: 'Standard Bank', code: '051001', match: /standard\s*bank/i },
  { bank: 'Nedbank', code: '198765', match: /nedbank/i },
  { bank: 'Capitec', code: '470010', match: /capitec/i },
  { bank: 'African Bank', code: '430000', match: /african\s*bank/i },
  { bank: 'Discovery Bank', code: '679000', match: /discovery/i },
  { bank: 'TymeBank', code: '678910', match: /tyme/i },
  { bank: 'Bank Zero', code: '888000', match: /bank\s*zero/i },
  { bank: 'Investec', code: '580105', match: /investec/i },
  { bank: 'Bidvest Bank', code: '462005', match: /bidvest/i },
  { bank: 'Sasfin', code: '683000', match: /sasfin/i },
  { bank: 'Albaraka', code: '800000', match: /albaraka/i },
  { bank: 'HSBC', code: '587000', match: /hsbc/i },
  { bank: 'Citibank', code: '350005', match: /citi/i },
];

/** The universal branch code for a bank name, if it is a known bank. */
export function universalBranchCode(bankName: string | null | undefined): string | null {
  if (!bankName) return null;
  return UNIVERSAL_BRANCH_CODES.find((b) => b.match.test(bankName))?.code ?? null;
}

/** ACB account type code: 1 current/cheque, 2 savings, 3 transmission, 4 bond, 6 subscription share. */
export function acbAccountType(accountType: string | null | undefined): string {
  switch (accountType) {
    case 'savings': return '2';
    case 'transmission': return '3';
    case 'bond': return '4';
    case 'subscription_share': return '6';
    default: return '1';
  }
}

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
/** Bank files take plain upper-case text: letters, digits, space and . - & / */
export function bankText(value: string | null | undefined, max: number): string {
  return (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 .\-&/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}
const padRight = (v: string, n: number) => v.slice(0, n).padEnd(n, ' ');
const padNum = (v: string | number, n: number) => String(v).replace(/\D/g, '').slice(-n).padStart(n, '0');
const cents = (n: number) => Math.round(n * 100);
const yymmdd = (iso: string) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

/** Account-number hash: sum of the recipient accounts plus the paying account once; last 12 digits. */
export function accountHash(accounts: string[], payingAccount: string): string {
  let total = 0n;
  for (const a of accounts) total += BigInt(digits(a).slice(-11) || '0');
  total += BigInt(digits(payingAccount).slice(-11) || '0');
  return total.toString().slice(-12).padStart(12, '0');
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Checks the profile and the payments; payments with errors are left out of the file. */
export function validatePayments(profile: BankPaymentProfile, payments: BankPayment[]): { valid: BankPayment[]; issues: BankFileIssue[] } {
  const issues: BankFileIssue[] = [];
  const valid: BankPayment[] = [];
  if (!/^\d{1,16}$/.test(digits(profile.payingAccountNumber)) || !digits(profile.payingAccountNumber)) {
    issues.push({ severity: 'error', message: 'The bank payment profile has no paying account number.' });
  }
  if (!/^\d{6}$/.test(digits(profile.payingBranchCode))) issues.push({ severity: 'error', message: 'The paying branch code must be 6 digits.' });
  if (profile.kind === 'acb' && !/^[A-Z0-9]{4}$/i.test(profile.userCode ?? '')) {
    issues.push({ severity: 'error', message: 'An ACB file needs the 4-character user code the bank issued.' });
  }
  for (const p of payments) {
    const name = p.employeeName;
    if (!(p.amount > 0)) {
      issues.push({ severity: 'warning', employeeName: name, message: `${name}: nothing to pay (net pay ${p.amount.toFixed(2)}); left out.` });
      continue;
    }
    const account = digits(p.accountNumber);
    const branch = digits(p.branchCode) || universalBranchCode(p.bankName) || '';
    if (!account) { issues.push({ severity: 'error', employeeName: name, message: `${name}: no bank account number; left out of the file.` }); continue; }
    if (account.length > 20) {
      issues.push({ severity: 'error', employeeName: name, message: `${name}: account number ${account} is too long.` }); continue;
    }
    if (!/^\d{6}$/.test(branch)) { issues.push({ severity: 'error', employeeName: name, message: `${name}: no 6-digit branch code (and the bank is not recognised for a universal code); left out.` }); continue; }
    if (profile.kind === 'capitec_csv' && p.amount > 999_999.99) {
      issues.push({ severity: 'error', employeeName: name, message: `${name}: Capitec accepts at most R999 999.99 a line.` }); continue;
    }
    if (!digits(p.branchCode)) issues.push({ severity: 'warning', employeeName: name, message: `${name}: no branch code on the employee; the universal code ${branch} was used.` });
    valid.push({ ...p, accountNumber: account, branchCode: branch });
  }
  return { valid, issues };
}

export type BankFileOptions = {
  actionDate: string;
  creationDate: string;
  period: string;
  companyName: string;
  sequenceStart?: number;
};

function references(profile: BankPaymentProfile, options: BankFileOptions, p?: BankPayment) {
  const values = { period: options.period, employee_number: p?.employeeNumber ?? '', company: options.companyName };
  return {
    own: bankText(fillTemplate(profile.ownReference || 'SALARY {period}', values), 20),
    recipient: bankText(fillTemplate(profile.recipientReference || '{company} SALARY', values), 20),
  };
}

function buildAcb(profile: BankPaymentProfile, payments: BankPayment[], options: BankFileOptions, fnbVariant: boolean) {
  const userCode = padRight(bankText(profile.userCode ?? '', 4), 4);
  const branch = padNum(profile.payingBranchCode, 6);
  const account = padNum(digits(profile.payingAccountNumber).slice(-11), 11);
  const creation = yymmdd(options.creationDate);
  const action = yymmdd(options.actionDate);
  const purge = yymmdd(addDays(options.actionDate, 30));
  const abbreviated = padRight(bankText(profile.abbreviatedName || options.companyName, 10), 10);
  const installationGen = padNum(profile.installationGeneration, 4);
  const service = padRight(profile.serviceType || 'SAMEDAY', 10);
  const firstSeq = options.sequenceStart ?? 1;
  const rec = (s: string) => {
    if (s.length !== 180) throw new Error(`ACB record is ${s.length} characters, expected 180`);
    return s;
  };
  const header02 = rec('02' + '1001' + ' '.repeat(8) + userCode + '0021' + creation + purge + installationGen + '1800' + '0180' + padRight('MAGTAPE', 10) + ' '.repeat(8) + ' '.repeat(116));
  const header04 = rec('04' + userCode + creation + purge + action + action + padNum(firstSeq, 6) + padNum(profile.userGeneration, 4) + service + ' '.repeat(130));
  const lines: string[] = [];
  let seq = firstSeq;
  let total = 0;
  for (const p of payments) {
    const acct = digits(p.accountNumber);
    const standard = acct.length <= 11 ? padNum(acct, 11) : '0'.repeat(11);
    const nonStandard = acct.length > 11 ? padNum(acct, 20) : '0'.repeat(20);
    const amount = padNum(cents(p.amount), 11);
    const ref = references(profile, options, p);
    total += cents(p.amount);
    if (fnbVariant) {
      lines.push(rec('10' + branch + account + '0000' + padNum(seq, 6) + padNum(p.branchCode!, 6) + standard + acbAccountType(p.accountType) + amount
        + '0'.repeat(8) + '0' + '000' + padRight(ref.recipient, 20) + ' '.repeat(10) + padRight(bankText(p.employeeName, 15), 15) + ' '.repeat(15) + nonStandard + ' '.repeat(30)));
    } else {
      lines.push(rec('10' + branch + account + userCode + padNum(seq, 6) + padNum(p.branchCode!, 6) + standard + acbAccountType(p.accountType) + amount
        + action + padNum(profile.entryClass || '61', 2) + '0' + '00' + '0' + abbreviated + padRight(ref.recipient, 20) + padRight(bankText(p.employeeName, 30), 30)
        + nonStandard + ' '.repeat(16) + '21' + ' '.repeat(12)));
    }
    seq += 1;
  }
  const contraRef = references(profile, options);
  const contra = fnbVariant
    ? rec('12' + branch + account + '0'.repeat(39) + action + ' '.repeat(116))
    : rec('12' + branch + account + userCode + padNum(seq, 6) + branch + account + '1' + padNum(total, 11) + action + '10' + '0000'
      + abbreviated + padRight(bankText(`CONTRA ${contraRef.own}`, 20), 20) + padRight(bankText(profile.payingAccountName || options.companyName, 30), 30) + ' '.repeat(50));
  const hash = accountHash(payments.map((p) => digits(p.accountNumber)), profile.payingAccountNumber);
  const lastSeq = seq;
  const trailer92 = fnbVariant
    ? rec('92' + ' '.repeat(70) + (profile.includeHashTotal ? hash : '0'.repeat(12)) + ' '.repeat(96))
    : rec('92' + userCode + padNum(firstSeq, 6) + padNum(lastSeq, 6) + action + action + padNum(1, 6) + padNum(payments.length, 6) + padNum(1, 6)
      + padNum(total, 12) + padNum(total, 12) + hash + ' '.repeat(96));
  // Every record in the file: 02, 04, the payments, the contra, 92 and 94.
  const recordCount = payments.length + 5;
  const trailer94 = rec('94' + header02.slice(2, 56) + padNum(Math.ceil(recordCount / 10), 6) + padNum(recordCount, 6) + padNum(2, 6) + ' '.repeat(106));
  return { content: [header02, header04, ...lines, contra, trailer92, trailer94].join('\r\n') + '\r\n', hash };
}

function csvField(value: string, delimiter: string): string {
  return value.includes(delimiter) || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
}

function formatDate(iso: string, style: BankPaymentProfile['csvDateFormat']): string {
  const [y, m, d] = iso.split('-');
  switch (style) {
    case 'YYYY-MM-DD': return iso;
    case 'DD/MM/YYYY': return `${d}/${m}/${y}`;
    case 'YYYY/MM/DD': return `${y}/${m}/${d}`;
    default: return `${y}${m}${d}`;
  }
}

function formatAmount(amount: number, style: BankPaymentProfile['csvAmountStyle']): string {
  if (style === 'cents') return String(cents(amount));
  if (style === 'rands_no_decimals') return String(Math.round(amount));
  return (cents(amount) / 100).toFixed(2);
}

/** Builds the payment file. Payments with errors are left out and listed in issues. */
export function buildBankFile(profile: BankPaymentProfile, payments: BankPayment[], options: BankFileOptions): BankFileResult {
  const { valid, issues } = validatePayments(profile, payments);
  const blocking = issues.some((i) => i.severity === 'error' && !i.employeeName);
  const total = Math.round(valid.reduce((s, p) => s + cents(p.amount), 0)) / 100;
  const ext = BANK_FILE_KINDS.find((k) => k.kind === profile.kind)?.extension ?? 'csv';
  const fileName = `${bankText(options.companyName, 20).replace(/\s+/g, '_') || 'PAYROLL'}_${profile.kind.toUpperCase()}_${options.period.replace(/\W/g, '')}_${options.actionDate.replace(/-/g, '')}.${ext}`;
  const base = { fileName, issues, control: { payments: valid.length, total, hashTotal: null as string | null, actionDate: options.actionDate } };
  if (blocking || !valid.length) {
    if (!valid.length && !blocking) issues.push({ severity: 'error', message: 'There is nothing to pay in this file.' });
    return { ...base, content: '' };
  }

  if (profile.kind === 'acb' || profile.kind === 'fnb_obe_acb') {
    const { content, hash } = buildAcb(profile, valid, options, profile.kind === 'fnb_obe_acb');
    return { ...base, content, control: { ...base.control, hashTotal: hash } };
  }

  if (profile.kind === 'fnb_obe_csv') {
    const hash = accountHash(valid.map((p) => digits(p.accountNumber)), profile.payingAccountNumber);
    const width = 36;
    const row = (cells: string[]) => [...cells, ...Array(Math.max(0, width - cells.length)).fill('')].map((c) => csvField(c, ',')).join(',');
    const header = ['RECIPIENT NAME', 'RECIPIENT ACCOUNT', 'RECIPIENT ACCOUNT TYPE', 'BRANCHCODE', 'AMOUNT', 'OWN REFERENCE', 'RECIPIENT REFERENCE'];
    const rows = [
      row(['BInSol - U ver 1.00']),
      row([formatDate(options.actionDate, 'YYYY/MM/DD')]),
      row([digits(profile.payingAccountNumber), profile.includeHashTotal ? hash : '']),
      row(header),
      ...valid.map((p) => {
        const ref = references(profile, options, p);
        return row([bankText(p.employeeName, 20), digits(p.accountNumber), acbAccountType(p.accountType), digits(p.branchCode), formatAmount(p.amount, 'rands'), bankText(ref.own, 15), ref.recipient]);
      }),
    ];
    return { ...base, content: rows.join('\r\n') + '\r\n', control: { ...base.control, hashTotal: profile.includeHashTotal ? hash : null } };
  }

  if (profile.kind === 'absa_bio_csv') {
    const rows = valid.map((p) => {
      const ref = references(profile, options, p);
      return [digits(p.accountNumber), bankText(p.employeeName, 30), digits(p.branchCode), formatAmount(p.amount, 'rands'), ref.recipient].map((c) => csvField(c, ',')).join(',');
    });
    return { ...base, content: rows.join('\r\n') + '\r\n' };
  }

  if (profile.kind === 'capitec_csv') {
    const rows = valid.map((p) => {
      const ref = references(profile, options, p);
      return [digits(p.branchCode), digits(p.accountNumber), formatAmount(p.amount, 'rands'), ref.recipient, bankText(ref.own, 20), bankText(p.employeeName, 16)].map((c) => csvField(c, ',')).join(',');
    });
    return { ...base, content: rows.join('\r\n') + '\r\n' };
  }

  // mapped_csv
  const columns = profile.csvColumns.length ? profile.csvColumns : (['name', 'account_number', 'branch_code', 'amount', 'recipient_reference'] as MappedColumn[]);
  const d = profile.csvDelimiter || ',';
  const titles: Record<MappedColumn, string> = {
    name: 'Name', account_number: 'Account Number', branch_code: 'Branch Code', account_type: 'Account Type', amount: 'Amount',
    own_reference: 'Own Reference', recipient_reference: 'Beneficiary Reference', employee_number: 'Employee Number', action_date: 'Date', blank: '',
  };
  const value = (c: MappedColumn, p: BankPayment) => {
    const ref = references(profile, options, p);
    switch (c) {
      case 'name': return bankText(p.employeeName, 30);
      case 'account_number': return digits(p.accountNumber);
      case 'branch_code': return digits(p.branchCode);
      case 'account_type': return acbAccountType(p.accountType);
      case 'amount': return formatAmount(p.amount, profile.csvAmountStyle);
      case 'own_reference': return ref.own;
      case 'recipient_reference': return ref.recipient;
      case 'employee_number': return bankText(p.employeeNumber, 20);
      case 'action_date': return formatDate(options.actionDate, profile.csvDateFormat);
      default: return '';
    }
  };
  const rows = [
    ...(profile.csvHeader ? [columns.map((c) => csvField(titles[c], d)).join(d)] : []),
    ...valid.map((p) => columns.map((c) => csvField(value(c, p), d)).join(d)),
  ];
  return { ...base, content: rows.join('\r\n') + '\r\n' };
}
