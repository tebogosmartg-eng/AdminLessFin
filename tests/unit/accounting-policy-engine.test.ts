import { describe, expect, it } from 'vitest';
import { evaluateAccountingPolicies, type PolicyDefinitionInput } from '../../src/governance/domains/accountingPolicyEngine/evaluate';

const systemPolicies: PolicyDefinitionInput[] = [
  {
    code: 'coa.header_no_posting',
    name: 'Header accounts cannot receive postings',
    domain: 'chart_of_accounts',
    defaultSeverity: 'blocking',
    isMandatory: true,
    enabled: true,
    evaluationHook: 'header_no_posting',
  },
  {
    code: 'gl.control_no_manual',
    name: 'Control accounts cannot accept manual journals',
    domain: 'general_ledger',
    defaultSeverity: 'blocking',
    isMandatory: true,
    enabled: true,
    evaluationHook: 'control_no_manual',
  },
  {
    code: 'gl.retained_earnings_system',
    name: 'Retained earnings is system controlled',
    domain: 'general_ledger',
    defaultSeverity: 'blocking',
    isMandatory: true,
    enabled: true,
    evaluationHook: 'retained_earnings_system',
  },
  {
    code: 'tax.vat_control_no_manual',
    name: 'VAT control cannot be manually adjusted',
    domain: 'tax',
    defaultSeverity: 'blocking',
    isMandatory: true,
    enabled: true,
    evaluationHook: 'vat_control_no_manual',
  },
  {
    code: 'assets.depreciation_module_only',
    name: 'Depreciation journals originate only from Asset module',
    domain: 'assets',
    defaultSeverity: 'blocking',
    isMandatory: true,
    enabled: true,
    evaluationHook: 'depreciation_module_only',
  },
  {
    code: 'inventory.inventory_module_only',
    name: 'Inventory journals originate only from Inventory module',
    domain: 'inventory',
    defaultSeverity: 'blocking',
    isMandatory: true,
    enabled: true,
    evaluationHook: 'inventory_module_only',
  },
  {
    code: 'journal.manual_requires_description',
    name: 'Manual journals require a description',
    domain: 'journal_entries',
    defaultSeverity: 'warning',
    isMandatory: false,
    enabled: true,
    evaluationHook: 'manual_requires_description',
  },
];

const accounts = [
  { id: 'hdr', name: 'Assets Header', posting_blocked: true },
  { id: 'ctrl', name: 'Trade Debtors', control_account: true, allow_manual_posting: false },
  { id: 're', name: 'Retained Earnings', system_account: true, account_code: '3020', account_role: 'retained_earnings' },
  { id: 'vat', name: 'VAT Control', tax_treatment: 'vat_control', account_role: 'vat_control' },
  { id: 'dep', name: 'Depreciation Expense', account_role: 'depreciation_expense' },
  { id: 'inv', name: 'Inventory Asset', account_role: 'inventory_asset' },
  { id: 'exp', name: 'Office Expense' },
  { id: 'bank', name: 'Bank Current Account', account_role: 'bank', subcategory: 'Cash and Cash Equivalents' },
];

describe('Accounting Policy Engine', () => {
  it('passes compliant manual journal', () => {
    const result = evaluateAccountingPolicies(
      systemPolicies,
      accounts,
      [{ id: 'ba1', chart_of_account_id: 'bank' }],
      {
        module: 'manual_journal',
        description: 'Accrual adjustment',
        lines: [
          { account_id: 'exp', debit: 100 },
          { account_id: 'bank', credit: 100 },
        ],
      },
    );
    expect(result.blocking).toBe(false);
    expect(result.violations).toHaveLength(0);
    expect(result.passed.length).toBeGreaterThan(0);
  });

  it('blocks header account posting', () => {
    const result = evaluateAccountingPolicies(
      systemPolicies,
      accounts,
      [],
      {
        module: 'manual_journal',
        description: 'Bad post',
        lines: [{ account_id: 'hdr', debit: 100 }],
      },
    );
    expect(result.blocking).toBe(true);
    expect(result.violations.some((v) => v.code === 'coa.header_no_posting')).toBe(true);
  });

  it('blocks manual journal to control account', () => {
    const result = evaluateAccountingPolicies(
      systemPolicies,
      accounts,
      [],
      {
        module: 'manual_journal',
        description: 'Control breach',
        lines: [{ account_id: 'ctrl', debit: 100 }],
      },
    );
    expect(result.violations.some((v) => v.code === 'gl.control_no_manual')).toBe(true);
  });

  it('blocks manual journal to retained earnings', () => {
    const result = evaluateAccountingPolicies(
      systemPolicies,
      accounts,
      [],
      {
        module: 'manual_journal',
        description: 'RE breach',
        lines: [{ account_id: 're', credit: 100 }],
      },
    );
    expect(result.violations.some((v) => v.code === 'gl.retained_earnings_system')).toBe(true);
  });

  it('blocks manual VAT control adjustment', () => {
    const result = evaluateAccountingPolicies(
      systemPolicies,
      accounts,
      [],
      {
        module: 'manual_journal',
        description: 'VAT breach',
        lines: [{ account_id: 'vat', debit: 50 }],
      },
    );
    expect(result.violations.some((v) => v.code === 'tax.vat_control_no_manual')).toBe(true);
  });

  it('blocks depreciation posting outside fixed assets module', () => {
    const result = evaluateAccountingPolicies(
      systemPolicies,
      accounts,
      [],
      {
        module: 'manual_journal',
        description: 'Depreciation',
        lines: [{ account_id: 'dep', debit: 200 }],
      },
    );
    expect(result.violations.some((v) => v.code === 'assets.depreciation_module_only')).toBe(true);
  });

  it('allows depreciation from fixed assets module', () => {
    const result = evaluateAccountingPolicies(
      systemPolicies,
      accounts,
      [],
      {
        module: 'fixed_assets',
        description: 'Monthly depreciation run',
        lines: [{ account_id: 'dep', debit: 200 }],
      },
    );
    expect(result.violations.some((v) => v.code === 'assets.depreciation_module_only')).toBe(false);
  });

  it('blocks inventory posting outside inventory module', () => {
    const result = evaluateAccountingPolicies(
      systemPolicies,
      accounts,
      [],
      {
        module: 'manual_journal',
        description: 'Stock adjust',
        lines: [{ account_id: 'inv', debit: 300 }],
      },
    );
    expect(result.violations.some((v) => v.code === 'inventory.inventory_module_only')).toBe(true);
  });

  it('warns when manual journal lacks description', () => {
    const result = evaluateAccountingPolicies(
      systemPolicies,
      accounts,
      [{ id: 'ba1', chart_of_account_id: 'bank' }],
      {
        module: 'manual_journal',
        lines: [
          { account_id: 'exp', debit: 100 },
          { account_id: 'bank', credit: 100 },
        ],
      },
    );
    expect(result.warnings.some((w) => w.code === 'journal.manual_requires_description')).toBe(true);
    expect(result.blocking).toBe(false);
  });

  it('allows override of non-mandatory error/warning policies', () => {
    const policies: PolicyDefinitionInput[] = [{
      code: 'journal.manual_requires_description',
      name: 'Manual journals require a description',
      domain: 'journal_entries',
      defaultSeverity: 'error',
      isMandatory: false,
      enabled: true,
      evaluationHook: 'manual_requires_description',
    }];

    const result = evaluateAccountingPolicies(
      policies,
      accounts,
      [{ id: 'ba1', chart_of_account_id: 'bank' }],
      {
        module: 'manual_journal',
        lines: [{ account_id: 'exp', debit: 100 }],
        overrideReason: 'Emergency month-end close',
        overrideCodes: ['journal.manual_requires_description'],
      },
    );
    expect(result.blocking).toBe(false);
    expect(result.passed.some((p) => p.overridden)).toBe(true);
  });
});
