/**
 * VIP sources — load Payroll Facts only (V3.6.4)
 * Payslips are not a reporting source; facts are mapped from finalized snapshots.
 */

import {
  loadPayrollFacts,
  saTaxYearDateRange,
  type PayrollFact,
} from '../reporting/facts';

export { saTaxYearDateRange };

export async function loadVipFinalizedFacts(
  companyId: string,
  options?: { startDate?: string; endDate?: string; taxYearStartYear?: number }
): Promise<{ facts: PayrollFact[]; runCount: number }> {
  const result = await loadPayrollFacts({
    companyId,
    startDate: options?.startDate,
    endDate: options?.endDate,
    taxYearStartYear: options?.taxYearStartYear,
  });
  return { facts: result.facts, runCount: result.runCount };
}

export function asVipFacts(source: unknown): PayrollFact[] {
  if (!source) return [];
  if (Array.isArray(source)) return source as PayrollFact[];
  if (typeof source === 'object' && Array.isArray((source as { facts?: unknown }).facts)) {
    return (source as { facts: PayrollFact[] }).facts;
  }
  return [];
}
