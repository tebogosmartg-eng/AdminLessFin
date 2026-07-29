/**
 * Dimension Engine — resolve reporting dimensions from Payroll Facts
 */

import type { PayrollFact } from '../facts/PayrollFact';
import { monthColumnKey, saFinancialYearMonthColumns, saTaxYearStartYear } from '../../lib/payrollMatrixEngine';

export type ReportDimension =
  | 'month'
  | 'quarter'
  | 'year'
  | 'department'
  | 'cost_centre'
  | 'branch'
  | 'employee_group'
  | 'company'
  | 'employee'
  | 'payroll_item';

export function resolveDimensionValue(fact: PayrollFact, dimension: ReportDimension, itemCode?: string): string {
  switch (dimension) {
    case 'month':
      return monthColumnKey(fact.payDate);
    case 'quarter': {
      const m = new Date(`${fact.payDate}T00:00:00`).getMonth() + 1;
      const q = Math.ceil(m / 3);
      return `Q${q} ${new Date(`${fact.payDate}T00:00:00`).getFullYear()}`;
    }
    case 'year':
      return String(new Date(`${fact.payDate}T00:00:00`).getFullYear());
    case 'department':
      return fact.department || '—';
    case 'cost_centre':
      return fact.costCentre || '—';
    case 'branch':
      return fact.metadata.branch || fact.costCentre || '—';
    case 'employee_group':
      return fact.metadata.employeeGroup || fact.position || '—';
    case 'company':
      return fact.metadata.companyName || fact.companyId || '—';
    case 'employee':
      return fact.employeeNumber || `${fact.employeeName} ${fact.surname}`.trim();
    case 'payroll_item':
      return itemCode || '—';
    default:
      return '—';
  }
}

export function saMonthColumnOrder(taxYearStartYear: number): string[] {
  return saFinancialYearMonthColumns(taxYearStartYear);
}

export function taxYearStartFromFacts(facts: PayrollFact[], fallbackDate?: string): number {
  if (facts[0]) return saTaxYearStartYear(facts[0].payDate);
  return saTaxYearStartYear(fallbackDate ?? new Date().toISOString().slice(0, 10));
}

export { saTaxYearStartYear, monthColumnKey, saFinancialYearMonthColumns };
