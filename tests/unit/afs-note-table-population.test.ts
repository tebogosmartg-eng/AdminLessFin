/**
 * Note tables must take from the ledger whatever the ledger holds.
 *
 * Two faults made generated notes look emptier than the accounting records
 * justified. The statement engine names lines from the chart of accounts
 * ("sfp.inventory") while the framework tables ask for the standards' name
 * ("sfp.inventories"), so the figure was there and the note printed "[ — ]".
 * And the fact lookup never carried prior-period amounts at all, so every
 * comparative column was blank regardless.
 */
import { describe, it, expect } from 'vitest';
import {
  buildFactLookup,
  populateFrameworkTable,
  MANUAL_FIELD_TOKEN,
} from '../../src/lib/financialStatements/framework/trialBalanceDisclosureMapping';
import { lineCodeCandidates, resolveFact } from '../../src/lib/financialStatements/framework/lineCodeAliases';
import type { DocStatementNode } from '../../src/lib/financialStatements/document/documentModel';

function statements(): DocStatementNode[] {
  return [
    {
      id: 'financial_position',
      kind: 'statement',
      statement_type: 'financial_position',
      title: 'Statement of Financial Position',
      populated: true,
      lines: [
        // The names the engine actually emits.
        { line_code: 'sfp.inventory', label: 'Inventory', section: 'assets', amount: 250, prior_amount: 190 },
        { line_code: 'sfp.ppe', label: 'PPE', section: 'assets', amount: 400, prior_amount: 350 },
      ],
    } as DocStatementNode,
    {
      id: 'financial_performance',
      kind: 'statement',
      statement_type: 'financial_performance',
      title: 'Statement of Financial Performance',
      populated: true,
      lines: [
        { line_code: 'perf.revenue', label: 'Revenue', section: 'income', amount: 1000, prior_amount: 800 },
      ],
    } as DocStatementNode,
  ];
}

describe('line code aliases', () => {
  it('offers the engine name for a framework name', () => {
    expect(lineCodeCandidates('sfp.inventories')).toContain('sfp.inventory');
    expect(lineCodeCandidates('perf.total_revenue')).toContain('perf.revenue');
  });

  it('carries an alias through to the prior-period code', () => {
    expect(lineCodeCandidates('perf.total_revenue.prior')).toContain('perf.revenue.prior');
  });

  it('leaves an unknown code alone', () => {
    expect(lineCodeCandidates('sfp.something_new')).toEqual(['sfp.something_new']);
  });
});

describe('fact lookup', () => {
  it('carries prior-period amounts under a .prior code', () => {
    const facts = buildFactLookup(statements());
    expect(facts.get('sfp.ppe.prior')).toBe(350);
    expect(facts.get('perf.revenue.prior')).toBe(800);
  });

  it('resolves a framework name onto the engine figure', () => {
    const facts = buildFactLookup(statements());
    expect(resolveFact(facts, 'sfp.inventories')).toMatchObject({ found: true, amount: 250 });
    expect(resolveFact(facts, 'perf.total_revenue.prior')).toMatchObject({ found: true, amount: 800 });
  });
});

describe('populating a framework table', () => {
  const table = {
    title: 'Inventories',
    columns: ['', '2026', '2025'],
    factMappings: [
      { label: 'Total inventories', line_code: 'sfp.inventories', comparative_line_code: 'sfp.inventories.prior' },
    ],
    manualRows: ['Raw materials', 'Work in progress'],
  };

  it('fills both the current and the comparative column from the ledger', () => {
    const facts = buildFactLookup(statements());
    const { table: filled, manualFields } = populateFrameworkTable('DISC.INVENTORIES', table, facts, 't1');
    const rows = filled.rows_json as string[][];

    const total = rows.find((r) => r[0] === 'Total inventories')!;
    expect(total[1]).not.toBe(MANUAL_FIELD_TOKEN);
    expect(total[1]).toContain('250');
    expect(total[2]).toContain('190');

    // A figure that came from the ledger is not reported as needing input.
    expect(manualFields.some((f) => f.label === 'Total inventories')).toBe(false);
  });

  it('still marks the rows that genuinely need judgement', () => {
    const facts = buildFactLookup(statements());
    const { manualFields } = populateFrameworkTable('DISC.INVENTORIES', table, facts, 't1');
    expect(manualFields.map((f) => f.label)).toEqual(['Raw materials', 'Work in progress']);
    for (const f of manualFields) {
      expect(f.reason).toMatch(/requires manual completion/);
    }
  });

  it('reports an unmapped fact distinctly from a judgement row', () => {
    const facts = buildFactLookup([]);
    const { manualFields } = populateFrameworkTable('DISC.INVENTORIES', table, facts, 't1');
    const unmapped = manualFields.find((f) => f.label === 'Total inventories');
    expect(unmapped!.reason).toMatch(/^No financial fact mapped/);
  });
});
