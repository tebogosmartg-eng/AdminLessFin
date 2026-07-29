// Governance Foundation — Workflow domain model (Phase G3.1).
//
// Per Enterprise Constitution Volume II §2.22, this is the one generic
// approval-workflow engine every domain-specific approval (journal, PO,
// payroll, financial close sign-off) should eventually instantiate. G1's
// audit confirmed ZERO configurable approval-policy infrastructure exists
// today — approval is currently a hardcoded `role in (owner, admin)` check
// duplicated per module (e.g. supabase/functions/expense-claims/index.ts).
//
// This domain is therefore genuinely greenfield: the model below is the
// Volume II target shape, not a reflection of anything already built.

import type { GovernancePermissionBoundary, ValidationResult } from '../../types';

export type WorkflowInstanceStatus = 'initiated' | 'pending_step' | 'escalated' | 'approved' | 'rejected' | 'completed';

export interface WorkflowInstanceDomainModel {
  id: string;
  companyId: string;
  workflowType: 'journal_approval' | 'purchase_order_approval' | 'payroll_approval' | 'financial_close_signoff';
  status: WorkflowInstanceStatus;
  subjectId: string;
  requestedApproverRole: 'admin' | 'owner';
}

// Validation model
export function validateWorkflowInstance(instance: Partial<WorkflowInstanceDomainModel>): ValidationResult {
  const errors: string[] = [];
  if (!instance.workflowType) errors.push('workflowType is required.');
  if (!instance.subjectId) errors.push('subjectId is required.');
  return { valid: errors.length === 0, errors };
}

// Permission boundary
export const WORKFLOW_PERMISSIONS: Record<string, GovernancePermissionBoundary> = {
  view: {
    action: 'workflow.view',
    requiredRole: 'member',
    description: 'View pending approvals.',
  },
  approve: {
    action: 'workflow.approve',
    requiredRole: 'admin',
    description: 'Approve or reject a pending workflow step.',
  },
  configure: {
    action: 'workflow.configure',
    requiredRole: 'owner',
    description: 'Configure approval thresholds and approver assignments.',
  },
};
