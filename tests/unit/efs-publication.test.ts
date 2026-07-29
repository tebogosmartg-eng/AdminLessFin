import { describe, expect, it } from 'vitest';
import {
  buildCanonicalAmountSignature,
  extractCanonicalTables,
} from '../../src/lib/financialStatements/publication/canonical';
import {
  formatAmount,
  humanFrameworkLabel,
  numberDisclosures,
  professionalStatementTitle,
  validateProfessionalLayout,
  generateProfessionalAfsPdf,
} from '../../src/lib/financialStatements/publication/afsProfessionalPdf';
import { validateAfsArticulation } from '../../src/lib/financialStatements/publication/afsAccountingValidation';

const samplePack = {
  metadata: {
    company_name: 'Spaceman',
    period_label: 'Financial Year 2025/26',
    framework_key: 'IFRS_SME',
    reporting_currency: 'ZAR',
  },
  engagement: {
    company_name: 'Spaceman',
    reporting_period: {
      label: 'Financial Year 2025/26',
      start_date: '2025-04-01',
      end_date: '2026-03-31',
    },
    framework: { framework_key: 'IFRS_SME', name: 'IFRS for SMEs' },
  },
  statements: [
    {
      statement_type: 'financial_position',
      title: 'Statement of Financial Position',
      lines: [
        { line_code: 'sfp.assets', label: 'Assets', section: 'assets', amount: 83300 },
        { line_code: 'sfp.total_assets', label: 'Total Assets', section: 'assets', amount: 83300, is_total: true },
        { line_code: 'sfp.liabilities', label: 'Liabilities', section: 'liabilities', amount: 3111 },
        {
          line_code: 'sfp.total_liabilities',
          label: 'Total Liabilities',
          section: 'liabilities',
          amount: 3111,
          is_total: true,
        },
        { line_code: 'sfp.equity', label: 'Equity', section: 'equity', amount: 0 },
        {
          line_code: 'sfp.current_period_result',
          label: 'Profit / (Loss) for the period',
          section: 'equity',
          amount: 80189,
        },
        { line_code: 'sfp.total_equity', label: 'Total Equity', section: 'equity', amount: 80189, is_total: true },
        {
          line_code: 'sfp.total_liabilities_and_equity',
          label: 'Total Liabilities and Equity',
          section: 'totals',
          amount: 83300,
          is_total: true,
        },
      ],
    },
    {
      statement_type: 'financial_performance',
      title: 'Statement of Financial Performance',
      lines: [
        { line_code: 'perf.revenue', label: 'Revenue', section: 'revenue', amount: 200 },
        { line_code: 'perf.total_revenue', label: 'Total Revenue', section: 'revenue', amount: 200, is_total: true },
        { line_code: 'perf.expenses', label: 'Expenses', section: 'expenses', amount: -79989 },
        {
          line_code: 'perf.total_expenses',
          label: 'Total Expenses',
          section: 'expenses',
          amount: -79989,
          is_total: true,
        },
        {
          line_code: 'perf.result',
          label: 'Profit / (Loss) for the period',
          section: 'result',
          amount: 80189,
          is_total: true,
        },
      ],
    },
    {
      statement_type: 'changes_in_equity',
      lines: [
        { line_code: 'eq.opening', label: 'Opening Equity', amount: 0, is_total: true },
        { line_code: 'eq.period_result', label: 'Profit / (Loss) for the period', amount: 80189 },
        { line_code: 'eq.other_movements', label: 'Total changes in equity', amount: 0 },
        { line_code: 'eq.closing', label: 'Closing Equity', amount: 80189, is_total: true },
      ],
    },
    {
      statement_type: 'cash_flows',
      lines: [
        { line_code: 'cf.operating', label: 'Operating activities', amount: -8450 },
        { line_code: 'cf.investing', label: 'Investing activities', amount: 0 },
        { line_code: 'cf.financing', label: 'Financing activities', amount: -8450 },
        {
          line_code: 'cf.net_change',
          label: 'Net increase / (decrease) in cash',
          amount: -16900,
          is_total: true,
        },
      ],
    },
  ],
  disclosures: [
    { disclosure_code: 'DISC.BASIS', title: 'Basis of preparation', status: 'active' },
    { disclosure_code: 'DISC.POLICIES', title: 'Significant accounting policies', status: 'active' },
    { disclosure_code: 'DISC.REVENUE', title: 'Revenue', status: 'active' },
    { disclosure_code: 'DISC.OLD', title: 'Superseded', status: 'superseded' },
  ],
  working_papers: [{ id: 'wp-1', title: 'Assets WP', status: 'finalized', reference_code: 'WP-001' }],
};

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

describe('EFS Publication canonical pack', () => {
  it('rounds amounts consistently to 2dp in canonical tables', () => {
    const pack = {
      statements: [
        {
          statement_type: 'financial_position',
          lines: [
            {
              line_code: 'sfp.total_assets',
              label: 'Total Assets',
              section: 'assets',
              amount: 1500000.005,
              is_total: true,
            },
          ],
        },
      ],
      disclosures: [{ disclosure_code: 'DISC.POLICIES', title: 'Accounting Policies', status: 'active' }],
    };
    const { tables } = extractCanonicalTables(pack);
    expect(tables[0].rows[0].amount).toBe(1500000.01);
  });

  it('excludes superseded disclosures', () => {
    const { disclosures } = extractCanonicalTables(samplePack);
    expect(disclosures.every((d) => d.disclosure_code !== 'DISC.OLD')).toBe(true);
    expect(disclosures[0].disclosure_code).toBe('DISC.BASIS');
  });

  it('produces stable amount signature across re-extraction', () => {
    const sig1 = buildCanonicalAmountSignature(samplePack);
    const sig2 = buildCanonicalAmountSignature(structuredClone(samplePack));
    expect(sig1).toBe(sig2);
  });
});

describe('V6.10.3 professional AFS presentation', () => {
  it('maps IFRS captions and numbered notes without DISC codes', () => {
    expect(professionalStatementTitle('financial_performance')).toContain('Profit or Loss');
    expect(humanFrameworkLabel(samplePack)).toBe('IFRS for SMEs');
    const notes = numberDisclosures(samplePack.disclosures);
    expect(notes[0].heading).toBe('Note 1. Basis of Preparation');
    expect(notes[1].heading).toBe('Note 2. Significant Accounting Policies');
    expect(notes.every((n) => !/DISC\./i.test(n.heading))).toBe(true);
  });

  it('formats negative amounts in parentheses', () => {
    expect(formatAmount(-16900)).toBe('(16,900.00)');
    expect(formatAmount(83300)).toBe('83,300.00');
  });

  it('generates a professional multi-page PDF without debug markers', () => {
    const pdf = generateProfessionalAfsPdf(samplePack, extractCanonicalTables);
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe('%PDF-');
    const text = decodePdfText(pdf);
    const layout = validateProfessionalLayout(text);
    expect(layout.ok).toBe(true);
    expect(text).toContain('Spaceman');
    expect(text).toContain('Contents');
    expect(text).not.toMatch(/Publication Fingerprint/i);
    expect(text).not.toMatch(/DISC\./i);
    expect(text).not.toMatch(/===\s*Statement/i);
    expect(text).toMatch(/Note 1/);
    expect(text).toMatch(/Page \d+ of \d+/);
  });

  it('passes sealed-pack accounting articulation checks', () => {
    const result = validateAfsArticulation(samplePack);
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.id === 'SFP.BALANCE')?.pass).toBe(true);
    expect(result.checks.find((c) => c.id === 'PL.RESULT')?.pass).toBe(true);
    expect(result.checks.find((c) => c.id === 'CF.RECONCILE')?.pass).toBe(true);
    expect(result.checks.find((c) => c.id === 'PL.EQUITY')?.pass).toBe(true);
  });
});
