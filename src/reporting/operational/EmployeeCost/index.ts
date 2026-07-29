/**
 * Employee Cost operational report — facts only
 */

import type { PayrollFact } from '../../facts/PayrollFact';

export type EmployeeCostRow = {
  employee: string;
  department: string;
  costToCompany: number;
};

export function buildEmployeeCostFromFacts(facts: PayrollFact[]): EmployeeCostRow[] {
  const map = new Map<string, EmployeeCostRow>();
  for (const f of facts) {
    const key = f.employeeNumber || `${f.employeeName}|${f.surname}`;
    const existing = map.get(key);
    const name = `${f.employeeName} ${f.surname}`.trim();
    if (!existing) {
      map.set(key, { employee: name, department: f.department, costToCompany: f.totals.costToCompany });
    } else {
      existing.costToCompany += f.totals.costToCompany;
    }
  }
  return [...map.values()].sort((a, b) => b.costToCompany - a.costToCompany);
}
