/**
 * Payroll Matrix — facts-backed management matrix
 */

import type { PayrollFact } from '../../facts/PayrollFact';
import { buildPayrollFactPivot } from '../../engine/PivotEngine';
import { DEFAULT_MATRIX_METRICS } from '../../../lib/payrollMatrixEngine';

/** Map legacy matrix metric keys onto payroll item registry codes where aligned. */
const METRIC_TO_ITEM: Record<string, string> = {
  basic_salary: 'basic_salary',
  overtime: 'overtime',
  bonus: 'bonus',
  paye: 'paye',
  uif_employee: 'uif_employee',
  uif_employer: 'uif_employer',
  sdl: 'sdl',
  pension: 'retirement',
  medical_aid: 'medical_aid',
  net_pay: 'net_pay',
  cost_to_company: 'cost_to_company',
};

export function buildPayrollMatrixFromFacts(
  facts: PayrollFact[],
  options?: { taxYearStartYear?: number; itemCodes?: string[] }
) {
  const itemCodes =
    options?.itemCodes ??
    DEFAULT_MATRIX_METRICS.map((m) => METRIC_TO_ITEM[m]).filter(Boolean);

  return buildPayrollFactPivot(facts, {
    rowDimension: 'payroll_item',
    columnDimension: 'month',
    itemCodes,
    taxYearStartYear: options?.taxYearStartYear,
    includeTotalColumn: true,
  });
}
