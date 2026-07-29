/**
 * Unified export facade — Enterprise Reporting Platform (V3.6.5)
 * Branding is owned by this framework; reports supply data + metadata only.
 */

import type { ReportExportFormat } from '../registry/reportDefinition';
import {
  assertExportBranding,
  type ExportSection,
  type ReportExportBranding,
} from './branding';
import { exportCsv, rowsToCsvString } from './csv';
import { buildSpreadsheetMl, exportExcel } from './excel';
import { exportPdf, exportPdfAsync } from './pdf';
import { exportJson } from './json';

export type { ReportExportBranding, ExportSection } from './branding';
export {
  buildReportId,
  resolveBranding,
  brandingToCsvPreamble,
  assertExportBranding,
} from './branding';

export type ExportArtifact = {
  format: ReportExportFormat;
  fileName: string;
  contentType: string;
  rowCount: number;
  exportedAt: string;
  payload?: string;
  reportId?: string;
};

export type ExportReportOptions = {
  format: ReportExportFormat;
  fileBaseName: string;
  /** Required for PDF/Excel in browser; required for branded CSV preamble. */
  branding?: ReportExportBranding;
  /** @deprecated Prefer branding.reportTitle */
  title?: string;
  /** @deprecated Prefer branding.period */
  subtitle?: string;
  meta?: Record<string, unknown>;
  /** Employee-first / sectioned working paper body (VIP). */
  sections?: ExportSection[];
  /** Flat detail rows for Excel Detail sheet (defaults to rows). */
  detailRows?: Record<string, string | number>[];
};

export function exportReportRows(
  rows: Record<string, string | number>[],
  options: ExportReportOptions
): ExportArtifact {
  const exportedAt = new Date().toISOString();
  const base = options.fileBaseName.replace(/\.+$/, '');
  const inBrowser = typeof document !== 'undefined';

  if (options.format === 'csv') {
    if (inBrowser) assertExportBranding(options.branding, 'csv');
    const result = exportCsv(rows, base, options.branding);
    return {
      format: 'csv',
      fileName: result.fileName,
      contentType: result.contentType,
      rowCount: rows.length,
      exportedAt,
      payload: result.payload,
      reportId: options.branding?.reportId,
    };
  }

  if (options.format === 'excel') {
    if (inBrowser) assertExportBranding(options.branding, 'excel');
    const result = exportExcel(rows, base, {
      branding: options.branding,
      sections: options.sections,
      detailRows: options.detailRows,
    });
    return {
      format: 'excel',
      fileName: result.fileName,
      contentType: result.contentType,
      rowCount: rows.length,
      exportedAt,
      payload: result.payload,
      reportId: options.branding?.reportId,
    };
  }

  if (options.format === 'json') {
    const result = exportJson(rows, base, {
      ...options.meta,
      branding: options.branding ? options.branding : undefined,
    });
    return {
      format: 'json',
      fileName: result.fileName,
      contentType: result.contentType,
      rowCount: rows.length,
      exportedAt,
      payload: result.payload,
      reportId: options.branding?.reportId,
    };
  }

  if (inBrowser) assertExportBranding(options.branding, 'pdf');
  const result = exportPdf(rows, {
    fileName: base,
    title: options.branding?.reportTitle ?? options.title,
    subtitle: options.branding?.period ?? options.subtitle,
    branding: options.branding,
    sections: options.sections,
  });
  return {
    format: 'pdf',
    fileName: result.fileName,
    contentType: result.contentType,
    rowCount: rows.length,
    exportedAt,
    reportId: options.branding?.reportId,
  };
}

/** Async export when PDF logo fetch is desired. */
export async function exportReportRowsAsync(
  rows: Record<string, string | number>[],
  options: ExportReportOptions
): Promise<ExportArtifact> {
  if (options.format !== 'pdf') {
    return exportReportRows(rows, options);
  }
  const exportedAt = new Date().toISOString();
  const base = options.fileBaseName.replace(/\.+$/, '');
  const branding = assertExportBranding(options.branding, 'pdf');
  const result = await exportPdfAsync(rows, {
    fileName: base,
    branding,
    sections: options.sections,
  });
  return {
    format: 'pdf',
    fileName: result.fileName,
    contentType: result.contentType,
    rowCount: rows.length,
    exportedAt,
    reportId: branding.reportId,
  };
}

export { rowsToCsvString, buildSpreadsheetMl, exportPdfAsync };
