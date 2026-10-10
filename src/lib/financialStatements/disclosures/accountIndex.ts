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

/** One asset in the fixed asset register, as sealed with the facts. */
export type RegisterAsset = {
  id: string;
  asset_code?: string | null;
  description?: string | null;
  asset_account_id: string | null;
  accumulated_depreciation_account_id?: string | null;
  purchase_date?: string | null;
  cost: number;
  residual_value?: number | null;
  useful_life_years?: number | null;
  depreciation_method?: string | null;
  status?: string | null;
  /** Depreciation charged (and disposal), each with the date it ran to. */
  events: Array<{ type: string; as_of: string; amount: number }>;
};

export type GrossMovement = { id: string; debits: number; credits: number };

/** One year of payroll, sealed with the facts (ADR-0009; absent on older seals). */
export type PayrollYear = {
  from: string;
  to: string;
  runs: number;
  payslips: number;
  employees: { average: number; yearEnd: number; paid: number };
  earnings: { salaries: number; overtime: number; bonuses: number; leavePay: number; commission: number; allowances: number; other: number };
  benefits: number;
  employer: { uif: number; sdl: number; other: number };
  grossPay: number;
  employerContributions: number;
  payrollCost: number;
  directors: Array<{ employeeId: string; name: string; salary: number; bonuses: number; allowances: number; benefits: number; total: number }>;
};

export type FinancialFacts = {
  period?: {
    start_date?: string;
    end_date?: string;
    prior_as_of?: string;
    period_key?: string;
    prior_start_date?: string;
    prior_opening_as_of?: string;
  };
  /** Debits and credits per account over the year (absent on older seals). */
  gross_movements?: GrossMovement[] | null;
  prior_gross_movements?: GrossMovement[] | null;
  /** The fixed asset register sub-ledger (absent on older seals). */
  fixed_asset_register?: RegisterAsset[] | null;
  /** Payroll by year: payslips of runs in effect (absent on older seals). */
  payroll?: { current: PayrollYear | null; prior: PayrollYear | null } | null;
  /** The ledger's cash movements by section and counter-account, each year. */
  cash_flow?: Array<{ section: string; category: string; amount: number }> | null;
  prior_cash_flow?: Array<{ section: string; category: string; amount: number }> | null;
  balances_as_of?: Array<FactAccount & { balance?: number }>;
  balances_prior_as_of?: Array<FactAccount & { balance?: number }>;
  period_activity?: Array<
    FactAccount & { opening_balance?: number; closing_balance?: number; period_activity?: number }
  >;
  /** The comparative year's movements, sealed with this year's (absent on older seals). */
  prior_period_activity?: Array<FactAccount & { period_activity?: number }> | null;
};

export type AccountRow = FactAccount & {
  /** This year's closing balance. */
  closing: number;
  /** Last year's closing balance, which is this year's opening. */
  prior: number;
  /** Movement over the period, where the snapshot carries it. */
  activity: number;
  hasActivity: boolean;
  /** Movement over the comparative year, where the seal carries it. */
  priorActivity: number;
  /** Gross debits and credits over each year, where the seal carries them. */
  debits: number;
  credits: number;
  priorDebits: number;
  priorCredits: number;
};

export type AccountFilter = {
  type?: string | string[];
  category?: string | string[];
  subcategory?: string | string[];
  /** Matched against the account name, case-insensitively. */
  nameMatches?: RegExp;
  /** Excluded by name — how a contra account is held out of a gross total. */
  nameExcludes?: RegExp;
  /** Excluded by ledger role — retained earnings is stated on its own line. */
  excludeRoles?: string[];
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
  /**
   * True when the seal carries last year's movements. Without them last year's
   * revenue and expenses are unknown — a running balance is not last year.
   */
  readonly hasPriorFlows: boolean;
  /** True when the seal carries gross debits and credits for the year. */
  readonly hasGross: boolean;
  readonly hasPriorGross: boolean;
  /** The fixed asset register, where the seal carries it. */
  readonly register: RegisterAsset[] | null;
  /** Payroll for this year and last, where the seal carries it. */
  readonly payroll: { current: PayrollYear | null; prior: PayrollYear | null } | null;
  /** The ledger's cash movements, where the seal carries them. */
  readonly cashFlow: Array<{ section: string; category: string; amount: number }> | null;
  readonly priorCashFlow: Array<{ section: string; category: string; amount: number }> | null;

  constructor(facts: FinancialFacts | null | undefined) {
    this.period = facts?.period;
    this.register = Array.isArray(facts?.fixed_asset_register) ? facts!.fixed_asset_register! : null;
    this.payroll = facts?.payroll && typeof facts.payroll === 'object' ? facts.payroll : null;
    this.cashFlow = Array.isArray(facts?.cash_flow) ? facts!.cash_flow! : null;
    this.priorCashFlow = Array.isArray(facts?.prior_cash_flow) ? facts!.prior_cash_flow! : null;
    this.hasGross = Array.isArray(facts?.gross_movements);
    this.hasPriorGross = Array.isArray(facts?.prior_gross_movements);
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
        priorActivity: 0,
        debits: 0,
        credits: 0,
        priorDebits: 0,
        priorCredits: 0,
        ...patch,
      });
    };

    for (const a of arr(facts?.balances_as_of)) put(a, { closing: n(a.balance) });
    for (const a of arr(facts?.balances_prior_as_of)) put(a, { prior: n(a.balance) });
    for (const a of arr(facts?.period_activity)) {
      put(a, { activity: n(a.period_activity), hasActivity: true });
    }
    this.hasPriorFlows = Array.isArray(facts?.prior_period_activity);
    for (const a of arr(facts?.prior_period_activity ?? undefined)) {
      put(a, { priorActivity: n(a.period_activity) });
    }

    for (const g of arr(facts?.gross_movements ?? undefined)) {
      const row = byId.get(g.id);
      if (row) Object.assign(row, { debits: n(g.debits), credits: n(g.credits) });
    }
    for (const g of arr(facts?.prior_gross_movements ?? undefined)) {
      const row = byId.get(g.id);
      if (row) Object.assign(row, { priorDebits: n(g.debits), priorCredits: n(g.credits) });
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
      if (filter.excludeRoles && filter.excludeRoles.includes(String(r.account_role || '').toLowerCase())) {
        return false;
      }
      return true;
    });
  }

  /** The total of matching accounts on one basis, with the accounts behind it. */
  total(
    filter: AccountFilter,
    basis: 'closing' | 'prior' | 'activity' | 'period' | 'priorPeriod' = 'closing',
  ): {
    amount: number;
    source: CellSource;
    accounts: AccountRow[];
  } {
    const accounts = this.find(filter);
    // "period" is what an income or expense account earned or cost this year:
    // the movement where the snapshot carries it. Its closing balance runs on
    // from earlier years until the books are closed off, so reading it as this
    // year's figure overstated the notes — revenue printed at 5 571 000 against
    // 3 421 000 on the statement it explains.
    const figure = (a: AccountRow) =>
      basis === 'period'
        ? a.hasActivity
          ? a.activity
          : a.closing
        : basis === 'priorPeriod'
          ? a.priorActivity
          : a[basis];
    const resolved = basis === 'period' ? 'activity' : basis === 'priorPeriod' ? 'prior' : basis;
    const amount = accounts.reduce((sum, a) => sum + figure(a), 0);
    return {
      amount,
      accounts,
      source: {
        basis: resolved,
        accounts: accounts.map((a) => ({
          id: a.id,
          code: a.account_code ?? (a.account_number != null ? String(a.account_number) : null),
          name: a.name,
          amount: figure(a),
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
