/**
 * EFCP V6.8.0 presentation layer — accounting language only.
 * Never expose IDs, hashes, or engine terminology.
 */

import type { EfcpCloseItemStatus, EfcpCloseType, EfcpPeriodStatus } from './api';

export function periodStatusLabel(status: EfcpPeriodStatus | string): string {
  const map: Record<string, string> = {
    open: 'Open',
    soft_closed: 'Soft Closed',
    manager_approved: 'Manager Approved',
    partner_approved: 'Partner Approved',
    locked: 'Locked',
  };
  return map[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function closeTypeLabel(closeType: EfcpCloseType | string): string {
  const map: Record<string, string> = {
    month_end: 'Month-End Close',
    quarter_end: 'Quarter-End Close',
    year_end: 'Year-End Close',
  };
  return map[closeType] || closeType;
}

export function itemStatusLabel(status: EfcpCloseItemStatus | string): string {
  const map: Record<string, string> = {
    ready: 'Ready',
    in_progress: 'In Progress',
    outstanding: 'Outstanding',
    overdue: 'Overdue',
    completed: 'Completed',
  };
  return map[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function itemStatusTone(
  status: EfcpCloseItemStatus | string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'overdue') return 'destructive';
  if (status === 'outstanding') return 'destructive';
  if (status === 'in_progress') return 'secondary';
  return 'outline';
}

export const READINESS_COMPONENT_LABELS: Record<string, string> = {
  general_ledger: 'General Ledger',
  reconciliations: 'Reconciliations',
  supporting_evidence: 'Supporting Evidence',
  journal_review: 'Journal Review',
  validation: 'Validation',
  management_approval: 'Management Approval',
};
