import type { ReportDefinitionInput } from '../../registry/reportDefinition';
import { isReportRegistered, registerReport } from '../../registry/reportRegistry';

const PLACEHOLDER: ReportDefinitionInput = {
  id: 'sales.operational.sales_summary',
  name: 'Sales Summary (Platform Placeholder)',
  module: 'sales',
  category: 'operational',
  description: 'Placeholder for sales summary via reporting platform.',
  supportedFilters: [
    { id: 'start', label: 'Period start', type: 'date_range' },
    { id: 'end', label: 'Period end', type: 'date_range' },
  ],
  supportedExports: ['csv', 'excel', 'pdf', 'json'],
  permissions: { permissions: ['sales.reports.read'] },
  enabled: false,
  tags: ['sales', 'placeholder'],
  generator: () => ({
    reportId: 'sales.operational.sales_summary',
    generatedAt: new Date().toISOString(),
    title: 'Sales Summary',
    rows: [],
    meta: { placeholder: true },
  }),
};

export function registerSalesReports(): string[] {
  if (isReportRegistered(PLACEHOLDER.id)) return [];
  registerReport(PLACEHOLDER);
  return [PLACEHOLDER.id];
}
