/**
 * Payroll report registrations — Enterprise Reporting Platform (V3.6.4)
 *
 * Generators consume Payroll Facts (or legacy payslip-shaped sources via adapters).
 * Locked buildPeriodReports / buildManagementReports semantics unchanged.
 */

import {
  buildManagementReports,
  MANAGEMENT_REPORT_CATALOG,
  managementReportToRows,
  STATUTORY_REPORT_CATALOG,
  statutoryReportToRows,
  type ManagementPayslipInput,
  type ManagementReportId,
  type StatutoryReportId,
} from '../../../lib/payrollManagementReports';
import {
  buildPeriodReports,
  PAYROLL_REPORT_CATALOG,
  type PayrollPeriodReports,
  type PayrollReportType,
  type RegisterPayslipInput,
} from '../../../lib/payrollReports';
import type { PayrollFact } from '../../facts/PayrollFact';
import { factsToManagementPayslips, factsToRegisterPayslips } from '../../facts/adapters';
import { buildOperationalReportsFromFacts } from '../../operational/PayrollRegister';
import { buildManagementReportsFromFacts } from '../../management';
import type { ReportDefinitionInput, ReportResult } from '../../registry/reportDefinition';
import { isReportRegistered, registerReport } from '../../registry/reportRegistry';

const DATE_FILTERS = [
  { id: 'start', label: 'Period start', type: 'date_range' as const, required: true },
  { id: 'end', label: 'Period end', type: 'date_range' as const, required: true },
];

const EXPORTS = ['csv', 'excel', 'pdf', 'json'] as const;

function operationalRows(
  reportType: PayrollReportType,
  reports: PayrollPeriodReports
): Record<string, string | number>[] {
  switch (reportType) {
    case 'register':
      return reports.register.map((r) => ({
        'Employee Number': r.employee_number ?? '',
        Employee: r.employee,
        Department: r.department,
        'Gross Pay': Number(r.gross_pay.toFixed(2)),
        Deductions: Number(r.deductions.toFixed(2)),
        PAYE: Number(r.paye.toFixed(2)),
        UIF: Number(r.uif.toFixed(2)),
        SDL: Number(r.sdl.toFixed(2)),
        'Employer Contributions': Number(r.employer_contributions.toFixed(2)),
        'Net Salary': Number(r.net_salary.toFixed(2)),
        'Cost to Company': Number(r.cost_to_company.toFixed(2)),
        Status: r.status,
      }));
    case 'earnings':
      return reports.earnings.map((r) => ({ Description: r.description, Amount: Number(r.amount.toFixed(2)) }));
    case 'deductions':
      return reports.deductions.map((r) => ({ Description: r.description, Amount: Number(r.amount.toFixed(2)) }));
    case 'employer_contributions':
      return reports.employer_contributions.map((r) => ({
        Description: r.description,
        Amount: Number(r.amount.toFixed(2)),
      }));
    case 'uif_summary':
      return reports.uif_summary.map((r) => ({ Description: r.description, Amount: Number(r.amount.toFixed(2)) }));
    case 'paye_summary':
      return reports.paye_summary.map((r) => ({ Description: r.description, Amount: Number(r.amount.toFixed(2)) }));
    case 'employee_cost':
      return reports.employee_cost.map((r) => ({
        Employee: r.employee,
        Department: r.department,
        'Cost to Company': Number(r.amount.toFixed(2)),
      }));
    default:
      return [];
  }
}

function isPayrollFactArray(source: unknown): source is PayrollFact[] {
  return (
    Array.isArray(source) &&
    source.length > 0 &&
    typeof source[0] === 'object' &&
    source[0] != null &&
    'snapshotChecksum' in (source[0] as object) &&
    'payrollItems' in (source[0] as object)
  );
}

function asFactsOrPayslips(source: unknown): {
  facts?: PayrollFact[];
  payslips?: RegisterPayslipInput[];
} {
  if (!source) return {};
  if (isPayrollFactArray(source)) return { facts: source };
  if (typeof source === 'object' && Array.isArray((source as { facts?: unknown }).facts)) {
    const facts = (source as { facts: unknown[] }).facts;
    if (isPayrollFactArray(facts)) return { facts };
  }
  if (Array.isArray(source)) return { payslips: source as RegisterPayslipInput[] };
  if (typeof source === 'object' && Array.isArray((source as { payslips?: unknown }).payslips)) {
    return { payslips: (source as { payslips: RegisterPayslipInput[] }).payslips };
  }
  return {};
}

function result(
  reportId: string,
  title: string,
  rows: Record<string, string | number>[],
  subtitle?: string,
  meta?: Record<string, unknown>
): ReportResult {
  return {
    reportId,
    generatedAt: new Date().toISOString(),
    title,
    subtitle,
    rows,
    meta,
  };
}

function operationalDefinition(
  catalogId: PayrollReportType,
  name: string,
  description: string
): ReportDefinitionInput {
  return {
    id: `payroll.operational.${catalogId}`,
    name,
    module: 'payroll',
    category: 'operational',
    description,
    supportedFilters: DATE_FILTERS,
    supportedExports: [...EXPORTS],
    permissions: { permissions: ['payroll.reports.read'] },
    generator: (ctx) => {
      const start = String(ctx.filters.start ?? '');
      const end = String(ctx.filters.end ?? '');
      const { facts, payslips } = asFactsOrPayslips(ctx.source);
      const reports = facts
        ? buildOperationalReportsFromFacts(facts, { start, end })
        : buildPeriodReports(payslips ?? [], { start, end });
      return result(
        `payroll.operational.${catalogId}`,
        name,
        operationalRows(catalogId, reports),
        `${start} – ${end}`,
        { source: facts ? 'payroll_facts' : 'legacy_payslip_shape' }
      );
    },
  };
}

function managementDefinition(
  catalogId: ManagementReportId,
  name: string,
  description: string
): ReportDefinitionInput {
  return {
    id: `payroll.management.${catalogId}`,
    name,
    module: 'payroll',
    category: 'management',
    description,
    supportedFilters: DATE_FILTERS,
    supportedExports: [...EXPORTS],
    permissions: { permissions: ['payroll.reports.read'] },
    generator: (ctx) => {
      const { facts, payslips } = asFactsOrPayslips(ctx.source);
      const bundle = facts
        ? buildManagementReportsFromFacts(facts, { companyName: ctx.companyName })
        : buildManagementReports((payslips ?? []) as ManagementPayslipInput[], {
            companyName: ctx.companyName,
          });
      return result(
        `payroll.management.${catalogId}`,
        name,
        managementReportToRows(catalogId, bundle),
        bundle.taxYearLabel,
        { source: facts ? 'payroll_facts' : 'legacy_payslip_shape' }
      );
    },
  };
}

function statutoryDefinition(
  catalogId: StatutoryReportId,
  name: string,
  description: string
): ReportDefinitionInput {
  return {
    id: `payroll.statutory.${catalogId}`,
    name,
    module: 'payroll',
    category: 'statutory',
    description,
    supportedFilters: DATE_FILTERS,
    supportedExports: [...EXPORTS],
    permissions: { permissions: ['payroll.reports.read'] },
    generator: (ctx) => {
      const { facts, payslips } = asFactsOrPayslips(ctx.source);
      const bundle = facts
        ? buildManagementReportsFromFacts(facts, { companyName: ctx.companyName })
        : buildManagementReports((payslips ?? []) as ManagementPayslipInput[], {
            companyName: ctx.companyName,
          });
      return result(
        `payroll.statutory.${catalogId}`,
        name,
        statutoryReportToRows(catalogId, bundle),
        undefined,
        { source: facts ? 'payroll_facts' : 'legacy_payslip_shape' }
      );
    },
  };
}

/** Idempotent registration of all locked payroll reports into the platform registry. */
export function registerPayrollReports(): string[] {
  const registered: string[] = [];

  for (const item of PAYROLL_REPORT_CATALOG) {
    const id = `payroll.operational.${item.id}`;
    if (!isReportRegistered(id)) {
      registerReport(operationalDefinition(item.id, item.label, item.description));
      registered.push(id);
    }
  }

  for (const item of MANAGEMENT_REPORT_CATALOG) {
    const id = `payroll.management.${item.id}`;
    if (!isReportRegistered(id)) {
      registerReport(managementDefinition(item.id, item.label, item.description));
      registered.push(id);
    }
  }

  for (const item of STATUTORY_REPORT_CATALOG) {
    const id = `payroll.statutory.${item.id}`;
    if (!isReportRegistered(id)) {
      registerReport(statutoryDefinition(item.id, item.label, item.description));
      registered.push(id);
    }
  }

  return registered;
}

export { factsToRegisterPayslips, factsToManagementPayslips };
