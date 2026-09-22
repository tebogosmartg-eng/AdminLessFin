/**
 * Accounting Readiness — the one composition.
 *
 * Every FACT comes from the database function `accounting_facts(company)`:
 * whether an active financial year exists, whether the chart is classified,
 * which control roles are mapped, whether VAT is configured, whether opening
 * balances are done, whether the ledger balances. This module derives no facts
 * of its own. It only decides what they add up to -- the six setup steps, the
 * progress, the status and the wording -- because that is presentation, and it
 * belongs with the screens rather than in SQL.
 *
 * The rule this replaces existed twice in TypeScript and nowhere in the
 * database, so nothing outside the edge function could ask the same question
 * and get the same answer.
 *
 * Shape of the response is unchanged, so no screen has to be rewritten.
 */

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

const STEP_ORDER: SetupStepKey[] = [
  'financial_calendar',
  'chart_of_accounts',
  'tax_configuration',
  'bank_accounts',
  'opening_balances',
  'validation',
];

const STEP_LABELS: Record<SetupStepKey, string> = {
  financial_calendar: 'Financial Calendar',
  chart_of_accounts: 'Chart of Accounts',
  tax_configuration: 'Tax',
  bank_accounts: 'Banking',
  opening_balances: 'Opening Balances',
  validation: 'Validation',
};

const CORE_CONTROL_ROLES: ControlAccountRole[] = [
  'trade_debtors',
  'trade_creditors',
  'vat_control',
  'bank',
  'retained_earnings',
  'profit_loss',
];

/** The shape `accounting_facts(company)` returns. */
export type AccountingFacts = {
  company_id: string;
  as_of: string;
  calendar: {
    has_year: boolean;
    has_open_year: boolean;
    current_year: {
      id: string; year_code: string | null; status: string;
      start_date: string; end_date: string; contains_today: boolean;
    } | null;
    year_count: number;
    open_year_count: number;
    open_years_containing_today: number;
    period_count: number;
    open_period_count: number;
    current_period: { id: string; status: string; start_date: string; end_date: string } | null;
  };
  chart: {
    account_count: number;
    active_count: number;
    missing_types: string[];
    unclassified: { id: string; name: string; type: string }[];
    duplicate_codes: string[];
    duplicate_numbers: number[];
    normal_balance_errors: { name: string; type: string; expected: string }[];
  };
  control_accounts: Record<ControlAccountRole, boolean>;
  tax: { rate_count: number; vat_account_count: number };
  banking: { bank_account_count: number; opening_balances_posted: boolean };
  ledger: {
    journal_count: number; total_debits: number; total_credits: number;
    balanced: boolean; unbalanced_journals: { journal_number: string | null; drift: number }[];
  };
  payroll: { active_mapping_count: number };
  flags: {
    bank_accounts_skipped: boolean;
    opening_balances_zero_intentional: boolean;
    inventory_enabled: boolean;
    fixed_assets_enabled: boolean;
    payroll_enabled: boolean;
  };
};

export type ReadinessEvaluation = {
  accountingReady: boolean;
  status: AccountingReadinessStatus;
  progressPercent: number;
  steps: Record<SetupStepKey, { complete: boolean; label: string }>;
  validation: {
    activeFinancialYear: boolean;
    chartOfAccountsExists: boolean;
    accountCount: number;
    mappingsComplete: boolean;
    mandatoryControlAccounts: boolean;
    coaIntegrity: boolean;
    accountsRequiringClassification: number;
    accountsRequiringClassificationNames: string[];
    taxConfigurationExists: boolean;
    bankAccountOrSkipped: boolean;
    openingBalancesComplete: boolean;
    controlAccounts: Record<ControlAccountRole, boolean>;
    missingControlAccounts: ControlAccountRole[];
    coaIntegrityErrors: string[];
    errors: string[];
    /** Reported so a screen can say the calendar is ambiguous instead of guessing. */
    financialYearAmbiguous: boolean;
    currentFinancialYear: AccountingFacts['calendar']['current_year'];
    ledgerBalanced: boolean;
  };
};

function requiredControlRoles(flags: AccountingFacts['flags']): ControlAccountRole[] {
  const roles: ControlAccountRole[] = [...CORE_CONTROL_ROLES];
  if (flags.inventory_enabled) roles.push('inventory');
  if (flags.fixed_assets_enabled) roles.push('fixed_assets');
  if (flags.payroll_enabled) roles.push('payroll_clearing');
  return roles;
}

/** Restates the chart facts as the sentences Accounting Setup shows. */
function coaIntegrityErrors(chart: AccountingFacts['chart']): string[] {
  const errors: string[] = [];
  if (chart.account_count === 0) return ['Chart of Accounts has no accounts.'];
  if (chart.active_count === 0) errors.push('Chart of Accounts has no active accounts.');
  for (const type of chart.missing_types ?? []) {
    errors.push(`Missing foundational account type: ${type}.`);
  }
  for (const e of chart.normal_balance_errors ?? []) {
    errors.push(`${e.name}: A ${e.type} account normally carries a ${e.expected} balance.`);
  }
  for (const code of chart.duplicate_codes ?? []) errors.push(`Duplicate account code: ${code}.`);
  for (const num of chart.duplicate_numbers ?? []) errors.push(`Duplicate account number: ${num}.`);
  return errors;
}

export function composeReadiness(facts: AccountingFacts): ReadinessEvaluation {
  const flags = facts.flags;
  const chart = facts.chart;
  const calendar = facts.calendar;

  const activeFinancialYear = calendar.has_open_year;
  const chartOfAccountsExists = chart.account_count > 0;
  const integrityErrors = coaIntegrityErrors(chart);
  const coaIntegrity = integrityErrors.length === 0;

  const controlAccounts = {} as Record<ControlAccountRole, boolean>;
  const missingControlAccounts: ControlAccountRole[] = [];
  for (const role of requiredControlRoles(flags)) {
    let satisfied = facts.control_accounts[role] === true;
    // A bank account on file, or banking explicitly skipped, satisfies the bank
    // control the same way a mapped GL account does.
    if (role === 'bank' && (facts.banking.bank_account_count > 0 || flags.bank_accounts_skipped)) {
      satisfied = true;
    }
    if (role === 'payroll_clearing' && facts.payroll.active_mapping_count > 0) {
      satisfied = true;
    }
    controlAccounts[role] = satisfied;
    if (!satisfied) missingControlAccounts.push(role);
  }
  const mandatoryControlAccounts = missingControlAccounts.length === 0;

  const taxConfigurationExists = facts.tax.rate_count > 0;
  const bankAccountOrSkipped = facts.banking.bank_account_count > 0 || flags.bank_accounts_skipped;

  const openingBalancesComplete =
    flags.opening_balances_zero_intentional ||
    (flags.bank_accounts_skipped && facts.banking.bank_account_count === 0) ||
    (facts.banking.bank_account_count > 0 && facts.banking.opening_balances_posted);

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
  if (!activeFinancialYear) errors.push('Active financial year is required.');
  if (!chartOfAccountsExists) errors.push('Chart of Accounts is required.');
  if (!mandatoryControlAccounts) {
    errors.push(`Missing control accounts: ${missingControlAccounts.join(', ')}.`);
  }
  if (!coaIntegrity) errors.push(...integrityErrors.map((e) => `COA integrity: ${e}`));
  if (!taxConfigurationExists) errors.push('Required tax configuration is missing.');
  if (!bankAccountOrSkipped) {
    errors.push('At least one bank account is required, or banking must be explicitly skipped.');
  }
  if (!openingBalancesComplete) {
    errors.push('Opening balances must be posted or intentionally confirmed as zero.');
  }
  // Not a readiness check — a company is not "unready" because two open years
  // overlap — but the screens must be able to say which year they are showing.
  if (calendar.open_years_containing_today > 1) {
    errors.push(
      `${calendar.open_years_containing_today} open financial years include today, so "current year" is ambiguous. Close or correct one.`,
    );
  }

  const accountingReady = Object.values(validationChecks).every(Boolean);

  const stepCompletion: Record<SetupStepKey, boolean> = {
    financial_calendar: activeFinancialYear,
    chart_of_accounts: chartOfAccountsExists && mandatoryControlAccounts && coaIntegrity,
    tax_configuration: taxConfigurationExists,
    bank_accounts: bankAccountOrSkipped,
    opening_balances: openingBalancesComplete,
    validation: accountingReady,
  };

  const completedCount = STEP_ORDER.filter((key) => stepCompletion[key]).length;
  const progressPercent = Math.round((completedCount / STEP_ORDER.length) * 100);

  const steps = STEP_ORDER.reduce((acc, key) => {
    acc[key] = { complete: stepCompletion[key], label: STEP_LABELS[key] };
    return acc;
  }, {} as ReadinessEvaluation['steps']);

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
      accountCount: chart.account_count,
      mappingsComplete: mandatoryControlAccounts,
      // Classification is reported so Setup can name what is outstanding. It
      // never revokes readiness: an unclassified legacy account must not stop a
      // company posting.
      accountsRequiringClassification: (chart.unclassified ?? []).length,
      accountsRequiringClassificationNames: (chart.unclassified ?? []).map((a) => a.name).slice(0, 20),
      controlAccounts,
      missingControlAccounts,
      coaIntegrityErrors: integrityErrors,
      errors,
      financialYearAmbiguous: calendar.open_years_containing_today > 1,
      currentFinancialYear: calendar.current_year,
      ledgerBalanced: facts.ledger.balanced,
    },
  };
}

export function nextIncompleteStep(steps: ReadinessEvaluation['steps']): SetupStepKey {
  return STEP_ORDER.find((key) => !steps[key].complete) ?? 'validation';
}
