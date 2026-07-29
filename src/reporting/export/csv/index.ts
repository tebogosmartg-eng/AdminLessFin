import Papa from 'papaparse';
import { triggerDownload } from '../download';
import {
  assertExportBranding,
  brandingToCsvPreamble,
  type ReportExportBranding,
} from '../branding';

export function rowsToCsvString(rows: Record<string, string | number>[]): string {
  return Papa.unparse(rows);
}

export function exportCsv(
  rows: Record<string, string | number>[],
  fileName: string,
  branding?: ReportExportBranding
): { fileName: string; contentType: string; payload: string } {
  const b = branding ? assertExportBranding(branding, 'csv') : undefined;
  const preamble = b ? brandingToCsvPreamble(b) : '';
  const payload = preamble + rowsToCsvString(rows);
  const name = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  if (typeof document !== 'undefined') {
    const blob = new Blob(['\uFEFF' + payload], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, name);
  }
  return { fileName: name, contentType: 'text/csv;charset=utf-8', payload };
}
