/**
 * Payroll Fact Repository — sole reporting entry point for payroll facts
 */

import type { PayrollFact, PayrollFactQuery } from './PayrollFact';
import { mapRawPayslipToPayrollFact } from './PayrollFactMapper';
import { loadFinalizedPayrollFactSource, saTaxYearDateRange } from './PayrollFactSource';
import { validatePayrollFacts } from './PayrollFactValidator';

export type PayrollFactRepositoryResult = {
  facts: PayrollFact[];
  runCount: number;
  runIds: string[];
  validationOk: boolean;
};

/**
 * Load immutable Payroll Facts for reporting consumers.
 * Downstream reports must call this (or adapters built on it) — never payslips.
 */
export async function loadPayrollFacts(
  query: PayrollFactQuery
): Promise<PayrollFactRepositoryResult> {
  const source = await loadFinalizedPayrollFactSource(query);
  const facts = source.payloads.map(mapRawPayslipToPayrollFact);
  const validation = validatePayrollFacts(facts);
  const accepted = validation.ok
    ? facts
    : facts.filter((f) => validatePayrollFacts([f]).ok);

  return {
    facts: accepted,
    runCount: source.runCount,
    runIds: source.runIds,
    validationOk: validation.ok,
  };
}

export { saTaxYearDateRange };
