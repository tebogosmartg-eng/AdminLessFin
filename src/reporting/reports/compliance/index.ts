/**
 * Compliance report registrations — Enterprise VIP Payroll Working Paper (V3.6.6)
 *
 * Generators consume finalized Payroll Facts only. No payroll calculation.
 */

import { buildVipAnnualReport, vipReportToRows } from '../../../lib/vipReport';
import { asVipFacts } from '../../../lib/vipReportSources';
import type { ReportDefinitionInput, ReportResult } from '../../registry/reportDefinition';
import { isReportRegistered, registerReport } from '../../registry/reportRegistry';

export const VIP_REPORT_ID = 'payroll.compliance.vip';

const EXPORTS = ['csv', 'excel', 'pdf', 'json'] as const;

function vipDefinition(): ReportDefinitionInput {
  return {
    id: VIP_REPORT_ID,
    name: 'Enterprise VIP Payroll Working Paper',
    module: 'payroll',
    category: 'compliance',
    description:
      'Employee-first annual payroll audit working paper (SA FY Mar–Feb) from immutable Payroll Facts only.',
    supportedFilters: [
      { id: 'taxYearStartYear', label: 'Tax year start (March year)', type: 'number', required: true },
      { id: 'start', label: 'Period start', type: 'date_range' },
      { id: 'end', label: 'Period end', type: 'date_range' },
    ],
    supportedExports: [...EXPORTS],
    permissions: {
      permissions: ['payroll.reports.read'],
    },
    tags: ['vip', 'audit', 'compliance', 'annual', 'working-paper'],
    generator: async (ctx) => {
      const facts = asVipFacts(ctx.source);
      const taxYearRaw = ctx.filters.taxYearStartYear;
      const taxYearStartYear =
        typeof taxYearRaw === 'number'
          ? taxYearRaw
          : typeof taxYearRaw === 'string'
            ? Number(taxYearRaw)
            : undefined;
      const report = buildVipAnnualReport(facts, {
        taxYearStartYear: Number.isFinite(taxYearStartYear) ? taxYearStartYear : undefined,
      });
      const result: ReportResult = {
        reportId: VIP_REPORT_ID,
        generatedAt: new Date().toISOString(),
        title: 'Enterprise VIP Payroll Working Paper',
        subtitle: `${report.taxYearLabel} · Finalized payroll snapshots only`,
        columns: report.columns,
        rows: vipReportToRows(report),
        meta: {
          taxYearStartYear: report.taxYearStartYear,
          taxYearLabel: report.taxYearLabel,
          employeeCount: report.employeeCount,
          factCount: report.factCount,
          companyId: ctx.companyId,
          companyName: ctx.companyName,
          layout: 'employee-first-audit-working-paper',
          architecture: 'v3.6.6',
          sectionCount: report.employees.length,
          sourcePayrollRunIds: report.sourcePayrollRunIds,
        },
      };
      return result;
    },
  };
}

/** Idempotent registration of compliance reports into the platform registry. */
export function registerComplianceReports(): string[] {
  const registered: string[] = [];
  if (!isReportRegistered(VIP_REPORT_ID)) {
    registerReport(vipDefinition());
    registered.push(VIP_REPORT_ID);
  }
  return registered;
}
