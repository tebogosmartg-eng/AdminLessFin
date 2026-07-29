/**
 * Enterprise VIP Payroll Working Paper — Audit module barrel (V3.6.6)
 *
 * Dedicated employee-first audit working paper.
 * Independent of Management Matrix renderer and operational export framework.
 *
 * Logical path: src/reporting/audit/vip/*
 */

export * from './types';
export * from './sections';
export * from './layout';
export * from './branding';
export * from './validation';
export * from './renderer';
export {
  buildVipWorkingPaperFromFacts,
  buildVipReportFromFacts,
  vipWorkingPaperToDetailRows,
  vipReportToDetailRows,
  vipReportSections,
  vipReportToRows,
} from './builder';
export {
  exportVipWorkingPaper,
  exportVipWorkingPaperAsync,
  exportVipCsv,
  exportVipExcel,
  exportVipPdf,
  exportVipPdfAsync,
  type VipExportFormat,
  type VipExportArtifact,
} from './export';

export const VIP_ITEM_COLUMN = 'Payroll Item';

export type { VipDetailRow as VipReportRow } from './types';
export type VipAnnualReport = ReturnType<
  typeof import('./builder').buildVipReportFromFacts
>;
export type VipEmployeeSection = VipAnnualReport['sections'][number];
