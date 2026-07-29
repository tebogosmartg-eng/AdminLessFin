/**
 * Export framework — isolated from generation and validation (V3.6.1).
 */

import { computePayloadChecksum } from '../registry/types';
import type { StatutoryReturn } from '../../lib/statutoryReturns/types';
import type { ExportFormat, StatutoryExportArtifact } from './contracts';
import { hashStatutoryReturn, isReturnSubmitted } from './ledger';

function toCsv(ret: StatutoryReturn): string {
  const rows: string[][] = [
    ['field', 'value'],
    ['id', ret.id],
    ['country', ret.country],
    ['returnType', ret.returnType],
    ['taxYear', ret.taxYear],
    ['status', ret.status],
    ['contentHash', ret.contentHash ?? hashStatutoryReturn(ret)],
    ['declarationJson', JSON.stringify(ret.declarationData)],
  ];
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function toXml(ret: StatutoryReturn): string {
  const hash = ret.contentHash ?? hashStatutoryReturn(ret);
  const body = JSON.stringify(ret.declarationData)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<StatutoryReturn id="${ret.id}" country="${ret.country}" type="${ret.returnType}" taxYear="${ret.taxYear}" contentHash="${hash}"><Declaration>${body}</Declaration></StatutoryReturn>\n`;
}

export function exportStatutoryReturn(
  ret: StatutoryReturn,
  format: ExportFormat = 'json'
): StatutoryExportArtifact {
  if (!ret.validationResult?.ok && !isReturnSubmitted(ret)) {
    // Export allowed for audit of drafts, but mark in file name
  }
  const contentHash = ret.contentHash ?? hashStatutoryReturn(ret);
  let payload: string;
  let contentType: string;
  let ext: string;
  if (format === 'csv') {
    payload = toCsv(ret);
    contentType = 'text/csv';
    ext = 'csv';
  } else if (format === 'xml') {
    payload = toXml(ret);
    contentType = 'application/xml';
    ext = 'xml';
  } else {
    payload = JSON.stringify(
      {
        id: ret.id,
        country: ret.country,
        returnType: ret.returnType,
        taxYear: ret.taxYear,
        status: ret.status,
        contentHash,
        sourcePayrollRuns: ret.sourcePayrollRuns,
        declarationData: ret.declarationData,
        validationResult: ret.validationResult,
      },
      null,
      2
    );
    contentType = 'application/json';
    ext = 'json';
  }

  return {
    returnId: ret.id,
    country: ret.country,
    returnType: ret.returnType,
    format,
    fileName: `${ret.country}_${ret.returnType}_${ret.taxYear}_${ret.id}.${ext}`,
    contentType,
    payload,
    contentHash: computePayloadChecksum({ contentHash, format, payload }),
    exportedAt: new Date().toISOString(),
  };
}
