/**
 * Phase 4B — Accountant productivity preferences (client-persisted workspace state).
 * No server schema required.
 */
const PREFIX = 'adminless.accounting.v4b';

function key(companyId: string, suffix: string) {
  return `${PREFIX}.${companyId}.${suffix}`;
}

function readJson<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(k: string, value: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export type SavedFilter = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
};

export type SavedLedgerView = {
  id: string;
  name: string;
  accountId?: string;
  groupBy?: string;
  filters?: Record<string, unknown>;
  createdAt: string;
};

export const accountantPrefs = {
  getPinnedAccounts(companyId: string): string[] {
    return readJson(key(companyId, 'pinned'), []);
  },
  togglePinnedAccount(companyId: string, accountId: string): string[] {
    const cur = this.getPinnedAccounts(companyId);
    const next = cur.includes(accountId) ? cur.filter((id) => id !== accountId) : [accountId, ...cur].slice(0, 30);
    writeJson(key(companyId, 'pinned'), next);
    return next;
  },
  getRecentAccounts(companyId: string): string[] {
    return readJson(key(companyId, 'recent'), []);
  },
  touchRecentAccount(companyId: string, accountId: string): string[] {
    const next = [accountId, ...this.getRecentAccounts(companyId).filter((id) => id !== accountId)].slice(0, 20);
    writeJson(key(companyId, 'recent'), next);
    return next;
  },
  getSavedFilters(companyId: string): SavedFilter[] {
    return readJson(key(companyId, 'filters'), []);
  },
  saveFilter(companyId: string, name: string, filters: Record<string, unknown>): SavedFilter[] {
    const item: SavedFilter = { id: crypto.randomUUID(), name, filters, createdAt: new Date().toISOString() };
    const next = [item, ...this.getSavedFilters(companyId)].slice(0, 25);
    writeJson(key(companyId, 'filters'), next);
    return next;
  },
  deleteFilter(companyId: string, id: string): SavedFilter[] {
    const next = this.getSavedFilters(companyId).filter((f) => f.id !== id);
    writeJson(key(companyId, 'filters'), next);
    return next;
  },
  getSavedLedgerViews(companyId: string): SavedLedgerView[] {
    return readJson(key(companyId, 'ledgerViews'), []);
  },
  saveLedgerView(companyId: string, view: Omit<SavedLedgerView, 'id' | 'createdAt'>): SavedLedgerView[] {
    const item: SavedLedgerView = { ...view, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    const next = [item, ...this.getSavedLedgerViews(companyId)].slice(0, 25);
    writeJson(key(companyId, 'ledgerViews'), next);
    return next;
  },
  getFavouriteReports(companyId: string): string[] {
    return readJson(key(companyId, 'favouriteReports'), ['/trial-balance', '/general-ledger', '/accounting/timeline']);
  },
  toggleFavouriteReport(companyId: string, route: string): string[] {
    const cur = this.getFavouriteReports(companyId);
    const next = cur.includes(route) ? cur.filter((r) => r !== route) : [...cur, route];
    writeJson(key(companyId, 'favouriteReports'), next);
    return next;
  },
  getTbExpansion(companyId: string): Record<string, boolean> {
    return readJson(key(companyId, 'tbExpansion'), {
      Assets: true,
      Liabilities: true,
      Equity: true,
      Income: true,
      Expenses: true,
    });
  },
  setTbExpansion(companyId: string, state: Record<string, boolean>) {
    writeJson(key(companyId, 'tbExpansion'), state);
  },
  getWorkspaceState(companyId: string): Record<string, unknown> {
    return readJson(key(companyId, 'workspace'), {});
  },
  setWorkspaceState(companyId: string, patch: Record<string, unknown>) {
    writeJson(key(companyId, 'workspace'), { ...this.getWorkspaceState(companyId), ...patch });
  },
};

export const MODULE_COLORS: Record<string, string> = {
  sales: 'border-l-sky-500 bg-sky-500/5',
  sales_invoice: 'border-l-sky-500 bg-sky-500/5',
  purchases: 'border-l-amber-500 bg-amber-500/5',
  accounts_payable: 'border-l-amber-500 bg-amber-500/5',
  banking: 'border-l-emerald-500 bg-emerald-500/5',
  quick_capture: 'border-l-orange-500 bg-orange-500/5',
  inventory: 'border-l-violet-500 bg-violet-500/5',
  inventory_receipt: 'border-l-violet-500 bg-violet-500/5',
  inventory_issue: 'border-l-violet-500 bg-violet-500/5',
  payroll: 'border-l-rose-500 bg-rose-500/5',
  assets: 'border-l-indigo-500 bg-indigo-500/5',
  fixed_assets: 'border-l-indigo-500 bg-indigo-500/5',
  manual_journals: 'border-l-slate-500 bg-slate-500/5',
  manual_journal: 'border-l-slate-500 bg-slate-500/5',
  opening_balances: 'border-l-teal-500 bg-teal-500/5',
  adjustments: 'border-l-yellow-500 bg-yellow-500/5',
  other: 'border-l-muted-foreground bg-muted/30',
};

export function moduleColorClass(module: string | null | undefined) {
  if (!module) return MODULE_COLORS.other;
  const key = module.toLowerCase();
  return MODULE_COLORS[key] || MODULE_COLORS[key.split('_')[0]] || MODULE_COLORS.other;
}
