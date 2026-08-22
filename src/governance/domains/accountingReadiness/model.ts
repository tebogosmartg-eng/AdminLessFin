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

/** Why each control is required — shown when a mapping is missing. */
export const CONTROL_ACCOUNT_WHY: Record<ControlAccountRole, string> = {
  trade_debtors: 'Used to record amounts owed by customers from posted invoices.',
  trade_creditors: 'Used to record amounts owed to suppliers from posted bills.',
  vat_control: 'Used to record VAT input, output, and net VAT payable or receivable.',
  bank: 'Used to record cash at bank so receipts, payments, and reconciliation can post.',
  retained_earnings: 'Used to accumulate prior-period profit or loss after close.',
  profit_loss: 'At least one income account and one expense account are required to record trading activity.',
  inventory: 'Used to record stock on hand when the Inventory module is enabled.',
  fixed_assets: 'Used to record property, plant and equipment when the Fixed Assets module is enabled.',
  payroll_clearing: 'Used to clear net pay and statutory deductions when the Payroll module is enabled.',
};

/** Core controls required for Accounting Ready regardless of optional modules. */
export const CORE_CONTROL_ROLES: ControlAccountRole[] = [
  'trade_debtors',
  'trade_creditors',
  'vat_control',
  'bank',
  'retained_earnings',
  'profit_loss',
];

export function requiredControlRoles(flags: {
  inventoryEnabled?: boolean;
  inventory_enabled?: boolean;
  fixedAssetsEnabled?: boolean;
  fixed_assets_enabled?: boolean;
  payrollEnabled?: boolean;
  payroll_enabled?: boolean;
}): ControlAccountRole[] {
  const roles: ControlAccountRole[] = [...CORE_CONTROL_ROLES];
  if (flags.inventoryEnabled || flags.inventory_enabled) roles.push('inventory');
  if (flags.fixedAssetsEnabled || flags.fixed_assets_enabled) roles.push('fixed_assets');
  if (flags.payrollEnabled || flags.payroll_enabled) roles.push('payroll_clearing');
  return roles;
}

/** Canonical CoA account_role written when a readiness control is mapped. */
export const CONTROL_TO_ACCOUNT_ROLE: Record<Exclude<ControlAccountRole, 'profit_loss'>, string> = {
  trade_debtors: 'trade_receivable',
  trade_creditors: 'trade_payable',
  vat_control: 'vat_control',
  bank: 'bank',
  retained_earnings: 'retained_earnings',
  inventory: 'inventory_asset',
  fixed_assets: 'fixed_asset',
  payroll_clearing: 'payroll_clearing',
};

export function accountingSetupPath(step?: SetupStepKey): string {
  return step ? `/accounting-setup?step=${step}` : '/accounting-setup';
}

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
    accountCount: number;
    mappingsComplete: boolean;
    mandatoryControlAccounts: boolean;
    coaIntegrity: boolean;
    /** Active accounts whose Chart of Accounts classification is missing or invalid. */
    accountsRequiringClassification: number;
    accountsRequiringClassificationNames: string[];
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
