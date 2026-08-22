// ERP Phase 1B — Enterprise Accounting Validation Engine (server-side).
// Authority for Accounting Readiness. Derived from enterprise master data only.
// Does not post journals. Progress is computed dynamically.

export type AccountingReadinessStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'READY' | 'LOCKED';

export type SetupStepKey =
  | 'financial_calendar'
  | 'chart_of_accounts'
  | 'tax_configuration'
  | 'bank_accounts'
  | 'opening_balances'
  | 'validation';

export type ControlAccountRole =
  | 'trade_debtors'
  | 'trade_creditors'
  | 'vat_control'
  | 'bank'
  | 'retained_earnings'
  | 'profit_loss'
  | 'inventory'
  | 'fixed_assets'
  | 'payroll_clearing';

type CoaRow = {
  id: string;
  name: string;
  type: string;
  account_role?: string | null;
  category?: string | null;
  subcategory?: string | null;
  control_account?: boolean | null;
  system_account?: boolean | null;
  tax_treatment?: string | null;
  financial_statement?: string | null;
  normal_balance?: string | null;
  account_code?: string | null;
  account_number?: number | null;
  is_active?: boolean | null;
};

export type ReadinessFlags = {
  bank_accounts_skipped?: boolean;
  opening_balances_zero_intentional?: boolean;
  inventory_enabled?: boolean;
  fixed_assets_enabled?: boolean;
  payroll_enabled?: boolean;
};

export type ReadinessEvaluation = {
  accountingReady: boolean;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY' | 'LOCKED';
  progressPercent: number;
  steps: Record<SetupStepKey, { complete: boolean; label: string }>;
  validation: {
    activeFinancialYear: boolean;
    chartOfAccountsExists: boolean;
    accountCount: number;
    mappingsComplete: boolean;
    mandatoryControlAccounts: boolean;
    coaIntegrity: boolean;
    taxConfigurationExists: boolean;
    bankAccountOrSkipped: boolean;
    openingBalancesComplete: boolean;
    controlAccounts: Record<ControlAccountRole, boolean>;
    missingControlAccounts: ControlAccountRole[];
    coaIntegrityErrors: string[];
    errors: string[];
  };
};

const STEP_ORDER: SetupStepKey[] = [
  'financial_calendar',
  'chart_of_accounts',
  'tax_configuration',
  'bank_accounts',
  'opening_balances',
  'validation',
];

// Step labels. Mirrors SETUP_STEP_LABELS in the frontend twin
// (src/governance/domains/accountingReadiness/model.ts). Redefined locally because
// this edge module intentionally has no cross-file imports. Absence of this
// definition caused evaluateAccountingReadiness to throw "STEP_LABELS is not defined".
const STEP_LABELS: Record<SetupStepKey, string> = {
  financial_calendar: 'Financial Calendar',
  chart_of_accounts: 'Chart of Accounts',
  tax_configuration: 'Tax',
  bank_accounts: 'Banking',
  opening_balances: 'Opening Balances',
  validation: 'Validation',
};

type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

const FOUNDATIONAL_TYPES: AccountType[] = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

const ROLE_TO_ACCOUNT_ROLE: Record<string, string | string[]> = {
  trade_debtors: 'trade_receivable',
  trade_creditors: 'trade_payable',
  vat_control: ['vat_control', 'output_vat', 'input_vat'],
  retained_earnings: 'retained_earnings',
  inventory: 'inventory_asset',
  fixed_assets: 'fixed_asset',
  payroll_clearing: 'payroll_clearing',
};

const CORE_CONTROL_ROLES: ControlAccountRole[] = [
  'trade_debtors',
  'trade_creditors',
  'vat_control',
  'bank',
  'retained_earnings',
  'profit_loss',
];

function requiredControlRoles(flags: ReadinessFlags): ControlAccountRole[] {
  const roles: ControlAccountRole[] = [...CORE_CONTROL_ROLES];
  if (flags.inventory_enabled) roles.push('inventory');
  if (flags.fixed_assets_enabled) roles.push('fixed_assets');
  if (flags.payroll_enabled) roles.push('payroll_clearing');
  return roles;
}

function matchesRole(account: CoaRow, role: ControlAccountRole): boolean {
  if (role === 'bank') {
    return (
      account.account_role === 'bank' ||
      account.account_role === 'cash' ||
      account.subcategory === 'Cash and Cash Equivalents'
    );
  }
  if (role === 'vat_control') {
    return (
      account.account_role === 'vat_control' ||
      account.account_role === 'output_vat' ||
      account.account_role === 'input_vat' ||
      account.tax_treatment === 'vat_control' ||
      account.tax_treatment === 'vat_output' ||
      account.tax_treatment === 'vat_input'
    );
  }
  if (role === 'retained_earnings') {
    return account.account_role === 'retained_earnings' || account.system_account === true || account.account_code === '3020';
  }
  if (role === 'payroll_clearing') {
    return (
      account.account_role === 'payroll_clearing' ||
      account.tax_treatment === 'paye' ||
      account.tax_treatment === 'uif' ||
      account.tax_treatment === 'sdl'
    );
  }
  if (role === 'fixed_assets') {
    return account.account_role === 'fixed_asset' || account.subcategory === 'Property, Plant and Equipment';
  }
  if (role === 'inventory') {
    return account.account_role === 'inventory_asset' || account.subcategory === 'Inventory' || account.account_code === '1210';
  }
  const mapped = ROLE_TO_ACCOUNT_ROLE[role];
  if (!mapped) return false;
  const roles = Array.isArray(mapped) ? mapped : [mapped];
  if (account.account_role && roles.includes(account.account_role)) return true;
  // Stable template-code fallback for legacy charts — never display name.
  if (role === 'trade_debtors' && account.account_code === '1220') return true;
  if (role === 'trade_creditors' && account.account_code === '2110') return true;
  return false;
}

function hasRole(accounts: CoaRow[], role: ControlAccountRole): boolean {
  const active = accounts.filter((a) => a.is_active !== false);
  if (role === 'profit_loss') {
    return active.some((a) => a.type === 'Income') && active.some((a) => a.type === 'Expense');
  }
  return active.some((a) => matchesRole(a, role));
}

// Normal balance by account type. Mirrors the (module-private) helper in
// _shared/chartOfAccounts/templates.ts; redefined locally because this module
// intentionally has no cross-file imports and edge functions bundle per-function.
// Absence of this definition caused accounting-setup GET_STATUS/EVALUATE to 500
// with "ReferenceError: normalBalanceFor is not defined".
function normalBalanceFor(type: string): 'debit' | 'credit' {
  return type === 'Asset' || type === 'Expense' ? 'debit' : 'credit';
}

export function evaluateCoaIntegrity(accounts: CoaRow[]): { pass: boolean; errors: string[] } {
  const errors: string[] = [];
  if (accounts.length === 0) {
    return { pass: false, errors: ['Chart of Accounts has no accounts.'] };
  }

  const active = accounts.filter((a) => a.is_active !== false);
  if (active.length === 0) {
    errors.push('Chart of Accounts has no active accounts.');
  }

  for (const type of FOUNDATIONAL_TYPES) {
    if (!active.some((a) => a.type === type)) {
      errors.push(`Missing foundational account type: ${type}.`);
    }
  }

  const codeCounts = new Map<string, number>();
  const numberCounts = new Map<number, number>();
  for (const account of accounts) {
    if (account.account_code) {
      codeCounts.set(account.account_code, (codeCounts.get(account.account_code) ?? 0) + 1);
    }
    if (account.account_number != null) {
      numberCounts.set(account.account_number, (numberCounts.get(account.account_number) ?? 0) + 1);
    }
    if (
      FOUNDATIONAL_TYPES.includes(account.type as (typeof FOUNDATIONAL_TYPES)[number]) &&
      account.normal_balance
    ) {
      const expected = normalBalanceFor(account.type);
      const isContra =
        !!account.system_account ||
        account.account_role === 'accumulated_depreciation' ||
        (account.type === 'Asset' && account.normal_balance === 'credit') ||
        (account.type === 'Liability' && account.normal_balance === 'debit') ||
        (account.type === 'Income' && account.normal_balance === 'debit') ||
        (account.type === 'Equity' && account.normal_balance === 'debit');
      if (account.normal_balance !== expected && !isContra) {
        errors.push(
          `${account.name}: A ${account.type} account normally carries a ${expected} balance.`,
        );
      }
    }
  }

  for (const [code, count] of codeCounts) {
    if (count > 1) errors.push(`Duplicate account code: ${code}.`);
  }
  for (const [num, count] of numberCounts) {
    if (count > 1) errors.push(`Duplicate account number: ${num}.`);
  }

  return { pass: errors.length === 0, errors: errors };
}

export function evaluateAccountingReadiness(input: {
  flags: ReadinessFlags;
  financialYears: { status: string }[];
  accounts: CoaRow[];
  taxRates: { id: string }[];
  bankAccounts: { id: string; opening_balance?: number | null; opening_balance_posted?: boolean | null }[];
  payrollMappings?: { account_role: string }[];
}): ReadinessEvaluation {
  const flags = input.flags ?? {};
  const accounts = input.accounts ?? [];
  const bankAccounts = input.bankAccounts ?? [];
  const taxRates = input.taxRates ?? [];
  const financialYears = input.financialYears ?? [];

  const activeFinancialYear = financialYears.some((fy) => ['open', 'draft'].includes(fy.status));
  const chartOfAccountsExists = accounts.length > 0;
  const integrity = evaluateCoaIntegrity(accounts);
  const coaIntegrity = integrity.pass;

  const mandatoryRoles: ControlAccountRole[] = requiredControlRoles(flags);

  const controlAccounts = {} as Record<ControlAccountRole, boolean>;
  const missingControlAccounts: ControlAccountRole[] = [];

  for (const role of mandatoryRoles) {
    let satisfied = hasRole(accounts, role);
    if (role === 'bank' && (bankAccounts.length > 0 || flags.bank_accounts_skipped)) {
      satisfied = true;
    }
    if (role === 'payroll_clearing' && (input.payrollMappings?.length ?? 0) > 0) {
      satisfied = true;
    }
    controlAccounts[role] = satisfied;
    if (!satisfied) missingControlAccounts.push(role);
  }

  const mandatoryControlAccounts = missingControlAccounts.length === 0;
  const mappingsComplete = mandatoryControlAccounts;
  const accountCount = accounts.length;
  const taxConfigurationExists = taxRates.length > 0;
  const bankAccountOrSkipped = bankAccounts.length > 0 || !!flags.bank_accounts_skipped;

  const openingBalancesComplete =
    !!flags.opening_balances_zero_intentional ||
    (!!flags.bank_accounts_skipped && bankAccounts.length === 0) ||
    (bankAccounts.length > 0 &&
      bankAccounts.every(
        (ba) =>
          ba.opening_balance_posted === true ||
          ba.opening_balance === 0 ||
          ba.opening_balance == null,
      ));

  const financialCalendarComplete = activeFinancialYear;
  const chartOfAccountsComplete =
    chartOfAccountsExists && mandatoryControlAccounts && coaIntegrity;
  const taxConfigurationComplete = taxConfigurationExists;
  const bankAccountsComplete = bankAccountOrSkipped;
  const openingBalancesStepComplete = openingBalancesComplete;

  const validationChecks = {
    activeFinancialYear,
    chartOfAccountsExists,
    mandatoryControlAccounts,
    coaIntegrity,
    taxConfigurationExists,
    bankAccountOrSkipped,
    openingBalancesComplete,
  };

  const errors: string[] = [];
  if (!validationChecks.activeFinancialYear) errors.push('Active financial year is required.');
  if (!validationChecks.chartOfAccountsExists) errors.push('Chart of Accounts is required.');
  if (!validationChecks.mandatoryControlAccounts) {
    errors.push(`Missing control accounts: ${missingControlAccounts.join(', ')}.`);
  }
  if (!validationChecks.coaIntegrity) {
    errors.push(...integrity.errors.map((e) => `COA integrity: ${e}`));
  }
  if (!validationChecks.taxConfigurationExists) {
    errors.push('Required tax configuration is missing.');
  }
  if (!validationChecks.bankAccountOrSkipped) {
    errors.push('At least one bank account is required, or banking must be explicitly skipped.');
  }
  if (!validationChecks.openingBalancesComplete) {
    errors.push('Opening balances must be posted or intentionally confirmed as zero.');
  }

  const accountingReady = Object.values(validationChecks).every(Boolean);

  const stepCompletion: Record<SetupStepKey, boolean> = {
    financial_calendar: financialCalendarComplete,
    chart_of_accounts: chartOfAccountsComplete,
    tax_configuration: taxConfigurationComplete,
    bank_accounts: bankAccountsComplete,
    opening_balances: openingBalancesStepComplete,
    validation: accountingReady,
  };

  const completedCount = STEP_ORDER.filter((key) => stepCompletion[key]).length;
  const progressPercent = Math.round((completedCount / STEP_ORDER.length) * 100);

  const steps = STEP_ORDER.reduce(
    (acc, key) => {
      acc[key] = { complete: stepCompletion[key], label: STEP_LABELS[key] };
      return acc;
    },
    {} as ReadinessEvaluation['steps'],
  );

  let status: AccountingReadinessStatus = 'NOT_STARTED';
  if (accountingReady) status = 'READY';
  else if (completedCount > 0) status = 'IN_PROGRESS';

  return {
    accountingReady,
    status,
    progressPercent,
    steps,
    validation: {
      ...validationChecks,
      accountCount,
      mappingsComplete,
      controlAccounts,
      missingControlAccounts,
      coaIntegrityErrors: integrity.errors,
      errors,
    },
  };
}

export function nextIncompleteStep(
  steps: ReadinessEvaluation['steps'],
): SetupStepKey {
  return STEP_ORDER.find((key) => !steps[key].complete) ?? 'validation';
}
