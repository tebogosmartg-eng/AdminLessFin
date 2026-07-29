import { describe, expect, it } from 'vitest';
import {
  evaluateAccountingReadiness,
  evaluateCoaIntegrity,
} from '../../src/governance/domains/accountingReadiness/validation';

const standardAccounts = [
  { id: '1', name: 'Accounts Receivable (Trade Debtors)', type: 'Asset', account_role: 'trade_receivable', control_account: true, is_active: true, account_number: 1220, account_code: '1220', normal_balance: 'debit', subcategory: 'Trade and Other Receivables' },
  { id: '2', name: 'Accounts Payable (Trade Creditors)', type: 'Liability', account_role: 'trade_payable', control_account: true, is_active: true, account_number: 2110, account_code: '2110', normal_balance: 'credit', subcategory: 'Trade and Other Payables' },
  { id: '3', name: 'VAT Control', type: 'Liability', account_role: 'vat_control', control_account: true, tax_treatment: 'vat_control', is_active: true, account_number: 2125, account_code: '2125', normal_balance: 'credit' },
  { id: '4', name: 'Bank - Current Account', type: 'Asset', account_role: 'bank', is_active: true, account_number: 1260, account_code: '1260', normal_balance: 'debit', subcategory: 'Cash and Cash Equivalents' },
  { id: '5', name: 'Retained Earnings', type: 'Equity', account_role: 'retained_earnings', system_account: true, is_active: true, account_number: 3020, account_code: '3020', normal_balance: 'credit' },
  { id: '6', name: 'Sales - Goods', type: 'Income', account_role: 'sales', is_active: true, account_number: 4010, account_code: '4010', normal_balance: 'credit' },
  { id: '7', name: 'Accounting Fees', type: 'Expense', is_active: true, account_number: 6010, account_code: '6010', normal_balance: 'debit' },
];

describe('Accounting Validation Engine (Phase 1B)', () => {
  it('marks a new company as NOT_STARTED with zero progress', () => {
    const result = evaluateAccountingReadiness({
      flags: {},
      financialYears: [],
      accounts: [],
      taxRates: [],
      bankAccounts: [],
    });

    expect(result.status).toBe('NOT_STARTED');
    expect(result.accountingReady).toBe(false);
    expect(result.progressPercent).toBe(0);
  });

  it('derives step completion from master data without manual flags', () => {
    const result = evaluateAccountingReadiness({
      flags: {},
      financialYears: [{ status: 'open' }],
      accounts: standardAccounts,
      taxRates: [],
      bankAccounts: [],
    });

    expect(result.steps.financial_calendar.complete).toBe(true);
    expect(result.steps.chart_of_accounts.complete).toBe(true);
    expect(result.steps.tax_configuration.complete).toBe(false);
    expect(result.steps.bank_accounts.complete).toBe(false);
    expect(result.accountingReady).toBe(false);
  });

  it('requires an active financial year', () => {
    const result = evaluateAccountingReadiness({
      flags: {},
      financialYears: [{ status: 'closed' }],
      accounts: standardAccounts,
      taxRates: [{ id: 'tax-1' }],
      bankAccounts: [{ id: 'bank-1', opening_balance: 0, opening_balance_posted: true }],
    });

    expect(result.validation.activeFinancialYear).toBe(false);
    expect(result.accountingReady).toBe(false);
  });

  it('becomes READY when all derived validation checks pass', () => {
    const result = evaluateAccountingReadiness({
      flags: { bank_accounts_skipped: false, opening_balances_zero_intentional: true },
      financialYears: [{ status: 'open' }],
      accounts: standardAccounts,
      taxRates: [{ id: 'tax-1' }],
      bankAccounts: [{ id: 'bank-1', opening_balance: 0, opening_balance_posted: true }],
    });

    expect(result.accountingReady).toBe(true);
    expect(result.status).toBe('READY');
    expect(result.progressPercent).toBe(100);
    expect(result.validation.missingControlAccounts).toHaveLength(0);
    expect(result.validation.coaIntegrity).toBe(true);
    expect(result.validation.taxConfigurationExists).toBe(true);
  });

  it('allows banking to be explicitly skipped via intent flag', () => {
    const result = evaluateAccountingReadiness({
      flags: { bank_accounts_skipped: true, opening_balances_zero_intentional: true },
      financialYears: [{ status: 'open' }],
      accounts: standardAccounts,
      taxRates: [{ id: 'tax-1' }],
      bankAccounts: [],
    });

    expect(result.validation.bankAccountOrSkipped).toBe(true);
    expect(result.validation.controlAccounts.bank).toBe(true);
    expect(result.accountingReady).toBe(true);
  });

  it('requires optional module control accounts when enabled', () => {
    const result = evaluateAccountingReadiness({
      flags: { inventory_enabled: true, payroll_enabled: true },
      financialYears: [{ status: 'open' }],
      accounts: standardAccounts,
      taxRates: [{ id: 'tax-1' }],
      bankAccounts: [{ id: 'bank-1', opening_balance: 0, opening_balance_posted: true }],
    });

    expect(result.validation.missingControlAccounts).toEqual(
      expect.arrayContaining(['inventory', 'payroll_clearing']),
    );
    expect(result.steps.chart_of_accounts.complete).toBe(false);
  });

  it('fails COA integrity on duplicate account codes', () => {
    const integrity = evaluateCoaIntegrity([
      ...standardAccounts,
      {
        id: 'dup',
        name: 'Duplicate Bank',
        type: 'Asset',
        is_active: true,
        account_code: '1260',
        account_number: 9999,
        normal_balance: 'debit',
      },
    ]);
    expect(integrity.pass).toBe(false);
    expect(integrity.errors.some((e) => /Duplicate account code/i.test(e))).toBe(true);
  });

  it('fails COA integrity when a foundational type is missing', () => {
    const integrity = evaluateCoaIntegrity(
      standardAccounts.filter((a) => a.type !== 'Equity'),
    );
    expect(integrity.pass).toBe(false);
    expect(integrity.errors.some((e) => /Equity/i.test(e))).toBe(true);
  });
});
