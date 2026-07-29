/**
 * AdminLess Fin V2 — Business Lifecycle Registry
 *
 * Permanent architectural standard: every feature belongs to an end-to-end
 * business process. This module defines lifecycle stages without changing
 * accounting logic or database schema.
 */

export type LifecycleId =
  | 'revenue'
  | 'procurement'
  | 'payroll'
  | 'accounting'
  | 'fixed_assets'
  | 'loans'
  | 'projects'
  | 'tax'
  | 'financial_close';

export type LifecycleStage = {
  id: string;
  label: string;
  description: string;
  route?: string;
  futureReady?: boolean;
};

export type BusinessLifecycle = {
  id: LifecycleId;
  label: string;
  workspaceRoute?: string;
  stages: LifecycleStage[];
};

export const BUSINESS_LIFECYCLES: Record<LifecycleId, BusinessLifecycle> = {
  revenue: {
    id: 'revenue',
    label: 'Revenue Lifecycle',
    workspaceRoute: '/sales',
    stages: [
      { id: 'customer', label: 'Customer', description: 'Manage customer relationships', route: '/customers' },
      { id: 'opportunity', label: 'Opportunity', description: 'Track sales pipeline', futureReady: true },
      { id: 'quote', label: 'Quote', description: 'Create and send proposals', route: '/quotes' },
      { id: 'approval', label: 'Approval', description: 'Customer accepts the quote' },
      { id: 'invoice', label: 'Invoice', description: 'Bill the customer', route: '/invoices' },
      { id: 'collections', label: 'Collections', description: 'Monitor outstanding receivables' },
      { id: 'payment', label: 'Payment', description: 'Record customer payment', route: '/receive-payments' },
      { id: 'receipt', label: 'Receipt', description: 'Issue payment confirmation' },
      { id: 'reconciliation', label: 'Bank Reconciliation', description: 'Match bank deposits', route: '/reconciliation' },
      { id: 'statement', label: 'Customer Statement', description: 'Period statement and history' },
      { id: 'analytics', label: 'Revenue Analytics', description: 'Analyse revenue performance', route: '/sales' },
      { id: 'history', label: 'Customer History', description: 'Full customer transaction history' },
    ],
  },
  procurement: {
    id: 'procurement',
    label: 'Procurement Lifecycle',
    workspaceRoute: '/purchases',
    stages: [
      { id: 'vendor', label: 'Vendor', description: 'Manage supplier relationships', route: '/vendors' },
      { id: 'purchase_request', label: 'Purchase Request', description: 'Internal spend request', futureReady: true },
      { id: 'purchase_order', label: 'Purchase Order', description: 'Commit spend before billing', route: '/purchase-orders' },
      { id: 'approval', label: 'Approval', description: 'Authorise the purchase order' },
      { id: 'received', label: 'Goods / Services Received', description: 'Confirm delivery or completion' },
      { id: 'bill', label: 'Bill', description: 'Record supplier invoice', route: '/bills' },
      { id: 'payment_approval', label: 'Payment Approval', description: 'Authorise outgoing payment' },
      { id: 'payment', label: 'Payment', description: 'Settle accounts payable', route: '/pay-bills' },
      { id: 'statement', label: 'Vendor Statement', description: 'Period statement and history' },
      { id: 'analytics', label: 'Spend Analytics', description: 'Analyse spend patterns', route: '/purchases' },
      { id: 'history', label: 'Vendor History', description: 'Full vendor transaction history' },
    ],
  },
  payroll: {
    id: 'payroll',
    label: 'Payroll Lifecycle',
    workspaceRoute: '/payroll',
    stages: [
      { id: 'employee', label: 'Employee', description: 'Maintain employee records', route: '/employees' },
      { id: 'preparation', label: 'Preparation', description: 'Prepare payroll run', route: '/payroll-runs' },
      { id: 'validation', label: 'Validation', description: 'Validate employee data and payslips' },
      { id: 'approval', label: 'Approval', description: 'Approve payroll for processing' },
      { id: 'processing', label: 'Processing', description: 'Post journal and finalise run' },
      { id: 'payslips', label: 'Payslips', description: 'Generate employee payslips' },
      { id: 'register', label: 'Payroll Register', description: 'Download payroll register' },
      { id: 'journal', label: 'Payroll Journal', description: 'View GL journal entry' },
      { id: 'bank_file', label: 'Bank Payment File', description: 'Export bank payment batch' },
      { id: 'confirmation', label: 'Payment Confirmation', description: 'Confirm bank payments sent' },
      { id: 'history', label: 'Payroll History', description: 'Historical payroll runs', route: '/payroll-runs' },
      { id: 'employee_history', label: 'Employee History', description: 'Per-employee payroll history', route: '/employees' },
    ],
  },
  accounting: {
    id: 'accounting',
    label: 'General Accounting',
    stages: [
      { id: 'event', label: 'Business Event', description: 'Source transaction or adjustment' },
      { id: 'validation', label: 'Validation', description: 'Validate amounts and accounts' },
      { id: 'journal', label: 'Journal', description: 'Create journal entry', route: '/journal-entries' },
      { id: 'posting', label: 'Posting', description: 'Post to the general ledger' },
      { id: 'gl', label: 'General Ledger', description: 'View account activity', route: '/general-ledger' },
      { id: 'trial_balance', label: 'Trial Balance', description: 'Verify debits equal credits', route: '/reports' },
      { id: 'statements', label: 'Financial Statements', description: 'P&L and balance sheet', route: '/reports/live-financial-statements' },
      { id: 'management', label: 'Management Reports', description: 'Operational reporting', route: '/reports' },
      { id: 'audit', label: 'Audit Trail', description: 'Immutable transaction history' },
      { id: 'close', label: 'Financial Close', description: 'Period-end close process' },
    ],
  },
  fixed_assets: {
    id: 'fixed_assets',
    label: 'Fixed Assets Lifecycle',
    stages: [
      { id: 'acquire', label: 'Acquire', description: 'Record asset acquisition' },
      { id: 'capitalise', label: 'Capitalise', description: 'Capitalise to fixed asset', route: '/fixed-assets' },
      { id: 'assign', label: 'Assign', description: 'Assign asset to location or user' },
      { id: 'depreciate', label: 'Depreciate', description: 'Run depreciation schedule' },
      { id: 'transfer', label: 'Transfer', description: 'Transfer between categories' },
      { id: 'impair', label: 'Impair', description: 'Record impairment adjustment' },
      { id: 'dispose', label: 'Dispose', description: 'Dispose or sell asset' },
      { id: 'archive', label: 'Archive', description: 'Archive disposed assets' },
      { id: 'audit', label: 'Audit History', description: 'Asset change history' },
    ],
  },
  loans: {
    id: 'loans',
    label: 'Loans Lifecycle',
    stages: [
      { id: 'create', label: 'Create', description: 'Create loan facility', route: '/loans' },
      { id: 'approval', label: 'Approval', description: 'Approve loan terms' },
      { id: 'disbursement', label: 'Disbursement', description: 'Record loan disbursement' },
      { id: 'schedule', label: 'Repayment Schedule', description: 'Amortisation schedule' },
      { id: 'payments', label: 'Payments', description: 'Record loan repayments' },
      { id: 'interest', label: 'Interest', description: 'Accrue interest charges' },
      { id: 'settlement', label: 'Settlement', description: 'Close loan on full repayment' },
      { id: 'history', label: 'History', description: 'Loan transaction history' },
    ],
  },
  projects: {
    id: 'projects',
    label: 'Projects Lifecycle',
    stages: [
      { id: 'create', label: 'Create', description: 'Create project', route: '/projects' },
      { id: 'budget', label: 'Budget', description: 'Set project budget', route: '/budgets' },
      { id: 'staff', label: 'Assign Staff', description: 'Assign team members', route: '/work/resources' },
      { id: 'time', label: 'Time Tracking', description: 'Log billable hours', route: '/work/time' },
      { id: 'expenses', label: 'Expenses', description: 'Capture project expenses', route: '/expense-claims' },
      { id: 'billing', label: 'Billing', description: 'Invoice project work', route: '/invoices' },
      { id: 'recognition', label: 'Revenue Recognition', description: 'Recognise earned revenue' },
      { id: 'profitability', label: 'Profitability', description: 'Analyse project margins', route: '/project-profitability' },
      { id: 'archive', label: 'Archive', description: 'Close completed projects' },
    ],
  },
  tax: {
    id: 'tax',
    label: 'Tax Lifecycle',
    stages: [
      { id: 'transactions', label: 'Transactions', description: 'Source taxable transactions' },
      { id: 'calculation', label: 'Tax Calculation', description: 'Calculate tax amounts', route: '/tax-rates' },
      { id: 'validation', label: 'Validation', description: 'Validate tax treatment' },
      { id: 'returns', label: 'Returns', description: 'Prepare tax returns', route: '/tax-report' },
      { id: 'submission', label: 'Submission', description: 'Submit to revenue authority', futureReady: true },
      { id: 'payment', label: 'Payment', description: 'Pay tax liability' },
      { id: 'compliance', label: 'Compliance History', description: 'Historical tax compliance' },
    ],
  },
  financial_close: {
    id: 'financial_close',
    label: 'Financial Close',
    stages: [
      { id: 'complete', label: 'Transactions Complete', description: 'All period transactions posted' },
      { id: 'reconciliations', label: 'Reconciliations', description: 'Bank and account reconciliations', route: '/reconciliation' },
      { id: 'adjustments', label: 'Adjustments', description: 'Period-end adjusting entries', route: '/journal-entries' },
      { id: 'review', label: 'Review', description: 'Management review of accounts' },
      { id: 'approval', label: 'Approval', description: 'Approve period close' },
      { id: 'lock', label: 'Period Lock', description: 'Lock the accounting period' },
      { id: 'statements', label: 'Financial Statements', description: 'Generate final statements', route: '/financial-statements-workspace' },
      { id: 'audit', label: 'Audit', description: 'Audit trail verification' },
      { id: 'year_close', label: 'Year Close', description: 'Close financial year' },
    ],
  },
};

export const CROSS_CUTTING_CAPABILITIES = [
  { id: 'dashboard', label: 'Dashboard', route: '/' },
  { id: 'calendar', label: 'Operations Calendar', route: '/calendar' },
  { id: 'chat', label: 'Collaboration', route: '/chat' },
  { id: 'search', label: 'Global Search', shortcut: 'Ctrl+K' },
  { id: 'documents', label: 'Document Generation', description: 'Quotes, invoices, payslips, registers' },
  { id: 'reports', label: 'Reports', route: '/reports' },
  { id: 'audit', label: 'Audit Logs', route: '/settings' },
  { id: 'ai', label: 'AI Copilot', route: '/chat' },
  { id: 'approvals', label: 'Approvals', description: 'Quote, payroll, expense claim approvals' },
] as const;

export function getLifecycle(id: LifecycleId): BusinessLifecycle {
  return BUSINESS_LIFECYCLES[id];
}

export function lifecycleStageIndex(lifecycleId: LifecycleId, stageId: string): number {
  return BUSINESS_LIFECYCLES[lifecycleId].stages.findIndex((s) => s.id === stageId);
}

export function lifecycleProgressPercent(lifecycleId: LifecycleId, stageId: string): number {
  const idx = lifecycleStageIndex(lifecycleId, stageId);
  const total = BUSINESS_LIFECYCLES[lifecycleId].stages.length;
  if (idx < 0 || total === 0) return 0;
  return Math.round(((idx + 1) / total) * 100);
}
