/**
 * Business Operations Engine — Business Event Registry
 *
 * Every user action is a Business Event. Events declare lifecycle ownership,
 * orchestration metadata, and downstream effects without executing them.
 * Execution remains in edge functions; the registry is the contract layer.
 */

import type { LifecycleId } from '../businessLifecycles';

export type BusinessEventCategory =
  | 'create'
  | 'update'
  | 'approve'
  | 'reject'
  | 'send'
  | 'receive'
  | 'process'
  | 'void'
  | 'close'
  | 'generate';

export type OrchestrationEffect =
  | 'workflow'
  | 'validation'
  | 'approval'
  | 'accounting'
  | 'document'
  | 'notification'
  | 'activity'
  | 'calendar'
  | 'ai_insight'
  | 'reporting'
  | 'dashboard'
  | 'audit';

export type BusinessEventDefinition = {
  id: string;
  label: string;
  category: BusinessEventCategory;
  lifecycleId: LifecycleId;
  stageId: string;
  description: string;
  permissions: string[];
  accountingImpact: boolean;
  documentsProduced: string[];
  orchestrationPipeline: OrchestrationEffect[];
  suggestedNextEvents: string[];
};

export const BUSINESS_EVENTS: Record<string, BusinessEventDefinition> = {
  // ── Revenue ──────────────────────────────────────────────────────────────
  'quote.created': {
    id: 'quote.created',
    label: 'Quote Created',
    category: 'create',
    lifecycleId: 'revenue',
    stageId: 'quote',
    description: 'A sales quote was drafted for a customer.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: false,
    documentsProduced: ['quote'],
    orchestrationPipeline: ['workflow', 'validation', 'document', 'activity', 'dashboard'],
    suggestedNextEvents: ['quote.sent'],
  },
  'quote.sent': {
    id: 'quote.sent',
    label: 'Quote Sent',
    category: 'send',
    lifecycleId: 'revenue',
    stageId: 'approval',
    description: 'Quote emailed to customer awaiting acceptance.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: false,
    documentsProduced: ['quote'],
    orchestrationPipeline: ['workflow', 'notification', 'activity', 'calendar', 'dashboard'],
    suggestedNextEvents: ['quote.approved', 'quote.declined'],
  },
  'quote.approved': {
    id: 'quote.approved',
    label: 'Quote Approved',
    category: 'approve',
    lifecycleId: 'revenue',
    stageId: 'invoice',
    description: 'Customer accepted the quote.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: false,
    documentsProduced: ['quote'],
    orchestrationPipeline: ['workflow', 'approval', 'activity', 'ai_insight', 'dashboard'],
    suggestedNextEvents: ['invoice.created'],
  },
  'invoice.created': {
    id: 'invoice.created',
    label: 'Invoice Created',
    category: 'create',
    lifecycleId: 'revenue',
    stageId: 'invoice',
    description: 'Customer invoice drafted or converted from quote.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: true,
    documentsProduced: ['invoice'],
    orchestrationPipeline: ['workflow', 'validation', 'accounting', 'document', 'activity', 'dashboard', 'audit'],
    suggestedNextEvents: ['invoice.sent'],
  },
  'invoice.sent': {
    id: 'invoice.sent',
    label: 'Invoice Sent',
    category: 'send',
    lifecycleId: 'revenue',
    stageId: 'collections',
    description: 'Invoice delivered to customer.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: false,
    documentsProduced: ['invoice'],
    orchestrationPipeline: ['workflow', 'notification', 'activity', 'calendar', 'dashboard'],
    suggestedNextEvents: ['payment.received'],
  },
  'payment.received': {
    id: 'payment.received',
    label: 'Payment Received',
    category: 'receive',
    lifecycleId: 'revenue',
    stageId: 'payment',
    description: 'Customer payment recorded against invoice.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: true,
    documentsProduced: ['receipt'],
    orchestrationPipeline: ['workflow', 'validation', 'accounting', 'document', 'activity', 'calendar', 'dashboard', 'audit'],
    suggestedNextEvents: ['bank.reconciled'],
  },

  // ── Procurement ──────────────────────────────────────────────────────────
  'purchase_order.created': {
    id: 'purchase_order.created',
    label: 'Purchase Order Created',
    category: 'create',
    lifecycleId: 'procurement',
    stageId: 'purchase_order',
    description: 'Purchase order drafted for vendor.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: false,
    documentsProduced: ['purchase_order'],
    orchestrationPipeline: ['workflow', 'validation', 'document', 'activity', 'dashboard'],
    suggestedNextEvents: ['purchase_order.sent'],
  },
  'purchase_order.sent': {
    id: 'purchase_order.sent',
    label: 'Purchase Order Sent',
    category: 'send',
    lifecycleId: 'procurement',
    stageId: 'approval',
    description: 'PO sent to vendor.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: false,
    documentsProduced: ['purchase_order'],
    orchestrationPipeline: ['workflow', 'notification', 'activity', 'calendar', 'dashboard'],
    suggestedNextEvents: ['bill.created'],
  },
  'bill.created': {
    id: 'bill.created',
    label: 'Bill Recorded',
    category: 'create',
    lifecycleId: 'procurement',
    stageId: 'bill',
    description: 'Supplier bill recorded.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: true,
    documentsProduced: ['bill'],
    orchestrationPipeline: ['workflow', 'validation', 'accounting', 'document', 'activity', 'dashboard', 'audit'],
    suggestedNextEvents: ['bill.payment_made'],
  },
  'bill.payment_made': {
    id: 'bill.payment_made',
    label: 'Bill Payment Made',
    category: 'receive',
    lifecycleId: 'procurement',
    stageId: 'payment',
    description: 'Vendor payment settled.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: true,
    documentsProduced: ['remittance'],
    orchestrationPipeline: ['workflow', 'validation', 'accounting', 'document', 'activity', 'calendar', 'dashboard', 'audit'],
    suggestedNextEvents: ['bank.reconciled'],
  },

  // ── Payroll ──────────────────────────────────────────────────────────────
  'payroll.run_created': {
    id: 'payroll.run_created',
    label: 'Payroll Run Created',
    category: 'create',
    lifecycleId: 'payroll',
    stageId: 'preparation',
    description: 'New payroll run opened.',
    permissions: ['admin', 'owner'],
    accountingImpact: false,
    documentsProduced: [],
    orchestrationPipeline: ['workflow', 'validation', 'activity', 'calendar', 'dashboard'],
    suggestedNextEvents: ['payroll.payslips_generated'],
  },
  'payroll.payslips_generated': {
    id: 'payroll.payslips_generated',
    label: 'Payslips Generated',
    category: 'generate',
    lifecycleId: 'payroll',
    stageId: 'validation',
    description: 'Payslips calculated for all employees.',
    permissions: ['admin', 'owner'],
    accountingImpact: false,
    documentsProduced: ['payslip'],
    orchestrationPipeline: ['workflow', 'validation', 'document', 'activity', 'dashboard'],
    suggestedNextEvents: ['payroll.approved'],
  },
  'payroll.approved': {
    id: 'payroll.approved',
    label: 'Payroll Approved',
    category: 'approve',
    lifecycleId: 'payroll',
    stageId: 'approval',
    description: 'Payroll run approved for processing.',
    permissions: ['admin', 'owner'],
    accountingImpact: false,
    documentsProduced: [],
    orchestrationPipeline: ['workflow', 'approval', 'activity', 'ai_insight', 'dashboard', 'audit'],
    suggestedNextEvents: ['payroll.processed'],
  },
  'payroll.processed': {
    id: 'payroll.processed',
    label: 'Payroll Processed',
    category: 'process',
    lifecycleId: 'payroll',
    stageId: 'processing',
    description: 'Payroll journal posted and run finalised.',
    permissions: ['admin', 'owner'],
    accountingImpact: true,
    documentsProduced: ['payroll_register', 'payroll_summary', 'bank_payment_file'],
    orchestrationPipeline: ['workflow', 'validation', 'accounting', 'document', 'activity', 'calendar', 'dashboard', 'audit'],
    suggestedNextEvents: ['payroll.bank_file_generated'],
  },
  'payroll.bank_file_generated': {
    id: 'payroll.bank_file_generated',
    label: 'Bank Payment File Generated',
    category: 'generate',
    lifecycleId: 'payroll',
    stageId: 'bank_file',
    description: 'Bank payment batch file exported.',
    permissions: ['admin', 'owner'],
    accountingImpact: false,
    documentsProduced: ['bank_payment_file'],
    orchestrationPipeline: ['workflow', 'document', 'activity', 'dashboard'],
    suggestedNextEvents: ['payroll.distributed'],
  },
  'payroll.distributed': {
    id: 'payroll.distributed',
    label: 'Payslips Distributed',
    category: 'send',
    lifecycleId: 'payroll',
    stageId: 'confirmation',
    description: 'Payslips emailed or downloaded to employees.',
    permissions: ['admin', 'owner'],
    accountingImpact: false,
    documentsProduced: ['payslip'],
    orchestrationPipeline: ['workflow', 'notification', 'document', 'activity', 'dashboard', 'audit'],
    suggestedNextEvents: [],
  },

  // ── Accounting ───────────────────────────────────────────────────────────
  'journal.posted': {
    id: 'journal.posted',
    label: 'Journal Posted',
    category: 'process',
    lifecycleId: 'accounting',
    stageId: 'posting',
    description: 'Journal entry posted to general ledger.',
    permissions: ['admin', 'owner'],
    accountingImpact: true,
    documentsProduced: ['journal'],
    orchestrationPipeline: ['workflow', 'validation', 'accounting', 'document', 'activity', 'reporting', 'dashboard', 'audit'],
    suggestedNextEvents: [],
  },
  'asset.depreciated': {
    id: 'asset.depreciated',
    label: 'Asset Depreciated',
    category: 'process',
    lifecycleId: 'fixed_assets',
    stageId: 'depreciate',
    description: 'Depreciation run posted for fixed assets.',
    permissions: ['admin', 'owner'],
    accountingImpact: true,
    documentsProduced: ['depreciation_schedule'],
    orchestrationPipeline: ['workflow', 'accounting', 'document', 'activity', 'reporting', 'dashboard', 'audit'],
    suggestedNextEvents: [],
  },
  'period.closed': {
    id: 'period.closed',
    label: 'Financial Period Closed',
    category: 'close',
    lifecycleId: 'financial_close',
    stageId: 'lock',
    description: 'Accounting period locked.',
    permissions: ['owner'],
    accountingImpact: false,
    documentsProduced: ['financial_statements'],
    orchestrationPipeline: ['workflow', 'approval', 'activity', 'reporting', 'dashboard', 'audit'],
    suggestedNextEvents: [],
  },

  // ── Enterprise Work Management (additive; does not alter payroll/accounting events) ──
  'work.workspace_created': {
    id: 'work.workspace_created',
    label: 'Work Workspace Created',
    category: 'create',
    lifecycleId: 'projects',
    stageId: 'create',
    description: 'EWM workspace created as an operating container.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: false,
    documentsProduced: [],
    orchestrationPipeline: ['workflow', 'activity', 'dashboard', 'audit'],
    suggestedNextEvents: ['work.project_linked'],
  },
  'work.project_linked': {
    id: 'work.project_linked',
    label: 'Work Project Linked',
    category: 'create',
    lifecycleId: 'projects',
    stageId: 'create',
    description: 'EWM project created or linked to legacy engagement project.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: false,
    documentsProduced: [],
    orchestrationPipeline: ['workflow', 'activity', 'dashboard', 'audit'],
    suggestedNextEvents: ['work.task_created'],
  },
  'work.task_created': {
    id: 'work.task_created',
    label: 'Work Task Created',
    category: 'create',
    lifecycleId: 'projects',
    stageId: 'staff',
    description: 'Executable EWM task created under a project.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: false,
    documentsProduced: [],
    orchestrationPipeline: ['workflow', 'activity', 'dashboard'],
    suggestedNextEvents: ['work.time_submitted'],
  },
  'work.time_submitted': {
    id: 'work.time_submitted',
    label: 'Work Time Submitted',
    category: 'process',
    lifecycleId: 'projects',
    stageId: 'time',
    description: 'Contextual time entry submitted for approval.',
    permissions: ['member', 'admin', 'owner'],
    accountingImpact: false,
    documentsProduced: [],
    orchestrationPipeline: ['workflow', 'validation', 'notification', 'activity', 'dashboard'],
    suggestedNextEvents: ['work.time_approved'],
  },
  'work.time_approved': {
    id: 'work.time_approved',
    label: 'Work Time Approved',
    category: 'approve',
    lifecycleId: 'projects',
    stageId: 'time',
    description: 'Supervisor approved operational time fact.',
    permissions: ['admin', 'owner'],
    accountingImpact: false,
    documentsProduced: [],
    orchestrationPipeline: ['workflow', 'approval', 'activity', 'dashboard', 'audit'],
    suggestedNextEvents: ['work.time_locked'],
  },
  'work.time_locked': {
    id: 'work.time_locked',
    label: 'Work Time Locked',
    category: 'close',
    lifecycleId: 'projects',
    stageId: 'time',
    description: 'Time entry locked; operational cost fact emitted; payroll input fact available for adapter.',
    permissions: ['admin', 'owner'],
    accountingImpact: false,
    documentsProduced: [],
    orchestrationPipeline: ['workflow', 'activity', 'reporting', 'dashboard', 'audit'],
    suggestedNextEvents: [],
  },
  'work.allocation_confirmed': {
    id: 'work.allocation_confirmed',
    label: 'Work Allocation Confirmed',
    category: 'approve',
    lifecycleId: 'projects',
    stageId: 'staff',
    description: 'Hard resource allocation confirmed against project/task.',
    permissions: ['admin', 'owner'],
    accountingImpact: false,
    documentsProduced: [],
    orchestrationPipeline: ['workflow', 'approval', 'activity', 'dashboard', 'audit'],
    suggestedNextEvents: [],
  },
  'work.capacity_overload': {
    id: 'work.capacity_overload',
    label: 'Work Capacity Overload',
    category: 'process',
    lifecycleId: 'projects',
    stageId: 'staff',
    description: 'Resource utilisation exceeded available capacity threshold.',
    permissions: ['admin', 'owner'],
    accountingImpact: false,
    documentsProduced: [],
    orchestrationPipeline: ['notification', 'activity', 'dashboard', 'ai_insight'],
    suggestedNextEvents: [],
  },
  'work.budget_at_risk': {
    id: 'work.budget_at_risk',
    label: 'Work Budget At Risk',
    category: 'process',
    lifecycleId: 'projects',
    stageId: 'profitability',
    description: 'Operational forecast cost exceeds budget threshold.',
    permissions: ['admin', 'owner'],
    accountingImpact: false,
    documentsProduced: [],
    orchestrationPipeline: ['notification', 'activity', 'dashboard', 'reporting', 'ai_insight'],
    suggestedNextEvents: [],
  },
  'work.milestone_missed': {
    id: 'work.milestone_missed',
    label: 'Work Milestone Missed',
    category: 'process',
    lifecycleId: 'projects',
    stageId: 'time',
    description: 'Delivery milestone passed without completion.',
    permissions: ['admin', 'owner'],
    accountingImpact: false,
    documentsProduced: [],
    orchestrationPipeline: ['notification', 'activity', 'calendar', 'dashboard'],
    suggestedNextEvents: [],
  },
};

export function getBusinessEvent(eventId: string): BusinessEventDefinition | undefined {
  return BUSINESS_EVENTS[eventId];
}

export function getEventsForLifecycle(lifecycleId: LifecycleId): BusinessEventDefinition[] {
  return Object.values(BUSINESS_EVENTS).filter((e) => e.lifecycleId === lifecycleId);
}

export function inferEventFromJournalDescription(description: string): BusinessEventDefinition | undefined {
  const lower = description.toLowerCase();
  if (lower.includes('invoice')) return BUSINESS_EVENTS['invoice.created'];
  if (lower.includes('bill') || lower.includes('vendor')) return BUSINESS_EVENTS['bill.created'];
  if (lower.includes('payroll') || lower.includes('payslip')) return BUSINESS_EVENTS['payroll.processed'];
  if (lower.includes('payment') && lower.includes('customer')) return BUSINESS_EVENTS['payment.received'];
  if (lower.includes('payment') && lower.includes('vendor')) return BUSINESS_EVENTS['bill.payment_made'];
  if (lower.includes('depreciation')) return BUSINESS_EVENTS['asset.depreciated'];
  return BUSINESS_EVENTS['journal.posted'];
}
