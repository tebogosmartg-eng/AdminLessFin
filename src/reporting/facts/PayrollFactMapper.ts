/**
 * Payroll Fact Mapper — maps finalized snapshot payloads → immutable PayrollFact
 */

import type {
  PayrollFact,
  PayrollFactEngineResult,
  PayrollFactItemLine,
  PayrollFactMetadata,
  PayrollFactTotals,
} from './PayrollFact';
import { classifyPayrollItemDescription } from './PayrollItemRegistry';
import { saTaxYearStartYear } from '../../lib/payrollMatrixEngine';

export type RawFinalizedPayslipPayload = {
  companyId: string;
  payrollRunId: string;
  payDate: string;
  runStatus: string;
  payPeriodStart?: string;
  payPeriodEnd?: string;
  companyName?: string;
  payslipId?: string;
  paymentStatus?: string;
  employeeId?: string;
  employees?: {
    id?: string;
    employee_number?: string;
    first_name?: string;
    last_name?: string;
    department?: string;
    branch?: string;
    position?: string;
    employment_status?: string;
    tax_number?: string;
    id_number?: string;
  };
  total_earnings?: number;
  total_deductions?: number;
  net_pay?: number;
  calculation_snapshot?: Record<string, unknown> | null;
  payslip_items?: Array<{
    description: string;
    type: string;
    amount: number;
  }>;
};

function checksum(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a_${(h >>> 0).toString(16)}`;
}

function engineResultsFromSnapshot(snapshot: Record<string, unknown> | null | undefined): PayrollFactEngineResult[] {
  if (!snapshot) return [];
  const raw = snapshot.engine_results;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      engineId: String(r.engine_id ?? ''),
      employeeAmount: Number(r.employee_amount ?? 0) || 0,
      employerAmount: Number(r.employer_amount ?? 0) || 0,
      skipped: Boolean(r.skipped),
    }));
}

function freezeFact(fact: PayrollFact): PayrollFact {
  Object.freeze(fact.payrollItems);
  Object.freeze(fact.totals);
  Object.freeze(fact.metadata);
  Object.freeze(fact.engineResults);
  return Object.freeze(fact);
}

export function mapRawPayslipToPayrollFact(raw: RawFinalizedPayslipPayload): PayrollFact {
  const emp = raw.employees ?? {};
  const snapshot = raw.calculation_snapshot ?? null;
  const items = raw.payslip_items ?? [];

  const payrollItems: PayrollFactItemLine[] = items.map((item) => {
    const classified = classifyPayrollItemDescription(item.description, item.type);
    const isEmployer =
      item.type === 'employer_contribution' ||
      classified?.isEmployerContribution === true;
    return {
      code: classified?.code ?? `raw:${item.description.trim().toLowerCase()}`,
      description: item.description,
      category: classified?.category ?? item.type,
      amount: Number(item.amount) || 0,
      isEarning: item.type === 'earning' || classified?.isEarning === true,
      isDeduction: item.type === 'deduction' || classified?.isDeduction === true,
      isEmployerContribution: isEmployer,
    };
  });

  const employerFromSnapshot = Number(snapshot?.total_employer_contributions ?? NaN);
  const employerFromItems = payrollItems
    .filter((i) => i.isEmployerContribution)
    .reduce((s, i) => s + i.amount, 0);
  const employerContributions =
    Number.isFinite(employerFromSnapshot) && employerFromSnapshot > 0
      ? employerFromSnapshot
      : employerFromItems;

  const grossPay = Number(raw.total_earnings ?? 0) || 0;
  const totalDeductions = Number(raw.total_deductions ?? 0) || 0;
  const netPay = Number(raw.net_pay ?? 0) || 0;
  const ctcFromSnapshot = Number(snapshot?.cost_to_company ?? NaN);
  const costToCompany =
    Number.isFinite(ctcFromSnapshot) && ctcFromSnapshot > 0
      ? ctcFromSnapshot
      : grossPay + employerContributions;

  const totals: PayrollFactTotals = {
    grossPay,
    totalDeductions,
    netPay,
    employerContributions,
    costToCompany,
  };

  const taxYearFromSnapshot =
    typeof snapshot?.tax_year === 'string' ? snapshot.tax_year : '';
  const fyStart = saTaxYearStartYear(raw.payDate);
  const taxYear = taxYearFromSnapshot || `${fyStart}/${fyStart + 1}`;

  const metadata: PayrollFactMetadata = {
    runStatus: raw.runStatus,
    paymentStatus: raw.paymentStatus,
    payslipId: raw.payslipId,
    ruleVersion: typeof snapshot?.rule_version === 'string' ? snapshot.rule_version : undefined,
    calculationVersion:
      typeof snapshot?.calculation_version === 'string' ? snapshot.calculation_version : undefined,
    taxReference: emp.tax_number ?? null,
    idNumber: emp.id_number ?? null,
    companyName: raw.companyName,
    payPeriodStart: raw.payPeriodStart,
    payPeriodEnd: raw.payPeriodEnd,
    branch: emp.branch,
    employeeGroup: emp.position ?? 'Ungrouped',
  };

  const snapshotChecksum = checksum(
    JSON.stringify({
      run: raw.payrollRunId,
      payslip: raw.payslipId,
      snap: snapshot,
      items,
      totals,
    })
  );

  const firstName = emp.first_name ?? '';
  const surname = emp.last_name ?? '';
  const snapshotEmpNumber =
    typeof snapshot?.employee_number === 'string' ? snapshot.employee_number : undefined;

  const fact: PayrollFact = {
    companyId: raw.companyId,
    payrollRunId: raw.payrollRunId,
    employeeId: raw.employeeId ?? emp.id ?? 'unknown',
    employeeNumber: emp.employee_number ?? snapshotEmpNumber ?? '—',
    employeeName: firstName || '—',
    surname: surname || '—',
    department: emp.department ?? '—',
    position: emp.position ?? '—',
    costCentre: emp.branch ?? emp.department ?? '—',
    employmentStatus: emp.employment_status ?? '—',
    payDate: raw.payDate,
    financialYear: String(fyStart),
    taxYear,
    payrollItems,
    totals,
    metadata,
    snapshotChecksum,
    engineResults: engineResultsFromSnapshot(snapshot),
  };

  return freezeFact(fact);
}
