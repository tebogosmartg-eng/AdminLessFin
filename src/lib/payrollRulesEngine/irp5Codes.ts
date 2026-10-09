/**
 * IRP5 source codes for payslip lines, stamped on every payslip item when payslips
 * are generated. IRP5 certificates are built from these codes, never from the
 * wording of a line, so renaming a line cannot move an amount to another code.
 *
 * Pay components (allowances, bonus, fringe benefits, leave pay) carry their own
 * code from the pay component catalogue. Lines with no code (union fees, garnishee
 * orders, custom deductions) are not reported on the IRP5.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

export const IRP5_INCOME = '3601';
export const IRP5_DIRECTORS_REMUNERATION = '3615';

/** Rule engine lines (basic salary and fund contributions). */
const RULE_IRP5_CODES: Record<string, string> = {
  pension: '4001',
  provident_fund: '4003',
  medical_aid: '4005',
};

/** Statutory engine lines. UIF code 4141 is the employee and employer contributions together. */
const ENGINE_IRP5_CODES: Record<string, string> = {
  paye: '4102',
  directors_paye: '4102',
  bonus_tax: '4102',
  termination_tax: '4102',
  uif: '4141',
  uif_employer: '4141',
  sdl: '4142',
};

/** IRP5 code for a rule engine line; basic salary is director's remuneration for a director. */
export function irp5CodeForRuleLine(ruleId: string, options: { isDirector?: boolean } = {}): string | null {
  if (ruleId === 'basic_salary') return options.isDirector ? IRP5_DIRECTORS_REMUNERATION : IRP5_INCOME;
  return RULE_IRP5_CODES[ruleId] ?? null;
}

/** IRP5 code for a statutory engine line (PAYE, UIF, SDL). */
export function irp5CodeForEngineLine(engineId: string): string | null {
  return ENGINE_IRP5_CODES[engineId] ?? null;
}

/** Descriptions of the IRP5 codes this payroll produces, for certificates and screens. */
export const IRP5_CODE_LABELS: Record<string, string> = {
  '3601': 'Income (taxable)',
  '3605': 'Annual payment (bonus, leave pay)',
  '3615': "Director's remuneration",
  '3701': 'Travel allowance',
  '3704': 'Subsistence allowance (taxable excess)',
  '3713': 'Other allowances (taxable)',
  '3714': 'Other allowances (non-taxable)',
  '3801': 'General fringe benefits',
  '3802': 'Use of motor vehicle',
  '3803': 'Use of asset',
  '3805': 'Accommodation',
  '3807': 'Low or interest-free loan',
  '3810': 'Medical scheme contributions (employer paid)',
  '4001': 'Pension fund contributions',
  '4003': 'Provident fund contributions',
  '4005': 'Medical scheme contributions',
  '4102': 'PAYE',
  '4141': 'UIF contributions (employee and employer)',
  '4142': 'SDL contributions',
};
