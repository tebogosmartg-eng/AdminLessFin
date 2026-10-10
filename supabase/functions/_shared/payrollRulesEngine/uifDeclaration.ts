/**
 * Monthly UIF declaration to the Department of Employment and Labour: the electronic
 * declaration file in "UIF Electronic Declaration Specifications, Version E03" (DoL,
 * 16 Sep 2002), U1 layout (SARS-style code,value pairs). Records: Creator UICR, then each
 * employee UIWK, then the employer UIEM trailer. Emailed to declarations@labour.gov.za
 * (subject "Declarations", one file per email) by the 7th of the following month.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

/** UIF contributions: 1% employee + 1% employer on remuneration up to the monthly ceiling. */
export const UIF_CEILINGS = [{ from: '2021-06-01', monthly: 17_712 }, { from: '2002-04-01', monthly: 14_872 }];

export function uifMonthlyCeiling(month: string): number {
  return UIF_CEILINGS.find((c) => `${month}-01` >= c.from)?.monthly ?? 17_712;
}

/** Employment status at month end (field 8280). */
export const UIF_EMPLOYMENT_STATUS: Record<string, { code: string; label: string }> = {
  active: { code: '01', label: 'Active' },
  deceased: { code: '02', label: 'Deceased' },
  retired: { code: '03', label: 'Retired' },
  dismissed: { code: '04', label: 'Dismissed' },
  contract_expired: { code: '05', label: 'Contract expired' },
  resigned: { code: '06', label: 'Resigned' },
  constructive_dismissal: { code: '07', label: 'Constructively dismissed' },
  insolvency: { code: '08', label: 'Employer insolvent' },
  maternity: { code: '09', label: 'Maternity / adoption leave' },
  illness: { code: '10', label: 'Illness leave' },
  retrenched: { code: '11', label: 'Retrenched' },
  transferred: { code: '12', label: 'Transferred to another branch' },
  absconded: { code: '13', label: 'Absconded' },
  business_closed: { code: '14', label: 'Business closed' },
};

/** Reason for no contribution (field 8290). There is no 07 in the specification. */
export const UIF_NON_CONTRIBUTION: Record<string, string> = {
  '01': 'Temporary employee (under 24 hours a month)',
  '02': 'Learner (Skills Development Act)',
  '03': 'National or provincial government employee',
  '04': 'Repatriated at the end of contract',
  '05': 'Commission only',
  '06': 'No income paid for the period',
  '08': 'Pension payment only',
};

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * UIF reference number check digit (Appendix A): digits d1..d7 weighted 1,2,4,5,7,8,2, each
 * product mod 11, summed; the sum mod 10 is the check digit d8. "123456/8" is 0123456/8.
 */
export function normaliseUifReference(value: string | null | undefined): string | null {
  const d = digits(value);
  if (!d || d.length > 8) return null;
  return d.padStart(8, '0');
}

export function isValidUifReference(value: string | null | undefined): boolean {
  const d = normaliseUifReference(value);
  if (!d || /^0+$/.test(d)) return false;
  const weights = [1, 2, 4, 5, 7, 8, 2];
  const sum = weights.reduce((s, w, i) => s + ((Number(d[i]) * w) % 11), 0);
  return sum % 10 === Number(d[7]);
}

/** SA ID number (Luhn). */
function luhnValid(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i += 1) {
    let n = Number(id[12 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

export type UifEmployeeLine = {
  employeeId: string;
  idNumber: string | null;
  otherNumber: string | null;
  employeeNumber: string | null;
  surname: string;
  firstNames: string;
  dateOfBirth: string | null;
  employedFrom: string | null;
  employedTo: string | null;
  /** Key of UIF_EMPLOYMENT_STATUS. */
  status: string;
  /** Code of UIF_NON_CONTRIBUTION when nothing was contributed. */
  nonContributionReason: string | null;
  grossTaxable: number;
  uifRemuneration: number;
  /** Employee + employer contribution. */
  contribution: number;
  branchCode: string | null;
  accountNumber: string | null;
  accountType: string | null;
};

export type UifDeclarationInput = {
  month: string;
  live: boolean;
  /** 1–999: the file name's sequence; reuse it to overwrite a month's earlier file. */
  fileSequence: number;
  creator: { uifReference: string; contactName: string; contactPhone: string; contactEmail: string | null };
  employer: { uifReference: string; payeReference: string | null; email: string | null };
  lines: UifEmployeeLine[];
};

export type UifIssue = { severity: 'error' | 'warning'; employeeId?: string; message: string };

export function validateUifDeclaration(input: UifDeclarationInput): UifIssue[] {
  const issues: UifIssue[] = [];
  if (!isValidUifReference(input.employer.uifReference)) {
    issues.push({ severity: 'error', message: 'The employer UIF reference number (Department of Labour, e.g. 1234567/8) is missing or fails its check digit.' });
  }
  if (!input.creator.contactName.trim() || !digits(input.creator.contactPhone)) {
    issues.push({ severity: 'warning', message: 'Give a contact person and telephone number on the employer details.' });
  }
  if (input.employer.payeReference && !/^7\d{9}$/.test(digits(input.employer.payeReference))) {
    issues.push({ severity: 'warning', message: 'The PAYE number should be 10 digits starting with 7.' });
  }
  const statusCodes = new Set(Object.keys(UIF_EMPLOYMENT_STATUS));
  for (const l of input.lines) {
    const name = `${l.firstNames} ${l.surname}`.trim();
    const err = (message: string) => issues.push({ severity: 'error', employeeId: l.employeeId, message: `${name}: ${message}` });
    const warn = (message: string) => issues.push({ severity: 'warning', employeeId: l.employeeId, message: `${name}: ${message}` });
    const id = digits(l.idNumber);
    if (!(id && luhnValid(id)) && !l.otherNumber?.trim() && !l.employeeNumber?.trim()) err('an SA ID, passport or employee number is required.');
    else if (!(id && luhnValid(id))) warn('no valid SA ID number: the Fund cannot match claims reliably (also declare foreign nationals on uFiling).');
    if (!l.surname.trim() || !l.firstNames.trim()) err('surname and first names are required.');
    if (!statusCodes.has(l.status)) err('unknown employment status.');
    const terminated = !['active', 'maternity', 'illness'].includes(l.status);
    if (terminated && !l.employedTo) err('a termination date is required for this employment status.');
    if (!terminated && l.employedTo && l.employedTo.slice(0, 7) <= input.month) warn('the employee left this month: set the termination reason on the employee.');
    const expected = round2(l.uifRemuneration * 0.02);
    if (l.contribution > 0 && Math.abs(l.contribution - expected) > 0.02) {
      warn(`the contribution R${l.contribution.toFixed(2)} is not 2% of R${l.uifRemuneration.toFixed(2)} (R${expected.toFixed(2)}).`);
    }
    if (l.contribution <= 0 && !l.nonContributionReason) err('no contribution and no reason for non-contribution.');
  }
  return issues;
}

const q = (v: string) => `"${v.replace(/"/g, "'").replace(/[\r\n,]+/g, ' ').trim()}"`;
const money = (n: number) => round2(n).toFixed(2);
const ymd = (iso: string) => iso.replace(/-/g, '').slice(0, 8);

function record(fields: Array<[string, string | null | undefined]>): string {
  return fields.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== '0.00').map(([c, v]) => `${c},${v}`).join(',');
}

/** The E03 U1 file and its name (last 8 digits of the creator's UIF reference . sequence). */
export function buildUifDeclaration(input: UifDeclarationInput): { content: string; fileName: string; issues: UifIssue[]; totals: { gross: number; remuneration: number; contributions: number; employees: number } } {
  const issues = validateUifDeclaration(input);
  const creatorRef = (normaliseUifReference(input.creator.uifReference) ?? '').padStart(9, '0');
  const employerRef = (normaliseUifReference(input.employer.uifReference) ?? '').padStart(9, '0');
  const totals = {
    gross: round2(input.lines.reduce((s, l) => s + l.grossTaxable, 0)),
    remuneration: round2(input.lines.reduce((s, l) => s + l.uifRemuneration, 0)),
    contributions: round2(input.lines.reduce((s, l) => s + l.contribution, 0)),
    employees: input.lines.length,
  };
  const lines = [
    record([
      ['8000', q('UICR')], ['8010', q('U1')], ['8015', q('E03')], ['8020', q(creatorRef)], ['8030', q(input.live ? 'LIVE' : 'TEST')],
      ['8040', input.creator.contactName ? q(input.creator.contactName.slice(0, 30)) : null],
      ['8050', digits(input.creator.contactPhone) ? q(digits(input.creator.contactPhone).slice(0, 16)) : null],
      ['8060', input.creator.contactEmail ? q(input.creator.contactEmail.slice(0, 50)) : null],
      ['8070', input.month.replace('-', '')],
    ]),
    ...input.lines.map((l) => {
      const id = digits(l.idNumber);
      const status = UIF_EMPLOYMENT_STATUS[l.status]?.code ?? '01';
      const terminated = !['01', '09', '10'].includes(status);
      return record([
        ['8001', q('UIWK')], ['8110', q(employerRef)],
        ['8200', id && luhnValid(id) ? id : null],
        ['8210', l.otherNumber?.trim() ? q(l.otherNumber.trim().slice(0, 16)) : null],
        ['8220', l.employeeNumber?.trim() ? q(l.employeeNumber.trim().slice(0, 25)) : null],
        ['8230', q(l.surname.slice(0, 120))], ['8240', q(l.firstNames.slice(0, 90))],
        ['8250', l.dateOfBirth ? ymd(l.dateOfBirth) : null],
        ['8260', l.employedFrom ? ymd(l.employedFrom) : null],
        ['8270', terminated && l.employedTo ? ymd(l.employedTo) : null],
        ['8280', String(Number(status))],
        ['8290', l.contribution > 0 || !l.nonContributionReason ? null : String(Number(l.nonContributionReason))],
        ['8300', money(l.grossTaxable)], ['8310', money(l.uifRemuneration)], ['8320', money(l.contribution)],
        ['8330', digits(l.branchCode) || null], ['8340', digits(l.accountNumber) || null],
        ['8350', l.accountType === 'savings' ? '2' : l.accountType === 'transmission' ? '3' : l.accountType === 'bond' ? '4' : l.accountType === 'subscription_share' ? '6' : digits(l.accountNumber) ? '1' : null],
      ]);
    }),
    record([
      ['8002', q('UIEM')], ['8115', q(employerRef)],
      ['8120', input.employer.payeReference && /^7\d{9}$/.test(digits(input.employer.payeReference)) ? digits(input.employer.payeReference) : null],
      ['8130', money(totals.gross)], ['8135', money(totals.remuneration)], ['8140', money(totals.contributions)],
      ['8150', String(totals.employees)],
      ['8160', input.employer.email ? q(input.employer.email.slice(0, 50)) : null],
    ]),
  ];
  const seq = String(Math.min(999, Math.max(1, input.fileSequence))).padStart(3, '0');
  return { content: lines.join('\r\n') + '\r\n', fileName: `${creatorRef.slice(-8)}.${seq}`, issues, totals };
}
