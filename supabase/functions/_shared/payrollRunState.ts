// @ts-nocheck
/**
 * Whether a payroll run's pay stands. Reversing a run (reverse_payroll_run_atomic without
 * reopen) keeps status 'finalized' and records output_metadata.reversed_at; reopening sets it
 * back to draft, and a later finalise merges a newer processed_at. So a run is in effect only
 * when it is finalised or paid, not cancelled, and not reversed since it was last processed.
 */
export const FINALIZED_RUN_STATUSES = ['finalized', 'paid'];

export function isRunReversed(run): boolean {
  const reversedAt = run?.output_metadata?.reversed_at;
  if (!reversedAt) return false;
  const processedAt = run?.output_metadata?.processed_at;
  return !processedAt || Date.parse(processedAt) <= Date.parse(reversedAt);
}

/** Finalised (or paid), not cancelled and not reversed: its payslips were paid. */
export function isRunInEffect(run): boolean {
  return FINALIZED_RUN_STATUSES.includes(run?.status) && run?.output_metadata?.cancelled !== true && !isRunReversed(run);
}
