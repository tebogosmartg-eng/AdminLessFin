import { describe, expect, it } from 'vitest';
import {
  parseCsvTrialBalance,
  matchMappingRule,
  validateCanonicalLines,
  projectCanonicalTbToFactDataset,
  applySignRule,
  normalizeAccountType,
  buildDocumentComposerProvenance,
  FRP_TRACE_CHAIN,
  DEFAULT_TYPE_TAXONOMY,
  inferCanonicalClosingBalance,
  normalizeAccountLabel,
  type CanonicalTbLineInput,
} from '../../src/lib/financialStatements/frp/canonicalTrialBalance';

describe('FRP V7.0.0 Canonical Trial Balance', () => {
  it('parses CSV Trial Balance with debit/credit columns', () => {
    const csv = [
      'account_code,account_name,account_type,debit,credit',
      '1000,Bank,Asset,50000,0',
      '2000,Payables,Liability,0,12000',
      '4000,Sales,Income,0,38000',
    ].join('\n');
    const rows = parseCsvTrialBalance(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0].source_account_code).toBe('1000');
    expect(rows[0].debit).toBe(50000);
    expect(rows[1].credit).toBe(12000);
    expect(normalizeAccountType(rows[2].source_account_type)).toBe('Income');
  });

  it('applies mapping rules by account type and pattern', () => {
    const line = {
      source_account_code: '1100',
      source_account_name: 'Petty Cash',
      source_account_type: 'Asset',
    };
    const rules = [
      {
        match_kind: 'pattern',
        match_value: '^11',
        taxonomy_line_code: 'sfp.assets',
        canonical_account_type: 'Asset',
        priority: 10,
        active: true,
      },
      {
        match_kind: 'account_type',
        match_value: 'Asset',
        taxonomy_line_code: 'sfp.assets',
        priority: 100,
        active: true,
      },
    ];
    const hit = matchMappingRule(line, rules);
    expect(hit?.match_kind).toBe('pattern');
    expect(hit?.taxonomy_line_code).toBe('sfp.assets');
  });

  it('applies sign rules without inventing balances', () => {
    expect(applySignRule(100, 'invert').amount).toBe(-100);
    expect(applySignRule(-50, 'debit_positive').amount).toBe(50);
    expect(applySignRule(80, 'as_is').amount).toBe(80);
  });

  it('validates Canonical TB lines and projects to Fact Snapshot dataset', () => {
    const lines: CanonicalTbLineInput[] = [
      {
        line_key: 'a1',
        account_name: 'Bank',
        account_type: 'Asset',
        taxonomy_line_code: DEFAULT_TYPE_TAXONOMY.Asset,
        opening_balance: 0,
        closing_balance: 100,
        period_activity: 100,
        debit: 100,
        credit: 0,
      },
      {
        line_key: 'l1',
        account_name: 'Payables',
        account_type: 'Liability',
        taxonomy_line_code: DEFAULT_TYPE_TAXONOMY.Liability,
        opening_balance: 0,
        closing_balance: 40,
        period_activity: 40,
        debit: 0,
        credit: 40,
      },
      {
        line_key: 'e1',
        account_name: 'Capital',
        account_type: 'Equity',
        taxonomy_line_code: DEFAULT_TYPE_TAXONOMY.Equity,
        opening_balance: 0,
        closing_balance: 60,
        period_activity: 60,
        debit: 0,
        credit: 60,
      },
    ];
    const validation = validateCanonicalLines(lines);
    expect(validation.ok).toBe(true);

    const dataset = projectCanonicalTbToFactDataset({
      company_id: 'co-1',
      canonical_tb: {
        id: 'ctb-1',
        period_start: '2025-04-01',
        period_end: '2026-03-31',
        prior_as_of: '2025-03-31',
        source_kind: 'imported_tb',
        content_hash: 'abc',
      },
      lines,
    });
    expect(dataset.schema_version).toBe('7.0.0-canonical-tb');
    expect(dataset.balances_as_of.accounts).toHaveLength(3);
    expect(dataset.canonical_trial_balance?.id).toBe('ctb-1');
    expect(dataset.period_activity[0].period_activity).toBe(100);
  });

  it('exposes full audit trace for Document Composer', () => {
    const prov = buildDocumentComposerProvenance({
      canonical_tb_id: 'ctb-1',
      fact_snapshot_id: 'fs-1',
      snapshot_version_id: 'sv-1',
      source_kind: 'native_gl',
    });
    expect(prov.trace).toEqual([...FRP_TRACE_CHAIN]);
    expect(prov.composer).toBe('efs_document_composer');
  });

  it('rejects empty Canonical Trial Balance', () => {
    const validation = validateCanonicalLines([]);
    expect(validation.ok).toBe(false);
    expect(validation.issues[0].code).toBe('CTB_EMPTY');
  });

  it('hard-rejects Canonical TB when debits do not equal credits', () => {
    const lines: CanonicalTbLineInput[] = [
      {
        line_key: 'a1',
        account_name: 'Bank',
        account_type: 'Asset',
        taxonomy_line_code: DEFAULT_TYPE_TAXONOMY.Asset,
        opening_balance: 0,
        closing_balance: 100,
        period_activity: 100,
        debit: 100,
        credit: 0,
      },
      {
        line_key: 'l1',
        account_name: 'Payables',
        account_type: 'Liability',
        taxonomy_line_code: DEFAULT_TYPE_TAXONOMY.Liability,
        opening_balance: 0,
        closing_balance: 40,
        period_activity: 40,
        debit: 0,
        credit: 40,
      },
    ];
    const validation = validateCanonicalLines(lines);
    expect(validation.ok).toBe(false);
    expect(validation.issues.some((i) => i.code === 'CTB_DR_CR_IMBALANCE' && i.severity === 'error')).toBe(
      true,
    );
  });

  it('derives credit-normal closing balances as credit − debit (AdminLess convention)', () => {
    expect(
      inferCanonicalClosingBalance({ debit: 0, credit: 323.45, source_account_name: 'zuru' }, 'Income'),
    ).toBe(323.45);
    expect(
      inferCanonicalClosingBalance({ debit: 0, credit: 3111, source_account_name: 'AP' }, 'Liability'),
    ).toBe(3111);
    expect(
      inferCanonicalClosingBalance({ debit: 0, credit: 500, source_account_name: 'Capital' }, 'Equity'),
    ).toBe(500);
    expect(
      inferCanonicalClosingBalance({ debit: 100, credit: 0, source_account_name: 'Bank' }, 'Asset'),
    ).toBe(100);
  });

  it('normalizes account labels by collapsing whitespace', () => {
    expect(normalizeAccountLabel('Secretarial ')).toBe('Secretarial');
    expect(normalizeAccountLabel('  Fuel\t')).toBe('Fuel');
  });

  it('rejects CSV Trial Balance with duplicate account codes', () => {
    const csv = [
      'account_code,account_name,account_type,debit,credit',
      '1000,Bank,Asset,50,0',
      '1000,Bank Duplicate,Asset,10,0',
      '2000,Payables,Liability,0,60',
    ].join('\n');
    expect(() => parseCsvTrialBalance(csv)).toThrow(/Duplicate account code "1000"/);
  });
});
