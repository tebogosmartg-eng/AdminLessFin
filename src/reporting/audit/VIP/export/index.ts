/**
 * VIP-owned export facade (V3.6.6)
 */

import { assertVipBranding } from '../branding';
import type { VipExportBranding, VipWorkingPaperReport } from '../types';
import { exportVipCsv } from './csv';
import { exportVipExcel } from './excel';
import { exportVipPdf, exportVipPdfAsync } from './pdf';

export type VipExportFormat = 'csv' | 'excel' | 'pdf';

export type VipExportArtifact = {
  format: VipExportFormat;
  fileName: string;
  contentType: string;
  reportId: string;
  exportedAt: string;
  payload?: string;
};

export function exportVipWorkingPaper(
  report: VipWorkingPaperReport,
  options: {
    format: VipExportFormat;
    fileBaseName: string;
    branding: VipExportBranding;
  }
): VipExportArtifact {
  const branding = assertVipBranding(options.branding);
  const exportedAt = new Date().toISOString();
  const base = options.fileBaseName.replace(/\.+$/, '');

  if (options.format === 'csv') {
    const result = exportVipCsv(report, branding, base);
    return {
      format: 'csv',
      fileName: result.fileName,
      contentType: result.contentType,
      reportId: branding.reportId,
      exportedAt,
      payload: result.payload,
    };
  }

  if (options.format === 'excel') {
    const result = exportVipExcel(report, branding, base);
    return {
      format: 'excel',
      fileName: result.fileName,
      contentType: result.contentType,
      reportId: branding.reportId,
      exportedAt,
      payload: result.payload,
    };
  }

  const result = exportVipPdf(report, branding, base);
  return {
    format: 'pdf',
    fileName: result.fileName,
    contentType: result.contentType,
    reportId: branding.reportId,
    exportedAt,
  };
}

export async function exportVipWorkingPaperAsync(
  report: VipWorkingPaperReport,
  options: {
    format: VipExportFormat;
    fileBaseName: string;
    branding: VipExportBranding;
  }
): Promise<VipExportArtifact> {
  if (options.format !== 'pdf') {
    return exportVipWorkingPaper(report, options);
  }
  const branding = assertVipBranding(options.branding);
  const result = await exportVipPdfAsync(report, branding, options.fileBaseName.replace(/\.+$/, ''));
  return {
    format: 'pdf',
    fileName: result.fileName,
    contentType: result.contentType,
    reportId: branding.reportId,
    exportedAt: new Date().toISOString(),
  };
}

export { exportVipCsv, exportVipExcel, exportVipPdf, exportVipPdfAsync };
