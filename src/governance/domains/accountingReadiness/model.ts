// Governance Foundation — Accounting Readiness domain model (ERP Phase 1A/1B).
// Orchestrates enterprise accounting setup; does not replace posting/GL/TB/FS.
// Phase 1B: readiness is derived by the Validation Engine from master data.

import type { GovernancePermissionBoundary, ValidationResult } from '../../types';

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

export const SETUP_STEP_ORDER: SetupStepKey[] = [
  'financial_calendar',
  'chart_of_accounts',
  'tax_configuration',
  'bank_accounts',
  'opening_balances',
  'validation',
];

export const SETUP_STEP_LABELS: Record<SetupStepKey, string> = {
  financial_calendar: 'Financial Calendar',
  chart_of_accounts: 'Chart of Accounts',
  tax_configuration: 'Tax',
  bank_accounts: 'Banking',
  opening_balances: 'Opening Balances',
  validation: 'Validation',
};

export const CONTROL_ACCOUNT_LABELS: Record<ControlAccountRole, string> = {
  trade_debtors: 'Trade Debtors',
  trade_creditors: 'Trade Creditors',
  vat_control: 'VAT Control',
  bank: 'Bank',
  retained_earnings: 'Retained Earnings',
  profit_loss: 'Profit / Loss',
  inventory: 'Inventory',
  fixed_assets: 'Fixed Assets',
  payroll_clearing: 'Payroll Clearing',
};

export type AccountingReadinessRecord = {
  companyId: string;
  status: AccountingReadinessStatus;
  accountingReady: boolean;
  currentStep: SetupStepKey;
  financialCalendarComplete: boolean;
  chartOfAccountsComplete: boolean;
  taxConfigurationComplete: boolean;
  bankAccountsComplete: boolean;
  openingBalancesComplete: boolean;
  validationComplete: boolean;
  bankAccountsSkipped: boolean;
  openingBalancesZeroIntentional: boolean;
  inventoryEnabled: boolean;
  fixedAssetsEnabled: boolean;
  payrollEnabled: boolean;
  lastValidatedAt: string | null;
};

export type AccountingReadinessSnapshot = AccountingReadinessRecord & {
  progressPercent: number;
  steps: Record<SetupStepKey, { complete: boolean; label: string }>;
  validation: {
    activeFinancialYear: boolean;
    chartOfAccountsExists: boolean;
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

/** Phase 1B: only intent / module flags — never manual step completion. */
export type UpdateAccountingSetupStepInput = {
  step?: SetupStepKey;
  bankAccountsSkipped?: boolean;
  openingBalancesZeroIntentional?: boolean;
  inventoryEnabled?: boolean;
  fixedAssetsEnabled?: boolean;
  payrollEnabled?: boolean;
};

export function validateSetupStepUpdate(input: UpdateAccountingSetupStepInput): ValidationResult {
  const errors: string[] = [];
  const hasIntent =
    typeof input.bankAccountsSkipped === 'boolean' ||
    typeof input.openingBalancesZeroIntentional === 'boolean' ||
    typeof input.inventoryEnabled === 'boolean' ||
    typeof input.fixedAssetsEnabled === 'boolean' ||
    typeof input.payrollEnabled === 'boolean';
  if (!hasIntent) {
    errors.push(
      'Only intent flags may be recorded (skip banking, zero opening balances, module toggles). Step completion is derived automatically.',
    );
  }
  if (input.step && !SETUP_STEP_ORDER.includes(input.step)) {
    errors.push('Invalid setup step.');
  }
  return { valid: errors.length === 0, errors };
}

export const ACCOUNTING_READINESS_PERMISSIONS: Record<string, GovernancePermissionBoundary> = {
  view: {
    action: 'accountingReadiness.view',
    requiredRole: 'member',
    description: 'View accounting setup progress.',
  },
  configure: {
    action: 'accountingReadiness.configure',
    requiredRole: 'admin',
    description: 'Record accounting setup intent flags (skip banking, module toggles).',
  },
};

export const ACCOUNTING_GATED_MODULES = [
  'journal_entries',
  'invoices',
  'payroll',
  'banking',
  'financial_statements',
] as const;

export type AccountingGatedModule = (typeof ACCOUNTING_GATED_MODULES)[number];

export const ACCOUNTING_MODULE_LABELS: Record<AccountingGatedModule, string> = {
  journal_entries: 'Journal Entries',
  invoices: 'Invoices',
  payroll: 'Payroll',
  banking: 'Banking',
  financial_statements: 'Financial Statements',
};
