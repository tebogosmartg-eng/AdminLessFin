// AdminLess Fin — Enterprise Chart of Accounts Engine
// Pure, framework-agnostic accounting validation/derivation rules. Shared by
// the account form and available to any consumer that needs to keep the Chart
// of Accounts a valid accounting model. No I/O, no React — trivially testable.

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
export type NormalBalance = 'debit' | 'credit';
export type FinancialStatement =
  | 'Statement of Financial Position'
  | 'Profit or Loss';

/** The normal balance an ordinary (non-contra) account of this type carries. */
export function normalBalanceFor(type: AccountType): NormalBalance {
  return type === 'Asset' || type === 'Expense' ? 'debit' : 'credit';
}

/** The primary statement an account of this type presents on. */
export function financialStatementFor(type: AccountType): FinancialStatement {
  return type === 'Asset' || type === 'Liability' || type === 'Equity'
    ? 'Statement of Financial Position'
    : 'Profit or Loss';
}

export interface AccountValidationInput {
  type: AccountType;
  /** Optional explicit normal balance — contra accounts legitimately invert it. */
  normal_balance?: NormalBalance | null;
  /** Marks a contra account (accumulated depreciation, drawings, sales returns). */
  isContra?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Rejects accounting structures that would corrupt double-entry: a non-contra
 *  account whose normal balance contradicts its type. Contra accounts are
 *  allowed to invert, so they are exempt from the balance check. */
export function validateAccount(input: AccountValidationInput): ValidationResult {
  const errors: string[] = [];
  const expected = normalBalanceFor(input.type);

  if (
    input.normal_balance &&
    input.normal_balance !== expected &&
    !input.isContra
  ) {
    errors.push(
      `A ${input.type} account normally carries a ${expected} balance. ` +
        `Mark it as a contra account if the ${input.normal_balance} balance is intentional.`,
    );
  }

  return { valid: errors.length === 0, errors };
}
