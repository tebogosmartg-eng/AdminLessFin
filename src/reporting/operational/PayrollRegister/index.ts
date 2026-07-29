/**
 * Operational reports — consume Payroll Facts only (V3.6.4)
 * Locked buildPeriodReports semantics preserved via fact adapters.
 */

import { buildPeriodReports, type PayrollPeriodReports } from '../../../lib/payrollReports';
import type { PayrollFact } from '../../facts/PayrollFact';
import { factsToRegisterPayslips } from '../../facts/adapters';

export function buildOperationalReportsFromFacts(
  facts: PayrollFact[],
  period: { start: string; end: string }
): PayrollPeriodReports {
  return buildPeriodReports(factsToRegisterPayslips(facts), period);
}

export { buildPeriodReports };
