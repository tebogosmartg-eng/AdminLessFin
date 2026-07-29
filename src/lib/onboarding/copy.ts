import type { AccountingGatedModule, SetupStepKey } from '@/governance/domains/accountingReadiness/model';

/** User-facing guidance for each accounting setup step — why it matters and what to do. */
export const SETUP_STEP_GUIDANCE: Record<
  SetupStepKey,
  { why: string; action: string; next: string }
> = {
  financial_calendar: {
    why: 'Every transaction must fall within an open financial year before it can post to the ledger.',
    action: 'Set your financial year end date below, then save. An active financial year is created automatically.',
    next: 'Once saved, continue to Chart of Accounts.',
  },
  chart_of_accounts: {
    why: 'The Chart of Accounts defines how money is classified. Invoices, bills, and journals all post to these accounts.',
    action: 'Generate the standard chart (recommended), import an existing chart, or add accounts manually.',
    next: 'After your chart is in place, configure at least one tax rate.',
  },
  tax_configuration: {
    why: 'Invoices and bills apply tax rates when posting. At least one tax rate is required before accounting can go live.',
    action: 'Add a tax rate — for example, VAT at 15%. You can add more rates later for different tax types.',
    next: 'Continue to Banking to link a bank account or skip for now.',
  },
  bank_accounts: {
    why: 'Bank accounts connect your cash movements to the general ledger and support reconciliation.',
    action: 'Add your primary bank account, or choose "Skip banking for now" if you will set this up later.',
    next: 'Confirm your opening balances before validation.',
  },
  opening_balances: {
    why: 'Opening balances establish your starting position. The system needs to know whether balances are zero or already posted.',
    action: 'Post opening balances for each bank account, or confirm that opening balances are intentionally zero.',
    next: 'Proceed to Validation to review all checks.',
  },
  validation: {
    why: 'All foundation checks must pass before invoices, journals, and financial statements can post.',
    action: 'Review each validation rule below. Return to earlier steps to resolve any failures.',
    next: 'When all rules pass, operational accounting is enabled across the platform.',
  },
};

/** Module-specific blocked-action guidance shown when Accounting Ready is false. */
export const MODULE_BLOCKED_GUIDANCE: Record<
  AccountingGatedModule,
  { why: string; tip: string }
> = {
  invoices: {
    why: 'Invoices post journal entries to Accounts Receivable and revenue accounts. The accounting foundation must be complete first.',
    tip: 'You can add customers now. Complete Accounting Setup, then return here to create your first invoice.',
  },
  journal_entries: {
    why: 'Journal entries write directly to the general ledger. Posting is blocked until your chart, tax, and calendar are validated.',
    tip: 'Most day-to-day activity starts with an invoice or bill. Manual journals are for adjustments and corrections.',
  },
  payroll: {
    why: 'Payroll posts to dedicated clearing and expense accounts. These control accounts must exist and be validated first.',
    tip: 'Complete Accounting Setup, then add employees and configure payroll rules.',
  },
  banking: {
    why: 'Banking modules reconcile cash accounts against your chart of accounts and financial calendar.',
    tip: 'You can skip banking during setup and return here once Accounting Ready is achieved.',
  },
  financial_statements: {
    why: 'Financial statements read from posted journal data. Without a validated foundation, reports would be incomplete or misleading.',
    tip: 'Post at least one invoice or bill, then view the Trial Balance before generating statements.',
  },
};

export const ONBOARDING_STEPS = [
  'Create your account',
  'Create your company',
  'Complete Accounting Setup',
  'Add customers and suppliers',
  'Record your first transactions',
] as const;
