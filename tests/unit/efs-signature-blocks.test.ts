/**
 * Phase C — Signature blocks (Controlled Impl V11.5).
 *
 * Assembled from existing engagement general information; empty → placeholders.
 * Preview ≡ PDF; stored engagement data is not mutated by the renderer.
 */
import { describe, expect, it } from 'vitest';
import type { DocumentModel } from '../../src/lib/financialStatements/document/documentModel';
import type { EfsWorkspaceGeneralInformation } from '../../src/lib/financialStatements/api';
import {
  assembleSignatures,
  displaySignatureField,
  signatureCompleteness,
  SIGNATURE_PLACEHOLDERS,
} from '../../src/lib/financialStatements/document/signatureModel';
import { emptyOverrides } from '../../src/lib/financialStatements/document/documentStore';
import {
  generateWorkspaceAfsPdf,
  workspacePdfToBytes,
} from '../../src/lib/financialStatements/publication/afsWorkspacePdf';

function decodePdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const matches = [...raw.matchAll(/\((?:\\.|[^\\)])*\)/g)];
  return matches
    .map((m) =>
      m[0]
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\([()\\])/g, '$1'),
    )
    .join('\n');
}

function baseModel(entity: EfsWorkspaceGeneralInformation | null): DocumentModel {
  const signatures = assembleSignatures(entity);
  return {
    companyId: 'co-1',
    workspaceId: 'ws-sig-1',
    workspaceName: 'Signature engagement',
    frameworkPackId: 'pack-1',
    frameworkKey: 'IFRS_SME',
    frameworkLabel: 'IFRS for SMEs',
    entity,
    period: {
      label: 'FY2026',
      start_date: '2025-04-01',
      end_date: '2026-03-31',
    },
    statements: [
      {
        id: 'financial_position',
        kind: 'statement',
        statement_type: 'financial_position',
        title: 'Statement of Financial Position',
        lines: [],
        populated: false,
      },
      {
        id: 'financial_performance',
        kind: 'statement',
        statement_type: 'financial_performance',
        title: 'Statement of Profit or Loss and Other Comprehensive Income',
        lines: [],
        populated: false,
      },
      {
        id: 'changes_in_equity',
        kind: 'statement',
        statement_type: 'changes_in_equity',
        title: 'Statement of Changes in Equity',
        lines: [],
        populated: false,
      },
      {
        id: 'cash_flows',
        kind: 'statement',
        statement_type: 'cash_flows',
        title: 'Statement of Cash Flows',
        lines: [],
        populated: false,
      },
    ],
    policySets: [],
    notes: [],
    crossReferences: [],
    signatures,
    trialBalanceCaptured: false,
  };
}

describe('Phase C — Signature assembly', () => {
  it('always returns four formal signature blocks when empty', () => {
    const sigs = assembleSignatures(null);
    expect(sigs).toHaveLength(4);
    expect(sigs.map((s) => s.label)).toEqual([
      'Prepared By',
      'Reviewed By',
      'Approved By',
      'Authorised Representative',
    ]);
    expect(sigs.every((s) => !s.complete)).toBe(true);
    expect(signatureCompleteness(sigs).filled).toBe(0);
  });

  it('assembles partial signatures from engagement information', () => {
    const sigs = assembleSignatures({
      prepared_by: 'Ada Accountant',
      approved_by: 'Pat Partner',
      approval_date: '2026-06-30',
    });
    expect(sigs.find((s) => s.role === 'prepared_by')?.complete).toBe(true);
    expect(sigs.find((s) => s.role === 'prepared_by')?.name).toBe('Ada Accountant');
    expect(sigs.find((s) => s.role === 'reviewed_by')?.complete).toBe(false);
    expect(sigs.find((s) => s.role === 'approved_by')?.date).toBe('2026-06-30');
    expect(signatureCompleteness(sigs).filled).toBe(2);
    expect(signatureCompleteness(sigs).allComplete).toBe(false);
  });

  it('assembles complete signatures including authorised representative', () => {
    const sigs = assembleSignatures({
      prepared_by: 'Ada Accountant',
      reviewed_by: 'Mo Manager',
      approved_by: 'Pat Partner',
      approval_date: '2026-06-30',
      company_secretary: 'Sam Secretary',
      authorisation_date: '2026-07-01',
    });
    expect(signatureCompleteness(sigs).allComplete).toBe(true);
    const auth = sigs.find((s) => s.role === 'authorised_representative')!;
    expect(auth.name).toBe('Sam Secretary');
    expect(auth.position).toBe('Company Secretary');
    expect(auth.date).toBe('2026-07-01');
  });

  it('falls back to first director for authorised representative', () => {
    const sigs = assembleSignatures({
      directors: [{ name: 'Dir One', role: 'Director' }],
      authorisation_date: '2026-07-15',
    });
    const auth = sigs.find((s) => s.role === 'authorised_representative')!;
    expect(auth.name).toBe('Dir One');
    expect(auth.position).toBe('Director');
    expect(auth.date).toBe('2026-07-15');
  });

  it('displaySignatureField renders placeholders for empty values', () => {
    expect(displaySignatureField('', 'name')).toBe(SIGNATURE_PLACEHOLDERS.name);
    expect(displaySignatureField('  ', 'date')).toBe(SIGNATURE_PLACEHOLDERS.date);
    expect(displaySignatureField('Ada', 'name')).toBe('Ada');
  });
});

describe('Phase C — Signature rendering + Preview≡PDF', () => {
  it('renders placeholders when signatures are empty', () => {
    const model = baseModel(null);
    const pdf = generateWorkspaceAfsPdf(model, emptyOverrides());
    const text = decodePdfText(workspacePdfToBytes(pdf));
    expect(text).toMatch(/Approval of Annual Financial Statements/);
    expect(text).toMatch(/Prepared By/);
    expect(text).toMatch(/Reviewed By/);
    expect(text).toMatch(/Approved By/);
    expect(text).toMatch(/Authorised Representative/);
    expect(text).toContain(SIGNATURE_PLACEHOLDERS.name);
    expect(text).toContain(SIGNATURE_PLACEHOLDERS.signature);
  });

  it('renders captured names for partial signatures and placeholders for the rest', () => {
    const model = baseModel({
      prepared_by: 'Ada Accountant',
      registered_name: 'Sig Co',
    });
    const text = decodePdfText(
      workspacePdfToBytes(generateWorkspaceAfsPdf(model, emptyOverrides())),
    );
    expect(text).toMatch(/Ada Accountant/);
    expect(text).toContain(SIGNATURE_PLACEHOLDERS.name);
  });

  it('renders complete signature set with dates', () => {
    const model = baseModel({
      prepared_by: 'Ada Accountant',
      reviewed_by: 'Mo Manager',
      approved_by: 'Pat Partner',
      approval_date: '2026-06-30',
      company_secretary: 'Sam Secretary',
      authorisation_date: '2026-07-01',
      registered_name: 'Complete Co',
    });
    const text = decodePdfText(
      workspacePdfToBytes(generateWorkspaceAfsPdf(model, emptyOverrides())),
    );
    expect(text).toMatch(/Ada Accountant/);
    expect(text).toMatch(/Mo Manager/);
    expect(text).toMatch(/Pat Partner/);
    expect(text).toMatch(/Sam Secretary/);
    expect(text).toMatch(/2026-06-30/);
    expect(text).toMatch(/2026-07-01/);
    expect(text).toContain(SIGNATURE_PLACEHOLDERS.signature);
  });

  it('Preview bytes equal Download bytes with signatures', () => {
    const model = baseModel({
      prepared_by: 'Ada Accountant',
      approved_by: 'Pat Partner',
    });
    const pdf = generateWorkspaceAfsPdf(model, emptyOverrides());
    expect(workspacePdfToBytes(pdf)).toEqual(workspacePdfToBytes(pdf));
    expect(pdf.startsWith('%PDF')).toBe(true);
  });
});
