/**
 * VIP Working Paper builder — Payroll Facts only (V3.6.6)
 * Never recalculates PAYE / UIF / SDL / Net / CTC.
 */

import type { PayrollFact } from '../../facts/PayrollFact';
import { measureFactItemAmount } from '../../facts/adapters';
import {
  monthColumnKey,
  saFinancialYearMonthColumns,
  saTaxYearStartYear,
} from '../../engine/DimensionEngine';
import {
  VIP_AUDIT_SECTIONS,
  VIP_CLAIMED_DEDUCTION_CODES,
  VIP_CLAIMED_EARNING_CODES,
  VIP_CLAIMED_EMPLOYER_CODES,
  type VipSectionLineDef,
} from './sections';
import {
  VIP_ANNUAL_TOTAL_COLUMN,
  type VipAuditBlock,
  type VipDetailRow,
  type VipEmployeeIdentity,
  type VipEmployeeWorkingPaper,
  type VipLineAmount,
  type VipWorkingPaperReport,
} from './types';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function identityKey(fact: PayrollFact): string {
  return fact.employeeId || fact.employeeNumber || `${fact.employeeName}|${fact.surname}`;
}

function emptyMonths(monthColumns: string[]): Record<string, number> {
  return Object.fromEntries(monthColumns.map((c) => [c, 0]));
}

function isUifEmployerDesc(d: string): boolean {
  return d.includes('uif') && d.includes('employer');
}

function isSdlDesc(d: string): boolean {
  return d.includes('sdl') || d.includes('skills development');
}

function isClaimedEarning(fact: PayrollFact, item: PayrollFact['payrollItems'][number]): boolean {
  if (VIP_CLAIMED_EARNING_CODES.includes(item.code as (typeof VIP_CLAIMED_EARNING_CODES)[number])) {
    return true;
  }
  const d = item.description.toLowerCase();
  if (d.includes('basic salary') || d.includes('basic pay')) return true;
  if (d.includes('overtime')) return true;
  if (d.includes('bonus') || d.includes('incentive') || d.includes('13th')) return true;
  if (d.includes('commission')) return true;
  if (d.includes('allowance')) return true;
  if (d.includes('fringe') || d.includes('taxable benefit') || d.includes('company car')) return true;
  // Also claimed via measureFactItemAmount aggregation for allowances
  void fact;
  return false;
}

function isClaimedDeduction(item: PayrollFact['payrollItems'][number]): boolean {
  if (VIP_CLAIMED_DEDUCTION_CODES.includes(item.code as (typeof VIP_CLAIMED_DEDUCTION_CODES)[number])) {
    return true;
  }
  const d = item.description.toLowerCase();
  if (d.includes('paye') || (d.includes('tax') && !d.includes('medical tax') && !d.includes('tax credit')))
    return true;
  if (d.includes('uif') && !d.includes('employer')) return true;
  if (d.includes('medical')) return true;
  if (d.includes('pension') || d.includes('provident') || d.includes('retirement')) return true;
  return false;
}

function employerKeywordAmount(fact: PayrollFact, keywords: string[]): number {
  return fact.payrollItems
    .filter((i) => {
      if (!i.isEmployerContribution) return false;
      const d = i.description.toLowerCase();
      if (isUifEmployerDesc(d) || isSdlDesc(d)) return false;
      return keywords.some((k) => d.includes(k));
    })
    .reduce((s, i) => s + i.amount, 0);
}

function residualAmount(
  fact: PayrollFact,
  bucket: 'earnings' | 'deductions' | 'employer'
): number {
  if (bucket === 'earnings') {
    return fact.payrollItems
      .filter((i) => i.isEarning && !isClaimedEarning(fact, i))
      .reduce((s, i) => s + i.amount, 0);
  }
  if (bucket === 'deductions') {
    return fact.payrollItems
      .filter((i) => i.isDeduction && !i.isEmployerContribution && !isClaimedDeduction(i))
      .reduce((s, i) => s + i.amount, 0);
  }
  // other employer: employer lines not UIF employer, SDL, pension-like, medical-like
  return fact.payrollItems
    .filter((i) => {
      if (!i.isEmployerContribution) return false;
      const d = i.description.toLowerCase();
      if (isUifEmployerDesc(d) || isSdlDesc(d)) return false;
      if (d.includes('pension') || d.includes('provident') || d.includes('retirement')) return false;
      if (d.includes('medical')) return false;
      if (VIP_CLAIMED_EMPLOYER_CODES.includes(i.code as (typeof VIP_CLAIMED_EMPLOYER_CODES)[number]))
        return false;
      return true;
    })
    .reduce((s, i) => s + i.amount, 0);
}

function measureLineOnFact(fact: PayrollFact, def: VipSectionLineDef): number {
  const m = def.measure;
  if (m.kind === 'registry') return measureFactItemAmount(fact, m.code);
  if (m.kind === 'total') return fact.totals[m.field];
  if (m.kind === 'employer_keyword') return employerKeywordAmount(fact, m.keywords);
  return residualAmount(fact, m.bucket);
}

type Acc = {
  identity: VipEmployeeIdentity;
  months: Record<string, Record<string, number>>; // code → month → amount
};

function buildIdentity(fact: PayrollFact): VipEmployeeIdentity {
  return {
    employeeNumber: fact.employeeNumber || '—',
    employeeName: fact.employeeName || '—',
    employeeSurname: fact.surname || '—',
    department: fact.department || '—',
    position: fact.position || '—',
    costCentre: fact.costCentre || '—',
    employmentStatus: fact.employmentStatus || '—',
    taxNumber: fact.metadata.taxReference?.trim() || '—',
    // Employment / termination dates are not on immutable PayrollFact today — preserve snapshot integrity.
    employmentDate: '—',
    terminationDate: '—',
  };
}

/**
 * Build the Enterprise VIP Payroll Working Paper exclusively from immutable Payroll Facts.
 */
export function buildVipWorkingPaperFromFacts(
  facts: PayrollFact[],
  options?: { taxYearStartYear?: number }
): VipWorkingPaperReport {
  const taxYearStartYear =
    options?.taxYearStartYear ??
    (facts[0]
      ? saTaxYearStartYear(facts[0].payDate)
      : saTaxYearStartYear(new Date().toISOString().slice(0, 10)));

  const monthColumns = saFinancialYearMonthColumns(taxYearStartYear);
  const monthSet = new Set(monthColumns);

  const filtered = facts.filter((f) => {
    if (!f.payDate) return false;
    if (saTaxYearStartYear(f.payDate) !== taxYearStartYear) return false;
    return monthSet.has(monthColumnKey(f.payDate));
  });

  const lineDefs = VIP_AUDIT_SECTIONS.flatMap((s) => s.lines);
  const byEmployee = new Map<string, Acc>();

  for (const fact of filtered) {
    const key = identityKey(fact);
    let acc = byEmployee.get(key);
    if (!acc) {
      acc = {
        identity: buildIdentity(fact),
        months: Object.fromEntries(lineDefs.map((l) => [l.code, emptyMonths(monthColumns)])),
      };
      byEmployee.set(key, acc);
    } else {
      // Prefer non-empty identity fields from later facts
      const id = buildIdentity(fact);
      for (const [k, v] of Object.entries(id) as [keyof VipEmployeeIdentity, string][]) {
        if (acc.identity[k] === '—' && v !== '—') acc.identity[k] = v;
      }
    }

    const col = monthColumnKey(fact.payDate);
    if (!monthSet.has(col)) continue;

    for (const def of lineDefs) {
      acc.months[def.code][col] = round2(
        (acc.months[def.code][col] ?? 0) + measureLineOnFact(fact, def)
      );
    }
  }

  const sorted = [...byEmployee.entries()].sort((a, b) => {
    const an = a[1].identity.employeeNumber;
    const bn = b[1].identity.employeeNumber;
    if (an !== bn) return an.localeCompare(bn);
    return a[1].identity.employeeSurname.localeCompare(b[1].identity.employeeSurname);
  });

  const employees: VipEmployeeWorkingPaper[] = sorted.map(([, acc]) => {
    const blocks: VipAuditBlock[] = VIP_AUDIT_SECTIONS.map((section) => {
      const lines: VipLineAmount[] = section.lines.map((def) => {
        const months = { ...acc.months[def.code] };
        const annualTotal = round2(monthColumns.reduce((s, c) => s + (months[c] ?? 0), 0));
        return {
          code: def.code,
          label: def.label,
          months,
          annualTotal,
          emphasis: def.emphasis,
        };
      });
      return { id: section.id, title: section.title, lines };
    });
    return { identity: acc.identity, blocks };
  });

  const runIds = [...new Set(filtered.map((f) => f.payrollRunId))].sort();
  const checksums = [...new Set(filtered.map((f) => f.snapshotChecksum))];

  return {
    taxYearStartYear,
    taxYearLabel: `FY ${taxYearStartYear}/${String(taxYearStartYear + 1).slice(-2)}`,
    monthColumns,
    employees,
    employeeCount: employees.length,
    factCount: filtered.length,
    sourcePayrollRunIds: runIds,
    snapshotChecksums: checksums,
  };
}

/** Flat detail rows for analysis sheets — not the primary audit layout. */
export function vipWorkingPaperToDetailRows(report: VipWorkingPaperReport): VipDetailRow[] {
  const rows: VipDetailRow[] = [];
  for (const emp of report.employees) {
    for (const block of emp.blocks) {
      for (const line of block.lines) {
        const row: VipDetailRow = {
          'Employee Number': emp.identity.employeeNumber,
          'Employee Name': emp.identity.employeeName,
          'Employee Surname': emp.identity.employeeSurname,
          Department: emp.identity.department,
          Position: emp.identity.position,
          'Cost Centre': emp.identity.costCentre,
          'Employment Status': emp.identity.employmentStatus,
          'Tax Number': emp.identity.taxNumber,
          Section: block.title,
          'Payroll Item': line.label,
        };
        for (const c of report.monthColumns) row[c] = line.months[c] ?? 0;
        row[VIP_ANNUAL_TOTAL_COLUMN] = line.annualTotal;
        rows.push(row);
      }
    }
  }
  return rows;
}

/** @deprecated Alias — prefer buildVipWorkingPaperFromFacts */
export function buildVipReportFromFacts(
  facts: PayrollFact[],
  options?: { taxYearStartYear?: number; itemCodes?: readonly string[] }
): VipWorkingPaperReport & {
  sections: Array<VipEmployeeIdentity & { items: VipDetailRow[] }>;
  detailRows: VipDetailRow[];
  itemColumns: string[];
  columns: string[];
} {
  void options?.itemCodes;
  const report = buildVipWorkingPaperFromFacts(facts, options);
  const detailRows = vipWorkingPaperToDetailRows(report);
  const itemColumns = ['Payroll Item', ...report.monthColumns, VIP_ANNUAL_TOTAL_COLUMN];
  const sections = report.employees.map((emp) => {
    const items: VipDetailRow[] = [];
    for (const block of emp.blocks) {
      for (const line of block.lines) {
        const row: VipDetailRow = { 'Payroll Item': line.label };
        for (const c of report.monthColumns) row[c] = line.months[c] ?? 0;
        row[VIP_ANNUAL_TOTAL_COLUMN] = line.annualTotal;
        items.push(row);
      }
    }
    return { ...emp.identity, items };
  });
  return {
    ...report,
    sections,
    detailRows,
    itemColumns,
    columns: [
      'Employee Number',
      'Employee Name',
      'Employee Surname',
      'Department',
      'Position',
      'Cost Centre',
      'Employment Status',
      'Payroll Item',
      ...report.monthColumns,
      VIP_ANNUAL_TOTAL_COLUMN,
    ],
  };
}

export function vipReportSections(
  report: ReturnType<typeof buildVipReportFromFacts>
): ReturnType<typeof buildVipReportFromFacts>['sections'] {
  return report.sections;
}

export function vipReportToDetailRows(
  report: ReturnType<typeof buildVipReportFromFacts> | VipWorkingPaperReport
): VipDetailRow[] {
  if ('detailRows' in report && Array.isArray(report.detailRows)) return report.detailRows;
  return vipWorkingPaperToDetailRows(report);
}

export function vipReportToRows(
  report: ReturnType<typeof buildVipReportFromFacts> | VipWorkingPaperReport
): VipDetailRow[] {
  return vipReportToDetailRows(report);
}
