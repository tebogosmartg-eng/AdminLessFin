/**
 * VIP-owned CSV export (V3.6.6) — independent of operational export framework.
 */

import Papa from 'papaparse';
import { assertVipBranding, vipBrandingCsvPreamble } from '../branding';
import type { VipDetailRow, VipExportBranding, VipWorkingPaperReport } from '../types';
import { vipWorkingPaperToDetailRows } from '../builder';

function triggerDownload(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportVipCsv(
  report: VipWorkingPaperReport,
  branding: VipExportBranding,
  fileBaseName: string
): { fileName: string; contentType: string; payload: string } {
  const b = assertVipBranding(branding);
  const rows: VipDetailRow[] = vipWorkingPaperToDetailRows(report);
  const payload = vipBrandingCsvPreamble(b) + Papa.unparse(rows);
  const name = fileBaseName.endsWith('.csv') ? fileBaseName : `${fileBaseName}.csv`;
  if (typeof document !== 'undefined') {
    triggerDownload(new Blob([payload], { type: 'text/csv;charset=utf-8;' }), name);
  }
  return { fileName: name, contentType: 'text/csv;charset=utf-8', payload };
}
