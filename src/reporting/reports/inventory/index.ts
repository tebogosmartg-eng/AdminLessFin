import type { ReportDefinitionInput } from '../../registry/reportDefinition';
import { isReportRegistered, registerReport } from '../../registry/reportRegistry';

const PLACEHOLDER: ReportDefinitionInput = {
  id: 'inventory.operational.stock_on_hand',
  name: 'Stock on Hand (Platform Placeholder)',
  module: 'inventory',
  category: 'operational',
  description: 'Placeholder for inventory stock report via reporting platform.',
  supportedFilters: [{ id: 'asOf', label: 'As of date', type: 'date_range' }],
  supportedExports: ['csv', 'excel', 'pdf', 'json'],
  permissions: { permissions: ['inventory.reports.read'] },
  enabled: false,
  tags: ['inventory', 'placeholder'],
  generator: () => ({
    reportId: 'inventory.operational.stock_on_hand',
    generatedAt: new Date().toISOString(),
    title: 'Stock on Hand',
    rows: [],
    meta: { placeholder: true },
  }),
};

export function registerInventoryReports(): string[] {
  if (isReportRegistered(PLACEHOLDER.id)) return [];
  registerReport(PLACEHOLDER);
  return [PLACEHOLDER.id];
}
