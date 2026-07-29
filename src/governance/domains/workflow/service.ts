// Governance Foundation — Workflow service (Phase G3.1).
//
// Genuinely greenfield: G1's audit confirmed no generic approval-workflow
// engine exists anywhere in the codebase today (no `approval_policies`,
// `approval_rules`, or `approval_thresholds` table; each module hardcodes
// its own `role in (owner, admin)` check). There is nothing to proxy.
//
// Every method below throws a clear "not implemented" error rather than
// fabricating a fake in-memory workflow engine — this file exists so the
// typed interface and permission boundary are in place for a future
// implementation phase to build the real engine behind.

import { assertGovernanceDomainActive } from '@/governance/featureFlags';
import type { GovernanceMutationResult } from '@/governance/types';
import { validateWorkflowInstance, type WorkflowInstanceDomainModel } from './model';

export interface WorkflowReadAPI {
  getPendingApprovals(companyId: string): Promise<WorkflowInstanceDomainModel[]>;
}

export interface WorkflowMutationAPI {
  approveStep(companyId: string, workflowInstanceId: string): Promise<GovernanceMutationResult>;
  rejectStep(companyId: string, workflowInstanceId: string): Promise<GovernanceMutationResult>;
}

const NOT_IMPLEMENTED =
  'Workflow & Approvals has no backing implementation yet (confirmed by the G1 audit — ' +
  'no approval-policy table or generic engine exists in this codebase today). This is ' +
  'scaffolding for a future implementation phase, per Volume II §2.22.';

export class WorkflowService implements WorkflowReadAPI, WorkflowMutationAPI {
  async getPendingApprovals(_companyId: string): Promise<WorkflowInstanceDomainModel[]> {
    assertGovernanceDomainActive('workflow');
    throw new Error(NOT_IMPLEMENTED);
  }

  async approveStep(_companyId: string, workflowInstanceId: string): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('workflow');
    const validation = validateWorkflowInstance({ subjectId: workflowInstanceId, workflowType: 'journal_approval' });
    if (!validation.valid) return { success: false, error: validation.errors.join(' ') };
    throw new Error(NOT_IMPLEMENTED);
  }

  async rejectStep(_companyId: string, _workflowInstanceId: string): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('workflow');
    throw new Error(NOT_IMPLEMENTED);
  }
}

export function createWorkflowService(): WorkflowService {
  return new WorkflowService();
}
