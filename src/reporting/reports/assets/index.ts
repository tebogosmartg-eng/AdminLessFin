import type { ReportDefinitionInput } from '../../registry/reportDefinition';
import { isReportRegistered, registerReport } from '../../registry/reportRegistry';

const PLACEHOLDER: ReportDefinitionInput = {
  id: 'assets.operational.asset_register',
  name: 'Asset Register (Platform Placeholder)',
  module: 'assets',
  category: 'operational',
  description: 'Placeholder for fixed-asset register via reporting platform.',
  supportedFilters: [{ id: 'asOf', label: 'As of date', type: 'date_range' }],
  supportedExports: ['csv', 'excel', 'pdf', 'json'],
  permissions: { permissions: ['assets.reports.read'] },
  enabled: false,
  tags: ['assets', 'placeholder'],
  generator: () => ({
    reportId: 'assets.operational.asset_register',
    generatedAt: new Date().toISOString(),
    title: 'Asset Register',
    rows: [],
    meta: { placeholder: true },
  }),
};

export function registerAssetsReports(): string[] {
  if (isReportRegistered(PLACEHOLDER.id)) return [];
  registerReport(PLACEHOLDER);
  return [PLACEHOLDER.id];
}
