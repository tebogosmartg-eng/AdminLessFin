import { describe, expect, it } from 'vitest';
import {
  analyseControlAccountMappings,
  buildRecommendedAccount,
} from '../../src/governance/domains/accountingReadiness/controlAccountMapping';
import { requiredControlRoles } from '../../src/governance/domains/accountingReadiness/model';
import {
  composeReadiness,
  type AccountingFacts,
} from '../../supabase/functions/_shared/accountingReadiness/compose';

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
  // A chart whose accounts merely LOOK like control accounts is not mapped.
  // Which accounts satisfy which role is now decided by accounting_facts() in
  // the database -- on account_role, classification and subcategory, never on
  // display name -- and is proved against the real chart by
  // tools/staging-recovery/probe-accounting-facts.ts. What is checked here is
  // that the composition believes the facts rather than second-guessing them.
  const unmappedFacts: AccountingFacts = {
    company_id: 'co-1',
    as_of: '2026-09-22',
    calendar: {
      has_year: true, has_open_year: true,
      current_year: { id: 'fy', year_code: 'FY2026', status: 'open', start_date: '2026-01-01', end_date: '2026-12-31', contains_today: true },
      year_count: 1, open_year_count: 1, open_years_containing_today: 1,
      period_count: 12, open_period_count: 1, current_period: null,
    },
    chart: {
      account_count: 15, active_count: 15, missing_types: [],
      unclassified: [], duplicate_codes: [], duplicate_numbers: [], normal_balance_errors: [],
    },
    // Named "Accounts Receivable", "VAT Control", "Bank" -- and mapped to nothing.
    control_accounts: {
      trade_debtors: false, trade_creditors: false, vat_control: false, bank: false,
      retained_earnings: false, profit_loss: true,
      inventory: false, fixed_assets: false, payroll_clearing: false,
    },
    tax: { rate_count: 1, vat_account_count: 0 },
    banking: { bank_account_count: 0, opening_balances_posted: true },
    ledger: { journal_count: 0, total_debits: 0, total_credits: 0, balanced: true, unbalanced_journals: [] },
    payroll: { active_mapping_count: 0 },
    flags: {
      bank_accounts_skipped: true, opening_balances_zero_intentional: true,
      inventory_enabled: false, fixed_assets_enabled: false, payroll_enabled: false,
    },
  };

  it('an existing chart is detected without being treated as mapped or ready', () => {
    const result = composeReadiness(unmappedFacts);
    expect(result.validation.chartOfAccountsExists).toBe(true);
    expect(result.validation.accountCount).toBe(15);
    expect(result.validation.mappingsComplete).toBe(false);
    expect(result.validation.mandatoryControlAccounts).toBe(false);
    expect(result.accountingReady).toBe(false);
    expect(result.steps.chart_of_accounts.complete).toBe(false);
    expect(result.validation.missingControlAccounts.length).toBeGreaterThan(0);
  });

  it('does not become ready merely because the account names read like control accounts', () => {
    const result = composeReadiness(unmappedFacts);
    expect(result.accountingReady).toBe(false);
    expect(result.validation.mappingsComplete).toBe(false);
    expect(result.validation.missingControlAccounts).toContain('trade_debtors');
    expect(result.validation.missingControlAccounts).toContain('vat_control');
  });

  it('becomes mapping-complete once the roles are persisted on those accounts', () => {
    const result = composeReadiness({
      ...unmappedFacts,
      control_accounts: {
        ...unmappedFacts.control_accounts,
        trade_debtors: true, trade_creditors: true, vat_control: true,
        bank: true, retained_earnings: true,
      },
    });
    expect(result.validation.mappingsComplete).toBe(true);
    expect(result.validation.mandatoryControlAccounts).toBe(true);
    expect(result.accountingReady).toBe(true);
  });

  it('does not block core readiness for disabled inventory, payroll or fixed assets', () => {
    const mapped: AccountingFacts = {
      ...unmappedFacts,
      control_accounts: {
        ...unmappedFacts.control_accounts,
        trade_debtors: true, trade_creditors: true, vat_control: true,
        bank: true, retained_earnings: true,
      },
    };
    const coreReady = composeReadiness(mapped);
    expect(coreReady.accountingReady).toBe(true);
    expect(coreReady.validation.missingControlAccounts).toEqual([]);

    const withInventory = composeReadiness({
      ...mapped,
      flags: { ...mapped.flags, inventory_enabled: true },
    });
    expect(withInventory.accountingReady).toBe(false);
    expect(withInventory.validation.missingControlAccounts).toEqual(['inventory']);
  });
});
