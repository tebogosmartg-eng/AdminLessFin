/**
 * Load finalized payroll sources for statutory return generators.
 * V3.6.4: Consumes Payroll Facts only (no direct payslip reporting reads).
 */

import { loadPayrollFacts } from '../../reporting/facts';
import { factsToStatutoryRunSources } from '../../reporting/facts/adapters';
import type { FinalizedPayrollRunSource } from './types';

export async function loadFinalizedPayrollSources(
  companyId: string,
  options?: { startDate?: string; endDate?: string; taxYear?: string }
): Promise<FinalizedPayrollRunSource[]> {
  const { facts } = await loadPayrollFacts({
    companyId,
    startDate: options?.startDate,
    endDate: options?.endDate,
    taxYear: options?.taxYear,
  });
  return factsToStatutoryRunSources(facts);
}
