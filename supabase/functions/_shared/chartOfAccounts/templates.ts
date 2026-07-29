// AdminLess Fin — Enterprise Chart of Accounts Engine
// Template registry. The generator is a template ENGINE, not a hardcoded list:
// each template registers here and the standard one below is the first entry.
// Future templates (Retail, Manufacturing, Construction, NPO, Municipality,
// Medical, Agriculture, Education, Holding Company) plug into REGISTRY without
// touching the generator or edge function.

import type {
  AccountType,
  CashFlowClassification,
  ChartOfAccountsTemplate,
  FinancialStatement,
  NormalBalance,
  TemplateAccount,
  TemplateCatalogEntry,
} from './types.ts';
import { roleForTemplateCode } from './accountRoles.ts';

/** Compact authoring spec — the builder fills the derivable fields so the
 *  template data stays readable while every stored account is fully typed. */
interface Spec {
  n: number;
  code: string;
  name: string;
  type: AccountType;
  cat: string;
  sub?: string;
  cf: CashFlowClassification;
  header?: boolean;
  control?: boolean;
  system?: boolean;
  manual?: boolean; // explicit override of allow_manual_posting
  blocked?: boolean; // explicit override of posting_blocked
  parent?: string;
  tax?: string;
  fs?: FinancialStatement; // override (equity that presents on SoFP, etc.)
  nb?: NormalBalance; // override for contra accounts
  desc?: string;
}

function normalBalanceFor(type: AccountType): NormalBalance {
  return type === 'Asset' || type === 'Expense' ? 'debit' : 'credit';
}

function statementFor(type: AccountType): FinancialStatement {
  return type === 'Asset' || type === 'Liability' || type === 'Equity'
    ? 'Statement of Financial Position'
    : 'Profit or Loss';
}

function expand(specs: Spec[]): TemplateAccount[] {
  return specs.map((s, i) => ({
    account_number: s.n,
    account_code: s.code,
    name: s.name,
    type: s.type,
    normal_balance: s.nb ?? normalBalanceFor(s.type),
    category: s.cat,
    subcategory: s.sub,
    financial_statement: s.fs ?? statementFor(s.type),
    cash_flow_classification: s.cf,
    presentation_order: (i + 1) * 10,
    tax_treatment: s.tax,
    account_role: roleForTemplateCode(s.code, s.tax) ?? (
      s.system ? 'retained_earnings' : undefined
    ),
    is_header: s.header ?? false,
    control_account: s.control ?? false,
    system_account: s.system ?? false,
    allow_manual_posting: s.manual ?? !(s.header || s.control),
    posting_blocked: s.blocked ?? (s.header ?? false),
    parent_code: s.parent,
    description: s.desc,
  }));
}

// ── Standard IFRS for SMEs — South Africa ──────────────────────────────────
const STANDARD_ZA_SPECS: Spec[] = [
  // ASSETS 1000–1999
  { n: 1000, code: '1000', name: 'Non-Current Assets', type: 'Asset', cat: 'Non-Current Assets', cf: 'investing', header: true },
  { n: 1100, code: '1100', name: 'Property, Plant and Equipment', type: 'Asset', cat: 'Non-Current Assets', sub: 'Property, Plant and Equipment', cf: 'investing', header: true, parent: '1000' },
  { n: 1110, code: '1110', name: 'Land and Buildings', type: 'Asset', cat: 'Non-Current Assets', sub: 'Property, Plant and Equipment', cf: 'investing', parent: '1100' },
  { n: 1120, code: '1120', name: 'Furniture and Fittings', type: 'Asset', cat: 'Non-Current Assets', sub: 'Property, Plant and Equipment', cf: 'investing', parent: '1100' },
  { n: 1130, code: '1130', name: 'Office Equipment', type: 'Asset', cat: 'Non-Current Assets', sub: 'Property, Plant and Equipment', cf: 'investing', parent: '1100' },
  { n: 1140, code: '1140', name: 'Computer Equipment', type: 'Asset', cat: 'Non-Current Assets', sub: 'Property, Plant and Equipment', cf: 'investing', parent: '1100' },
  { n: 1150, code: '1150', name: 'Motor Vehicles', type: 'Asset', cat: 'Non-Current Assets', sub: 'Property, Plant and Equipment', cf: 'investing', parent: '1100' },
  { n: 1190, code: '1190', name: 'Accumulated Depreciation', type: 'Asset', cat: 'Non-Current Assets', sub: 'Property, Plant and Equipment', cf: 'investing', nb: 'credit', control: true, parent: '1100', desc: 'Contra-asset: accumulated depreciation on PPE.' },
  { n: 1300, code: '1300', name: 'Intangible Assets', type: 'Asset', cat: 'Non-Current Assets', sub: 'Intangible Assets', cf: 'investing', parent: '1000' },

  { n: 1200, code: '1200', name: 'Current Assets', type: 'Asset', cat: 'Current Assets', cf: 'operating', header: true },
  { n: 1210, code: '1210', name: 'Inventory', type: 'Asset', cat: 'Current Assets', sub: 'Inventory', cf: 'operating', control: true, parent: '1200' },
  { n: 1220, code: '1220', name: 'Accounts Receivable (Trade Debtors)', type: 'Asset', cat: 'Current Assets', sub: 'Trade and Other Receivables', cf: 'operating', control: true, parent: '1200' },
  { n: 1230, code: '1230', name: 'Provision for Doubtful Debts', type: 'Asset', cat: 'Current Assets', sub: 'Trade and Other Receivables', cf: 'operating', nb: 'credit', parent: '1200', desc: 'Contra-asset against Accounts Receivable.' },
  { n: 1240, code: '1240', name: 'VAT Input (Receivable)', type: 'Asset', cat: 'Current Assets', sub: 'Trade and Other Receivables', cf: 'operating', control: true, tax: 'vat_input', parent: '1200' },
  { n: 1250, code: '1250', name: 'Prepaid Expenses', type: 'Asset', cat: 'Current Assets', sub: 'Trade and Other Receivables', cf: 'operating', parent: '1200' },
  { n: 1260, code: '1260', name: 'Bank - Current Account', type: 'Asset', cat: 'Current Assets', sub: 'Cash and Cash Equivalents', cf: 'none', parent: '1200' },
  { n: 1270, code: '1270', name: 'Petty Cash / Cash on Hand', type: 'Asset', cat: 'Current Assets', sub: 'Cash and Cash Equivalents', cf: 'none', parent: '1200' },

  // LIABILITIES 2000–2999
  { n: 2000, code: '2000', name: 'Non-Current Liabilities', type: 'Liability', cat: 'Non-Current Liabilities', cf: 'financing', header: true },
  { n: 2010, code: '2010', name: 'Long-term Loans', type: 'Liability', cat: 'Non-Current Liabilities', sub: 'Interest-bearing Borrowings', cf: 'financing', parent: '2000' },
  { n: 2020, code: '2020', name: 'Instalment Sale Liabilities', type: 'Liability', cat: 'Non-Current Liabilities', sub: 'Interest-bearing Borrowings', cf: 'financing', parent: '2000' },

  { n: 2100, code: '2100', name: 'Current Liabilities', type: 'Liability', cat: 'Current Liabilities', cf: 'operating', header: true },
  { n: 2110, code: '2110', name: 'Accounts Payable (Trade Creditors)', type: 'Liability', cat: 'Current Liabilities', sub: 'Trade and Other Payables', cf: 'operating', control: true, parent: '2100' },
  { n: 2120, code: '2120', name: 'VAT Output (Payable)', type: 'Liability', cat: 'Current Liabilities', sub: 'Trade and Other Payables', cf: 'operating', control: true, tax: 'vat_output', parent: '2100' },
  { n: 2125, code: '2125', name: 'VAT Control', type: 'Liability', cat: 'Current Liabilities', sub: 'Trade and Other Payables', cf: 'operating', control: true, tax: 'vat_control', parent: '2100' },
  { n: 2130, code: '2130', name: 'PAYE Payable', type: 'Liability', cat: 'Current Liabilities', sub: 'Statutory Payables', cf: 'operating', control: true, tax: 'paye', parent: '2100' },
  { n: 2140, code: '2140', name: 'UIF Payable', type: 'Liability', cat: 'Current Liabilities', sub: 'Statutory Payables', cf: 'operating', control: true, tax: 'uif', parent: '2100' },
  { n: 2150, code: '2150', name: 'SDL Payable', type: 'Liability', cat: 'Current Liabilities', sub: 'Statutory Payables', cf: 'operating', control: true, tax: 'sdl', parent: '2100' },
  { n: 2160, code: '2160', name: 'Accrued Expenses', type: 'Liability', cat: 'Current Liabilities', sub: 'Trade and Other Payables', cf: 'operating', parent: '2100' },
  { n: 2170, code: '2170', name: 'Provisions', type: 'Liability', cat: 'Current Liabilities', sub: 'Provisions', cf: 'operating', parent: '2100' },
  { n: 2180, code: '2180', name: 'Shareholder / Members Loan', type: 'Liability', cat: 'Current Liabilities', sub: 'Related-party Payables', cf: 'financing', parent: '2100' },
  { n: 2190, code: '2190', name: 'Current Portion of Long-term Loans', type: 'Liability', cat: 'Current Liabilities', sub: 'Interest-bearing Borrowings', cf: 'financing', parent: '2100' },

  // EQUITY 3000–3999 (presents on SoFP; movements shown in SoCE)
  { n: 3000, code: '3000', name: 'Equity', type: 'Equity', cat: 'Equity', cf: 'none', header: true },
  { n: 3010, code: '3010', name: "Share Capital / Owner's Capital", type: 'Equity', cat: 'Equity', sub: 'Issued Capital', cf: 'financing', parent: '3000' },
  { n: 3020, code: '3020', name: 'Retained Earnings', type: 'Equity', cat: 'Equity', sub: 'Reserves', cf: 'none', system: true, parent: '3000' },
  { n: 3030, code: '3030', name: 'Revaluation Reserve', type: 'Equity', cat: 'Equity', sub: 'Reserves', cf: 'none', parent: '3000' },
  { n: 3040, code: '3040', name: 'Drawings / Dividends', type: 'Equity', cat: 'Equity', sub: 'Distributions', cf: 'financing', nb: 'debit', parent: '3000', desc: 'Contra-equity: distributions to owners.' },

  // REVENUE 4000–4499
  { n: 4000, code: '4000', name: 'Revenue', type: 'Income', cat: 'Revenue', cf: 'operating', header: true },
  { n: 4010, code: '4010', name: 'Sales - Goods', type: 'Income', cat: 'Revenue', cf: 'operating', tax: 'standard_rated', parent: '4000' },
  { n: 4020, code: '4020', name: 'Sales - Services', type: 'Income', cat: 'Revenue', cf: 'operating', tax: 'standard_rated', parent: '4000' },
  { n: 4030, code: '4030', name: 'Sales Returns', type: 'Income', cat: 'Revenue', cf: 'operating', nb: 'debit', parent: '4000', desc: 'Contra-revenue.' },
  { n: 4040, code: '4040', name: 'Discount Allowed', type: 'Income', cat: 'Revenue', cf: 'operating', nb: 'debit', parent: '4000', desc: 'Contra-revenue.' },

  // OTHER INCOME 4500–4999
  { n: 4500, code: '4500', name: 'Other Income', type: 'Income', cat: 'Other Income', cf: 'operating', header: true },
  { n: 4510, code: '4510', name: 'Interest Income', type: 'Income', cat: 'Other Income', cf: 'investing', parent: '4500' },
  { n: 4520, code: '4520', name: 'Rental Income', type: 'Income', cat: 'Other Income', cf: 'operating', parent: '4500' },
  { n: 4530, code: '4530', name: 'Profit on Disposal of Assets', type: 'Income', cat: 'Other Income', cf: 'investing', parent: '4500' },
  { n: 4540, code: '4540', name: 'Sundry Income', type: 'Income', cat: 'Other Income', cf: 'operating', parent: '4500' },

  // COST OF SALES 5000–5999
  { n: 5000, code: '5000', name: 'Cost of Sales', type: 'Expense', cat: 'Cost of Sales', cf: 'operating', header: true },
  { n: 5010, code: '5010', name: 'Opening Stock', type: 'Expense', cat: 'Cost of Sales', cf: 'operating', parent: '5000' },
  { n: 5020, code: '5020', name: 'Purchases', type: 'Expense', cat: 'Cost of Sales', cf: 'operating', tax: 'standard_rated', parent: '5000' },
  { n: 5030, code: '5030', name: 'Closing Stock', type: 'Expense', cat: 'Cost of Sales', cf: 'operating', nb: 'credit', parent: '5000', desc: 'Contra to Cost of Sales.' },
  { n: 5040, code: '5040', name: 'Direct Labour', type: 'Expense', cat: 'Cost of Sales', cf: 'operating', parent: '5000' },
  { n: 5050, code: '5050', name: 'Carriage on Purchases', type: 'Expense', cat: 'Cost of Sales', cf: 'operating', parent: '5000' },

  // OPERATING EXPENSES 6000–6999
  { n: 6000, code: '6000', name: 'Operating Expenses', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', header: true },
  { n: 6010, code: '6010', name: 'Accounting Fees', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6020, code: '6020', name: 'Advertising and Marketing', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6030, code: '6030', name: 'Bank Charges', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6040, code: '6040', name: 'Computer Expenses', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6050, code: '6050', name: 'Consulting Fees', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6060, code: '6060', name: 'Depreciation', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000', desc: 'Non-cash; added back in operating cash flow.' },
  { n: 6070, code: '6070', name: 'Electricity and Water', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6080, code: '6080', name: 'Salaries and Wages', type: 'Expense', cat: 'Operating Expenses', sub: 'Employee Costs', cf: 'operating', parent: '6000' },
  { n: 6090, code: '6090', name: 'UIF Contribution (Employer)', type: 'Expense', cat: 'Operating Expenses', sub: 'Employee Costs', cf: 'operating', parent: '6000' },
  { n: 6100, code: '6100', name: 'SDL Contribution (Employer)', type: 'Expense', cat: 'Operating Expenses', sub: 'Employee Costs', cf: 'operating', parent: '6000' },
  { n: 6110, code: '6110', name: 'Insurance', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6120, code: '6120', name: 'Lease / Rent Paid', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6130, code: '6130', name: 'Motor Vehicle Expenses', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6140, code: '6140', name: 'Office Expenses', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6150, code: '6150', name: 'Printing and Stationery', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6160, code: '6160', name: 'Rates and Taxes', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6170, code: '6170', name: 'Repairs and Maintenance', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6180, code: '6180', name: 'Subscriptions', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6190, code: '6190', name: 'Telephone and Internet', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6200, code: '6200', name: 'Travel and Accommodation', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6210, code: '6210', name: 'Bad Debts', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6220, code: '6220', name: 'Entertainment', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },
  { n: 6290, code: '6290', name: 'Sundry / General Expenses', type: 'Expense', cat: 'Operating Expenses', cf: 'operating', parent: '6000' },

  // OTHER EXPENSES 8000–8999
  { n: 8000, code: '8000', name: 'Other Expenses', type: 'Expense', cat: 'Other Expenses', cf: 'operating', header: true },
  { n: 8010, code: '8010', name: 'Finance Costs (Interest Paid)', type: 'Expense', cat: 'Other Expenses', cf: 'financing', parent: '8000' },
  { n: 8020, code: '8020', name: 'Loss on Disposal of Assets', type: 'Expense', cat: 'Other Expenses', cf: 'investing', parent: '8000' },
  { n: 8030, code: '8030', name: 'Income Tax Expense', type: 'Expense', cat: 'Other Expenses', cf: 'operating', parent: '8000' },
];

const STANDARD_ZA: ChartOfAccountsTemplate = {
  key: 'standard-ifrs-sme-za',
  name: 'Standard Chart of Accounts (South Africa)',
  description:
    'Professionally structured IFRS for SMEs chart of accounts for South African businesses — includes VAT, PAYE/UIF/SDL control accounts, and a full asset, liability, equity, revenue, cost-of-sales and expense structure.',
  framework: 'IFRS for SMEs',
  region: 'ZA',
  recommended: true,
  accounts: expand(STANDARD_ZA_SPECS),
};

export const REGISTRY: Record<string, ChartOfAccountsTemplate> = {
  [STANDARD_ZA.key]: STANDARD_ZA,
};

export const DEFAULT_TEMPLATE_KEY = STANDARD_ZA.key;

export function listTemplates(): TemplateCatalogEntry[] {
  return Object.values(REGISTRY).map((t) => ({
    key: t.key,
    name: t.name,
    description: t.description,
    framework: t.framework,
    region: t.region,
    recommended: t.recommended,
    accountCount: t.accounts.length,
  }));
}

export function getTemplate(key: string): ChartOfAccountsTemplate | undefined {
  return REGISTRY[key];
}
