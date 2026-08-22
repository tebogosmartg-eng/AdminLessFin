/**
 * Canonical Chart of Accounts classification.
 *
 * The Chart of Accounts is the single source of truth for how an account
 * presents in the Trial Balance and the financial statements. Two existing
 * columns carry that authority — no new column is introduced:
 *
 *   chart_of_accounts.type        the certified 5-value account_type enum
 *   chart_of_accounts.category    the PRESENTATION CLASSIFICATION (this module)
 *   chart_of_accounts.subcategory the statement line item under that class
 *
 * `category` already carries this vocabulary: the CoA generator templates, the
 * control-account mapping, and canonicalFinancialAggregation all read it. This
 * module makes the vocabulary explicit, validates type/category agreement, and
 * gives every reporting consumer one deterministic hierarchy to render.
 *
 * Classification is presentation metadata. It never affects a posted amount,
 * a debit, a credit, or a journal relationship.
 */

export type ClassifiableAccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

/** Label shown wherever an account carries no authoritative classification yet. */
export const CLASSIFICATION_REQUIRED_LABEL = 'Classification Required';

/**
 * Permitted `category` values per `type`. Ordered for presentation — the Trial
 * Balance and statement groupings render classes in this sequence.
 */
export const ACCOUNT_CLASSIFICATIONS: Record<ClassifiableAccountType, readonly string[]> = {
  Asset: ['Current Assets', 'Non-Current Assets'],
  Liability: ['Current Liabilities', 'Non-Current Liabilities'],
  Equity: ['Equity'],
  Income: ['Revenue', 'Other Income'],
  Expense: ['Cost of Sales', 'Operating Expenses', 'Finance Costs', 'Taxation', 'Other Expenses'],
};

/**
 * Statement line items available under each classification. Optional — an
 * account is fully classified with `category` alone; `subcategory` refines the
 * statement line where the customer wants that detail.
 */
export const ACCOUNT_SUBCLASSIFICATIONS: Record<string, readonly string[]> = {
  'Current Assets': ['Cash and Cash Equivalents', 'Trade and Other Receivables', 'Inventory'],
  'Non-Current Assets': ['Property, Plant and Equipment', 'Intangible Assets'],
  'Current Liabilities': [
    'Trade and Other Payables',
    'Statutory Payables',
    'Interest-bearing Borrowings',
    'Related-party Payables',
    'Provisions',
  ],
  'Non-Current Liabilities': ['Interest-bearing Borrowings', 'Related-party Payables', 'Provisions'],
  Equity: ['Issued Capital', 'Reserves', 'Distributions'],
  Revenue: [],
  'Other Income': [],
  'Cost of Sales': [],
  'Operating Expenses': ['Employee Costs'],
  'Finance Costs': [],
  Taxation: [],
  'Other Expenses': [],
};

/** Statement-group heading for a type — Trial Balance level 1. */
export const ACCOUNT_TYPE_GROUP: Record<ClassifiableAccountType, string> = {
  Asset: 'Assets',
  Liability: 'Liabilities',
  Equity: 'Equity',
  Income: 'Income',
  Expense: 'Expenses',
};

const TYPE_GROUP_ORDER: ClassifiableAccountType[] = [
  'Asset',
  'Liability',
  'Equity',
  'Income',
  'Expense',
];

export function isClassifiableAccountType(type: unknown): type is ClassifiableAccountType {
  return (
    type === 'Asset' ||
    type === 'Liability' ||
    type === 'Equity' ||
    type === 'Income' ||
    type === 'Expense'
  );
}

/** Classifications valid for a type. Empty when the type is unknown. */
export function classificationsForType(type: unknown): readonly string[] {
  return isClassifiableAccountType(type) ? ACCOUNT_CLASSIFICATIONS[type] : [];
}

/** Statement line items valid under a classification. */
export function subclassificationsForClassification(category: unknown): readonly string[] {
  const key = typeof category === 'string' ? category.trim() : '';
  return ACCOUNT_SUBCLASSIFICATIONS[key] ?? [];
}

/**
 * True when `category` is a permitted classification for `type`.
 * A NULL/blank category is NOT valid here — use `isClassificationRequired` to
 * distinguish "not yet classified" from "classified wrongly".
 */
export function isValidClassification(type: unknown, category: unknown): boolean {
  const key = typeof category === 'string' ? category.trim() : '';
  if (!key) return false;
  return classificationsForType(type).includes(key);
}

export function isValidSubclassification(category: unknown, subcategory: unknown): boolean {
  const key = typeof subcategory === 'string' ? subcategory.trim() : '';
  if (!key) return true; // subcategory is optional
  return subclassificationsForClassification(category).includes(key);
}

/**
 * An account needs the customer's classification decision when `category` is
 * absent or does not belong to its type. Never guessed from name or code.
 */
export function isClassificationRequired(account: {
  type?: string | null;
  category?: string | null;
}): boolean {
  return !isValidClassification(account.type, account.category);
}

export function countAccountsRequiringClassification(
  accounts: Array<{ type?: string | null; category?: string | null; is_active?: boolean | null }>,
): number {
  return accounts.filter((a) => a.is_active !== false && isClassificationRequired(a)).length;
}

/**
 * Human-readable reason a type/category pair is rejected, or null when valid.
 * Shared by the account form and the chart-of-accounts edge function so the
 * frontend and the domain layer reject identical combinations.
 */
export function classificationError(type: unknown, category: unknown): string | null {
  if (!isClassifiableAccountType(type)) return 'A valid account type is required.';
  const key = typeof category === 'string' ? category.trim() : '';
  if (!key) return `Classification is required for a ${type} account.`;
  if (!ACCOUNT_CLASSIFICATIONS[type].includes(key)) {
    return `"${key}" is not a valid classification for a ${type} account. Choose one of: ${ACCOUNT_CLASSIFICATIONS[type].join(', ')}.`;
  }
  return null;
}

export function subclassificationError(category: unknown, subcategory: unknown): string | null {
  const sub = typeof subcategory === 'string' ? subcategory.trim() : '';
  if (!sub) return null;
  const allowed = subclassificationsForClassification(category);
  if (!allowed.includes(sub)) {
    return allowed.length
      ? `"${sub}" is not a valid statement line for ${category}. Choose one of: ${allowed.join(', ')}.`
      : `${category} accounts do not take a statement line.`;
  }
  return null;
}

export type AccountHierarchy = {
  /** Statement group — Assets / Liabilities / Equity / Income / Expenses. */
  l1: string;
  /** Classification — the authoritative `category`, or Classification Required. */
  l2: string;
  /** Statement line — `subcategory`, else the classification itself. */
  l3: string;
  /** True when the account carries no authoritative classification. */
  unclassified: boolean;
};

/**
 * The one deterministic hierarchy every accounting report renders.
 * Reads the Chart of Accounts only — never the account name, code, balance,
 * journal activity, or transaction history.
 */
export function resolveAccountHierarchy(account: {
  type?: string | null;
  category?: string | null;
  subcategory?: string | null;
}): AccountHierarchy {
  const type = account.type;
  const l1 = isClassifiableAccountType(type) ? ACCOUNT_TYPE_GROUP[type] : 'Unclassified';
  const classified = isValidClassification(type, account.category);
  const l2 = classified ? String(account.category).trim() : CLASSIFICATION_REQUIRED_LABEL;
  const sub = typeof account.subcategory === 'string' ? account.subcategory.trim() : '';
  // Deliberately equal to l2 when there is no statement line — consumers render
  // a single level rather than repeating the classification underneath itself.
  const l3 = classified && sub && isValidSubclassification(l2, sub) ? sub : l2;
  return { l1, l2, l3, unclassified: !classified };
}

/** Stable presentation sort key so every report orders classes identically. */
export function hierarchySortKey(account: { type?: string | null; category?: string | null }): number {
  const type = account.type;
  const typeIndex = isClassifiableAccountType(type) ? TYPE_GROUP_ORDER.indexOf(type) : 99;
  const classes = classificationsForType(type);
  const key = typeof account.category === 'string' ? account.category.trim() : '';
  const classIndex = classes.indexOf(key);
  return typeIndex * 100 + (classIndex >= 0 ? classIndex : 99);
}
