/**
 * Statutory returns — consume Payroll Facts only (V3.6.4)
 * Locked country generators preserved via factsToStatutoryRunSources adapter.
 */

import type { PayrollFact } from '../facts/PayrollFact';
import { factsToStatutoryRunSources } from '../facts/adapters';
import type { FinalizedPayrollRunSource } from '../../lib/statutoryReturns/types';

export function statutoryRunsFromFacts(facts: PayrollFact[]): FinalizedPayrollRunSource[] {
  return factsToStatutoryRunSources(facts);
}

export { factsToStatutoryRunSources };
