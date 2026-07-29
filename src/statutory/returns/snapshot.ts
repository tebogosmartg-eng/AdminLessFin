/**
 * Shared snapshot extraction for country return plugins (V3.6.1).
 * Re-exports the locked V3.6 source helpers — no payroll recalculation.
 */

export {
  assertFinalizedRuns,
  engineResultsFromSnapshot,
  sumEngineAmount,
  sumItemKeywords,
  resolvePaye,
  resolveUifEmployee,
  resolveUifEmployer,
  resolveSdl,
  resolveGross,
  taxYearFromRuns,
  allPayslips,
  filterRunsByPeriod,
  roundMoney,
  newReturnId,
} from '../../lib/statutoryReturns/source';

export {
  buildValidationResult,
  validateGenerateInput,
  validateSourcePayrollIntegrity,
  mergeIssues,
} from '../../lib/statutoryReturns/validate';
