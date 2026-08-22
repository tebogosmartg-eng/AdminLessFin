/**
 * Existing Chart of Accounts — control-role mapping analysis.
 *
 * Runtime accounting identity remains `account_role` (ADR-0001). Display names
 * are used only to PROPOSE a mapping. Persistence writes `account_role` on the
 * existing account. This module never posts, reclassifies, or deletes.
 */

import { inferAccountRole } from '@/lib/accounting/accountRoles';
import { normalBalanceFor, type AccountType } from '@/lib/chartOfAccounts/validation';
import type { ControlAccountRole } from './model';
import {
  CONTROL_TO_ACCOUNT_ROLE,
  requiredControlRoles,
} from './model';
import { accountSatisfiesControlRole, type CoaRow } from './validation';

export type MappingStatus = 'mapped' | 'auto' | 'ambiguous' | 'missing' | 'not_required';

export type MappingCandidate = {
  id: string;
  name: string;
  accountNumber: number | null;
  accountCode: string | null;
  type: string;
  reason: 'role' | 'metadata' | 'name';
};

export type ControlMappingRow = {
  role: ControlAccountRole;
  status: MappingStatus;
  mappedAccount?: MappingCandidate;
  candidates: MappingCandidate[];
  note?: string;
};

export type ControlMappingAnalysis = {
  accountCount: number;
  requiredCount: number;
  mappedCount: number;
  autoCount: number;
  ambiguousCount: number;
  missingCount: number;
  mappingsComplete: boolean;
  rows: ControlMappingRow[];
};

export type MappingFlags = {
  inventoryEnabled?: boolean;
  inventory_enabled?: boolean;
  fixedAssetsEnabled?: boolean;
  fixed_assets_enabled?: boolean;
  payrollEnabled?: boolean;
  payroll_enabled?: boolean;
};

type AliasSpec = {
  aliases: string[];
  /** Short tokens matched only as the entire normalised name (never as a substring). */
  exactOnly?: string[];
  types: AccountType[];
};

const ALIASES: Record<Exclude<ControlAccountRole, 'profit_loss'>, AliasSpec> = {
  trade_debtors: {
    aliases: [
      'accounts receivable',
      'trade receivables',
      'trade receivable',
      'trade debtors',
      'trade debtor',
      'debtors',
      'debtor',
      'customer receivables',
      'customer receivable',
      'accounts receivable control',
    ],
    exactOnly: ['ar'],
    types: ['Asset'],
  },
  trade_creditors: {
    aliases: [
      'accounts payable',
      'trade payables',
      'trade payable',
      'trade creditors',
      'trade creditor',
      'creditors',
      'creditor',
      'supplier payables',
      'supplier payable',
      'accounts payable control',
    ],
    exactOnly: ['ap'],
    types: ['Liability'],
  },
  vat_control: {
    aliases: [
      'vat control',
      'vat payable',
      'vat receivable',
      'vat input',
      'vat output',
      'vat clearing',
      'input vat',
      'output vat',
    ],
    exactOnly: ['vat'],
    types: ['Asset', 'Liability'],
  },
  bank: {
    aliases: [
      'bank current account',
      'current account',
      'cheque account',
      'checking account',
      'cash at bank',
      'bank account',
      'petty cash',
      'cash on hand',
    ],
    exactOnly: ['bank', 'cash'],
    types: ['Asset'],
  },
  retained_earnings: {
    aliases: [
      'retained earnings',
      'accumulated profit',
      'accumulated surplus',
      'retained profit',
      'accumulated earnings',
    ],
    types: ['Equity'],
  },
  inventory: {
    aliases: ['inventory asset', 'merchandise inventory', 'inventory', 'stock on hand', 'stock'],
    types: ['Asset'],
  },
  fixed_assets: {
    aliases: [
      'fixed assets',
      'property plant and equipment',
      'plant and equipment',
      'plant equipment',
    ],
    exactOnly: ['ppe'],
    types: ['Asset'],
  },
  payroll_clearing: {
    aliases: [
      'payroll clearing',
      'payroll control',
      'wages payable',
      'salary clearing',
      'payroll liability',
    ],
    types: ['Liability'],
  },
};

const METADATA_ROLE: Record<Exclude<ControlAccountRole, 'profit_loss'>, string | string[]> = {
  trade_debtors: 'trade_receivable',
  trade_creditors: 'trade_payable',
  vat_control: ['vat_control', 'output_vat', 'input_vat'],
  bank: ['bank', 'cash'],
  retained_earnings: 'retained_earnings',
  inventory: 'inventory_asset',
  fixed_assets: 'fixed_asset',
  payroll_clearing: ['payroll_clearing', 'payroll_control'],
};

export type RecommendedControlSpec = {
  account_number: number;
  account_code: string;
  name: string;
  type: AccountType;
  account_role: string;
  control_account: boolean;
  allow_manual_posting: boolean;
  system_account: boolean;
  normal_balance: 'debit' | 'credit';
  category: string;
  subcategory: string;
  tax_treatment?: string;
  description: string;
  source: 'setup_control';
};

export const RECOMMENDED_CONTROL_SPECS: Record<
  Exclude<ControlAccountRole, 'profit_loss'>,
  RecommendedControlSpec
> = {
  trade_debtors: {
    account_number: 1220,
    account_code: '1220',
    name: 'Accounts Receivable (Trade Debtors)',
    type: 'Asset',
    account_role: 'trade_receivable',
    control_account: true,
    allow_manual_posting: false,
    system_account: false,
    normal_balance: 'debit',
    category: 'Current Assets',
    subcategory: 'Trade and Other Receivables',
    description: 'Used to record amounts owed by customers from posted invoices.',
    source: 'setup_control',
  },
  trade_creditors: {
    account_number: 2110,
    account_code: '2110',
    name: 'Accounts Payable (Trade Creditors)',
    type: 'Liability',
    account_role: 'trade_payable',
    control_account: true,
    allow_manual_posting: false,
    system_account: false,
    normal_balance: 'credit',
    category: 'Current Liabilities',
    subcategory: 'Trade and Other Payables',
    description: 'Used to record amounts owed to suppliers from posted bills.',
    source: 'setup_control',
  },
  vat_control: {
    account_number: 2125,
    account_code: '2125',
    name: 'VAT Control',
    type: 'Liability',
    account_role: 'vat_control',
    control_account: true,
    allow_manual_posting: false,
    system_account: false,
    normal_balance: 'credit',
    category: 'Current Liabilities',
    subcategory: 'Trade and Other Payables',
    tax_treatment: 'vat_control',
    description: 'Used to record VAT input, output, and net VAT payable or receivable.',
    source: 'setup_control',
  },
  bank: {
    account_number: 1260,
    account_code: '1260',
    name: 'Bank - Current Account',
    type: 'Asset',
    account_role: 'bank',
    control_account: false,
    allow_manual_posting: true,
    system_account: false,
    normal_balance: 'debit',
    category: 'Current Assets',
    subcategory: 'Cash and Cash Equivalents',
    description: 'Used to record cash at bank so receipts, payments, and reconciliation can post.',
    source: 'setup_control',
  },
  retained_earnings: {
    account_number: 3020,
    account_code: '3020',
    name: 'Retained Earnings',
    type: 'Equity',
    account_role: 'retained_earnings',
    control_account: false,
    allow_manual_posting: false,
    system_account: true,
    normal_balance: 'credit',
    category: 'Equity',
    subcategory: 'Reserves',
    description: 'Used to accumulate prior-period profit or loss after close.',
    source: 'setup_control',
  },
  inventory: {
    account_number: 1210,
    account_code: '1210',
    name: 'Inventory',
    type: 'Asset',
    account_role: 'inventory_asset',
    control_account: true,
    allow_manual_posting: false,
    system_account: false,
    normal_balance: 'debit',
    category: 'Current Assets',
    subcategory: 'Inventory',
    description: 'Used to record stock on hand when the Inventory module is enabled.',
    source: 'setup_control',
  },
  fixed_assets: {
    account_number: 1110,
    account_code: '1110',
    name: 'Property, Plant and Equipment',
    type: 'Asset',
    account_role: 'fixed_asset',
    control_account: false,
    allow_manual_posting: true,
    system_account: false,
    normal_balance: 'debit',
    category: 'Non-Current Assets',
    subcategory: 'Property, Plant and Equipment',
    description: 'Used to record property, plant and equipment when the Fixed Assets module is enabled.',
    source: 'setup_control',
  },
  payroll_clearing: {
    account_number: 2195,
    account_code: '2195',
    name: 'Payroll Clearing',
    type: 'Liability',
    account_role: 'payroll_clearing',
    control_account: true,
    allow_manual_posting: false,
    system_account: false,
    normal_balance: 'credit',
    category: 'Current Liabilities',
    subcategory: 'Statutory Payables',
    description: 'Used to clear net pay and statutory deductions when the Payroll module is enabled.',
    source: 'setup_control',
  },
};

export function compatibleAccountsForRole<T extends CoaRow>(
  accounts: T[],
  role: ControlAccountRole,
): T[] {
  const active = accounts.filter((a) => a.is_active !== false);
  if (role === 'profit_loss') {
    return active.filter((a) => a.type === 'Income' || a.type === 'Expense');
  }
  const types = ALIASES[role].types;
  return active.filter((a) => types.includes(a.type as AccountType));
}

export function buildRecommendedAccount(
  role: Exclude<ControlAccountRole, 'profit_loss'>,
  existing: CoaRow[],
): RecommendedControlSpec {
  const spec = { ...RECOMMENDED_CONTROL_SPECS[role] };
  const usedNumbers = new Set(
    existing.map((a) => a.account_number).filter((n): n is number => n != null),
  );
  const usedCodes = new Set(
    existing.map((a) => a.account_code).filter((c): c is string => !!c),
  );
  if (usedNumbers.has(spec.account_number)) {
    const max = usedNumbers.size ? Math.max(...usedNumbers) : 0;
    spec.account_number = max + 1;
  }
  if (usedCodes.has(spec.account_code)) {
    spec.account_code = String(spec.account_number);
    if (usedCodes.has(spec.account_code)) {
      spec.account_code = `${spec.account_code}-${role}`;
    }
  }
  spec.normal_balance = normalBalanceFor(spec.type);
  return spec;
}

function normalise(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toCandidate(account: CoaRow, reason: MappingCandidate['reason']): MappingCandidate {
  return {
    id: account.id,
    name: account.name,
    accountNumber: account.account_number ?? null,
    accountCode: account.account_code ?? null,
    type: account.type,
    reason,
  };
}

function metadataMatches(account: CoaRow, role: Exclude<ControlAccountRole, 'profit_loss'>): boolean {
  const expected = METADATA_ROLE[role];
  const inferred = inferAccountRole(account);
  if (!inferred) return false;
  return Array.isArray(expected) ? expected.includes(inferred) : inferred === expected;
}

function nameMatches(account: CoaRow, role: Exclude<ControlAccountRole, 'profit_loss'>): boolean {
  const spec = ALIASES[role];
  if (!spec.types.includes(account.type as AccountType)) return false;
  const haystack = `${normalise(account.name)} ${normalise(account.description)}`.trim();
  const nameOnly = normalise(account.name);
  if (spec.exactOnly?.some((token) => nameOnly === token)) return true;
  return spec.aliases.some((alias) => {
    const needle = normalise(alias);
    if (!needle) return false;
    if (nameOnly === needle) return true;
    return ` ${haystack} `.includes(` ${needle} `);
  });
}

function uniqueById(candidates: MappingCandidate[]): MappingCandidate[] {
  const seen = new Set<string>();
  const out: MappingCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    out.push(candidate);
  }
  return out;
}

export function analyseControlAccountMappings(input: {
  accounts: CoaRow[];
  flags?: MappingFlags;
  bankAccountsCount?: number;
  bankAccountsSkipped?: boolean;
  payrollMappingsCount?: number;
}): ControlMappingAnalysis {
  const accounts = (input.accounts ?? []).filter((a) => a.is_active !== false);
  const required = requiredControlRoles(input.flags ?? {});
  const rows: ControlMappingRow[] = required.map((role) =>
    analyseRole(role, accounts, input),
  );

  const mappedCount = rows.filter((r) => r.status === 'mapped').length;
  const autoCount = rows.filter((r) => r.status === 'auto').length;
  const ambiguousCount = rows.filter((r) => r.status === 'ambiguous').length;
  const missingCount = rows.filter((r) => r.status === 'missing').length;

  return {
    accountCount: (input.accounts ?? []).length,
    requiredCount: rows.length,
    mappedCount,
    autoCount,
    ambiguousCount,
    missingCount,
    mappingsComplete: missingCount === 0 && ambiguousCount === 0 && autoCount === 0,
    rows,
  };
}

function analyseRole(
  role: ControlAccountRole,
  accounts: CoaRow[],
  input: {
    bankAccountsCount?: number;
    bankAccountsSkipped?: boolean;
    payrollMappingsCount?: number;
  },
): ControlMappingRow {
  if (role === 'profit_loss') {
    const income = accounts.filter((a) => a.type === 'Income');
    const expense = accounts.filter((a) => a.type === 'Expense');
    if (income.length > 0 && expense.length > 0) {
      return {
        role,
        status: 'mapped',
        mappedAccount: toCandidate(income[0], 'metadata'),
        candidates: [...income, ...expense].slice(0, 4).map((a) => toCandidate(a, 'metadata')),
        note: 'Income and Expense accounts are present.',
      };
    }
    const missing = [
      income.length === 0 ? 'an Income (revenue) account' : null,
      expense.length === 0 ? 'an Expense account' : null,
    ].filter(Boolean);
    return {
      role,
      status: 'missing',
      candidates: [],
      note: `Add ${missing.join(' and ')} to complete Profit / Loss.`,
    };
  }

  if (role === 'bank' && ((input.bankAccountsCount ?? 0) > 0 || input.bankAccountsSkipped)) {
    const existing = accounts.find((a) => accountSatisfiesControlRole(a, 'bank'));
    return {
      role,
      status: 'mapped',
      mappedAccount: existing ? toCandidate(existing, existing.account_role ? 'role' : 'metadata') : undefined,
      candidates: existing ? [toCandidate(existing, 'role')] : [],
      note: input.bankAccountsSkipped
        ? 'Satisfied because banking was skipped for now.'
        : 'Satisfied by a linked bank account.',
    };
  }

  if (role === 'payroll_clearing' && (input.payrollMappingsCount ?? 0) > 0) {
    const existing = accounts.find((a) => accountSatisfiesControlRole(a, 'payroll_clearing'));
    return {
      role,
      status: 'mapped',
      mappedAccount: existing ? toCandidate(existing, 'role') : undefined,
      candidates: existing ? [toCandidate(existing, 'role')] : [],
      note: 'Satisfied by an existing payroll account mapping.',
    };
  }

  const already = accounts.filter((a) => accountSatisfiesControlRole(a, role));
  if (already.length === 1) {
    const account = already[0];
    return {
      role,
      status: 'mapped',
      mappedAccount: toCandidate(account, account.account_role ? 'role' : 'metadata'),
      candidates: [toCandidate(account, 'role')],
    };
  }
  if (already.length > 1) {
    return {
      role,
      status: 'ambiguous',
      candidates: already.map((a) => toCandidate(a, a.account_role ? 'role' : 'metadata')),
      note: `Which account should AdminLess Fin use for ${role.replaceAll('_', ' ')}?`,
    };
  }

  const metadataHits = accounts.filter(
    (a) => !a.account_role && metadataMatches(a, role),
  );
  const nameHits = accounts.filter(
    (a) => !a.account_role && nameMatches(a, role) && !metadataHits.some((m) => m.id === a.id),
  );

  const autoPool = uniqueById([
    ...metadataHits.map((a) => toCandidate(a, 'metadata')),
    ...nameHits.map((a) => toCandidate(a, 'name')),
  ]);

  if (autoPool.length === 1) {
    return {
      role,
      status: 'auto',
      mappedAccount: autoPool[0],
      candidates: autoPool,
      note: autoPool[0].reason === 'name'
        ? 'Automatically recognised from the account name. Confirm or change it.'
        : 'Automatically recognised from account metadata. Confirm or change it.',
    };
  }

  if (autoPool.length > 1) {
    return {
      role,
      status: 'ambiguous',
      candidates: autoPool,
      note: `Which account should AdminLess Fin use for ${role.replaceAll('_', ' ')}?`,
    };
  }

  return {
    role,
    status: 'missing',
    candidates: [],
    note: `No existing account is a clear match. Map an existing ${ALIASES[role].types.join(' or ')} account, or create the recommended account.`,
  };
}

export function accountRoleForControl(role: Exclude<ControlAccountRole, 'profit_loss'>): string {
  return CONTROL_TO_ACCOUNT_ROLE[role];
}
