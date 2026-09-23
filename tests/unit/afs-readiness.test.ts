/**
 * Readiness judges the statements, not the paperwork.
 *
 * The rules these pin are the ones an accountant would refuse to sign without:
 * the balance sheet balances, the result agrees between statements, every
 * account reaches a heading, and anything only a person can supply is named.
 */
import { describe, it, expect } from 'vitest';
import { assessReadiness } from '../../src/lib/financialStatements/readiness';
import type { DocumentModel } from '../../src/lib/financialStatements/document/documentModel';
import type { EfsStatementLine } from '../../src/lib/financialStatements/api';

function line(partial: Partial<EfsStatementLine> & { line_code: string }): EfsStatementLine {
  return {
    label: partial.line_code,
    section: 'body',
    amount: 0,
    ...partial,
  } as EfsStatementLine;
}

function model(overrides: Partial<DocumentModel> = {}): DocumentModel {
  const base: DocumentModel = {
    companyId: 'c1',
    companyName: 'Test Co (Pty) Ltd',
    workspaceId: 'w1',
    workspaceName: 'FY2026 Financial Statements',
    frameworkPackId: 'p1',
    frameworkKey: 'IFRS_SME',
    frameworkLabel: 'IFRS for SMEs',
    entity: null,
    period: { label: 'FY2026' },
    statements: [
      {
        id: 'financial_position',
        kind: 'statement',
        statement_type: 'financial_position',
        title: 'Statement of Financial Position',
        populated: true,
        lines: [
          line({ line_code: 'sfp.ppe', amount: 400, prior_amount: 350 }),
          line({ line_code: 'sfp.total_assets', amount: 1000, is_total: true }),
          line({ line_code: 'sfp.equity.current_result', amount: 120 }),
          line({ line_code: 'sfp.total_liabilities_and_equity', amount: 1000, is_grand_total: true }),
        ],
      },
      {
        id: 'financial_performance',
        kind: 'statement',
        statement_type: 'financial_performance',
        title: 'Statement of Financial Performance',
        populated: true,
        lines: [line({ line_code: 'perf.net_result', amount: 120, prior_amount: 90 })],
      },
    ],
    policySets: [],
    notes: [],
    crossReferences: [],
    signatures: [],
    trialBalanceCaptured: true,
    manualFields: [],
    optionalDisclosures: [],
  };
  return { ...base, ...overrides };
}

describe('AFS readiness', () => {
  it('reports ready when the statements hang together', () => {
    const r = assessReadiness(model());
    expect(r.state).toBe('ready');
    expect(r.issues).toHaveLength(0);
  });

  it('blocks when the statement of financial position does not balance', () => {
    const m = model();
    m.statements[0].lines = m.statements[0].lines.map((l) =>
      l.line_code === 'sfp.total_liabilities_and_equity' ? { ...l, amount: 940 } : l,
    );
    const r = assessReadiness(m);
    expect(r.state).toBe('blocked');
    const issue = r.issues.find((i) => i.id === 'sfp-imbalance');
    expect(issue).toBeDefined();
    // The preparer needs the size of the hole, not just its existence.
    expect(issue!.detail).toContain('60');
    expect(issue!.location).toEqual({ kind: 'statement', id: 'financial_position' });
  });

  it('blocks when the result differs between the two statements', () => {
    const m = model();
    m.statements[1].lines = [line({ line_code: 'perf.net_result', amount: 95, prior_amount: 90 })];
    const r = assessReadiness(m);
    expect(r.state).toBe('blocked');
    expect(r.issues.some((i) => i.id === 'result-mismatch')).toBe(true);
  });

  it('asks for action when accounts are not classified', () => {
    const m = model();
    m.statements[0].lines.splice(1, 0, line({ line_code: 'sfp.unclassified', amount: 75, is_reconciling: true }));
    const r = assessReadiness(m);
    expect(r.state).toBe('action_required');
    const issue = r.issues.find((i) => i.id.startsWith('unclassified-'));
    expect(issue!.detail).toContain('75');
  });

  const commitmentsNote = {
    id: 'n1',
    kind: 'note' as const,
    disclosure_code: 'DISC.COMMITMENTS',
    title: 'Commitments',
    status: 'draft',
    requirement_level: 'required',
    sort_order: 10,
    sections: [],
    paragraphs: [{ id: 'p1', paragraph_code: 'P1', body: 'text', sort_order: 1 }],
    tables: [],
  };

  it('gathers figures that genuinely call for judgement into one item', () => {
    const m = model({
      notes: [commitmentsNote],
      manualFields: [
        {
          noteCode: 'DISC.COMMITMENTS',
          tableTitle: 'Commitments',
          label: 'Capital commitments',
          reason: 'No automatic fact source; requires manual completion.',
        },
      ],
    });
    const r = assessReadiness(m);
    expect(r.state).toBe('action_required');
    const issue = r.issues.find((i) => i.id === 'disclosure-input');
    expect(issue!.detail).toContain('Commitments');
    expect(issue!.location).toEqual({ kind: 'note', id: 'n1' });
  });

  it('calls out a line that should have come from the ledger and did not', () => {
    const m = model({
      notes: [commitmentsNote],
      manualFields: [
        {
          noteCode: 'DISC.COMMITMENTS',
          tableTitle: 'Commitments',
          label: 'Total inventories',
          reason: "No financial fact mapped to 'sfp.inventories'.",
        },
      ],
    });
    const r = assessReadiness(m);
    // A line that expected a ledger figure and got none is a different problem
    // from a disclosure that always needed judgement, so it is reported apart.
    const issue = r.issues.find((i) => i.id === 'unmapped-lines');
    expect(issue).toBeDefined();
    expect(issue!.detail).toContain('Total inventories');
    // It must not assert a mapping defect it cannot tell from a nil balance.
    expect(issue!.detail).toContain('Either the company has none');
    expect(r.issues.some((i) => i.id === 'disclosure-input')).toBe(false);
  });

  it('warns, rather than blocks, when there are no comparatives', () => {
    const m = model();
    for (const s of m.statements) s.lines = s.lines.map((l) => ({ ...l, prior_amount: null }));
    const r = assessReadiness(m);
    expect(r.state).toBe('warning');
    expect(r.issues.some((i) => i.id === 'no-comparatives')).toBe(true);
  });

  it('blocks before anything has been built', () => {
    const m = model();
    for (const s of m.statements) s.populated = false;
    const r = assessReadiness(m);
    expect(r.state).toBe('blocked');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].id).toBe('no-statements');
  });

  it('puts the worst finding first', () => {
    const m = model();
    m.statements[0].lines = m.statements[0].lines.map((l) =>
      l.line_code === 'sfp.total_liabilities_and_equity' ? { ...l, amount: 940 } : l,
    );
    for (const s of m.statements) s.lines = s.lines.map((l) => ({ ...l, prior_amount: null }));
    const r = assessReadiness(m);
    expect(r.issues[0].state).toBe('blocked');
    expect(r.counts.blocked).toBeGreaterThan(0);
    expect(r.counts.warning).toBeGreaterThan(0);
  });

  it('does not chase an optional note for being empty', () => {
    const m = model({
      notes: [
        {
          id: 'n2',
          kind: 'note',
          disclosure_code: 'DISC.EVENTS',
          title: 'Events after the reporting period',
          status: 'draft',
          requirement_level: 'optional',
          sort_order: 20,
          sections: [],
          paragraphs: [],
          tables: [],
        },
      ],
    });
    expect(assessReadiness(m).issues.some((i) => i.id === 'blank-notes')).toBe(false);
  });
});
