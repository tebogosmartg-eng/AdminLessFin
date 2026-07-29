import { describe, expect, it } from 'vitest';
import { evaluateAccountingHealth } from '../../src/governance/domains/accountingHealth/evaluate';

const healthyChart = [
  {
    id: 'a1',
    name: 'Accounts Receivable (Trade Debtors)',
    type: 'Asset',
    account_number: 1220,
    account_code: '1220',
    account_role: 'trade_receivable',
    control_account: true,
    allow_manual_posting: false,
    is_active: true,
    financial_statement: 'Statement of Financial Position',
    normal_balance: 'debit',
  },
  {
    id: 'a2',
    name: 'Accounts Payable (Trade Creditors)',
    type: 'Liability',
    account_number: 2110,
    account_code: '2110',
    account_role: 'trade_payable',
    control_account: true,
    allow_manual_posting: false,
    is_active: true,
    financial_statement: 'Statement of Financial Position',
    normal_balance: 'credit',
  },
  {
    id: 'a3',
    name: 'VAT Control',
    type: 'Liability',
    account_number: 2125,
    account_code: '2125',
    account_role: 'vat_control',
    control_account: true,
    allow_manual_posting: false,
    tax_treatment: 'vat_control',
    is_active: true,
    financial_statement: 'Statement of Financial Position',
    normal_balance: 'credit',
  },
  {
    id: 'a4',
    name: 'VAT Output (Payable)',
    type: 'Liability',
    account_number: 2120,
    account_code: '2120',
    account_role: 'output_vat',
    tax_treatment: 'vat_output',
    is_active: true,
    financial_statement: 'Statement of Financial Position',
    normal_balance: 'credit',
  },
  {
    id: 'a5',
    name: 'VAT Input (Receivable)',
    type: 'Asset',
    account_number: 1240,
    account_code: '1240',
    account_role: 'input_vat',
    tax_treatment: 'vat_input',
    is_active: true,
    financial_statement: 'Statement of Financial Position',
    normal_balance: 'debit',
  },
  {
    id: 'a6',
    name: 'Bank - Current Account',
    type: 'Asset',
    account_number: 1260,
    account_code: '1260',
    account_role: 'bank',
    subcategory: 'Cash and Cash Equivalents',
    is_active: true,
    financial_statement: 'Statement of Financial Position',
    normal_balance: 'debit',
  },
  {
    id: 'a7',
    name: 'Retained Earnings',
    type: 'Equity',
    account_number: 3020,
    account_code: '3020',
    account_role: 'retained_earnings',
    system_account: true,
    is_active: true,
    financial_statement: 'Statement of Financial Position',
    normal_balance: 'credit',
  },
  {
    id: 'a8',
    name: 'Sales - Goods',
    type: 'Income',
    account_number: 4010,
    account_code: '4010',
    account_role: 'sales',
    is_active: true,
    financial_statement: 'Profit or Loss',
    normal_balance: 'credit',
  },
  {
    id: 'a9',
    name: 'Accounting Fees',
    type: 'Expense',
    account_number: 6010,
    account_code: '6010',
    is_active: true,
    financial_statement: 'Profit or Loss',
    normal_balance: 'debit',
  },
  {
    id: 'a10',
    name: 'Opening Balance Equity',
    type: 'Equity',
    account_number: 3090,
    account_code: '3090',
    is_active: true,
    financial_statement: 'Statement of Financial Position',
    normal_balance: 'credit',
  },
];

describe('Accounting Health Engine (Phase 2)', () => {
  it('scores a well-formed chart as Healthy', () => {
    const report = evaluateAccountingHealth({
      accounts: healthyChart,
      bankAccounts: [{ id: 'b1', name: 'Main', is_default: true, chart_of_account_id: 'a6' }],
      postedAccountIds: ['a1', 'a6', 'a8'],
      flags: {},
      now: '2026-07-27T00:00:00.000Z',
    });

    expect(report.overallScore).toBeGreaterThanOrEqual(90);
    expect(report.status).toBe('Healthy');
    expect(report.domains.chart_of_accounts.percent).toBeGreaterThanOrEqual(90);
  });

  it('detects duplicate account codes as critical COA findings', () => {
    const report = evaluateAccountingHealth({
      accounts: [
        ...healthyChart,
        {
          id: 'dup',
          name: 'Dup Bank',
          type: 'Asset',
          account_number: 9999,
          account_code: '1260',
          is_active: true,
          financial_statement: 'Statement of Financial Position',
        },
      ],
      bankAccounts: [],
      postedAccountIds: [],
      flags: {},
    });

    expect(
      report.domains.chart_of_accounts.findings.some((f) => f.code === 'DUPLICATE_ACCOUNT_CODE'),
    ).toBe(true);
    expect(report.findingCount.critical).toBeGreaterThan(0);
  });

  it('detects missing parent and posting to header accounts', () => {
    const report = evaluateAccountingHealth({
      accounts: [
        {
          id: 'h1',
          name: 'Current Assets',
          type: 'Asset',
          account_number: 1200,
          posting_blocked: true,
          is_active: true,
          financial_statement: 'Statement of Financial Position',
        },
        {
          id: 'c1',
          name: 'Orphan Detail',
          type: 'Asset',
          account_number: 1211,
          parent_account_id: 'missing-parent',
          is_active: true,
          financial_statement: 'Statement of Financial Position',
        },
      ],
      bankAccounts: [],
      postedAccountIds: ['h1'],
      flags: {},
    });

    expect(
      report.domains.chart_of_accounts.findings.some((f) => f.code === 'MISSING_PARENT'),
    ).toBe(true);
    expect(
      report.domains.chart_of_accounts.findings.some((f) => f.code === 'POSTING_TO_HEADER'),
    ).toBe(true);
  });

  it('flags multiple default banks and unlinked bank GL', () => {
    const report = evaluateAccountingHealth({
      accounts: healthyChart,
      bankAccounts: [
        { id: 'b1', name: 'A', is_default: true, chart_of_account_id: 'a6' },
        { id: 'b2', name: 'B', is_default: true, chart_of_account_id: null },
      ],
      postedAccountIds: [],
      flags: {},
    });

    expect(
      report.domains.banking.findings.some((f) => f.code === 'MULTIPLE_DEFAULT_BANKS'),
    ).toBe(true);
    expect(
      report.domains.banking.findings.some((f) => f.code === 'UNLINKED_BANK_GL'),
    ).toBe(true);
  });

  it('checks payroll and assets only when enabled', () => {
    const off = evaluateAccountingHealth({
      accounts: healthyChart,
      bankAccounts: [],
      postedAccountIds: [],
      flags: {},
    });
    expect(off.domains.payroll.applicable).toBe(false);
    expect(off.domains.assets.applicable).toBe(false);

    const on = evaluateAccountingHealth({
      accounts: healthyChart,
      bankAccounts: [],
      postedAccountIds: [],
      flags: { payroll_enabled: true, fixed_assets_enabled: true },
    });
    expect(on.domains.payroll.applicable).toBe(true);
    expect(on.domains.assets.applicable).toBe(true);
    expect(
      on.domains.payroll.findings.some((f) => f.code === 'MISSING_PAYROLL_CLEARING'),
    ).toBe(true);
  });

  it('detects non-empty suspense as critical double-entry issue', () => {
    const report = evaluateAccountingHealth({
      accounts: [
        ...healthyChart,
        {
          id: 's1',
          name: 'Suspense',
          type: 'Asset',
          account_number: 1299,
          account_role: 'suspense',
          is_active: true,
          balance: 250,
          financial_statement: 'Statement of Financial Position',
        },
      ],
      bankAccounts: [],
      postedAccountIds: [],
      flags: {},
    });

    expect(
      report.domains.double_entry.findings.some((f) => f.code === 'SUSPENSE_NOT_EMPTY'),
    ).toBe(true);
  });

  it('never blocks — always returns advisory report structure', () => {
    const report = evaluateAccountingHealth({
      accounts: [],
      bankAccounts: [],
      postedAccountIds: [],
      flags: {},
    });
    expect(report.status).toBe('Not Assessed');
    expect(report.recommendations).toBeDefined();
    expect(typeof report.overallScore).toBe('number');
  });
});
