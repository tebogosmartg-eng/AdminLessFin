/**
 * The switch-over checklist: the order a move from another accounting
 * system has to happen in, and what to export for each step. Progress is
 * read from the company's import history, never stored separately.
 */
import type { EntityType, ImportRun } from './api';

export type SourceSystem = 'sage_cloud' | 'sage_pastel' | 'xero' | 'quickbooks' | 'other';

export const SOURCES: Array<{ id: SourceSystem; label: string }> = [
  { id: 'sage_cloud', label: 'Sage Business Cloud' },
  { id: 'sage_pastel', label: 'Sage Pastel / Sage 50' },
  { id: 'xero', label: 'Xero' },
  { id: 'quickbooks', label: 'QuickBooks' },
  { id: 'other', label: 'Spreadsheet or other' },
];

export interface SwitchStep {
  id: string;
  entity: EntityType | null; // null: the final comparison, not an import
  title: string;
  why: string;
  /** What to export from the old system. */
  export: (sourceLabel: string) => string;
  optional?: boolean;
}

export const SWITCH_STEPS: SwitchStep[] = [
  {
    id: 'accounts',
    entity: 'chart_of_accounts',
    title: 'Chart of accounts',
    why: 'Every balance and transaction needs an account to land in. Accounts you already have here are matched, not duplicated.',
    export: s => `From ${s}, export the chart of accounts (account list) to Excel or CSV.`,
  },
  {
    id: 'customers',
    entity: 'customers',
    title: 'Customers',
    why: 'Invoices and receipts are matched to customers by name.',
    export: s => `From ${s}, export the customer list.`,
  },
  {
    id: 'suppliers',
    entity: 'vendors',
    title: 'Suppliers',
    why: 'Bills and payments are matched to suppliers by name.',
    export: s => `From ${s}, export the supplier list.`,
  },
  {
    id: 'items',
    entity: 'products',
    title: 'Products & services',
    why: 'Only needed if you invoice from an item list.',
    export: s => `From ${s}, export the item (inventory / product and service) list.`,
    optional: true,
  },
  {
    id: 'invoices',
    entity: 'invoices',
    title: 'Unpaid customer invoices',
    why: 'Brings in what customers owe you, invoice by invoice, so statements and age analysis are right from day one.',
    export: s => `From ${s}, export the invoices that were still unpaid on the switch-over date.`,
  },
  {
    id: 'bills',
    entity: 'bills',
    title: 'Unpaid supplier bills',
    why: 'Brings in what you owe suppliers, bill by bill.',
    export: s => `From ${s}, export the supplier invoices (bills) that were still unpaid on the switch-over date.`,
  },
  {
    id: 'bank',
    entity: 'bank_transactions',
    title: 'Bank transactions',
    why: 'Set each bank account’s opening balance under Banking first, then bring in statement lines from the switch-over date onwards, ready to reconcile.',
    export: () => 'Download a CSV statement from your bank (or your old system) starting on the switch-over date.',
    optional: true,
  },
  {
    id: 'opening',
    entity: 'opening_balances',
    title: 'Opening balances',
    why: 'Upload your old trial balance exactly as it is, debtors, creditors and bank included. Only what the steps above have not already put in the books is posted, so nothing is counted twice.',
    export: s => `From ${s}, run the trial balance as at the day before your switch-over date and export it.`,
  },
  {
    id: 'check',
    entity: null,
    title: 'Check against your old system',
    why: 'Upload the same trial balance again and every account is compared with the books here, to the cent.',
    export: s => `Use the trial balance from ${s} as at your switch-over date.`,
  },
];

export interface StepProgress {
  done: boolean;
  lastRun: ImportRun | null;
}

/** A step is done once an import of its type has committed with records in it. */
export function stepProgress(step: SwitchStep, runs: ImportRun[] | undefined): StepProgress {
  if (!step.entity || !runs) return { done: false, lastRun: null };
  const lastRun = runs.find(r => r.entity_type === step.entity && r.status === 'committed') ?? null;
  const t = lastRun?.totals ?? {};
  const done = !!lastRun && ((t.imported ?? 0) + (t.updated ?? 0) + (t.skipped ?? 0)) > 0;
  return { done, lastRun };
}

const PLAN_KEY = (companyId: string) => `adminless.switchPlan.${companyId}`;

export interface SwitchPlan {
  source: SourceSystem | null;
  switchDate: string | null;
}

export function loadSwitchPlan(companyId: string): SwitchPlan {
  try {
    const raw = window.localStorage.getItem(PLAN_KEY(companyId));
    if (raw) return { source: null, switchDate: null, ...JSON.parse(raw) };
  } catch { /* private window or blocked storage: start blank */ }
  return { source: null, switchDate: null };
}

export function saveSwitchPlan(companyId: string, plan: SwitchPlan): void {
  try {
    window.localStorage.setItem(PLAN_KEY(companyId), JSON.stringify(plan));
  } catch { /* convenience only */ }
}

/** The day before the switch-over date: the date opening balances are stated at. */
export function dayBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}
