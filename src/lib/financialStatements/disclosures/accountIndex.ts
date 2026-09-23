/**
 * The company's accounts, arranged so a disclosure can ask for what it needs.
 *
 * Everything here reads the sealed fact snapshot — the same figures the primary
 * statements were built from. No balance is recomputed and no ledger is queried,
 * so a note can never disagree with the statement it supports.
 */
import type { CellSource } from './types';

export type FactAccount = {
  id: string;
  account_number?: number | null;
  account_code?: string | null;
  name: string;
  type: string;
  category?: string | null;
  subcategory?: string | null;
  account_role?: string | null;
};

export type FinancialFacts = {
  period?: { start_date?: string; end_date?: string; prior_as_of?: string; period_key?: string };
  balances_as_of?: Array<FactAccount & { balance?: number }>;
  balances_prior_as_of?: Array<FactAccount & { balance?: number }>;
  period_activity?: Array<
    FactAccount & { opening_balance?: number; closing_balance?: number; period_activity?: number }
  >;
};

export type AccountRow = FactAccount & {
  /** This year's closing balance. */
  closing: number;
  /** Last year's closing balance, which is this year's opening. */
  prior: number;
  /** Movement over the period, where the snapshot carries it. */
  activity: number;
  hasActivity: boolean;
};

export type AccountFilter = {
  type?: string | string[];
  category?: string | string[];
  subcategory?: string | string[];
  /** Matched against the account name, case-insensitively. */
  nameMatches?: RegExp;
  /** Excluded by name — how a contra account is held out of a gross total. */
  nameExcludes?: RegExp;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const arr = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : []);

function matches(value: string | null | undefined, want: string | string[] | undefined): boolean {
  if (want === undefined) return true;
  const list = Array.isArray(want) ? want : [want];
  const v = String(value ?? '').trim().toLowerCase();
  return list.some((w) => w.trim().toLowerCase() === v);
}

export class AccountIndex {
  readonly rows: AccountRow[];
  readonly period: FinancialFacts['period'];
  /** True when last year's balances are in the snapshot at all. */
  readonly hasComparatives: boolean;

  constructor(facts: FinancialFacts | null | undefined) {
    this.period = facts?.period;
    const byId = new Map<string, AccountRow>();

    const put = (a: FactAccount, patch: Partial<AccountRow>) => {
      const key = a.id || `${a.account_number ?? ''}:${a.name}`;
      const existing = byId.get(key);
      if (existing) {
        Object.assign(existing, patch);
        return;
      }
      byId.set(key, {
        id: a.id,
        account_number: a.account_number ?? null,
        account_code: a.account_code ?? null,
        name: a.name,
        type: a.type,
        category: a.category ?? null,
        subcategory: a.subcategory ?? null,
        account_role: a.account_role ?? null,
        closing: 0,
        prior: 0,
        activity: 0,
        hasActivity: false,
        ...patch,
      });
    };

    for (const a of arr(facts?.balances_as_of)) put(a, { closing: n(a.balance) });
    for (const a of arr(facts?.balances_prior_as_of)) put(a, { prior: n(a.balance) });
    for (const a of arr(facts?.period_activity)) {
      put(a, { activity: n(a.period_activity), hasActivity: true });
    }

    this.rows = [...byId.values()];
    this.hasComparatives = arr(facts?.balances_prior_as_of).some((a) => n(a.balance) !== 0);
  }

  find(filter: AccountFilter): AccountRow[] {
    return this.rows.filter((r) => {
      if (!matches(r.type, filter.type)) return false;
      if (!matches(r.category, filter.category)) return false;
      if (!matches(r.subcategory, filter.subcategory)) return false;
      if (filter.nameMatches && !filter.nameMatches.test(r.name)) return false;
      if (filter.nameExcludes && filter.nameExcludes.test(r.name)) return false;
      return true;
    });
  }

  /** The total of matching accounts on one basis, with the accounts behind it. */
  total(filter: AccountFilter, basis: 'closing' | 'prior' | 'activity' = 'closing'): {
    amount: number;
    source: CellSource;
    accounts: AccountRow[];
  } {
    const accounts = this.find(filter);
    const amount = accounts.reduce((sum, a) => sum + a[basis], 0);
    return {
      amount,
      accounts,
      source: {
        basis,
        accounts: accounts.map((a) => ({
          id: a.id,
          code: a.account_code ?? (a.account_number != null ? String(a.account_number) : null),
          name: a.name,
          amount: a[basis],
        })),
      },
    };
  }

  /** True when anything under this filter carries a figure in either period. */
  any(filter: AccountFilter): boolean {
    return this.find(filter).some((a) => a.closing !== 0 || a.prior !== 0 || a.activity !== 0);
  }

  /** The distinct subcategories present under a category. */
  subcategories(category: string | string[]): string[] {
    const seen = new Set<string>();
    for (const r of this.find({ category })) {
      if (r.subcategory) seen.add(r.subcategory);
    }
    return [...seen];
  }
}

/** Names that identify a contra account within its own subcategory. */
export const ACCUMULATED_DEPRECIATION = /accumulated\s+(depreciation|amortisation|amortization)|provision for depreciation/i;
export const ALLOWANCE = /provision for doubtful|allowance for (doubtful|credit|expected)|impairment allowance/i;
