import { describe, expect, it } from 'vitest';
import {
  analyseControlAccountMappings,
  buildRecommendedAccount,
} from '../../src/governance/domains/accountingReadiness/controlAccountMapping';
import { evaluateAccountingReadiness } from '../../src/governance/domains/accountingReadiness/validation';
import { requiredControlRoles } from '../../src/governance/domains/accountingReadiness/model';

const named = (
  id: string,
  name: string,
  type: string,
  extras: Record<string, unknown> = {},
) => ({
  id,
  name,
  type,
  is_active: true,
  account_number: Number(id),
  ...extras,
});

describe('Control account mapping analysis', () => {
  it('treats an empty company as having no chart to map', () => {
    const analysis = analyseControlAccountMappings({ accounts: [] });
    expect(analysis.accountCount).toBe(0);
    expect(analysis.mappedCount).toBe(0);
    expect(analysis.mappingsComplete).toBe(false);
  });

  it('auto-recognises unique existing accounts by name without creating duplicates', () => {
    const accounts = [
      named('610', 'Accounts Receivable', 'Asset'),
      named('800', 'Accounts Payable', 'Liability'),
      named('820', 'VAT Control', 'Liability'),
      named('100', 'Bank - Current Account', 'Asset'),
      named('300', 'Retained Earnings', 'Equity'),
      named('200', 'Sales', 'Income'),
      named('500', 'Rent Expense', 'Expense'),
    ];

    const analysis = analyseControlAccountMappings({ accounts });
    const byRole = Object.fromEntries(analysis.rows.map((row) => [row.role, row]));

    expect(analysis.accountCount).toBe(7);
    expect(byRole.trade_debtors.status).toBe('auto');
    expect(byRole.trade_debtors.mappedAccount?.name).toBe('Accounts Receivable');
    expect(byRole.trade_creditors.status).toBe('auto');
    expect(byRole.vat_control.status).toBe('auto');
    expect(byRole.bank.status).toBe('auto');
    expect(byRole.retained_earnings.status).toBe('auto');
    expect(byRole.profit_loss.status).toBe('mapped');
    expect(byRole.inventory).toBeUndefined();
    expect(byRole.payroll_clearing).toBeUndefined();
  });

  it('does not silently guess when two AR-like accounts exist', () => {
    const analysis = analyseControlAccountMappings({
      accounts: [
        named('1200', 'Trade Debtors', 'Asset'),
        named('1210', 'Customer Receivables', 'Asset'),
        named('2110', 'Accounts Payable', 'Liability'),
        named('2125', 'VAT', 'Liability'),
        named('1260', 'Bank', 'Asset'),
        named('3020', 'Accumulated Profit', 'Equity'),
        named('4010', 'Sales', 'Income'),
        named('6010', 'Wages', 'Expense'),
      ],
    });
    const ar = analysis.rows.find((row) => row.role === 'trade_debtors');
    expect(ar?.status).toBe('ambiguous');
    expect(ar?.candidates).toHaveLength(2);
  });

  it('identifies only genuinely missing controls on a partial chart', () => {
    const analysis = analyseControlAccountMappings({
      accounts: [
        named('1', 'Accounts Receivable', 'Asset'),
        named('2', 'Accounts Payable', 'Liability'),
        named('3', 'Bank', 'Asset'),
        named('4', 'Sales', 'Income'),
        named('5', 'Electricity', 'Expense'),
        named('6', 'Share Capital', 'Equity'),
      ],
      flags: { inventoryEnabled: true, payrollEnabled: true },
    });
    const missing = analysis.rows.filter((row) => row.status === 'missing').map((row) => row.role);
    expect(missing).toEqual(expect.arrayContaining(['vat_control', 'retained_earnings', 'inventory', 'payroll_clearing']));
    expect(missing).not.toContain('trade_debtors');
    expect(missing).not.toContain('trade_creditors');
    expect(missing).not.toContain('fixed_assets');
  });

  it('does not require inventory, payroll, or fixed assets when those modules are off', () => {
    expect(requiredControlRoles({})).toEqual([
      'trade_debtors',
      'trade_creditors',
      'vat_control',
      'bank',
      'retained_earnings',
      'profit_loss',
    ]);
    const analysis = analyseControlAccountMappings({
      accounts: [named('1', 'Sales', 'Income')],
      flags: { inventoryEnabled: false, payrollEnabled: false, fixedAssetsEnabled: false },
    });
    expect(analysis.rows.map((row) => row.role)).not.toContain('inventory');
    expect(analysis.rows.map((row) => row.role)).not.toContain('payroll_clearing');
    expect(analysis.rows.map((row) => row.role)).not.toContain('fixed_assets');
  });

  it('adds module control requirements only when the module is enabled', () => {
    const analysis = analyseControlAccountMappings({
      accounts: [named('1', 'Inventory', 'Asset')],
      flags: { inventoryEnabled: true, fixedAssetsEnabled: true, payrollEnabled: true },
    });
    expect(analysis.rows.map((row) => row.role)).toEqual(
      expect.arrayContaining(['inventory', 'fixed_assets', 'payroll_clearing']),
    );
    expect(analysis.rows.find((row) => row.role === 'inventory')?.status).toBe('auto');
    expect(analysis.rows.find((row) => row.role === 'fixed_assets')?.status).toBe('missing');
    expect(analysis.rows.find((row) => row.role === 'payroll_clearing')?.status).toBe('missing');
  });

  it('builds a recommended account without colliding with an existing number', () => {
    const spec = buildRecommendedAccount('trade_debtors', [
      named('1220', 'Something else', 'Asset', { account_number: 1220, account_code: '1220' }),
    ]);
    expect(spec.account_number).not.toBe(1220);
    expect(spec.account_code).not.toBe('1220');
    expect(spec.account_role).toBe('trade_receivable');
    expect(spec.name).toContain('Receivable');
  });
});

describe('Readiness: accounts exist vs control mappings', () => {
  const unmappedExistingCoa = [
    named('610', 'Accounts Receivable', 'Asset', { account_number: 610 }),
    named('800', 'Accounts Payable', 'Liability', { account_number: 800 }),
    named('820', 'VAT Control', 'Liability', { account_number: 820 }),
    named('100', 'Bank', 'Asset', { account_number: 100 }),
    named('300', 'Owner Capital', 'Equity', { account_number: 300 }),
    named('200', 'Sales', 'Income', { account_number: 200 }),
    named('500', 'Expenses', 'Expense', { account_number: 500 }),
    named('110', 'Petty Cash', 'Asset', { account_number: 110 }),
    named('210', 'Loans', 'Liability', { account_number: 210 }),
    named('310', 'Drawings', 'Equity', { account_number: 310 }),
    named('410', 'Other Income', 'Income', { account_number: 410 }),
    named('510', 'Wages', 'Expense', { account_number: 510 }),
    named('520', 'Rent', 'Expense', { account_number: 520 }),
    named('530', 'Telephone', 'Expense', { account_number: 530 }),
    named('540', 'Insurance', 'Expense', { account_number: 540 }),
  ];

  it('detects an existing chart without treating it as mapped or ready', () => {
    const result = evaluateAccountingReadiness({
      flags: {},
      financialYears: [{ status: 'open' }],
      accounts: unmappedExistingCoa,
      taxRates: [{ id: 'tax-1' }],
      bankAccounts: [{ id: 'bank-1', opening_balance: 0, opening_balance_posted: true }],
    });

    expect(result.validation.chartOfAccountsExists).toBe(true);
    expect(result.validation.accountCount).toBe(15);
    expect(result.validation.mappingsComplete).toBe(false);
    expect(result.validation.mandatoryControlAccounts).toBe(false);
    expect(result.accountingReady).toBe(false);
    expect(result.steps.chart_of_accounts.complete).toBe(false);
    expect(result.validation.missingControlAccounts.length).toBeGreaterThan(0);
  });

  it('does not become READY merely because account names look like control accounts', () => {
    const result = evaluateAccountingReadiness({
      flags: { opening_balances_zero_intentional: true, bank_accounts_skipped: true },
      financialYears: [{ status: 'open' }],
      accounts: unmappedExistingCoa,
      taxRates: [{ id: 'tax-1' }],
      bankAccounts: [],
    });
    expect(result.accountingReady).toBe(false);
    expect(result.validation.mappingsComplete).toBe(false);
  });

  it('becomes mapping-complete only after roles are persisted on existing accounts', () => {
    const mapped = unmappedExistingCoa.map((account) => {
      if (account.name === 'Accounts Receivable') return { ...account, account_role: 'trade_receivable' };
      if (account.name === 'Accounts Payable') return { ...account, account_role: 'trade_payable' };
      if (account.name === 'VAT Control') return { ...account, account_role: 'vat_control', tax_treatment: 'vat_control' };
      if (account.name === 'Bank') return { ...account, account_role: 'bank', subcategory: 'Cash and Cash Equivalents' };
      if (account.name === 'Owner Capital') return { ...account, account_role: 'retained_earnings' };
      return account;
    });

    const result = evaluateAccountingReadiness({
      flags: { opening_balances_zero_intentional: true, bank_accounts_skipped: true },
      financialYears: [{ status: 'open' }],
      accounts: mapped,
      taxRates: [{ id: 'tax-1' }],
      bankAccounts: [],
    });

    expect(result.validation.chartOfAccountsExists).toBe(true);
    expect(result.validation.accountCount).toBe(15);
    expect(result.validation.mappingsComplete).toBe(true);
    expect(result.validation.mandatoryControlAccounts).toBe(true);
    expect(result.accountingReady).toBe(true);
  });

  it('does not block core readiness for disabled inventory, payroll, or fixed assets', () => {
    const mapped = [
      { id: '1', name: 'AR', type: 'Asset', account_role: 'trade_receivable', is_active: true, account_number: 1220, account_code: '1220', normal_balance: 'debit' },
      { id: '2', name: 'AP', type: 'Liability', account_role: 'trade_payable', is_active: true, account_number: 2110, account_code: '2110', normal_balance: 'credit' },
      { id: '3', name: 'VAT', type: 'Liability', account_role: 'vat_control', tax_treatment: 'vat_control', is_active: true, account_number: 2125, account_code: '2125', normal_balance: 'credit' },
      { id: '4', name: 'Bank', type: 'Asset', account_role: 'bank', subcategory: 'Cash and Cash Equivalents', is_active: true, account_number: 1260, account_code: '1260', normal_balance: 'debit' },
      { id: '5', name: 'RE', type: 'Equity', account_role: 'retained_earnings', system_account: true, is_active: true, account_number: 3020, account_code: '3020', normal_balance: 'credit' },
      { id: '6', name: 'Sales', type: 'Income', is_active: true, account_number: 4010, account_code: '4010', normal_balance: 'credit' },
      { id: '7', name: 'Expense', type: 'Expense', is_active: true, account_number: 6010, account_code: '6010', normal_balance: 'debit' },
    ];

    const coreReady = evaluateAccountingReadiness({
      flags: { opening_balances_zero_intentional: true, bank_accounts_skipped: true },
      financialYears: [{ status: 'open' }],
      accounts: mapped,
      taxRates: [{ id: 'tax-1' }],
      bankAccounts: [],
    });
    expect(coreReady.accountingReady).toBe(true);
    expect(coreReady.validation.missingControlAccounts).toEqual([]);

    const withInventory = evaluateAccountingReadiness({
      flags: {
        opening_balances_zero_intentional: true,
        bank_accounts_skipped: true,
        inventory_enabled: true,
      },
      financialYears: [{ status: 'open' }],
      accounts: mapped,
      taxRates: [{ id: 'tax-1' }],
      bankAccounts: [],
    });
    expect(withInventory.accountingReady).toBe(false);
    expect(withInventory.validation.missingControlAccounts).toEqual(['inventory']);
  });
});
