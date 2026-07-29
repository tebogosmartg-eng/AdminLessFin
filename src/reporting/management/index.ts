/**
 * Management reports — consume Payroll Facts only (V3.6.4)
 * Locked buildManagementReports semantics preserved via adapters.
 */

import {
  buildManagementReports,
  type ManagementReportsBundle,
} from '../../lib/payrollManagementReports';
import type { PayrollFact } from '../facts/PayrollFact';
import { factsToManagementPayslips } from '../facts/adapters';

export function buildManagementReportsFromFacts(
  facts: PayrollFact[],
  options?: { companyName?: string; taxYearStartYear?: number }
): ManagementReportsBundle {
  return buildManagementReports(factsToManagementPayslips(facts, options?.companyName), {
    companyName: options?.companyName,
    taxYearStartYear: options?.taxYearStartYear,
  });
}

export { buildPayrollMatrixFromFacts } from './PayrollMatrix';
