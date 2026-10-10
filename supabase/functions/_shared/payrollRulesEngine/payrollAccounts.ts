/**
 * The ledger accounts payroll posts to, and how each must be classified for the
 * financial statements to present it (ADR-0009).
 *
 * Each role is one line of the payroll journal. The classification is what the
 * statements need: wages and employer contributions under Employee Costs (the
 * employee costs note), PAYE, UIF and SDL under Statutory Payables (their own
 * line on the statement of financial position), fund and medical aid
 * contributions owed under Trade and Other Payables. A mapped account that is
 * classified otherwise still posts; the settings screen says what to change.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

export type PayrollAccountRole =
  | 'salary_expense'
  | 'uif_employer_expense'
  | 'sdl_expense'
  | 'bank'
  | 'paye_control'
  | 'uif_control'
  | 'sdl_control'
  | 'retirement_fund_control'
  | 'medical_aid_control'
  | 'employee_deductions';

export type PayrollAccountSpec = {
  role: PayrollAccountRole;
  label: string;
  help: string;
  type: 'Asset' | 'Liability' | 'Expense';
  category: string;
  subcategory: string;
  /** The standard chart's account for this role, used when the company has none. */
  template: { number: number; name: string; tax?: string; control?: boolean };
  /** The finalise step needs it (the others fall back to a related account). */
  required?: boolean;
};

export const PAYROLL_ACCOUNTS: PayrollAccountSpec[] = [
  {
    role: 'salary_expense', label: 'Salaries and wages', help: 'Gross pay of every payslip.',
    type: 'Expense', category: 'Operating Expenses', subcategory: 'Employee Costs',
    template: { number: 6080, name: 'Salaries and Wages' }, required: true,
  },
  {
    role: 'uif_employer_expense', label: 'UIF contribution (employer)', help: "The employer's 1% UIF.",
    type: 'Expense', category: 'Operating Expenses', subcategory: 'Employee Costs',
    template: { number: 6090, name: 'UIF Contribution (Employer)' },
  },
  {
    role: 'sdl_expense', label: 'Skills development levy', help: 'SDL of 1% of payroll.',
    type: 'Expense', category: 'Operating Expenses', subcategory: 'Employee Costs',
    template: { number: 6100, name: 'SDL Contribution (Employer)' },
  },
  {
    role: 'bank', label: 'Bank account salaries are paid from', help: 'Net pay.',
    type: 'Asset', category: 'Current Assets', subcategory: 'Cash and Cash Equivalents',
    template: { number: 1260, name: 'Bank - Current Account' }, required: true,
  },
  {
    role: 'paye_control', label: 'PAYE payable', help: "Employees' tax owed to SARS.",
    type: 'Liability', category: 'Current Liabilities', subcategory: 'Statutory Payables',
    template: { number: 2130, name: 'PAYE Payable', tax: 'paye', control: true },
  },
  {
    role: 'uif_control', label: 'UIF payable', help: 'Employee and employer UIF owed.',
    type: 'Liability', category: 'Current Liabilities', subcategory: 'Statutory Payables',
    template: { number: 2140, name: 'UIF Payable', tax: 'uif', control: true },
  },
  {
    role: 'sdl_control', label: 'SDL payable', help: 'Skills development levy owed to SARS.',
    type: 'Liability', category: 'Current Liabilities', subcategory: 'Statutory Payables',
    template: { number: 2150, name: 'SDL Payable', tax: 'sdl', control: true },
  },
  {
    role: 'retirement_fund_control', label: 'Pension and provident fund payable', help: 'Fund contributions deducted, owed to the fund.',
    type: 'Liability', category: 'Current Liabilities', subcategory: 'Trade and Other Payables',
    template: { number: 2161, name: 'Retirement Fund Contributions Payable' },
  },
  {
    role: 'medical_aid_control', label: 'Medical aid payable', help: 'Medical aid deducted, owed to the scheme.',
    type: 'Liability', category: 'Current Liabilities', subcategory: 'Trade and Other Payables',
    template: { number: 2162, name: 'Medical Aid Contributions Payable' },
  },
  {
    role: 'employee_deductions', label: 'Other payroll deductions payable', help: 'Any other deduction (union fees, garnishee orders).',
    type: 'Liability', category: 'Current Liabilities', subcategory: 'Trade and Other Payables',
    template: { number: 2163, name: 'Other Payroll Deductions Payable' },
  },
];

export type LedgerAccount = {
  id: string;
  name: string;
  type?: string | null;
  category?: string | null;
  subcategory?: string | null;
  is_active?: boolean | null;
};

const same = (a: unknown, b: string) => String(a ?? '').trim().toLowerCase() === b.toLowerCase();

/**
 * What to change about an account mapped to a role so the statements present it
 * correctly, or null when it is classified as the role needs.
 */
export function classificationAdvice(spec: PayrollAccountSpec, account: LedgerAccount): string | null {
  if (!same(account.type, spec.type)) return `${account.name} is ${account.type ?? 'unclassified'}; this role needs a ${spec.type.toLowerCase()} account.`;
  if (!same(account.category, spec.category) || !same(account.subcategory, spec.subcategory)) {
    return `Classify ${account.name} as ${spec.category} › ${spec.subcategory} so the financial statements show it ${
      spec.subcategory === 'Employee Costs' ? 'in employee costs' : spec.subcategory === 'Statutory Payables' ? 'under statutory payables' : spec.subcategory === 'Cash and Cash Equivalents' ? 'as cash' : 'in trade and other payables'
    } (it is ${account.category ?? 'unclassified'}${account.subcategory ? ` › ${account.subcategory}` : ''}).`;
  }
  return null;
}

/**
 * The account a role would use when the company has not chosen one: an active
 * account that is already the standard chart's account for it (by tax treatment
 * for PAYE, UIF and SDL, otherwise by name and classification).
 */
export function suggestAccount(
  spec: PayrollAccountSpec,
  accounts: Array<LedgerAccount & { tax_treatment?: string | null; account_role?: string | null }>,
): string | null {
  const active = accounts.filter((a) => a.is_active !== false && same(a.type, spec.type));
  const byTax = spec.template.tax ? active.filter((a) => same(a.tax_treatment, spec.template.tax!)) : [];
  if (byTax.length === 1) return byTax[0].id;
  const byName = active.filter((a) => same(a.name, spec.template.name));
  if (byName.length === 1) return byName[0].id;
  if (spec.role === 'bank') {
    const banks = active.filter((a) => same(a.account_role, 'bank') || (same(a.subcategory, spec.subcategory) && /bank/i.test(a.name)));
    if (banks.length === 1) return banks[0].id;
  }
  return null;
}
