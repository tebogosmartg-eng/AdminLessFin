/**
 * Enterprise Reporting Platform — public entry (V3.6.3)
 */

export type {
  ReportCategory,
  ReportDefinition,
  ReportDefinitionInput,
  ReportExportFormat,
  ReportFilterDefinition,
  ReportGenerator,
  ReportGeneratorContext,
  ReportModule,
  ReportPermission,
  ReportResult,
  ReportRow,
} from './registry/reportDefinition';

export {
  clearReportRegistry,
  getReport,
  isReportRegistered,
  listReportCatalogue,
  listReports,
  registerReport,
  requireReport,
} from './registry/reportRegistry';

export { buildMatrix, buildColumnVariance, matrixToRows } from './engine/matrixEngine';
export type { GenericMatrix, MatrixBuildInput, MatrixColumnDef, MatrixMeasureDef } from './engine/matrixEngine';

export { aggregateValues, accumulate } from './engine/aggregationEngine';
export type { AggregationFn } from './engine/aggregationEngine';

export { applyFilters, dateRangeFilter, equalsFilter, inSetFilter } from './engine/filterEngine';
export { groupBy, sortedGroupKeys } from './engine/groupingEngine';

export {
  exportReportRows,
  exportReportRowsAsync,
  rowsToCsvString,
  buildSpreadsheetMl,
  buildReportId,
  resolveBranding,
  brandingToCsvPreamble,
  assertExportBranding,
} from './export';
export type { ExportArtifact, ExportReportOptions, ReportExportBranding, ExportSection } from './export';

export { canAccessReport, evaluatePermissions } from './permissions';
export { registerSchedule, listSchedules, clearSchedules } from './scheduler';
export type { ReportSchedule, ScheduleFrequency } from './scheduler';

export { registerPayrollReports } from './reports/payroll';
export { registerAccountingReports } from './reports/accounting';
export { registerInventoryReports } from './reports/inventory';
export { registerAssetsReports } from './reports/assets';
export { registerSalesReports } from './reports/sales';
export { registerComplianceReports, VIP_REPORT_ID } from './reports/compliance';
export { registerWorkReports } from './reports/work';

export * from './facts';
export {
  buildVipWorkingPaperFromFacts,
  buildVipReportFromFacts,
  vipReportToRows,
  vipReportToDetailRows,
  vipReportSections,
  vipWorkingPaperToDetailRows,
  VIP_ANNUAL_TOTAL_COLUMN,
  VIP_ITEM_COLUMN,
  exportVipWorkingPaper,
  exportVipWorkingPaperAsync,
  createVipExportBranding,
  buildVipReportId,
  validateVipWorkingPaper,
  listVipComponentCodes,
} from './audit/VIP';
export type {
  VipAnnualReport,
  VipReportRow,
  VipEmployeeSection,
  VipWorkingPaperReport,
  VipExportBranding,
  VipExportFormat,
} from './audit/VIP';

export { buildOperationalReportsFromFacts } from './operational/PayrollRegister';
export { buildManagementReportsFromFacts } from './management';
export { statutoryRunsFromFacts } from './statutory';
export { buildPayrollFactPivot } from './engine/PivotEngine';
export { resolveDimensionValue } from './engine/DimensionEngine';

import { registerPayrollReports } from './reports/payroll';
import { registerAccountingReports } from './reports/accounting';
import { registerInventoryReports } from './reports/inventory';
import { registerAssetsReports } from './reports/assets';
import { registerSalesReports } from './reports/sales';
import { registerComplianceReports } from './reports/compliance';
import { registerWorkReports } from './reports/work';

/** Bootstrap all known module report registrations (idempotent). */
export function bootstrapReportingPlatform(): {
  payroll: string[];
  accounting: string[];
  inventory: string[];
  assets: string[];
  sales: string[];
  compliance: string[];
  work: string[];
} {
  return {
    payroll: registerPayrollReports(),
    accounting: registerAccountingReports(),
    inventory: registerInventoryReports(),
    assets: registerAssetsReports(),
    sales: registerSalesReports(),
    compliance: registerComplianceReports(),
    work: registerWorkReports(),
  };
}
