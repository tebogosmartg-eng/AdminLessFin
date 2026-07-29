// AdminLess Fin — Enterprise Chart of Accounts Engine
// Shared, framework-agnostic template contract. This is the SINGLE definition
// of what a Chart of Accounts template looks like; both the generator edge
// function and the frontend catalog consume it (the frontend never re-declares
// account data — it asks the server via LIST_TEMPLATES).

// The certified account_type enum is intentionally reused unchanged. The finer
// 8-way presentation (Cost of Sales / Other Income / Other Expenses, etc.) is
// carried in `category`, not by mutating this enum.
export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

export type NormalBalance = 'debit' | 'credit';

export type FinancialStatement =
  | 'Statement of Financial Position'
  | 'Profit or Loss'
  | 'Statement of Cash Flows'
  | 'Statement of Changes in Equity';

export type CashFlowClassification = 'operating' | 'investing' | 'financing' | 'none';

/** One account line in a template. Mirrors the additive chart_of_accounts
 *  metadata columns so a template row maps 1:1 onto an insert. */
export interface TemplateAccount {
  account_number: number;
  account_code: string;
  name: string;
  type: AccountType;
  normal_balance: NormalBalance;
  category: string;
  subcategory?: string;
  financial_statement: FinancialStatement;
  cash_flow_classification: CashFlowClassification;
  presentation_order: number;
  tax_treatment?: string;
  /** Canonical control/system role — never use display name for identity. */
  account_role?: string;
  /** Structural roll-up header (no direct posting). */
  is_header?: boolean;
  /** Module control account (systematic postings only). */
  control_account?: boolean;
  /** Ring-fenced system account. */
  system_account?: boolean;
  /** Defaults true; headers and control accounts set this false. */
  allow_manual_posting?: boolean;
  /** Blocks ALL postings (used for structural headers). */
  posting_blocked?: boolean;
  /** account_code of the parent for hierarchy resolution after insert. */
  parent_code?: string;
  description?: string;
}

/** Catalog metadata surfaced to the onboarding UI (no account data). */
export interface TemplateCatalogEntry {
  key: string;
  name: string;
  description: string;
  framework: string;
  region: string;
  recommended: boolean;
  accountCount: number;
}

export interface ChartOfAccountsTemplate {
  key: string;
  name: string;
  description: string;
  framework: string;
  region: string;
  recommended: boolean;
  accounts: TemplateAccount[];
}
