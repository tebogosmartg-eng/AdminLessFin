export type PayrollWorkflowStepId =
  | 'validate'
  | 'review'
  | 'approve'
  | 'process'
  | 'outputs'
  | 'bank_file'
  | 'distribute'
  | 'archive';

export type PayrollWorkflowStep = {
  id: PayrollWorkflowStepId;
  label: string;
  description: string;
};

export const PAYROLL_WORKFLOW_STEPS: PayrollWorkflowStep[] = [
  { id: 'validate', label: 'Validate', description: 'Check employee data and generate payslips' },
  { id: 'review', label: 'Review', description: 'Review payroll totals and individual payslips' },
  { id: 'approve', label: 'Approve', description: 'Approve payroll for processing' },
  { id: 'process', label: 'Process', description: 'Post journal entry and finalize run' },
  { id: 'outputs', label: 'Outputs', description: 'Register, summary and payslips generated' },
  { id: 'bank_file', label: 'Bank File', description: 'Export bank payment batch file' },
  { id: 'distribute', label: 'Distribute', description: 'Email and download payslips' },
  { id: 'archive', label: 'Archive', description: 'Payroll run complete and archived' },
];

export type PayrollRunWorkflowState = {
  id?: string;
  status: string;
  approved_at?: string | null;
  processed_at?: string | null;
  journal_entry_id?: string | null;
  output_metadata?: Record<string, unknown> | null;
};

export function isRunApproved(run: PayrollRunWorkflowState): boolean {
  return !!run.approved_at;
}

/**
 * Canonical payroll_run_status lifecycle: draft → processing → finalized → paid.
 * A run is "complete" (journals posted, outputs available, immutable) once it
 * reaches finalized, and remains so through paid.
 */
export function isRunFinalized(status?: string | null): boolean {
  return status === 'finalized' || status === 'paid';
}

export function resolveCurrentWorkflowStep(
  run: PayrollRunWorkflowState,
  payslipCount: number
): PayrollWorkflowStepId {
  if (isRunFinalized(run.status)) {
    const meta = run.output_metadata ?? {};
    if (meta.distribution_complete) return 'archive';
    if ((meta.emails_sent as number) > 0 || meta.payslips_downloaded) return 'distribute';
    const bankStatus = (meta.bank_batch as { status?: string } | undefined)?.status;
    if (bankStatus === 'paid' || bankStatus === 'submitted') return 'distribute';
    if (meta.bank_file_downloaded || bankStatus === 'downloaded' || bankStatus === 'generated') return 'bank_file';
    if (meta.reports_generated || meta.register_generated) return 'outputs';
    return 'outputs';
  }
  if (!payslipCount) return 'validate';
  if (!isRunApproved(run)) return 'review';
  return 'process';
}

export function workflowStepIndex(stepId: PayrollWorkflowStepId): number {
  return PAYROLL_WORKFLOW_STEPS.findIndex((s) => s.id === stepId);
}

export function workflowProgressPercent(stepId: PayrollWorkflowStepId): number {
  const idx = workflowStepIndex(stepId);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / PAYROLL_WORKFLOW_STEPS.length) * 100);
}

export function isStepComplete(stepId: PayrollWorkflowStepId, currentStepId: PayrollWorkflowStepId): boolean {
  return workflowStepIndex(stepId) < workflowStepIndex(currentStepId);
}

export function isStepCurrent(stepId: PayrollWorkflowStepId, currentStepId: PayrollWorkflowStepId): boolean {
  return stepId === currentStepId;
}
