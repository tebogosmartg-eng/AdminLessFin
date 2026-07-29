// ERP Phase 4 — Accounting Rules Engine domain model.
// Business events → accounting events. Modules describe; Rules Engine generates.

export type RuleType = 'system' | 'company' | 'industry';

export type IndustryTemplate =
  | 'retail'
  | 'manufacturing'
  | 'agriculture'
  | 'construction'
  | 'medical'
  | 'municipality'
  | 'npo'
  | 'professional_services'
  | 'generic';

export type BusinessEventKey =
  | 'sales_invoice'
  | 'customer_receipt'
  | 'supplier_invoice'
  | 'supplier_payment'
  | 'bank_deposit'
  | 'bank_withdrawal'
  | 'journal_entry'
  | 'inventory_purchase'
  | 'inventory_sale'
  | 'inventory_adjustment'
  | 'payroll_run'
  | 'payroll_payment'
  | 'depreciation'
  | 'asset_acquisition'
  | 'asset_disposal'
  | 'vat_return'
  | 'interest'
  | 'loan'
  | 'opening_balances'
  | 'recurring_journal'
  | 'accrual'
  | 'prepayment'
  | 'reversal';

export const BUSINESS_EVENT_ORDER: BusinessEventKey[] = [
  'sales_invoice',
  'customer_receipt',
  'supplier_invoice',
  'supplier_payment',
  'bank_deposit',
  'bank_withdrawal',
  'journal_entry',
  'inventory_purchase',
  'inventory_sale',
  'inventory_adjustment',
  'payroll_run',
  'payroll_payment',
  'depreciation',
  'asset_acquisition',
  'asset_disposal',
  'vat_return',
  'interest',
  'loan',
  'opening_balances',
  'recurring_journal',
  'accrual',
  'prepayment',
  'reversal',
];

export const BUSINESS_EVENT_LABELS: Record<BusinessEventKey, string> = {
  sales_invoice: 'Sales Invoice',
  customer_receipt: 'Customer Receipt',
  supplier_invoice: 'Supplier Invoice',
  supplier_payment: 'Supplier Payment',
  bank_deposit: 'Bank Deposit',
  bank_withdrawal: 'Bank Withdrawal',
  journal_entry: 'Journal Entry',
  inventory_purchase: 'Inventory Purchase',
  inventory_sale: 'Inventory Sale',
  inventory_adjustment: 'Inventory Adjustment',
  payroll_run: 'Payroll Run',
  payroll_payment: 'Payroll Payment',
  depreciation: 'Depreciation',
  asset_acquisition: 'Asset Acquisition',
  asset_disposal: 'Asset Disposal',
  vat_return: 'VAT Return',
  interest: 'Interest',
  loan: 'Loan',
  opening_balances: 'Opening Balances',
  recurring_journal: 'Recurring Journal',
  accrual: 'Accrual',
  prepayment: 'Prepayment',
  reversal: 'Reversal',
};

export type AccountRole =
  | 'trade_debtors'
  | 'trade_creditors'
  | 'output_vat'
  | 'input_vat'
  | 'bank'
  | 'revenue'
  | 'expense'
  | 'inventory_asset'
  | 'cogs'
  | 'retained_earnings'
  | 'payroll_expense'
  | 'payroll_liability'
  | 'depreciation_expense'
  | 'accumulated_depreciation'
  | 'fixed_asset'
  | 'gain_on_disposal'
  | 'loss_on_disposal'
  | 'suspense'
  | 'contra'
  | 'from_line';

export type RuleDefinition = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  businessEvent: BusinessEventKey;
  module: string;
  trigger: string;
  ruleType: RuleType;
  version: number;
  isMandatory: boolean;
  industryTemplate: IndustryTemplate | null;
  narrationTemplate: string | null;
  enabled: boolean;
  generationHook: string;
};

export type GeneratedJournalLine = {
  account_id: string;
  account_name?: string;
  account_role?: string;
  debit: number;
  credit: number;
  project_id?: string | null;
  tax_rate_id?: string | null;
  dimensions?: Record<string, unknown>;
};

export type JournalPreview = {
  businessEvent: BusinessEventKey;
  businessEventLabel: string;
  ruleId: string;
  ruleCode: string;
  ruleName: string;
  ruleVersion: number;
  narration: string;
  postingDate: string;
  module: string;
  lines: GeneratedJournalLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  policyResults?: unknown;
  generatedAt: string;
};

export type RulesDashboard = {
  totalRules: number;
  systemRules: number;
  companyRules: number;
  industryRules: number;
  recentlyExecuted: RuleExecutionSummary[];
  mostUsed: RuleUsageSummary[];
  evaluatedAt: string;
};

export type RuleExecutionSummary = {
  id: string;
  ruleCode: string;
  ruleName: string;
  businessEvent: BusinessEventKey;
  module: string;
  result: string;
  createdAt: string;
};

export type RuleUsageSummary = {
  ruleCode: string;
  ruleName: string;
  businessEvent: BusinessEventKey;
  executionCount: number;
};
