/**
 * Phase A — Document Workspace baseline stabilisation (TAS V11.2).
 *
 * Locks current Document Model assembly contracts, note numbering,
 * workspace PDF rendering, Preview≡PDF byte identity, and advisory
 * validation behaviour BEFORE Phase B enhancements.
 *
 * Production code is NOT modified in Phase A.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  isPolicyNote,
  POLICY_NOTE_CODES,
  type DocumentModel,
  type DocNoteNode,
} from '../../src/lib/financialStatements/document/documentModel';
import { computeNoteNumbering } from '../../src/lib/financialStatements/document/renumber';
import {
  emptyOverrides,
  isHidden,
  resolvedTitle,
  loadOverrides,
  saveOverrides,
  type DocOverrides,
} from '../../src/lib/financialStatements/document/documentStore';
import {
  generateWorkspaceAfsPdf,
  workspacePdfToBytes,
} from '../../src/lib/financialStatements/publication/afsWorkspacePdf';
import { validateProfessionalLayout } from '../../src/lib/financialStatements/publication/afsProfessionalPdf';
import { validateAfsArticulation } from '../../src/lib/financialStatements/publication/afsAccountingValidation';

function makeNote(
  partial: Partial<DocNoteNode> & Pick<DocNoteNode, 'id' | 'disclosure_code' | 'title'>,
): DocNoteNode {
  return {
    kind: 'note',
    status: 'draft',
    requirement_level: 'required',
    sort_order: 100,
    sections: [],
    paragraphs: [],
    tables: [],
    ...partial,
  };
}

function baselineModel(overrides?: Partial<DocumentModel>): DocumentModel {
  return {
    companyId: 'co-1',
    workspaceId: 'ws-baseline-1',
    workspaceName: 'FY2026 Annual Financial Statements',
    frameworkPackId: 'pack-1',
    frameworkKey: 'IFRS_SME',
    frameworkLabel: 'IFRS for SMEs',
    entity: {
      registered_name: 'Baseline Entity (Pty) Ltd',
      trading_name: 'Baseline Entity',
      reporting_currency: 'ZAR',
    } as DocumentModel['entity'],
    period: {
      label: 'Financial Year 2025/26',
      period_key: 'FY2026',
      start_date: '2025-04-01',
      end_date: '2026-03-31',
    },
    statements: [
      {
        id: 'financial_position',
        kind: 'statement',
        statement_type: 'financial_position',
        title: 'Statement of Financial Position',
        lines: [
          {
            line_code: 'sfp.total_assets',
            label: 'Total Assets',
            section: 'assets',
            amount: 100000,
            is_total: true,
          },
          {
            line_code: 'sfp.total_liabilities_and_equity',
            label: 'Total Liabilities and Equity',
            section: 'totals',
            amount: 100000,
            is_total: true,
          },
        ],
        populated: true,
      },
      {
        id: 'financial_performance',
        kind: 'statement',
        statement_type: 'financial_performance',
        title: 'Statement of Profit or Loss and Other Comprehensive Income',
        lines: [
          {
            line_code: 'perf.total_revenue',
            label: 'Total Revenue',
            section: 'revenue',
            amount: 50000,
            is_total: true,
          },
          {
            line_code: 'perf.total_expenses',
            label: 'Total Expenses',
            section: 'expenses',
            // Signed expense convention used by validateAfsArticulation: revenue − expenses.
            amount: -20000,
            is_total: true,
          },
          {
            line_code: 'perf.result',
            label: 'Profit / (Loss) for the period',
            section: 'result',
            amount: 70000,
            is_total: true,
          },
        ],
        populated: true,
      },
      {
        id: 'changes_in_equity',
        kind: 'statement',
        statement_type: 'changes_in_equity',
        title: 'Statement of Changes in Equity',
        lines: [
          { line_code: 'eq.opening', label: 'Opening Equity', amount: 30000, is_total: true },
          { line_code: 'eq.period_result', label: 'Profit / (Loss) for the period', amount: 70000 },
          { line_code: 'eq.closing', label: 'Closing Equity', amount: 100000, is_total: true },
        ],
        populated: true,
      },
      {
        id: 'cash_flows',
        kind: 'statement',
        statement_type: 'cash_flows',
        title: 'Statement of Cash Flows',
        lines: [
          { line_code: 'cf.operating', label: 'Operating activities', amount: 10000 },
          { line_code: 'cf.investing', label: 'Investing activities', amount: -2000 },
          { line_code: 'cf.financing', label: 'Financing activities', amount: -3000 },
          {
            line_code: 'cf.net_change',
            label: 'Net increase / (decrease) in cash',
            amount: 5000,
            is_total: true,
          },
        ],
        populated: true,
      },
    ],
    policySets: [
      {
        id: 'ps-1',
        kind: 'policySet',
        title: 'Accounting Policies',
        status: 'draft',
        version_no: 1,
        framework_pack_id: 'pack-1',
        policies: [
          {
            id: 'pol-1',
            kind: 'policy',
            policy_set_id: 'ps-1',
            policy_code: 'POL.BASIS',
            title: 'Basis of preparation',
            body: 'These financial statements are prepared in accordance with IFRS for SMEs.',
            sort_order: 1,
          },
        ],
      },
    ],
    notes: [
      makeNote({
        id: 'note-basis',
        disclosure_code: 'DISC.BASIS',
        title: 'Basis of preparation',
        sort_order: 10,
        paragraphs: [
          {
            id: 'p1',
            paragraph_code: 'P1',
            body: 'The financial statements have been prepared on the going concern basis.',
            sort_order: 1,
          },
        ],
      }),
      makeNote({
        id: 'note-policies',
        disclosure_code: 'DISC.POLICIES',
        title: 'Significant accounting policies',
        sort_order: 20,
        paragraphs: [
          {
            id: 'p2',
            paragraph_code: 'P1',
            body: 'Significant accounting policies are set out below.',
            sort_order: 1,
          },
        ],
      }),
      makeNote({
        id: 'note-revenue',
        disclosure_code: 'DISC.REVENUE',
        title: 'Revenue',
        sort_order: 30,
        paragraphs: [
          {
            id: 'p3',
            paragraph_code: 'P1',
            body: 'Revenue is recognised when control transfers to the customer.',
            sort_order: 1,
          },
        ],
      }),
      makeNote({
        id: 'note-old',
        disclosure_code: 'DISC.OLD',
        title: 'Superseded note',
        status: 'superseded',
        sort_order: 99,
      }),
    ],
    crossReferences: [],
    signatures: [],
    trialBalanceCaptured: true,
    ...overrides,
  };
}

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

/** Mirrors DocumentPreview: preview blob and download blob use the same pipeline. */
function previewAndDownloadBytes(model: DocumentModel, overrides: DocOverrides) {
  const pdfString = generateWorkspaceAfsPdf(model, overrides);
  const previewBytes = workspacePdfToBytes(pdfString);
  const downloadBytes = workspacePdfToBytes(pdfString);
  return { pdfString, previewBytes, downloadBytes };
}

describe('Phase A — Document Model baseline', () => {
  it('identifies significant accounting policies note codes', () => {
    expect(POLICY_NOTE_CODES).toContain('DISC.POLICIES');
    expect(isPolicyNote(makeNote({ id: 'a', disclosure_code: 'DISC.POLICIES', title: 'Policies' }))).toBe(
      true,
    );
    expect(isPolicyNote(makeNote({ id: 'b', disclosure_code: 'DISC.REVENUE', title: 'Revenue' }))).toBe(
      false,
    );
  });

  it('baseline model always includes four primary statement shells', () => {
    const model = baselineModel();
    expect(model.statements.map((s) => s.statement_type)).toEqual([
      'financial_position',
      'financial_performance',
      'changes_in_equity',
      'cash_flows',
    ]);
  });

  it('supports generic (pre-TB) documents with empty statement lines', () => {
    const model = baselineModel({
      trialBalanceCaptured: false,
      statements: baselineModel().statements.map((s) => ({
        ...s,
        lines: [],
        populated: false,
      })),
    });
    expect(model.trialBalanceCaptured).toBe(false);
    expect(model.statements.every((s) => s.lines.length === 0)).toBe(true);
    const pdf = generateWorkspaceAfsPdf(model, emptyOverrides());
    expect(pdf.startsWith('%PDF')).toBe(true);
    const text = decodePdfText(workspacePdfToBytes(pdf));
    expect(text).toMatch(/trial\s+balance[\s\S]{0,80}captured/i);
  });
});

describe('Phase A — Note numbering baseline', () => {
  it('numbers visible notes sequentially and excludes superseded', () => {
    const { visible, hiddenIds } = computeNoteNumbering(baselineModel().notes, emptyOverrides());
    expect(hiddenIds).toContain('note-old');
    expect(visible.map((v) => v.note.id)).not.toContain('note-old');
    expect(visible[0].noteNumber).toBe(1);
    expect(visible[0].heading).toMatch(/^Note 1\. /);
    expect(visible.every((v, idx) => v.noteNumber === idx + 1)).toBe(true);
  });

  it('renumbers immediately when a middle note is hidden', () => {
    const overrides: DocOverrides = {
      ...emptyOverrides(),
      hidden: { 'note-basis': true },
    };
    const { visible, hiddenIds } = computeNoteNumbering(baselineModel().notes, overrides);
    expect(hiddenIds).toContain('note-basis');
    // V15.0: DISC.POLICIES is a policy vessel — excluded from note numbering (Phase 3).
    expect(visible.map((v) => v.note.disclosure_code)).toEqual(['DISC.REVENUE']);
    expect(visible[0].noteNumber).toBe(1);
    expect(visible[0].heading).toBe('Note 1. Revenue');
  });

  it('excludes accounting policy vessels from note numbering (V15.0)', () => {
    const { visible, hiddenIds } = computeNoteNumbering(baselineModel().notes, emptyOverrides());
    expect(hiddenIds).toContain('note-policies');
    expect(visible.map((v) => v.note.disclosure_code)).toEqual(['DISC.BASIS', 'DISC.REVENUE']);
  });

  it('applies title overrides in numbered headings', () => {
    const overrides: DocOverrides = {
      ...emptyOverrides(),
      titleOverrides: { 'note-basis': 'Basis of Accounting' },
    };
    const { visible } = computeNoteNumbering(baselineModel().notes, overrides);
    expect(visible[0].title).toBe('Basis of Accounting');
    expect(visible[0].heading).toBe('Note 1. Basis of Accounting');
  });

  it('honours custom order overrides over default rank', () => {
    const overrides: DocOverrides = {
      ...emptyOverrides(),
      order: {
        'note-revenue': 1,
        'note-basis': 2,
        'note-policies': 3,
      },
    };
    const { visible } = computeNoteNumbering(baselineModel().notes, overrides);
    // V15.0: policy vessels remain excluded even when order overrides mention them.
    expect(visible.map((v) => v.note.id)).toEqual(['note-revenue', 'note-basis']);
  });
});

describe('Phase A — Presentation store baseline', () => {
  const WS = 'ws-baseline-store-test';

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults empty overrides and resolves titles/hidden flags', () => {
    const o = emptyOverrides();
    expect(o.version).toBe(1);
    expect(isHidden(o, 'x')).toBe(false);
    expect(resolvedTitle(o, 'x', 'Fallback')).toBe('Fallback');
  });

  it('persists overrides scoped per workspace', () => {
    const o: DocOverrides = {
      ...emptyOverrides(),
      hidden: { 'note-revenue': true },
      titleOverrides: { 'note-basis': 'Custom Basis' },
    };
    saveOverrides(WS, o);
    const loaded = loadOverrides(WS);
    expect(loaded.hidden['note-revenue']).toBe(true);
    expect(resolvedTitle(loaded, 'note-basis', 'Basis')).toBe('Custom Basis');
    expect(loadOverrides('other-ws').hidden['note-revenue']).toBeUndefined();
  });
});

describe('Phase A — Workspace PDF + Preview≡PDF consistency', () => {
  it('generates a valid PDF header for the baseline document', () => {
    const pdf = generateWorkspaceAfsPdf(baselineModel(), emptyOverrides());
    expect(pdf.startsWith('%PDF')).toBe(true);
    const bytes = workspacePdfToBytes(pdf);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
  });

  it('Preview bytes are identical to Download bytes (same builder pipeline)', () => {
    const model = baselineModel();
    const overrides = emptyOverrides();
    const { previewBytes, downloadBytes, pdfString } = previewAndDownloadBytes(model, overrides);
    expect(previewBytes).toEqual(downloadBytes);
    expect(workspacePdfToBytes(pdfString)).toEqual(previewBytes);
  });

  it('Preview≡PDF remains identical after hide + title override mutations', () => {
    const overrides: DocOverrides = {
      ...emptyOverrides(),
      hidden: { 'note-revenue': true, financial_performance: false },
      titleOverrides: {
        financial_position: 'Statement of Financial Position (Custom)',
        'note-basis': 'Basis of Preparation',
      },
    };
    const a = previewAndDownloadBytes(baselineModel(), overrides);
    const b = previewAndDownloadBytes(baselineModel(), overrides);
    expect(a.previewBytes).toEqual(a.downloadBytes);
    expect(a.previewBytes).toEqual(b.previewBytes);
  });

  it('hidden notes disappear from rendered PDF text and remaining notes renumber', () => {
    const overrides: DocOverrides = {
      ...emptyOverrides(),
      hidden: { 'note-revenue': true },
    };
    const { previewBytes } = previewAndDownloadBytes(baselineModel(), overrides);
    const text = decodePdfText(previewBytes);
    expect(text).toMatch(/Note 1\./);
    expect(text).toMatch(/Basis of preparation/);
    // Hidden disclosure note body must not appear as a numbered note.
    expect(text).not.toMatch(/Note \d+\.\s*Revenue/i);
    // V15.0: Accounting Policies remain as Phase 3 (not a numbered disclosure note).
    expect(text).toMatch(/Significant Accounting Policies/i);
    expect(text).not.toMatch(/Note \d+\.\s*Significant accounting policies/i);
  });

  it('workspace PDF contains cover entity and primary statement titles', () => {
    const { previewBytes } = previewAndDownloadBytes(baselineModel(), emptyOverrides());
    const text = decodePdfText(previewBytes);
    expect(text).toMatch(/Baseline Entity/);
    expect(text).toMatch(/Statement of Financial Position/i);
    expect(text).toMatch(/Contents/i);
    expect(text).toMatch(/Note 1/);
  });

  it('workspace PDF layout checks pass for baseline content', () => {
    const { previewBytes } = previewAndDownloadBytes(baselineModel(), emptyOverrides());
    const text = decodePdfText(previewBytes);
    const layout = validateProfessionalLayout(text);
    expect(layout.checks.hasCoverEntity).toBe(true);
    expect(layout.checks.hasContents).toBe(true);
    expect(layout.checks.hasSfpTitle).toBe(true);
    expect(layout.checks.hasPlTitle).toBe(true);
    expect(layout.checks.hasEquityTitle).toBe(true);
    expect(layout.checks.hasCfTitle).toBe(true);
    expect(layout.checks.noDiscCodes).toBe(true);
    expect(layout.checks.noFingerprint).toBe(true);
    expect(layout.checks.noDebugMarkers).toBe(true);
  });
});

describe('Phase A — Existing validation baseline (advisory)', () => {
  it('articulation validation passes for balanced baseline statements', () => {
    const model = baselineModel();
    const result = validateAfsArticulation({
      statements: model.statements.map((s) => ({
        statement_type: s.statement_type,
        lines: s.lines,
      })),
    });
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.id === 'SFP.BALANCE')?.pass).toBe(true);
    expect(result.checks.find((c) => c.id === 'PL.RESULT')?.pass).toBe(true);
    expect(result.checks.find((c) => c.id === 'PL.EQUITY')?.pass).toBe(true);
    expect(result.checks.find((c) => c.id === 'CF.RECONCILE')?.pass).toBe(true);
  });

  it('articulation validation reports failure without blocking PDF generation', () => {
    const model = baselineModel({
      statements: baselineModel().statements.map((s) =>
        s.statement_type === 'financial_position'
          ? {
              ...s,
              lines: s.lines.map((l) =>
                l.line_code === 'sfp.total_assets' ? { ...l, amount: 1 } : l,
              ),
            }
          : s,
      ),
    });
    const result = validateAfsArticulation({
      statements: model.statements.map((s) => ({
        statement_type: s.statement_type,
        lines: s.lines,
      })),
    });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.id === 'SFP.BALANCE')?.pass).toBe(false);
    // Validation never blocks rendering — PDF still generates.
    const pdf = generateWorkspaceAfsPdf(model, emptyOverrides());
    expect(pdf.startsWith('%PDF')).toBe(true);
  });
});
