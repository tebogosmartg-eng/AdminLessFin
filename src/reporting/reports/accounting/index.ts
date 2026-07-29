/**
 * Accounting report module placeholder — registers via platform when generators are supplied.
 * No Accounting engine / journal changes in V3.6.3.
 */

import type { ReportDefinitionInput } from '../../registry/reportDefinition';
import { isReportRegistered, registerReport } from '../../registry/reportRegistry';

const PLACEHOLDER: ReportDefinitionInput = {
  id: 'accounting.management.trial_balance',
  name: 'Trial Balance (Platform Placeholder)',
  module: 'accounting',
  category: 'management',
  description:
    'Placeholder registration for future GL trial balance via reporting platform. Existing /reports UI unchanged.',
  supportedFilters: [
    { id: 'asOf', label: 'As of date', type: 'date_range', required: true },
  ],
  supportedExports: ['csv', 'excel', 'pdf', 'json'],
  permissions: { permissions: ['accounting.reports.read'] },
  enabled: false,
  tags: ['accounting', 'placeholder'],
  generator: () => ({
    reportId: 'accounting.management.trial_balance',
    generatedAt: new Date().toISOString(),
    title: 'Trial Balance',
    rows: [],
    meta: { placeholder: true },
  }),
};

export function registerAccountingReports(): string[] {
  if (isReportRegistered(PLACEHOLDER.id)) return [];
  registerReport(PLACEHOLDER);
  return [PLACEHOLDER.id];
}
