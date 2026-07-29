/**
 * Business Operations Engine — Route ↔ Lifecycle Mapping
 *
 * Every screen identifies its lifecycle and stage. Used by context badges
 * and navigation metadata.
 */

import type { LifecycleId } from '../businessLifecycles';

export type RouteLifecycleBinding = {
  lifecycleId: LifecycleId;
  stageId: string;
  label: string;
};

type RoutePattern = {
  pattern: RegExp;
  binding: RouteLifecycleBinding | ((pathname: string) => RouteLifecycleBinding);
};

const ROUTE_BINDINGS: RoutePattern[] = [
  { pattern: /^\/sales$/, binding: { lifecycleId: 'revenue', stageId: 'analytics', label: 'Revenue Workspace' } },
  { pattern: /^\/quotes\/[^/]+$/, binding: { lifecycleId: 'revenue', stageId: 'quote', label: 'Quote Detail' } },
  { pattern: /^\/quotes$/, binding: { lifecycleId: 'revenue', stageId: 'quote', label: 'Quotes' } },
  { pattern: /^\/invoices\/[^/]+$/, binding: { lifecycleId: 'revenue', stageId: 'invoice', label: 'Invoice Detail' } },
  { pattern: /^\/invoices$/, binding: { lifecycleId: 'revenue', stageId: 'invoice', label: 'Invoices' } },
  { pattern: /^\/receive-payments$/, binding: { lifecycleId: 'revenue', stageId: 'payment', label: 'Receive Payments' } },
  { pattern: /^\/customers/, binding: { lifecycleId: 'revenue', stageId: 'customer', label: 'Customers' } },
  { pattern: /^\/credit-notes$/, binding: { lifecycleId: 'revenue', stageId: 'collections', label: 'Credit Notes' } },

  { pattern: /^\/purchases$/, binding: { lifecycleId: 'procurement', stageId: 'analytics', label: 'Spend Workspace' } },
  { pattern: /^\/purchase-orders\/[^/]+$/, binding: { lifecycleId: 'procurement', stageId: 'purchase_order', label: 'PO Detail' } },
  { pattern: /^\/purchase-orders$/, binding: { lifecycleId: 'procurement', stageId: 'purchase_order', label: 'Purchase Orders' } },
  { pattern: /^\/bills$/, binding: { lifecycleId: 'procurement', stageId: 'bill', label: 'Bills' } },
  { pattern: /^\/pay-bills$/, binding: { lifecycleId: 'procurement', stageId: 'payment', label: 'Pay Bills' } },
  { pattern: /^\/vendors/, binding: { lifecycleId: 'procurement', stageId: 'vendor', label: 'Vendors' } },

  { pattern: /^\/payroll$/, binding: { lifecycleId: 'payroll', stageId: 'preparation', label: 'Payroll Command Centre' } },
  { pattern: /^\/payroll-runs\/[^/]+$/, binding: { lifecycleId: 'payroll', stageId: 'processing', label: 'Payroll Run' } },
  { pattern: /^\/payroll-runs$/, binding: { lifecycleId: 'payroll', stageId: 'preparation', label: 'Payroll Runs' } },
  { pattern: /^\/employees$/, binding: { lifecycleId: 'payroll', stageId: 'employee', label: 'Employees' } },
  { pattern: /^\/expense-claims$/, binding: { lifecycleId: 'projects', stageId: 'expenses', label: 'Expense Claims' } },

  { pattern: /^\/journal-entries$/, binding: { lifecycleId: 'accounting', stageId: 'journal', label: 'Journal Entries' } },
  { pattern: /^\/general-ledger$/, binding: { lifecycleId: 'accounting', stageId: 'gl', label: 'General Ledger' } },
  { pattern: /^\/reconciliation$/, binding: { lifecycleId: 'financial_close', stageId: 'reconciliations', label: 'Reconciliation' } },
  { pattern: /^\/reports\/live-financial-statements$/, binding: { lifecycleId: 'accounting', stageId: 'statements', label: 'Live Financial Statements' } },
  { pattern: /^\/financial-statements-workspace(\/.*)?$/, binding: { lifecycleId: 'financial_close', stageId: 'statements', label: 'Annual Financial Statements' } },
  { pattern: /^\/financial-statements$/, binding: { lifecycleId: 'accounting', stageId: 'statements', label: 'Live Financial Statements' } },

  { pattern: /^\/fixed-assets/, binding: { lifecycleId: 'fixed_assets', stageId: 'capitalise', label: 'Fixed Assets' } },
  { pattern: /^\/loans/, binding: { lifecycleId: 'loans', stageId: 'payments', label: 'Loans' } },
  { pattern: /^\/projects/, binding: { lifecycleId: 'projects', stageId: 'create', label: 'Engagements' } },
  { pattern: /^\/time-tracking$/, binding: { lifecycleId: 'projects', stageId: 'time', label: 'Time' } },
  { pattern: /^\/work$/, binding: { lifecycleId: 'projects', stageId: 'create', label: 'Work Management' } },
  { pattern: /^\/work\/projects/, binding: { lifecycleId: 'projects', stageId: 'create', label: 'Work Projects' } },
  { pattern: /^\/work\/time/, binding: { lifecycleId: 'projects', stageId: 'time', label: 'Time' } },
  { pattern: /^\/work\/clocking/, binding: { lifecycleId: 'projects', stageId: 'time', label: 'Clocking' } },
  { pattern: /^\/work\/resources/, binding: { lifecycleId: 'projects', stageId: 'staff', label: 'Resources' } },
  { pattern: /^\/tax-report$/, binding: { lifecycleId: 'tax', stageId: 'returns', label: 'Tax Report' } },
  { pattern: /^\/calendar$/, binding: { lifecycleId: 'financial_close', stageId: 'complete', label: 'Operations Calendar' } },
  { pattern: /^\/$/, binding: { lifecycleId: 'accounting', stageId: 'event', label: 'Operations Command Centre' } },
];

export function resolveRouteLifecycle(pathname: string): RouteLifecycleBinding | null {
  for (const { pattern, binding } of ROUTE_BINDINGS) {
    if (pattern.test(pathname)) {
      return typeof binding === 'function' ? binding(pathname) : binding;
    }
  }
  return null;
}
