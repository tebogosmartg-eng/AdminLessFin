/**
 * Payroll Reporting Export Framework (V3.6.5)
 *
 * Supports CSV, Excel (SpreadsheetML), and PDF for management / matrix / VIP reports.
 * Does not recalculate payroll. Branding is owned by the platform export facade.
 */

import {
  buildSpreadsheetMl as platformBuildSpreadsheetMl,
  exportReportRows,
  exportReportRowsAsync,
  rowsToCsvString as platformRowsToCsvString,
  type ExportSection,
  type ReportExportBranding,
} from '../reporting/export';

export type PayrollExportFormat = 'csv' | 'excel' | 'pdf';

export type PayrollExportArtifact = {
  format: PayrollExportFormat;
  fileName: string;
  contentType: string;
  rowCount: number;
  exportedAt: string;
  reportId?: string;
};

export type PayrollExportOptions = {
  format: PayrollExportFormat;
  fileBaseName: string;
  branding: ReportExportBranding;
  /** @deprecated Prefer branding.reportTitle */
  title?: string;
  /** @deprecated Prefer branding.period */
  subtitle?: string;
  sections?: ExportSection[];
  detailRows?: Record<string, string | number>[];
};

/**
 * Excel-compatible SpreadsheetML (.xls). Opens natively in Excel / LibreOffice
 * without adding a binary XLSX dependency.
 */
export function buildSpreadsheetMl(
  rows: Record<string, string | number>[],
  options?: {
    branding?: ReportExportBranding;
    sections?: ExportSection[];
    detailRows?: Record<string, string | number>[];
  }
): string {
  return platformBuildSpreadsheetMl(rows, options);
}

export function exportPayrollReportRows(
  rows: Record<string, string | number>[],
  options: PayrollExportOptions
): PayrollExportArtifact {
  const artifact = exportReportRows(rows, {
    format: options.format,
    fileBaseName: options.fileBaseName,
    branding: options.branding,
    title: options.title ?? options.branding.reportTitle,
    subtitle: options.subtitle ?? options.branding.period,
    sections: options.sections,
    detailRows: options.detailRows,
  });

  return {
    format: artifact.format as PayrollExportFormat,
    fileName: artifact.fileName,
    contentType: artifact.contentType,
    rowCount: artifact.rowCount,
    exportedAt: artifact.exportedAt,
    reportId: artifact.reportId,
  };
}

/** Async PDF when company logo should be embedded. */
export async function exportPayrollReportRowsAsync(
  rows: Record<string, string | number>[],
  options: PayrollExportOptions
): Promise<PayrollExportArtifact> {
  const artifact = await exportReportRowsAsync(rows, {
    format: options.format,
    fileBaseName: options.fileBaseName,
    branding: options.branding,
    title: options.title ?? options.branding.reportTitle,
    subtitle: options.subtitle ?? options.branding.period,
    sections: options.sections,
    detailRows: options.detailRows,
  });

  return {
    format: artifact.format as PayrollExportFormat,
    fileName: artifact.fileName,
    contentType: artifact.contentType,
    rowCount: artifact.rowCount,
    exportedAt: artifact.exportedAt,
    reportId: artifact.reportId,
  };
}

/** Pure helper for tests — CSV string without browser download. */
export function rowsToCsvString(rows: Record<string, string | number>[]): string {
  return platformRowsToCsvString(rows);
}

export type { ReportExportBranding, ExportSection };
