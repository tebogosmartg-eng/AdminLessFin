import { describe, expect, it } from 'vitest';
import type { DocumentModel } from '../../src/lib/financialStatements/document/documentModel';
import { emptyOverrides } from '../../src/lib/financialStatements/document/documentStore';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import {
  formatReportingEndDate,
  reportingPeriodCoverTitle,
} from '../../src/lib/financialStatements/publication/reportingPeriodFormatter';

function modelWithEndDate(end_date: string): DocumentModel {
  return {
    companyId: 'co-cover',
    workspaceId: 'ws-cover',
    workspaceName: 'Cover heading test',
    frameworkPackId: 'pack-1',
    frameworkKey: 'IFRS_SME',
    frameworkLabel: 'IFRS for SMEs',
    entity: {
      registered_name: 'Cover Test Entity (Pty) Ltd',
      reporting_currency: 'ZAR',
    } as DocumentModel['entity'],
    period: {
      label: 'Financial Year 2025/26',
      period_key: 'FY2026',
      start_date: '2025-04-01',
      end_date,
    },
    statements: [],
    policySets: [],
    notes: [],
    crossReferences: [],
    signatures: [],
    trialBalanceCaptured: false,
  };
}

describe('EFS reporting period cover title', () => {
  it('formats reporting end date with future localisation support', () => {
    expect(formatReportingEndDate('2026-03-31')).toBe('31 March 2026');
    expect(formatReportingEndDate('2026-03-31', { uppercase: true })).toBe('31 MARCH 2026');
  });

  it('derives cover title from canonical reporting period end date', () => {
    expect(reportingPeriodCoverTitle('2026-03-31')).toBe('FOR THE YEAR ENDED 31 MARCH 2026');
    expect(reportingPeriodCoverTitle('2025-12-31')).toBe('FOR THE YEAR ENDED 31 DECEMBER 2025');
  });

  it.each([
    ['2026-03-31', 'FOR THE YEAR ENDED 31 MARCH 2026'],
    ['2026-06-30', 'FOR THE YEAR ENDED 30 JUNE 2026'],
    ['2026-09-30', 'FOR THE YEAR ENDED 30 SEPTEMBER 2026'],
    ['2025-12-31', 'FOR THE YEAR ENDED 31 DECEMBER 2025'],
  ])('builds the correct cover title for %s', (endDate, expected) => {
    const view = prepareCanonicalDocumentView(modelWithEndDate(endDate), emptyOverrides());
    expect(view.presentation.coverTitle).toBe(expected);
  });
});
