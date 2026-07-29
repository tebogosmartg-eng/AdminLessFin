/**
 * Canonical Chart of Accounts role resolution.
 * Runtime accounting identity must never use display-name string matching.
 */

export const ACCOUNT_ROLES = [
  'trade_receivable',
  'trade_payable',
  'output_vat',
  'input_vat',
  'vat_control',
  'inventory_asset',
  'cogs',
  'retained_earnings',
  'current_year_earnings',
  'suspense',
  'rounding',
  'exchange_gain_loss',
  'accumulated_depreciation',
  'depreciation_expense',
  'fixed_asset',
  'gain_on_disposal',
  'loss_on_disposal',
  'payroll_clearing',
  'payroll_control',
  'bank',
  'cash',
  'sales',
] as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const SINGLETON_ACCOUNT_ROLES: ReadonlySet<AccountRole> = new Set([
  'trade_receivable',
  'trade_payable',
  'output_vat',
  'input_vat',
  'vat_control',
  'inventory_asset',
  'retained_earnings',
  'current_year_earnings',
  'suspense',
  'rounding',
]);

export const CASH_EQUIVALENT_SUBCATEGORY = 'Cash and Cash Equivalents';

export type AccountRoleMetadata = {
  id: string;
  name?: string | null;
  type?: string | null;
  account_role?: string | null;
  tax_treatment?: string | null;
  account_code?: string | null;
  category?: string | null;
  subcategory?: string | null;
  control_account?: boolean | null;
  system_account?: boolean | null;
  is_active?: boolean | null;
};

const CODE_TO_ROLE: Record<string, AccountRole> = {
  '1220': 'trade_receivable',
  '2110': 'trade_payable',
  '1210': 'inventory_asset',
  '2120': 'output_vat',
  '1240': 'input_vat',
  '2125': 'vat_control',
  '3020': 'retained_earnings',
  '1190': 'accumulated_depreciation',
  '6060': 'depreciation_expense',
  '5020': 'cogs',
  '4530': 'gain_on_disposal',
  '8020': 'loss_on_disposal',
  '1260': 'bank',
  '1270': 'cash',
  '4010': 'sales',
};

const TAX_TREATMENT_TO_ROLE: Record<string, AccountRole> = {
  vat_output: 'output_vat',
  vat_input: 'input_vat',
  vat_control: 'vat_control',
};

const VAT_TAX_TREATMENTS = new Set(['vat_output', 'vat_input', 'vat_control']);
const VAT_ROLES = new Set<AccountRole>(['output_vat', 'input_vat', 'vat_control']);

function isActive(account: AccountRoleMetadata): boolean {
  return account.is_active !== false;
}

/** Infer role from stable metadata only (never display name). */
export function inferAccountRole(account: AccountRoleMetadata): AccountRole | null {
  if (account.account_role && (ACCOUNT_ROLES as readonly string[]).includes(account.account_role)) {
    return account.account_role as AccountRole;
  }
  if (account.tax_treatment && TAX_TREATMENT_TO_ROLE[account.tax_treatment]) {
    return TAX_TREATMENT_TO_ROLE[account.tax_treatment];
  }
  if (account.account_code && CODE_TO_ROLE[account.account_code]) {
    return CODE_TO_ROLE[account.account_code];
  }
  if (account.system_account && account.type === 'Equity') {
    return 'retained_earnings';
  }
  if (account.type === 'Asset' && account.control_account && account.subcategory === 'Inventory') {
    return 'inventory_asset';
  }
  if (
    account.type === 'Asset' &&
    account.control_account &&
    account.subcategory === 'Trade and Other Receivables' &&
    !account.tax_treatment
  ) {
    return 'trade_receivable';
  }
  if (
    account.type === 'Liability' &&
    account.control_account &&
    account.subcategory === 'Trade and Other Payables' &&
    !account.tax_treatment
  ) {
    return 'trade_payable';
  }
  if (account.type === 'Expense' && account.category === 'Cost of Sales' && account.account_code === '5020') {
    return 'cogs';
  }
  return null;
}

export function findAccountByRole<T extends AccountRoleMetadata>(
  accounts: T[] | undefined | null,
  role: AccountRole,
): T | undefined {
  if (!accounts?.length) return undefined;
  const active = accounts.filter(isActive);
  const byRole = active.find((a) => a.account_role === role);
  if (byRole) return byRole;
  return active.find((a) => inferAccountRole(a) === role);
}

export function findAccountsByRole<T extends AccountRoleMetadata>(
  accounts: T[] | undefined | null,
  role: AccountRole,
): T[] {
  if (!accounts?.length) return [];
  return accounts.filter((a) => isActive(a) && (a.account_role === role || inferAccountRole(a) === role));
}

export function isCashEquivalentAccount(account: AccountRoleMetadata): boolean {
  const role = (account.account_role as AccountRole | null) ?? inferAccountRole(account);
  if (role === 'bank' || role === 'cash') return true;
  return account.subcategory === CASH_EQUIVALENT_SUBCATEGORY;
}

export function findCashEquivalentAccounts<T extends AccountRoleMetadata>(
  accounts: T[] | undefined | null,
): T[] {
  if (!accounts?.length) return [];
  return accounts.filter((a) => isActive(a) && a.type === 'Asset' && isCashEquivalentAccount(a));
}

export function isTaxLedgerAccount(account: AccountRoleMetadata | null | undefined): boolean {
  if (!account) return false;
  if (account.tax_treatment && VAT_TAX_TREATMENTS.has(account.tax_treatment)) return true;
  const role = (account.account_role as AccountRole | null) ?? inferAccountRole(account);
  return !!role && VAT_ROLES.has(role);
}

export function isCurrentAssetAccount(account: AccountRoleMetadata): boolean {
  return account.category === 'Current Assets' || account.type === 'Asset' && (
    account.subcategory === CASH_EQUIVALENT_SUBCATEGORY ||
    account.subcategory === 'Inventory' ||
    account.subcategory === 'Trade and Other Receivables' ||
    inferAccountRole(account) === 'trade_receivable' ||
    inferAccountRole(account) === 'inventory_asset' ||
    inferAccountRole(account) === 'input_vat'
  );
}

export function isCurrentLiabilityAccount(account: AccountRoleMetadata): boolean {
  return account.category === 'Current Liabilities' || (
    account.type === 'Liability' && (
      account.subcategory === 'Trade and Other Payables' ||
      account.subcategory === 'Statutory Payables' ||
      inferAccountRole(account) === 'trade_payable' ||
      inferAccountRole(account) === 'output_vat' ||
      inferAccountRole(account) === 'vat_control'
    )
  );
}

export type ResolvedControlAccounts<T extends AccountRoleMetadata> = {
  ar?: T;
  ap?: T;
  outputVat?: T;
  inputVat?: T;
  vatControl?: T;
  inventory?: T;
  cogs?: T;
  retainedEarnings?: T;
  currentYearEarnings?: T;
  suspense?: T;
  sales?: T;
  bank?: T;
  cash?: T;
  payrollControl?: T;
  depreciationExpense?: T;
  accumulatedDepreciation?: T;
  rounding?: T;
  exchangeGainLoss?: T;
};

export function resolveControlAccounts<T extends AccountRoleMetadata>(
  accounts: T[] | undefined | null,
): ResolvedControlAccounts<T> {
  return {
    ar: findAccountByRole(accounts, 'trade_receivable'),
    ap: findAccountByRole(accounts, 'trade_payable'),
    outputVat: findAccountByRole(accounts, 'output_vat'),
    inputVat: findAccountByRole(accounts, 'input_vat'),
    vatControl: findAccountByRole(accounts, 'vat_control'),
    inventory: findAccountByRole(accounts, 'inventory_asset'),
    cogs: findAccountByRole(accounts, 'cogs'),
    retainedEarnings: findAccountByRole(accounts, 'retained_earnings'),
    currentYearEarnings: findAccountByRole(accounts, 'current_year_earnings'),
    suspense: findAccountByRole(accounts, 'suspense'),
    sales: findAccountByRole(accounts, 'sales'),
    bank: findAccountByRole(accounts, 'bank'),
    cash: findAccountByRole(accounts, 'cash'),
    payrollControl: findAccountByRole(accounts, 'payroll_control'),
    depreciationExpense: findAccountByRole(accounts, 'depreciation_expense'),
    accumulatedDepreciation: findAccountByRole(accounts, 'accumulated_depreciation'),
    rounding: findAccountByRole(accounts, 'rounding'),
    exchangeGainLoss: findAccountByRole(accounts, 'exchange_gain_loss'),
  };
}

/** Template account_code → role used when generating a CoA. */
export function roleForTemplateCode(code: string, tax?: string | null): AccountRole | undefined {
  if (tax && TAX_TREATMENT_TO_ROLE[tax]) return TAX_TREATMENT_TO_ROLE[tax];
  return CODE_TO_ROLE[code];
}
