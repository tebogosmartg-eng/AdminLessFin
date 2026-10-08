import {
  BookOpen,
  Building2,
  FileText,
  Landmark,
  ListTree,
  Package,
  Receipt,
  Scale,
  Users,
  Wallet,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { downloadCSV, formatCurrency } from '../lib/utils';
import type { EntitySpec, EntityType, ImportRun, StagedRow } from './api';

export const ENTITY_GROUPS: Array<{ title: string; items: EntityType[] }> = [
  { title: 'Lists', items: ['customers', 'vendors', 'products', 'chart_of_accounts'] },
  { title: 'Transactions', items: ['invoices', 'bills', 'customer_payments', 'supplier_payments', 'bank_transactions', 'journal_entries'] },
  { title: 'Getting started', items: ['opening_balances'] },
];

export const ENTITY_ICONS: Record<EntityType, LucideIcon> = {
  customers: Users,
  vendors: Building2,
  products: Package,
  chart_of_accounts: ListTree,
  invoices: FileText,
  bills: Receipt,
  customer_payments: Wallet,
  supplier_payments: WalletCards,
  bank_transactions: Landmark,
  journal_entries: BookOpen,
  opening_balances: Scale,
};

/** Fallback names for history rows when the spec has not loaded yet. */
export const ENTITY_LABELS: Record<EntityType, string> = {
  customers: 'Customers',
  vendors: 'Suppliers',
  products: 'Products & services',
  chart_of_accounts: 'Chart of accounts',
  invoices: 'Invoices',
  bills: 'Supplier bills',
  customer_payments: 'Customer payments',
  supplier_payments: 'Supplier payments',
  bank_transactions: 'Bank transactions',
  journal_entries: 'Journal entries',
  opening_balances: 'Opening balances',
};

export const RUN_STATUS_LABELS: Record<ImportRun['status'], string> = {
  created: 'Not finished',
  validating: 'Checking',
  validated: 'Checked, not imported',
  committing: 'Importing',
  committed: 'Imported',
  failed: 'Stopped',
  cancelled: 'Cancelled',
};

export const ACTION_LABELS: Record<NonNullable<StagedRow['planned_action']>, string> = {
  create: 'Add',
  update: 'Update',
  skip: 'Skip',
};

export const OUTCOME_LABELS: Record<StagedRow['outcome'], string> = {
  pending: 'Waiting',
  imported: 'Imported',
  updated: 'Updated',
  skipped: 'Skipped',
  failed: 'Failed',
};

/** The template uses the field labels as headers, so it maps itself. */
export async function downloadTemplate(spec: EntitySpec): Promise<void> {
  const rows = spec.templateRows.map(example =>
    Object.fromEntries(spec.fields.map(f => [f.label, example[f.key] ?? ''])));
  await downloadCSV(rows, `${spec.entity}-import-template.csv`);
}

/**
 * The error report is the user's original rows plus what is wrong with each,
 * so they can fix the file in Excel and import it again.
 */
export async function downloadErrorReport(
  report: { file_name: string | null; entity_type: string; rows: Array<Pick<StagedRow, 'row_number' | 'raw' | 'validation_status' | 'issues' | 'outcome' | 'outcome_detail'>> },
): Promise<void> {
  const rows = report.rows.map(r => {
    const failure = r.outcome === 'failed' && typeof r.outcome_detail?.error === 'string' ? r.outcome_detail.error : null;
    const problems = [
      ...r.issues.map(i => `${i.severity === 'error' ? 'Error' : 'Warning'}: ${i.message}`),
      ...(failure ? [`Not imported: ${failure}`] : []),
    ];
    return {
      Row: r.row_number,
      Status: failure ? 'Failed' : r.validation_status === 'error' ? 'Error' : 'Warning',
      Problems: problems.join(' | '),
      ...r.raw,
    };
  });
  const base = (report.file_name ?? report.entity_type).replace(/\.[^.]+$/, '');
  await downloadCSV(rows, `${base}-problems.csv`);
}

export function formatMoney(n: number | null | undefined): string {
  return n == null ? '—' : formatCurrency(n);
}
