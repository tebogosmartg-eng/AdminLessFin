import { describe, expect, it } from 'vitest';
import {
  generateJournalFromRule,
  generateSalesInvoice,
  generateSupplierInvoice,
  generatePayrollRun,
  generateDepreciation,
  generateInventoryPurchase,
  generateInventorySale,
  generateOpeningBalances,
  generateVatReturn,
  type RulesAccount,
  type RulesDefinitionInput,
} from '../../src/governance/domains/accountingRulesEngine/generate';

const accounts: RulesAccount[] = [
  { id: 'ar', name: 'Trade Debtors', type: 'Asset', control_account: true },
  { id: 'ap', name: 'Trade Creditors', type: 'Liability', control_account: true },
  { id: 'rev', name: 'Sales Revenue', type: 'Income' },
  { id: 'exp', name: 'Office Expenses', type: 'Expense' },
  { id: 'vat-out', name: 'VAT Output', type: 'Liability', tax_treatment: 'vat_output' },
  { id: 'vat-in', name: 'VAT Input', type: 'Asset', tax_treatment: 'vat_input' },
  { id: 'bank', name: 'Bank Current Account', type: 'Asset' },
  { id: 'inv', name: 'Inventory Asset', type: 'Asset' },
  { id: 'cogs', name: 'Cost of Goods Sold', type: 'Expense' },
  { id: 'wages', name: 'Salaries and Wages', type: 'Expense' },
  { id: 'pay-liab', name: 'Payroll Liability', type: 'Liability' },
  { id: 'dep-exp', name: 'Depreciation Expense', type: 'Expense' },
  { id: 'accum-dep', name: 'Accumulated Depreciation', type: 'Asset' },
  { id: 'ob1', name: 'Opening Balance Equity', type: 'Equity' },
];

const salesRule: RulesDefinitionInput = {
  id: 'r1',
  code: 'sys.sales_invoice',
  name: 'Sales Invoice Posting',
  businessEvent: 'sales_invoice',
  module: 'sales_invoice',
  version: 1,
  generationHook: 'sales_invoice',
};

const supplierRule: RulesDefinitionInput = {
  id: 'r2',
  code: 'sys.supplier_invoice',
  name: 'Supplier Invoice',
  businessEvent: 'supplier_invoice',
  module: 'accounts_payable',
  version: 1,
  generationHook: 'supplier_invoice',
};

function assertBalanced(lines: { debit: number; credit: number }[]) {
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  expect(Math.abs(debit - credit)).toBeLessThan(0.01);
}

describe('Accounting Rules Engine', () => {
  it('generates balanced sales invoice journal (Dr AR, Cr Revenue, Cr VAT)', () => {
    const lines = generateSalesInvoice(accounts, {
      posting_date: '2026-01-15',
      lines: [{ quantity: 1, unit_price: 1000, tax: 150, income_account_id: 'rev' }],
      accounts: { trade_debtors: 'ar', output_vat: 'vat-out' },
    });
    assertBalanced(lines);
    expect(lines.some((l) => l.account_id === 'ar' && l.debit === 1150)).toBe(true);
    expect(lines.some((l) => l.account_id === 'rev' && l.credit === 1000)).toBe(true);
    expect(lines.some((l) => l.account_id === 'vat-out' && l.credit === 150)).toBe(true);
  });

  it('generates balanced supplier invoice journal (Dr Expense, Dr VAT Input, Cr AP)', () => {
    const lines = generateSupplierInvoice(accounts, {
      posting_date: '2026-01-15',
      lines: [{ quantity: 1, unit_cost: 500, tax: 75, expense_account_id: 'exp' }],
      accounts: { trade_creditors: 'ap', input_vat: 'vat-in' },
    });
    assertBalanced(lines);
    expect(lines.some((l) => l.account_id === 'exp' && l.debit === 500)).toBe(true);
    expect(lines.some((l) => l.account_id === 'vat-in' && l.debit === 75)).toBe(true);
    expect(lines.some((l) => l.account_id === 'ap' && l.credit === 575)).toBe(true);
  });

  it('generates balanced payroll journal', () => {
    const lines = generatePayrollRun(accounts, {
      posting_date: '2026-01-31',
      totals: { wages: 50000, net_pay: 38000, deductions: 12000 },
      accounts: { payroll_expense: 'wages', bank: 'bank', payroll_liability: 'pay-liab' },
    });
    assertBalanced(lines);
    expect(lines.some((l) => l.account_id === 'wages' && l.debit === 50000)).toBe(true);
    expect(lines.some((l) => l.account_id === 'bank' && l.credit === 38000)).toBe(true);
    expect(lines.some((l) => l.account_id === 'pay-liab' && l.credit === 12000)).toBe(true);
  });

  it('generates balanced depreciation journal', () => {
    const lines = generateDepreciation(accounts, {
      posting_date: '2026-01-31',
      totals: { depreciation: 2500 },
      accounts: { depreciation_expense: 'dep-exp', accumulated_depreciation: 'accum-dep' },
    });
    assertBalanced(lines);
    expect(lines.some((l) => l.account_id === 'dep-exp' && l.debit === 2500)).toBe(true);
    expect(lines.some((l) => l.account_id === 'accum-dep' && l.credit === 2500)).toBe(true);
  });

  it('generates balanced inventory purchase journal', () => {
    const lines = generateInventoryPurchase(accounts, {
      posting_date: '2026-01-15',
      totals: { amount: 3000 },
      accounts: { inventory_asset: 'inv', trade_creditors: 'ap' },
    });
    assertBalanced(lines);
    expect(lines.some((l) => l.account_id === 'inv' && l.debit === 3000)).toBe(true);
    expect(lines.some((l) => l.account_id === 'ap' && l.credit === 3000)).toBe(true);
  });

  it('generates balanced inventory sale (COGS) journal', () => {
    const lines = generateInventorySale(accounts, {
      posting_date: '2026-01-15',
      totals: { amount: 800 },
      accounts: { cogs: 'cogs', inventory_asset: 'inv' },
    });
    assertBalanced(lines);
    expect(lines.some((l) => l.account_id === 'cogs' && l.debit === 800)).toBe(true);
    expect(lines.some((l) => l.account_id === 'inv' && l.credit === 800)).toBe(true);
  });

  it('generates balanced VAT return journal', () => {
    const lines = generateVatReturn(accounts, {
      posting_date: '2026-01-31',
      totals: { vat_payable: 15000, vat_receivable: 8000 },
      accounts: { output_vat: 'vat-out', input_vat: 'vat-in', bank: 'bank' },
    });
    assertBalanced(lines);
  });

  it('generates balanced opening balances journal', () => {
    const lines = generateOpeningBalances(accounts, {
      posting_date: '2026-01-01',
      lines: [
        { account_id: 'bank', debit: 10000 },
        { account_id: 'ob1', credit: 10000 },
      ],
    });
    assertBalanced(lines);
  });

  it('returns journal preview with balanced flag', () => {
    const preview = generateJournalFromRule(salesRule, accounts, {
      posting_date: '2026-01-15',
      lines: [{ quantity: 2, unit_price: 100, tax: 30, income_account_id: 'rev' }],
      accounts: { trade_debtors: 'ar', output_vat: 'vat-out' },
    });
    expect(preview.balanced).toBe(true);
    expect(preview.ruleCode).toBe('sys.sales_invoice');
    expect(preview.totalDebit).toBe(preview.totalCredit);
    expect(preview.lines.length).toBeGreaterThanOrEqual(3);
  });

  it('supplier invoice preview matches expected structure', () => {
    const preview = generateJournalFromRule(supplierRule, accounts, {
      posting_date: '2026-01-20',
      description: 'Supplier Invoice INV-001',
      lines: [{ quantity: 1, unit_cost: 200, tax: 30, expense_account_id: 'exp' }],
      accounts: { trade_creditors: 'ap', input_vat: 'vat-in' },
    });
    expect(preview.balanced).toBe(true);
    expect(preview.narration).toBe('Supplier Invoice INV-001');
    expect(preview.module).toBe('accounts_payable');
  });
});
